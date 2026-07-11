import "../lib/env.server";
import { getDb, ensureSchema } from "../lib/db.server";
import { ensureQueueSchema } from "../lib/queue.server";
import { ensureAuditSchema } from "../lib/audit.server";
import { ensureLiveEventsSchema } from "../lib/event-bus.server";
import { hydrateOrganization, validateSeedData } from "../lib/seed.server";
import { logger, EVENTS } from "../lib/logger.server";

async function hydrate() {
  logger.info("DB hydrate started", { event: EVENTS.DB_HYDRATE_STARTED });

  const validation = validateSeedData();
  if (!validation.valid) {
    logger.error("Seed data validation failed", {
      event: EVENTS.DB_HYDRATE_STARTED,
      errors: validation.errors.join("; "),
    });
    process.exit(1);
  }

  const schemaOk = await ensureSchema(true);
  if (!schemaOk) {
    logger.error("Schema setup failed", { event: EVENTS.DB_HYDRATE_STARTED });
    process.exit(1);
  }

  await ensureQueueSchema();
  await ensureAuditSchema();
  await ensureLiveEventsSchema();

  const db = await getDb();
  const orgs = await db.unsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM organizations`,
  );

  if (orgs.length === 0) {
    logger.info("No organizations found — seeding skipped", {
      event: EVENTS.DB_HYDRATE_COMPLETED,
    });
    console.log("\n  No organizations found. Register one at /register and re-run `npm run db:hydrate`.\n");
    return;
  }

  for (const org of orgs) {
    await hydrateOrganization(db, org.id);
    logger.info(`Organization hydrated`, {
      event: EVENTS.DB_HYDRATE_COMPLETED,
      tenant_id: org.id,
      orgName: org.name,
    });
  }

  logger.info("DB hydrate completed", {
    event: EVENTS.DB_HYDRATE_COMPLETED,
    orgCount: orgs.length,
  });
  console.log(`\n  ✓ Hydration complete — ${orgs.length} organization(s) seeded.\n`);
}

hydrate().catch((err) => {
  logger.error("Hydrate script failed", {
    event: EVENTS.DB_HYDRATE_STARTED,
    error: (err as Error).message,
  });
  process.exit(1);
});
