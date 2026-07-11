import process from "node:process";
import crypto from "node:crypto";
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
  WHATSAPP_SENT: "WHATSAPP_SENT",
  WHATSAPP_FAILED: "WHATSAPP_FAILED",
  ANALYTICS_COMPUTED: "ANALYTICS_COMPUTED",
  WHATSAPP_INBOUND: "WHATSAPP_INBOUND",
  INTERACTION_RECORDED: "INTERACTION_RECORDED",
  LEAD_FLAGGED: "LEAD_FLAGGED",
  AUTOMATION_STAGE_CHANGE: "AUTOMATION_STAGE_CHANGE",
  AUTOMATION_FOLLOWUP: "AUTOMATION_FOLLOWUP",
  AUTOMATION_STALLED: "AUTOMATION_STALLED",
  AUTOMATION_ORCHESTRATOR_RUN: "AUTOMATION_ORCHESTRATOR_RUN",
  INVOICE_GENERATED: "INVOICE_GENERATED",
  INVOICE_PAID: "INVOICE_PAID",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  FINANCIALS_COMPUTED: "FINANCIALS_COMPUTED",
  CONFIG_UPDATED: "CONFIG_UPDATED",
  CONFIG_FETCHED: "CONFIG_FETCHED",
  RESOURCE_CREATED: "RESOURCE_CREATED",
  RESOURCE_UPDATED: "RESOURCE_UPDATED",
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",
  APPOINTMENT_SCHEDULED: "APPOINTMENT_SCHEDULED",
  ORG_CREATED: "ORG_CREATED",
  REGISTRATION_FAILED: "REGISTRATION_FAILED",
  AUDIT_LOG_CREATED: "AUDIT_LOG_CREATED",
  AUDIT_LOG_FAILED: "AUDIT_LOG_FAILED",
  DATA_EXPORT: "DATA_EXPORT",
  SSE_STREAM_OPENED: "SSE_STREAM_OPENED",
  SSE_EVENT_PUBLISHED: "SSE_EVENT_PUBLISHED",
  STORAGE_FILE_STORED: "STORAGE_FILE_STORED",
  STORAGE_FILE_FAILED: "STORAGE_FILE_FAILED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  DB_HYDRATE_STARTED: "DB_HYDRATE_STARTED",
  DB_HYDRATE_COMPLETED: "DB_HYDRATE_COMPLETED",
  LOCK_ACQUIRED: "LOCK_ACQUIRED",
  LOCK_FAILED: "LOCK_FAILED",
} as const;

type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  traceId?: string;
  orgId?: string;
  userId?: number;
  executionTimeMs?: number;
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
  const base: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? redact(meta as Record<string, unknown>) : {}),
  };
  if (meta?.request_id) base.traceId = meta.request_id;
  if (meta?.tenant_id) base.orgId = meta.tenant_id;
  return base;
}

function write(entry: LogEntry): void {
  const envelope: Record<string, unknown> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  };
  if (entry.traceId) envelope.traceId = entry.traceId;
  if (entry.orgId) envelope.orgId = entry.orgId;
  if (entry.userId !== undefined) envelope.userId = entry.userId;
  if (entry.event) envelope.event = entry.event;
  if (entry.executionTimeMs !== undefined) envelope.executionTimeMs = entry.executionTimeMs;
  if (entry.duration_ms !== undefined) envelope.duration_ms = entry.duration_ms;

  const rest = { ...entry };
  delete rest.level;
  delete rest.message;
  delete rest.event;
  delete rest.request_id;
  delete rest.tenant_id;
  delete rest.duration_ms;
  delete rest.timestamp;
  delete rest.traceId;
  delete rest.orgId;
  delete rest.userId;
  delete rest.executionTimeMs;
  if (Object.keys(rest).length > 0) envelope.meta = rest;

  if (isProduction()) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    const prefix = [
      `[${entry.level.toUpperCase()}]`,
      entry.event ? `[${entry.event}]` : "",
      entry.traceId ? `[trace:${entry.traceId.slice(0, 8)}]` : "",
      entry.orgId ? `[org:${entry.orgId.slice(0, 8)}]` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const duration = entry.executionTimeMs != null ? ` (${entry.executionTimeMs}ms)` : entry.duration_ms != null ? ` (${entry.duration_ms}ms)` : "";
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    console.log(`${prefix} ${entry.message}${duration}${extra}`);
  }
}

export function startTimer(): { end(): number } {
  const start = Date.now();
  return { end: () => Date.now() - start };
}

export function createLogger(request_id?: string, tenant_id?: string, user_id?: number) {
  const base: Partial<LogEntry> = { request_id, tenant_id };
  if (user_id !== undefined) base.userId = user_id;
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
      createLogger(
        extra.request_id || request_id,
        extra.tenant_id || tenant_id,
        extra.userId ?? user_id,
      ),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export const logger = createLogger();
