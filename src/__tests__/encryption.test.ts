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

describe("PII Encryption - Key Rotation Mid-Write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("data encrypted under v1 key decrypts successfully after rotation to v2", async () => {
    const { encryptPII, decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Encrypt with key v1
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-passphrase-hash", key_version: 1 }]);
    const encrypted = await encryptPII("org-1", "sensitive patient data");
    expect(encrypted).toMatch(/^ENC:/);

    // Rotate key to v2
    const { rotateOrgKey } = await import("@/lib/encryption.server");
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ max_version: 1 }]);
    mockDb.unsafe.mockResolvedValueOnce([]);
    const newVersion = await rotateOrgKey("org-1");
    expect(newVersion).toBe(2);

    // Wipe cache — simulates TTL expiry; v2 is now the active key
    wipeKeyCache();

    // Mock: getKeyByVersion("org-1", 1) fetches the retired v1 key from the store
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-passphrase-hash", key_version: 1 }]);

    // Decrypt succeeds — reads payload.keyVersion=1, fetches v1 key, not the active v2
    const decrypted = await decryptPII("org-1", encrypted);
    expect(decrypted).toBe("sensitive patient data");
  });

  it("full round-trip across both pre-rotation and post-rotation ciphertexts", async () => {
    const { encryptPII, decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Encrypt with v1
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);
    const encV1 = await encryptPII("org-1", "old data");

    // Rotate to v2
    const { rotateOrgKey } = await import("@/lib/encryption.server");
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ max_version: 1 }]);
    mockDb.unsafe.mockResolvedValueOnce([]);
    await rotateOrgKey("org-1");
    wipeKeyCache();

    // Encrypt new data with v2 (getActiveKey fetches v2)
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v2-hash", key_version: 2 }]);
    const encV2 = await encryptPII("org-1", "new data");

    // Decrypt v2 — cache hit from encryptPII call above
    const decryptedV2 = await decryptPII("org-1", encV2);
    expect(decryptedV2).toBe("new data");

    // Decrypt v1 — wipe cache, then getKeyByVersion("org-1", 1) fetches retired v1 key
    wipeKeyCache();
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);
    const decryptedV1 = await decryptPII("org-1", encV1);
    expect(decryptedV1).toBe("old data");
  });

  it("payload.keyVersion selects the correct historical key, not the active key", async () => {
    const { encryptPII, decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Encrypt with v1
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);
    const encrypted = await encryptPII("org-1", "audit me");

    // Verify keyVersion is embedded in the payload
    const payload = JSON.parse(encrypted.slice(4));
    expect(payload.keyVersion).toBe(1);

    // Rotate to v2
    const { rotateOrgKey } = await import("@/lib/encryption.server");
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ max_version: 1 }]);
    mockDb.unsafe.mockResolvedValueOnce([]);
    await rotateOrgKey("org-1");
    wipeKeyCache();

    // Mock v1 key for getKeyByVersion("org-1", 1)
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);

    // Decrypt succeeds — payload.keyVersion=1 causes fetch of v1, not active v2
    const decrypted = await decryptPII("org-1", encrypted);
    expect(decrypted).toBe("audit me");
  });

  it("regression: v1 ciphertext must not require v1 to be the active key", async () => {
    const { encryptPII, decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Encrypt with v1
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);
    const encrypted = await encryptPII("org-1", "regression payload");

    // Rotate to v2 — v1 is now retired (active=false), v2 is active
    const { rotateOrgKey } = await import("@/lib/encryption.server");
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ max_version: 1 }]);
    mockDb.unsafe.mockResolvedValueOnce([]);
    await rotateOrgKey("org-1");
    wipeKeyCache();

    // getKeyByVersion("org-1", 1) queries the retired v1 row directly
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v1-hash", key_version: 1 }]);

    // This MUST succeed — the old key is still in the store, just inactive
    const decrypted = await decryptPII("org-1", encrypted);
    expect(decrypted).toBe("regression payload");

    // Confirm that active key is v2, not v1
    wipeKeyCache();
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "v2-hash", key_version: 2 }]);
    const { getActiveKey } = await import("@/lib/encryption.server");
    // getActiveKey is not exported — verify via encrypt (which uses getActiveKey)
    const encV2 = await encryptPII("org-1", "v2 only");
    const v2Payload = JSON.parse(encV2.slice(4));
    expect(v2Payload.keyVersion).toBe(2);
  });
});

describe("PII Encryption - Missing Org Key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no key exists and DB initialization fails", async () => {
    const { encryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // SELECT returns empty (no key for this org), INSERT fails
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockRejectedValueOnce(new Error("relation \"org_encryption_keys\" does not exist"));

    await expect(encryptPII("orphan-org", "sensitive data")).rejects.toThrow();
  });

  it("throws decryption error when key version referenced in payload does not exist", async () => {
    const { decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Payload references key version 99, which doesn't exist in the store
    mockDb.unsafe.mockResolvedValueOnce([]);

    const fakePayload = JSON.stringify({ iv: "aa", tag: "bb", data: "cc", keyVersion: 99 });
    await expect(decryptPII("orphan-org", `ENC:${fakePayload}`)).rejects.toThrow("Decryption failed");
  });

  it("throws when key version was purged from store after data was encrypted", async () => {
    const { encryptPII, decryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // Set up key and encrypt
    mockDb.unsafe.mockResolvedValueOnce([{ key_hash: "temp-hash", key_version: 1 }]);
    const encrypted = await encryptPII("doomed-org", "will be lost forever");

    wipeKeyCache();

    // Key version row deleted from DB — getKeyByVersion("doomed-org", 1) returns empty
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([]);

    await expect(decryptPII("doomed-org", encrypted)).rejects.toThrow("Decryption failed");
  });

  it("auto-initializes key for new org on first encrypt", async () => {
    const { encryptPII, wipeKeyCache } = await import("@/lib/encryption.server");
    wipeKeyCache();

    // No existing key, INSERT succeeds
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const encrypted = await encryptPII("brand-new-org", "first contact PII");
    expect(encrypted).toMatch(/^ENC:/);

    // Verify INSERT INTO org_encryption_keys was called (second db.unsafe call)
    const allCalls = mockDb.unsafe.mock.calls;
    expect(allCalls).toHaveLength(2);
    expect(allCalls[1][0]).toContain("INSERT INTO org_encryption_keys");
    expect(allCalls[1][1]).toContain("brand-new-org");
  });
});
