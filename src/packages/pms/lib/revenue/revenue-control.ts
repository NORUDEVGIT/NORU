/**
 * Revenue Control (UI-01) read-model helpers.
 *
 * Occupancy / available / RevPAR use date + optional room type only.
 * Booked revenue / ADR / sold nights also accept an optional rate plan.
 * Segment, source, and channel are accepted on the request but never applied
 * (no inventory denominator for those dimensions).
 *
 * Reuses computeBookedRevenueOverview. Does not invent forecast, approval,
 * competitor, or demand-threshold product.
 */

import { z } from "zod";
import { computeBookedRevenueOverview, type BookedRevenueOverviewMetrics } from "./revenue-metrics.ts";
import type { RateChangeHistoryRow } from "./rate-change.ts";

function eachDate(from: string, to: string, maxDays = 120): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return out;
}

export const REVENUE_CONTROL_MAX_RANGE_DAYS = 62;
export const REVENUE_CONTROL_DEFAULT_RANGE_DAYS = 30;
export const REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT = 90;
export const REVENUE_CONTROL_LOW_REMAINING_RATIO = 0.2;
export const REVENUE_CONTROL_OVERRIDE_SHARE = 0.5;
export const REVENUE_CONTROL_PLAN_ENDING_DAYS = 14;
export const REVENUE_CONTROL_HISTORY_LIMIT = 8;
export const REVENUE_CONTROL_ROOM_TYPE_LIMIT = 6;

export const HISTORY_EMPTY_COPY =
  "No rate changes have been recorded since rate-change history was enabled.";

export const COMMERCIAL_FILTER_NOTE =
  "Market segment, source and channel are not applied to occupancy or inventory.";

export type RevenueControlSignal =
  | "High Occupancy"
  | "Low Remaining Inventory"
  | "Restriction Active"
  | "Override Active"
  | "Open";

export type RevenueControlAlertTone = "danger" | "warning" | "info";

export type RevenueControlAlert = {
  id: string;
  tone: RevenueControlAlertTone;
  title: string;
  detail: string;
};

export type RevenueControlAppliedFilters = {
  fromDate: string;
  toDate: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  occupancyScope: "property" | "room-type";
  revenueScope: "property" | "room-type" | "rate-plan";
  commercialFiltersIgnored: boolean;
};

export type RevenueControlNight = {
  date: string;
  soldRoomNights: number;
  availableRoomNights: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
};

export type RevenueControlRoomTypeRow = {
  roomTypeId: string;
  roomTypeName: string;
  occupancyPercent: number;
  adr: number;
  bookedRoomRevenue: number;
  soldRoomNights: number;
  availableRoomNights: number;
};

export type RevenueControlRestrictionRow = {
  date: string;
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  roomTypeId: string;
  roomTypeName: string;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
  label: string;
};

export type RevenueControlWorkRow = {
  date: string;
  occupancyPercent: number;
  soldRoomNights: number;
  availableRoomNights: number;
  remainingRoomNights: number;
  ratePlanId: string | null;
  ratePlanCode: string | null;
  effectiveRate: number | null;
  overrideActive: boolean;
  restrictionLabel: string | null;
  signal: RevenueControlSignal;
};

export type RevenueControlActivity = {
  available: boolean;
  empty: boolean;
  rows: RateChangeHistoryRow[];
};

export type RevenueControlWorkspace = {
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currency: string;
  summary: BookedRevenueOverviewMetrics & {
    occupancySoldRoomNights: number;
    occupancyAvailableRoomNights: number;
  };
  appliedFilters: RevenueControlAppliedFilters;
  filterCaption: string;
  commercialFilterNote: string | null;
  slotMetrics: {
    remainingRoomNights: number;
    activeRestrictionCount: number;
    overrideCount: number;
  };
  nightly: RevenueControlNight[];
  roomTypes: RevenueControlRoomTypeRow[];
  alerts: RevenueControlAlert[];
  controlRows: RevenueControlWorkRow[];
  restrictionAttention: RevenueControlRestrictionRow[];
  recentActivity: RevenueControlActivity;
  focusRatePlan: { id: string; code: string; name: string } | null;
  restrictionsError: string | null;
  historyError: string | null;
};

export type ControlReservation = {
  roomTypeId: string;
  ratePlanId: string | null;
  arrivalDate: string;
  departureDate: string;
  nightly: { date: string; rate: number }[];
};

export type ControlRoom = { id: string; roomTypeId: string };
export type ControlRoomType = { id: string; name: string };
export type ControlPlan = {
  id: string;
  code: string;
  name: string;
  roomTypeId: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
};
export type ControlOverride = { ratePlanId: string; date: string; nightlyRate: number };
export type ControlRestriction = {
  ratePlanId: string;
  date: string;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export type RevenueControlBuildInput = {
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  roomTypeId: string | null;
  ratePlanId: string | null;
  marketSegmentId?: string | null;
  commercialSourceId?: string | null;
  salesChannelId?: string | null;
  asOfDate: string;
  currency: string;
  rooms: ControlRoom[];
  roomTypes: ControlRoomType[];
  reservations: ControlReservation[];
  plans: ControlPlan[];
  overrides: ControlOverride[];
  restrictions: ControlRestriction[];
  history: RateChangeHistoryRow[] | null;
  restrictionsError?: string | null;
  historyError?: string | null;
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const revenueControlQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
  roomTypeId: z.string().uuid().nullable().optional(),
  ratePlanId: z.string().uuid().nullable().optional(),
  marketSegmentId: z.string().uuid().nullable().optional(),
  commercialSourceId: z.string().uuid().nullable().optional(),
  salesChannelId: z.string().uuid().nullable().optional(),
});

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function defaultControlCenterRange(businessDate: string): { fromDate: string; toDate: string } {
  return {
    fromDate: shiftIsoDate(businessDate, 1 - REVENUE_CONTROL_DEFAULT_RANGE_DAYS),
    toDate: businessDate,
  };
}

export function clampRevenueControlRange(
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
  const dates = eachDate(requestedFrom, requestedTo, REVENUE_CONTROL_MAX_RANGE_DAYS);
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

export function resolveFocusRatePlan(
  plans: ControlPlan[],
  roomTypeId: string | null,
  ratePlanId: string | null,
): ControlPlan | null {
  if (ratePlanId) return plans.find((plan) => plan.id === ratePlanId) ?? null;
  const pool = roomTypeId ? plans.filter((plan) => plan.roomTypeId === roomTypeId) : plans;
  const active = pool.filter((plan) => plan.active);
  return (
    active.find((plan) => plan.code.toUpperCase() === "BAR") ??
    active[0] ??
    pool[0] ??
    null
  );
}

function stayDatesInRange(arrival: string, departure: string, dates: Set<string>): string[] {
  return eachDate(arrival, departure, 400).filter((date) => date < departure && dates.has(date));
}

function matchingReservations(
  rows: ControlReservation[],
  roomTypeId: string | null,
  ratePlanId?: string | null,
): ControlReservation[] {
  return rows.filter((row) => {
    if (roomTypeId && row.roomTypeId !== roomTypeId) return false;
    if (ratePlanId && row.ratePlanId !== ratePlanId) return false;
    return true;
  });
}

function roomCount(rooms: ControlRoom[], roomTypeId: string | null): number {
  return rooms.filter((room) => !roomTypeId || room.roomTypeId === roomTypeId).length;
}

function accumulateStayMetrics(rows: ControlReservation[], dates: Set<string>) {
  let soldRoomNights = 0;
  let bookedRoomRevenue = 0;
  let pricedNights = 0;
  const soldByDate = new Map<string, number>();
  const revenueByDate = new Map<string, number>();

  for (const row of rows) {
    const nights = stayDatesInRange(row.arrivalDate, row.departureDate, dates);
    soldRoomNights += nights.length;
    for (const date of nights) soldByDate.set(date, (soldByDate.get(date) ?? 0) + 1);
    for (const night of row.nightly) {
      if (!dates.has(night.date)) continue;
      bookedRoomRevenue += night.rate;
      pricedNights += 1;
      revenueByDate.set(night.date, (revenueByDate.get(night.date) ?? 0) + night.rate);
    }
  }

  return { soldRoomNights, bookedRoomRevenue, pricedNights, soldByDate, revenueByDate };
}

export function restrictionLabel(row: {
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
}): string | null {
  const parts: string[] = [];
  if (row.stopSell) parts.push("Stop sell");
  if (row.closedToArrival) parts.push("CTA");
  if (row.closedToDeparture) parts.push("CTD");
  if (row.minStay != null) parts.push(`Min ${row.minStay}`);
  if (row.maxStay != null) parts.push(`Max ${row.maxStay}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function hasRestriction(row: {
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
}): boolean {
  return restrictionLabel(row) != null;
}

export function controlRowSignal(input: {
  occupancyPercent: number;
  availableRoomNights: number;
  remainingRoomNights: number;
  restrictionActive: boolean;
  overrideActive: boolean;
}): RevenueControlSignal {
  if (input.restrictionActive) return "Restriction Active";
  if (
    input.availableRoomNights <= 0 ||
    input.remainingRoomNights <= 0 ||
    (input.availableRoomNights > 0 &&
      input.remainingRoomNights / input.availableRoomNights <= REVENUE_CONTROL_LOW_REMAINING_RATIO)
  ) {
    return "Low Remaining Inventory";
  }
  if (input.occupancyPercent >= REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT) return "High Occupancy";
  if (input.overrideActive) return "Override Active";
  return "Open";
}

export function revenueControlFilterCaption(
  filters: RevenueControlAppliedFilters,
  roomTypeName: string | null,
  ratePlanCode: string | null,
): string {
  const parts = [`${filters.fromDate} – ${filters.toDate}`];
  if (filters.occupancyScope === "room-type" && roomTypeName) parts.push(roomTypeName);
  else parts.push("Property-wide occupancy");
  if (filters.revenueScope === "rate-plan" && ratePlanCode) {
    parts.push(`${ratePlanCode} booked revenue`);
  } else if (ratePlanCode && filters.occupancyScope !== "room-type") {
    parts.push(`${ratePlanCode} used for rate context only`);
  }
  return parts.join(" · ");
}

function daysBetweenInclusive(fromDate: string, toDate: string): number {
  return eachDate(fromDate, toDate, REVENUE_CONTROL_MAX_RANGE_DAYS).length;
}

function deriveAlerts(input: {
  occupancyPercent: number;
  remainingRoomNights: number;
  availableRoomNights: number;
  restrictions: ControlRestriction[];
  overrideCount: number;
  dayCount: number;
  focusPlan: ControlPlan | null;
  asOfDate: string;
}): RevenueControlAlert[] {
  const alerts: RevenueControlAlert[] = [];
  const remainingRatio =
    input.availableRoomNights > 0 ? input.remainingRoomNights / input.availableRoomNights : 0;

  if (input.availableRoomNights > 0 && input.remainingRoomNights <= 0) {
    alerts.push({
      id: "no-remaining",
      tone: "danger",
      title: "No remaining inventory",
      detail: "Sold room nights have used the current available-room-night base in this range.",
    });
  } else if (
    input.availableRoomNights > 0 &&
    remainingRatio <= REVENUE_CONTROL_LOW_REMAINING_RATIO
  ) {
    alerts.push({
      id: "low-remaining",
      tone: "warning",
      title: "Low remaining inventory",
      detail: `Remaining inventory is ${Math.round(remainingRatio * 100)}% of available room nights.`,
    });
  }

  if (input.occupancyPercent >= REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT) {
    alerts.push({
      id: "high-occupancy",
      tone: "warning",
      title: "High occupancy",
      detail: `Booked occupancy is ${input.occupancyPercent}% for the selected range.`,
    });
  }

  const stopSellCount = input.restrictions.filter((row) => row.stopSell).length;
  if (stopSellCount > 0) {
    alerts.push({
      id: "stop-sell",
      tone: "danger",
      title: "Stop sell",
      detail: `Stop sell is active on ${stopSellCount} date${stopSellCount === 1 ? "" : "s"} in this range.`,
    });
  }

  const otherRestrictions = input.restrictions.filter(
    (row) => !row.stopSell && hasRestriction(row),
  ).length;
  if (otherRestrictions > 0) {
    alerts.push({
      id: "restriction-active",
      tone: "warning",
      title: "Restriction active",
      detail: `CTA, CTD or stay limits are set on ${otherRestrictions} date${otherRestrictions === 1 ? "" : "s"}.`,
    });
  }

  if (
    input.dayCount > 0 &&
    input.overrideCount / input.dayCount > REVENUE_CONTROL_OVERRIDE_SHARE
  ) {
    alerts.push({
      id: "override-active",
      tone: "info",
      title: "Override active",
      detail: `${input.overrideCount} nightly overrides are set for the focused rate plan in this range.`,
    });
  }

  if (input.focusPlan?.validTo) {
    const ending = shiftIsoDate(input.asOfDate, REVENUE_CONTROL_PLAN_ENDING_DAYS);
    if (input.focusPlan.validTo >= input.asOfDate && input.focusPlan.validTo <= ending) {
      alerts.push({
        id: "plan-ending",
        tone: "info",
        title: "Rate plan ending",
        detail: `${input.focusPlan.code} is valid through ${input.focusPlan.validTo}.`,
      });
    }
  }

  return alerts;
}

export function buildRevenueControlModel(input: RevenueControlBuildInput): RevenueControlWorkspace {
  const dates = eachDate(input.fromDate, input.toDate, REVENUE_CONTROL_MAX_RANGE_DAYS);
  const dateSet = new Set(dates);
  const dayCount = dates.length;
  const commercialFiltersIgnored = Boolean(
    input.marketSegmentId || input.commercialSourceId || input.salesChannelId,
  );

  const focusPlan = resolveFocusRatePlan(input.plans, input.roomTypeId, input.ratePlanId);
  const inventoryReservations = matchingReservations(input.reservations, input.roomTypeId);
  const revenueReservations = matchingReservations(
    input.reservations,
    input.roomTypeId,
    input.ratePlanId,
  );
  const availableRooms = roomCount(input.rooms, input.roomTypeId);
  const availableRoomNights = availableRooms * dayCount;

  const inventory = accumulateStayMetrics(inventoryReservations, dateSet);
  const revenue = accumulateStayMetrics(revenueReservations, dateSet);

  const occupancyMetrics = computeBookedRevenueOverview({
    soldRoomNights: inventory.soldRoomNights,
    availableRoomNights,
    bookedRoomRevenue: inventory.bookedRoomRevenue,
    pricedNights: inventory.pricedNights,
  });
  const revenueMetrics = computeBookedRevenueOverview({
    soldRoomNights: revenue.soldRoomNights,
    availableRoomNights,
    bookedRoomRevenue: revenue.bookedRoomRevenue,
    pricedNights: revenue.pricedNights,
  });

  const summary = {
    ...occupancyMetrics,
    roomRevenue: revenueMetrics.roomRevenue,
    adr: revenueMetrics.adr,
    soldRoomNights: revenueMetrics.soldRoomNights,
    pricedShare: revenueMetrics.pricedShare,
    occupancySoldRoomNights: inventory.soldRoomNights,
    occupancyAvailableRoomNights: availableRoomNights,
  };

  const appliedFilters: RevenueControlAppliedFilters = {
    fromDate: input.fromDate,
    toDate: input.toDate,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    occupancyScope: input.roomTypeId ? "room-type" : "property",
    revenueScope: input.ratePlanId ? "rate-plan" : input.roomTypeId ? "room-type" : "property",
    commercialFiltersIgnored,
  };

  const roomTypeName =
    input.roomTypes.find((type) => type.id === input.roomTypeId)?.name ?? null;
  const filterCaption = revenueControlFilterCaption(
    appliedFilters,
    roomTypeName,
    focusPlan?.code ?? null,
  );

  const focusedRestrictions = input.restrictions.filter((row) => {
    if (focusPlan && row.ratePlanId !== focusPlan.id) return false;
    if (!focusPlan && input.roomTypeId) {
      const plan = input.plans.find((item) => item.id === row.ratePlanId);
      return plan?.roomTypeId === input.roomTypeId;
    }
    return true;
  });
  const focusedOverrides = input.overrides.filter((row) =>
    focusPlan ? row.ratePlanId === focusPlan.id : true,
  );

  const nightly: RevenueControlNight[] = dates.map((date) => {
    const soldRoomNights = inventory.soldByDate.get(date) ?? 0;
    const bookedRoomRevenue = revenue.revenueByDate.get(date) ?? 0;
    const metrics = computeBookedRevenueOverview({
      soldRoomNights,
      availableRoomNights: availableRooms,
      bookedRoomRevenue,
      pricedNights: 0,
    });
    return {
      date,
      soldRoomNights,
      availableRoomNights: availableRooms,
      occupancyPercent: metrics.occupancyPercent,
      bookedRoomRevenue: metrics.roomRevenue,
    };
  });

  const typeName = new Map(input.roomTypes.map((type) => [type.id, type.name]));
  const typeIds = [
    ...new Set([
      ...input.rooms.map((room) => room.roomTypeId),
      ...inventoryReservations.map((row) => row.roomTypeId),
    ]),
  ];
  const roomTypes = typeIds
    .filter((typeId) => !input.roomTypeId || typeId === input.roomTypeId)
    .map((typeId) => {
      const typeRooms = roomCount(input.rooms, typeId);
      const typeInventory = accumulateStayMetrics(
        matchingReservations(input.reservations, typeId),
        dateSet,
      );
      const typeRevenue = accumulateStayMetrics(
        matchingReservations(input.reservations, typeId, input.ratePlanId),
        dateSet,
      );
      const occupancy = computeBookedRevenueOverview({
        soldRoomNights: typeInventory.soldRoomNights,
        availableRoomNights: typeRooms * dayCount,
        bookedRoomRevenue: typeRevenue.bookedRoomRevenue,
        pricedNights: typeRevenue.pricedNights,
      });
      return {
        roomTypeId: typeId,
        roomTypeName: typeName.get(typeId) ?? "Room type",
        occupancyPercent: occupancy.occupancyPercent,
        adr: occupancy.adr,
        bookedRoomRevenue: occupancy.roomRevenue,
        soldRoomNights: typeRevenue.soldRoomNights,
        availableRoomNights: typeRooms * dayCount,
      };
    })
    .sort((left, right) => right.bookedRoomRevenue - left.bookedRoomRevenue)
    .slice(0, REVENUE_CONTROL_ROOM_TYPE_LIMIT);

  const restrictionAttention: RevenueControlRestrictionRow[] = focusedRestrictions
    .filter((row) => hasRestriction(row))
    .map((row) => {
      const plan = input.plans.find((item) => item.id === row.ratePlanId);
      return {
        date: row.date,
        ratePlanId: row.ratePlanId,
        ratePlanCode: plan?.code ?? "Plan",
        ratePlanName: plan?.name ?? "Rate plan",
        roomTypeId: plan?.roomTypeId ?? "",
        roomTypeName: typeName.get(plan?.roomTypeId ?? "") ?? "Room type",
        minStay: row.minStay,
        maxStay: row.maxStay,
        closedToArrival: row.closedToArrival,
        closedToDeparture: row.closedToDeparture,
        stopSell: row.stopSell,
        label: restrictionLabel(row) ?? "",
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const overrideByDate = new Map(
    focusedOverrides.filter((row) => !focusPlan || row.ratePlanId === focusPlan.id).map((row) => [row.date, row]),
  );
  const restrictionByDate = new Map(
    focusedRestrictions.filter((row) => !focusPlan || row.ratePlanId === focusPlan.id).map((row) => [row.date, row]),
  );

  const controlRows: RevenueControlWorkRow[] = nightly.map((night) => {
    const restriction = restrictionByDate.get(night.date);
    const override = overrideByDate.get(night.date);
    const remainingRoomNights = Math.max(0, night.availableRoomNights - night.soldRoomNights);
    const effectiveRate =
      override?.nightlyRate ??
      (focusPlan ? focusPlan.baseRate : null);
    return {
      date: night.date,
      occupancyPercent: night.occupancyPercent,
      soldRoomNights: night.soldRoomNights,
      availableRoomNights: night.availableRoomNights,
      remainingRoomNights,
      ratePlanId: focusPlan?.id ?? null,
      ratePlanCode: focusPlan?.code ?? null,
      effectiveRate,
      overrideActive: Boolean(override),
      restrictionLabel: restriction ? restrictionLabel(restriction) : null,
      signal: controlRowSignal({
        occupancyPercent: night.occupancyPercent,
        availableRoomNights: night.availableRoomNights,
        remainingRoomNights,
        restrictionActive: restriction ? hasRestriction(restriction) : false,
        overrideActive: Boolean(override),
      }),
    };
  });

  const remainingRoomNights = Math.max(0, availableRoomNights - inventory.soldRoomNights);
  const alerts = deriveAlerts({
    occupancyPercent: occupancyMetrics.occupancyPercent,
    remainingRoomNights,
    availableRoomNights,
    restrictions: focusedRestrictions,
    overrideCount: focusedOverrides.length,
    dayCount,
    focusPlan,
    asOfDate: input.asOfDate,
  });

  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    requestedFrom: input.requestedFrom,
    requestedTo: input.requestedTo,
    rangeClamped: input.rangeClamped,
    currency: input.currency,
    summary,
    appliedFilters,
    filterCaption,
    commercialFilterNote: commercialFiltersIgnored ? COMMERCIAL_FILTER_NOTE : null,
    slotMetrics: {
      remainingRoomNights,
      activeRestrictionCount: restrictionAttention.length,
      overrideCount: focusedOverrides.length,
    },
    nightly,
    roomTypes,
    alerts,
    controlRows,
    restrictionAttention,
    recentActivity: {
      available: input.history !== null,
      empty: (input.history ?? []).length === 0,
      rows: input.history ?? [],
    },
    focusRatePlan: focusPlan
      ? { id: focusPlan.id, code: focusPlan.code, name: focusPlan.name }
      : null,
    restrictionsError: input.restrictionsError ?? null,
    historyError: input.historyError ?? null,
  };
}

export function daysInClampedRange(fromDate: string, toDate: string): number {
  return daysBetweenInclusive(fromDate, toDate);
}
