import { ISO_COUNTRIES, countryFromInput } from "./pms-geography.ts";
import type { ContextPickOption } from "./create-reservation-phase1.ts";
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution.ts";
import { activeSet6Options } from "./create-reservation-phase1.ts";

/** Keys that must never appear on createReservation data from Step 3 stubs. */
export const CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS = [
  "commissionPercent",
  "commission",
  "pickupStatus",
  "cutoffDate",
  "flexibleDates",
  "roomPreferences",
  "travelPurpose",
  "corporateRateAmount",
  "agencyRateAmount",
] as const;

export type CreateReservationQuoteIdentity = {
  roomTypeId: string;
  arrival: string;
  departure: string;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  quoteCurrency: string;
  ratePlanId: string;
};

export function quoteIdentityMatches(
  submitted: CreateReservationQuoteIdentity,
  quoted: CreateReservationQuoteIdentity,
): boolean {
  return (
    submitted.roomTypeId === quoted.roomTypeId &&
    submitted.arrival === quoted.arrival &&
    submitted.departure === quoted.departure &&
    submitted.rooms === quoted.rooms &&
    submitted.adults === quoted.adults &&
    submitted.children === quoted.children &&
    submitted.infants === quoted.infants &&
    submitted.quoteCurrency === quoted.quoteCurrency &&
    submitted.ratePlanId === quoted.ratePlanId
  );
}

export function nationalitySelectCode(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return countryFromInput(raw)?.code ?? "";
}

export function nationalityStoredName(code: string): string {
  return ISO_COUNTRIES.find((row) => row.code === code)?.name ?? code;
}

export function nationalitySelectOptions(current: string | null | undefined): Array<{
  value: string;
  label: string;
}> {
  const options = ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }));
  const code = nationalitySelectCode(current);
  if (current?.trim() && !code) {
    return [{ value: "__current", label: current.trim() }, ...options];
  }
  return options;
}

export function resolveSalesChannelOptions(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ContextPickOption[] {
  return activeSet6Options(rows);
}

export function activeCommissionPlan<T extends { active: boolean; effectiveOn: string; expiresOn: string | null }>(
  plans: T[],
  stayDate: string,
): T | null {
  return (
    plans.find(
      (row) =>
        row.active && row.effectiveOn <= stayDate && (!row.expiresOn || row.expiresOn >= stayDate),
    ) ?? null
  );
}

export function addDaysIso(isoDate: string, days: number): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export const FLEXIBLE_DATE_OFFSETS = [-1, 0, 1] as const;

export function payloadHasForbiddenStep3Keys(payload: Record<string, unknown>): string[] {
  return CREATE_RESERVATION_STEP3_FORBIDDEN_PAYLOAD_KEYS.filter((key) => key in payload);
}

export function canAdvanceFromBookingDetails(args: {
  quotesFetching: boolean;
  roomTypeId: string;
  occupancyOk: boolean;
  priced: boolean;
  canCreateUnpriced: boolean;
  submitted: CreateReservationQuoteIdentity;
  quoted: CreateReservationQuoteIdentity | null;
}): boolean {
  if (args.quotesFetching) return false;
  if (!args.roomTypeId || !args.occupancyOk) return false;
  if (args.priced) {
    if (!args.quoted) return false;
    return quoteIdentityMatches(args.submitted, args.quoted);
  }
  return args.canCreateUnpriced;
}

export function commissionPercentLabel(plan: {
  commissionType: string;
  rateValue: number;
} | null): string {
  if (!plan) return "";
  if (plan.commissionType === "percent") return String(plan.rateValue);
  return String(plan.rateValue);
}
