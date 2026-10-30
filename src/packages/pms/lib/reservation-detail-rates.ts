import { DEFAULT_MARKET_SEGMENTS } from "@/packages/pms/lib/create-reservation-phase1";
import { breakfastLabelFromMealPlan } from "@/packages/pms/lib/cancellation-deadline";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { stayRoomUnitId } from "@/packages/pms/lib/reservation-detail-guest";
import {
  DETAIL_DASH,
  OVERVIEW_LABEL_UNAVAILABLE,
  snapshotDisplayName,
  snapshotField,
  storedRatePerNight,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { RatePlan } from "@/packages/pms/lib/rates.functions";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RATE_NOTES_MAX = 500;

export const RATE_DISCOUNT_GAP_COPY =
  "Manual discounts and adjustments are not stored on this reservation. Only applied promotions from pricing are shown.";

/** Ownership decision: nightly overrides and reservation adjustments are not reservation columns. */
export const RATE_OVERRIDE_OWNERSHIP =
  "Manual nightly overrides and reservation adjustments are not stored on the reservation. Folio adjustments stay in Cashiering.";

export const RATE_PACKAGE_SUMMARY_COPY =
  "This is the package summary for the selected room. Add and remove packages on the Packages tab.";

export const RATE_PROMOTION_OUTSIDE_SUBTOTAL =
  "Promotion discount is stored on the reservation, outside the room subtotal.";

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

/** Stored nightly snapshot used by the breakdown. Callers may pass a unit or the master stay. */
export type RatesNightlySource = {
  nightlyRates?: Array<{ date: string; rate: number }> | null;
  roomTypeName: string;
  ratePlanName?: string | null;
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

export function marketSegmentLabel(
  value: string | null | undefined,
  marketSegments?: Array<{ id: string; name?: string | null; code?: string | null }> | null,
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (marketSegments && marketSegments.length > 0) {
    const match = marketSegments.find((row) => row.id === raw || row.code === raw);
    const name = match?.name?.trim();
    if (name && !UUID_RE.test(name)) return name;
  }
  const found = DEFAULT_MARKET_SEGMENTS.find(
    (row) => row.value === raw || row.value.toLowerCase() === raw.toLowerCase(),
  );
  if (found) return found.label;
  if (UUID_RE.test(raw)) return OVERVIEW_LABEL_UNAVAILABLE;
  return raw;
}

export function storedNightlyRates(
  raw: Array<{ date: string; rate: number }> | null | undefined,
): Array<{ date: string; rate: number }> {
  return (raw ?? [])
    .filter((night) => night?.date && Number.isFinite(Number(night.rate)))
    .map((night) => ({ date: night.date, rate: Number(night.rate) }));
}

export function nightlyBreakdownRows(
  source: RatesNightlySource,
  plan: RatePlan | null | undefined,
): NightlyBreakdownRow[] {
  const breakfast = plan
    ? breakfastLabelFromMealPlan({
        mealPlanId: plan.mealPlanId,
        breakfastIncluded: plan.breakfastIncluded,
      })
    : DETAIL_DASH;
  const inclusion = breakfast === "Included" ? "Breakfast" : null;
  return storedNightlyRates(source.nightlyRates).map((night) => ({
    date: night.date,
    weekday: weekdayLabel(night.date),
    roomTypeName: source.roomTypeName,
    ratePlanName: source.ratePlanName ?? plan?.name ?? DETAIL_DASH,
    rate: night.rate,
    discount: null,
    adjustment: null,
    total: night.rate,
    inclusion,
  }));
}

export function snapshotNightlyTotal(rows: NightlyBreakdownRow[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.rate, 0);
}

export function stayRatePerNight(source: {
  nightlyRates?: Array<{ rate: number }> | null;
  roomSubtotal?: number | null;
  nights: number;
}): number | null {
  return storedRatePerNight(source.nightlyRates, source.roomSubtotal ?? null, source.nights);
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

export type RatesUnitSnapshot = {
  unitId: string | null;
  unitSequence: number | null;
  roomLabel: string;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  currency: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  infants: number | null;
  roomSubtotal: number | null;
  nightlyRates: Array<{ date: string; rate: number }>;
  assignment: "Assigned" | "Not Assigned";
};

export type RatesUnitChoice = {
  id: string;
  unitSequence: number;
  roomTypeName: string;
  status: string | null;
};

/** Stored promotion row. One per reservation, not allocated to a night or unit. */
export type RatesPromotionRead = {
  id: string;
  name: string;
  code: string;
  kind: string;
  discountAmount: number;
  roomSubtotalAfterPromotion: number | null;
  scope: "reservation";
};

export type RatesPackageRead = {
  id: string;
  packageId: string;
  packageName: string;
  packageCode: string;
  chargeBasis: string;
  quantity: number;
  appliedAmount: number;
  reservationRoomId: string | null;
  roomUnitLabel: string | null;
};

/**
 * Posted folio facts. Payment is the absolute sum of payment lines and is not
 * reduced by refunds. Tax, service charge, adjustments, and balance are posted
 * cashiering amounts. They are not a pre-posting reservation grand total.
 */
export type RatesCashieringRead = {
  payment: number | null;
  deposit: number | null;
  refund: number | null;
  balance: number | null;
  postedTax: number | null;
  postedServiceCharge: number | null;
  postedAdjustment: number | null;
};

export type RatesReadModel = {
  selectedUnitId: string | null;
  unit: RatesUnitSnapshot;
  units: RatesUnitChoice[];
  promotion: RatesPromotionRead | null;
  /** Stored promotion discount. Null when no promotion row is loaded. */
  promotionDiscount: number | null;
  /** Null until package rows are known. Empty stored rows total 0. */
  packages: RatesPackageRead[] | null;
  packageTotal: number | null;
  /** Packages stored on a different room unit than the one selected. */
  omittedPackageCount: number;
  /** Master reservation notes. Not stored per room unit. */
  rateNotes: string;
  cashiering: RatesCashieringRead;
};

export type RatesPromotionInput = {
  id: string;
  promotionName: string;
  promotionCode: string;
  promoKind: string;
  discountAmount: number;
  roomSubtotalAfterPromotion?: number | null;
};

export type RatesPackageInput = {
  id: string;
  packageId: string;
  packageName: string;
  packageCode: string;
  chargeBasis: string;
  quantity: number;
  appliedAmount: number;
  reservationRoomId?: string | null;
  roomUnitLabel?: string | null;
};

export type RatesFolioInput = {
  id?: string;
  status?: string | null;
  balance: number;
  transactions: ReadonlyArray<{ type: string; amount: number; category?: string | null }>;
};

function roundRatesMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function absoluteTypeTotal(
  rows: ReadonlyArray<{ type: string; amount: number }>,
  type: string,
): number {
  return roundRatesMoney(
    rows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0),
  );
}

function ratesRoomLabel(unitSequence: number | null): string {
  return unitSequence == null ? "Room" : `Room ${unitSequence}`;
}

function snapshotFromUnit(
  unit: ReservationRoomUnit,
  reservation: ReservationDetail,
): RatesUnitSnapshot {
  const roomNumber = unit.roomNumber ?? null;
  return {
    unitId: unit.id,
    unitSequence: unit.unitSequence,
    roomLabel: ratesRoomLabel(unit.unitSequence),
    roomTypeId: unit.roomTypeId,
    roomTypeName: unit.roomTypeName?.trim() || reservation.roomTypeName,
    roomId: unit.roomId,
    roomNumber,
    ratePlanId: unit.ratePlanId,
    ratePlanName: unit.ratePlanName ?? null,
    currency: unit.currency ?? reservation.currency,
    arrivalDate: unit.arrivalDate,
    departureDate: unit.departureDate,
    nights: nightsBetween(unit.arrivalDate, unit.departureDate),
    adults: unit.adults,
    children: unit.children,
    infants: unit.infants,
    roomSubtotal: unit.roomSubtotal,
    nightlyRates: storedNightlyRates(unit.nightlyRates),
    assignment: unit.roomId && roomNumber ? "Assigned" : "Not Assigned",
  };
}

function snapshotFromMaster(reservation: ReservationDetail): RatesUnitSnapshot {
  return {
    unitId: null,
    unitSequence: null,
    roomLabel: "Room",
    roomTypeId: reservation.roomTypeId,
    roomTypeName: reservation.roomTypeName,
    roomId: reservation.roomId,
    roomNumber: reservation.roomNumber,
    ratePlanId: reservation.ratePlanId,
    ratePlanName: reservation.ratePlanName,
    currency: reservation.currency,
    arrivalDate: reservation.arrivalDate,
    departureDate: reservation.departureDate,
    nights: reservation.nights,
    adults: reservation.adults,
    children: reservation.children,
    infants: reservation.infants,
    roomSubtotal: reservation.roomSubtotal,
    nightlyRates: storedNightlyRates(reservation.nightlyRates),
    assignment: assignmentLabel(reservation),
  };
}

function resolveRatesUnit(
  reservation: ReservationDetail,
  selectedUnitId: string | null | undefined,
): ReservationRoomUnit | null {
  const units = reservation.rooms ?? [];
  if (selectedUnitId) {
    const match = units.find((unit) => unit.id === selectedUnitId);
    if (match) return match;
  }
  const fallbackId = stayRoomUnitId(reservation);
  return units.find((unit) => unit.id === fallbackId) ?? null;
}

function signedRows(
  rows: ReadonlyArray<{ type: string; amount: number; category?: string | null }>,
  predicate: (row: { type: string; amount: number; category?: string | null }) => boolean,
): number {
  return roundRatesMoney(
    rows.filter(predicate).reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  );
}

function cashieringFromFolio(folio: RatesFolioInput | null | undefined): RatesCashieringRead {
  if (!folio) {
    return {
      payment: null,
      deposit: null,
      refund: null,
      balance: null,
      postedTax: null,
      postedServiceCharge: null,
      postedAdjustment: null,
    };
  }
  return {
    payment: absoluteTypeTotal(folio.transactions, "payment"),
    deposit: absoluteTypeTotal(folio.transactions, "deposit"),
    refund: absoluteTypeTotal(folio.transactions, "refund"),
    balance: Number.isFinite(Number(folio.balance)) ? roundRatesMoney(Number(folio.balance)) : null,
    postedTax: signedRows(
      folio.transactions,
      (row) => row.type === "charge" && row.category === "tax",
    ),
    postedServiceCharge: signedRows(
      folio.transactions,
      (row) => row.type === "charge" && row.category === "service_charge",
    ),
    postedAdjustment: signedRows(folio.transactions, (row) => row.type === "adjustment"),
  };
}

/**
 * Rates tab read for one room unit.
 * Nightly rows come only from the stored unit snapshot. An empty snapshot stays
 * empty even when the master reservation still has nights. Promotion discount
 * and package amounts stay beside the room subtotal. Cashiering is the posted
 * folio payment, deposit, refund, tax, service charge, adjustment, and balance.
 */
export function buildRatesReadModel(input: {
  reservation: ReservationDetail;
  selectedUnitId?: string | null;
  promotion?: RatesPromotionInput | null;
  packages?: readonly RatesPackageInput[] | null;
  folio?: RatesFolioInput | null;
}): RatesReadModel {
  const unitRow = resolveRatesUnit(input.reservation, input.selectedUnitId);
  const unit = unitRow
    ? snapshotFromUnit(unitRow, input.reservation)
    : snapshotFromMaster(input.reservation);
  const units: RatesUnitChoice[] = (input.reservation.rooms ?? []).map((row) => ({
    id: row.id,
    unitSequence: row.unitSequence,
    roomTypeName: row.roomTypeName?.trim() || input.reservation.roomTypeName,
    status: row.status,
  }));

  const promotion = input.promotion
    ? {
        id: input.promotion.id,
        name: input.promotion.promotionName,
        code: input.promotion.promotionCode,
        kind: input.promotion.promoKind,
        discountAmount: roundRatesMoney(Number(input.promotion.discountAmount) || 0),
        roomSubtotalAfterPromotion:
          input.promotion.roomSubtotalAfterPromotion == null ||
          !Number.isFinite(Number(input.promotion.roomSubtotalAfterPromotion))
            ? null
            : roundRatesMoney(Number(input.promotion.roomSubtotalAfterPromotion)),
        scope: "reservation" as const,
      }
    : null;

  let packages: RatesPackageRead[] | null = null;
  let packageTotal: number | null = null;
  let omittedPackageCount = 0;
  if (input.packages != null) {
    const visible = input.packages.filter((row) => {
      if (!unit.unitId || !row.reservationRoomId) return true;
      return row.reservationRoomId === unit.unitId;
    });
    omittedPackageCount = input.packages.length - visible.length;
    packages = visible.map((row) => ({
      id: row.id,
      packageId: row.packageId,
      packageName: row.packageName,
      packageCode: row.packageCode,
      chargeBasis: row.chargeBasis,
      quantity: Number(row.quantity) || 0,
      appliedAmount: roundRatesMoney(Number(row.appliedAmount) || 0),
      reservationRoomId: row.reservationRoomId ?? null,
      roomUnitLabel: row.roomUnitLabel ?? null,
    }));
    packageTotal = roundRatesMoney(packages.reduce((sum, row) => sum + row.appliedAmount, 0));
  }

  return {
    selectedUnitId: unit.unitId,
    unit,
    units,
    promotion,
    promotionDiscount: promotion?.discountAmount ?? null,
    packages,
    packageTotal,
    omittedPackageCount,
    rateNotes: input.reservation.rateNotes ?? "",
    cashiering: cashieringFromFolio(input.folio),
  };
}
