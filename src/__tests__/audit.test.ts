import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUnsafe = vi.fn();
const mockGetDb = vi.fn(() => ({ unsafe: mockUnsafe }));

vi.mock("@/lib/db.server", () => ({
  getDb: () => mockGetDb(),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: { AUDIT_LOG_CREATED: "AUDIT_LOG_CREATED", AUDIT_LOG_FAILED: "AUDIT_LOG_FAILED", SCHEMA_SETUP: "SCHEMA_SETUP" },
}));

describe("Audit Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsafe.mockReset();
  });

  it("recordAudit inserts an audit row", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      orgId: "org-1",
      userId: 42,
      actionType: "USER_AUTH",
      targetType: "user",
      targetId: "42",
      metadata: { source: "login" },
    });
    expect(mockUnsafe).toHaveBeenCalledTimes(1);
    const sql = mockUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO audit_logs");
    expect(mockUnsafe.mock.calls[0][1]).toContain("org-1");
  });

  it("recordAudit uses empty metadata when not provided", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      orgId: "org-2",
      actionType: "DATA_EXPORT",
    });
    expect(mockUnsafe.mock.calls[0][1][6]).toBe("{}");
  });

  it("recordAudit skips write when DB is unavailable", async () => {
    vi.mocked(await import("@/lib/db.server")).isDbAvailable = vi.fn(() => false);
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({ orgId: "org-1", actionType: "USER_AUTH" });
    expect(mockUnsafe).not.toHaveBeenCalled();
  });

  it("queryAuditLogs returns rows filtered by orgId", async () => {
    mockUnsafe.mockResolvedValue([{ id: 1, action_type: "USER_AUTH", tenant_id: "org-1" }]);
    const { queryAuditLogs } = await import("@/lib/audit.server");
    const rows = await queryAuditLogs("org-1");
    expect(rows).toHaveLength(1);
    expect(mockUnsafe.mock.calls[0][1][0]).toBe("org-1");
  });

  it("queryAuditLogs filters by actionType", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { queryAuditLogs } = await import("@/lib/audit.server");
    await queryAuditLogs("org-1", { actionType: "RECORD_DELETED" });
    const sql = mockUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("action_type");
  });

  it("queryAuditLogs supports pagination", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { queryAuditLogs } = await import("@/lib/audit.server");
    await queryAuditLogs("org-1", { limit: 10, offset: 20 });
    const params = mockUnsafe.mock.calls[0][1];
    expect(params[params.length - 2]).toBe(10);
    expect(params[params.length - 1]).toBe(20);
  });

  it("ensureAuditSchema creates audit_logs table", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { ensureAuditSchema } = await import("@/lib/audit.server");
    const result = await ensureAuditSchema();
    expect(result).toBe(true);
    const sql = mockUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS audit_logs");
  });
});
