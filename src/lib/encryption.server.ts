import crypto from "node:crypto";
import { getDb } from "./db.server";
import { logger, EVENTS } from "./logger.server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "kays-wellness-pii-v1";

export interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
  keyVersion: number;
}

let orgKeyCache = new Map<string, { key: Buffer; version: number; ts: number }>();
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

function deriveKey(orgId: string, passphrase: string, version: number): Buffer {
  return crypto.scryptSync(
    `${orgId}:${passphrase}:v${version}`,
    SALT,
    KEY_LENGTH,
  );
}

async function getActiveKey(orgId: string): Promise<{ key: Buffer; version: number }> {
  const cached = orgKeyCache.get(orgId);
  if (cached && Date.now() - cached.ts < KEY_CACHE_TTL_MS) {
    return { key: cached.key, version: cached.version };
  }

  const db = await getDb();
  const rows = await db.unsafe<Array<{ key_hash: string; key_version: number }>>(
    `SELECT key_hash, key_version FROM org_encryption_keys
     WHERE organization_id = $1 AND active = true
     ORDER BY key_version DESC LIMIT 1`,
    [orgId],
  );

  if (rows.length === 0) {
    return initializeOrgKey(orgId);
  }

  const key = deriveKey(orgId, rows[0].key_hash, rows[0].key_version);
  orgKeyCache.set(orgId, { key, version: rows[0].key_version, ts: Date.now() });
  return { key, version: rows[0].key_version };
}

async function initializeOrgKey(orgId: string): Promise<{ key: Buffer; version: number }> {
  const db = await getDb();
  const passphrase = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(passphrase).digest("hex");

  await db.unsafe(
    `INSERT INTO org_encryption_keys (organization_id, key_version, key_hash, active)
     VALUES ($1, 1, $2, true)
     ON CONFLICT (organization_id, key_version) DO NOTHING`,
    [orgId, keyHash],
  );

  const key = deriveKey(orgId, keyHash, 1);
  orgKeyCache.set(orgId, { key, version: 1, ts: Date.now() });

  logger.info("Organization encryption key initialized", {
    event: EVENTS.PII_ENCRYPTED,
    orgId,
    keyVersion: 1,
  });

  return { key, version: 1 };
}

export async function encryptPII(orgId: string, plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  const { key, version } = await getActiveKey(orgId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
    keyVersion: version,
  };

  return `ENC:${JSON.stringify(payload)}`;
}

export async function decryptPII(orgId: string, ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith("ENC:")) return ciphertext;

  try {
    const payload: EncryptedPayload = JSON.parse(ciphertext.slice(4));
    const { key } = await getActiveKey(orgId);

    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const encryptedData = Buffer.from(payload.data, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    logger.error("PII decryption failed", {
      event: EVENTS.PII_ENCRYPT_FAILED,
      orgId,
      error: (err as Error).message,
    });
    throw new Error("Decryption failed: invalid ciphertext or key");
  }
}

export async function encryptFields<T extends Record<string, unknown>>(
  orgId: string,
  record: T,
  fields: (keyof T)[],
): Promise<T> {
  const result = { ...record };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && val) {
      result[field] = (await encryptPII(orgId, val)) as T[keyof T];
    }
  }
  return result;
}

export async function decryptFields<T extends Record<string, unknown>>(
  orgId: string,
  record: T,
  fields: (keyof T)[],
): Promise<T> {
  const result = { ...record };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && val.startsWith("ENC:")) {
      result[field] = (await decryptPII(orgId, val)) as T[keyof T];
    }
  }
  return result;
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("ENC:");
}

export async function rotateOrgKey(orgId: string): Promise<number> {
  const db = await getDb();

  await db.unsafe(
    `UPDATE org_encryption_keys SET active = false WHERE organization_id = $1`,
    [orgId],
  );

  const passphrase = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(passphrase).digest("hex");

  const existing = await db.unsafe<Array<{ max_version: number | null }>>(
    `SELECT MAX(key_version) AS max_version FROM org_encryption_keys WHERE organization_id = $1`,
    [orgId],
  );
  const nextVersion = (existing[0]?.max_version ?? 0) + 1;

  await db.unsafe(
    `INSERT INTO org_encryption_keys (organization_id, key_version, key_hash, active)
     VALUES ($1, $2, $3, true)`,
    [orgId, nextVersion, keyHash],
  );

  orgKeyCache.delete(orgId);

  logger.info("Organization encryption key rotated", {
    event: EVENTS.CONFIG_UPDATED,
    orgId,
    keyVersion: nextVersion,
  });

  return nextVersion;
}

export function wipeKeyCache(): void {
  orgKeyCache.clear();
}
