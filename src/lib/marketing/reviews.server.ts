import { getDb, isDbAvailable } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { publishEvent } from "../event-bus.server";
import { recordAudit } from "../audit.server";
import { getSession } from "../session.server";

// ── Types ────────────────────────────────────────────────────────────

export type FeedbackSentiment = "positive" | "neutral" | "negative";

export type ReviewPlatform = "google" | "internal" | "referral";

export interface SatisfactionPrompt {
  id: number;
  orgId: string;
  invoiceId: number;
  leadId: number;
  leadName: string;
  phone: string | null;
  message: string;
  status: "pending" | "sent" | "responded" | "expired";
  sentiment: FeedbackSentiment | null;
  npsScore: number | null;
  reviewSubmitted: boolean;
  createdAt: string;
  respondedAt: string | null;
}

export interface FeedbackResponse {
  id: number;
  promptId: number;
  orgId: string;
  leadId: number;
  npsScore: number;
  sentiment: FeedbackSentiment;
  comment: string | null;
  reviewSubmitted: boolean;
  platform: ReviewPlatform;
  createdAt: string;
}

export interface ReviewSubmission {
  id: number;
  orgId: string;
  feedbackId: number;
  leadId: number;
  platform: ReviewPlatform;
  reviewUrl: string | null;
  status: "pending" | "submitted" | "failed" | "approved";
  submittedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReputationMetrics {
  orgId: string;
  totalFeedback: number;
  averageNps: number;
  npsPromoters: number;
  npsPassives: number;
  npsDetractors: number;
  npsScore: number;
  positiveRate: number;
  reviewsSubmitted: number;
  reviewsApproved: number;
}

export interface ReviewGuardConfig {
  orgId: string;
  enabled: boolean;
  autoSendAfterPayment: boolean;
  npsThresholdForReview: number;
  reviewPlatform: ReviewPlatform;
  customMessage: string | null;
  cooldownDays: number;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_SATISFACTION_MESSAGE =
  "Hi {{name}}, thank you for visiting Kay's Wellness Centre! How was your experience? Rate us 1-10 (10 = amazing):";

const DEFAULT_REVIEW_PROMPT =
  "We're glad you had a great experience! Would you mind sharing a quick review on Google? It helps other patients find us: {{reviewUrl}}";

const NPS_PROMOTER_THRESHOLD = 9;
const NPS_PASSIVE_THRESHOLD = 7;
const DEFAULT_COOLDOWN_DAYS = 30;

// ── Sentiment Classification ─────────────────────────────────────────

export function classifySentiment(npsScore: number): FeedbackSentiment {
  if (npsScore >= NPS_PROMOTER_THRESHOLD) return "positive";
  if (npsScore >= NPS_PASSIVE_THRESHOLD) return "neutral";
  return "negative";
}

export function computeNpsScore(responses: Array<{ npsScore: number }>): number {
  if (responses.length === 0) return 0;
  const promoters = responses.filter((r) => r.npsScore >= NPS_PROMOTER_THRESHOLD).length;
  const detractors = responses.filter((r) => r.npsScore < NPS_PASSIVE_THRESHOLD).length;
  return Math.round(((promoters - detractors) / responses.length) * 100);
}

// ── Core Functions ───────────────────────────────────────────────────

export async function sendSatisfactionPrompt(
  orgId: string,
  invoiceId: number,
  leadId: number,
): Promise<SatisfactionPrompt> {
  const db = await getDb();

  const [lead] = await db.unsafe<Array<{ name: string; phone: string | null }>>(
    `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
    [leadId, orgId],
  );
  if (!lead) throw new Error("Lead not found");

  // Check cooldown — don't spam recently prompted leads
  const [recent] = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM satisfaction_prompts
     WHERE organization_id = $1 AND lead_id = $2
       AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
     LIMIT 1`,
    [orgId, leadId],
  );
  if (recent) {
    logger.info("Satisfaction prompt skipped (cooldown)", {
      event: EVENTS.NOTIFICATION_IDEMPOTENCY_SKIP,
      orgId,
      leadId,
      invoiceId,
    });
    // Return a synthetic "already prompted" object
    return {
      id: recent.id,
      orgId,
      invoiceId,
      leadId,
      leadName: lead.name,
      phone: lead.phone,
      message: "",
      status: "sent",
      sentiment: null,
      npsScore: null,
      reviewSubmitted: false,
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
  }

  const message = DEFAULT_SATISFACTION_MESSAGE.replace("{{name}}", lead.name);

  const [row] = await db.unsafe<Array<{
    id: number;
    created_at: string;
  }>>(
    `INSERT INTO satisfaction_prompts
       (organization_id, invoice_id, lead_id, message, status)
     VALUES ($1, $2, $3, $4, 'sent')
     RETURNING id, created_at`,
    [orgId, invoiceId, leadId, message],
  );

  const prompt: SatisfactionPrompt = {
    id: row.id,
    orgId,
    invoiceId,
    leadId,
    leadName: lead.name,
    phone: lead.phone,
    message,
    status: "sent",
    sentiment: null,
    npsScore: null,
    reviewSubmitted: false,
    createdAt: row.created_at,
    respondedAt: null,
  };

  publishEvent(orgId, "satisfaction:prompt_sent", {
    promptId: prompt.id,
    leadId,
    invoiceId,
  }).catch(() => {});

  const session = getSession();
  recordAudit({
    orgId,
    userId: session?.userId ?? null,
    actionType: "CONFIG_CHANGED",
    targetType: "satisfaction_prompt",
    targetId: String(row.id),
    metadata: { leadId, invoiceId },
  }).catch(() => {});

  logger.info("Satisfaction prompt sent", {
    event: EVENTS.NOTIFICATION_DISPATCHED,
    orgId,
    leadId,
    invoiceId,
    promptId: row.id,
  });

  return prompt;
}

export async function processFeedbackResponse(
  promptId: number,
  orgId: string,
  npsScore: number,
  comment?: string,
): Promise<FeedbackResponse> {
  const db = await getDb();

  if (npsScore < 0 || npsScore > 10) throw new Error("NPS score must be 0-10");

  const [prompt] = await db.unsafe<Array<{ lead_id: number }>>(
    `SELECT lead_id FROM satisfaction_prompts WHERE id = $1 AND organization_id = $2`,
    [promptId, orgId],
  );
  if (!prompt) throw new Error("Prompt not found");

  const sentiment = classifySentiment(npsScore);
  const reviewSubmitted = npsScore >= NPS_PROMOTER_THRESHOLD;

  // Update the prompt
  await db.unsafe(
    `UPDATE satisfaction_prompts
     SET status = 'responded', sentiment = $1, nps_score = $2, review_submitted = $3, responded_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND organization_id = $5`,
    [sentiment, npsScore, reviewSubmitted, promptId, orgId],
  );

  // Store feedback response
  const [row] = await db.unsafe<Array<{
    id: number;
    created_at: string;
  }>>(
    `INSERT INTO feedback_responses
       (prompt_id, organization_id, lead_id, nps_score, sentiment, comment, review_submitted, platform)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'internal')
     RETURNING id, created_at`,
    [promptId, orgId, prompt.lead_id, npsScore, sentiment, comment ?? null, reviewSubmitted],
  );

  const response: FeedbackResponse = {
    id: row.id,
    promptId,
    orgId,
    leadId: prompt.lead_id,
    npsScore,
    sentiment,
    comment: comment ?? null,
    reviewSubmitted,
    platform: "internal",
    createdAt: row.created_at,
  };

  publishEvent(orgId, "satisfaction:feedback_received", {
    responseId: row.id,
    promptId,
    npsScore,
    sentiment,
    reviewSubmitted,
  }).catch(() => {});

  // Auto-submit positive reviews
  if (reviewSubmitted) {
    await autoSubmitReview(orgId, row.id, prompt.lead_id, npsScore, comment);
  }

  logger.info("Feedback response processed", {
    event: EVENTS.INTERACTION_RECORDED,
    orgId,
    promptId,
    npsScore,
    sentiment,
    reviewSubmitted,
  });

  return response;
}

async function autoSubmitReview(
  orgId: string,
  feedbackId: number,
  leadId: number,
  npsScore: number,
  comment?: string,
): Promise<void> {
  const db = await getDb();

  const reviewUrl = `https://g.page/kays-wellness/review?org=${orgId}`;

  const [row] = await db.unsafe<Array<{ id: number; created_at: string }>>(
    `INSERT INTO review_submissions
       (organization_id, feedback_id, lead_id, platform, review_url, status, metadata)
     VALUES ($1, $2, $3, 'google', $4, 'pending', $5)
     RETURNING id, created_at`,
    [orgId, feedbackId, leadId, reviewUrl, JSON.stringify({ npsScore, comment })],
  );

  publishEvent(orgId, "review:auto_submitted", {
    submissionId: row.id,
    leadId,
    platform: "google",
  }).catch(() => {});

  logger.info("Review auto-submitted", {
    event: EVENTS.INTERACTION_RECORDED,
    orgId,
    feedbackId,
    leadId,
    platform: "google",
  });
}

export async function getReputationMetrics(orgId: string): Promise<ReputationMetrics> {
  if (!isDbAvailable()) {
    return {
      orgId,
      totalFeedback: 0,
      averageNps: 0,
      npsPromoters: 0,
      npsPassives: 0,
      npsDetractors: 0,
      npsScore: 0,
      positiveRate: 0,
      reviewsSubmitted: 0,
      reviewsApproved: 0,
    };
  }

  const db = await getDb();

  const [feedbackStats] = await db.unsafe<Array<{
    total: string;
    avg_nps: string | null;
    promoters: string;
    passives: string;
    detractors: string;
    positive_count: string;
  }>>(
    `SELECT
       COUNT(*)::text AS total,
       ROUND(AVG(nps_score)::numeric, 1) AS avg_nps,
       COUNT(*) FILTER (WHERE nps_score >= 9)::text AS promoters,
       COUNT(*) FILTER (WHERE nps_score >= 7 AND nps_score < 9)::text AS passives,
       COUNT(*) FILTER (WHERE nps_score < 7)::text AS detractors,
       COUNT(*) FILTER (WHERE sentiment = 'positive')::text AS positive_count
     FROM feedback_responses
     WHERE organization_id = $1`,
    [orgId],
  );

  const [reviewStats] = await db.unsafe<Array<{
    submitted: string;
    approved: string;
  }>>(
    `SELECT
       COUNT(*)::text AS submitted,
       COUNT(*) FILTER (WHERE status = 'approved')::text AS approved
     FROM review_submissions
     WHERE organization_id = $1`,
    [orgId],
  );

  const total = parseInt(feedbackStats?.total ?? "0", 10);
  const promoters = parseInt(feedbackStats?.promoters ?? "0", 10);
  const passives = parseInt(feedbackStats?.passives ?? "0", 10);
  const detractors = parseInt(feedbackStats?.detractors ?? "0", 10);
  const positiveCount = parseInt(feedbackStats?.positive_count ?? "0", 10);

  return {
    orgId,
    totalFeedback: total,
    averageNps: Number(feedbackStats?.avg_nps ?? 0),
    npsPromoters: promoters,
    npsPassives: passives,
    npsDetractors: detractors,
    npsScore: total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0,
    positiveRate: total > 0 ? Math.round((positiveCount / total) * 10000) / 100 : 0,
    reviewsSubmitted: parseInt(reviewStats?.submitted ?? "0", 10),
    reviewsApproved: parseInt(reviewStats?.approved ?? "0", 10),
  };
}

export async function getReviewGuardConfig(orgId: string): Promise<ReviewGuardConfig> {
  if (!isDbAvailable()) {
    return {
      orgId,
      enabled: true,
      autoSendAfterPayment: true,
      npsThresholdForReview: 9,
      reviewPlatform: "google",
      customMessage: null,
      cooldownDays: DEFAULT_COOLDOWN_DAYS,
    };
  }

  const db = await getDb();
  const [config] = await db.unsafe<Array<{
    review_guard_enabled: boolean;
    auto_send_satisfaction: boolean;
    nps_review_threshold: number;
    review_platform: string;
    custom_satisfaction_message: string | null;
    satisfaction_cooldown_days: number;
  }>>(
    `SELECT review_guard_enabled, auto_send_satisfaction, nps_review_threshold,
            review_platform, custom_satisfaction_message, satisfaction_cooldown_days
     FROM review_guard_config
     WHERE organization_id = $1`,
    [orgId],
  );

  if (!config) {
    return {
      orgId,
      enabled: true,
      autoSendAfterPayment: true,
      npsThresholdForReview: 9,
      reviewPlatform: "google",
      customMessage: null,
      cooldownDays: DEFAULT_COOLDOWN_DAYS,
    };
  }

  return {
    orgId,
    enabled: config.review_guard_enabled,
    autoSendAfterPayment: config.auto_send_satisfaction,
    npsThresholdForReview: config.nps_review_threshold,
    reviewPlatform: config.review_platform as ReviewPlatform,
    customMessage: config.custom_satisfaction_message,
    cooldownDays: config.satisfaction_cooldown_days,
  };
}

export async function getSatisfactionPrompts(
  orgId: string,
  options: { limit?: number; status?: string } = {},
): Promise<SatisfactionPrompt[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  const limit = options.limit ?? 50;
  const conditions = ["sp.organization_id = $1"];
  const params: string[] = [orgId];
  let idx = 2;

  if (options.status) {
    conditions.push(`sp.status = $${idx++}`);
    params.push(options.status);
  }

  return db.unsafe<SatisfactionPrompt[]>(
    `SELECT sp.id, sp.organization_id AS orgId, sp.invoice_id AS invoiceId,
            sp.lead_id AS leadId, cl.name AS leadName, cl.phone,
            sp.message, sp.status, sp.sentiment, sp.nps_score AS npsScore,
            sp.review_submitted AS reviewSubmitted, sp.created_at AS createdAt,
            sp.responded_at AS respondedAt
     FROM satisfaction_prompts sp
     JOIN clinic_leads cl ON cl.id = sp.lead_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY sp.created_at DESC
     LIMIT $${idx}`,
    [...params, limit],
  );
}

export async function getReviewSubmissions(
  orgId: string,
  limit = 20,
): Promise<ReviewSubmission[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  return db.unsafe<ReviewSubmission[]>(
    `SELECT id, organization_id AS orgId, feedback_id AS feedbackId,
            lead_id AS leadId, platform, review_url AS reviewUrl,
            status, submitted_at AS submittedAt, metadata, created_at AS createdAt
     FROM review_submissions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [orgId, limit],
  );
}

export { DEFAULT_SATISFACTION_MESSAGE, DEFAULT_REVIEW_PROMPT, NPS_PROMOTER_THRESHOLD, NPS_PASSIVE_THRESHOLD };
