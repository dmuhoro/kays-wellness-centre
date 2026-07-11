import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addDays, addMinutes, format, parse, startOfDay, isAfter, isBefore } from "date-fns";
import { getDb, ensureSchema, isDbAvailable, getConcurrentLock, releaseConcurrentLock } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { requireOrg } from "../tenant.server";

interface AvailabilityRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

export function generateSlots(
  date: Date,
  availability: AvailabilityRow[],
  bookedTimestamps: string[],
): string[] {
  const dayOfWeek = date.getUTCDay();
  const dayAvail = availability.filter((a) => a.day_of_week === dayOfWeek);
  if (dayAvail.length === 0) return [];

  const booked = new Set(bookedTimestamps);
  const slots: string[] = [];

  for (const avail of dayAvail) {
    const [startH, startM] = avail.start_time.split(":").map(Number);
    const [endH, endM] = avail.end_time.split(":").map(Number);

    const dayStart = startOfDay(date);
    const openAt = addMinutes(dayStart, startH * 60 + startM);
    const closeAt = addMinutes(dayStart, endH * 60 + endM);
    const duration = avail.slot_duration_minutes;

    let cursor = openAt;

    while (true) {
      const slotEnd = addMinutes(cursor, duration);
      if (isAfter(slotEnd, closeAt)) break;

      const iso = cursor.toISOString();
      if (!booked.has(iso)) {
        slots.push(iso);
      }
      cursor = slotEnd;
    }
  }

  return slots;
}

export function generateSlotsForRange(
  startDate: Date,
  endDate: Date,
  availability: AvailabilityRow[],
  bookedTimestamps: string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  let cursor = startOfDay(startDate);
  const end = startOfDay(endDate);

  while (isBefore(cursor, end)) {
    const key = format(cursor, "yyyy-MM-dd");
    const slots = generateSlots(cursor, availability, bookedTimestamps);
    if (slots.length > 0) {
      result[key] = slots;
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

export interface SlotResult {
  date: string;
  slots: string[];
}

export const getAvailableSlots = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    }),
  )
  .handler(async ({ data }): Promise<SlotResult> => {
    if (!isDbAvailable()) {
      logger.warn("DB unavailable for slot query", { event: EVENTS.DB_UNAVAILABLE });
      return { date: data.date, slots: [] };
    }

    await ensureSchema(true);

    let orgId: string;
    let log = logger;
    try {
      const ctx = requireOrg();
      orgId = ctx.orgId;
      log = ctx.log;
    } catch {
      logger.warn("No tenant context for slot query", { event: EVENTS.TENANT_MISSING });
      return { date: data.date, slots: [] };
    }

    const db = await getDb();
    const start = Date.now();

    const availability = await db.unsafe<AvailabilityRow[]>(
      `SELECT day_of_week, start_time, end_time, slot_duration_minutes
       FROM clinic_availability
       WHERE organization_id = $1`,
      [orgId],
    );

    if (availability.length === 0) {
      log.info("No availability configured", { tenant_id: orgId });
      return { date: data.date, slots: [] };
    }

    const parsedDate = parse(data.date, "yyyy-MM-dd", new Date());
    const nextDayStart = addDays(parsedDate, 1);
    const nextDayEnd = addDays(nextDayStart, 1);

    const bookedRows = await db.unsafe<Array<{ appointment_timestamp: string }>>(
      `SELECT appointment_timestamp FROM clinic_leads
       WHERE organization_id = $1
         AND appointment_timestamp IS NOT NULL
         AND appointment_timestamp >= $2
         AND appointment_timestamp < $3`,
      [orgId, nextDayStart.toISOString(), nextDayEnd.toISOString()],
    );

    const bookedTimestamps = bookedRows.map((r) => new Date(r.appointment_timestamp).toISOString());
    const slots = generateSlots(parsedDate, availability, bookedTimestamps);

    log.info("Slots generated", {
      event: EVENTS.SLOTS_GENERATED,
      date: data.date,
      count: slots.length,
      duration_ms: Date.now() - start,
    });

    return { date: data.date, slots };
  });

export const getAvailabilityRange = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return {};

    let orgId: string;
    try {
      orgId = requireOrg().orgId;
    } catch {
      return {};
    }

    await ensureSchema(true);
    const db = await getDb();

    const availability = await db.unsafe<AvailabilityRow[]>(
      `SELECT day_of_week, start_time, end_time, slot_duration_minutes
       FROM clinic_availability WHERE organization_id = $1`,
      [orgId],
    );

    const start = parse(data.startDate, "yyyy-MM-dd", new Date());
    const end = parse(data.endDate, "yyyy-MM-dd", new Date());

    const booked = await db.unsafe<Array<{ appointment_timestamp: string }>>(
      `SELECT appointment_timestamp FROM clinic_leads
       WHERE organization_id = $1
         AND appointment_timestamp IS NOT NULL
         AND appointment_timestamp >= $2
         AND appointment_timestamp < $3`,
      [orgId, start.toISOString(), addDays(end, 1).toISOString()],
    );

    const bookedTimestamps = booked.map((r) => new Date(r.appointment_timestamp).toISOString());
    return generateSlotsForRange(start, end, availability, bookedTimestamps);
  });

export const bookSlot = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      leadId: z.number(),
      organizationId: z.string().uuid(),
      appointmentTimestamp: z.string().datetime(),
      providerId: z.number().nullable().optional(),
      roomId: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const lockKey = `slot:${data.organizationId}:${data.appointmentTimestamp}`;
    const acquired = await getConcurrentLock(lockKey);
    if (!acquired) {
      return { status: "concurrency_conflict" as const, message: "Slot is being booked by another request" };
    }

    try {
      const existing = await db.unsafe<Array<{ id: number }>>(
        `SELECT id FROM clinic_leads
         WHERE organization_id = $1
           AND appointment_timestamp = $2
           AND status != 'closed'
         LIMIT 1
         FOR UPDATE`,
        [data.organizationId, data.appointmentTimestamp],
      );

      if (existing.length > 0) {
        return { status: "slot_unavailable" as const, message: "This slot is already booked" };
      }

      const sets: string[] = [
        "status = 'scheduled'",
        `appointment_timestamp = $1`,
      ];
      const params: unknown[] = [data.appointmentTimestamp, data.leadId, data.organizationId];
      let idx = 4;

      if (data.providerId !== undefined && data.providerId !== null) {
        sets.push(`provider_id = $${idx++}`);
        params.splice(params.length - 2, 0, data.providerId);
      }
      if (data.roomId !== undefined && data.roomId !== null) {
        sets.push(`room_id = $${idx}`);
        params.splice(params.length - 1, 0, data.roomId);
      }

      params[params.length - 2] = data.leadId;
      params[params.length - 1] = data.organizationId;

      await db.unsafe(
        `UPDATE clinic_leads SET ${sets.join(", ")}
         WHERE id = ${params[params.length - 2]} AND organization_id = ${params[params.length - 1]}`,
        params.slice(0, sets.length),
      );

      logger.info("Slot booked", {
        event: EVENTS.SLOT_BOOKED,
        leadId: data.leadId,
        timestamp: data.appointmentTimestamp,
      });

      return { status: "ok", appointmentTimestamp: data.appointmentTimestamp };
    } finally {
      await releaseConcurrentLock(lockKey);
    }
  });

export const reserveSlot = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      organizationId: z.string().uuid(),
      appointmentTimestamp: z.string().datetime(),
      providerId: z.number().nullable().optional(),
      roomId: z.number().nullable().optional(),
      expiresInSeconds: z.number().int().min(30).max(600).default(300),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getDb();
    const lockKey = `reserve:${data.organizationId}:${data.appointmentTimestamp}`;
    const acquired = await getConcurrentLock(lockKey);
    if (!acquired) {
      return { status: "concurrency_conflict" as const, message: "Slot reservation contention" };
    }

    try {
      const existing = await db.unsafe<Array<{ id: number; status: string }>>(
        `SELECT id, status FROM clinic_leads
         WHERE organization_id = $1
           AND appointment_timestamp = $2
           AND status NOT IN ('closed', 'lost')
         LIMIT 1
         FOR UPDATE`,
        [data.organizationId, data.appointmentTimestamp],
      );

      if (existing.length > 0) {
        return {
          status: "slot_unavailable" as const,
          message: "Slot unavailable for reservation",
          existingStatus: existing[0].status,
        };
      }

      const expiresAt = new Date(Date.now() + data.expiresInSeconds * 1000).toISOString();

      const rows = await db.unsafe<Array<{ id: number }>>(
        `INSERT INTO slot_reservations (organization_id, appointment_timestamp, provider_id, room_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, appointment_timestamp) DO UPDATE
           SET expires_at = $5, created_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          data.organizationId,
          data.appointmentTimestamp,
          data.providerId ?? null,
          data.roomId ?? null,
          expiresAt,
        ],
      );

      return {
        status: "ok",
        reservationId: rows[0].id,
        expiresAt,
      };
    } finally {
      await releaseConcurrentLock(lockKey);
    }
  });
