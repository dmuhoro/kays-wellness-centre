import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, ensureSchema, isDbAvailable, getConnectionError } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { requireOrg } from "../tenant.server";
import { enqueueNotification } from "../queue.server";

export type LeadRow = {
  id: number;
  name: string;
  phone: string;
  email: string;
  service: string;
  channel: string;
  priority: string;
  status: string;
  organization_id: string;
  appointment_timestamp: string | null;
  created_at: string;
};

export type FetchLeadsResult =
  | { rows: LeadRow[]; source: "db" }
  | { rows: []; source: "offline"; reason: string };

const submitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().max(50).optional().default(""),
  email: z.union([z.string().email("Enter a valid email address"), z.literal("")]).optional().default(""),
  service: z.string().max(100).optional().default(""),
  channel: z.string().max(50).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  appointment_timestamp: z.string().datetime().optional().nullable(),
  raw_payload: z.any().optional(),
});

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator(submitSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      logger.warn("DB unavailable, rejecting lead submission", {
        event: EVENTS.DB_UNAVAILABLE,
        error: getConnectionError(),
      });
      return { id: null, status: "db_unavailable" as const };
    }

    const schemaOk = await ensureSchema(true);
    if (!schemaOk) {
      return { id: null, status: "db_unavailable" as const };
    }

    const { orgId, log } = requireOrg();

    const db = await getDb();
    const start = Date.now();

    if (data.appointment_timestamp) {
      const collision = await db.unsafe(
        `SELECT id FROM clinic_leads
         WHERE organization_id = $1 AND appointment_timestamp = $2
         LIMIT 1`,
        [orgId, data.appointment_timestamp],
      );
      if (collision.length > 0) {
        log.warn("Slot already booked", {
          event: EVENTS.SLOT_UNAVAILABLE,
          appointment_timestamp: data.appointment_timestamp,
        });
        return { id: null, status: "slot_unavailable" as const };
      }
    }

    const result = await db.unsafe(
      `INSERT INTO clinic_leads (name, phone, email, service, channel, priority, organization_id, appointment_timestamp, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        data.name.trim(),
        data.phone.trim(),
        data.email.trim().toLowerCase(),
        data.service.trim(),
        data.channel.trim(),
        data.priority,
        orgId,
        data.appointment_timestamp || null,
        data.raw_payload ? JSON.stringify(data.raw_payload) : null,
      ],
    );
    const leadId = result[0]?.id as number | undefined;
    log.info("Lead inserted", {
      event: EVENTS.LEAD_CREATED,
      leadId,
      duration_ms: Date.now() - start,
    });

    if (leadId != null) {
      enqueueNotification({
        orgId,
        leadId,
        eventType: "lead_created",
        payload: { name: data.name.trim(), service: data.service.trim() },
      }).catch((err) => {
        log.error("Failed to enqueue notification", {
          event: EVENTS.QUEUE_SYNC_FAILURE,
          leadId,
          error: (err as Error).message,
        });
      });
    }

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
    const { log } = requireOrg();
    const res = await fetch(data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data.payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log.error("Webhook delivery failed", {
        event: EVENTS.QUEUE_SYNC_FAILURE,
        status: res.status,
      });
      throw new Error(`Webhook returned ${res.status}`);
    }
    log.info("Webhook sent", { event: EVENTS.QUEUE_SYNC_SUCCESS });
    return { status: "webhook_sent" as const };
  });

export const fetchLeads = createServerFn({ method: "GET" })
  .handler(async (): Promise<FetchLeadsResult> => {
    if (!isDbAvailable()) {
      const reason = getConnectionError() || "Database unavailable";
      logger.warn("DB unavailable", {
        event: EVENTS.DB_UNAVAILABLE,
        error: reason,
      });
      return { rows: [], source: "offline", reason };
    }

    const schemaOk = await ensureSchema(true);
    if (!schemaOk) {
      return { rows: [], source: "offline", reason: "Schema setup failed" };
    }

    const { orgId, log } = requireOrg();

    const db = await getDb();
    const start = Date.now();
    const rows = await db.unsafe<LeadRow[]>(
      `SELECT id, name, phone, email, service, channel, priority, status, organization_id, appointment_timestamp, created_at
       FROM clinic_leads
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [orgId],
    );
    log.info("Leads fetched", {
      event: EVENTS.LEAD_FETCHED,
      count: rows.length,
      duration_ms: Date.now() - start,
    });
    return { rows, source: "db" };
  });

const updateSchema = z.object({
  id: z.number(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  appointment_timestamp: z.string().datetime().optional().nullable(),
});

export const updateLead = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }
    const { orgId, log } = requireOrg();

    const db = await getDb();
    const setClauses: string[] = [];
    const values: (string | number)[] = [];

    if (data.status !== undefined) {
      setClauses.push(`status = $${values.length + 1}`);
      values.push(data.status);
    }
    if (data.priority !== undefined) {
      setClauses.push(`priority = $${values.length + 1}`);
      values.push(data.priority);
    }
    if (data.appointment_timestamp !== undefined) {
      setClauses.push(`appointment_timestamp = $${values.length + 1}`);
      values.push(data.appointment_timestamp);
    }

    if (setClauses.length === 0) {
      return { status: "noop" as const };
    }

    values.push(data.id, orgId);
    await db.unsafe(
      `UPDATE clinic_leads SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND organization_id = $${values.length}`,
      values,
    );
    log.info("Lead updated", {
      event: EVENTS.LEAD_UPDATED,
      leadId: data.id,
    });
    return { status: "updated" as const };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }
    const { orgId, log } = requireOrg();

    const db = await getDb();
    await db.unsafe(
      "DELETE FROM clinic_leads WHERE id = $1 AND organization_id = $2",
      [data.id, orgId],
    );
    log.info("Lead deleted", {
      event: EVENTS.LEAD_DELETED,
      leadId: data.id,
    });
    return { status: "deleted" as const };
  });
