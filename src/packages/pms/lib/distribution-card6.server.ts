/**
 * Card 6 Distribution mapping and Phase 3 operational-sync types.
 *
 * Pure module. Channel rows reference Phase 1 integrations; they never carry
 * credentials. Operational activation does not claim a live OTA handshake.
 */

import type { IntegrationEnvironment, IntegrationRecord } from "./integrations-card6.server.ts";

export const DIRECT_CHANNEL_CODE = "DIRECT";

export const DISTRIBUTION_MAPPING_STATUSES = ["pending", "attention", "disabled"] as const;
export type DistributionMappingStatus = (typeof DISTRIBUTION_MAPPING_STATUSES)[number];

export const DISTRIBUTION_ACTIVATION_STATUSES = ["inactive", "active"] as const;
export type DistributionActivationStatus = (typeof DISTRIBUTION_ACTIVATION_STATUSES)[number];

export const DISTRIBUTION_SYNC_STATUSES = ["never_synced", "disabled"] as const;
export type DistributionSyncStatus = (typeof DISTRIBUTION_SYNC_STATUSES)[number];

export const SYNC_DIRECTIONS = ["outbound"] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const SYNC_FREQUENCIES = ["manual"] as const;
export type SyncFrequency = (typeof SYNC_FREQUENCIES)[number];

export type DistributionSyncConfig = {
  inventory: {
    enabled: boolean;
    direction: SyncDirection;
    availability: boolean;
    roomStatus: boolean;
    outOfOrder: boolean;
    outOfService: boolean;
  };
  rates: {
    enabled: boolean;
    direction: SyncDirection;
    rateUpdates: boolean;
    baseRates: boolean;
    derivedRates: boolean;
  };
  restrictions: {
    enabled: boolean;
    minimumStay: boolean;
    maximumStay: boolean;
    closedToArrival: boolean;
    closedToDeparture: boolean;
    stopSell: boolean;
  };
  frequency: SyncFrequency;
  automaticSync: boolean;
  retryEnabled: boolean;
  maxRetries: number;
};

export type DistributionSyncSummary = {
  status: DistributionSyncStatus;
  lastSyncAt: null;
  nextSyncAt: null;
  lastResult: null;
  recordsProcessed: null;
  recordsUpdated: null;
  recordsSkipped: null;
  errorCount: null;
};

export const DEFAULT_DISTRIBUTION_SYNC_CONFIG: DistributionSyncConfig = {
  inventory: {
    enabled: false,
    direction: "outbound",
    availability: true,
    roomStatus: false,
    outOfOrder: false,
    outOfService: false,
  },
  rates: {
    enabled: false,
    direction: "outbound",
    rateUpdates: true,
    baseRates: true,
    derivedRates: false,
  },
  restrictions: {
    enabled: false,
    minimumStay: false,
    maximumStay: false,
    closedToArrival: false,
    closedToDeparture: false,
    stopSell: false,
  },
  frequency: "manual",
  automaticSync: false,
  retryEnabled: false,
  maxRetries: 0,
};

export const DISTRIBUTION_ENVIRONMENTS = ["sandbox", "production"] as const;
export type DistributionEnvironment = (typeof DISTRIBUTION_ENVIRONMENTS)[number];

export const EXTERNAL_CATALOG_NOTICE =
  "External room types, rates and meals come from NORU's channel catalog, not from a live provider call.";
export const POLICY_MAPPING_NOTICE =
  "Policy mapping is not available. NORU has no cancellation or no-show policy catalogue to map from.";
export const SYNC_SERVICE_NOTICE =
  "Sync service not connected. This action cannot reach the external channel.";

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
  activationStatus: DistributionActivationStatus;
  enabled: boolean;
  roomMapped: number;
  roomTotal: number;
  rateMapped: number;
  rateTotal: number;
  mealMapped: number;
  mealTotal: number;
  syncConfig: DistributionSyncConfig;
  syncStatus: DistributionSyncSummary;
  activatedAt: string | null;
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
  channels: readonly {
    mappingStatus: DistributionMappingStatus;
    activationStatus: DistributionActivationStatus;
  }[],
): DistributionSummary {
  return {
    total: channels.length,
    connected: channels.filter((row) => row.activationStatus === "active").length,
    pending: channels.filter(
      (row) => row.activationStatus === "inactive" && row.mappingStatus === "pending",
    ).length,
    attention: channels.filter(
      (row) => row.activationStatus === "inactive" && row.mappingStatus === "attention",
    ).length,
  };
}

export function distributionActivationStatusLabel(status: DistributionActivationStatus): string {
  return status === "active" ? "Active" : "Inactive";
}

export function distributionSyncStatusLabel(status: DistributionSyncStatus): string {
  return status === "disabled" ? "Disabled" : "Never Synced";
}

export function normalizeDistributionSyncConfig(value: unknown): DistributionSyncConfig {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_DISTRIBUTION_SYNC_CONFIG);
  const input = value as Partial<DistributionSyncConfig>;
  return {
    inventory: {
      ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.inventory,
      ...(input.inventory ?? {}),
    },
    rates: {
      ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.rates,
      ...(input.rates ?? {}),
    },
    restrictions: {
      ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.restrictions,
      ...(input.restrictions ?? {}),
    },
    frequency: input.frequency === "manual" ? "manual" : "manual",
    automaticSync: false,
    retryEnabled: false,
    maxRetries: 0,
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
