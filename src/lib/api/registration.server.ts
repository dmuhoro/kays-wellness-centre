import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { hashPassword } from "../auth.server";
import { signToken, type SessionPayload } from "../session.server";

const SESSION_COOKIE = "kwc_session";
const TOKEN_EXPIRY_MS = 86_400_000;

export const registerOrgSchema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters").max(255),
  adminName: z.string().min(1, "Admin name is required").max(255),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type RegisterOrgInput = z.infer<typeof registerOrgSchema>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export const registerOrganization = createServerFn({ method: "POST" })
  .inputValidator(registerOrgSchema)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }

    const db = await getDb();

    const slug = slugify(data.organizationName);
    const slugExists = await db.unsafe<Array<{ id: string }>>(
      `SELECT id FROM organizations WHERE slug = $1`,
      [slug],
    );
    if (slugExists.length > 0) {
      return { status: "slug_taken" as const };
    }

    const emailNormalized = data.email.toLowerCase().trim();
    const existingUser = await db.unsafe<Array<{ id: number }>>(
      `SELECT u.id FROM users u JOIN organizations o ON o.id = u.organization_id WHERE u.email = $1`,
      [emailNormalized],
    );
    if (existingUser.length > 0) {
      return { status: "email_taken" as const };
    }

    const passwordHash = hashPassword(data.password);

    try {
      const orgRows = await db.unsafe<Array<{ id: string }>>(
        `INSERT INTO organizations (name, slug, timezone, settings)
         VALUES ($1, $2, 'UTC', '{}')
         RETURNING id`,
        [data.organizationName, slug],
      );
      const orgId = orgRows[0].id;

      const userRows = await db.unsafe<Array<{ id: number }>>(
        `INSERT INTO users (organization_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id`,
        [orgId, emailNormalized, passwordHash, data.adminName],
      );
      const userId = userRows[0].id;

      const defaultHours = JSON.stringify({
        monday: { open: "08:00", close: "17:00" },
        tuesday: { open: "08:00", close: "17:00" },
        wednesday: { open: "08:00", close: "17:00" },
        thursday: { open: "08:00", close: "17:00" },
        friday: { open: "08:00", close: "17:00" },
        saturday: null,
        sunday: null,
      });

      await db.unsafe(
        `INSERT INTO clinic_configuration (organization_id, business_hours, slot_duration_minutes, triage_timeout_minutes, timezone)
         VALUES ($1, $2, 30, 45, 'Africa/Nairobi')`,
        [orgId, defaultHours],
      );

      await db.unsafe(
        `INSERT INTO resources (organization_id, name, type, status) VALUES
         ($1, 'Default Provider', 'PROVIDER', 'active'),
         ($1, 'Consultation Room', 'ROOM', 'active')`,
        [orgId],
      );

      await db.unsafe(
        `INSERT INTO clinic_availability (organization_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES
         ($1, 1, '08:00', '17:00', 60),
         ($1, 2, '08:00', '17:00', 60),
         ($1, 3, '08:00', '17:00', 60),
         ($1, 4, '08:00', '17:00', 60),
         ($1, 5, '08:00', '17:00', 60),
         ($1, 6, '08:00', '13:00', 60)`,
        [orgId],
      );

      const session: SessionPayload = {
        userId,
        orgId,
        role: "admin",
        exp: Date.now() + TOKEN_EXPIRY_MS,
      };
      const token = signToken(session);

      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 86400,
      });

      logger.info("Organization registered", {
        event: EVENTS.ORG_CREATED,
        orgId,
        userId,
      });

      return { status: "ok" as const };
    } catch (err) {
      logger.error("Registration failed", {
        event: EVENTS.REGISTRATION_FAILED,
        error: (err as Error).message,
      });
      return { status: "error" as const, message: (err as Error).message };
    }
  });
