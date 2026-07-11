import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";
import { recordAudit } from "./audit.server";
import { getSession } from "./session.server";

export function toCsvValue(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(toCsvValue).join(",");
  const dataLines = rows.map((row) => headers.map((h) => toCsvValue(row[h])).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export const exportSchema = z.object({
  dataset: z.enum(["leads", "invoices", "interactions", "audit_logs"]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ExportInput = z.infer<typeof exportSchema>;

async function exportLeads(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const db = await getDb();
  const conditions = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(endDate);
  }

  const rows = await db.unsafe(
    `SELECT id, name, phone, email, service, channel, priority, status,
            appointment_timestamp, created_at
     FROM clinic_leads
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );

  return rowsToCsv(
    ["id", "name", "phone", "email", "service", "channel", "priority", "status", "appointment_timestamp", "created_at"],
    rows,
  );
}

async function exportInvoices(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const db = await getDb();
  const conditions = ["i.organization_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (startDate) {
    conditions.push(`i.created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`i.created_at <= $${idx++}`);
    params.push(endDate);
  }

  const rows = await db.unsafe(
    `SELECT i.id, i.invoice_number, i.total_amount, i.status, i.issued_at,
            i.paid_at, i.due_at, i.notes, cl.name AS lead_name, i.created_at
     FROM invoices i
     JOIN clinic_leads cl ON cl.id = i.lead_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY i.created_at DESC`,
    params,
  );

  return rowsToCsv(
    ["id", "invoice_number", "total_amount", "status", "issued_at", "paid_at", "due_at", "notes", "lead_name", "created_at"],
    rows,
  );
}

async function exportInteractions(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const db = await getDb();
  const conditions = ["li.organization_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (startDate) {
    conditions.push(`li.created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`li.created_at <= $${idx++}`);
    params.push(endDate);
  }

  const rows = await db.unsafe(
    `SELECT li.id, li.lead_id, cl.name AS lead_name, li.event_type,
            li.metadata, li.created_at
     FROM lead_interactions li
     JOIN clinic_leads cl ON cl.id = li.lead_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY li.created_at DESC`,
    params,
  );

  return rowsToCsv(
    ["id", "lead_id", "lead_name", "event_type", "metadata", "created_at"],
    rows,
  );
}

async function exportAuditLogs(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<string> {
  const db = await getDb();
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(endDate);
  }

  const rows = await db.unsafe(
    `SELECT id, action_type, target_type, target_id, user_id, client_ip, metadata, created_at
     FROM audit_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );

  return rowsToCsv(
    ["id", "action_type", "target_type", "target_id", "user_id", "client_ip", "metadata", "created_at"],
    rows,
  );
}

function getFilename(dataset: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `kwc-${dataset}-${ts}.csv`;
}

export const generateExport = createServerFn({ method: "POST" })
  .inputValidator(exportSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId, log } = requireOrg();
    const session = getSession();

    let csv: string;
    switch (data.dataset) {
      case "leads":
        csv = await exportLeads(orgId, data.startDate, data.endDate);
        break;
      case "invoices":
        csv = await exportInvoices(orgId, data.startDate, data.endDate);
        break;
      case "interactions":
        csv = await exportInteractions(orgId, data.startDate, data.endDate);
        break;
      case "audit_logs":
        csv = await exportAuditLogs(orgId, data.startDate, data.endDate);
        break;
    }

    recordAudit({
      orgId,
      userId: session?.userId ?? null,
      actionType: "DATA_EXPORT",
      targetType: data.dataset,
      metadata: {
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        filename: getFilename(data.dataset),
      },
    });

    log.info("Data export generated", {
      event: EVENTS.DATA_EXPORT,
      dataset: data.dataset,
    });

    return { status: "ok" as const, csv, filename: getFilename(data.dataset) };
  });
