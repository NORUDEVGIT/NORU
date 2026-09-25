/**
 * P5A-01 — Commercial Engine domain types and snapshot helpers.
 *
 * Schema only in this prompt. Eligibility, quote compose, and apply RPCs
 * are later. Property Setup masters stay owners. Activations snapshot
 * execution fields so later master edits do not rewrite history.
 *
 * V1 locks:
 *   fixed = amount off stay room subtotal
 *   free_night is stored but not executable
 *   no stacking
 *   packages are additive per_stay
 *   room_subtotal stays pre-commercial
 *   empty room-type mappings inherit master
 *   empty rate-plan mappings allow all plans (promotions) or inherit master (packages)
 */

export const COMMERCIAL_NO_STACKING = true;
export const COMMERCIAL_DEFAULT_PRIORITY = 100;
export const COMMERCIAL_V1_PACKAGE_CHARGE_BASIS = "per_stay" as const;
export const COMMERCIAL_ABSENT_VERSION = "absent";
export const COMMERCIAL_CHANGE_EVENT_IMMUTABLE = "COMMERCIAL_CHANGE_EVENT_IMMUTABLE";

export const COMMERCIAL_PROMO_KINDS = ["percent", "fixed", "free_night"] as const;
export const COMMERCIAL_V1_EXECUTABLE_PROMO_KINDS = ["percent", "fixed"] as const;
export const COMMERCIAL_UNSUPPORTED_PROMO_KINDS = ["free_night"] as const;

export const COMMERCIAL_ENTITY_TYPES = ["promotion_activation", "package_activation"] as const;
export const COMMERCIAL_ACTION_TYPES = [
  "promotion_activation_created",
  "promotion_activation_edited",
  "promotion_activation_deactivated",
  "promotion_activation_scope_changed",
  "package_activation_created",
  "package_activation_edited",
  "package_activation_deactivated",
  "package_activation_scope_changed",
] as const;
export const COMMERCIAL_CHANGE_SOURCES = ["rate_revenue", "commercial_workspace"] as const;
export const COMMERCIAL_ACTIVATION_OPERATIONS = ["CREATE", "EDIT", "DEACTIVATE"] as const;
export const COMMERCIAL_HISTORY_SOURCE = "rate_revenue" as const;
export const COMMERCIAL_HISTORY_PAGE_SIZES = [10, 25, 50] as const;
export const COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE = 25;
export const COMMERCIAL_HISTORY_MAX_PAGE_SIZE = 100;
export const COMMERCIAL_CHANGED_FIELDS = [
  "validity",
  "bookingWindow",
  "priority",
  "active",
  "reason",
  "roomTypes",
  "ratePlans",
] as const;

export type CommercialPromoKind = (typeof COMMERCIAL_PROMO_KINDS)[number];
export type CommercialExecutablePromoKind = (typeof COMMERCIAL_V1_EXECUTABLE_PROMO_KINDS)[number];
export type CommercialPackageChargeBasis = typeof COMMERCIAL_V1_PACKAGE_CHARGE_BASIS;
export type CommercialEntityType = (typeof COMMERCIAL_ENTITY_TYPES)[number];
export type CommercialActionType = (typeof COMMERCIAL_ACTION_TYPES)[number];
export type CommercialChangeSource = (typeof COMMERCIAL_CHANGE_SOURCES)[number];
export type CommercialExpectedVersion = string;
export type CommercialActivationOperation = (typeof COMMERCIAL_ACTIVATION_OPERATIONS)[number];
export type CommercialChangedField = (typeof COMMERCIAL_CHANGED_FIELDS)[number];

export type CommercialEffectiveScope = {
  all: boolean;
  ids: string[];
};

export type CommercialActivationState = {
  active: boolean;
  validFrom: string;
  validTo: string;
  bookingFrom?: string | null;
  bookingTo?: string | null;
  priority?: number | null;
  reason: string | null;
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type PromotionActivationScope = {
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type PromotionActivationSnapshot = {
  promotionCode: string;
  promotionName: string;
  promoKind: CommercialPromoKind;
  promoValue: number;
  masterValidFrom: string | null;
  masterValidTo: string | null;
  masterRoomTypeIds: string[];
};

export type PromotionActivation = PromotionActivationSnapshot & {
  id: string;
  restaurantId: string;
  promotionId: string;
  validFrom: string;
  validTo: string;
  bookingFrom: string;
  bookingTo: string;
  active: boolean;
  priority: number;
  reason: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  scope: PromotionActivationScope;
};

export type PackageComponentSnapshot = {
  componentType: string;
  componentId: string | null;
  label: string;
  quantity: number;
};

export type PackageActivationScope = {
  roomTypeIds: string[];
  ratePlanIds: string[];
};

export type PackageActivationSnapshot = {
  packageCode: string;
  packageName: string;
  packageType: string | null;
  packagePrice: number;
  chargeBasis: CommercialPackageChargeBasis;
  components: PackageComponentSnapshot[];
  masterRoomTypeIds: string[];
  masterRatePlanIds: string[];
};

export type PackageActivation = PackageActivationSnapshot & {
  id: string;
  restaurantId: string;
  packageId: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  reason: string | null;
  createdByMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  scope: PackageActivationScope;
};

export type ReservationPromotionAttribution = {
  id: string;
  restaurantId: string;
  reservationId: string;
  promotionActivationId: string;
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  promoKind: CommercialPromoKind;
  promoValue: number;
  baseRoomSubtotal: number;
  discountAmount: number;
  roomSubtotalAfterPromotion: number;
  appliedAt: string;
};

export type ReservationPackageAttribution = {
  id: string;
  restaurantId: string;
  reservationId: string;
  packageActivationId: string;
  packageId: string;
  packageCode: string;
  packageName: string;
  chargeBasis: CommercialPackageChargeBasis;
  quantity: number;
  unitAmount: number;
  appliedAmount: number;
  components: PackageComponentSnapshot[];
  appliedAt: string;
};

export type CommercialChangeEvent = {
  id: string;
  restaurantId: string;
  operationId: string;
  entityType: CommercialEntityType;
  entityId: string;
  masterId: string | null;
  actionType: CommercialActionType;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  actorMembershipId: string | null;
  source: CommercialChangeSource;
  createdAt: string;
};

export function isV1ExecutablePromoKind(kind: string): kind is CommercialExecutablePromoKind {
  return (COMMERCIAL_V1_EXECUTABLE_PROMO_KINDS as readonly string[]).includes(kind);
}

export function emptyPromotionRoomTypeScopeInheritsMaster(roomTypeIds: string[]): boolean {
  return roomTypeIds.length === 0;
}

export function emptyPromotionRatePlanScopeAllowsAll(ratePlanIds: string[]): boolean {
  return ratePlanIds.length === 0;
}

export function commercialActivationVersionToken(updatedAt: string | null | undefined): CommercialExpectedVersion {
  return updatedAt?.trim() || COMMERCIAL_ABSENT_VERSION;
}

export function roomSubtotalAfterPromotion(baseRoomSubtotal: number, discountAmount: number): number {
  const after = Math.round((baseRoomSubtotal - discountAmount) * 100) / 100;
  return after < 0 ? 0 : after;
}

export function packageAppliedAmount(unitAmount: number, quantity: number): number {
  return Math.round(unitAmount * quantity * 100) / 100;
}

export function comparePromotionPriority(
  left: { priority: number; discountAmount: number; createdAt: string },
  right: { priority: number; discountAmount: number; createdAt: string },
): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.discountAmount !== right.discountAmount) return right.discountAmount - left.discountAmount;
  return left.createdAt.localeCompare(right.createdAt);
}

export function snapshotPromotionExecution(input: {
  code: string;
  name: string;
  promoKind: CommercialPromoKind;
  promoValue: number;
  masterValidFrom?: string | null;
  masterValidTo?: string | null;
  masterRoomTypeIds?: string[];
}): PromotionActivationSnapshot {
  return {
    promotionCode: input.code,
    promotionName: input.name,
    promoKind: input.promoKind,
    promoValue: input.promoValue,
    masterValidFrom: input.masterValidFrom ?? null,
    masterValidTo: input.masterValidTo ?? null,
    masterRoomTypeIds: [...(input.masterRoomTypeIds ?? [])],
  };
}

export function uniqueSortedIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

export function sameIdSet(left: string[], right: string[]): boolean {
  const a = uniqueSortedIds(left);
  const b = uniqueSortedIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function datesValid(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from;
}

export function dateRangesOverlap(leftFrom: string, leftTo: string, rightFrom: string, rightTo: string): boolean {
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

export function effectiveCommercialScope(activationIds: string[], masterIds: string[]): CommercialEffectiveScope {
  if (activationIds.length > 0) return { all: false, ids: uniqueSortedIds(activationIds) };
  if (masterIds.length > 0) return { all: false, ids: uniqueSortedIds(masterIds) };
  return { all: true, ids: [] };
}

export function commercialScopesOverlap(left: CommercialEffectiveScope, right: CommercialEffectiveScope): boolean {
  if (left.all || right.all) return true;
  return left.ids.some((id) => right.ids.includes(id));
}

export function commercialScopesEqual(left: CommercialEffectiveScope, right: CommercialEffectiveScope): boolean {
  return left.all === right.all && sameIdSet(left.ids, right.ids);
}

export function activationScopeIsSubset(selectedIds: string[], masterIds: string[]): boolean {
  if (masterIds.length === 0) return true;
  if (selectedIds.length === 0) return true;
  return selectedIds.every((id) => masterIds.includes(id));
}

export function commercialChangedFields(
  before: CommercialActivationState | null,
  after: CommercialActivationState,
): CommercialChangedField[] {
  if (!before) return [];
  const fields: CommercialChangedField[] = [];
  if (before.validFrom !== after.validFrom || before.validTo !== after.validTo) fields.push("validity");
  if ((before.bookingFrom ?? null) !== (after.bookingFrom ?? null) || (before.bookingTo ?? null) !== (after.bookingTo ?? null)) {
    fields.push("bookingWindow");
  }
  if ((before.priority ?? null) !== (after.priority ?? null)) fields.push("priority");
  if (before.active !== after.active) fields.push("active");
  if ((before.reason ?? null) !== (after.reason ?? null)) fields.push("reason");
  if (!sameIdSet(before.roomTypeIds, after.roomTypeIds)) fields.push("roomTypes");
  if (!sameIdSet(before.ratePlanIds, after.ratePlanIds)) fields.push("ratePlans");
  return fields;
}

export function classifyPromotionActivationAction(
  operation: CommercialActivationOperation,
  before: CommercialActivationState | null,
): CommercialActionType {
  if (operation === "CREATE") return "promotion_activation_created";
  if (operation === "DEACTIVATE") return "promotion_activation_deactivated";
  if (before && !before.active) return "promotion_activation_edited";
  return "promotion_activation_edited";
}

export function classifyPackageActivationAction(
  operation: CommercialActivationOperation,
  before: CommercialActivationState | null,
): CommercialActionType {
  if (operation === "CREATE") return "package_activation_created";
  if (operation === "DEACTIVATE") return "package_activation_deactivated";
  if (before && !before.active) return "package_activation_edited";
  return "package_activation_edited";
}

export function commercialHistoryActorLabel(row: {
  actorName?: string | null;
  actorMembershipId?: string | null;
}): string {
  if (row.actorName && row.actorName.trim()) return row.actorName;
  return "Staff";
}

export function snapshotPackageExecution(input: {
  code: string;
  name: string;
  packageType?: string | null;
  packagePrice: number;
  components?: PackageComponentSnapshot[];
  masterRoomTypeIds?: string[];
  masterRatePlanIds?: string[];
}): PackageActivationSnapshot {
  return {
    packageCode: input.code,
    packageName: input.name,
    packageType: input.packageType ?? null,
    packagePrice: input.packagePrice,
    chargeBasis: COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
    components: (input.components ?? []).map((row) => ({ ...row })),
    masterRoomTypeIds: [...(input.masterRoomTypeIds ?? [])],
    masterRatePlanIds: [...(input.masterRatePlanIds ?? [])],
  };
}
