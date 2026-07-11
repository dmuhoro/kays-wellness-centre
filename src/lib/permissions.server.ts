import { getCurrentUserRole } from "./session.server";
import { requireOrg, TenantError } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  CLINIC_OWNER: "admin",
  CLINIC_STAFF: "staff",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.SUPER_ADMIN]: 100,
  [ROLES.CLINIC_OWNER]: 50,
  [ROLES.CLINIC_STAFF]: 10,
};

export function roleAtLeast(userRole: string, minimumRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as Role] ?? 0;
  const minLevel = ROLE_HIERARCHY[minimumRole];
  return userLevel >= minLevel;
}

export function requireRole(...allowedRoles: Role[]): void {
  const { log } = requireOrg();
  const role = getCurrentUserRole();
  if (!role) {
    log.warn("Rejecting request — no authenticated user", {
      event: EVENTS.PERMISSION_DENIED,
      requiredRoles: allowedRoles,
    });
    throw new TenantError("Authentication required");
  }
  if (!allowedRoles.includes(role as Role)) {
    log.warn("Rejecting request — insufficient role", {
      event: EVENTS.PERMISSION_DENIED,
      userRole: role,
      requiredRoles: allowedRoles,
    });
    throw new TenantError("Insufficient permissions — contact your clinic owner");
  }
}

export function canAccessFinance(role: string | null): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.CLINIC_OWNER;
}

export function canAccessDataExport(role: string | null): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.CLINIC_OWNER;
}

export function canDeleteData(role: string | null): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.CLINIC_OWNER;
}

export function canAccessAdminSettings(role: string | null): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.CLINIC_OWNER;
}
