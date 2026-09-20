/**
 * Card 4 Notifications & Communication — Sender Settings.
 *
 * Per-channel sender/provider store that references Phase 1 channels.
 * Secrets stay session-only. Communication Defaults and delivery stay out.
 */

import {
  sanitizeCommunicationProviderConfig,
  type CommunicationChannelDraft,
  type CommunicationChannelError,
  type CommunicationChannelRecord,
  type CommunicationChannelType,
  type CommunicationProviderConfig,
  type CommunicationTestOutcome,
} from "./communication-channels-card4.server.ts";

export {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_TYPES,
  INTERNAL_PROVIDER,
  communicationChannelToDraft as senderSettingToDraft,
  communicationProvider,
  communicationProviders,
  emptyCommunicationChannelDraft as emptySenderSettingsDraft,
  providerFields as senderProviderFields,
  sanitizeCommunicationProviderConfig,
  validateCommunicationChannelDraft as validateSenderSettingsDraft,
  validateConnectionTest as validateSenderConnectionTest,
} from "./communication-channels-card4.server.ts";

export type SenderSettingsRecord = CommunicationChannelRecord;
export type SenderSettingsDraft = CommunicationChannelDraft;
export type SenderSettingsError = CommunicationChannelError;
export type SenderSettingsSnapshot = {
  settings: SenderSettingsRecord[];
  lastUpdatedAt: string | null;
};
export type SenderTestOutcome = CommunicationTestOutcome;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function senderSettingsConfigured(
  settings: readonly Pick<SenderSettingsRecord, "channelType" | "senderName" | "senderEmail">[],
  channels?: readonly { channelType: CommunicationChannelType }[],
): boolean {
  const email = settings.find((row) => row.channelType === "email");
  if (!email) return false;
  if (channels && !channels.some((row) => row.channelType === "email")) return false;
  return email.senderName.trim().length > 0 && EMAIL.test(email.senderEmail.trim());
}

export function sanitizeSenderSettingsConfig(
  channelType: CommunicationChannelType,
  provider: string,
  values: CommunicationProviderConfig,
): CommunicationProviderConfig {
  return sanitizeCommunicationProviderConfig(channelType, provider, values);
}
