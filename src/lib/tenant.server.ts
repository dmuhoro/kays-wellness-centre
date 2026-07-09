import crypto from "node:crypto";
import { getCurrentOrgId } from "./session.server";
import { logger, EVENTS, type Logger } from "./logger.server";

export interface OrgContext {
  orgId: string;
  requestId: string;
  log: Logger;
}

export function requireOrg(): OrgContext {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = logger.child({ request_id: requestId });

  const orgId = getCurrentOrgId();
  if (!orgId) {
    log.warn("Rejecting request — no tenant context", { event: EVENTS.TENANT_MISSING });
    throw new TenantError("No tenant context — unauthorized");
  }

  return {
    orgId,
    requestId,
    log: log.child({ tenant_id: orgId }),
  };
}

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}
