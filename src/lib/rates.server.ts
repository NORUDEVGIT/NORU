/**
 * Phase 6G — Rates & revenue core, server-only helpers.
 *
 * Rates are owner/manager only, exactly like reservations. Every helper
 * re-derives the caller's membership; a restaurant id from the browser only
 * selects which membership applies.
 */
import { callerMembership, type AuthedCtx, type Membership } from "./workforce.server";

export const RATE_MANAGE_ROLES = ["owner", "manager"] as const;

/** Reservation statuses that contribute room revenue / sold room nights. */
export const REVENUE_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;

export function canManageRates(role: string): boolean {
  return (RATE_MANAGE_ROLES as readonly string[]).includes(role);
}

export async function requireRateManager(context: AuthedCtx, restaurantId: string): Promise<Membership> {
  const me = await callerMembership(context, restaurantId);
  if (!canManageRates(me.role)) {
    throw new Error("You don't have access to Rates & Revenue for this property.");
  }
  return me;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const RATE_ERRORS: Record<string, string> = {
  RATE_PLAN_NOT_FOUND: "That rate plan doesn't belong to this property.",
  RATE_PLAN_INACTIVE: "That rate plan is inactive.",
  RATE_PLAN_TYPE_MISMATCH: "That rate plan is for a different room type.",
  RATE_PLAN_OUT_OF_RANGE: "That rate plan isn't valid for the whole stay.",
  CLOSED_TO_ARRIVAL: "Arrivals are closed on that date for this rate plan.",
  CLOSED_TO_DEPARTURE: "Departures are closed on that date for this rate plan.",
  STOP_SELL: "One or more nights of this stay are on stop sell for this rate plan.",
  INVALID_DATES: "Departure must be after arrival.",
  RESERVATION_NOT_FOUND: "Reservation not found for this property.",
  NO_AVAILABILITY: "No rooms of that type are available for those dates.",
  ROOM_NOT_ASSIGNABLE: "That room can't be used — check it is active, available and of the reserved type.",
  ROOM_ALREADY_BOOKED: "That room is already booked or occupied for part of those dates.",
  RESERVATION_CANCELLED: "This reservation is cancelled. Restore it before amending.",
};

/** Map RAISE EXCEPTION codes from the pricing functions to user-facing text. */
export function rateError(message: string): Error {
  if (/duplicate key value/i.test(message)) {
    if (message.includes("hotel_rate_categories")) return new Error("A rate category with that code already exists.");
    if (message.includes("hotel_rate_plans")) return new Error("A rate plan with that code already exists.");
    return new Error("That record already exists.");
  }
  const min = /MIN_STAY_(\d+)/.exec(message);
  if (min) return new Error(`This rate plan needs a minimum stay of ${min[1]} night(s).`);
  const max = /MAX_STAY_(\d+)/.exec(message);
  if (max) return new Error(`This rate plan allows a maximum stay of ${max[1]} night(s).`);
  for (const [code, text] of Object.entries(RATE_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

export interface NightlyRate {
  date: string;
  rate: number;
}

export interface StayQuote {
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  currency: string;
  nights: number;
  subtotal: number;
  nightly: NightlyRate[];
}

type PricingJson = {
  rate_plan_id: string;
  rate_plan_code: string;
  rate_plan_name: string;
  currency: string;
  nights: number;
  subtotal: number | string;
  nightly: { date: string; rate: number | string }[];
};

export function toQuote(raw: unknown): StayQuote {
  const p = raw as PricingJson;
  return {
    ratePlanId: p.rate_plan_id,
    ratePlanCode: p.rate_plan_code,
    ratePlanName: p.rate_plan_name,
    currency: p.currency,
    nights: Number(p.nights),
    subtotal: Number(p.subtotal),
    nightly: (p.nightly ?? []).map((n) => ({ date: n.date, rate: Number(n.rate) })),
  };
}

/** Parse a stored nightly snapshot column into typed nights. */
export function parseSnapshot(raw: unknown): NightlyRate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is { date: string; rate: number | string } => !!n && typeof n === "object")
    .map((n) => ({ date: String(n.date), rate: Number(n.rate) }));
}

export function eachDate(from: string, to: string, maxDays = 120): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    cursor = dt.toISOString().slice(0, 10);
  }
  return out;
}

/** Number of nights that fall inside [from, to) for a stay. */
export function nightsInRange(arrival: string, departure: string, from: string, to: string): number {
  const start = arrival > from ? arrival : from;
  const end = departure < to ? departure : to;
  if (end <= start) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
