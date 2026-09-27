/**
 * Rate Calendar (UI-02) read-model helpers.
 *
 * Occupancy uses the same booked denominator as UI-01: active hotel_rooms × night,
 * sold from overlapping REVENUE_STATUSES stays. Inventory cell tint uses Room &
 * Inventory remaining-stock bands, labeled inventory — never demand.
 *
 * effectiveRate = override ?? base. expectedVersion comes from calendar updated_at
 * or "absent". Past-date / Night Audit edits are not blocked here.
 */

import { z } from "zod";
import { ABSENT_CALENDAR_VERSION, calendarVersionToken } from "./rate-change.ts";
import { restrictionVersionToken } from "./restriction-change.ts";

export const RATE_CALENDAR_MAX_COLUMNS = 14;
export const RATE_CALENDAR_DEFAULT_DAYS = 7;
export const RATE_CALENDAR_GROUP_PAGE_SIZE = 6;
export const RATE_CALENDAR_AVAILABLE_RATIO = 0.2;
export const RATE_CALENDAR_LIMITED_RATIO = 0.1;

export const RATE_CALENDAR_HISTORY_EMPTY = "No recorded rate-change history for this date.";
export const RATE_CALENDAR_STALE_COPY =
  "The rate changed after this preview. Refresh and review again.";
export const RATE_CALENDAR_CLAMP_NOTE =
  "Showing the first 14 days of this range. Use Previous / Next to move the window.";

export type RateCalendarInventoryBand = "available" | "limited" | "low-remaining";

export type RateCalendarRestriction = {
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export type RateCalendarInventory = {
  roomsSold: number;
  roomsAvailable: number;
  remainingRooms: number;
  occupancyPercent: number;
  band: RateCalendarInventoryBand;
};

export type RateCalendarCell = {
  date: string;
  roomTypeId: string;
  ratePlanId: string;
  baseRate: number;
  overrideRate: number | null;
  effectiveRate: number;
  expectedVersion: string;
  overrideActive: boolean;
  currency: string;
  restriction: RateCalendarRestriction;
  restrictionLabel: string | null;
  restrictionExpectedVersion: string;
  inventory: RateCalendarInventory;
  planActive: boolean;
  outsideValidity: boolean;
};

export type RateCalendarPlan = {
  id: string;
  code: string;
  name: string;
  roomTypeId: string;
  currency: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
};

export type RateCalendarRoomType = {
  id: string;
  code: string;
  name: string;
};

export type RateCalendarPlanRow = {
  plan: RateCalendarPlan;
  cells: RateCalendarCell[];
};

export type RateCalendarGroup = {
  roomType: RateCalendarRoomType;
  rows: RateCalendarPlanRow[];
};

export type RateCalendarWorkspace = {
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  currency: string;
  mixedCurrency: boolean;
  dates: string[];
  groups: RateCalendarGroup[];
  groupCount: number;
};

export type CalendarRoom = { id: string; roomTypeId: string };
export type CalendarReservation = {
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
};
export type CalendarOverride = {
  ratePlanId: string;
  date: string;
  nightlyRate: number;
  updatedAt: string | null;
};
export type CalendarRestriction = RateCalendarRestriction & {
  ratePlanId: string;
  date: string;
  updatedAt?: string | null;
};

export type RateCalendarBuildInput = {
  fromDate: string;
  toDate: string;
  requestedFrom: string;
  requestedTo: string;
  rangeClamped: boolean;
  roomTypeId: string | null;
  ratePlanId: string | null;
  currency: string;
  rooms: CalendarRoom[];
  roomTypes: RateCalendarRoomType[];
  plans: RateCalendarPlan[];
  overrides: CalendarOverride[];
  restrictions: CalendarRestriction[];
  reservations: CalendarReservation[];
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rateCalendarQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
  roomTypeId: z.string().uuid().nullable().optional(),
  ratePlanId: z.string().uuid().nullable().optional(),
});

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string, maxDays = RATE_CALENDAR_MAX_COLUMNS): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return out;
}

export function defaultRateCalendarRange(businessDate: string): { fromDate: string; toDate: string } {
  return {
    fromDate: businessDate,
    toDate: shiftIsoDate(businessDate, RATE_CALENDAR_DEFAULT_DAYS - 1),
  };
}

export function shiftRateCalendarRange(
  fromDate: string,
  toDate: string,
  days: number,
): { fromDate: string; toDate: string } {
  return {
    fromDate: shiftIsoDate(fromDate, days),
    toDate: shiftIsoDate(toDate, days),
  };
}

export function clampRateCalendarRange(
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
  const dates = eachDate(requestedFrom, requestedTo, RATE_CALENDAR_MAX_COLUMNS);
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

export function inventoryBand(remainingRooms: number, roomsAvailable: number): RateCalendarInventoryBand {
  if (roomsAvailable <= 0) return "low-remaining";
  const ratio = remainingRooms / roomsAvailable;
  if (ratio >= RATE_CALENDAR_AVAILABLE_RATIO) return "available";
  if (ratio >= RATE_CALENDAR_LIMITED_RATIO) return "limited";
  return "low-remaining";
}

export function inventoryBandLabel(band: RateCalendarInventoryBand): string {
  if (band === "available") return "Available";
  if (band === "limited") return "Limited";
  return "Low Remaining";
}

export function restrictionLabel(row: RateCalendarRestriction): string | null {
  const parts: string[] = [];
  if (row.stopSell) parts.push("Stop Sell");
  if (row.closedToArrival) parts.push("CTA");
  if (row.closedToDeparture) parts.push("CTD");
  if (row.minStay != null) parts.push(`Min ${row.minStay}`);
  if (row.maxStay != null) parts.push(`Max ${row.maxStay}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function isOutsideValidity(date: string, validFrom: string | null, validTo: string | null): boolean {
  if (validFrom && date < validFrom) return true;
  if (validTo && date > validTo) return true;
  return false;
}

function stayDatesInRange(arrival: string, departure: string, dates: Set<string>): string[] {
  return eachDate(arrival, departure, 400).filter((date) => date < departure && dates.has(date));
}

function soldByDateAndType(
  reservations: CalendarReservation[],
  dates: Set<string>,
): Map<string, number> {
  const sold = new Map<string, number>();
  for (const row of reservations) {
    for (const date of stayDatesInRange(row.arrivalDate, row.departureDate, dates)) {
      const key = `${row.roomTypeId}|${date}`;
      sold.set(key, (sold.get(key) ?? 0) + 1);
    }
  }
  return sold;
}

function roomsByType(rooms: CalendarRoom[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const room of rooms) {
    counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1);
  }
  return counts;
}

export function composeInventory(
  roomsSold: number,
  roomsAvailable: number,
): RateCalendarInventory {
  const remainingRooms = Math.max(0, roomsAvailable - roomsSold);
  const occupancyPercent =
    roomsAvailable > 0 ? Math.round((roomsSold / roomsAvailable) * 1000) / 10 : 0;
  return {
    roomsSold,
    roomsAvailable,
    remainingRooms,
    occupancyPercent,
    band: inventoryBand(remainingRooms, roomsAvailable),
  };
}

export function buildRateCalendarModel(input: RateCalendarBuildInput): RateCalendarWorkspace {
  const dates = eachDate(input.fromDate, input.toDate, RATE_CALENDAR_MAX_COLUMNS);
  const dateSet = new Set(dates);
  const sold = soldByDateAndType(input.reservations, dateSet);
  const capacity = roomsByType(input.rooms);

  const overrideMap = new Map<string, CalendarOverride>();
  for (const row of input.overrides) {
    overrideMap.set(`${row.ratePlanId}|${row.date}`, row);
  }
  const restrictionMap = new Map<string, CalendarRestriction>();
  for (const row of input.restrictions) {
    restrictionMap.set(`${row.ratePlanId}|${row.date}`, row);
  }

  const typeById = new Map(input.roomTypes.map((row) => [row.id, row]));
  let plans = input.plans;
  if (input.roomTypeId) plans = plans.filter((plan) => plan.roomTypeId === input.roomTypeId);
  if (input.ratePlanId) plans = plans.filter((plan) => plan.id === input.ratePlanId);

  plans = [...plans].sort((a, b) => {
    const typeA = typeById.get(a.roomTypeId);
    const typeB = typeById.get(b.roomTypeId);
    const typeCmp = (typeA?.name ?? "").localeCompare(typeB?.name ?? "") ||
      (typeA?.code ?? "").localeCompare(typeB?.code ?? "");
    if (typeCmp !== 0) return typeCmp;
    return a.code.localeCompare(b.code) || a.name.localeCompare(b.name);
  });

  const currencies = new Set<string>();
  if (input.currency) currencies.add(input.currency);

  const groupsByType = new Map<string, RateCalendarGroup>();
  for (const plan of plans) {
    const roomType = typeById.get(plan.roomTypeId) ?? {
      id: plan.roomTypeId,
      code: "",
      name: "Room type",
    };
    currencies.add(plan.currency || input.currency);
    const available = capacity.get(plan.roomTypeId) ?? 0;
    const cells = dates.map((date) => {
      const override = overrideMap.get(`${plan.id}|${date}`);
      const restriction = restrictionMap.get(`${plan.id}|${date}`);
      const restrictionContext: RateCalendarRestriction = {
        minStay: restriction?.minStay ?? null,
        maxStay: restriction?.maxStay ?? null,
        closedToArrival: restriction?.closedToArrival === true,
        closedToDeparture: restriction?.closedToDeparture === true,
        stopSell: restriction?.stopSell === true,
      };
      const overrideRate = override ? override.nightlyRate : null;
      return {
        date,
        roomTypeId: plan.roomTypeId,
        ratePlanId: plan.id,
        baseRate: plan.baseRate,
        overrideRate,
        effectiveRate: overrideRate ?? plan.baseRate,
        expectedVersion: calendarVersionToken(override?.updatedAt),
        overrideActive: overrideRate != null,
        currency: plan.currency || input.currency,
        restriction: restrictionContext,
        restrictionLabel: restrictionLabel(restrictionContext),
        restrictionExpectedVersion: restrictionVersionToken(restriction?.updatedAt),
        inventory: composeInventory(sold.get(`${plan.roomTypeId}|${date}`) ?? 0, available),
        planActive: plan.active,
        outsideValidity: isOutsideValidity(date, plan.validFrom, plan.validTo),
      } satisfies RateCalendarCell;
    });

    const group = groupsByType.get(roomType.id) ?? { roomType, rows: [] };
    group.rows.push({ plan, cells });
    groupsByType.set(roomType.id, group);
  }

  const groups = [...groupsByType.values()].sort((a, b) =>
    a.roomType.name.localeCompare(b.roomType.name) || a.roomType.code.localeCompare(b.roomType.code),
  );

  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    requestedFrom: input.requestedFrom,
    requestedTo: input.requestedTo,
    rangeClamped: input.rangeClamped,
    currency: input.currency,
    mixedCurrency: currencies.size > 1,
    dates,
    groups,
    groupCount: groups.length,
  };
}

export { ABSENT_CALENDAR_VERSION };
