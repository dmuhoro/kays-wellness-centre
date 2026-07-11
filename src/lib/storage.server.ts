import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger, EVENTS } from "./logger.server";

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./.storage";
const ALLOWED_TYPES = new Set(["image", "document", "audio", "diagnostic"]);

export interface StoredFile {
  path: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

function orgDir(orgId: string): string {
  return path.join(STORAGE_ROOT, `org-${orgId}`);
}

function typeDir(orgId: string, fileType: string): string {
  return path.join(orgDir(orgId), fileType);
}

export function validateFileType(fileType: string): void {
  if (!ALLOWED_TYPES.has(fileType)) {
    throw new Error(`Invalid file type "${fileType}". Allowed: ${[...ALLOWED_TYPES].join(", ")}`);
  }
}

export function generateStoragePath(orgId: string, fileType: string, originalName: string): string {
  validateFileType(fileType);
  const ext = path.extname(originalName) || "";
  const uniqueName = `${crypto.randomUUID()}${ext}`;
  const relativePath = `org-${orgId}/${fileType}/${uniqueName}`;
  return relativePath;
}

export async function storeFile(
  orgId: string,
  fileType: string,
  originalName: string,
  buffer: Buffer,
): Promise<StoredFile> {
  validateFileType(fileType);

  const relativePath = generateStoragePath(orgId, fileType, originalName);
  const fullPath = path.join(STORAGE_ROOT, relativePath);

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    logger.info("File stored", {
      event: EVENTS.STORAGE_FILE_STORED,
      tenant_id: orgId,
      fileType,
      originalName,
      sizeBytes: buffer.length,
    });

    return {
      path: relativePath,
      url: `/api/storage/${relativePath}`,
      originalName,
      mimeType: guessMimeType(extname(originalName)),
      sizeBytes: buffer.length,
    };
  } catch (err) {
    logger.error("File storage failed", {
      event: EVENTS.STORAGE_FILE_FAILED,
      error: (err as Error).message,
    });
    throw err;
  }
}

export async function readFile(relativePath: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(STORAGE_ROOT, relativePath);
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export async function deleteFile(relativePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(STORAGE_ROOT, relativePath);
    await fs.unlink(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(STORAGE_ROOT, relativePath);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

function extname(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i) : "";
}

function guessMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
  };
  return mimeMap[ext.toLowerCase()] || "application/octet-stream";
}
