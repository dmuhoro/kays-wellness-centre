import { z } from "zod";
import crypto from "node:crypto";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .default("dev-secret-change-in-prod"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@kayswellnesscentre.org"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("admin0726"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VERCEL_REGION: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let validated: Env | null = null;

function getEnv(): Env {
  if (validated) return validated;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    console.error(`[env] Configuration validation failed:\n${missing}`);
    throw new Error(`Environment validation failed. Set the required variables.`);
  }

  validated = result.data;

  if (result.data.SESSION_SECRET === "dev-secret-change-in-prod") {
    console.warn("[env] Using default SESSION_SECRET — set a strong secret in production");
  }

  return validated;
}

export function getSessionSecret(): string {
  return getEnv().SESSION_SECRET;
}

export function getDefaultAdminEmail(): string {
  return getEnv().DEFAULT_ADMIN_EMAIL;
}

export function getDefaultAdminPassword(): string {
  return getEnv().DEFAULT_ADMIN_PASSWORD;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — cannot connect to database");
  }
  return url;
}

export function getNodeEnv(): string {
  return getEnv().NODE_ENV;
}

export { getEnv };
