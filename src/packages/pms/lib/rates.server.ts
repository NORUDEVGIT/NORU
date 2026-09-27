/**
 * Phase 6G — Rates & revenue core, server-only helpers.
 *
 * Rates are owner/manager only, exactly like reservations. Every helper
 * re-derives the caller's membership; a restaurant id from the browser only
 * selects which membership applies.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { withPmsPackage } from "./pms-package.server";

export const RATE_MANAGE_ROLES = ["owner", "manager"] as const;

/** Reservation statuses that contribute room revenue / sold room nights. */
export const REVENUE_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;

export function canManageRates(role: string): boolean {
  return (RATE_MANAGE_ROLES as readonly string[]).includes(role);
}

export async function requireRateManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "configuration",
      RATE_MANAGE_ROLES,
      "You don't have access to Rates & Revenue for this property.",
    ),
  );
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
  ROOM_NOT_ASSIGNABLE:
    "That room can't be used — check it is active, available and of the reserved type.",
  ROOM_ALREADY_BOOKED: "That room is already booked or occupied for part of those dates.",
  RESERVATION_CANCELLED: "This reservation is cancelled. Restore it before amending.",
  RATE_CHANGE_STALE: "This rate was changed by someone else. Refresh and try again.",
  RATE_CHANGE_FORBIDDEN: "You don't have access to change rates for this property.",
  RATE_CHANGE_EMPTY: "Select at least one date to change.",
  RATE_CHANGE_DUPLICATE: "The same rate plan and date cannot appear twice in one change.",
  RATE_CHANGE_UNSUPPORTED: "That rate change is not supported.",
  RATE_CHANGE_INVALID_DATE: "Use a valid YYYY-MM-DD date.",
  RATE_CHANGE_NEGATIVE: "A nightly rate cannot be negative.",
  RATE_CHANGE_VALUE_REQUIRED: "Enter a rate or percentage for this change.",
  RATE_CHANGE_SOURCE_INVALID: "The copy-from date is not valid for this rate plan.",
  RATE_CHANGE_OVER_MAX: "That nightly rate is above the allowed maximum.",
  RATE_CHANGE_EVENT_IMMUTABLE: "Rate change history cannot be edited.",
  RESTRICTION_PLAN_NOT_FOUND: "That rate plan doesn't belong to this property.",
  RESTRICTION_CHANGE_STALE: "This restriction was changed by someone else. Refresh and try again.",
  RESTRICTION_INVALID_DATE: "Use a valid YYYY-MM-DD date.",
  RESTRICTION_DUPLICATE_TARGET: "The same rate plan and date cannot appear twice in one change.",
  RESTRICTION_MIN_STAY_INVALID: "Min stay must be empty or an integer from 1 to 365.",
  RESTRICTION_MAX_STAY_INVALID: "Max stay must be empty or an integer from 1 to 365.",
  RESTRICTION_STAY_RANGE_INVALID: "Max stay cannot be shorter than min stay.",
  RESTRICTION_NO_FIELDS: "Provide at least one restriction field to change.",
  RESTRICTION_TARGET_LIMIT: "At most 366 dates can be changed at once.",
  RESTRICTION_CHANGE_FORBIDDEN: "You don't have access to change restrictions for this property.",
  RESTRICTION_CHANGE_EMPTY: "Select at least one date to change.",
  RESTRICTION_CHANGE_UNSUPPORTED: "That restriction change is not supported.",
  RESTRICTION_CHANGE_EVENT_IMMUTABLE: "Restriction change history cannot be edited.",
  PROMOTION_NOT_FOUND: "That promotion is not available for this property.",
  PROMOTION_ACTIVATION_NOT_FOUND: "That promotion activation was not found.",
  PROMOTION_INACTIVE: "That promotion is not active.",
  PROMOTION_BOOKING_WINDOW_MISMATCH:
    "That promotion is not bookable on the property business date.",
  PROMOTION_STAY_WINDOW_MISMATCH: "The stay is not fully inside that promotion window.",
  PROMOTION_ROOM_TYPE_MISMATCH: "That promotion does not apply to this room type.",
  PROMOTION_RATE_PLAN_MISMATCH: "That promotion does not apply to this rate plan.",
  PROMOTION_KIND_UNSUPPORTED: "That promotion kind is not supported yet.",
  PROMOTION_VALUE_INVALID: "That promotion value cannot be applied to this stay.",
  PROMOTION_WRONG_PROPERTY: "That promotion does not belong to this property.",
  PACKAGE_NOT_FOUND: "That package is not available for this property.",
  PACKAGE_ACTIVATION_NOT_FOUND: "That package activation was not found.",
  PACKAGE_INACTIVE: "That package is not active.",
  PACKAGE_STAY_WINDOW_MISMATCH: "The stay is not fully inside that package window.",
  PACKAGE_ROOM_TYPE_MISMATCH: "That package does not apply to this room type.",
  PACKAGE_RATE_PLAN_MISMATCH: "That package does not apply to this rate plan.",
  PACKAGE_CHARGE_BASIS_UNSUPPORTED: "That package charge basis is not supported yet.",
  PACKAGE_PRICE_INVALID: "That package price cannot be applied to this stay.",
  PACKAGE_WRONG_PROPERTY: "That package does not belong to this property.",
  PACKAGE_DUPLICATE_SELECTION: "The same package cannot be selected twice.",
  PACKAGE_ACTIVATION_DUPLICATE: "That package is already activated for the same stay and scope.",
  PROMOTION_ACTIVATION_DUPLICATE:
    "That promotion is already activated for the same stay, booking window, and scope.",
  COMMERCIAL_DATES_INVALID: "Check the stay or booking dates for this activation.",
  COMMERCIAL_MASTER_WINDOW_BROADEN:
    "The activation stay window cannot extend beyond the master validity.",
  COMMERCIAL_SCOPE_WRONG_PROPERTY:
    "A selected room type or rate plan does not belong to this property.",
  PROMOTION_SCOPE_BROADEN: "A promotion activation cannot add room types outside the master scope.",
  PACKAGE_SCOPE_BROADEN:
    "A package activation cannot add room types or rate plans outside the master scope.",
  COMMERCIAL_ACTIVATION_STALE:
    "This activation was changed by someone else. Refresh and try again.",
  COMMERCIAL_OPERATION_INVALID: "That commercial activation operation is not supported.",
  RATE_SHOPPING_OBSERVATION_IMMUTABLE: "Competitor rate observations cannot be edited.",
  REVENUE_APPROVAL_FORBIDDEN:
    "You don't have access to Rate & Revenue approvals for this property.",
  REVENUE_APPROVAL_DISABLED: "Approvals are not required for this property.",
  REVENUE_APPROVAL_NOT_FOUND: "That approval request was not found.",
  REVENUE_APPROVAL_NOT_PENDING: "That approval request is no longer pending.",
  REVENUE_APPROVAL_SELF_NOT_ALLOWED: "Another Rate Manager must review this request.",
  REVENUE_APPROVAL_CANCEL_FORBIDDEN: "Only the requester can cancel this approval request.",
  REVENUE_APPROVAL_REVIEW_REASON_REQUIRED: "Enter a review reason.",
  REVENUE_APPROVAL_EVENT_IMMUTABLE: "Approval history cannot be edited.",
  REVENUE_APPROVAL_REQUEST_IMMUTABLE: "An approval request cannot be edited after it is submitted.",
  REVENUE_APPROVAL_INVALID_PROPOSAL: "That approval proposal is not valid.",
  REVENUE_APPROVAL_WRONG_PROPERTY: "That approval request does not belong to this property.",
  COMPETITOR_NOT_FOUND: "That competitor was not found for this property.",
  COMPETITOR_NAME_REQUIRED: "Enter a competitor name.",
  COMPETITOR_NAME_TOO_LONG: "Competitor name is too long.",
  PROVIDER_REQUIRED: "Enter a provider identifier.",
  EXTERNAL_PROPERTY_ID_REQUIRED: "Enter the external property ID.",
  EXTERNAL_ROOM_ID_REQUIRED: "Enter the external room ID.",
  PROVIDER_MAPPING_NOT_FOUND: "That provider mapping was not found.",
  ROOM_MAPPING_NOT_FOUND: "That room mapping was not found.",
  ROOM_MAPPING_REQUIRES_PROVIDER: "Add a provider property mapping first.",
  ROOM_TYPE_NOT_FOUND: "That room type does not belong to this property.",
  FETCH_RUN_NOT_FOUND: "That rate-shopping fetch run was not found.",
  FETCH_RUN_DATES_INVALID: "Stay from must be on or before stay to.",
  FETCH_RUN_STATUS_INVALID: "That fetch-run status is not allowed.",
  REVENUE_ANALYTICS_RANGE_EXCEEDS_MAX: "Analytics date range cannot exceed 90 days.",
  REVENUE_ANALYTICS_MIXED_CURRENCY:
    "Revenue analytics cannot combine reservations in multiple currencies because no exchange-rate conversion is configured.",
  REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED:
    "Sales channel analytics is not currently supported.",
  AUDIT_EXPORT_TOO_LARGE:
    "Audit export exceeds the maximum allowed limit of 10,000 records. Filter by date or domain.",
};

/** Map RAISE EXCEPTION codes from the pricing functions to user-facing text. */
export function rateError(message: string): Error {
  if (/duplicate key value/i.test(message)) {
    if (message.includes("hotel_rate_categories"))
      return new Error("A rate category with that code already exists.");
    if (message.includes("hotel_rate_plans"))
      return new Error("A rate plan with that code already exists.");
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
export function nightsInRange(
  arrival: string,
  departure: string,
  from: string,
  to: string,
): number {
  const start = arrival > from ? arrival : from;
  const end = departure < to ? departure : to;
  if (end <= start) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
