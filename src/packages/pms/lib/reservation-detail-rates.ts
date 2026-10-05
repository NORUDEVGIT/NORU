import { DEFAULT_MARKET_SEGMENTS } from "@/packages/pms/lib/create-reservation-phase1";
import { breakfastLabelFromMealPlan } from "@/packages/pms/lib/cancellation-deadline";
import {
  DETAIL_DASH,
  snapshotDisplayName,
  snapshotField,
  storedRatePerNight,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { RatePlan } from "@/packages/pms/lib/rates.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

export const RATE_NOTES_MAX = 500;

export const RATE_DISCOUNT_GAP_COPY =
  "Manual discounts and adjustments are not stored on this reservation. Only applied promotions from pricing are shown.";

export const RATE_PACKAGE_ADD_GAP_COPY =
  "Packages cannot be added from this workspace. Applied reservation packages from pricing are shown when present.";

export const RATE_NOTES_GAP_COPY =
  "Rate notes are not stored on the reservation. Stay notes remain on Notes & Traces.";

export type NightlyBreakdownRow = {
  date: string;
  weekday: string;
  roomTypeName: string;
  ratePlanName: string;
  rate: number;
  discount: number | null;
  adjustment: number | null;
  total: number;
  inclusion: string | null;
};

export function weekdayLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return DETAIL_DASH;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return DETAIL_DASH;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
}

export function assignmentLabel(reservation: ReservationDetail): "Assigned" | "Not Assigned" {
  return reservation.roomId && reservation.roomNumber ? "Assigned" : "Not Assigned";
}

export function marketSegmentLabel(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const found = DEFAULT_MARKET_SEGMENTS.find((row) => row.value === raw);
  return found?.label ?? raw;
}

export function nightlyBreakdownRows(
  reservation: ReservationDetail,
  plan: RatePlan | null | undefined,
): NightlyBreakdownRow[] {
  const breakfast = plan
    ? breakfastLabelFromMealPlan({
        mealPlanId: plan.mealPlanId,
        breakfastIncluded: plan.breakfastIncluded,
      })
    : DETAIL_DASH;
  const inclusion = breakfast === "Included" ? "Breakfast" : null;
  return (reservation.nightlyRates ?? [])
    .filter((night) => night?.date && Number.isFinite(Number(night.rate)))
    .map((night) => ({
      date: night.date,
      weekday: weekdayLabel(night.date),
      roomTypeName: reservation.roomTypeName,
      ratePlanName: reservation.ratePlanName ?? plan?.name ?? DETAIL_DASH,
      rate: Number(night.rate),
      discount: null,
      adjustment: null,
      total: Number(night.rate),
      inclusion,
    }));
}

export function snapshotNightlyTotal(rows: NightlyBreakdownRow[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.rate, 0);
}

export function stayRatePerNight(reservation: ReservationDetail): number | null {
  return storedRatePerNight(reservation.nightlyRates, reservation.roomSubtotal, reservation.nights);
}

export function ratePlanRestrictions(plan: RatePlan | null | undefined): string | null {
  if (!plan) return null;
  const parts: string[] = [];
  if (plan.minAdvanceDays != null) parts.push(`Min advance ${plan.minAdvanceDays} days`);
  if (plan.maxAdvanceDays != null) parts.push(`Max advance ${plan.maxAdvanceDays} days`);
  return parts.length ? parts.join(" · ") : null;
}

export function ratePlanMealLabel(plan: RatePlan | null | undefined): string {
  if (!plan) return DETAIL_DASH;
  const meal = (plan.mealPlanName ?? "").trim();
  const breakfast = breakfastLabelFromMealPlan({
    mealPlanId: plan.mealPlanId,
    breakfastIncluded: plan.breakfastIncluded,
  });
  if (meal && breakfast !== DETAIL_DASH) return `${meal} · Breakfast ${breakfast}`;
  if (meal) return meal;
  if (breakfast !== DETAIL_DASH) return `Breakfast ${breakfast}`;
  return DETAIL_DASH;
}

export function rateCancellationLabel(
  reservation: ReservationDetail,
  plan: RatePlan | null | undefined,
): string {
  return (
    snapshotDisplayName(reservation.cancellationPolicySnapshot) ||
    plan?.cancellationName?.trim() ||
    DETAIL_DASH
  );
}

export function rateChangePolicyLabel(
  reservation: ReservationDetail,
  plan: RatePlan | null | undefined,
): string {
  return (
    snapshotField(reservation.refundabilitySnapshot, [
      "name",
      "label",
      "change_policy",
      "refundability",
    ]) ||
    plan?.refundabilityName?.trim() ||
    DETAIL_DASH
  );
}

export function packageNightsLabel(
  chargeBasis: string | null | undefined,
  quantity: number | null | undefined,
  stayNights: number,
): string {
  const basis = String(chargeBasis ?? "").toLowerCase();
  if (basis.includes("night") && stayNights > 0) return String(stayNights);
  if (quantity != null && Number.isFinite(quantity) && quantity > 0) return String(quantity);
  return DETAIL_DASH;
}
