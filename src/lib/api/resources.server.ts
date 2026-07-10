import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { logger, EVENTS } from "../logger.server";

export interface ResourceRow {
  id: number;
  organization_id: string;
  name: string;
  type: "PROVIDER" | "ROOM";
  status: "active" | "inactive";
  created_at: string;
}

export async function getResources(orgId: string, type?: "PROVIDER" | "ROOM"): Promise<ResourceRow[]> {
  const db = await getDb();
  if (type) {
    return db.unsafe<ResourceRow[]>(
      `SELECT * FROM resources WHERE organization_id = $1 AND type = $2 AND status = 'active' ORDER BY name`,
      [orgId, type],
    );
  }
  return db.unsafe<ResourceRow[]>(
    `SELECT * FROM resources WHERE organization_id = $1 AND status = 'active' ORDER BY type, name`,
    [orgId],
  );
}

export async function createResource(
  orgId: string,
  name: string,
  type: "PROVIDER" | "ROOM",
): Promise<ResourceRow> {
  const db = await getDb();
  const rows = await db.unsafe<ResourceRow[]>(
    `INSERT INTO resources (organization_id, name, type) VALUES ($1, $2, $3) RETURNING *`,
    [orgId, name, type],
  );
  return rows[0];
}

export async function updateResourceStatus(
  orgId: string,
  resourceId: number,
  status: "active" | "inactive",
): Promise<ResourceRow> {
  const db = await getDb();
  const rows = await db.unsafe<ResourceRow[]>(
    `UPDATE resources SET status = $1 WHERE id = $2 AND organization_id = $3 RETURNING *`,
    [status, resourceId, orgId],
  );
  return rows[0];
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingLeadIds: number[];
  errorCode?: string;
}

export async function checkResourceConflict(
  orgId: string,
  providerId: number | null,
  roomId: number | null,
  startTime: string,
  durationMinutes: number,
  excludeLeadId?: number,
): Promise<ConflictResult> {
  const db = await getDb();
  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60_000).toISOString();

  const params: unknown[] = [orgId, startTime, endTime];
  let paramIdx = 4;

  const conditions: string[] = [];
  const orClauses: string[] = [];

  if (providerId !== null) {
    orClauses.push(`provider_id = $${paramIdx++}`);
    params.push(providerId);
  }
  if (roomId !== null) {
    orClauses.push(`room_id = $${paramIdx++}`);
    params.push(roomId);
  }

  if (orClauses.length === 0) return { hasConflict: false, conflictingLeadIds: [] };

  conditions.push(`(${orClauses.join(" OR ")})`);
  conditions.push(`appointment_timestamp IS NOT NULL`);
  conditions.push(`appointment_timestamp < $3`);
  conditions.push(`appointment_timestamp + (COALESCE((SELECT slot_duration_minutes FROM clinic_configuration WHERE organization_id = $1), 30) || ' minutes')::INTERVAL > $2`);
  conditions.push(`status != 'closed'`);

  if (excludeLeadId !== undefined) {
    conditions.push(`id != $${paramIdx++}`);
    params.push(excludeLeadId);
  }

  const sql = `
    SELECT id FROM clinic_leads
    WHERE organization_id = $1
      AND ${conditions.join(" AND ")}
    LIMIT 1
  `;

  const rows = await db.unsafe<Array<{ id: number }>>(sql, params);

  if (rows.length > 0) {
    return {
      hasConflict: true,
      conflictingLeadIds: rows.map((r) => r.id),
      errorCode: "ERR_RESOURCE_CONFLICT",
    };
  }

  return { hasConflict: false, conflictingLeadIds: [] };
}

export const scheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      leadId: z.number(),
      appointmentTimestamp: z.string(),
      providerId: z.number().nullable().optional(),
      roomId: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId, log } = requireOrg();
    const db = await getDb();

    const [config] = await db.unsafe<Array<{ slot_duration_minutes: number }>>(
      `SELECT slot_duration_minutes FROM clinic_configuration WHERE organization_id = $1`,
      [orgId],
    );
    const durationMinutes = config?.slot_duration_minutes ?? 30;

    const conflict = await checkResourceConflict(
      orgId,
      data.providerId ?? null,
      data.roomId ?? null,
      data.appointmentTimestamp,
      durationMinutes,
      data.leadId,
    );

    if (conflict.hasConflict) {
      log.warn("Resource conflict detected during scheduling", {
        event: EVENTS.RESOURCE_CONFLICT,
        leadId: data.leadId,
        providerId: data.providerId,
        roomId: data.roomId,
        conflictingLeadIds: conflict.conflictingLeadIds,
      });
      return { status: "conflict" as const, errorCode: "ERR_RESOURCE_CONFLICT", ...conflict };
    }

    const sets: string[] = [
      "status = 'scheduled'",
      `appointment_timestamp = $1`,
    ];
    const params: unknown[] = [data.appointmentTimestamp, data.leadId, orgId];

    let idx = 4;
    if (data.providerId !== undefined) {
      sets.push(`provider_id = $${idx++}`);
      params.splice(params.length - 2, 0, data.providerId);
    }
    if (data.roomId !== undefined) {
      const roomIdx = sets.length;
      sets.push(`room_id = $${idx + 1}`);
      params.splice(params.length - 1, 0, data.roomId);
    }

    params[params.length - 2] = data.leadId;
    params[params.length - 1] = orgId;

    const paramPlaceholders = params.map((_, i) => `$${i + 1}`).slice(0, sets.length);

    await db.unsafe(
      `UPDATE clinic_leads SET ${sets.join(", ")} WHERE id = ${paramPlaceholders[sets.length - 2]} AND organization_id = ${paramPlaceholders[sets.length - 1]}`,
      params.slice(0, sets.length),
    );

    log.info("Appointment scheduled", {
      event: EVENTS.APPOINTMENT_SCHEDULED,
      leadId: data.leadId,
      timestamp: data.appointmentTimestamp,
    });

    return { status: "ok" as const };
  });

export const fetchResources = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      type: z.enum(["PROVIDER", "ROOM"]).optional(),
    }).optional(),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId } = requireOrg();
    const resources = await getResources(orgId, data?.type);
    return { status: "ok", resources };
  });

export const createResourceFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(255),
      type: z.enum(["PROVIDER", "ROOM"]),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId, log } = requireOrg();
    const resource = await createResource(orgId, data.name, data.type);
    log.info("Resource created", { event: EVENTS.RESOURCE_CREATED, resourceId: resource.id });
    return { status: "ok", resource };
  });
