/**
 * Pickup & Pace (UI-13) — snapshot-to-snapshot compose.
 *
 * Pickup = current OTB snapshot − prior OTB snapshot for the same
 * stay date × room type. Missing rows are excluded, never zero-filled.
 * Pace is the selected short-term window (1/3/7/14). No YoY. No forecast.
 */

import { z } from "zod";
import {
  clampDemandRange,
  computePickup,
  defaultDemandRange,
  DEMAND_AVAILABILITY_NOTE,
  DEMAND_FORECAST_AVAILABLE,
  DEMAND_PICKUP_WINDOWS,
  priorAsOfDate,
  type DemandPickupResult,
  type DemandSnapshotMetrics,
} from "./demand.ts";
import { computeBookedRevenueOverview } from "./revenue-metrics.ts";
import { snapshotToPickupMetrics, type OtbSnapshotRow } from "./demand-snapshot.ts";

export const PICKUP_DEFAULT_WINDOW_DAYS = 7;
export const PICKUP_SNAPSHOT_READ_LIMIT = 5000;

export const PICKUP_REQUIRES_TWO_SNAPSHOTS = "Pickup requires at least two OTB snapshots.";
export const PICKUP_NO_SNAPSHOTS = "No OTB snapshots have been captured yet.";
export const PICKUP_MISSING_PRIOR = "No snapshot exists for the selected comparison date.";
export const PICKUP_UNPRICED_NOTE =
  "Revenue pickup may be understated because some OTB room nights are unpriced.";
export const PICKUP_HISTORY_FROM_PREFIX = "Pickup history available from";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pickupPaceQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  windowDays: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]).default(PICKUP_DEFAULT_WINDOW_DAYS),
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
  roomTypeId: z.string().uuid().nullable().optional(),
});

export type PickupPaceQuery = z.infer<typeof pickupPaceQuerySchema>;
export type PickupWindowDays = (typeof DEMAND_PICKUP_WINDOWS)[number];

export type PickupHistoryReason = "no_snapshots" | "single_snapshot" | "missing_prior_as_of" | null;

export type PickupPair = {
  stayDate: string;
  roomTypeId: string;
  roomTypeName: string;
  current: DemandSnapshotMetrics;
  prior: DemandSnapshotMetrics;
  pickup: DemandPickupResult;
};

export type PickupDateRow = {
  stayDate: string;
  comparable: boolean;
  currentRoomsOnBooks: number | null;
  priorRoomsOnBooks: number | null;
  roomsPickup: number | null;
  revenuePickup: number | null;
  occupancyPointChange: number | null;
  roomsRemainingCurrent: number | null;
};

export type PickupRoomTypeRow = {
  roomTypeId: string;
  roomTypeName: string;
  comparable: boolean;
  priorOtb: number | null;
  currentOtb: number | null;
  roomsPickup: number | null;
  revenuePickup: number | null;
  occupancyPointChange: number | null;
  adrChange: number | null;
};

export type PickupSummary = {
  roomsPickup: number | null;
  revenuePickup: number | null;
  occupancyPointChange: number | null;
  adrChange: number | null;
  currentRoomsOnBooks: number | null;
  priorRoomsOnBooks: number | null;
  currentBookedRoomRevenue: number | null;
  priorBookedRoomRevenue: number | null;
  comparableRows: number;
  excludedRows: number;
  coverageTotal: number;
};

export type PickupLimitations = {
  forecastAvailable: false;
  availabilityIncludesFutureOosRisk: true;
  availabilityNote: string;
  unpricedReservationsPresent: boolean;
};

export type PickupPairRow = {
  stayDate: string;
  roomTypeId: string;
  roomsPickup: number | null;
  comparable: boolean;
};

export type PickupWorkspace = {
  currentAsOf: string | null;
  priorAsOf: string | null;
  windowDays: PickupWindowDays;
  historyAvailable: boolean;
  historyReason: PickupHistoryReason;
  snapshotHistoryStartsAt: string | null;
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currency: string;
  summary: PickupSummary;
  dates: PickupDateRow[];
  roomTypes: PickupRoomTypeRow[];
  pairRows: PickupPairRow[];
  limitations: PickupLimitations;
};

export type PickupBuildInput = {
  currentAsOf: string | null;
  priorAsOfExists: boolean;
  windowDays: PickupWindowDays;
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currentRows: OtbSnapshotRow[];
  priorRows: OtbSnapshotRow[];
  roomTypes: Array<{ id: string; name: string }>;
  snapshotHistoryStartsAt: string | null;
};

export function pickupWindowUnavailableCopy(windowDays: number): string {
  return `${windowDays}-day pickup is not available yet because snapshot history has not accumulated far enough.`;
}

export function pickupHistoryFromCopy(startsAt: string): string {
  return `${PICKUP_HISTORY_FROM_PREFIX} ${startsAt}.`;
}

export function pickupCoverageCopy(comparableRows: number, coverageTotal: number): string | null {
  if (coverageTotal <= 0 || comparableRows >= coverageTotal) return null;
  return `Pickup is based on ${comparableRows} of ${coverageTotal} comparable stay-date/room-type snapshot rows.`;
}

export function formatPickupPoints(value: number | null): string {
  if (value == null) return "unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} pts`;
}

export function resolvePickupStayRange(
  currentAsOf: string | null,
  fromDate?: string,
  toDate?: string,
) {
  if (fromDate && toDate) return clampDemandRange(fromDate, toDate);
  if (currentAsOf) {
    const fallback = defaultDemandRange(currentAsOf);
    return clampDemandRange(fromDate ?? fallback.fromDate, toDate ?? fallback.toDate);
  }
  const fallback = defaultDemandRange(fromDate ?? toDate ?? "1970-01-01");
  return clampDemandRange(fromDate ?? fallback.fromDate, toDate ?? fallback.toDate);
}

function pairKey(stayDate: string, roomTypeId: string): string {
  return `${stayDate}|${roomTypeId}`;
}

function emptySummary(): PickupSummary {
  return {
    roomsPickup: null,
    revenuePickup: null,
    occupancyPointChange: null,
    adrChange: null,
    currentRoomsOnBooks: null,
    priorRoomsOnBooks: null,
    currentBookedRoomRevenue: null,
    priorBookedRoomRevenue: null,
    comparableRows: 0,
    excludedRows: 0,
    coverageTotal: 0,
  };
}

function rollupSnapshotMetrics(rows: DemandSnapshotMetrics[]): DemandSnapshotMetrics | null {
  if (rows.length === 0) return null;
  const roomsOnBooks = rows.reduce((sum, row) => sum + row.roomsOnBooks, 0);
  const roomsAvailable = rows.reduce((sum, row) => sum + row.roomsAvailable, 0);
  const roomsRemaining = rows.reduce((sum, row) => sum + row.roomsRemaining, 0);
  const bookedRoomRevenue = rows.reduce((sum, row) => sum + row.bookedRoomRevenue, 0);
  const pricedRooms = rows.reduce((sum, row) => sum + row.pricedRooms, 0);
  const occupancy = computeBookedRevenueOverview({
    soldRoomNights: roomsOnBooks,
    availableRoomNights: roomsAvailable,
    bookedRoomRevenue: 0,
    pricedNights: 0,
  });
  const revenue = computeBookedRevenueOverview({
    soldRoomNights: roomsOnBooks,
    availableRoomNights: roomsAvailable,
    bookedRoomRevenue,
    pricedNights: pricedRooms,
  });
  return {
    roomsOnBooks,
    roomsAvailable,
    roomsRemaining,
    bookedRoomRevenue: revenue.roomRevenue,
    occupancyPercent: occupancy.occupancyPercent,
    adr: revenue.adr,
    revpar: revenue.revPar,
    pricedRooms,
    pricedShare: revenue.pricedShare,
  };
}

function pickupFromRollup(
  current: DemandSnapshotMetrics | null,
  prior: DemandSnapshotMetrics | null,
): DemandPickupResult {
  return computePickup({ current, prior });
}

function resolveHistoryReason(input: PickupBuildInput): PickupHistoryReason {
  if (!input.currentAsOf) return "no_snapshots";
  if (!input.snapshotHistoryStartsAt || input.snapshotHistoryStartsAt === input.currentAsOf) {
    return "single_snapshot";
  }
  if (!input.priorAsOfExists) return "missing_prior_as_of";
  return null;
}

export function buildPickupModel(input: PickupBuildInput): PickupWorkspace {
  const priorAsOf = input.currentAsOf ? priorAsOfDate(input.currentAsOf, input.windowDays) : null;
  const historyReason = resolveHistoryReason(input);
  const historyAvailable = historyReason == null;
  const names = new Map(input.roomTypes.map((type) => [type.id, type.name]));
  const currency = input.currentRows[0]?.currency ?? input.priorRows[0]?.currency ?? "";

  const limitations: PickupLimitations = {
    forecastAvailable: DEMAND_FORECAST_AVAILABLE,
    availabilityIncludesFutureOosRisk: true,
    availabilityNote: DEMAND_AVAILABILITY_NOTE,
    unpricedReservationsPresent: false,
  };

  if (!historyAvailable) {
    return {
      currentAsOf: input.currentAsOf,
      priorAsOf,
      windowDays: input.windowDays,
      historyAvailable: false,
      historyReason,
      snapshotHistoryStartsAt: input.snapshotHistoryStartsAt,
      fromDate: input.fromDate,
      toDate: input.toDate,
      requestedFrom: input.requestedFrom,
      requestedTo: input.requestedTo,
      rangeClamped: input.rangeClamped,
      currency,
      summary: emptySummary(),
      dates: [],
      roomTypes: [],
      pairRows: [],
      limitations,
    };
  }

  const currentByKey = new Map(input.currentRows.map((row) => [pairKey(row.stayDate, row.roomTypeId), row]));
  const priorByKey = new Map(input.priorRows.map((row) => [pairKey(row.stayDate, row.roomTypeId), row]));
  const unionKeys = new Set([...currentByKey.keys(), ...priorByKey.keys()]);

  const pairs: PickupPair[] = [];
  let excludedRows = 0;
  for (const key of unionKeys) {
    const currentRow = currentByKey.get(key);
    const priorRow = priorByKey.get(key);
    if (!currentRow || !priorRow) {
      excludedRows += 1;
      continue;
    }
    const current = snapshotToPickupMetrics(currentRow);
    const prior = snapshotToPickupMetrics(priorRow);
    const pickup = computePickup({ current, prior });
    pairs.push({
      stayDate: currentRow.stayDate,
      roomTypeId: currentRow.roomTypeId,
      roomTypeName: names.get(currentRow.roomTypeId) ?? "Room type",
      current,
      prior,
      pickup,
    });
  }

  const currentRollup = rollupSnapshotMetrics(pairs.map((pair) => pair.current));
  const priorRollup = rollupSnapshotMetrics(pairs.map((pair) => pair.prior));
  const summaryPickup = pickupFromRollup(currentRollup, priorRollup);
  limitations.unpricedReservationsPresent = pairs.some(
    (pair) => pair.current.pricedShare < 100 || pair.prior.pricedShare < 100,
  );

  const stayDates = [...new Set([...input.currentRows, ...input.priorRows].map((row) => row.stayDate))].sort();
  const dates: PickupDateRow[] = stayDates.map((stayDate) => {
    const datePairs = pairs.filter((pair) => pair.stayDate === stayDate);
    const currentOnly = input.currentRows.filter((row) => row.stayDate === stayDate);
    const priorOnly = input.priorRows.filter((row) => row.stayDate === stayDate);
    if (datePairs.length === 0) {
      return {
        stayDate,
        comparable: false,
        currentRoomsOnBooks: currentOnly.length > 0 ? currentOnly.reduce((sum, row) => sum + row.roomsOnBooks, 0) : null,
        priorRoomsOnBooks: priorOnly.length > 0 ? priorOnly.reduce((sum, row) => sum + row.roomsOnBooks, 0) : null,
        roomsPickup: null,
        revenuePickup: null,
        occupancyPointChange: null,
        roomsRemainingCurrent:
          currentOnly.length > 0 ? currentOnly.reduce((sum, row) => sum + row.roomsRemaining, 0) : null,
      };
    }
    const current = rollupSnapshotMetrics(datePairs.map((pair) => pair.current))!;
    const prior = rollupSnapshotMetrics(datePairs.map((pair) => pair.prior))!;
    const pickup = pickupFromRollup(current, prior);
    return {
      stayDate,
      comparable: true,
      currentRoomsOnBooks: current.roomsOnBooks,
      priorRoomsOnBooks: prior.roomsOnBooks,
      roomsPickup: pickup.roomsPickup,
      revenuePickup: pickup.revenuePickup,
      occupancyPointChange: pickup.occupancyPointChange,
      roomsRemainingCurrent: current.roomsRemaining,
    };
  });

  const typeIds = [...new Set([...input.currentRows, ...input.priorRows].map((row) => row.roomTypeId))];
  const roomTypes: PickupRoomTypeRow[] = typeIds
    .map((roomTypeId) => {
      const typePairs = pairs.filter((pair) => pair.roomTypeId === roomTypeId);
      const name = names.get(roomTypeId) ?? "Room type";
      if (typePairs.length === 0) {
        const currentOnly = input.currentRows.filter((row) => row.roomTypeId === roomTypeId);
        const priorOnly = input.priorRows.filter((row) => row.roomTypeId === roomTypeId);
        return {
          roomTypeId,
          roomTypeName: name,
          comparable: false,
          priorOtb: priorOnly.length > 0 ? priorOnly.reduce((sum, row) => sum + row.roomsOnBooks, 0) : null,
          currentOtb: currentOnly.length > 0 ? currentOnly.reduce((sum, row) => sum + row.roomsOnBooks, 0) : null,
          roomsPickup: null,
          revenuePickup: null,
          occupancyPointChange: null,
          adrChange: null,
        };
      }
      const current = rollupSnapshotMetrics(typePairs.map((pair) => pair.current))!;
      const prior = rollupSnapshotMetrics(typePairs.map((pair) => pair.prior))!;
      const pickup = pickupFromRollup(current, prior);
      return {
        roomTypeId,
        roomTypeName: name,
        comparable: true,
        priorOtb: prior.roomsOnBooks,
        currentOtb: current.roomsOnBooks,
        roomsPickup: pickup.roomsPickup,
        revenuePickup: pickup.revenuePickup,
        occupancyPointChange: pickup.occupancyPointChange,
        adrChange: pickup.adrChange,
      };
    })
    .sort((left, right) => {
      if (left.comparable !== right.comparable) return left.comparable ? -1 : 1;
      return (right.roomsPickup ?? Number.NEGATIVE_INFINITY) - (left.roomsPickup ?? Number.NEGATIVE_INFINITY);
    });

  return {
    currentAsOf: input.currentAsOf,
    priorAsOf,
    windowDays: input.windowDays,
    historyAvailable: true,
    historyReason: null,
    snapshotHistoryStartsAt: input.snapshotHistoryStartsAt,
    fromDate: input.fromDate,
    toDate: input.toDate,
    requestedFrom: input.requestedFrom,
    requestedTo: input.requestedTo,
    rangeClamped: input.rangeClamped,
    currency,
    summary: {
      roomsPickup: summaryPickup.roomsPickup,
      revenuePickup: summaryPickup.revenuePickup,
      occupancyPointChange: summaryPickup.occupancyPointChange,
      adrChange: summaryPickup.adrChange,
      currentRoomsOnBooks: currentRollup?.roomsOnBooks ?? null,
      priorRoomsOnBooks: priorRollup?.roomsOnBooks ?? null,
      currentBookedRoomRevenue: currentRollup?.bookedRoomRevenue ?? null,
      priorBookedRoomRevenue: priorRollup?.bookedRoomRevenue ?? null,
      comparableRows: pairs.length,
      excludedRows,
      coverageTotal: unionKeys.size,
    },
    dates,
    roomTypes,
    pairRows: pairs.map((pair) => ({
      stayDate: pair.stayDate,
      roomTypeId: pair.roomTypeId,
      roomsPickup: pair.pickup.roomsPickup,
      comparable: pair.pickup.available,
    })),
    limitations,
  };
}
