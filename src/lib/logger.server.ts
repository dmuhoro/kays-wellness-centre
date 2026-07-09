import process from "node:process";
import { isProduction } from "./env.server";

export const EVENTS = {
  AUTH_SUCCESS: "AUTH_SUCCESS",
  AUTH_FAILURE: "AUTH_FAILURE",
  LEAD_CREATED: "LEAD_CREATED",
  LEAD_FETCHED: "LEAD_FETCHED",
  LEAD_UPDATED: "LEAD_UPDATED",
  LEAD_DELETED: "LEAD_DELETED",
  SLOTS_GENERATED: "SLOTS_GENERATED",
  SLOT_BOOKED: "SLOT_BOOKED",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  QUEUE_SYNC_SUCCESS: "QUEUE_SYNC_SUCCESS",
  QUEUE_SYNC_FAILURE: "QUEUE_SYNC_FAILURE",
  DB_UNAVAILABLE: "DB_UNAVAILABLE",
  TENANT_MISSING: "TENANT_MISSING",
  SCHEMA_SETUP: "SCHEMA_SETUP",
  ENV_VALIDATION: "ENV_VALIDATION",
  NOTIFICATION_ENQUEUED: "NOTIFICATION_ENQUEUED",
  NOTIFICATION_DISPATCHED: "NOTIFICATION_DISPATCHED",
  NOTIFICATION_FAILED: "NOTIFICATION_FAILED",
  NOTIFICATION_RETRY: "NOTIFICATION_RETRY",
  NOTIFICATION_IDEMPOTENCY_SKIP: "NOTIFICATION_IDEMPOTENCY_SKIP",
} as const;

type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  event?: EventType;
  request_id?: string;
  tenant_id?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

const PII_KEYS = new Set(["email", "password", "phone", "name", "raw_payload"]);

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (PII_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function makeEntry(
  level: LogEntry["level"],
  message: string,
  meta?: Partial<LogEntry>,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? redact(meta as Record<string, unknown>) : {}),
  };
}

function write(entry: LogEntry): void {
  if (isProduction()) {
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const prefix = [
      `[${entry.level.toUpperCase()}]`,
      entry.event ? `[${entry.event}]` : "",
      entry.request_id ? `[req:${entry.request_id}]` : "",
      entry.tenant_id ? `[org:${entry.tenant_id.slice(0, 8)}]` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const duration = entry.duration_ms != null ? ` (${entry.duration_ms}ms)` : "";
    const rest = { ...entry };
    delete rest.level;
    delete rest.message;
    delete rest.event;
    delete rest.request_id;
    delete rest.tenant_id;
    delete rest.duration_ms;
    delete rest.timestamp;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    console.log(`${prefix} ${message}${duration}${extra}`);
  }
}

export function createLogger(request_id?: string, tenant_id?: string) {
  const base = { request_id, tenant_id };
  return {
    debug: (msg: string, meta?: Partial<LogEntry>) =>
      write(makeEntry("debug", msg, { ...base, ...meta })),
    info: (msg: string, meta?: Partial<LogEntry>) =>
      write(makeEntry("info", msg, { ...base, ...meta })),
    warn: (msg: string, meta?: Partial<LogEntry>) =>
      write(makeEntry("warn", msg, { ...base, ...meta })),
    error: (msg: string, meta?: Partial<LogEntry>) =>
      write(makeEntry("error", msg, { ...base, ...meta })),
    child: (extra: Partial<LogEntry>) =>
      createLogger(extra.request_id || request_id, extra.tenant_id || tenant_id),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const logger = createLogger();
