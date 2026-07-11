import { eventHandler, setResponseStatus } from "h3";
import { isDbAvailable, getConnectionError } from "@/lib/db.server";
import { logger, EVENTS, startTimer } from "@/lib/logger.server";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  dbAvailable: boolean;
  dbError: string | null;
  queueStatus: string;
  timestamp: string;
  uptime: number;
}

export const GET = eventHandler(async (event) => {
  const timer = startTimer();
  const dbAvailable = isDbAvailable();
  const dbError = getConnectionError();

  const status: HealthResponse["status"] = dbAvailable ? "healthy" : "unhealthy";

  const response: HealthResponse = {
    status,
    dbAvailable,
    dbError,
    queueStatus: dbAvailable ? "operational" : "unavailable",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  logger.info("Health check", {
    event: EVENTS.DB_UNAVAILABLE,
    executionTimeMs: timer.end(),
  });

  try {
    if (!dbAvailable) {
      setResponseStatus(event, 503);
    }
  } catch {}

  return response;
});
