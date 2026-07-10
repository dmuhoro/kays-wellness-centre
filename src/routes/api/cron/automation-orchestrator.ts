import { eventHandler, setResponseStatus, getHeader, createError } from "h3";
import { getDb } from "@/lib/db.server";
import { logger, EVENTS } from "@/lib/logger.server";
import { runAutomationOrchestrator } from "@/lib/api/automation.server";

const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

export const GET = eventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const db = await getDb();
  const orgs = await db.unsafe<Array<{ id: string }>>(
    `SELECT id FROM organizations`,
  );

  let totalProcessed = 0;
  let totalDispatched = 0;
  let totalErrors = 0;

  for (const org of orgs) {
    try {
      const result = await runAutomationOrchestrator(org.id);
      totalProcessed += result.processed;
      totalDispatched += result.dispatched;
      totalErrors += result.errors;
    } catch (err) {
      logger.error("Automation orchestrator: org run failed", {
        event: EVENTS.AUTOMATION_ORCHESTRATOR_RUN,
        orgId: org.id.slice(0, 8),
        error: (err as Error).message,
      });
      totalErrors++;
    }
  }

  logger.info("Automation orchestrator global run complete", {
    event: EVENTS.AUTOMATION_ORCHESTRATOR_RUN,
    orgsProcessed: orgs.length,
    totalProcessed,
    totalDispatched,
    totalErrors,
  });

  setResponseStatus(event, 200);
  return {
    status: "ok",
    orgsProcessed: orgs.length,
    totalProcessed,
    totalDispatched,
    totalErrors,
  };
});
