import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";

const importRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  service: z.string().optional().default(""),
  channel: z.string().optional().default("web"),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export interface ImportResult {
  total: number;
  inserted: number;
  errors: Array<{ row: number; message: string; data: Record<string, unknown> }>;
}

export const bulkImportLeads = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rows: z.array(z.record(z.unknown())),
    }),
  )
  .handler(async ({ data }): Promise<ImportResult> => {
    if (!isDbAvailable()) {
      return { total: data.rows.length, inserted: 0, errors: data.rows.map((_, i) => ({ row: i + 1, message: "Database unavailable", data: {} })) };
    }

    const { orgId, log } = requireOrg();
    const db = await getDb();
    const result: ImportResult = { total: data.rows.length, inserted: 0, errors: [] };

    for (let i = 0; i < data.rows.length; i++) {
      const raw = data.rows[i];
      const parsed = importRowSchema.safeParse({
        name: raw.name || raw.Name || raw.NAME || raw.full_name || raw["Full Name"] || "",
        phone: raw.phone || raw.Phone || raw.PHONE || raw.telephone || raw.telephone_number || "",
        email: raw.email || raw.Email || raw.EMAIL || raw["E-mail"] || raw.mail || "",
        service: raw.service || raw.Service || raw.SERVICE || raw.service_type || "",
        channel: raw.channel || raw.Channel || raw.source || raw.Source || "web",
        priority: raw.priority || raw.Priority || raw.PRIORITY || "medium",
      });

      if (!parsed.success) {
        result.errors.push({
          row: i + 1,
          message: parsed.error.errors.map((e) => e.message).join("; "),
          data: raw,
        });
        continue;
      }

      try {
        await db.unsafe(
          `INSERT INTO clinic_leads (name, phone, email, service, channel, priority, organization_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            parsed.data.name.trim(),
            parsed.data.phone.trim(),
            parsed.data.email.trim().toLowerCase(),
            parsed.data.service.trim(),
            parsed.data.channel.trim(),
            parsed.data.priority,
            orgId,
          ],
        );
        result.inserted++;
      } catch (err) {
        result.errors.push({
          row: i + 1,
          message: (err as Error).message,
          data: raw,
        });
        log.error("Bulk import row failed", {
          event: EVENTS.DB_UNAVAILABLE,
          row: i + 1,
          error: (err as Error).message,
        });
      }
    }

    log.info("Bulk import completed", {
      event: EVENTS.LEAD_CREATED,
      total: result.total,
      inserted: result.inserted,
      errors: result.errors.length,
    });

    return result;
  });
