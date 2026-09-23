/**
 * Card 4 Notifications & Communication — Automation Rules.
 *
 * Property-scoped rule configuration. Delivery, SET5 catalogues, Sender
 * Settings, and Communication Defaults remain outside this module.
 */

import {
  COMMUNICATION_CHANNEL_TYPES,
  type CommunicationChannelType,
} from "./communication-channels-card4.server.ts";

export const AUTOMATION_CONDITION_FIELDS = ["guest_profile_type"] as const;
export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number];

export const AUTOMATION_CONDITION_FIELD_LABELS: Record<AutomationConditionField, string> = {
  guest_profile_type: "Guest Type",
};

export const AUTOMATION_CONDITION_OPERATORS = ["eq", "neq"] as const;
export type AutomationConditionOperator = (typeof AUTOMATION_CONDITION_OPERATORS)[number];

export const AUTOMATION_CONDITION_OPERATOR_LABELS: Record<AutomationConditionOperator, string> = {
  eq: "equals",
  neq: "does not equal",
};

export const AUTOMATION_RECIPIENT_KINDS = ["department", "role"] as const;
export type AutomationRecipientKind = (typeof AUTOMATION_RECIPIENT_KINDS)[number];

export const AUTOMATION_RECIPIENT_ROLES = ["owner", "manager", "staff"] as const;
export type AutomationRecipientRole = (typeof AUTOMATION_RECIPIENT_ROLES)[number];

export const AUTOMATION_RECIPIENT_ROLE_LABELS: Record<AutomationRecipientRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const AUTOMATION_SCHEDULE_MODES = ["immediate", "delay", "time_of_day"] as const;
export type AutomationScheduleMode = (typeof AUTOMATION_SCHEDULE_MODES)[number];

export const AUTOMATION_SCHEDULE_MODE_LABELS: Record<AutomationScheduleMode, string> = {
  immediate: "Immediate",
  delay: "Delay",
  time_of_day: "Time of day",
};

export const AUTOMATION_DELAY_MIN = 1;
export const AUTOMATION_DELAY_MAX = 10080;
export const AUTOMATION_TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AutomationCondition = {
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: string;
};

export type AutomationRecipient = {
  kind: AutomationRecipientKind;
  id: string;
};

export type AutomationSchedule =
  | { mode: "immediate" }
  | { mode: "delay"; delayMinutes: number }
  | { mode: "time_of_day"; timeOfDay: string };

export type AutomationRuleLookup = {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
};

export type AutomationRuleRecord = {
  id: string;
  name: string;
  eventId: string;
  conditions: AutomationCondition[];
  recipients: AutomationRecipient[];
  channelType: CommunicationChannelType;
  templateId: string | null;
  schedule: AutomationSchedule;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRuleDraft = {
  id: string | null;
  name: string;
  eventId: string;
  conditions: AutomationCondition[];
  recipients: AutomationRecipient[];
  channelType: CommunicationChannelType;
  templateId: string | null;
  schedule: AutomationSchedule;
  active: boolean;
};

export type AutomationRulesSnapshot = {
  rules: AutomationRuleRecord[];
  events: AutomationRuleLookup[];
  channels: Array<{ channelType: CommunicationChannelType; active: boolean }>;
  templates: Array<{
    id: string;
    name: string;
    channelType: CommunicationChannelType;
    eventTrigger: string;
    active: boolean;
  }>;
  departments: AutomationRuleLookup[];
  profileTypes: AutomationRuleLookup[];
  roles: Array<{ id: AutomationRecipientRole; name: string }>;
  timezone: string;
  lastUpdatedAt: string | null;
};

export type AutomationRuleError = { field: string; message: string };

export function emptyAutomationRuleDraft(
  channelType: CommunicationChannelType = "email",
): AutomationRuleDraft {
  return {
    id: null,
    name: "",
    eventId: "",
    conditions: [],
    recipients: [],
    channelType,
    templateId: null,
    schedule: { mode: "immediate" },
    active: false,
  };
}

export function automationRuleToDraft(row: AutomationRuleRecord): AutomationRuleDraft {
  return {
    id: row.id,
    name: row.name,
    eventId: row.eventId,
    conditions: row.conditions.map((item) => ({ ...item })),
    recipients: row.recipients.map((item) => ({ ...item })),
    channelType: row.channelType,
    templateId: row.templateId,
    schedule: { ...row.schedule },
    active: row.active,
  };
}

export function emptyAutomationCondition(): AutomationCondition {
  return { field: "guest_profile_type", operator: "eq", value: "" };
}

export function emptyAutomationRecipient(): AutomationRecipient {
  return { kind: "role", id: "manager" };
}

export function isAutomationConditionField(value: unknown): value is AutomationConditionField {
  return AUTOMATION_CONDITION_FIELDS.includes(value as AutomationConditionField);
}

export function isAutomationConditionOperator(
  value: unknown,
): value is AutomationConditionOperator {
  return AUTOMATION_CONDITION_OPERATORS.includes(value as AutomationConditionOperator);
}

export function isAutomationRecipientKind(value: unknown): value is AutomationRecipientKind {
  return AUTOMATION_RECIPIENT_KINDS.includes(value as AutomationRecipientKind);
}

export function isAutomationRecipientRole(value: unknown): value is AutomationRecipientRole {
  return AUTOMATION_RECIPIENT_ROLES.includes(value as AutomationRecipientRole);
}

export function isAutomationScheduleMode(value: unknown): value is AutomationScheduleMode {
  return AUTOMATION_SCHEDULE_MODES.includes(value as AutomationScheduleMode);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseAutomationConditions(value: unknown): AutomationCondition[] {
  if (!Array.isArray(value)) return [];
  const parsed: AutomationCondition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isAutomationConditionField(row.field) || !isAutomationConditionOperator(row.operator)) {
      continue;
    }
    parsed.push({
      field: row.field,
      operator: row.operator,
      value: String(row.value ?? "").trim(),
    });
  }
  return parsed;
}

export function parseAutomationRecipients(value: unknown): AutomationRecipient[] {
  if (!Array.isArray(value)) return [];
  const parsed: AutomationRecipient[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!isAutomationRecipientKind(row.kind)) continue;
    parsed.push({ kind: row.kind, id: String(row.id ?? "").trim() });
  }
  return parsed;
}

export function parseAutomationSchedule(value: unknown): AutomationSchedule {
  if (!value || typeof value !== "object") return { mode: "immediate" };
  const row = value as Record<string, unknown>;
  if (row.mode === "delay") {
    const delayMinutes = Number(row.delayMinutes);
    return {
      mode: "delay",
      delayMinutes: Number.isFinite(delayMinutes) ? delayMinutes : 0,
    };
  }
  if (row.mode === "time_of_day") {
    return { mode: "time_of_day", timeOfDay: String(row.timeOfDay ?? "").trim() };
  }
  return { mode: "immediate" };
}

export function normalizeAutomationRuleDraft(draft: AutomationRuleDraft): AutomationRuleDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    eventId: draft.eventId.trim(),
    templateId: draft.templateId || null,
    conditions: parseAutomationConditions(draft.conditions),
    recipients: parseAutomationRecipients(draft.recipients),
    schedule: parseAutomationSchedule(draft.schedule),
  };
}

export function summarizeAutomationCondition(
  condition: AutomationCondition,
  profileTypes: readonly AutomationRuleLookup[],
): string {
  const field = AUTOMATION_CONDITION_FIELD_LABELS[condition.field];
  const operator = AUTOMATION_CONDITION_OPERATOR_LABELS[condition.operator];
  const value =
    profileTypes.find((row) => row.id === condition.value)?.name ??
    (condition.value || "Unset");
  return `${field} ${operator} ${value}`;
}

export function summarizeAutomationRecipient(
  recipient: AutomationRecipient,
  departments: readonly AutomationRuleLookup[],
): string {
  if (recipient.kind === "role") {
    return isAutomationRecipientRole(recipient.id)
      ? AUTOMATION_RECIPIENT_ROLE_LABELS[recipient.id]
      : recipient.id;
  }
  return departments.find((row) => row.id === recipient.id)?.name ?? "Unknown department";
}

export function summarizeAutomationSchedule(schedule: AutomationSchedule): string {
  if (schedule.mode === "delay") return `Delay ${schedule.delayMinutes} min`;
  if (schedule.mode === "time_of_day") return `At ${schedule.timeOfDay}`;
  return AUTOMATION_SCHEDULE_MODE_LABELS.immediate;
}

export function validateAutomationRuleDraft(
  input: AutomationRuleDraft,
  catalogues: {
    events: readonly AutomationRuleLookup[];
    channels: readonly { channelType: CommunicationChannelType; active: boolean }[];
    templates: readonly {
      id: string;
      channelType: CommunicationChannelType;
      eventTrigger: string;
      active: boolean;
    }[];
    departments: readonly AutomationRuleLookup[];
    profileTypes: readonly AutomationRuleLookup[];
  },
  requireComplete = false,
): AutomationRuleError[] {
  const draft = normalizeAutomationRuleDraft(input);
  const complete = requireComplete || draft.active;
  const errors: AutomationRuleError[] = [];
  if (!draft.name) errors.push({ field: "name", message: "Rule name is required." });
  else if (draft.name.length > 80) {
    errors.push({ field: "name", message: "Rule name must be 80 characters or fewer." });
  }
  const event = catalogues.events.find((row) => row.id === draft.eventId);
  if (!draft.eventId || !event) {
    errors.push({ field: "eventId", message: "Choose a notification event." });
  }
  draft.conditions.forEach((condition, index) => {
    const prefix = `conditions.${index}`;
    if (!isAutomationConditionField(condition.field)) {
      errors.push({ field: `${prefix}.field`, message: "Choose a condition field." });
    }
    if (!isAutomationConditionOperator(condition.operator)) {
      errors.push({ field: `${prefix}.operator`, message: "Choose a condition operator." });
    }
    if (!condition.value || !isUuid(condition.value)) {
      errors.push({ field: `${prefix}.value`, message: "Choose a guest type." });
    } else if (!catalogues.profileTypes.some((row) => row.id === condition.value)) {
      errors.push({
        field: `${prefix}.value`,
        message: "Choose a guest type from this property.",
      });
    }
  });
  if (complete && draft.recipients.length === 0) {
    errors.push({ field: "recipients", message: "Choose at least one recipient." });
  }
  draft.recipients.forEach((recipient, index) => {
    const prefix = `recipients.${index}`;
    if (!isAutomationRecipientKind(recipient.kind)) {
      errors.push({ field: `${prefix}.kind`, message: "Choose a recipient type." });
      return;
    }
    if (recipient.kind === "role") {
      if (!isAutomationRecipientRole(recipient.id)) {
        errors.push({ field: `${prefix}.id`, message: "Choose a valid role." });
      }
      return;
    }
    const department = catalogues.departments.find((row) => row.id === recipient.id);
    if (!department) {
      errors.push({ field: `${prefix}.id`, message: "Choose a department from this property." });
    } else if (department.active === false) {
      errors.push({ field: `${prefix}.id`, message: "Choose an active department." });
    }
  });
  if (!COMMUNICATION_CHANNEL_TYPES.includes(draft.channelType)) {
    errors.push({ field: "channelType", message: "Choose a communication channel." });
  } else {
    const channel = catalogues.channels.find((row) => row.channelType === draft.channelType);
    if (!channel) {
      errors.push({
        field: "channelType",
        message: "Configure this communication channel for the property first.",
      });
    } else if (complete && !channel.active) {
      errors.push({
        field: "channelType",
        message: "Activate the selected communication channel first.",
      });
    }
  }
  if (complete && !draft.templateId) {
    errors.push({ field: "templateId", message: "Choose a template before activating this rule." });
  } else if (draft.templateId) {
    const template = catalogues.templates.find((row) => row.id === draft.templateId);
    if (!template) {
      errors.push({ field: "templateId", message: "Choose a template from this property." });
    } else {
      if (complete && !template.active) {
        errors.push({ field: "templateId", message: "The selected template must be active." });
      }
      if (template.channelType !== draft.channelType) {
        errors.push({
          field: "templateId",
          message: "The template channel must match the rule channel.",
        });
      }
      if (event?.code && template.eventTrigger !== event.code) {
        errors.push({
          field: "templateId",
          message: "The template trigger must match the selected event.",
        });
      }
    }
  }
  if (draft.schedule.mode === "delay") {
    if (
      !Number.isInteger(draft.schedule.delayMinutes) ||
      draft.schedule.delayMinutes < AUTOMATION_DELAY_MIN ||
      draft.schedule.delayMinutes > AUTOMATION_DELAY_MAX
    ) {
      errors.push({
        field: "schedule.delayMinutes",
        message: "Delay must be between 1 and 10,080 minutes.",
      });
    }
  } else if (draft.schedule.mode === "time_of_day") {
    if (!AUTOMATION_TIME_OF_DAY_PATTERN.test(draft.schedule.timeOfDay)) {
      errors.push({
        field: "schedule.timeOfDay",
        message: "Enter a valid time in HH:mm.",
      });
    }
  } else if (draft.schedule.mode !== "immediate") {
    errors.push({ field: "schedule.mode", message: "Choose a schedule." });
  }
  return errors;
}

export function automationRulesConfigured(rules: readonly AutomationRuleRecord[]): boolean {
  return rules.some((row) => row.active && row.templateId !== null && row.recipients.length > 0);
}
