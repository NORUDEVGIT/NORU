/**
 * AIOS-02 technical sync event.
 * Callers pass a summary message only. There is no body, credential, or card field.
 */
import { distributionProvider } from "./external-reservation-identity";

const EVENT_FIELDS = [
  "restaurantId",
  "provider",
  "direction",
  "channel",
  "externalBookingId",
  "operation",
  "status",
  "responseSuccess",
  "responseMessage",
  "attemptCount",
  "retryEligible",
] as const;

export type DistributionSyncDirection = "inbound" | "outbound";
export type DistributionSyncStatus = "success" | "failed" | "info";

export type DistributionSyncEventInput = {
  restaurantId: string;
  provider: string;
  direction: DistributionSyncDirection;
  channel?: string | null;
  externalBookingId?: string | null;
  operation: string;
  status: DistributionSyncStatus;
  responseSuccess?: boolean | null;
  responseMessage?: string | null;
  attemptCount?: number;
  retryEligible?: boolean;
};

export type DistributionSyncEventInsert = {
  restaurant_id: string;
  provider: "aiosell";
  direction: DistributionSyncDirection;
  channel: string | null;
  external_booking_id: string | null;
  operation: string;
  status: DistributionSyncStatus;
  response_success: boolean | null;
  response_message: string | null;
  attempt_count: number;
  retry_eligible: boolean;
};

export function toDistributionSyncEventInsert(
  input: DistributionSyncEventInput,
): DistributionSyncEventInsert {
  const unexpected = Object.keys(input).filter(
    (key) => !EVENT_FIELDS.includes(key as (typeof EVENT_FIELDS)[number]),
  );
  if (unexpected.length > 0) {
    throw new Error("DISTRIBUTION_SYNC_EVENT_FIELD_REJECTED");
  }
  const provider = distributionProvider(input.provider);
  if (!input.operation) {
    throw new Error("DISTRIBUTION_SYNC_EVENT_FIELD_REJECTED");
  }
  if (
    input.attemptCount !== undefined &&
    (!Number.isInteger(input.attemptCount) || input.attemptCount < 1)
  ) {
    throw new Error("DISTRIBUTION_SYNC_EVENT_FIELD_REJECTED");
  }
  return {
    restaurant_id: input.restaurantId,
    provider,
    direction: input.direction,
    channel: input.channel ?? null,
    external_booking_id: input.externalBookingId ?? null,
    operation: input.operation,
    status: input.status,
    response_success: input.responseSuccess ?? null,
    response_message: input.responseMessage ?? null,
    attempt_count: input.attemptCount ?? 1,
    retry_eligible: input.retryEligible ?? false,
  };
}
