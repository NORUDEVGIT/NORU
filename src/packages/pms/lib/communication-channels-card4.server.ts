/**
 * Card 4 Notifications & Communication — Communication Channels.
 *
 * Channel configuration is property-scoped and deliberately excludes secrets,
 * delivery, templates, events, automation rules, and communication defaults.
 */

import {
  INTEGRATION_AUTH_METHODS,
  integrationCategory,
  integrationProvider,
  visibleIntegrationFields,
  type IntegrationAuthMethod,
  type IntegrationDraftValues,
  type IntegrationField,
  type IntegrationProviderDef,
} from "./integrations-catalog.ts";
import { SECRET_KEY_PATTERN } from "./integrations-card6.server.ts";

export const COMMUNICATION_CHANNEL_TYPES = [
  "email",
  "sms",
  "whatsapp",
  "guest_portal",
  "pms_in_app",
] as const;
export type CommunicationChannelType = (typeof COMMUNICATION_CHANNEL_TYPES)[number];

export const COMMUNICATION_CHANNEL_LABELS: Record<CommunicationChannelType, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  guest_portal: "Guest Portal",
  pms_in_app: "PMS (In-App)",
};

export const INTERNAL_PROVIDER: IntegrationProviderDef = {
  id: "noru_pms",
  label: "Noru PMS",
  blurb: "Built-in Noru PMS communication infrastructure.",
  authMethods: ["none"],
  supportsWebhook: false,
  fields: [],
};

export type CommunicationProviderValue = string | number | boolean;
export type CommunicationProviderConfig = Record<string, CommunicationProviderValue>;

export type CommunicationChannelRecord = {
  id: string;
  channelType: CommunicationChannelType;
  provider: string;
  authMethod: IntegrationAuthMethod;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  signature: string;
  providerConfig: CommunicationProviderConfig;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationChannelDraft = {
  id: string | null;
  channelType: CommunicationChannelType;
  provider: string;
  authMethod: IntegrationAuthMethod;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  signature: string;
  providerValues: IntegrationDraftValues;
  active: boolean;
};

export type CommunicationChannelsSnapshot = {
  channels: CommunicationChannelRecord[];
  lastUpdatedAt: string | null;
};

export type CommunicationChannelError = { field: string; message: string };
export type CommunicationTestOutcome = {
  result: "verified" | "unsupported" | "failed";
  message: string;
  checks: Array<{ label: string; passed: boolean }>;
};

export const DEFAULT_COMMUNICATION_CHANNELS: ReadonlyArray<{
  channelType: CommunicationChannelType;
  provider: string;
  authMethod: IntegrationAuthMethod;
}> = [
  { channelType: "email", provider: "smtp", authMethod: "basic" },
  { channelType: "sms", provider: "ethio_telecom_sms", authMethod: "basic" },
  { channelType: "whatsapp", provider: "dialog_360", authMethod: "api_key" },
  { channelType: "guest_portal", provider: "noru_pms", authMethod: "none" },
  { channelType: "pms_in_app", provider: "noru_pms", authMethod: "none" },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHANNEL_LEVEL_PROVIDER_FIELDS = new Set([
  "fromName",
  "fromEmail",
  "replyToEmail",
  "senderId",
]);

export function channelProviderCategory(
  channelType: CommunicationChannelType,
): "email" | "sms" | "whatsapp" | null {
  if (channelType === "email" || channelType === "sms" || channelType === "whatsapp") {
    return channelType;
  }
  return null;
}

export function communicationProviders(
  channelType: CommunicationChannelType,
): readonly IntegrationProviderDef[] {
  const category = channelProviderCategory(channelType);
  return category ? (integrationCategory(category)?.providers ?? []) : [INTERNAL_PROVIDER];
}

export function communicationProvider(
  channelType: CommunicationChannelType,
  provider: string,
): IntegrationProviderDef | null {
  const category = channelProviderCategory(channelType);
  if (!category) return provider === INTERNAL_PROVIDER.id ? INTERNAL_PROVIDER : null;
  return integrationProvider(category, provider);
}

export function providerFields(
  draft: Pick<
    CommunicationChannelDraft,
    "channelType" | "provider" | "authMethod" | "providerValues"
  >,
): IntegrationField[] {
  const category = channelProviderCategory(draft.channelType);
  if (!category) return [];
  return visibleIntegrationFields(
    category,
    draft.provider,
    draft.authMethod,
    draft.providerValues,
  ).filter((field) => !CHANNEL_LEVEL_PROVIDER_FIELDS.has(field.id));
}

export function sanitizeCommunicationProviderConfig(
  channelType: CommunicationChannelType,
  provider: string,
  values: CommunicationProviderConfig,
): CommunicationProviderConfig {
  const definition = communicationProvider(channelType, provider);
  const allowed = new Set(
    (definition?.fields ?? [])
      .filter(
        (field) =>
          !field.secret &&
          !SECRET_KEY_PATTERN.test(field.id) &&
          !CHANNEL_LEVEL_PROVIDER_FIELDS.has(field.id),
      )
      .map((field) => field.id),
  );
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key) && !SECRET_KEY_PATTERN.test(key)),
  );
}

export function emptyCommunicationChannelDraft(
  channelType: CommunicationChannelType = "email",
  senderName = "",
): CommunicationChannelDraft {
  const defaults =
    DEFAULT_COMMUNICATION_CHANNELS.find((row) => row.channelType === channelType) ??
    DEFAULT_COMMUNICATION_CHANNELS[0];
  return {
    id: null,
    channelType,
    provider: defaults?.provider ?? "",
    authMethod: defaults?.authMethod ?? "none",
    senderName,
    senderEmail: "",
    replyToEmail: "",
    signature: "",
    providerValues: {},
    active: false,
  };
}

export function communicationChannelToDraft(
  row: CommunicationChannelRecord,
): CommunicationChannelDraft {
  return {
    id: row.id,
    channelType: row.channelType,
    provider: row.provider,
    authMethod: row.authMethod,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    replyToEmail: row.replyToEmail,
    signature: row.signature,
    providerValues: { ...row.providerConfig },
    active: row.active,
  };
}

function providerFieldError(field: IntegrationField, value: unknown): string | null {
  if (field.secret || SECRET_KEY_PATTERN.test(field.id)) return null;
  const text = typeof value === "string" ? value.trim() : "";
  const missing =
    value === undefined || value === null || (typeof value === "string" && text === "");
  if (field.required && missing) {
    return `${field.label} is required.`;
  }
  if (text && field.format === "email" && !EMAIL.test(text)) {
    return `Enter a valid ${field.label.toLowerCase()}.`;
  }
  if (text && field.format === "url") {
    try {
      const url = new URL(text);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    } catch {
      return `Enter a valid ${field.label.toLowerCase()}.`;
    }
  }
  if (text && field.format === "host" && !/^[a-z0-9.-]+$/i.test(text)) {
    return `Enter a valid ${field.label.toLowerCase()}.`;
  }
  if (field.type === "number" && value !== undefined && value !== "") {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${field.label} must be a number.`;
    if (field.min !== undefined && number < field.min) {
      return `${field.label} must be at least ${field.min}.`;
    }
    if (field.max !== undefined && number > field.max) {
      return `${field.label} must be at most ${field.max}.`;
    }
  }
  if (field.maxLength !== undefined && text.length > field.maxLength) {
    return `${field.label} must be ${field.maxLength} characters or fewer.`;
  }
  return null;
}

export function validateCommunicationChannelDraft(
  draft: CommunicationChannelDraft,
  existing: readonly Pick<CommunicationChannelRecord, "id" | "channelType">[],
): CommunicationChannelError[] {
  const errors: CommunicationChannelError[] = [];
  const definition = communicationProvider(draft.channelType, draft.provider);
  if (!COMMUNICATION_CHANNEL_TYPES.includes(draft.channelType)) {
    errors.push({ field: "channelType", message: "Choose a supported channel." });
  }
  if (!definition) {
    errors.push({ field: "provider", message: "Choose a provider for this channel." });
  } else if (!definition.authMethods.includes(draft.authMethod)) {
    errors.push({
      field: "authMethod",
      message: "Choose an authentication method supported by this provider.",
    });
  }
  if (!draft.senderName.trim()) {
    errors.push({ field: "senderName", message: "Sender name is required." });
  } else if (draft.senderName.trim().length > 80) {
    errors.push({ field: "senderName", message: "Sender name must be 80 characters or fewer." });
  }
  if (draft.channelType === "email") {
    if (draft.active && !EMAIL.test(draft.senderEmail.trim())) {
      errors.push({ field: "senderEmail", message: "Enter a valid sender email." });
    } else if (draft.senderEmail.trim() && !EMAIL.test(draft.senderEmail.trim())) {
      errors.push({ field: "senderEmail", message: "Enter a valid sender email." });
    }
    if (draft.replyToEmail.trim() && !EMAIL.test(draft.replyToEmail.trim())) {
      errors.push({ field: "replyToEmail", message: "Enter a valid reply-to email." });
    }
  }
  if (draft.signature.length > 4000) {
    errors.push({ field: "signature", message: "Signature must be 4000 characters or fewer." });
  }
  if (existing.some((row) => row.id !== draft.id && row.channelType === draft.channelType)) {
    errors.push({
      field: "channelType",
      message: "This communication channel is already configured.",
    });
  }
  if (draft.active) {
    for (const field of providerFields(draft)) {
      const message = providerFieldError(field, draft.providerValues[field.id]);
      if (message) errors.push({ field: field.id, message });
    }
  }
  return errors;
}

export function communicationChannelsConfigured(
  channels: readonly CommunicationChannelRecord[],
): boolean {
  return COMMUNICATION_CHANNEL_TYPES.every((channelType) =>
    channels.some((row) => {
      if (row.channelType !== channelType) return false;
      return (
        validateCommunicationChannelDraft(communicationChannelToDraft(row), channels).length === 0
      );
    }),
  );
}

export function communicationProviderLabel(row: {
  channelType: CommunicationChannelType;
  provider: string;
}): string {
  return communicationProvider(row.channelType, row.provider)?.label ?? row.provider;
}

export function isIntegrationAuthMethod(value: unknown): value is IntegrationAuthMethod {
  return INTEGRATION_AUTH_METHODS.includes(value as IntegrationAuthMethod);
}

export function validateConnectionTest(draft: CommunicationChannelDraft): CommunicationTestOutcome {
  const fields = providerFields(draft);
  const checks = fields
    .filter((field) => field.required)
    .map((field) => ({
      label: field.label,
      passed:
        draft.providerValues[field.id] !== undefined &&
        draft.providerValues[field.id] !== null &&
        String(draft.providerValues[field.id]).trim().length > 0,
    }));
  const baseErrors = validateCommunicationChannelDraft(draft, []);
  const invalidBase = baseErrors.filter(
    (error) => !fields.some((field) => field.id === error.field),
  );
  if (invalidBase.length > 0 || checks.some((check) => !check.passed)) {
    return {
      result: "failed",
      message:
        invalidBase[0]?.message ??
        `Complete required provider settings before testing ${COMMUNICATION_CHANNEL_LABELS[draft.channelType]}.`,
      checks,
    };
  }
  if (!channelProviderCategory(draft.channelType)) {
    return {
      result: "verified",
      message: `${COMMUNICATION_CHANNEL_LABELS[draft.channelType]} uses the built-in Noru PMS infrastructure.`,
      checks: [{ label: "Noru PMS internal provider", passed: true }],
    };
  }
  return {
    result: "unsupported",
    message:
      "Configuration is valid, but NORU has no live adapter for this provider. No external connection was claimed.",
    checks,
  };
}
