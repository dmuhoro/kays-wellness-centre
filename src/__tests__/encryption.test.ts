import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    PII_ENCRYPTED: "PII_ENCRYPTED",
    PII_DECRYPTED: "PII_DECRYPTED",
    PII_ENCRYPT_FAILED: "PII_ENCRYPT_FAILED",
    CONFIG_UPDATED: "CONFIG_UPDATED",
  },
}));

describe("PII Encryption - Basic Round-trip", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();
    mockDb.unsafe.mockResolvedValue([
      { key_hash: "test-passphrase-hash", key_version: 1 },
    ]);
  });

  it("encrypts and decrypts plaintext back to original", async () => {
    const { encryptPII, decryptPII } = await import("@/lib/encryption.server");
    const plaintext = "Patient has severe anxiety and depression";
    const encrypted = await encryptPII("org-1", plaintext);

    expect(encrypted).toMatch(/^ENC:/);
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptPII("org-1", encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("returns empty string unchanged", async () => {
    const { encryptPII, decryptPII } = await import("@/lib/encryption.server");
    const result = await encryptPII("org-1", "");
    expect(result).toBe("");
    const decResult = await decryptPII("org-1", "");
    expect(decResult).toBe("");
  });

  it("returns non-encrypted string unchanged on decrypt", async () => {
    const { decryptPII } = await import("@/lib/encryption.server");
    const result = await decryptPII("org-1", "plain text");
    expect(result).toBe("plain text");
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const { encryptPII } = await import("@/lib/encryption.server");
    const enc1 = await encryptPII("org-1", "same content");
    const enc2 = await encryptPII("org-1", "same content");
    expect(enc1).not.toBe(enc2);
  });

  it("decrypts correctly with random IV each time", async () => {
    const { encryptPII, decryptPII } = await import("@/lib/encryption.server");
    const enc1 = await encryptPII("org-1", "same content");
    const enc2 = await encryptPII("org-1", "same content");
    expect(await decryptPII("org-1", enc1)).toBe("same content");
    expect(await decryptPII("org-1", enc2)).toBe("same content");
  });
});

describe("PII Encryption - Field-level Operations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();
    mockDb.unsafe.mockResolvedValue([
      { key_hash: "field-test-hash", key_version: 1 },
    ]);
  });

  it("encryptFields encrypts specified fields only", async () => {
    const { encryptFields } = await import("@/lib/encryption.server");
    const record = {
      id: 1,
      name: "John Doe",
      intake_notes: "Patient reports chronic pain",
      phone: "254712345678",
    };

    const encrypted = await encryptFields("org-1", record, ["intake_notes"]);
    expect(encrypted.id).toBe(1);
    expect(encrypted.name).toBe("John Doe");
    expect(encrypted.phone).toBe("254712345678");
    expect(encrypted.intake_notes).toMatch(/^ENC:/);
    expect(encrypted.intake_notes).not.toBe(record.intake_notes);
  });

  it("decryptFields decrypts only encrypted fields", async () => {
    const { encryptFields, decryptFields } = await import("@/lib/encryption.server");
    const record = {
      id: 1,
      name: "John Doe",
      intake_notes: "Patient reports chronic pain",
    };

    const encrypted = await encryptFields("org-1", record, ["intake_notes"]);
    const decrypted = await decryptFields("org-1", encrypted, ["intake_notes"]);
    expect(decrypted.intake_notes).toBe("Patient reports chronic pain");
    expect(decrypted.name).toBe("John Doe");
  });

  it("skips non-string fields gracefully", async () => {
    const { encryptFields } = await import("@/lib/encryption.server");
    const record = { id: 42, count: 100, notes: "test" };
    const result = await encryptFields("org-1", record, ["id", "count", "notes"]);
    expect(result.id).toBe(42);
    expect(result.count).toBe(100);
    expect(result.notes).toMatch(/^ENC:/);
  });
});

describe("PII Encryption - Key Management", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();
  });

  it("initializes new org key when none exists", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { encryptPII } = await import("@/lib/encryption.server");
    const encrypted = await encryptPII("new-org", "test data");
    expect(encrypted).toMatch(/^ENC:/);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO org_encryption_keys"),
      expect.arrayContaining(["new-org"]),
    );
  });

  it("rotates key to next version", async () => {
    mockDb.unsafe.mockResolvedValue([{ key_version: 1, key_hash: "old-hash" }]);
    mockDb.unsafe.mockResolvedValue([{ max_version: 1 }]);

    const { rotateOrgKey } = await import("@/lib/encryption.server");
    const newVersion = await rotateOrgKey("org-1");
    expect(newVersion).toBe(2);
  });

  it("isEncrypted detects encrypted strings", async () => {
    const { isEncrypted } = await import("@/lib/encryption.server");
    expect(isEncrypted("ENC:abc123")).toBe(true);
    expect(isEncrypted("plain text")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});

describe("PII Encryption - Error Handling", () => {
  it("throws on decryption failure", async () => {
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();
    mockDb.unsafe.mockResolvedValue([{ key_hash: "hash1", key_version: 1 }]);

    const { decryptPII } = await import("@/lib/encryption.server");
    await expect(
      decryptPII("org-1", "ENC:invalid-ciphertext-data"),
    ).rejects.toThrow("Decryption failed");
  });

  it("decrypt with wrong org key fails", async () => {
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();
    mockDb.unsafe.mockResolvedValue([{ key_hash: "org-a-key", key_version: 1 }]);
    const { encryptPII } = await import("@/lib/encryption.server");
    const encrypted = await encryptPII("org-a", "secret data");

    wipeKeyCache();
    mockDb.unsafe.mockResolvedValue([{ key_hash: "org-b-key", key_version: 1 }]);
    const { decryptPII: decryptB } = await import("@/lib/encryption.server");
    await expect(decryptB("org-b", encrypted)).rejects.toThrow();
  });
});

describe("PII Encryption - wipeKeyCache", () => {
  it("clears cache without error", async () => {
    const { wipeKeyCache } = await import("@/lib/encryption.server");
    expect(() => wipeKeyCache()).not.toThrow();
  });
});
