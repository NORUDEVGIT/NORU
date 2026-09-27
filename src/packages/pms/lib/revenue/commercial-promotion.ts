/**
 * P5A-02 — Promotion Engine V1.
 *
 * Pure eligibility and money helpers. Server loaders compose around
 * price_hotel_stay. Do not trust browser snapshot or discount values.
 *
 * V1 locks:
 *   percent = percentage off the priced room subtotal
 *   fixed = amount off the stay room subtotal
 *   free_night is unsupported
 *   no stacking; user selects one eligible activation
 *   full-stay window: arrival >= valid_from AND last night <= valid_to
 *   booking window uses property business date
 *   empty activation room-types inherit master; empty master = all types
 *   empty activation rate-plans = all property plans
 *   room_subtotal stays pre-commercial
 */

import {
  isV1ExecutablePromoKind,
  roomSubtotalAfterPromotion,
  type CommercialPromoKind,
  type PromotionActivation,
  type ReservationPromotionAttribution,
} from "./commercial-engine.ts";

export const PROMOTION_FULL_STAY_REQUIRED = true;
export const PROMOTION_EMPTY_MASTER_ROOM_TYPES_ALLOW_ALL = true;
export const PROMOTION_PERFORMANCE_REVENUE_FIELD = "room_subtotal_after_promotion" as const;

export const PROMOTION_REASON_CODES = [
  "PROMOTION_ELIGIBLE",
  "PROMOTION_NOT_FOUND",
  "PROMOTION_ACTIVATION_NOT_FOUND",
  "PROMOTION_INACTIVE",
  "PROMOTION_BOOKING_WINDOW_MISMATCH",
  "PROMOTION_STAY_WINDOW_MISMATCH",
  "PROMOTION_ROOM_TYPE_MISMATCH",
  "PROMOTION_RATE_PLAN_MISMATCH",
  "PROMOTION_KIND_UNSUPPORTED",
  "PROMOTION_VALUE_INVALID",
  "PROMOTION_WRONG_PROPERTY",
] as const;

export type PromotionReasonCode = (typeof PROMOTION_REASON_CODES)[number];

export type PromotionEligibilityInput = {
  restaurantId: string;
  promotionActivationId: string;
  bookingBusinessDate: string;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: string;
  ratePlanId: string;
  baseRoomSubtotal: number;
  reservationId?: string;
};

export type PromotionMasterRecord = {
  id: string;
  restaurantId: string;
  active: boolean;
};

export type PromotionEligibilityContext = {
  activation: PromotionActivation | null;
  master: PromotionMasterRecord | null;
};

export type PromotionEligibilityResult = {
  eligible: boolean;
  reasonCode: PromotionReasonCode;
  warnings: string[];
  activation: PromotionActivation | null;
  computedDiscount: number;
  roomSubtotalAfterPromotion: number;
};

export type EligiblePromotionListItem = {
  activationId: string;
  promotionId: string;
  code: string;
  name: string;
  kind: CommercialPromoKind;
  value: number;
  computedDiscount: number;
  roomSubtotalAfterPromotion: number;
  priority: number;
};

export type PromotionAttributionSnapshot = {
  activationId: string;
  promotionId: string;
  code: string;
  name: string;
  kind: CommercialPromoKind;
  value: number;
  bookingFrom: string;
  bookingTo: string;
  validFrom: string;
  validTo: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
  masterRoomTypeIds: string[];
  priority: number;
  reason: string | null;
};

export type PromotionPerformanceSummary = {
  bookingCount: number;
  discountAmount: number;
  roomRevenueAfterPromotion: number;
};

export function lastStayNight(departureDate: string): string {
  const [year, month, day] = departureDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function stayFullyWithinWindow(input: {
  arrivalDate: string;
  departureDate: string;
  validFrom: string;
  validTo: string;
}): boolean {
  return input.arrivalDate >= input.validFrom && lastStayNight(input.departureDate) <= input.validTo;
}

export function bookingDateWithinWindow(input: {
  bookingBusinessDate: string;
  bookingFrom: string;
  bookingTo: string;
}): boolean {
  return input.bookingBusinessDate >= input.bookingFrom && input.bookingBusinessDate <= input.bookingTo;
}

export function resolvePromotionRoomTypeIds(activation: PromotionActivation): string[] {
  if (activation.scope.roomTypeIds.length > 0) return activation.scope.roomTypeIds;
  return activation.masterRoomTypeIds;
}

export function roomTypeAllowed(activation: PromotionActivation, roomTypeId: string): boolean {
  const allowed = resolvePromotionRoomTypeIds(activation);
  return allowed.length === 0 || allowed.includes(roomTypeId);
}

export function ratePlanAllowed(activation: PromotionActivation, ratePlanId: string): boolean {
  return activation.scope.ratePlanIds.length === 0 || activation.scope.ratePlanIds.includes(ratePlanId);
}

export function isValidPercentValue(promoValue: number): boolean {
  return Number.isFinite(promoValue) && promoValue > 0 && promoValue <= 100;
}

export function isValidFixedValue(promoValue: number): boolean {
  return Number.isFinite(promoValue) && promoValue > 0;
}

export function roundPromotionMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computePromotionDiscount(input: {
  promoKind: string;
  promoValue: number;
  baseRoomSubtotal: number;
}): { ok: true; discount: number; roomSubtotalAfterPromotion: number } | { ok: false; reasonCode: PromotionReasonCode } {
  const base = roundPromotionMoney(Math.max(0, input.baseRoomSubtotal));
  if (!isV1ExecutablePromoKind(input.promoKind)) {
    return { ok: false, reasonCode: "PROMOTION_KIND_UNSUPPORTED" };
  }
  if (input.promoKind === "percent" && !isValidPercentValue(input.promoValue)) {
    return { ok: false, reasonCode: "PROMOTION_VALUE_INVALID" };
  }
  if (input.promoKind === "fixed" && !isValidFixedValue(input.promoValue)) {
    return { ok: false, reasonCode: "PROMOTION_VALUE_INVALID" };
  }

  const raw = input.promoKind === "percent" ? (base * input.promoValue) / 100 : input.promoValue;
  const discount = Math.min(base, Math.max(0, roundPromotionMoney(raw)));
  return {
    ok: true,
    discount,
    roomSubtotalAfterPromotion: roomSubtotalAfterPromotion(base, discount),
  };
}

function ineligible(
  reasonCode: PromotionReasonCode,
  baseRoomSubtotal: number,
  activation: PromotionActivation | null = null,
): PromotionEligibilityResult {
  return {
    eligible: false,
    reasonCode,
    warnings: [],
    activation,
    computedDiscount: 0,
    roomSubtotalAfterPromotion: roundPromotionMoney(Math.max(0, baseRoomSubtotal)),
  };
}

export function evaluatePromotionEligibility(
  input: PromotionEligibilityInput,
  context: PromotionEligibilityContext,
): PromotionEligibilityResult {
  const activation = context.activation;
  if (!activation) return ineligible("PROMOTION_ACTIVATION_NOT_FOUND", input.baseRoomSubtotal);
  if (activation.id !== input.promotionActivationId) {
    return ineligible("PROMOTION_ACTIVATION_NOT_FOUND", input.baseRoomSubtotal);
  }
  if (activation.restaurantId !== input.restaurantId) {
    return ineligible("PROMOTION_WRONG_PROPERTY", input.baseRoomSubtotal, activation);
  }
  if (!activation.active) return ineligible("PROMOTION_INACTIVE", input.baseRoomSubtotal, activation);
  if (!context.master) return ineligible("PROMOTION_NOT_FOUND", input.baseRoomSubtotal, activation);
  if (context.master.restaurantId !== input.restaurantId || context.master.id !== activation.promotionId) {
    return ineligible("PROMOTION_WRONG_PROPERTY", input.baseRoomSubtotal, activation);
  }
  if (!context.master.active) return ineligible("PROMOTION_INACTIVE", input.baseRoomSubtotal, activation);

  if (
    !bookingDateWithinWindow({
      bookingBusinessDate: input.bookingBusinessDate,
      bookingFrom: activation.bookingFrom,
      bookingTo: activation.bookingTo,
    })
  ) {
    return ineligible("PROMOTION_BOOKING_WINDOW_MISMATCH", input.baseRoomSubtotal, activation);
  }

  if (
    !stayFullyWithinWindow({
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      validFrom: activation.validFrom,
      validTo: activation.validTo,
    })
  ) {
    return ineligible("PROMOTION_STAY_WINDOW_MISMATCH", input.baseRoomSubtotal, activation);
  }

  if (!roomTypeAllowed(activation, input.roomTypeId)) {
    return ineligible("PROMOTION_ROOM_TYPE_MISMATCH", input.baseRoomSubtotal, activation);
  }
  if (!ratePlanAllowed(activation, input.ratePlanId)) {
    return ineligible("PROMOTION_RATE_PLAN_MISMATCH", input.baseRoomSubtotal, activation);
  }

  const money = computePromotionDiscount({
    promoKind: activation.promoKind,
    promoValue: activation.promoValue,
    baseRoomSubtotal: input.baseRoomSubtotal,
  });
  if (!money.ok) return ineligible(money.reasonCode, input.baseRoomSubtotal, activation);

  return {
    eligible: true,
    reasonCode: "PROMOTION_ELIGIBLE",
    warnings: [],
    activation,
    computedDiscount: money.discount,
    roomSubtotalAfterPromotion: money.roomSubtotalAfterPromotion,
  };
}

export function listEligiblePromotionItems(
  input: Omit<PromotionEligibilityInput, "promotionActivationId">,
  records: PromotionEligibilityContext[],
): EligiblePromotionListItem[] {
  const items: EligiblePromotionListItem[] = [];
  for (const context of records) {
    if (!context.activation) continue;
    const result = evaluatePromotionEligibility(
      { ...input, promotionActivationId: context.activation.id },
      context,
    );
    if (!result.eligible || !result.activation) continue;
    items.push({
      activationId: result.activation.id,
      promotionId: result.activation.promotionId,
      code: result.activation.promotionCode,
      name: result.activation.promotionName,
      kind: result.activation.promoKind,
      value: result.activation.promoValue,
      computedDiscount: result.computedDiscount,
      roomSubtotalAfterPromotion: result.roomSubtotalAfterPromotion,
      priority: result.activation.priority,
    });
  }
  return items.sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code));
}

export function buildPromotionAttributionSnapshot(activation: PromotionActivation): PromotionAttributionSnapshot {
  return {
    activationId: activation.id,
    promotionId: activation.promotionId,
    code: activation.promotionCode,
    name: activation.promotionName,
    kind: activation.promoKind,
    value: activation.promoValue,
    bookingFrom: activation.bookingFrom,
    bookingTo: activation.bookingTo,
    validFrom: activation.validFrom,
    validTo: activation.validTo,
    roomTypeIds: [...activation.scope.roomTypeIds],
    ratePlanIds: [...activation.scope.ratePlanIds],
    masterRoomTypeIds: [...activation.masterRoomTypeIds],
    priority: activation.priority,
    reason: activation.reason,
  };
}

export function composePromotionQuote<TRoom extends { subtotal: number }>(
  room: TRoom,
  selected: PromotionEligibilityResult | null,
  eligiblePromotions: EligiblePromotionListItem[],
): {
  room: TRoom;
  baseRoomSubtotal: number;
  promotionDiscount: number;
  roomSubtotalAfterPromotion: number;
  packagesSubtotal: 0;
  grandCommercialSubtotal: number;
  appliedPromotion: EligiblePromotionListItem | null;
  eligiblePromotions: EligiblePromotionListItem[];
  commercialWarnings: string[];
} {
  const applied =
    selected?.eligible && selected.activation
      ? {
          activationId: selected.activation.id,
          promotionId: selected.activation.promotionId,
          code: selected.activation.promotionCode,
          name: selected.activation.promotionName,
          kind: selected.activation.promoKind,
          value: selected.activation.promoValue,
          computedDiscount: selected.computedDiscount,
          roomSubtotalAfterPromotion: selected.roomSubtotalAfterPromotion,
          priority: selected.activation.priority,
        }
      : null;
  const warnings: string[] = [];
  if (selected && !selected.eligible) warnings.push(selected.reasonCode);
  if (eligiblePromotions.length > 1) warnings.push("PROMOTION_OVERLAP_WARNING");
  const promotionDiscount = applied?.computedDiscount ?? 0;
  const roomSubtotalAfterPromotion = applied?.roomSubtotalAfterPromotion ?? room.subtotal;
  return {
    room,
    baseRoomSubtotal: room.subtotal,
    promotionDiscount,
    roomSubtotalAfterPromotion,
    packagesSubtotal: 0,
    grandCommercialSubtotal: roomSubtotalAfterPromotion,
    appliedPromotion: applied,
    eligiblePromotions,
    commercialWarnings: warnings,
  };
}

export function summarizePromotionPerformance(
  rows: Pick<ReservationPromotionAttribution, "reservationId" | "discountAmount" | "roomSubtotalAfterPromotion">[],
): PromotionPerformanceSummary {
  const reservations = new Set(rows.map((row) => row.reservationId));
  return {
    bookingCount: reservations.size,
    discountAmount: roundPromotionMoney(rows.reduce((sum, row) => sum + row.discountAmount, 0)),
    roomRevenueAfterPromotion: roundPromotionMoney(
      rows.reduce((sum, row) => sum + row.roomSubtotalAfterPromotion, 0),
    ),
  };
}
