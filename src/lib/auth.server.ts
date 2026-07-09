import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb, ensureSchema } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { signToken, type SessionPayload } from "./session.server";
import { getDefaultAdminEmail, getDefaultAdminPassword } from "./env.server";

const SESSION_COOKIE = "kwc_session";
const TOKEN_EXPIRY_MS = 86_400_000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
}

async function seedDefaultOrgAndAdmin() {
  await ensureSchema(true);
  const db = await getDb();
  const existing = await db.unsafe("SELECT id FROM organizations LIMIT 1");
  if (existing.length > 0) return;

  logger.info("Seeding default organization and admin user");
  const org = await db.unsafe(
    `INSERT INTO organizations (name, slug, timezone, settings)
     VALUES ('Kay''s Wellness Centre', 'kays-wellness', 'Africa/Nairobi', '{}')
     RETURNING id`,
  );
  const orgId = org[0].id as string;

  const defaultEmail = getDefaultAdminEmail();
  const defaultPassword = getDefaultAdminPassword();
  const hashed = hashPassword(defaultPassword);

  await db.unsafe(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, 'System Admin', 'admin')`,
    [orgId, defaultEmail, hashed],
  );

  logger.info("Default admin created");

  await db.unsafe(
    `INSERT INTO clinic_availability (organization_id, day_of_week, start_time, end_time, slot_duration_minutes)
     VALUES
       ($1, 1, '08:00', '17:00', 60),
       ($1, 2, '08:00', '17:00', 60),
       ($1, 3, '08:00', '17:00', 60),
       ($1, 4, '08:00', '17:00', 60),
       ($1, 5, '08:00', '17:00', 60),
       ($1, 6, '08:00', '13:00', 60)`,
    [orgId],
  );
  logger.info("Default clinic availability seeded (Mon–Sat)");
}

export const login = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email("Enter a valid email address"),
      password: z.string().min(1, "Password is required"),
    }),
  )
  .handler(async ({ data }) => {
    await seedDefaultOrgAndAdmin();
    const db = await getDb();
    const users = await db.unsafe<Array<{ id: number; organization_id: string; role: string; password_hash: string }>>(
      "SELECT id, organization_id, role, password_hash FROM users WHERE email = $1",
      [data.email.toLowerCase().trim()],
    );
    if (users.length === 0 || !verifyPassword(data.password, users[0].password_hash)) {
      logger.warn("Login failed", { event: EVENTS.AUTH_FAILURE });
      return { error: "Invalid email or password" };
    }
    const user = users[0];
    const session: SessionPayload = {
      userId: user.id,
      orgId: user.organization_id,
      role: user.role,
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

    logger.info("Login successful", {
      event: EVENTS.AUTH_SUCCESS,
      tenant_id: user.organization_id,
      userId: user.id,
    });
    return { success: true, user: { id: user.id, organization_id: user.organization_id, role: user.role } };
  });

export { seedDefaultOrgAndAdmin };