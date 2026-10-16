import { z } from "zod";

export const LEAD_SOURCES = ["request_demo", "contact"] as const;
export const LEAD_PROPERTY_TYPES = ["Hotel", "Restaurant", "Guest House", "Resort"] as const;
export const LEAD_STATUSES = ["new", "contacted", "closed"] as const;

export const LEAD_COOLDOWN_LIMIT = 3;
export const LEAD_COOLDOWN_MS = 15 * 60 * 1000;

export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadPropertyType = (typeof LEAD_PROPERTY_TYPES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const leadSubmissionSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .transform((value) => value.toLowerCase()),
  company: z.string().trim().min(1).max(160),
  phone: optionalText(40),
  message: optionalText(4000),
  propertyType: z.enum(LEAD_PROPERTY_TYPES),
});

export type LeadSubmission = z.infer<typeof leadSubmissionSchema>;

export const leadUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
  notes: z
    .string()
    .trim()
    .max(4000)
    .transform((value) => (value ? value : null)),
});

export function leadCooldownExceeded(recentCount: number): boolean {
  return recentCount >= LEAD_COOLDOWN_LIMIT;
}

export function leadValidationMessage(): string {
  return "Check the name, email, company, and property type, then try again.";
}

export function leadCooldownMessage(): string {
  return "Please wait a few minutes before sending another request from this email.";
}

export function leadStorageUnavailableMessage(): string {
  return "Lead storage is unavailable. Please try again later.";
}

export function leadStorageErrorMessage(databaseMessage: string, fallback: string): string {
  return isMissingLeadStorage(databaseMessage) ? leadStorageUnavailableMessage() : fallback;
}

/** True when Postgres or PostgREST says public.leads is not in the schema yet. */
export function isMissingLeadStorage(message: string): boolean {
  const text = message.toLowerCase();
  if (!text.includes("leads")) return false;
  return (
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("undefined_table") ||
    text.includes("42p01") ||
    text.includes("pgrst205")
  );
}
