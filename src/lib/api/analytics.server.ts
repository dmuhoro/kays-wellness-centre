import { createServerFn } from "@tanstack/react-start";
import { computeAnalytics } from "../analytics.server";
import { isDbAvailable, getConnectionError } from "../db.server";
import { logger, EVENTS } from "../logger.server";

export const getAnalytics = createServerFn({ method: "GET" }).handler(async () => {
  if (!isDbAvailable()) {
    const reason = getConnectionError() || "Database unavailable";
    logger.warn("DB unavailable for analytics", {
      event: EVENTS.DB_UNAVAILABLE,
      error: reason,
    });
    return { status: "db_unavailable" as const, data: null };
  }

  try {
    const data = await computeAnalytics();
    return { status: "ok" as const, data };
  } catch (err) {
    logger.error("Analytics computation failed", {
      event: EVENTS.ANALYTICS_COMPUTED,
      error: (err as Error).message,
    });
    return { status: "error" as const, data: null };
  }
});
