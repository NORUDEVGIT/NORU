/**
 * Demand read model (RR-P4-01) — live OTB composition and pickup math.
 *
 * Live occupancy uses the same booked formulas as Revenue Control / Rate Calendar:
 * computeBookedRevenueOverview + active hotel_rooms × nights.
 * Pending is not included. Cancelled / no-show are excluded.
 *
 * Rate-plan occupancy is not computed: inventory belongs to the room type.
 * A rate-plan filter applies to booked revenue / recent bookings only.
 *
 * Open product decision (not invented here): pending-in-OTB stays false so Phase 1
 * metric semantics are unchanged. Inventory RPCs still count pending separately.
 */

import { z } from "zod";
import { addDays, nightsBetween } from "../../../../shared/lib/property-dates.ts";
import { computeBookedRevenueOverview } from "./revenue-metrics.ts";

export type DemandNightlyRate = {
  date: string;
  rate: number;
};

function eachDate(from: string, to: string, maxDays: number): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export const DEMAND_DEFAULT_RANGE_DAYS = 30;
export const DEMAND_MAX_RANGE_DAYS = 90;
export const DEMAND_SNAPSHOT_HORIZON_DAYS = 90;
export const DEMAND_RECENT_BOOKING_DAYS = 7;
export const DEMAND_PICKUP_WINDOWS = [1, 3, 7, 14] as const;
export const DEMAND_AVAILABILITY_BASIS = "active_hotel_rooms" as const;
export const DEMAND_OTB_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;
export const DEMAND_PENDING_INCLUDED = false;
export const DEMAND_FORECAST_AVAILABLE = false;

export const DEMAND_AVAILABILITY_NOTE =
  "Available rooms count active hotel_rooms × nights and may include OOO/OOS rooms.";
export const DEMAND_HISTORY_START_COPY =
  "Pickup history is available from the date demand snapshots were enabled.";
export const DEMAND_NO_BACKFILL_COPY =
  "Earlier on-the-books state cannot be reconstructed. History starts when snapshot capture was enabled.";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const demandQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
  roomTypeId: z.string().uuid().nullable().optional(),
  ratePlanId: z.string().uuid().nullable().optional(),
});

export type DemandQuery = z.infer<typeof demandQuerySchema>;

export type DemandReservation = {
  roomTypeId: string;
  ratePlanId: string | null;
  arrivalDate: string;
  departureDate: string;
  nightly: DemandNightlyRate[];
  createdAt: string;
};

export type DemandRoom = {
  id: string;
  roomTypeId: string;
};

export type DemandRoomType = {
  id: string;
  name: string;
};

export type DemandPlan = {
  id: string;
  roomTypeId: string;
};

export type DemandOverride = {
  ratePlanId: string;
  date: string;
};

export type DemandRestriction = {
  ratePlanId: string;
  date: string;
};

export type DemandCellMetrics = {
  date: string;
  roomTypeId: string;
  roomTypeName: string;
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
  soldRoomNights: number;
  revenueSoldNights: number;
  adr: number;
  revpar: number;
  pricedRooms: number;
  pricedShare: number;
  recentBookings: number;
  activeRestrictionCount: number;
  rateOverrideCount: number;
  daysToArrival: number;
};

export type DemandDateRow = {
  date: string;
  daysToArrival: number;
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
  adr: number;
  revpar: number;
  pricedShare: number;
  recentBookings: number;
  roomTypes: DemandCellMetrics[];
};

export type DemandSummary = {
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
  adr: number;
  revpar: number;
  pricedShare: number;
  recentBookings: number;
  averageLeadTimeDays: number | null;
};

export type DemandLimitations = {
  availabilityBasis: typeof DEMAND_AVAILABILITY_BASIS;
  availabilityIncludesFutureOosRisk: true;
  unpricedReservationsPresent: boolean;
  forecastAvailable: false;
  pendingIncludedInOtb: false;
  ratePlanFilterAppliesToRevenueOnly: boolean;
  snapshotHistoryAvailable: boolean;
  snapshotHistoryStartsAt: string | null;
};

export type DemandWorkspace = {
  asOfBusinessDate: string;
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currency: string;
  timezone: string;
  summary: DemandSummary;
  dates: DemandDateRow[];
  limitations: DemandLimitations;
};

export type DemandSnapshotMetrics = {
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  bookedRoomRevenue: number;
  occupancyPercent: number;
  adr: number;
  revpar: number;
  pricedRooms: number;
  pricedShare: number;
};

export type DemandPickupResult = {
  available: boolean;
  roomsPickup: number | null;
  revenuePickup: number | null;
  occupancyPointChange: number | null;
  adrChange: number | null;
  reason: "missing_prior_snapshot" | "missing_current_snapshot" | null;
};

export function propertyDateFromInstant(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function leadTimeDays(arrivalDate: string, createdLocalDate: string): number {
  return nightsBetween(createdLocalDate, arrivalDate);
}

export function daysToArrival(asOfBusinessDate: string, stayDate: string): number {
  return nightsBetween(asOfBusinessDate, stayDate);
}

export function defaultDemandRange(businessDate: string): { fromDate: string; toDate: string } {
  return {
    fromDate: businessDate,
    toDate: addDays(businessDate, DEMAND_DEFAULT_RANGE_DAYS - 1),
  };
}

export function snapshotStayRange(asOfBusinessDate: string): { fromDate: string; toDate: string } {
  return {
    fromDate: asOfBusinessDate,
    toDate: addDays(asOfBusinessDate, DEMAND_SNAPSHOT_HORIZON_DAYS - 1),
  };
}

export function clampDemandRange(
  fromDate: string,
  toDate: string,
): {
  fromDate: string;
  toDate: string;
  rangeClamped: boolean;
  requestedFrom: string;
  requestedTo: string;
} {
  const requestedFrom = toDate < fromDate ? toDate : fromDate;
  const requestedTo = toDate < fromDate ? fromDate : toDate;
  const dates = eachDate(requestedFrom, requestedTo, DEMAND_MAX_RANGE_DAYS);
  const clampedFrom = dates[0] ?? requestedFrom;
  const clampedTo = dates[dates.length - 1] ?? requestedFrom;
  return {
    fromDate: clampedFrom,
    toDate: clampedTo,
    rangeClamped: requestedTo > clampedTo,
    requestedFrom,
    requestedTo,
  };
}

export function priorAsOfDate(asOfBusinessDate: string, windowDays: number): string {
  return addDays(asOfBusinessDate, -windowDays);
}

export function computePickup(input: {
  current: DemandSnapshotMetrics | null;
  prior: DemandSnapshotMetrics | null;
}): DemandPickupResult {
  if (!input.prior) {
    return {
      available: false,
      roomsPickup: null,
      revenuePickup: null,
      occupancyPointChange: null,
      adrChange: null,
      reason: "missing_prior_snapshot",
    };
  }
  if (!input.current) {
    return {
      available: false,
      roomsPickup: null,
      revenuePickup: null,
      occupancyPointChange: null,
      adrChange: null,
      reason: "missing_current_snapshot",
    };
  }
  return {
    available: true,
    roomsPickup: input.current.roomsOnBooks - input.prior.roomsOnBooks,
    revenuePickup: round2(input.current.bookedRoomRevenue - input.prior.bookedRoomRevenue),
    occupancyPointChange: round2(input.current.occupancyPercent - input.prior.occupancyPercent),
    adrChange: round2(input.current.adr - input.prior.adr),
    reason: null,
  };
}

function stayDatesInRange(arrival: string, departure: string, dates: Set<string>): string[] {
  return eachDate(arrival, departure, 400).filter((date) => date < departure && dates.has(date));
}

function roomsByType(rooms: DemandRoom[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const room of rooms) {
    counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1);
  }
  return counts;
}

function recentWindowStart(asOfBusinessDate: string): string {
  return addDays(asOfBusinessDate, 1 - DEMAND_RECENT_BOOKING_DAYS);
}

export function isRecentBooking(createdLocalDate: string, asOfBusinessDate: string): boolean {
  const start = recentWindowStart(asOfBusinessDate);
  return createdLocalDate >= start && createdLocalDate <= asOfBusinessDate;
}

export type DemandBuildInput = {
  asOfBusinessDate: string;
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  timezone: string;
  currency: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  rooms: DemandRoom[];
  roomTypes: DemandRoomType[];
  reservations: DemandReservation[];
  plans: DemandPlan[];
  overrides: DemandOverride[];
  restrictions: DemandRestriction[];
  snapshotHistoryStartsAt: string | null;
};

export function buildDemandModel(input: DemandBuildInput): DemandWorkspace {
  const dates = eachDate(input.fromDate, input.toDate, DEMAND_MAX_RANGE_DAYS);
  const dateSet = new Set(dates);
  const types = input.roomTypeId
    ? input.roomTypes.filter((type) => type.id === input.roomTypeId)
    : input.roomTypes;
  const capacity = roomsByType(input.rooms);
  const planType = new Map(input.plans.map((plan) => [plan.id, plan.roomTypeId]));

  const occupancyReservations = input.reservations.filter((row) => {
    if (input.roomTypeId && row.roomTypeId !== input.roomTypeId) return false;
    return true;
  });
  const revenueReservations = occupancyReservations.filter((row) => {
    if (input.ratePlanId && row.ratePlanId !== input.ratePlanId) return false;
    return true;
  });

  const cells: DemandCellMetrics[] = [];
  for (const type of types) {
    const roomsAvailable = capacity.get(type.id) ?? 0;
    for (const date of dates) {
      const typeOccupancy = occupancyReservations.filter((row) => row.roomTypeId === type.id);
      const typeRevenue = revenueReservations.filter((row) => row.roomTypeId === type.id);
      const occupied = typeOccupancy.filter((row) => stayDatesInRange(row.arrivalDate, row.departureDate, dateSet).includes(date));
      const revenueOccupied = typeRevenue.filter((row) =>
        stayDatesInRange(row.arrivalDate, row.departureDate, dateSet).includes(date),
      );
      const revenueNights = typeRevenue.flatMap((row) =>
        row.nightly.filter((night) => night.date === date),
      );
      const roomsOnBooks = occupied.length;
      const bookedRoomRevenue = revenueNights.reduce((sum, night) => sum + night.rate, 0);
      const pricedRooms = revenueNights.length;
      const occupancy = computeBookedRevenueOverview({
        soldRoomNights: roomsOnBooks,
        availableRoomNights: roomsAvailable,
        bookedRoomRevenue: 0,
        pricedNights: 0,
      });
      const revenue = computeBookedRevenueOverview({
        soldRoomNights: revenueOccupied.length,
        availableRoomNights: roomsAvailable,
        bookedRoomRevenue,
        pricedNights: pricedRooms,
      });
      const recentBookings = typeRevenue.filter((row) => {
        if (!stayDatesInRange(row.arrivalDate, row.departureDate, dateSet).includes(date)) return false;
        return isRecentBooking(propertyDateFromInstant(row.createdAt, input.timezone), input.asOfBusinessDate);
      }).length;
      const restrictionCount = input.restrictions.filter((row) => {
        if (row.date !== date) return false;
        return planType.get(row.ratePlanId) === type.id;
      }).length;
      const overrideCount = input.overrides.filter((row) => {
        if (row.date !== date) return false;
        return planType.get(row.ratePlanId) === type.id;
      }).length;
      cells.push({
        date,
        roomTypeId: type.id,
        roomTypeName: type.name,
        roomsOnBooks,
        roomsAvailable,
        roomsRemaining: Math.max(0, roomsAvailable - roomsOnBooks),
        occupancyPercent: occupancy.occupancyPercent,
        bookedRoomRevenue: revenue.roomRevenue,
        soldRoomNights: roomsOnBooks,
        revenueSoldNights: revenueOccupied.length,
        adr: revenue.adr,
        revpar: revenue.revPar,
        pricedRooms,
        pricedShare: revenue.pricedShare,
        recentBookings,
        activeRestrictionCount: restrictionCount,
        rateOverrideCount: overrideCount,
        daysToArrival: daysToArrival(input.asOfBusinessDate, date),
      });
    }
  }

  const dateRows: DemandDateRow[] = dates.map((date) => {
    const roomTypes = cells.filter((cell) => cell.date === date);
    const roomsOnBooks = roomTypes.reduce((sum, cell) => sum + cell.roomsOnBooks, 0);
    const roomsAvailable = roomTypes.reduce((sum, cell) => sum + cell.roomsAvailable, 0);
    const bookedRoomRevenue = roomTypes.reduce((sum, cell) => sum + cell.bookedRoomRevenue, 0);
    const pricedRooms = roomTypes.reduce((sum, cell) => sum + cell.pricedRooms, 0);
    const revenueSoldNights = roomTypes.reduce((sum, cell) => sum + cell.revenueSoldNights, 0);
    const occupancy = computeBookedRevenueOverview({
      soldRoomNights: roomsOnBooks,
      availableRoomNights: roomsAvailable,
      bookedRoomRevenue: 0,
      pricedNights: 0,
    });
    const metrics = computeBookedRevenueOverview({
      soldRoomNights: revenueSoldNights,
      availableRoomNights: roomsAvailable,
      bookedRoomRevenue,
      pricedNights: pricedRooms,
    });
    return {
      date,
      daysToArrival: daysToArrival(input.asOfBusinessDate, date),
      roomsOnBooks,
      roomsAvailable,
      roomsRemaining: Math.max(0, roomsAvailable - roomsOnBooks),
      occupancyPercent: occupancy.occupancyPercent,
      bookedRoomRevenue: metrics.roomRevenue,
      adr: metrics.adr,
      revpar: metrics.revPar,
      pricedShare: metrics.pricedShare,
      recentBookings: roomTypes.reduce((sum, cell) => sum + cell.recentBookings, 0),
      roomTypes,
    };
  });

  const roomsOnBooks = dateRows.reduce((sum, row) => sum + row.roomsOnBooks, 0);
  const roomsAvailable = dateRows.reduce((sum, row) => sum + row.roomsAvailable, 0);
  const bookedRoomRevenue = dateRows.reduce((sum, row) => sum + row.bookedRoomRevenue, 0);
  const pricedRooms = cells.reduce((sum, cell) => sum + cell.pricedRooms, 0);
  const revenueSoldNights = cells.reduce((sum, cell) => sum + cell.revenueSoldNights, 0);
  const occupancyMetrics = computeBookedRevenueOverview({
    soldRoomNights: roomsOnBooks,
    availableRoomNights: roomsAvailable,
    bookedRoomRevenue: 0,
    pricedNights: 0,
  });
  const summaryMetrics = computeBookedRevenueOverview({
    soldRoomNights: revenueSoldNights,
    availableRoomNights: roomsAvailable,
    bookedRoomRevenue,
    pricedNights: pricedRooms,
  });

  const leadSamples = occupancyReservations
    .map((row) => leadTimeDays(row.arrivalDate, propertyDateFromInstant(row.createdAt, input.timezone)))
    .filter((value) => Number.isFinite(value));
  const averageLeadTimeDays =
    leadSamples.length > 0
      ? round2(leadSamples.reduce((sum, value) => sum + value, 0) / leadSamples.length)
      : null;

  return {
    asOfBusinessDate: input.asOfBusinessDate,
    fromDate: input.fromDate,
    toDate: input.toDate,
    requestedFrom: input.requestedFrom,
    requestedTo: input.requestedTo,
    rangeClamped: input.rangeClamped,
    currency: input.currency,
    timezone: input.timezone,
    summary: {
      roomsOnBooks,
      roomsAvailable,
      roomsRemaining: Math.max(0, roomsAvailable - roomsOnBooks),
      occupancyPercent: occupancyMetrics.occupancyPercent,
      bookedRoomRevenue: summaryMetrics.roomRevenue,
      adr: summaryMetrics.adr,
      revpar: summaryMetrics.revPar,
      pricedShare: summaryMetrics.pricedShare,
      recentBookings: dateRows.reduce((sum, row) => sum + row.recentBookings, 0),
      averageLeadTimeDays,
    },
    dates: dateRows,
    limitations: {
      availabilityBasis: DEMAND_AVAILABILITY_BASIS,
      availabilityIncludesFutureOosRisk: true,
      unpricedReservationsPresent: roomsOnBooks > 0 && pricedRooms < roomsOnBooks,
      forecastAvailable: DEMAND_FORECAST_AVAILABLE,
      pendingIncludedInOtb: DEMAND_PENDING_INCLUDED,
      ratePlanFilterAppliesToRevenueOnly: Boolean(input.ratePlanId),
      snapshotHistoryAvailable: Boolean(input.snapshotHistoryStartsAt),
      snapshotHistoryStartsAt: input.snapshotHistoryStartsAt,
    },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
