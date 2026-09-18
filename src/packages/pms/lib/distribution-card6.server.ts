/**
 * Card 6 Phase 2 — Distribution mapping types.
 *
 * Pure module. Channel rows reference Phase 1 integrations; they never carry
 * credentials. mapping_status is never "connected" — that would claim a live
 * OTA handshake Phase 2 does not perform.
 */

import type { IntegrationEnvironment, IntegrationRecord } from "./integrations-card6.server.ts";

export const DIRECT_CHANNEL_CODE = "DIRECT";

export const DISTRIBUTION_MAPPING_STATUSES = ["pending", "attention", "disabled"] as const;
export type DistributionMappingStatus = (typeof DISTRIBUTION_MAPPING_STATUSES)[number];

export const DISTRIBUTION_ENVIRONMENTS = ["sandbox", "production"] as const;
export type DistributionEnvironment = (typeof DISTRIBUTION_ENVIRONMENTS)[number];

export const LAST_SYNC_PHASE3_NOTICE =
  "Last sync is empty until Phase 3. Nothing here was sent to a channel.";
export const EXTERNAL_CATALOG_NOTICE =
  "External room types, rates and meals come from NORU's channel catalog, not from a live provider call.";
export const POLICY_MAPPING_NOTICE =
  "Policy mapping is not available. NORU has no cancellation or no-show policy catalogue to map from.";
export const SYNC_PHASE3_NOTICE = "Sync arrives in Phase 3. This action does not reach a channel.";

export type NamedEntity = { id: string; name: string };

export type DistributionMappingRow = {
  id: string;
  noruId: string;
  noruName: string;
  externalId: string;
  externalLabel: string;
};

export type DistributionChannelRecord = {
  id: string;
  integrationId: string;
  integrationName: string;
  provider: string;
  channel: string;
  channelLabel: string;
  environment: DistributionEnvironment;
  mappingStatus: DistributionMappingStatus;
  enabled: boolean;
  roomMapped: number;
  roomTotal: number;
  rateMapped: number;
  rateTotal: number;
  mealMapped: number;
  mealTotal: number;
  lastSyncAt: null;
  createdAt: string;
  updatedAt: string;
};

export type DistributionChannelDetail = DistributionChannelRecord & {
  roomMappings: DistributionMappingRow[];
  rateMappings: DistributionMappingRow[];
  mealMappings: DistributionMappingRow[];
};

export type EligibleIntegration = {
  id: string;
  name: string;
  provider: string;
  environment: IntegrationEnvironment;
  status: IntegrationRecord["status"];
  enabled: boolean;
  selectable: boolean;
};

export type DistributionSummary = {
  total: number;
  connected: number;
  pending: number;
  attention: number;
};

export type DistributionCard6Snapshot = {
  channels: DistributionChannelDetail[];
  integrations: EligibleIntegration[];
  roomTypes: NamedEntity[];
  ratePlans: NamedEntity[];
  mealPlans: NamedEntity[];
};

export type MappingPair = { noruId: string; externalId: string };

export type DistributionDraft = {
  integrationId: string;
  channel: string;
  environment: DistributionEnvironment;
  rooms: MappingPair[];
  rates: MappingPair[];
  meals: MappingPair[];
};

export type ValidationCheck = {
  id: string;
  label: string;
  passed: boolean;
  warning: boolean;
  detail: string | null;
};

export function distributionMappingStatusLabel(status: DistributionMappingStatus): string {
  return {
    pending: "Pending",
    attention: "Attention Required",
    disabled: "Disabled",
  }[status];
}

export function summarizeDistribution(
  channels: readonly { mappingStatus: DistributionMappingStatus }[],
): DistributionSummary {
  return {
    total: channels.length,
    connected: 0,
    pending: channels.filter((row) => row.mappingStatus === "pending").length,
    attention: channels.filter((row) => row.mappingStatus === "attention").length,
  };
}

export function isSelectableDistributionIntegration(row: {
  enabled: boolean;
  status: string;
}): boolean {
  return row.enabled && (row.status === "pending" || row.status === "connected");
}

/**
 * Card 6 never claims a live channel handshake. Incomplete required mappings
 * become attention; a complete draft stays pending.
 */
export function mappingStatusAfterSave(
  enabled: boolean,
  incompleteRequired: boolean,
): DistributionMappingStatus {
  if (!enabled) return "disabled";
  return incompleteRequired ? "attention" : "pending";
}

export function mappingStatusAfterToggle(
  enabled: boolean,
  previous: DistributionMappingStatus,
): DistributionMappingStatus {
  if (!enabled) return "disabled";
  return previous === "disabled" ? "pending" : previous;
}

export function asDistributionEnvironment(
  value: string | null | undefined,
): DistributionEnvironment {
  return value === "production" ? "production" : "sandbox";
}
