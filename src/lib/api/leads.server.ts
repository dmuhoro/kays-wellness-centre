import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, ensureSchema, isDbAvailable, getConnectionError } from "../db.server";

export type LeadRow = {
  id: number;
  name: string;
  phone: string;
  email: string;
  service: string;
  channel: string;
  priority: string;
  status: string;
  created_at: string;
};

export type FetchLeadsResult =
  | { rows: LeadRow[]; source: "db" }
  | { rows: []; source: "offline"; reason: string };

const submitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().max(50).optional().default(""),
  email: z.string().email("Enter a valid email address").optional().default(""),
  service: z.string().max(100).optional().default(""),
  channel: z.string().max(50).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  raw_payload: z.any().optional(),
});

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator(submitSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      console.warn("[Leads] DB unavailable, rejecting lead submission:", getConnectionError());
      return { id: null, status: "db_unavailable" as const };
    }

    const schemaOk = await ensureSchema();
    if (!schemaOk) {
      return { id: null, status: "db_unavailable" as const };
    }

    const db = getDb();
    const result = await db.unsafe(
      `INSERT INTO clinic_leads (name, phone, email, service, channel, priority, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        data.name.trim(),
        data.phone.trim(),
        data.email.trim().toLowerCase(),
        data.service.trim(),
        data.channel.trim(),
        data.priority,
        data.raw_payload ? JSON.stringify(data.raw_payload) : null,
      ],
    );
    const leadId = result[0]?.id as number | undefined;
    console.log(`[Leads] Lead #${leadId} inserted`);
    return { id: leadId ?? null, status: "created" as const };
  });

export const submitLeadViaWebhook = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      webhookUrl: z.string().url(),
      payload: z.any(),
    }),
  )
  .handler(async ({ data }) => {
    const res = await fetch(data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data.payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }
    return { status: "webhook_sent" as const };
  });

export const fetchLeads = createServerFn({ method: "GET" })
  .handler(async (): Promise<FetchLeadsResult> => {
    if (!isDbAvailable()) {
      const reason = getConnectionError() || "Database unavailable";
      console.warn("[Leads] DB unavailable:", reason);
      return { rows: [], source: "offline", reason };
    }
    const schemaOk = await ensureSchema();
    if (!schemaOk) {
      return { rows: [], source: "offline", reason: "Schema setup failed" };
    }

    const db = getDb();
    const rows = await db.unsafe<LeadRow[]>(
      "SELECT id, name, phone, email, service, channel, priority, status, created_at FROM clinic_leads ORDER BY created_at DESC LIMIT 100",
    );
    return { rows, source: "db" };
  });

const updateSchema = z.object({
  id: z.number(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const updateLead = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }
    const db = getDb();

    const setClauses: string[] = [];
    const values: (string | number)[] = [];
    let idx = 1;

    if (data.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.priority !== undefined) {
      setClauses.push(`priority = $${idx++}`);
      values.push(data.priority);
    }

    if (setClauses.length === 0) {
      return { status: "noop" as const };
    }

    values.push(data.id);
    await db.unsafe(
      `UPDATE clinic_leads SET ${setClauses.join(", ")} WHERE id = $${idx}`,
      values,
    );
    console.log(`[Leads] Lead #${data.id} updated:`, setClauses.join(", "));
    return { status: "updated" as const };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }
    const db = getDb();
    await db.unsafe("DELETE FROM clinic_leads WHERE id = $1", [data.id]);
    console.log(`[Leads] Lead #${data.id} deleted`);
    return { status: "deleted" as const };
  });
