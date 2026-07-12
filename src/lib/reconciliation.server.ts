import { getDb, getConcurrentLock, releaseConcurrentLock } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { recordAudit } from "./audit.server";
import { getSession } from "./session.server";
import { publishEvent } from "./event-bus.server";
import { checkRateLimit } from "./rate-limit.server";

export interface ReconciliationEntry {
  id: number;
  organization_id: string;
  inbound_reference: string;
  inbound_amount: number;
  inbound_phone: string | null;
  matched_invoice_id: number | null;
  matched_payment_id: number | null;
  status: "pending" | "matched" | "auto_paid" | "unmatched";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ParsedInboundPayment {
  reference: string;
  amount: number;
  phone: string | null;
  rawMessage: string;
  provider: "mpesa" | "bank" | "unknown";
}

const MPESA_REF_REGEX = /\b(SBI\d{8,12}|Q[A-Z0-9]{10,12}|(\d{10,12}))\b/i;
const MPESA_AMOUNT_REGEX = /(?:KES|Ksh|KES\.?)\s*([\d,]+(?:\.\d{2})?)/i;
const MPESA_PHONE_REGEX = /\b254\d{9}\b|\b0\d{9}\b/;

const BANK_REF_REGEX = /\b(?:REFERENCE|REF|TXN|TRANS)[:\s]*([A-Z0-9\-]{6,20})\b/i;
const BANK_AMOUNT_REGEX = /\b(?:KES|Ksh|KES\.?)\s*([\d,]+(?:\.\d{2})?)/i;

export function parseInboundPayment(message: string): ParsedInboundPayment {
  const trimmed = message.trim();

  const mpesaRef = MPESA_REF_REGEX.exec(trimmed);
  const bankRef = BANK_REF_REGEX.exec(trimmed);

  const ref = mpesaRef?.[1] ?? bankRef?.[1] ?? `REF-${Date.now()}`;
  const provider: ParsedInboundPayment["provider"] = mpesaRef
    ? "mpesa"
    : bankRef
      ? "bank"
      : "unknown";

  const amountMatch = MPESA_AMOUNT_REGEX.exec(trimmed) ?? BANK_AMOUNT_REGEX.exec(trimmed);
  const rawAmount = amountMatch?.[1]?.replace(/,/g, "") ?? "0";
  const amount = parseFloat(rawAmount);

  const phoneMatch = MPESA_PHONE_REGEX.exec(trimmed);
  const phone = phoneMatch?.[0] ?? null;

  return { reference: ref, amount, phone, rawMessage: trimmed, provider };
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.startsWith("254")) return phone;
  if (phone.startsWith("0")) return "254" + phone.slice(1);
  return phone;
}

export async function reconcilePayment(
  orgId: string,
  parsed: ParsedInboundPayment,
): Promise<{ status: ReconciliationEntry["status"]; invoiceId?: number; paymentId?: number }> {
  if (!checkRateLimit(`reconcile:${orgId}`, 10, 60_000)) {
    logger.warn("Reconciliation rate limited", { event: EVENTS.RECONCILIATION_NO_MATCH, orgId });
    return { status: "unmatched" };
  }
  const db = await getDb();
  const lockKey = `reconcile:${orgId}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) throw new Error("Could not acquire reconciliation lock");

  try {
    const normalizedPhone = normalizePhone(parsed.phone);

    const candidates = await db.unsafe<Array<{
      id: number;
      lead_id: number;
      total_amount: number;
      status: string;
      invoice_number: string;
    }>>(
      `SELECT id, lead_id, total_amount, status, invoice_number
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('issued', 'draft')
         AND ABS(total_amount - $2) < 0.01
       ORDER BY created_at DESC
       LIMIT 5`,
      [orgId, parsed.amount],
    );

    let matchedInvoice: typeof candidates[0] | null = null;

    if (candidates.length === 1) {
      matchedInvoice = candidates[0];
    } else if (candidates.length > 1 && normalizedPhone) {
      for (const c of candidates) {
        const leadPhone = await db.unsafe<Array<{ phone: string | null }>>(
          `SELECT phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
          [c.lead_id, orgId],
        );
        if (leadPhone[0]?.phone && normalizePhone(leadPhone[0].phone) === normalizedPhone) {
          matchedInvoice = c;
          break;
        }
      }
      if (!matchedInvoice) matchedInvoice = candidates[0];
    }

    const metadata: Record<string, unknown> = {
      reference: parsed.reference,
      provider: parsed.provider,
      phone: parsed.phone,
      amount: parsed.amount,
      candidatesCount: candidates.length,
    };

    if (!matchedInvoice) {
      const [log] = await db.unsafe<ReconciliationEntry[]>(
        `INSERT INTO reconciliation_log (organization_id, inbound_reference, inbound_amount, inbound_phone, status, metadata)
         VALUES ($1, $2, $3, $4, 'unmatched', $5)
         RETURNING *`,
        [orgId, parsed.reference, parsed.amount, parsed.phone, JSON.stringify(metadata)],
      );

      logger.info("Reconciliation: no match found", {
        event: EVENTS.RECONCILIATION_NO_MATCH,
        reference: parsed.reference,
        amount: parsed.amount,
      });

      return { status: "unmatched" };
    }

    const seq = await nextReceiptSeqForReconciliation(orgId);
    const receiptNumber = `KWC-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;

    const [payment] = await db.unsafe<Array<{ id: number }>>(
      `INSERT INTO payments (invoice_id, organization_id, amount, method, receipt_number, notes)
       VALUES ($1, $2, $3, 'mobile_money', $4, $5)
       RETURNING id`,
      [
        matchedInvoice.id,
        orgId,
        parsed.amount,
        receiptNumber,
        `Auto-reconciled ref: ${parsed.reference}`,
      ],
    );

    await db.unsafe(
      `UPDATE invoices SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = $1 AND organization_id = $2`,
      [matchedInvoice.id, orgId],
    );

    const [log] = await db.unsafe<ReconciliationEntry[]>(
      `INSERT INTO reconciliation_log (organization_id, inbound_reference, inbound_amount, inbound_phone, matched_invoice_id, matched_payment_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'auto_paid', $7)
       RETURNING *`,
      [orgId, parsed.reference, parsed.amount, parsed.phone, matchedInvoice.id, payment.id, JSON.stringify(metadata)],
    );

    publishEvent(orgId, "reconciliation:matched", {
      invoiceId: matchedInvoice.id,
      paymentId: payment.id,
      reference: parsed.reference,
      amount: parsed.amount,
    }).catch(() => {});

    const session = getSession();
    recordAudit({
      orgId,
      userId: session?.userId ?? null,
      actionType: "RECONCILIATION_AUTO_PAID",
      targetType: "invoice",
      targetId: String(matchedInvoice.id),
      metadata: { reference: parsed.reference, amount: parsed.amount, paymentId: payment.id },
    }).catch(() => {});

    logger.info("Reconciliation: auto-paid invoice", {
      event: EVENTS.RECONCILIATION_AUTO_PAID,
      invoiceId: matchedInvoice.id,
      paymentId: payment.id,
      reference: parsed.reference,
      amount: parsed.amount,
    });

    return { status: "auto_paid", invoiceId: matchedInvoice.id, paymentId: payment.id };
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

async function nextReceiptSeqForReconciliation(orgId: string): Promise<number> {
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

export async function getReconciliationLog(
  orgId: string,
  limit = 50,
): Promise<ReconciliationEntry[]> {
  const db = await getDb();
  return db.unsafe<ReconciliationEntry[]>(
    `SELECT * FROM reconciliation_log
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [orgId, limit],
  );
}

export async function processInboundPaymentMessage(
  orgId: string,
  messageBody: string,
): Promise<{ status: ReconciliationEntry["status"]; invoiceId?: number; paymentId?: number }> {
  const parsed = parseInboundPayment(messageBody);
  return reconcilePayment(orgId, parsed);
}
