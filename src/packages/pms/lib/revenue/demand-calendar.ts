/**
 * Demand Calendar (UI-15) compose — live OTB × stay date × room type.
 *
 * Occupancy comes from getRevenueDemandOverview. Restriction/rate context
 * comes from the Rate Calendar loader. 7D pickup is snapshot-to-snapshot.
 * Color bands are inventory/occupancy states, never demand scores.
 */

import { z } from "zod";
import {
  REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT,
  REVENUE_CONTROL_LOW_REMAINING_RATIO,
} from "./revenue-control.ts";
import {
  RATE_CALENDAR_MAX_COLUMNS,
  clampRateCalendarRange,
  shiftIsoDate,
  type RateCalendarCell,
  type RateCalendarRestriction,
  type RateCalendarWorkspace,
} from "./rate-calendar.ts";
import { restrictionMarks, type RestrictionMark } from "./restriction-calendar.ts";
import type { DemandCellMetrics, DemandWorkspace } from "./demand.ts";
import type { PickupWorkspace } from "./pickup-pace.ts";
import { DEMAND_FORECAST_UNAVAILABLE_TITLE, DEMAND_OOO_OOS_NOTE, DEMAND_UNPRICED_ADR_NOTE } from "./demand-overview.ts";

export const DEMAND_CALENDAR_VISIBLE_DAYS = RATE_CALENDAR_MAX_COLUMNS;
export const DEMAND_CALENDAR_JUMP_DAYS = 7;
export const DEMAND_CALENDAR_PICKUP_WINDOW = 7;

export const DEMAND_CALENDAR_CLAMP_NOTE =
  "Showing the first 14 stay dates of this range. Use Previous / Next to move the window.";

export const DEMAND_DETAIL_LIVE_COPY = "Live on-the-books demand for the selected stay date.";

export const DEMAND_CALENDAR_LEGEND_LABELS = [
  "Open Inventory",
  "Elevated Occupancy",
  "High Occupancy",
  "Sold Out",
  "Stop Sell",
  "Restriction",
  "Rate Override",
] as const;

export type DemandDetailAttention =
  | "High Occupancy"
  | "Low Remaining Inventory"
  | "Sold Out"
  | "Stop Sell"
  | "Restriction Active"
  | "Rate Override";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const demandCalendarQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
  roomTypeId: z.string().uuid().nullable().optional(),
});

export type DemandCalendarQuery = z.infer<typeof demandCalendarQuerySchema>;

export type DemandCalendarBand = "open" | "elevated" | "high-occupancy" | "sold-out";

export type DemandCalendarRateSummary = {
  ratePlanId: string;
  code: string;
  name: string;
  effectiveRate: number;
  overrideActive: boolean;
};

export type DemandCalendarCell = {
  date: string;
  roomTypeId: string;
  roomTypeName: string;
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
  adr: number;
  revpar: number;
  pricedShare: number;
  recentBookings: number;
  daysToArrival: number;
  band: DemandCalendarBand;
  stopSell: boolean;
  overrideActive: boolean;
  marks: RestrictionMark[];
  roomsPickup7d: number | null;
  rates: DemandCalendarRateSummary[];
  restriction: RateCalendarRestriction;
};

export type DemandCalendarRow = {
  roomTypeId: string;
  roomTypeName: string;
  cells: DemandCalendarCell[];
};

export type DemandCalendarWorkspace = {
  asOfBusinessDate: string;
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currency: string;
  dates: string[];
  rows: DemandCalendarRow[];
  limitations: {
    forecastAvailable: false;
    availabilityIncludesFutureOosRisk: true;
    unpricedReservationsPresent: boolean;
    oooOosNote: string;
    unpricedNote: string | null;
    forecastNote: string;
  };
};

export function defaultDemandCalendarRange(businessDate: string): { fromDate: string; toDate: string } {
  return {
    fromDate: businessDate,
    toDate: shiftIsoDate(businessDate, DEMAND_CALENDAR_VISIBLE_DAYS - 1),
  };
}

export function demandCalendarBand(input: {
  occupancyPercent: number;
  roomsRemaining: number;
  roomsAvailable: number;
}): DemandCalendarBand {
  if (input.roomsRemaining <= 0) return "sold-out";
  if (input.occupancyPercent >= REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT) return "high-occupancy";
  if (
    input.roomsAvailable > 0 &&
    input.roomsRemaining / input.roomsAvailable <= REVENUE_CONTROL_LOW_REMAINING_RATIO
  ) {
    return "elevated";
  }
  return "open";
}

export function demandCalendarBandLabel(band: DemandCalendarBand): string {
  if (band === "sold-out") return "Sold Out";
  if (band === "high-occupancy") return "High Occupancy";
  if (band === "elevated") return "Elevated Occupancy";
  return "Open Inventory";
}

export function formatDemandPickup7d(value: number | null): string | null {
  if (value == null) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} 7D`;
}

export function demandDetailAttention(cell: DemandCalendarCell): DemandDetailAttention[] {
  const flags: DemandDetailAttention[] = [];
  if (cell.band === "sold-out") flags.push("Sold Out");
  if (cell.band === "high-occupancy") flags.push("High Occupancy");
  if (cell.band === "elevated") flags.push("Low Remaining Inventory");
  if (cell.stopSell) flags.push("Stop Sell");
  if (cell.marks.length > 0) flags.push("Restriction Active");
  if (cell.overrideActive) flags.push("Rate Override");
  return flags;
}

export function demandCalendarHasRoomTypes(data: DemandCalendarWorkspace): boolean {
  return data.rows.length > 0;
}

export function demandCalendarBandClass(band: DemandCalendarBand, stopSell: boolean): string {
  if (stopSell) return "border-red-300 bg-red-50";
  if (band === "sold-out") return "border-red-400 bg-red-100";
  if (band === "high-occupancy") return "border-red-200 bg-red-50/80";
  if (band === "elevated") return "border-amber-200 bg-amber-50";
  return "border-[#E8E1D7] bg-[#FBF9F5]";
}

function emptyRestriction(): RateCalendarRestriction {
  return {
    minStay: null,
    maxStay: null,
    closedToArrival: false,
    closedToDeparture: false,
    stopSell: false,
  };
}

function mergeRestrictions(rows: RateCalendarRestriction[]): RateCalendarRestriction {
  if (rows.length === 0) return emptyRestriction();
  const mins = rows.map((row) => row.minStay).filter((value): value is number => value != null);
  const maxes = rows.map((row) => row.maxStay).filter((value): value is number => value != null);
  return {
    stopSell: rows.some((row) => row.stopSell),
    closedToArrival: rows.some((row) => row.closedToArrival),
    closedToDeparture: rows.some((row) => row.closedToDeparture),
    minStay: mins.length > 0 ? Math.max(...mins) : null,
    maxStay: maxes.length > 0 ? Math.min(...maxes) : null,
  };
}

function planCellsFor(rates: RateCalendarWorkspace, roomTypeId: string, date: string): RateCalendarCell[] {
  const group = rates.groups.find((item) => item.roomType.id === roomTypeId);
  if (!group) return [];
  return group.rows.flatMap((row) => row.cells.filter((cell) => cell.date === date));
}

export function buildDemandCalendarModel(
  demand: DemandWorkspace,
  rates: RateCalendarWorkspace,
  pickup: PickupWorkspace,
): DemandCalendarWorkspace {
  const range = clampRateCalendarRange(demand.fromDate, demand.toDate);
  const dates = range.fromDate <= range.toDate
    ? demand.dates.map((row) => row.date).filter((date) => date >= range.fromDate && date <= range.toDate)
    : [];
  const visibleDates = dates.slice(0, DEMAND_CALENDAR_VISIBLE_DAYS);
  const types = new Map<string, string>();
  for (const date of demand.dates) {
    for (const cell of date.roomTypes) {
      types.set(cell.roomTypeId, cell.roomTypeName);
    }
  }

  const pickupByKey = new Map(
    pickup.pairRows.map((row) => [`${row.stayDate}|${row.roomTypeId}`, row.comparable ? row.roomsPickup : null]),
  );

  const rows: DemandCalendarRow[] = [...types.entries()].map(([roomTypeId, roomTypeName]) => ({
    roomTypeId,
    roomTypeName,
    cells: visibleDates.map((date) => {
      const live =
        demand.dates.find((row) => row.date === date)?.roomTypes.find((cell) => cell.roomTypeId === roomTypeId) ??
        ({
          date,
          roomTypeId,
          roomTypeName,
          roomsOnBooks: 0,
          roomsAvailable: 0,
          roomsRemaining: 0,
          occupancyPercent: 0,
          bookedRoomRevenue: 0,
          soldRoomNights: 0,
          revenueSoldNights: 0,
          adr: 0,
          revpar: 0,
          pricedRooms: 0,
          pricedShare: 0,
          recentBookings: 0,
          activeRestrictionCount: 0,
          rateOverrideCount: 0,
          daysToArrival: 0,
        } satisfies DemandCellMetrics);
      const planCells = planCellsFor(rates, roomTypeId, date);
      const restriction = mergeRestrictions(planCells.map((cell) => cell.restriction));
      const ratesForDate: DemandCalendarRateSummary[] = planCells.map((cell) => {
        const plan = rates.groups
          .find((group) => group.roomType.id === roomTypeId)
          ?.rows.find((row) => row.cells.includes(cell))?.plan;
        return {
          ratePlanId: cell.ratePlanId,
          code: plan?.code ?? "Plan",
          name: plan?.name ?? "Rate plan",
          effectiveRate: cell.effectiveRate,
          overrideActive: cell.overrideActive,
        };
      });
      const band = demandCalendarBand(live);
      return {
        date,
        roomTypeId,
        roomTypeName,
        roomsOnBooks: live.roomsOnBooks,
        roomsAvailable: live.roomsAvailable,
        roomsRemaining: live.roomsRemaining,
        occupancyPercent: live.occupancyPercent,
        bookedRoomRevenue: live.bookedRoomRevenue,
        adr: live.adr,
        revpar: live.revpar,
        pricedShare: live.pricedShare,
        recentBookings: live.recentBookings,
        daysToArrival: live.daysToArrival,
        band,
        stopSell: restriction.stopSell,
        overrideActive: ratesForDate.some((row) => row.overrideActive) || live.rateOverrideCount > 0,
        marks: restrictionMarks(restriction),
        roomsPickup7d: pickupByKey.get(`${date}|${roomTypeId}`) ?? null,
        rates: ratesForDate,
        restriction,
      };
    }),
  }));

  return {
    asOfBusinessDate: demand.asOfBusinessDate,
    fromDate: range.fromDate,
    toDate: range.toDate,
    requestedFrom: demand.requestedFrom,
    requestedTo: demand.requestedTo,
    rangeClamped: demand.rangeClamped || range.rangeClamped || visibleDates.length < dates.length,
    currency: demand.currency,
    dates: visibleDates,
    rows,
    limitations: {
      forecastAvailable: false,
      availabilityIncludesFutureOosRisk: true,
      unpricedReservationsPresent: demand.limitations.unpricedReservationsPresent,
      oooOosNote: DEMAND_OOO_OOS_NOTE,
      unpricedNote: demand.limitations.unpricedReservationsPresent || demand.summary.pricedShare < 100
        ? DEMAND_UNPRICED_ADR_NOTE
        : null,
      forecastNote: DEMAND_FORECAST_UNAVAILABLE_TITLE,
    },
  };
}

export function demandCalendarQuickSearch(
  view: "rate-calendar" | "restrictions" | "pickup-pace",
  stayDate: string,
  roomTypeId: string,
) {
  if (view === "pickup-pace") {
    return {
      view,
      from: stayDate,
      to: shiftIsoDate(stayDate, DEMAND_CALENDAR_VISIBLE_DAYS - 1),
      roomType: roomTypeId,
    };
  }
  return { view, from: stayDate, to: stayDate, roomType: roomTypeId };
}
