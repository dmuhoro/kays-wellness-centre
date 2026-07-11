import { z } from "zod";

export interface MedicalService {
  code: string;
  name: string;
  category: string;
  defaultPrice: number;
  durationMinutes: number;
}

export interface TriageScript {
  id: string;
  triggerEvent: string;
  title: string;
  body: string;
  delayMinutes: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
}

export const medicalServicesSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  category: z.string().min(1),
  defaultPrice: z.number().positive(),
  durationMinutes: z.number().int().positive(),
});

export const triageScriptSchema = z.object({
  id: z.string().min(1),
  triggerEvent: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  delayMinutes: z.number().int().min(0),
});

export const messageTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  category: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string()),
});

export const MEDICAL_SERVICES: MedicalService[] = [
  { code: "BHRT", name: "Bio-identical Hormone Replacement Therapy", category: "hormone", defaultPrice: 8500, durationMinutes: 60 },
  { code: "IV-THERAPY", name: "Intravenous Micronutrient Therapy", category: "infusion", defaultPrice: 6500, durationMinutes: 45 },
  { code: "OZONE", name: "Ozone Therapy (Major Autohemotherapy)", category: "therapy", defaultPrice: 5000, durationMinutes: 45 },
  { code: "CHELATION", name: "Chelation Therapy", category: "therapy", defaultPrice: 7500, durationMinutes: 60 },
  { code: "NUTRITION", name: "Nutritional Counseling & Metabolic Assessment", category: "consultation", defaultPrice: 4000, durationMinutes: 45 },
  { code: "FUNCTIONAL-MD", name: "Functional Medicine Initial Assessment", category: "consultation", defaultPrice: 12000, durationMinutes: 90 },
  { code: "CHRONIC-CARE", name: "Chronic Disease Management Review", category: "consultation", defaultPrice: 6000, durationMinutes: 60 },
  { code: "METABOLIC-OPT", name: "Metabolic Optimization Program", category: "program", defaultPrice: 15000, durationMinutes: 60 },
  { code: "WEIGHT-MGMT", name: "Medical Weight Management", category: "program", defaultPrice: 10000, durationMinutes: 45 },
  { code: "HORMONE-PANEL", name: "Hormone Panel & Lab Review", category: "diagnostic", defaultPrice: 18000, durationMinutes: 30 },
  { code: "GI-MAP", name: "GI-MAP Stool Analysis Consultation", category: "diagnostic", defaultPrice: 22000, durationMinutes: 45 },
  { code: "SLEEP-OPT", name: "Sleep Optimization Consultation", category: "consultation", defaultPrice: 5500, durationMinutes: 45 },
];

export const TRIAGE_SCRIPTS: TriageScript[] = [
  {
    id: "initial-contact",
    triggerEvent: "lead_created",
    title: "New Lead — Initial Outreach",
    body: "Hi {{name}}, thank you for reaching out to Kay's Wellness Centre. I'd love to learn more about your health goals and how {{service}} could support you. Would you be available for a complimentary 15-minute discovery call this week?",
    delayMinutes: 5,
  },
  {
    id: "follow-up-24h",
    triggerEvent: "follow_up_24h",
    title: "24-Hour Follow-Up",
    body: "Hi {{name}}, just checking in! I wanted to make sure you received my previous message about {{service}}. Please let me know if you have any questions — I'm here to help. Warmly, Dr. Jacqueline's Care Team",
    delayMinutes: 1440,
  },
  {
    id: "appointment-reminder",
    triggerEvent: "appointment_scheduled",
    title: "Appointment Reminder",
    body: "Hi {{name}}, this is a friendly reminder of your upcoming appointment at Kay's Wellness Centre on {{appointment_date}} at {{appointment_time}}. Please arrive 15 minutes early to complete any required intake forms. Reply CONFIRM to confirm or call us to reschedule.",
    delayMinutes: 1440,
  },
  {
    id: "post-visit-followup",
    triggerEvent: "lead_converted",
    title: "Post-Visit Follow-Up",
    body: "Hi {{name}}, thank you for visiting Kay's Wellness Centre today! Dr. Jacqueline enjoyed meeting you. If you have any questions about your treatment plan or the next steps we discussed, please don't hesitate to reach out. Wishing you wellness!",
    delayMinutes: 120,
  },
  {
    id: "no-show-recovery",
    triggerEvent: "no_show",
    title: "No-Show Recovery",
    body: "Hi {{name}}, we missed you at your appointment today. No worries — life happens! Please give us a call at your earliest convenience to reschedule. We're here to support you on your wellness journey.",
    delayMinutes: 30,
  },
  {
    id: "cancellation-retention",
    triggerEvent: "cancellation_alert",
    title: "Cancellation Retention",
    body: "Hi {{name}}, we're sorry to hear you're considering cancelling. Your health is important to us, and we'd love to address any concerns you may have. Would you be open to a brief call with our care coordinator?",
    delayMinutes: 10,
  },
];

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "welcome-intake",
    name: "Welcome & Intake Request",
    category: "onboarding",
    body: "Welcome to Kay's Wellness Centre, {{name}}! To help us prepare for your first visit, please complete our intake form: {{intake_url}}. If you have any questions, reply here or call us.",
    variables: ["name", "intake_url"],
  },
  {
    id: "lab-order",
    name: "Lab Order Instructions",
    category: "diagnostic",
    body: "Hi {{name}}, Dr. Jacqueline has ordered the following labs: {{lab_names}}. Please visit {{lab_location}} for collection. Results are typically available within 5-7 business days.",
    variables: ["name", "lab_names", "lab_location"],
  },
  {
    id: "payment-reminder",
    name: "Payment Reminder",
    category: "billing",
    body: "Hi {{name}}, this is a gentle reminder that your invoice ({{invoice_number}}) of KES {{amount}} is due on {{due_date}}. You can make a payment via M-Pesa Paybill {{paybill}} or in-clinic. Thank you!",
    variables: ["name", "invoice_number", "amount", "due_date", "paybill"],
  },
  {
    id: "treatment-plan-summary",
    name: "Treatment Plan Summary",
    category: "clinical",
    body: "Hi {{name}}, here's a summary of your treatment plan: {{plan_summary}}. Your next follow-up is scheduled for {{next_visit}}. Please reach out if you have any questions between visits.",
    variables: ["name", "plan_summary", "next_visit"],
  },
  {
    id: "referral-request",
    name: "Referral Request",
    category: "growth",
    body: "Hi {{name}}, we're glad you had a positive experience at Kay's Wellness Centre! If you know anyone who might benefit from {{service}}, we'd be grateful if you shared our contact. Referrals help us reach more people on their wellness journey.",
    variables: ["name", "service"],
  },
];

export function validateSeedData(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const s of MEDICAL_SERVICES) {
    const r = medicalServicesSchema.safeParse(s);
    if (!r.success) errors.push(`MedicalService ${s.code}: ${r.error.message}`);
  }
  for (const t of TRIAGE_SCRIPTS) {
    const r = triageScriptSchema.safeParse(t);
    if (!r.success) errors.push(`TriageScript ${t.id}: ${r.error.message}`);
  }
  for (const t of MESSAGE_TEMPLATES) {
    const r = messageTemplateSchema.safeParse(t);
    if (!r.success) errors.push(`MessageTemplate ${t.id}: ${r.error.message}`);
  }
  return { valid: errors.length === 0, errors };
}

export async function hydrateOrganization(db: ReturnType<typeof import("postgres")>, orgId: string): Promise<void> {
  const defaultHours = JSON.stringify({
    monday: { open: "08:00", close: "17:00" },
    tuesday: { open: "08:00", close: "17:00" },
    wednesday: { open: "08:00", close: "17:00" },
    thursday: { open: "08:00", close: "17:00" },
    friday: { open: "08:00", close: "17:00" },
    saturday: null,
    sunday: null,
  });

  await db.unsafe(
    `INSERT INTO clinic_configuration (organization_id, business_hours, slot_duration_minutes, triage_timeout_minutes, timezone)
     VALUES ($1, $2, 30, 45, 'Africa/Nairobi')
     ON CONFLICT (organization_id) DO UPDATE SET
       business_hours = EXCLUDED.business_hours`,
    [orgId, defaultHours],
  );

  const existingResources = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM resources WHERE organization_id = $1 LIMIT 1`,
    [orgId],
  );
  if (existingResources.length === 0) {
    await db.unsafe(
      `INSERT INTO resources (organization_id, name, type, status) VALUES
       ($1, 'Dr. Jacqueline Mwanu', 'PROVIDER', 'active'),
       ($1, 'Consultation Room', 'ROOM', 'active'),
       ($1, 'Infusion Suite', 'ROOM', 'active')`,
      [orgId],
    );
  }

  const existingAvail = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM clinic_availability WHERE organization_id = $1 LIMIT 1`,
    [orgId],
  );
  if (existingAvail.length === 0) {
    await db.unsafe(
      `INSERT INTO clinic_availability (organization_id, day_of_week, start_time, end_time, slot_duration_minutes) VALUES
       ($1, 1, '08:00', '17:00', 60),
       ($1, 2, '08:00', '17:00', 60),
       ($1, 3, '08:00', '17:00', 60),
       ($1, 4, '08:00', '17:00', 60),
       ($1, 5, '08:00', '17:00', 60),
       ($1, 6, '08:00', '13:00', 60)`,
      [orgId],
    );
  }

  const existingKeywords = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM clinic_configuration WHERE organization_id = $1 AND custom_keywords != '[]'`,
    [orgId],
  );
  if (existingKeywords.length === 0) {
    await db.unsafe(
      `UPDATE clinic_configuration SET
        custom_keywords = $2
       WHERE organization_id = $1`,
      [orgId, JSON.stringify(["cancel", "cancel appointment", "reschedule", "stop", "unsubscribe", "not interested", "do not contact"])],
    );
  }
}
