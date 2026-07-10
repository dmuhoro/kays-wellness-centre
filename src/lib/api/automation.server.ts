import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { enqueueNotification } from "../queue.server";
import { logger, EVENTS } from "../logger.server";
import { sendWhatsApp, formatMessage } from "./dispatch.server";

export type AutomationStage = "UNTOUCHED" | "TRIAGING" | "SCHEDULED" | "STALLED";

export interface AutomationStateRow {
  id: number;
  lead_id: number;
  organization_id: string;
  current_stage: AutomationStage;
  last_interaction_at: string | null;
  next_action_scheduled_at: string | null;
  retry_count: number;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function ensureAutomationState(
  leadId: number,
  orgId: string,
): Promise<AutomationStateRow> {
  const db = await getDb();
  const existing = await db.unsafe<AutomationStateRow[]>(
    `SELECT * FROM automation_state WHERE lead_id = $1`,
    [leadId],
  );
  if (existing.length > 0) return existing[0];

  const rows = await db.unsafe<AutomationStateRow[]>(
    `INSERT INTO automation_state (lead_id, organization_id, current_stage, last_interaction_at)
     VALUES ($1, $2, 'UNTOUCHED', CURRENT_TIMESTAMP)
     RETURNING *`,
    [leadId, orgId],
  );
  return rows[0];
}

export async function updateAutomationStage(
  leadId: number,
  orgId: string,
  stage: AutomationStage,
  context?: Record<string, unknown>,
  nextActionAt?: Date,
): Promise<AutomationStateRow> {
  const db = await getDb();
  const rows = await db.unsafe<AutomationStateRow[]>(
    `UPDATE automation_state
     SET current_stage = $1,
         next_action_scheduled_at = $2,
         context_snapshot = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE lead_id = $4 AND organization_id = $5
     RETURNING *`,
    [
      stage,
      nextActionAt?.toISOString() ?? null,
      context ? JSON.stringify(context) : "{}",
      leadId,
      orgId,
    ],
  );
  return rows[0];
}

export async function getLeadsNeedingFollowup(
  orgId: string,
  triageTimeoutMinutes: number,
): Promise<Array<{ lead_id: number; current_stage: string; retry_count: number; last_interaction_at: string | null }>> {
  const db = await getDb();
  return db.unsafe(
    `SELECT as2.lead_id, as2.current_stage, as2.retry_count, as2.last_interaction_at
     FROM automation_state as2
     WHERE as2.organization_id = $1
       AND (
         (as2.current_stage = 'UNTOUCHED' AND as2.last_interaction_at < CURRENT_TIMESTAMP - ($2 || ' minutes')::INTERVAL)
         OR
         (as2.current_stage = 'TRIAGING' AND as2.next_action_scheduled_at IS NOT NULL AND as2.next_action_scheduled_at <= CURRENT_TIMESTAMP)
         OR
         (as2.current_stage = 'STALLED' AND as2.next_action_scheduled_at IS NOT NULL AND as2.next_action_scheduled_at <= CURRENT_TIMESTAMP)
       )
     ORDER BY as2.last_interaction_at ASC NULLS FIRST
     FOR UPDATE SKIP LOCKED`,
    [orgId, String(triageTimeoutMinutes)],
  );
}

export async function processProgressiveFollowup(
  leadId: number,
  orgId: string,
  triageTimeoutMinutes: number,
): Promise<{ action: string; dispatched: boolean }> {
  const db = await getDb();
  const [state] = await db.unsafe<AutomationStateRow[]>(
    `SELECT * FROM automation_state WHERE lead_id = $1 AND organization_id = $2 FOR UPDATE`,
    [leadId, orgId],
  );

  if (!state) {
    await ensureAutomationState(leadId, orgId);
    return { action: "initialized", dispatched: false };
  }

  const now = new Date();
  const stage = state.current_stage;

  if (stage === "UNTOUCHED") {
    const lead = await db.unsafe<Array<{ name: string; phone: string }>>(
      `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [leadId, orgId],
    );
    if (lead.length === 0) return { action: "lead_not_found", dispatched: false };

    const message = formatMessage("triage_followup", lead[0].name, lead[0].phone);
    const result = await sendWhatsApp(lead[0].phone, message);

    const nextAction = new Date(now.getTime() + triageTimeoutMinutes * 60_000);
    await updateAutomationStage(leadId, orgId, "TRIAGING", { trigger: "first_followup" }, nextAction);

    await enqueueNotification({
      orgId,
      leadId,
      eventType: "msg_triage_followup",
      payload: { phone: lead[0].phone, automation: true, stage: "UNTOUCHED" },
    });

    logger.info("Automation: first followup sent", {
      event: EVENTS.AUTOMATION_FOLLOWUP,
      leadId,
      stage: "UNTOUCHED",
      dispatched: result.success,
    });

    return { action: "first_followup", dispatched: result.success };
  }

  if (stage === "TRIAGING") {
    if (state.retry_count >= 2) {
      const nextAction = new Date(now.getTime() + triageTimeoutMinutes * 4 * 60_000);
      await updateAutomationStage(leadId, orgId, "STALLED", { trigger: "max_retries" }, nextAction);

      logger.info("Automation: moved to STALLED", {
        event: EVENTS.AUTOMATION_STALLED,
        leadId,
        retryCount: state.retry_count,
      });

      return { action: "stalled", dispatched: false };
    }

    const lead = await db.unsafe<Array<{ name: string; phone: string }>>(
      `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [leadId, orgId],
    );
    if (lead.length === 0) return { action: "lead_not_found", dispatched: false };

    const message = formatMessage("triage_followup", lead[0].name, lead[0].phone);
    const result = await sendWhatsApp(lead[0].phone, message);

    const nextAction = new Date(now.getTime() + triageTimeoutMinutes * 60_000);
    await db.unsafe(
      `UPDATE automation_state
       SET retry_count = retry_count + 1,
           next_action_scheduled_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE lead_id = $2 AND organization_id = $3`,
      [nextAction.toISOString(), leadId, orgId],
    );

    await enqueueNotification({
      orgId,
      leadId,
      eventType: "msg_triage_followup",
      payload: { phone: lead[0].phone, automation: true, stage: "TRIAGING", retry: state.retry_count + 1 },
    });

    logger.info("Automation: triage followup retry sent", {
      event: EVENTS.AUTOMATION_FOLLOWUP,
      leadId,
      retry: state.retry_count + 1,
    });

    return { action: "retry_followup", dispatched: result.success };
  }

  if (stage === "STALLED") {
    const lead = await db.unsafe<Array<{ name: string; phone: string }>>(
      `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [leadId, orgId],
    );
    if (lead.length === 0) return { action: "lead_not_found", dispatched: false };

    const message = formatMessage("reminder", lead[0].name, lead[0].phone);
    const result = await sendWhatsApp(lead[0].phone, message);

    const nextAction = new Date(now.getTime() + triageTimeoutMinutes * 4 * 60_000);
    await db.unsafe(
      `UPDATE automation_state
       SET retry_count = retry_count + 1,
           next_action_scheduled_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE lead_id = $2 AND organization_id = $3`,
      [nextAction.toISOString(), leadId, orgId],
    );

    await enqueueNotification({
      orgId,
      leadId,
      eventType: "msg_reminder",
      payload: { phone: lead[0].phone, automation: true, stage: "STALLED" },
    });

    logger.info("Automation: re-engagement nudge sent", {
      event: EVENTS.AUTOMATION_FOLLOWUP,
      leadId,
      stage: "STALLED",
    });

    return { action: "re_engagement", dispatched: result.success };
  }

  return { action: "noop", dispatched: false };
}

export async function runAutomationOrchestrator(orgId: string): Promise<{
  processed: number;
  dispatched: number;
  errors: number;
}> {
  const db = await getDb();
  const [config] = await db.unsafe<Array<{ triage_timeout_minutes: number }>>(
    `SELECT triage_timeout_minutes FROM clinic_configuration WHERE organization_id = $1`,
    [orgId],
  );
  const timeout = config?.triage_timeout_minutes ?? 45;

  const candidates = await getLeadsNeedingFollowup(orgId, timeout);

  let processed = 0;
  let dispatched = 0;
  let errors = 0;

  for (const c of candidates) {
    try {
      const result = await processProgressiveFollowup(c.lead_id, orgId, timeout);
      processed++;
      if (result.dispatched) dispatched++;
    } catch (err) {
      logger.error("Automation orchestrator: step failed", {
        event: EVENTS.AUTOMATION_ORCHESTRATOR_RUN,
        leadId: c.lead_id,
        error: (err as Error).message,
      });
      errors++;
    }
  }

  logger.info("Automation orchestrator run complete", {
    event: EVENTS.AUTOMATION_ORCHESTRATOR_RUN,
    orgId: orgId.slice(0, 8),
    processed,
    dispatched,
    errors,
  });

  return { processed, dispatched, errors };
}

export const triggerAutomation = createServerFn({ method: "POST" })
  .handler(async () => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };
    const { orgId } = requireOrg();
    const result = await runAutomationOrchestrator(orgId);
    return { status: "ok", ...result };
  });
