/**
 * Reservation Create source/channel read contract.
 *
 * Source is the commercial category from pms_source_codes (or the existing
 * default list when that catalogue has no active rows). Channel for an OTA
 * booking is an active distribution_channels row. These are not the same list.
 *
 * Compatibility debt: a property may already have a source-code row whose
 * name is a channel brand, such as Booking.com. That row stays a source
 * option. It is not rewritten and it is not treated as the OTA category.
 * commercial_sales_channel remains free text. Historical values may be SET6
 * pms_sales_channel_labels ids. New OTA creates store a distribution channel
 * id in that same column. Display resolves a UUID against distribution
 * channels first, then the existing sales-channel labels.
 */
import {
  DEFAULT_BOOKING_SOURCES,
  resolveBookingSourceOptions,
  type ContextPickOption,
} from "./create-reservation-phase1";
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution";

export const RESERVATION_CHANNEL_ANCHORS = ["aiosell.sandbox", "aiosell.production"] as const;

/** Existing create field. A distribution channel id fits the 40-character limit. */
export const RESERVATION_CHANNEL_CREATE_FIELD = "commercialSalesChannel" as const;

export type ReservationEnvironment = "sandbox" | "production";

export type ReservationChannelRow = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  channelType: string;
  status: string;
  environment: string;
  integrationId: string | null;
};

export type ReservationCreateChannel = {
  id: string;
  code: string;
  name: string;
  channelType: "ota";
  integrationId: string;
};

export type ReservationSourceOption = {
  id: string;
  code: string;
  name: string;
  otaCategory: boolean;
  origin: "set6" | "default";
};

const ANCHORS = new Set<string>(RESERVATION_CHANNEL_ANCHORS);

export function reservationSourceIsOta(source: { code: string; name: string }): boolean {
  const code = source.code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (code === "OTA") return true;
  return source.name.trim().toLowerCase() === "ota";
}

export function projectReservationSources(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ReservationSourceOption[] {
  const active = (rows ?? []).filter((row) => row.active);
  if (active.length > 0) {
    return active.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      otaCategory: reservationSourceIsOta(row),
      origin: "set6" as const,
    }));
  }
  return DEFAULT_BOOKING_SOURCES.map((row) => ({
    id: row.value,
    code: row.value,
    name: row.label,
    otaCategory: false,
    origin: "default" as const,
  }));
}

/** Same values the create screen already loads. Channel rows are not an input. */
export function reservationSourcePickOptions(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ContextPickOption[] {
  return resolveBookingSourceOptions(rows);
}

export function selectReservationOtaChannels(input: {
  restaurantId: string;
  environment: ReservationEnvironment;
  channels: ReservationChannelRow[];
  enabledIntegrationIds: readonly string[];
}): ReservationCreateChannel[] {
  const enabled = new Set(input.enabledIntegrationIds);
  return input.channels
    .filter((row) => {
      if (row.restaurantId !== input.restaurantId) return false;
      if (row.environment !== input.environment) return false;
      if (row.status !== "active") return false;
      if (row.channelType !== "ota") return false;
      if (ANCHORS.has(row.code)) return false;
      if (!row.integrationId || !enabled.has(row.integrationId)) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      channelType: "ota" as const,
      integrationId: row.integrationId as string,
    }))
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code),
    );
}

export function reservationSourceChannelDecision(input: {
  source: { code: string; name: string } | null;
  channelId: string | null;
  channels: ReservationCreateChannel[];
}): {
  otaChannelRequired: boolean;
  accepted: boolean;
  code: "ok" | "OTA_CHANNEL_REQUIRED" | "OTA_CHANNEL_UNKNOWN";
} {
  const otaChannelRequired = input.source != null && reservationSourceIsOta(input.source);
  if (!otaChannelRequired) return { otaChannelRequired: false, accepted: true, code: "ok" };
  if (!input.channelId) {
    return { otaChannelRequired: true, accepted: false, code: "OTA_CHANNEL_REQUIRED" };
  }
  const known = input.channels.some((row) => row.id === input.channelId);
  if (!known) return { otaChannelRequired: true, accepted: false, code: "OTA_CHANNEL_UNKNOWN" };
  return { otaChannelRequired: true, accepted: true, code: "ok" };
}

export function reservationChannelCreateValue(channel: ReservationCreateChannel): string {
  return channel.id;
}

const CHANNEL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OTA_CHANNEL_EMPTY_MESSAGE = "No active OTA channel is configured for this property.";
export const OTA_CHANNEL_REQUIRED_MESSAGE = "Channel is required to continue.";

export function enabledReservationEnvironments(
  rows: { environment: string; enabled: boolean; status: string }[],
): ReservationEnvironment[] {
  const found = new Set<ReservationEnvironment>();
  for (const row of rows) {
    if (!row.enabled || row.status === "disabled") continue;
    if (row.environment === "sandbox" || row.environment === "production") {
      found.add(row.environment);
    }
  }
  return [...found];
}

/** One enabled integration environment. Both or neither stays unresolved. */
export function reservationCreateEnvironment(
  environments: readonly ReservationEnvironment[],
): ReservationEnvironment | null {
  if (environments.length === 1) return environments[0] ?? null;
  return null;
}

export function reservationCreateChannelForm(input: {
  sources: ReservationSourceOption[];
  channels: ReservationCreateChannel[];
  bookingSource: string;
  salesChannel: string;
}): {
  sourceOptions: { value: string; label: string }[];
  channelOptions: { value: string; label: string }[];
  otaCategory: boolean;
  channelEnabled: boolean;
  channelRequired: boolean;
  salesChannel: string;
  commercialBookingSource: string | null;
  commercialSalesChannel: string | null;
  accepted: boolean;
  message: string | null;
  reviewChannel: string;
} {
  const selected = input.sources.find((row) => row.id === input.bookingSource) ?? null;
  const otaCategory = selected?.otaCategory === true;
  const known = input.channels.some((row) => row.id === input.salesChannel);
  const salesChannel = otaCategory && known ? input.salesChannel : "";
  const decision = reservationSourceChannelDecision({
    source: selected ? { code: selected.code, name: selected.name } : null,
    channelId: salesChannel || null,
    channels: input.channels,
  });
  const message =
    otaCategory && input.channels.length === 0
      ? OTA_CHANNEL_EMPTY_MESSAGE
      : otaCategory && !salesChannel
        ? OTA_CHANNEL_REQUIRED_MESSAGE
        : null;
  const reviewName = input.channels.find((row) => row.id === salesChannel)?.name?.trim() ?? "";
  return {
    sourceOptions: input.sources.map((row) => ({ value: row.id, label: row.name })),
    channelOptions: otaCategory
      ? input.channels.map((row) => ({ value: row.id, label: row.name }))
      : [],
    otaCategory,
    channelEnabled: otaCategory && input.channels.length > 0,
    channelRequired: otaCategory,
    salesChannel,
    commercialBookingSource: input.bookingSource.trim() || null,
    commercialSalesChannel: otaCategory ? salesChannel || null : null,
    accepted: Boolean(input.bookingSource.trim()) && decision.accepted,
    message,
    reviewChannel: otaCategory && reviewName && !CHANNEL_UUID.test(reviewName) ? reviewName : "",
  };
}

export function commercialSalesChannelDisplay(input: {
  stored: string | null | undefined;
  distributionName: string | null;
  salesLabel: string | null;
  unresolvedUuid: string;
}): string | null {
  const stored = input.stored?.trim() ?? "";
  if (!stored) return null;
  const distributionName = input.distributionName?.trim() ?? "";
  if (CHANNEL_UUID.test(stored) && distributionName && !CHANNEL_UUID.test(distributionName)) {
    return distributionName;
  }
  const salesLabel = input.salesLabel?.trim() ?? "";
  if (salesLabel) return salesLabel;
  if (CHANNEL_UUID.test(stored)) return input.unresolvedUuid;
  return stored;
}
