import crypto from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
import { getSessionSecret } from "./env.server";

const SESSION_COOKIE = "kwc_session";

export interface SessionPayload {
  userId: number;
  orgId: string;
  role: string;
  exp: number;
}

export function signToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("hex")
    .slice(0, 32);
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("hex")
    .slice(0, 32);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload: SessionPayload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    );
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSession(): SessionPayload | null {
  try {
    const token = getCookie(SESSION_COOKIE);
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function getCurrentOrgId(): string | null {
  const session = getSession();
  return session?.orgId ?? null;
}

export function getCurrentUserId(): number | null {
  const session = getSession();
  return session?.userId ?? null;
}

export function getCurrentUserRole(): string | null {
  const session = getSession();
  return session?.role ?? null;
}
