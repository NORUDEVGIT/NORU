/**
 * AIOS-04 pure Aiosell ARI translation.
 * Inventory and prices are supplied by the caller. This module does not
 * calculate availability, reprice a stay, or convert currency.
 */
import { roundMoney } from "../reservation-detail-folio";
import {
  validateAiosellCurrencyCompatibility,
  validateAiosellTimezoneCompatibility,
  type AiosellEnvironment,
} from "./aiosell-connection";
import type { AiosellPropertyDetails, AiosellRestrictions } from "./aiosell-contract";
import {
  toDistributionSyncEventInsert,
  type DistributionSyncEventInsert,
} from "./distribution-sync-event";

export const AIOSELL_MAPPING_ANCHORS = ["aiosell.sandbox", "aiosell.production"] as const;
export const AIOSELL_MAX_PUSH_NIGHTS = 31;

export type AiosellReadinessError = {
  code: string;
  message: string;
};

export type PreparedAiosellPush<T> = {
  environment: AiosellEnvironment;
  hotelCode: string;
  payload: T | null;
  warnings: string[];
  errors: AiosellReadinessError[];
  ready: boolean;
  upsert: true;
};

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function eachAiosellDate(startDate: string, endDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("AIOSELL_RANGE_INVALID");
  }
  if (endDate < startDate) throw new Error("AIOSELL_RANGE_INVALID");
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    if (dates.length > AIOSELL_MAX_PUSH_NIGHTS) throw new Error("AIOSELL_RANGE_TOO_LONG");
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function noruStayForAiosellRange(
  startDate: string,
  endDate: string,
): { arrival: string; departure: string } {
  const dates = eachAiosellDate(startDate, endDate);
  return { arrival: dates[0], departure: addDays(dates[dates.length - 1], 1) };
}

export function readAvailabilityNights(nightly: unknown[]): { date: string; available: number }[] {
  return nightly.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { date?: unknown; available?: unknown };
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    const available = typeof row.available === "number" ? row.available : Number(row.available);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(available)) return [];
    return [{ date, available }];
  });
}

function blocked(errors: AiosellReadinessError[]): PreparedAiosellPush<never> {
  return {
    environment: "sandbox",
    hotelCode: "",
    payload: null,
    warnings: [],
    errors,
    ready: false,
    upsert: true,
  };
}

export function prepareAiosellInventoryPush(input: {
  environment: AiosellEnvironment;
  hotelCode: string;
  startDate: string;
  endDate: string;
  rooms: { roomTypeId: string; nights: { date: string; available: number }[] }[];
  roomMappings: { roomTypeId: string; roomCode: string }[];
  pushBlocked?: boolean;
  blockMessage?: string;
}): PreparedAiosellPush<{
  hotelCode: string;
  updates: {
    startDate: string;
    endDate: string;
    rooms: { roomCode: string; available: number }[];
  }[];
}> {
  if (input.pushBlocked) {
    return {
      ...blocked([
        { code: "AIOSELL_PUSH_BLOCKED", message: input.blockMessage ?? "Push blocked." },
      ]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  let dates: string[];
  try {
    dates = eachAiosellDate(input.startDate, input.endDate);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AIOSELL_RANGE_INVALID";
    return {
      ...blocked([{ code, message: code }]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  const errors: AiosellReadinessError[] = [];
  const segments: { startDate: string; endDate: string; roomCode: string; available: number }[] =
    [];
  for (const room of input.rooms) {
    const mapping = input.roomMappings.find((row) => row.roomTypeId === room.roomTypeId);
    if (!mapping) {
      errors.push({
        code: "ROOM_MAPPING_MISSING",
        message: `No Aiosell room code for room type ${room.roomTypeId}.`,
      });
      continue;
    }
    const byDate = new Map(room.nights.map((night) => [night.date, night.available]));
    const values: { date: string; available: number }[] = [];
    for (const date of dates) {
      const available = byDate.get(date);
      if (available === undefined) {
        errors.push({
          code: "AVAILABILITY_NIGHT_MISSING",
          message: `Missing availability for ${date}.`,
        });
        continue;
      }
      if (!Number.isInteger(available) || available < 0) {
        errors.push({
          code: "AVAILABILITY_INVALID",
          message: `Availability for ${mapping.roomCode} on ${date} must be a nonnegative integer.`,
        });
        continue;
      }
      values.push({ date, available });
    }
    let current: (typeof segments)[number] | null = null;
    for (const night of values) {
      if (
        current &&
        current.available === night.available &&
        addDays(current.endDate, 1) === night.date
      ) {
        current.endDate = night.date;
      } else {
        current = {
          startDate: night.date,
          endDate: night.date,
          roomCode: mapping.roomCode,
          available: night.available,
        };
        segments.push(current);
      }
    }
  }
  if (errors.length > 0) {
    return { ...blocked(errors), environment: input.environment, hotelCode: input.hotelCode };
  }
  const grouped = new Map<string, { roomCode: string; available: number }[]>();
  for (const segment of segments) {
    const key = `${segment.startDate}|${segment.endDate}`;
    const rooms = grouped.get(key) ?? [];
    rooms.push({ roomCode: segment.roomCode, available: segment.available });
    grouped.set(key, rooms);
  }
  const updates = [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, rooms]) => {
      const [startDate, endDate] = key.split("|");
      return {
        startDate,
        endDate,
        rooms: rooms.sort((left, right) => (left.roomCode < right.roomCode ? -1 : 1)),
      };
    });
  return {
    environment: input.environment,
    hotelCode: input.hotelCode,
    payload: { hotelCode: input.hotelCode, updates },
    warnings: ["Aiosell inventory push replaces the previous value for each inclusive date."],
    errors: [],
    ready: updates.length > 0,
    upsert: true,
  };
}

export function resolveNoruNightlyRate(input: {
  date: string;
  baseRate: number;
  calendar: { date: string; nightlyRate: number }[];
}): number {
  const override = input.calendar.find((row) => row.date === input.date);
  return roundMoney(override ? override.nightlyRate : input.baseRate);
}

export function prepareAiosellRatePush(input: {
  environment: AiosellEnvironment;
  hotelCode: string;
  startDate: string;
  endDate: string;
  aiosellCurrency: string;
  propertyCurrency: string;
  plans: {
    ratePlanId: string;
    roomTypeId: string;
    roomCode: string;
    rateplanCode: string;
    baseRate: number;
    currency: string;
  }[];
  roomMappings: { roomTypeId: string; roomCode: string }[];
  calendar: { ratePlanId: string; date: string; nightlyRate: number }[];
  pushBlocked?: boolean;
  blockMessage?: string;
}): PreparedAiosellPush<{
  hotelCode: string;
  updates: {
    startDate: string;
    endDate: string;
    rates: { roomCode: string; rateplanCode: string; rate: number }[];
  }[];
}> {
  if (input.pushBlocked) {
    return {
      ...blocked([
        { code: "AIOSELL_PUSH_BLOCKED", message: input.blockMessage ?? "Push blocked." },
      ]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  const currency = validateAiosellCurrencyCompatibility({
    aiosellCurrency: input.aiosellCurrency,
    propertyCurrency: input.propertyCurrency,
    mappedRatePlans: input.plans.map((plan) => ({
      ratePlanId: plan.ratePlanId,
      currency: plan.currency,
    })),
  });
  if (!currency.compatible) {
    const mismatch = currency.ratePlanMismatches[0];
    return {
      ...blocked([
        {
          code: "AIOSELL_CURRENCY_MISMATCH",
          message: mismatch
            ? `Rate plan ${mismatch.ratePlanId} currency ${mismatch.currency} does not match ${input.aiosellCurrency}.`
            : `Property currency ${input.propertyCurrency} does not match ${input.aiosellCurrency}.`,
        },
      ]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  let dates: string[];
  try {
    dates = eachAiosellDate(input.startDate, input.endDate);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AIOSELL_RANGE_INVALID";
    return {
      ...blocked([{ code, message: code }]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  const errors: AiosellReadinessError[] = [];
  const segments: {
    startDate: string;
    endDate: string;
    roomCode: string;
    rateplanCode: string;
    rate: number;
  }[] = [];
  for (const plan of input.plans) {
    if (!plan.rateplanCode) {
      errors.push({
        code: "RATE_MAPPING_MISSING",
        message: `No Aiosell rate code for ${plan.ratePlanId}.`,
      });
      continue;
    }
    const room = input.roomMappings.find((row) => row.roomTypeId === plan.roomTypeId);
    if (!room) {
      errors.push({
        code: "ROOM_MAPPING_MISSING",
        message: `No Aiosell room code for ${plan.roomTypeId}.`,
      });
      continue;
    }
    if (room.roomCode !== plan.roomCode) {
      errors.push({
        code: "WRONG_ROOM_RATE_PLAN",
        message: `Rate plan ${plan.ratePlanId} is not mapped under room code ${plan.roomCode}.`,
      });
      continue;
    }
    const calendar = input.calendar.filter((row) => row.ratePlanId === plan.ratePlanId);
    let current: (typeof segments)[number] | null = null;
    for (const date of dates) {
      const rate = resolveNoruNightlyRate({ date, baseRate: plan.baseRate, calendar });
      if (current && current.rate === rate && addDays(current.endDate, 1) === date) {
        current.endDate = date;
      } else {
        current = {
          startDate: date,
          endDate: date,
          roomCode: plan.roomCode,
          rateplanCode: plan.rateplanCode,
          rate,
        };
        segments.push(current);
      }
    }
  }
  if (errors.length > 0) {
    return { ...blocked(errors), environment: input.environment, hotelCode: input.hotelCode };
  }
  const grouped = new Map<string, { roomCode: string; rateplanCode: string; rate: number }[]>();
  for (const segment of segments) {
    const key = `${segment.startDate}|${segment.endDate}`;
    const rates = grouped.get(key) ?? [];
    rates.push({
      roomCode: segment.roomCode,
      rateplanCode: segment.rateplanCode,
      rate: segment.rate,
    });
    grouped.set(key, rates);
  }
  const updates = [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, rates]) => {
      const [startDate, endDate] = key.split("|");
      return { startDate, endDate, rates };
    });
  return {
    environment: input.environment,
    hotelCode: input.hotelCode,
    payload: { hotelCode: input.hotelCode, updates },
    warnings: ["Aiosell rate push replaces the previous nightly rate for each inclusive date."],
    errors: [],
    ready: true,
    upsert: true,
  };
}

export function aiosellRestrictionObject(
  source: {
    stopSell: boolean | null;
    minimumStay: number | null;
    maximumStay: number | null;
    closeOnArrival: boolean | null;
    closeOnDeparture: boolean | null;
  } | null,
): AiosellRestrictions {
  return {
    stopSell: source?.stopSell ?? null,
    minimumStay: source?.minimumStay ?? null,
    maximumStay: source?.maximumStay ?? null,
    closeOnArrival: source?.closeOnArrival ?? null,
    closeOnDeparture: source?.closeOnDeparture ?? null,
    minimumStayArrival: null,
    maximumStayArrival: null,
    exactStayArrival: null,
    minimumAdvanceReservation: null,
    maximumAdvanceReservation: null,
  };
}

export function aiosellTargetChannels(codes: string[]): string[] | null {
  const seen = new Set<string>();
  const channels: string[] = [];
  for (const code of codes) {
    if (
      !code ||
      AIOSELL_MAPPING_ANCHORS.includes(code as (typeof AIOSELL_MAPPING_ANCHORS)[number])
    ) {
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    channels.push(code);
  }
  return channels.length > 0 ? channels : null;
}

export function prepareAiosellInventoryRestrictions(): PreparedAiosellPush<never> {
  return blocked([
    {
      code: "NO_ROOM_LEVEL_RESTRICTION_SOURCE",
      message:
        "NORU restrictions belong to a rate plan and date, so a room-only inventory restriction is not sent.",
    },
  ]);
}

export function prepareAiosellRateRestrictions(input: {
  environment: AiosellEnvironment;
  hotelCode: string;
  startDate: string;
  endDate: string;
  toChannels: string[];
  plans: { ratePlanId: string; roomTypeId: string; roomCode: string; rateplanCode: string }[];
  roomMappings: { roomTypeId: string; roomCode: string }[];
  restrictions: {
    ratePlanId: string;
    date: string;
    stopSell: boolean | null;
    minimumStay: number | null;
    maximumStay: number | null;
    closeOnArrival: boolean | null;
    closeOnDeparture: boolean | null;
  }[];
}): PreparedAiosellPush<{
  hotelCode: string;
  toChannels: string[];
  updates: {
    startDate: string;
    endDate: string;
    rates: { roomCode: string; rateplanCode: string; restrictions: AiosellRestrictions }[];
  }[];
}> {
  const channels = aiosellTargetChannels(input.toChannels);
  if (!channels) {
    return {
      ...blocked([
        {
          code: "AIOSELL_CHANNELS_REQUIRED",
          message: "Restriction push needs at least one Aiosell OTA channel.",
        },
      ]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  let dates: string[];
  try {
    dates = eachAiosellDate(input.startDate, input.endDate);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AIOSELL_RANGE_INVALID";
    return {
      ...blocked([{ code, message: code }]),
      environment: input.environment,
      hotelCode: input.hotelCode,
    };
  }
  const errors: AiosellReadinessError[] = [];
  const segments: {
    startDate: string;
    endDate: string;
    roomCode: string;
    rateplanCode: string;
    restrictions: AiosellRestrictions;
  }[] = [];
  for (const plan of input.plans) {
    const room = input.roomMappings.find((row) => row.roomTypeId === plan.roomTypeId);
    if (!plan.rateplanCode) {
      errors.push({
        code: "RATE_MAPPING_MISSING",
        message: `No Aiosell rate code for ${plan.ratePlanId}.`,
      });
      continue;
    }
    if (!room || room.roomCode !== plan.roomCode) {
      errors.push({
        code: "WRONG_ROOM_RATE_PLAN",
        message: `Rate plan ${plan.ratePlanId} is not mapped under room code ${plan.roomCode}.`,
      });
      continue;
    }
    let current: (typeof segments)[number] | null = null;
    for (const date of dates) {
      const row = input.restrictions.find(
        (restriction) => restriction.ratePlanId === plan.ratePlanId && restriction.date === date,
      );
      const restrictions = aiosellRestrictionObject(
        row
          ? {
              stopSell: row.stopSell,
              minimumStay: row.minimumStay,
              maximumStay: row.maximumStay,
              closeOnArrival: row.closeOnArrival,
              closeOnDeparture: row.closeOnDeparture,
            }
          : null,
      );
      const encoded = JSON.stringify(restrictions);
      if (
        current &&
        JSON.stringify(current.restrictions) === encoded &&
        addDays(current.endDate, 1) === date
      ) {
        current.endDate = date;
      } else {
        current = {
          startDate: date,
          endDate: date,
          roomCode: plan.roomCode,
          rateplanCode: plan.rateplanCode,
          restrictions,
        };
        segments.push(current);
      }
    }
  }
  if (errors.length > 0) {
    return { ...blocked(errors), environment: input.environment, hotelCode: input.hotelCode };
  }
  const grouped = new Map<string, (typeof segments)[number][]>();
  for (const segment of segments) {
    const key = `${segment.startDate}|${segment.endDate}`;
    const rates = grouped.get(key) ?? [];
    rates.push(segment);
    grouped.set(key, rates);
  }
  const updates = [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, rates]) => {
      const [startDate, endDate] = key.split("|");
      return {
        startDate,
        endDate,
        rates: rates.map((rate) => ({
          roomCode: rate.roomCode,
          rateplanCode: rate.rateplanCode,
          restrictions: rate.restrictions,
        })),
      };
    });
  return {
    environment: input.environment,
    hotelCode: input.hotelCode,
    payload: { hotelCode: input.hotelCode, toChannels: channels, updates },
    warnings: ["Aiosell restriction push replaces the previous value for each inclusive date."],
    errors: [],
    ready: true,
    upsert: true,
  };
}

export function compareAiosellPropertyDetails(input: {
  configuredHotelCode: string;
  details: AiosellPropertyDetails;
  propertyCurrency: string;
  propertyTimezone: string;
}): {
  hotelCodeMatch: boolean;
  currencyCompatible: boolean;
  timezoneCompatible: boolean;
  pushBlocked: boolean;
  reasons: string[];
} {
  const currency = validateAiosellCurrencyCompatibility({
    aiosellCurrency: input.details.currency,
    propertyCurrency: input.propertyCurrency,
    mappedRatePlans: [],
  });
  const timezone = validateAiosellTimezoneCompatibility({
    aiosellTimezone: input.details.timezone,
    propertyTimezone: input.propertyTimezone,
  });
  const hotelCodeMatch = input.details.hotel_id === input.configuredHotelCode;
  const reasons: string[] = [];
  if (!hotelCodeMatch) reasons.push("Aiosell hotel_id does not match the configured hotelCode.");
  if (!currency.compatible)
    reasons.push("Aiosell property currency does not match the NORU property currency.");
  if (!timezone.match)
    reasons.push("Aiosell property timezone does not match the NORU property timezone.");
  return {
    hotelCodeMatch,
    currencyCompatible: currency.compatible,
    timezoneCompatible: timezone.match,
    pushBlocked: reasons.length > 0,
    reasons,
  };
}

export function isRawAiosellProviderText(value: string): boolean {
  const text = value.trim();
  if (text.startsWith("{") || text.startsWith("[")) return true;
  return /"success"\s*:/.test(text) && /"message"\s*:/.test(text);
}

export function aiosellSafeSyncMessage(input: {
  ok: boolean;
  code: string;
  message: string | null;
  secrets: string[];
}): string {
  if (!input.ok) return input.code;
  const text = input.message ?? "ok";
  if (isRawAiosellProviderText(text)) return "ok";
  return scrubAiosellText(text, input.secrets);
}

export function scrubAiosellText(value: string, secrets: string[]): string {
  let text = value;
  for (const secret of secrets) {
    if (secret.length > 0) text = text.split(secret).join("[redacted]");
  }
  text = text.replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic [redacted]");
  return text.slice(0, 400);
}

export function aiosellOutboundSyncEvent(input: {
  restaurantId: string;
  operation: string;
  channel?: string | null;
  externalBookingId?: string | null;
  success: boolean;
  responseMessage: string;
}): DistributionSyncEventInsert {
  return toDistributionSyncEventInsert({
    restaurantId: input.restaurantId,
    provider: "aiosell",
    direction: "outbound",
    channel: input.channel ?? null,
    externalBookingId: input.externalBookingId ?? null,
    operation: input.operation,
    status: input.success ? "success" : "failed",
    responseSuccess: input.success,
    responseMessage: input.responseMessage,
    attemptCount: 1,
    retryEligible: false,
  });
}
