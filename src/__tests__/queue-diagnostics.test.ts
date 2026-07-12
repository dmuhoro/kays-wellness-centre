import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

const telemetrySchema = z.object({
  total: z.number().int().min(0),
  pending: z.number().int().min(0),
  dispatched: z.number().int().min(0),
  failed: z.number().int().min(0),
  stalled: z.number().int().min(0),
  byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
});

const retryResultSchema = z.object({
  status: z.literal("ok"),
  retried: z.number().int().min(0),
});

const failedItemsSchema = z.object({
  status: z.literal("ok"),
  items: z.array(z.object({
    id: z.number(),
    last_error: z.string().nullable(),
  })),
});

describe("diagnostics.server exports", () => {
  it("exports all functions", async () => {
    const mod = await import("@/lib/api/diagnostics.server");
    expect(mod.getServerStatus).toBeDefined();
    expect(mod.getQueueTelemetry).toBeDefined();
    expect(mod.forceRetryQueueItems).toBeDefined();
    expect(mod.getFailedQueueItems).toBeDefined();
  });
});

describe("QueueTelemetry shape", () => {
  it("validates a typical telemetry object", () => {
    const tel = { total: 27, pending: 5, dispatched: 20, failed: 2, stalled: 0, byStatus: [] };
    expect(telemetrySchema.safeParse(tel).success).toBe(true);
  });

  it("validates empty telemetry", () => {
    const tel = { total: 0, pending: 0, dispatched: 0, failed: 0, stalled: 0, byStatus: [] };
    expect(telemetrySchema.safeParse(tel).success).toBe(true);
  });

  it("requires all count fields", () => {
    expect(telemetrySchema.safeParse({ total: 1, pending: 0, dispatched: 0, failed: 0, byStatus: [] }).success).toBe(false);
  });
});

describe("forceRetry result shape", () => {
  it("validates ok with retried count", () => {
    expect(retryResultSchema.safeParse({ status: "ok", retried: 5 }).success).toBe(true);
  });

  it("validates ok with zero retried", () => {
    expect(retryResultSchema.safeParse({ status: "ok", retried: 0 }).success).toBe(true);
  });

  it("rejects missing retried", () => {
    expect(retryResultSchema.safeParse({ status: "ok" }).success).toBe(false);
  });
});

describe("getFailedItems result shape", () => {
  it("validates ok with items array", () => {
    expect(failedItemsSchema.safeParse({ status: "ok", items: [{ id: 1, last_error: null }] }).success).toBe(true);
  });

  it("rejects missing items", () => {
    expect(failedItemsSchema.safeParse({ status: "ok" }).success).toBe(false);
  });
});
