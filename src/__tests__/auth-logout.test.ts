import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDeleteCookie = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      inputValidator: () => chain,
      handler: (fn: (args: { data: unknown }) => Promise<unknown>) => {
        const wrapped = (args?: { data?: unknown }) => fn({ data: args?.data ?? {} });
        Object.assign(wrapped, { __isServerFn: true });
        return wrapped;
      },
    };
    return chain;
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  setCookie: vi.fn(),
  deleteCookie: mockDeleteCookie,
}));

vi.mock("../lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: new Proxy({}, { get: () => "MOCK_EVENT" }),
}));

vi.mock("../lib/db.server", () => ({
  getDb: vi.fn(),
  ensureSchema: vi.fn(),
}));

vi.mock("../lib/env.server", () => ({
  getDefaultAdminEmail: () => "test@test.com",
  getDefaultAdminPassword: () => "password123",
}));

describe("auth.server — logout clears session cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logout calls deleteCookie to clear the session", async () => {
    const { logout } = await import("../lib/auth.server");
    await logout({});

    expect(mockDeleteCookie).toHaveBeenCalledWith("kwc_session", { path: "/" });
  });
});
