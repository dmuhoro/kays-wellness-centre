import { describe, it, expect, beforeEach } from "vitest";

const STORAGE_KEY = "kwc_pending_submissions";

function setPending(data: unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getPending(): unknown[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function addPending(packet: unknown) {
  const pending = getPending();
  pending.push(packet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

function clearPending() {
  localStorage.removeItem(STORAGE_KEY);
}

describe("offline queue payload resilience", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when nothing is stored", () => {
    expect(getPending()).toEqual([]);
  });

  it("stores and retrieves a single packet", () => {
    const packet = { formData: { name: "Test", email: "t@t.com" }, triage_priority: "medium" };
    addPending(packet);
    expect(getPending()).toEqual([packet]);
  });

  it("accumulates multiple packets", () => {
    const a = { formData: { name: "A" } };
    const b = { formData: { name: "B" } };
    addPending(a);
    addPending(b);
    expect(getPending()).toHaveLength(2);
    expect(getPending()[1]).toEqual(b);
  });

  it("clears all pending on clearPending", () => {
    addPending({ formData: { name: "X" } });
    clearPending();
    expect(getPending()).toEqual([]);
  });

  it("handles corrupted JSON gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(getPending()).toEqual([]);
  });

  it("handles empty string in storage", () => {
    localStorage.setItem(STORAGE_KEY, "");
    expect(getPending()).toEqual([]);
  });

  it("preserves complex nested payloads", () => {
    const packet = {
      Client_Lead_Source: "Online_Front_Door",
      Payload_Timestamp: "2026-07-09T12:00:00.000Z",
      capture_channel: "Web_Premium_Front_Door",
      formData: {
        name: "Alice",
        email: "alice@test.com",
        service: "bhrh",
        phone: "+254700000000",
        channel: "website",
      },
      triage_priority: "high",
      device_telemetry: {
        userAgent: "vitest",
        screenSize: "1024x768",
        language: "en",
        timezone: "UTC",
      },
    };
    addPending(packet);
    const retrieved = getPending();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]).toEqual(packet);
  });

  it("does not mutate stored data when adding", () => {
    const packet = { formData: { name: "Original" } };
    addPending(packet);
    packet.formData.name = "Mutated";
    expect(getPending()[0].formData.name).toBe("Original");
  });
});
