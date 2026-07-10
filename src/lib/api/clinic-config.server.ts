import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { logger, EVENTS } from "../logger.server";

export interface BusinessHours {
  [day: string]: { open: string; close: string } | null;
}

export interface ClinicConfigRow {
  id: number;
  organization_id: string;
  business_hours: BusinessHours;
  slot_duration_minutes: number;
  triage_timeout_minutes: number;
  custom_keywords: string[];
  timezone: string;
  created_at: string;
  updated_at: string;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const hoursEntrySchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  close: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
}).refine(
  (data) => {
    const [oh, om] = data.open.split(":").map(Number);
    const [ch, cm] = data.close.split(":").map(Number);
    return oh * 60 + om < ch * 60 + cm;
  },
  { message: "Open time must precede close time" },
);

export const updateClinicConfigSchema = z.object({
  business_hours: z.record(
    z.string(),
    hoursEntrySchema.nullable(),
  ).optional(),
  slot_duration_minutes: z.number().int().min(15).max(120).optional(),
  triage_timeout_minutes: z.number().int().min(5).max(1440).optional(),
  custom_keywords: z.array(z.string().min(1).max(50)).max(20).optional(),
  timezone: z.string().optional(),
});

export type ClinicConfigInput = z.infer<typeof updateClinicConfigSchema>;

export async function getClinicConfig(orgId: string): Promise<ClinicConfigRow | null> {
  const db = await getDb();
  const rows = await db.unsafe<ClinicConfigRow[]>(
    `SELECT * FROM clinic_configuration WHERE organization_id = $1`,
    [orgId],
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function ensureClinicConfig(orgId: string): Promise<ClinicConfigRow> {
  const db = await getDb();
  const existing = await getClinicConfig(orgId);
  if (existing) return existing;

  const defaultHours: BusinessHours = {
    monday: { open: "08:00", close: "17:00" },
    tuesday: { open: "08:00", close: "17:00" },
    wednesday: { open: "08:00", close: "17:00" },
    thursday: { open: "08:00", close: "17:00" },
    friday: { open: "08:00", close: "17:00" },
    saturday: null,
    sunday: null,
  };

  const rows = await db.unsafe<ClinicConfigRow[]>(
    `INSERT INTO clinic_configuration (organization_id, business_hours, slot_duration_minutes, triage_timeout_minutes, timezone)
     VALUES ($1, $2, 30, 45, 'UTC')
     RETURNING *`,
    [orgId, JSON.stringify(defaultHours)],
  );
  return rows[0];
}

export async function updateClinicConfig(
  orgId: string,
  input: ClinicConfigInput,
): Promise<ClinicConfigRow> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.business_hours !== undefined) {
    sets.push(`business_hours = $${idx++}`);
    params.push(JSON.stringify(input.business_hours));
  }
  if (input.slot_duration_minutes !== undefined) {
    sets.push(`slot_duration_minutes = $${idx++}`);
    params.push(input.slot_duration_minutes);
  }
  if (input.triage_timeout_minutes !== undefined) {
    if (input.triage_timeout_minutes < 5) {
      throw new Error("Triage timeout cannot be less than 5 minutes");
    }
    sets.push(`triage_timeout_minutes = $${idx++}`);
    params.push(input.triage_timeout_minutes);
  }
  if (input.custom_keywords !== undefined) {
    sets.push(`custom_keywords = $${idx++}`);
    params.push(JSON.stringify(input.custom_keywords));
  }
  if (input.timezone !== undefined) {
    sets.push(`timezone = $${idx++}`);
    params.push(input.timezone);
  }

  if (sets.length === 0) return (await getClinicConfig(orgId))!;

  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(orgId);

  const rows = await db.unsafe<ClinicConfigRow[]>(
    `UPDATE clinic_configuration SET ${sets.join(", ")} WHERE organization_id = $${idx} RETURNING *`,
    params,
  );
  return rows[0];
}

export async function getCustomKeywords(orgId: string): Promise<string[]> {
  const config = await getClinicConfig(orgId);
  if (!config || !config.custom_keywords) return [];
  return config.custom_keywords;
}

export const fetchClinicConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId, log } = requireOrg();
    const config = await ensureClinicConfig(orgId);
    log.info("Clinic config fetched", { event: EVENTS.CONFIG_FETCHED });
    return { status: "ok", config };
  });

export const saveClinicConfig = createServerFn({ method: "POST" })
  .inputValidator(updateClinicConfigSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId, log } = requireOrg();
    const config = await updateClinicConfig(orgId, data);
    log.info("Clinic config updated", { event: EVENTS.CONFIG_UPDATED });
    return { status: "ok", config };
  });
