import { z } from "zod";

export const leadCaptureSchema = z.object({
  name: z.string().min(1, "Full name is required").max(255),
  email: z.string().email("Enter a valid email address"),
  service: z.string().min(1, "Please select a service"),
  channel: z.string().optional(),
});

export type LeadCaptureInput = z.infer<typeof leadCaptureSchema>;

export const reachUsSchema = z.object({
  name: z.string().min(1, "Full name is required").max(255),
  email: z.string().email("Enter a valid email address"),
  service: z.string().min(1, "Please select a service"),
});

export type ReachUsInput = z.infer<typeof reachUsSchema>;

export const paymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  method: z.enum(["cash", "mobile_money", "card"]),
  notes: z.string().max(500).optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

export const quickScheduleSchema = z.object({
  leadId: z.number(),
  slot: z.string().min(1, "Please select a time slot"),
  providerId: z.number().nullable().optional(),
  roomId: z.number().nullable().optional(),
});

export type QuickScheduleInput = z.infer<typeof quickScheduleSchema>;

export const registerFormSchema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters").max(255),
  adminName: z.string().min(1, "Admin name is required").max(255),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type RegisterFormInput = z.infer<typeof registerFormSchema>;
