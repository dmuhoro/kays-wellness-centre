import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable, getConcurrentLock, releaseConcurrentLock } from "../db.server";
import { requireOrg } from "../tenant.server";
import { logger, EVENTS } from "../logger.server";
import { recordAudit } from "../audit.server";
import { getSession } from "../session.server";
import { publishEvent } from "../event-bus.server";
import { requireRole, canAccessFinance, ROLES } from "../permissions.server";

export interface InvoiceRow {
  id: number;
  lead_id: number;
  organization_id: string;
  invoice_number: string;
  total_amount: number;
  status: "draft" | "issued" | "paid" | "void";
  issued_at: string;
  paid_at: string | null;
  due_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: number;
  invoice_id: number;
  organization_id: string;
  amount: number;
  method: "cash" | "mobile_money" | "card";
  receipt_number: string;
  notes: string | null;
  created_at: string;
}

function formatInvoiceNumber(orgId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(seq).padStart(5, "0")}`;
}

function formatReceiptNumber(orgId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `KWC-${year}-${String(seq).padStart(5, "0")}`;
}

async function nextInvoiceSeq(orgId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.unsafe<Array<{ m: string | null }>>(
    `SELECT MAX(invoice_number) AS m FROM invoices WHERE organization_id = $1`,
    [orgId],
  );
  const max = rows[0]?.m;
  if (!max) return 1;
  const parts = max.split("-");
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 1 : num + 1;
}

async function nextReceiptSeq(orgId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.unsafe<Array<{ m: string | null }>>(
    `SELECT MAX(receipt_number) AS m FROM payments WHERE organization_id = $1`,
    [orgId],
  );
  const max = rows[0]?.m;
  if (!max) return 1;
  const parts = max.split("-");
  const num = parseInt(parts[parts.length - 1], 10);
  return isNaN(num) ? 1 : num + 1;
}

export async function generateInvoice(
  orgId: string,
  leadId: number,
  amount: number,
  dueAt?: string,
): Promise<InvoiceRow> {
  const db = await getDb();
  const lockKey = `invoice_seq:${orgId}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) {
    throw new Error("Could not acquire lock for invoice generation");
  }

  try {
    const seq = await nextInvoiceSeq(orgId);
    const invoiceNumber = formatInvoiceNumber(orgId, seq);

    const rows = await db.unsafe<InvoiceRow[]>(
      `INSERT INTO invoices (lead_id, organization_id, invoice_number, total_amount, status, due_at)
       VALUES ($1, $2, $3, $4, 'issued', $5)
       RETURNING *`,
      [leadId, orgId, invoiceNumber, amount, dueAt ?? null],
    );

    const session = getSession();
    recordAudit({
      orgId,
      userId: session?.userId ?? null,
      actionType: "INVOICE_UPDATED",
      targetType: "invoice",
      targetId: String(rows[0].id),
      metadata: { invoiceNumber, amount, leadId },
    });

    publishEvent(orgId, "invoice:created", {
      invoiceId: rows[0].id,
      invoiceNumber,
      amount,
      leadId,
    }).catch(() => {});

    logger.info("Invoice generated", {
      event: EVENTS.INVOICE_GENERATED,
      leadId,
      invoiceNumber,
      amount,
    });

    return rows[0];
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

export async function recordPayment(
  orgId: string,
  invoiceId: number,
  amount: number,
  method: "cash" | "mobile_money" | "card",
  notes?: string,
): Promise<{ payment: PaymentRow; invoiceFullyPaid: boolean }> {
  const db = await getDb();
  const lockKey = `payment:${orgId}:${invoiceId}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) {
    throw new Error("Could not acquire lock for payment recording");
  }

  try {
    const invRows = await db.unsafe<InvoiceRow[]>(
      `SELECT * FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [invoiceId, orgId],
    );
    const invoice = invRows[0];
    if (!invoice) throw new Error("Invoice not found");

    if (invoice.status === "paid") {
      throw new Error("Invoice is already fully paid");
    }

    const seq = await nextReceiptSeq(orgId);
    const receiptNumber = formatReceiptNumber(orgId, seq);

    const paymentRows = await db.unsafe<PaymentRow[]>(
      `INSERT INTO payments (invoice_id, organization_id, amount, method, receipt_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [invoiceId, orgId, amount, method, receiptNumber, notes ?? null],
    );
    const payment = paymentRows[0];

    const paidRows = await db.unsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = $1 AND organization_id = $2`,
      [invoiceId, orgId],
    );
    const totalPaid = paidRows[0]?.total ?? 0;
    const fullyPaid = totalPaid >= invoice.total_amount;

    if (fullyPaid) {
      await db.unsafe(
        `UPDATE invoices SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2`,
        [invoiceId, orgId],
      );
      logger.info("Invoice fully paid", {
        event: EVENTS.INVOICE_PAID,
        invoiceId,
        invoiceNumber: invoice.invoice_number,
      });
    }

    logger.info("Payment recorded", {
      event: EVENTS.PAYMENT_RECEIVED,
      invoiceId,
      amount,
      method,
      receiptNumber,
    });

    return { payment, invoiceFullyPaid: fullyPaid };
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

export async function getInvoices(orgId: string): Promise<InvoiceRow[]> {
  const db = await getDb();
  return db.unsafe<InvoiceRow[]>(
    `SELECT i.*, cl.name AS lead_name
     FROM invoices i
     JOIN clinic_leads cl ON cl.id = i.lead_id
     WHERE i.organization_id = $1
     ORDER BY i.created_at DESC
     LIMIT 100`,
    [orgId],
  );
}

export async function getPayments(orgId: string, invoiceId: number): Promise<PaymentRow[]> {
  const db = await getDb();
  return db.unsafe<PaymentRow[]>(
    `SELECT * FROM payments WHERE invoice_id = $1 AND organization_id = $2
     ORDER BY created_at DESC`,
    [invoiceId, orgId],
  );
}

export const generateInvoiceForCheckedIn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      leadId: z.number(),
      amount: z.number().positive().default(2500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    try { requireRole(ROLES.SUPER_ADMIN, ROLES.CLINIC_OWNER); } catch { return { status: "forbidden" as const }; }
    const { orgId } = requireOrg();
    const db = await getDb();

    const [lead] = await db.unsafe<Array<{ status: string }>>(
      `SELECT status FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [data.leadId, orgId],
    );
    if (!lead) return { status: "lead_not_found" as const };
    if (lead.status !== "converted" && lead.status !== "checked_in") {
      return { status: "lead_not_checked_in" as const };
    }

    const existing = await db.unsafe<InvoiceRow[]>(
      `SELECT id FROM invoices WHERE lead_id = $1 AND organization_id = $2 AND status != 'void'`,
      [data.leadId, orgId],
    );
    if (existing.length > 0) return { status: "already_invoiced", invoiceId: existing[0].id };

    const invoice = await generateInvoice(orgId, data.leadId, data.amount ?? 2500);
    return { status: "ok", invoice };
  });

export const fetchInvoices = createServerFn({ method: "GET" })
  .handler(async () => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const, invoices: [] };
    try { requireRole(ROLES.SUPER_ADMIN, ROLES.CLINIC_OWNER); } catch { return { status: "forbidden" as const, invoices: [] }; }
    const { orgId } = requireOrg();
    const invoices = await getInvoices(orgId);
    return { status: "ok", invoices };
  });

export const fetchPayments = createServerFn({ method: "GET" })
  .inputValidator(z.object({ invoiceId: z.number() }))
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const, payments: [] };
    const { orgId } = requireOrg();
    const payments = await getPayments(orgId, data.invoiceId);
    return { status: "ok", payments };
  });

export const addPayment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      invoiceId: z.number(),
      amount: z.number().positive(),
      method: z.enum(["cash", "mobile_money", "card"]),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    try { requireRole(ROLES.SUPER_ADMIN, ROLES.CLINIC_OWNER); } catch { return { status: "forbidden" as const }; }
    const { orgId } = requireOrg();
    const result = await recordPayment(orgId, data.invoiceId, data.amount, data.method, data.notes);
    publishEvent(orgId, "payment:recorded", {
      invoiceId: data.invoiceId,
      amount: data.amount,
      method: data.method,
    }).catch(() => {});
    return { status: "ok", ...result };
  });
