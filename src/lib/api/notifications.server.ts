import { createServerFn } from "@tanstack/react-start";
import { processNotifications as runQueue } from "../queue.server";
import { requireRole, ROLES } from "../permissions.server";

export const triggerQueueProcessing = createServerFn({ method: "POST" }).handler(
  async () => {
    try { requireRole(ROLES.SUPER_ADMIN); } catch { return { status: "forbidden" as const }; }
    return await runQueue();
  },
);
