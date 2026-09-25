/**
 * P5A-03 — Package Engine V1.
 *
 * Pure eligibility and additive money helpers. Quote compose layers
 * packages after the P5A-02 promotion result. Do not trust browser
 * snapshot, price, or component values.
 *
 * V1 locks:
 *   charge_basis = per_stay
 *   quantity normally 1
 *   additive outside room_subtotal
 *   promotion does not discount package amounts
 *   full-stay window: arrival >= valid_from AND last night <= valid_to
 *   no booking window
 *   empty activation scope inherits master; empty master = all
 *   multiple packages allowed; duplicates rejected
 *   room_subtotal stays pre-commercial
 */

import {
  COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
  packageAppliedAmount,
  type PackageActivation,
  type PackageComponentSnapshot,
  type ReservationPackageAttribution,
} from "./commercial-engine.ts";
import {
  composePromotionQuote,
  stayFullyWithinWindow,
  type EligiblePromotionListItem,
  type PromotionEligibilityResult,
} from "./commercial-promotion.ts";

export const PACKAGE_FULL_STAY_REQUIRED = true;
export const PACKAGE_EMPTY_MASTER_SCOPE_ALLOW_ALL = true;
export const PACKAGE_V1_QUANTITY = 1;
export const PACKAGE_PERFORMANCE_REVENUE_FIELD = "applied_amount" as const;

export const PACKAGE_REASON_CODES = [
  "PACKAGE_ELIGIBLE",
  "PACKAGE_NOT_FOUND",
  "PACKAGE_ACTIVATION_NOT_FOUND",
  "PACKAGE_INACTIVE",
  "PACKAGE_STAY_WINDOW_MISMATCH",
  "PACKAGE_ROOM_TYPE_MISMATCH",
  "PACKAGE_RATE_PLAN_MISMATCH",
  "PACKAGE_CHARGE_BASIS_UNSUPPORTED",
  "PACKAGE_PRICE_INVALID",
  "PACKAGE_WRONG_PROPERTY",
  "PACKAGE_DUPLICATE_SELECTION",
] as const;

export type PackageReasonCode = (typeof PACKAGE_REASON_CODES)[number];

export type PackageEligibilityInput = {
  restaurantId: string;
  packageActivationId: string;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: string;
  ratePlanId: string;
  quantity?: number;
  reservationId?: string;
};

export type PackageMasterRecord = {
  id: string;
  restaurantId: string;
  active: boolean;
};

export type PackageEligibilityContext = {
  activation: PackageActivation | null;
  master: PackageMasterRecord | null;
};

export type PackageEligibilityResult = {
  eligible: boolean;
  reasonCode: PackageReasonCode;
  warnings: string[];
  activation: PackageActivation | null;
  quantity: number;
  unitAmount: number;
  appliedAmount: number;
};

export type EligiblePackageListItem = {
  activationId: string;
  packageId: string;
  code: string;
  name: string;
  type: string | null;
  configuredPrice: number;
  chargeBasis: string;
  components: PackageComponentSnapshot[];
  appliedAmount: number;
  validFrom: string;
  validTo: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type AppliedPackageQuoteItem = {
  activationId: string;
  packageId: string;
  code: string;
  name: string;
  chargeBasis: string;
  quantity: number;
  unitAmount: number;
  appliedAmount: number;
  components: PackageComponentSnapshot[];
};

export type PackageAttributionSnapshot = {
  activationId: string;
  packageId: string;
  code: string;
  name: string;
  type: string | null;
  packagePrice: number;
  chargeBasis: string;
  components: PackageComponentSnapshot[];
  validFrom: string;
  validTo: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type PackagePerformanceSummary = {
  bookingCount: number;
  packageRevenue: number;
};

export function resolvePackageRoomTypeIds(activation: PackageActivation): string[] {
  const activationScope = activation.scope.roomTypeIds;
  const masterScope = activation.masterRoomTypeIds;
  if (activationScope.length > 0 && masterScope.length > 0) {
    return activationScope.filter((id) => masterScope.includes(id));
  }
  if (activationScope.length > 0) return activationScope;
  return masterScope;
}

export function resolvePackageRatePlanIds(activation: PackageActivation): string[] {
  const activationScope = activation.scope.ratePlanIds;
  const masterScope = activation.masterRatePlanIds;
  if (activationScope.length > 0 && masterScope.length > 0) {
    return activationScope.filter((id) => masterScope.includes(id));
  }
  if (activationScope.length > 0) return activationScope;
  return masterScope;
}

export function packageRoomTypeAllowed(activation: PackageActivation, roomTypeId: string): boolean {
  const masterScope = activation.masterRoomTypeIds;
  const activationScope = activation.scope.roomTypeIds;
  if (masterScope.length > 0 && !masterScope.includes(roomTypeId)) return false;
  if (activationScope.length > 0 && !activationScope.includes(roomTypeId)) return false;
  return true;
}

export function packageRatePlanAllowed(activation: PackageActivation, ratePlanId: string): boolean {
  const masterScope = activation.masterRatePlanIds;
  const activationScope = activation.scope.ratePlanIds;
  if (masterScope.length > 0 && !masterScope.includes(ratePlanId)) return false;
  if (activationScope.length > 0 && !activationScope.includes(ratePlanId)) return false;
  return true;
}

export function isV1ExecutablePackageChargeBasis(chargeBasis: string): boolean {
  return chargeBasis === COMMERCIAL_V1_PACKAGE_CHARGE_BASIS;
}

export function isValidPackagePrice(packagePrice: number): boolean {
  return Number.isFinite(packagePrice) && packagePrice > 0;
}

export function isValidPackageQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1;
}

export function roundPackageMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computePackageAmount(input: {
  packagePrice: number;
  chargeBasis: string;
  quantity?: number;
}): { ok: true; quantity: number; unitAmount: number; appliedAmount: number } | { ok: false; reasonCode: PackageReasonCode } {
  if (!isV1ExecutablePackageChargeBasis(input.chargeBasis)) {
    return { ok: false, reasonCode: "PACKAGE_CHARGE_BASIS_UNSUPPORTED" };
  }
  if (!isValidPackagePrice(input.packagePrice)) {
    return { ok: false, reasonCode: "PACKAGE_PRICE_INVALID" };
  }
  const quantity = input.quantity ?? PACKAGE_V1_QUANTITY;
  if (!isValidPackageQuantity(quantity)) {
    return { ok: false, reasonCode: "PACKAGE_PRICE_INVALID" };
  }
  const unitAmount = roundPackageMoney(input.packagePrice);
  return {
    ok: true,
    quantity,
    unitAmount,
    appliedAmount: packageAppliedAmount(unitAmount, quantity),
  };
}

export function uniquePackageActivationIds(ids: string[]): { ok: true; ids: string[] } | { ok: false; reasonCode: "PACKAGE_DUPLICATE_SELECTION" } {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) return { ok: false, reasonCode: "PACKAGE_DUPLICATE_SELECTION" };
  return { ok: true, ids };
}

function ineligible(
  reasonCode: PackageReasonCode,
  activation: PackageActivation | null = null,
  quantity = PACKAGE_V1_QUANTITY,
): PackageEligibilityResult {
  return {
    eligible: false,
    reasonCode,
    warnings: [],
    activation,
    quantity,
    unitAmount: 0,
    appliedAmount: 0,
  };
}

export function evaluatePackageEligibility(
  input: PackageEligibilityInput,
  context: PackageEligibilityContext,
): PackageEligibilityResult {
  const quantity = input.quantity ?? PACKAGE_V1_QUANTITY;
  const activation = context.activation;
  if (!activation) return ineligible("PACKAGE_ACTIVATION_NOT_FOUND", null, quantity);
  if (activation.id !== input.packageActivationId) {
    return ineligible("PACKAGE_ACTIVATION_NOT_FOUND", null, quantity);
  }
  if (activation.restaurantId !== input.restaurantId) {
    return ineligible("PACKAGE_WRONG_PROPERTY", activation, quantity);
  }
  if (!activation.active) return ineligible("PACKAGE_INACTIVE", activation, quantity);
  if (!context.master) return ineligible("PACKAGE_NOT_FOUND", activation, quantity);
  if (context.master.restaurantId !== input.restaurantId || context.master.id !== activation.packageId) {
    return ineligible("PACKAGE_WRONG_PROPERTY", activation, quantity);
  }
  if (!context.master.active) return ineligible("PACKAGE_INACTIVE", activation, quantity);

  if (
    !stayFullyWithinWindow({
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      validFrom: activation.validFrom,
      validTo: activation.validTo,
    })
  ) {
    return ineligible("PACKAGE_STAY_WINDOW_MISMATCH", activation, quantity);
  }

  if (!packageRoomTypeAllowed(activation, input.roomTypeId)) {
    return ineligible("PACKAGE_ROOM_TYPE_MISMATCH", activation, quantity);
  }
  if (!packageRatePlanAllowed(activation, input.ratePlanId)) {
    return ineligible("PACKAGE_RATE_PLAN_MISMATCH", activation, quantity);
  }

  const money = computePackageAmount({
    packagePrice: activation.packagePrice,
    chargeBasis: activation.chargeBasis,
    quantity,
  });
  if (!money.ok) return ineligible(money.reasonCode, activation, quantity);

  return {
    eligible: true,
    reasonCode: "PACKAGE_ELIGIBLE",
    warnings: [],
    activation,
    quantity: money.quantity,
    unitAmount: money.unitAmount,
    appliedAmount: money.appliedAmount,
  };
}

export function listEligiblePackageItems(
  input: Omit<PackageEligibilityInput, "packageActivationId">,
  records: PackageEligibilityContext[],
): EligiblePackageListItem[] {
  const items: EligiblePackageListItem[] = [];
  for (const context of records) {
    if (!context.activation) continue;
    const result = evaluatePackageEligibility(
      { ...input, packageActivationId: context.activation.id },
      context,
    );
    if (!result.eligible || !result.activation) continue;
    items.push({
      activationId: result.activation.id,
      packageId: result.activation.packageId,
      code: result.activation.packageCode,
      name: result.activation.packageName,
      type: result.activation.packageType,
      configuredPrice: result.activation.packagePrice,
      chargeBasis: result.activation.chargeBasis,
      components: result.activation.components.map((row) => ({ ...row })),
      appliedAmount: result.appliedAmount,
      validFrom: result.activation.validFrom,
      validTo: result.activation.validTo,
      roomTypeIds: resolvePackageRoomTypeIds(result.activation),
      ratePlanIds: resolvePackageRatePlanIds(result.activation),
    });
  }
  return items.sort((left, right) => left.code.localeCompare(right.code));
}

export function evaluateSelectedPackages(
  input: Omit<PackageEligibilityInput, "packageActivationId">,
  selectedIds: string[],
  records: PackageEligibilityContext[],
): { ok: true; applied: AppliedPackageQuoteItem[]; results: PackageEligibilityResult[] } | { ok: false; reasonCode: PackageReasonCode; results: PackageEligibilityResult[] } {
  const unique = uniquePackageActivationIds(selectedIds);
  if (!unique.ok) return { ok: false, reasonCode: unique.reasonCode, results: [] };

  const byId = new Map(records.map((row) => [row.activation?.id, row]));
  const results: PackageEligibilityResult[] = [];
  const applied: AppliedPackageQuoteItem[] = [];
  for (const id of unique.ids) {
    const result = evaluatePackageEligibility(
      { ...input, packageActivationId: id },
      byId.get(id) ?? { activation: null, master: null },
    );
    results.push(result);
    if (!result.eligible || !result.activation) {
      return { ok: false, reasonCode: result.reasonCode, results };
    }
    applied.push({
      activationId: result.activation.id,
      packageId: result.activation.packageId,
      code: result.activation.packageCode,
      name: result.activation.packageName,
      chargeBasis: result.activation.chargeBasis,
      quantity: result.quantity,
      unitAmount: result.unitAmount,
      appliedAmount: result.appliedAmount,
      components: result.activation.components.map((row) => ({ ...row })),
    });
  }
  return { ok: true, applied, results };
}

export function buildPackageAttributionSnapshot(activation: PackageActivation): PackageAttributionSnapshot {
  return {
    activationId: activation.id,
    packageId: activation.packageId,
    code: activation.packageCode,
    name: activation.packageName,
    type: activation.packageType,
    packagePrice: activation.packagePrice,
    chargeBasis: activation.chargeBasis,
    components: activation.components.map((row) => ({ ...row })),
    validFrom: activation.validFrom,
    validTo: activation.validTo,
    roomTypeIds: [...resolvePackageRoomTypeIds(activation)],
    ratePlanIds: [...resolvePackageRatePlanIds(activation)],
  };
}

export function composeCommercialQuote<TRoom extends { subtotal: number }>(
  room: TRoom,
  selectedPromotion: PromotionEligibilityResult | null,
  eligiblePromotions: EligiblePromotionListItem[],
  selectedPackages: AppliedPackageQuoteItem[],
  eligiblePackages: EligiblePackageListItem[],
  packageWarnings: string[] = [],
): {
  room: TRoom;
  baseRoomSubtotal: number;
  promotionDiscount: number;
  roomSubtotalAfterPromotion: number;
  packages: AppliedPackageQuoteItem[];
  packagesSubtotal: number;
  grandCommercialSubtotal: number;
  appliedPromotion: EligiblePromotionListItem | null;
  eligiblePromotions: EligiblePromotionListItem[];
  eligiblePackages: EligiblePackageListItem[];
  commercialWarnings: string[];
} {
  const promo = composePromotionQuote(room, selectedPromotion, eligiblePromotions);
  const packagesSubtotal = roundPackageMoney(selectedPackages.reduce((sum, row) => sum + row.appliedAmount, 0));
  return {
    ...promo,
    packages: selectedPackages,
    packagesSubtotal,
    grandCommercialSubtotal: roundPackageMoney(promo.roomSubtotalAfterPromotion + packagesSubtotal),
    eligiblePackages,
    commercialWarnings: [...promo.commercialWarnings, ...packageWarnings],
  };
}

export function summarizePackagePerformance(
  rows: Pick<ReservationPackageAttribution, "reservationId" | "appliedAmount">[],
): PackagePerformanceSummary {
  return {
    bookingCount: new Set(rows.map((row) => row.reservationId)).size,
    packageRevenue: roundPackageMoney(rows.reduce((sum, row) => sum + row.appliedAmount, 0)),
  };
}
