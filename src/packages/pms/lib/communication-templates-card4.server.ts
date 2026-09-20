/**
 * Card 4 Notifications & Communication — Communication Templates.
 *
 * Property-scoped template configuration. SET5 catalogues, event management,
 * automation, delivery, and queues stay outside this module.
 */

import { CARD1_LANGUAGES } from "./pms-property-setup-card1.ts";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_TYPES,
  type CommunicationChannelType,
} from "./communication-channels-card4.server.ts";
import { NOTIFICATION_EVENT_LABELS } from "./pms-set5-depts-guestsvc.ts";

export const COMMUNICATION_TEMPLATE_CATEGORIES = [
  "reservation",
  "pre_arrival",
  "stay",
  "departure",
  "internal",
] as const;
export type CommunicationTemplateCategory = (typeof COMMUNICATION_TEMPLATE_CATEGORIES)[number];

export const COMMUNICATION_TEMPLATE_CATEGORY_LABELS: Record<CommunicationTemplateCategory, string> =
  {
    reservation: "Reservation",
    pre_arrival: "Pre-arrival",
    stay: "Stay",
    departure: "Departure",
    internal: "Internal",
  };

export type CommunicationTemplateEvent = {
  id: string;
  category: CommunicationTemplateCategory;
  label: string;
};

/** Selector values only. Phase 3 owns event management. SET5 keys are reused. */
export const COMMUNICATION_TEMPLATE_EVENTS: readonly CommunicationTemplateEvent[] = [
  {
    id: "reservation_confirmed",
    category: "reservation",
    label: NOTIFICATION_EVENT_LABELS.reservation_confirmed,
  },
  {
    id: "pre_arrival",
    category: "pre_arrival",
    label: NOTIFICATION_EVENT_LABELS.pre_arrival,
  },
  {
    id: "guest_request_created",
    category: "stay",
    label: NOTIFICATION_EVENT_LABELS.guest_request_created,
  },
  {
    id: "departure",
    category: "departure",
    label: "Departure",
  },
  {
    id: "night_audit_exception",
    category: "internal",
    label: NOTIFICATION_EVENT_LABELS.night_audit_exception,
  },
];

export const COMMUNICATION_TEMPLATE_VARIABLES = [
  {
    token: "guest.first_name",
    label: "Guest first name",
    categories: ["reservation", "pre_arrival", "stay", "departure"] as const,
  },
  {
    token: "reservation.number",
    label: "Reservation number",
    categories: ["reservation", "pre_arrival", "stay", "departure"] as const,
  },
  {
    token: "reservation.arrival_date",
    label: "Arrival date",
    categories: ["reservation", "pre_arrival", "stay", "departure"] as const,
  },
  {
    token: "reservation.departure_date",
    label: "Departure date",
    categories: ["reservation", "pre_arrival", "stay", "departure"] as const,
  },
  {
    token: "property.name",
    label: "Property name",
    categories: COMMUNICATION_TEMPLATE_CATEGORIES,
  },
] as const;

export const TEMPLATE_PREVIEW_SAMPLE: Record<string, string> = {
  "guest.first_name": "John",
  "reservation.number": "NR-10582",
  "reservation.arrival_date": "17 Sep 2026",
  "reservation.departure_date": "20 Sep 2026",
  "property.name": "Sample Property",
};

export const TEMPLATE_MESSAGE_MAX = 5000;
export const TEMPLATE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;
const TOKEN_PATTERN = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;
const ALLOWED_TOKEN = /^[a-z0-9_.]+$/;

export type CommunicationTemplateRecord = {
  id: string;
  name: string;
  code: string;
  category: CommunicationTemplateCategory;
  eventTrigger: string;
  channelType: CommunicationChannelType;
  language: string;
  subject: string;
  message: string;
  active: boolean;
  allowManualSending: boolean;
  attachPdf: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationTemplateDraft = {
  id: string | null;
  name: string;
  code: string;
  category: CommunicationTemplateCategory;
  eventTrigger: string;
  channelType: CommunicationChannelType;
  language: string;
  subject: string;
  message: string;
  active: boolean;
  allowManualSending: boolean;
  attachPdf: boolean;
};

export type CommunicationTemplatesSnapshot = {
  templates: CommunicationTemplateRecord[];
  lastUpdatedAt: string | null;
};

export type CommunicationTemplateError = { field: string; message: string };

export function emptyCommunicationTemplateDraft(): CommunicationTemplateDraft {
  return {
    id: null,
    name: "",
    code: "",
    category: "reservation",
    eventTrigger: "reservation_confirmed",
    channelType: "email",
    language: "en",
    subject: "",
    message: "",
    active: false,
    allowManualSending: false,
    attachPdf: false,
  };
}

export function communicationTemplateToDraft(
  row: CommunicationTemplateRecord,
): CommunicationTemplateDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    eventTrigger: row.eventTrigger,
    channelType: row.channelType,
    language: row.language,
    subject: row.subject,
    message: row.message,
    active: row.active,
    allowManualSending: row.allowManualSending,
    attachPdf: row.attachPdf,
  };
}

export function eventsForCategory(
  category: CommunicationTemplateCategory,
): readonly CommunicationTemplateEvent[] {
  return COMMUNICATION_TEMPLATE_EVENTS.filter((row) => row.category === category);
}

export function variablesForCategory(category: CommunicationTemplateCategory) {
  return COMMUNICATION_TEMPLATE_VARIABLES.filter((row) =>
    (row.categories as readonly string[]).includes(category),
  );
}

export function allowedTokensForCategory(category: CommunicationTemplateCategory): Set<string> {
  return new Set(variablesForCategory(category).map((row) => row.token));
}

export function templateLanguageOptions(currentId: string): { id: string; label: string }[] {
  const options = CARD1_LANGUAGES.map((row) => ({ id: row.id, label: row.label }));
  if (currentId && !options.some((row) => row.id === currentId)) {
    options.push({ id: currentId, label: currentId });
  }
  return options;
}

export function isCommunicationTemplateCategory(
  value: unknown,
): value is CommunicationTemplateCategory {
  return COMMUNICATION_TEMPLATE_CATEGORIES.includes(value as CommunicationTemplateCategory);
}

export function isCommunicationChannelType(value: unknown): value is CommunicationChannelType {
  return COMMUNICATION_CHANNEL_TYPES.includes(value as CommunicationChannelType);
}

export function stripTemplateHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeTemplateHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<(?!\/?(p|br|b|i|u|strong|em|ul|ol|li|a)(\s|>|\/))/gi, "&lt;");
}

export function collectTemplateTokens(value: string): string[] {
  const tokens = new Set<string>();
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (token) tokens.add(token);
  }
  return [...tokens];
}

export function renderTemplateText(
  value: string,
  sample: Record<string, string> = TEMPLATE_PREVIEW_SAMPLE,
): string {
  return value.replace(TOKEN_PATTERN, (_full, token: string) => sample[token] ?? `{{${token}}}`);
}

export function validateCommunicationTemplateDraft(
  draft: CommunicationTemplateDraft,
  existing: readonly Pick<CommunicationTemplateRecord, "id" | "code">[],
): CommunicationTemplateError[] {
  const errors: CommunicationTemplateError[] = [];
  const name = draft.name.trim();
  const code = draft.code.trim().toUpperCase();
  const subject = draft.subject.trim();
  const messageText = stripTemplateHtml(draft.message);
  if (!name) errors.push({ field: "name", message: "Template name is required." });
  else if (name.length > 80) {
    errors.push({ field: "name", message: "Template name must be 80 characters or fewer." });
  }
  if (!code) errors.push({ field: "code", message: "Template code is required." });
  else if (!TEMPLATE_CODE_PATTERN.test(code)) {
    errors.push({
      field: "code",
      message: "Use 1–20 characters: letters, numbers, hyphens, or underscores.",
    });
  } else if (existing.some((row) => row.id !== draft.id && row.code === code)) {
    errors.push({ field: "code", message: "This template code is already in use." });
  }
  if (!isCommunicationTemplateCategory(draft.category)) {
    errors.push({ field: "category", message: "Choose a template category." });
  }
  const event = COMMUNICATION_TEMPLATE_EVENTS.find((row) => row.id === draft.eventTrigger);
  if (!event) errors.push({ field: "eventTrigger", message: "Choose an event trigger." });
  else if (event.category !== draft.category) {
    errors.push({
      field: "eventTrigger",
      message: "Choose an event trigger that matches this category.",
    });
  }
  if (!isCommunicationChannelType(draft.channelType)) {
    errors.push({ field: "channelType", message: "Choose a communication channel." });
  }
  if (!templateLanguageOptions(draft.language).some((row) => row.id === draft.language)) {
    errors.push({ field: "language", message: "Choose a language." });
  }
  if (!subject) errors.push({ field: "subject", message: "Subject is required." });
  else if (subject.length > 200) {
    errors.push({ field: "subject", message: "Subject must be 200 characters or fewer." });
  }
  if (!messageText) errors.push({ field: "message", message: "Message is required." });
  else if (draft.message.length > TEMPLATE_MESSAGE_MAX) {
    errors.push({
      field: "message",
      message: `Message must be ${TEMPLATE_MESSAGE_MAX} characters or fewer.`,
    });
  }
  const allowed = allowedTokensForCategory(draft.category);
  for (const token of collectTemplateTokens(`${draft.subject}\n${draft.message}`)) {
    if (!ALLOWED_TOKEN.test(token) || !allowed.has(token)) {
      errors.push({
        field: token.startsWith("guest") || token.startsWith("reservation") ? "message" : "subject",
        message: `{{${token}}} is not available for this template category.`,
      });
    }
  }
  return errors;
}

export function communicationTemplatesConfigured(
  templates: readonly CommunicationTemplateRecord[],
): boolean {
  return templates.some(
    (row) =>
      row.active &&
      validateCommunicationTemplateDraft(communicationTemplateToDraft(row), templates).length === 0,
  );
}

export function communicationTemplateChannelLabel(channelType: CommunicationChannelType): string {
  return COMMUNICATION_CHANNEL_LABELS[channelType];
}

export function duplicateTemplateCode(
  sourceCode: string,
  existing: readonly Pick<CommunicationTemplateRecord, "code">[],
): string {
  const base = sourceCode.replace(/-COPY(-\d+)?$/i, "").slice(0, 12);
  let attempt = `${base}-COPY`;
  let index = 2;
  const used = new Set(existing.map((row) => row.code));
  while (used.has(attempt) && attempt.length <= 20) {
    attempt = `${base}-C${index}`.slice(0, 20);
    index += 1;
  }
  return TEMPLATE_CODE_PATTERN.test(attempt) ? attempt : `T${Date.now().toString().slice(-8)}`;
}
