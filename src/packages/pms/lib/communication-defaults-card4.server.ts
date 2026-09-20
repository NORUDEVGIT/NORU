/**
 * Card 4 Notifications & Communication — Communication Defaults.
 *
 * Property-level defaults used by later communication workflows.
 * Channels, senders, templates, events, automation, and delivery stay out.
 */

import { AUTOMATION_TIME_OF_DAY_PATTERN } from "./automation-rules-card4.server.ts";
import {
  COMMUNICATION_CHANNEL_LABELS,
  type CommunicationChannelType,
} from "./communication-channels-card4.server.ts";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_CATEGORY_LABELS,
  type CommunicationTemplateCategory,
} from "./communication-templates-card4.server.ts";
import { CARD1_LANGUAGES, card1LanguageOptions } from "./pms-property-setup-card1.ts";
import { COMMON_CURRENCIES, isValidTimeZone } from "../../../shared/lib/property-time.ts";

export type { CommunicationTemplateCategory };
export {
  CARD1_LANGUAGES,
  card1LanguageOptions,
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_CATEGORY_LABELS,
};

export const COMMUNICATION_DATE_FORMATS = ["yyyy-mm-dd", "dd/mm/yyyy", "mm/dd/yyyy"] as const;
export type CommunicationDateFormat = (typeof COMMUNICATION_DATE_FORMATS)[number];

export const COMMUNICATION_DATE_FORMAT_LABELS: Record<CommunicationDateFormat, string> = {
  "yyyy-mm-dd": "YYYY-MM-DD",
  "dd/mm/yyyy": "DD/MM/YYYY",
  "mm/dd/yyyy": "MM/DD/YYYY",
};

export const COMMUNICATION_TIME_FORMATS = ["24h", "12h"] as const;
export type CommunicationTimeFormat = (typeof COMMUNICATION_TIME_FORMATS)[number];

export const COMMUNICATION_TIME_FORMAT_LABELS: Record<CommunicationTimeFormat, string> = {
  "24h": "24-hour",
  "12h": "12-hour",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CommunicationDefaultsLookupChannel = {
  id: string;
  channelType: CommunicationChannelType;
  active: boolean;
};

export type CommunicationDefaultsLookupSender = {
  id: string;
  channelType: CommunicationChannelType;
  senderName: string;
  active: boolean;
};

export type CommunicationDefaultsInherited = {
  timezone: string;
  currencyCode: string;
  language: string;
  hasLogo: boolean;
};

export type CommunicationDefaultsDraft = {
  id: string | null;
  defaultGuestChannelId: string | null;
  defaultInternalChannelId: string | null;
  defaultMarketingChannelId: string | null;
  defaultLanguage: string;
  timezone: string;
  dateFormat: CommunicationDateFormat;
  timeFormat: CommunicationTimeFormat;
  defaultSenderId: string | null;
  replyToEmail: string;
  signature: string;
  guestNotificationsEnabled: boolean;
  internalNotificationsEnabled: boolean;
  marketingCommunicationsEnabled: boolean;
  useGuestLanguage: boolean;
  attachBranding: boolean;
  currencyCode: string;
  templateCategory: CommunicationTemplateCategory;
  deliveryTime: string;
};

export type CommunicationDefaultsRecord = CommunicationDefaultsDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CommunicationDefaultsSnapshot = {
  defaults: CommunicationDefaultsRecord;
  systemDefaults: CommunicationDefaultsDraft;
  channels: CommunicationDefaultsLookupChannel[];
  senders: CommunicationDefaultsLookupSender[];
  inherited: CommunicationDefaultsInherited;
  lastUpdatedAt: string | null;
};

export type CommunicationDefaultsError = { field: string; message: string };

export const SYSTEM_COMMUNICATION_DEFAULTS = {
  dateFormat: "yyyy-mm-dd" as CommunicationDateFormat,
  timeFormat: "24h" as CommunicationTimeFormat,
  replyToEmail: "",
  signature: "",
  guestNotificationsEnabled: true,
  internalNotificationsEnabled: true,
  marketingCommunicationsEnabled: false,
  useGuestLanguage: true,
  attachBranding: false,
  templateCategory: "reservation" as CommunicationTemplateCategory,
  deliveryTime: "09:00",
};

function channelIdFor(
  channels: readonly CommunicationDefaultsLookupChannel[],
  channelType: CommunicationChannelType,
): string | null {
  return channels.find((row) => row.channelType === channelType)?.id ?? null;
}

export function buildSystemDefaultsDraft(
  inherited: CommunicationDefaultsInherited,
  channels: readonly CommunicationDefaultsLookupChannel[],
  senders: readonly CommunicationDefaultsLookupSender[],
): CommunicationDefaultsDraft {
  const guestId = channelIdFor(channels, "email") ?? channels[0]?.id ?? null;
  const internalId = channelIdFor(channels, "pms_in_app") ?? guestId;
  const marketingId = guestId;
  const senderId = senders.find((row) => row.channelType === "email")?.id ?? senders[0]?.id ?? null;
  const language = card1LanguageOptions(inherited.language).some(
    (row) => row.id === inherited.language,
  )
    ? inherited.language
    : "en";
  const currency = /^[A-Z]{3}$/.test(inherited.currencyCode) ? inherited.currencyCode : "ETB";
  return {
    id: null,
    defaultGuestChannelId: guestId,
    defaultInternalChannelId: internalId,
    defaultMarketingChannelId: marketingId,
    defaultLanguage: language,
    timezone: inherited.timezone.trim() || "Africa/Addis_Ababa",
    dateFormat: SYSTEM_COMMUNICATION_DEFAULTS.dateFormat,
    timeFormat: SYSTEM_COMMUNICATION_DEFAULTS.timeFormat,
    defaultSenderId: senderId,
    replyToEmail: SYSTEM_COMMUNICATION_DEFAULTS.replyToEmail,
    signature: SYSTEM_COMMUNICATION_DEFAULTS.signature,
    guestNotificationsEnabled: SYSTEM_COMMUNICATION_DEFAULTS.guestNotificationsEnabled,
    internalNotificationsEnabled: SYSTEM_COMMUNICATION_DEFAULTS.internalNotificationsEnabled,
    marketingCommunicationsEnabled: SYSTEM_COMMUNICATION_DEFAULTS.marketingCommunicationsEnabled,
    useGuestLanguage: SYSTEM_COMMUNICATION_DEFAULTS.useGuestLanguage,
    attachBranding: SYSTEM_COMMUNICATION_DEFAULTS.attachBranding,
    currencyCode: currency,
    templateCategory: SYSTEM_COMMUNICATION_DEFAULTS.templateCategory,
    deliveryTime: SYSTEM_COMMUNICATION_DEFAULTS.deliveryTime,
  };
}

function knownChannel(
  id: string | null,
  channels: readonly CommunicationDefaultsLookupChannel[],
): boolean {
  return Boolean(id && channels.some((row) => row.id === id));
}

function knownSender(
  id: string | null,
  senders: readonly CommunicationDefaultsLookupSender[],
): boolean {
  return Boolean(id && senders.some((row) => row.id === id));
}

export function validateCommunicationDefaultsDraft(
  draft: CommunicationDefaultsDraft,
  channels: readonly CommunicationDefaultsLookupChannel[],
  senders: readonly CommunicationDefaultsLookupSender[],
): CommunicationDefaultsError[] {
  const errors: CommunicationDefaultsError[] = [];
  if (!draft.defaultGuestChannelId) {
    errors.push({ field: "defaultGuestChannelId", message: "Choose a default guest channel." });
  } else if (!knownChannel(draft.defaultGuestChannelId, channels)) {
    errors.push({
      field: "defaultGuestChannelId",
      message: "The selected guest channel is no longer available. Reselect a channel.",
    });
  }
  if (!draft.defaultInternalChannelId) {
    errors.push({
      field: "defaultInternalChannelId",
      message: "Choose a default internal channel.",
    });
  } else if (!knownChannel(draft.defaultInternalChannelId, channels)) {
    errors.push({
      field: "defaultInternalChannelId",
      message: "The selected internal channel is no longer available. Reselect a channel.",
    });
  }
  if (!draft.defaultMarketingChannelId) {
    errors.push({
      field: "defaultMarketingChannelId",
      message: "Choose a default marketing channel.",
    });
  } else if (!knownChannel(draft.defaultMarketingChannelId, channels)) {
    errors.push({
      field: "defaultMarketingChannelId",
      message: "The selected marketing channel is no longer available. Reselect a channel.",
    });
  }
  if (!CARD1_LANGUAGES.some((row) => row.id === draft.defaultLanguage)) {
    errors.push({ field: "defaultLanguage", message: "Choose a supported language." });
  }
  if (!isValidTimeZone(draft.timezone)) {
    errors.push({ field: "timezone", message: "Choose a valid time zone." });
  }
  if (!COMMUNICATION_DATE_FORMATS.includes(draft.dateFormat)) {
    errors.push({ field: "dateFormat", message: "Choose a supported date format." });
  }
  if (!COMMUNICATION_TIME_FORMATS.includes(draft.timeFormat)) {
    errors.push({ field: "timeFormat", message: "Choose a supported time format." });
  }
  if (!draft.defaultSenderId) {
    errors.push({ field: "defaultSenderId", message: "Choose a default sender." });
  } else if (!knownSender(draft.defaultSenderId, senders)) {
    errors.push({
      field: "defaultSenderId",
      message: "The selected sender is no longer available. Reselect a sender.",
    });
  }
  if (draft.replyToEmail.trim() && !EMAIL.test(draft.replyToEmail.trim())) {
    errors.push({ field: "replyToEmail", message: "Enter a valid reply-to email." });
  }
  if (draft.signature.length > 4000) {
    errors.push({ field: "signature", message: "Signature must be 4000 characters or fewer." });
  }
  const currencyOk =
    COMMON_CURRENCIES.some((row) => row.code === draft.currencyCode) ||
    /^[A-Z]{3}$/.test(draft.currencyCode);
  if (!currencyOk) {
    errors.push({ field: "currencyCode", message: "Choose a supported currency." });
  }
  if (!COMMUNICATION_TEMPLATE_CATEGORIES.includes(draft.templateCategory)) {
    errors.push({ field: "templateCategory", message: "Choose a template category." });
  }
  if (!AUTOMATION_TIME_OF_DAY_PATTERN.test(draft.deliveryTime)) {
    errors.push({ field: "deliveryTime", message: "Enter a valid time in HH:mm." });
  }
  return errors;
}

export function communicationDefaultsConfigured(
  draft: CommunicationDefaultsDraft | null | undefined,
  channels: readonly CommunicationDefaultsLookupChannel[] = [],
  senders: readonly CommunicationDefaultsLookupSender[] = [],
): boolean {
  if (!draft) return false;
  return validateCommunicationDefaultsDraft(draft, channels, senders).length === 0;
}

export function communicationDefaultsToDraft(
  row: CommunicationDefaultsRecord,
): CommunicationDefaultsDraft {
  return {
    id: row.id,
    defaultGuestChannelId: row.defaultGuestChannelId,
    defaultInternalChannelId: row.defaultInternalChannelId,
    defaultMarketingChannelId: row.defaultMarketingChannelId,
    defaultLanguage: row.defaultLanguage,
    timezone: row.timezone,
    dateFormat: row.dateFormat,
    timeFormat: row.timeFormat,
    defaultSenderId: row.defaultSenderId,
    replyToEmail: row.replyToEmail,
    signature: row.signature,
    guestNotificationsEnabled: row.guestNotificationsEnabled,
    internalNotificationsEnabled: row.internalNotificationsEnabled,
    marketingCommunicationsEnabled: row.marketingCommunicationsEnabled,
    useGuestLanguage: row.useGuestLanguage,
    attachBranding: row.attachBranding,
    currencyCode: row.currencyCode,
    templateCategory: row.templateCategory,
    deliveryTime: row.deliveryTime,
  };
}

export function channelOptionLabel(row: CommunicationDefaultsLookupChannel): string {
  const label = COMMUNICATION_CHANNEL_LABELS[row.channelType] ?? row.channelType;
  return row.active ? label : `${label} (inactive)`;
}

export function senderOptionLabel(row: CommunicationDefaultsLookupSender): string {
  const channel = COMMUNICATION_CHANNEL_LABELS[row.channelType] ?? row.channelType;
  const name = row.senderName.trim() || channel;
  return row.active ? `${name} · ${channel}` : `${name} · ${channel} (inactive)`;
}
