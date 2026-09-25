/**
 * P5A-04 — Promotion activation preview.
 * Read-only. Apply revalidates in SQL. Do not trust browser snapshot fields.
 */

import {
  COMMERCIAL_ABSENT_VERSION,
  activationScopeIsSubset,
  classifyPromotionActivationAction,
  commercialActivationVersionToken,
  commercialChangedFields,
  commercialScopesEqual,
  commercialScopesOverlap,
  dateRangesOverlap,
  datesValid,
  effectiveCommercialScope,
  isV1ExecutablePromoKind,
  uniqueSortedIds,
  type CommercialActionType,
  type CommercialActivationOperation,
  type CommercialActivationState,
  type CommercialChangedField,
  type CommercialExpectedVersion,
  type CommercialPromoKind,
  type PromotionActivation,
} from "./commercial-engine.ts";

export const PROMOTION_ACTIVATION_REASON_CODES = [
  "PROMOTION_NOT_FOUND",
  "PROMOTION_ACTIVATION_NOT_FOUND",
  "PROMOTION_INACTIVE",
  "PROMOTION_KIND_UNSUPPORTED",
  "PROMOTION_WRONG_PROPERTY",
  "PROMOTION_ACTIVATION_DUPLICATE",
  "COMMERCIAL_DATES_INVALID",
  "COMMERCIAL_MASTER_WINDOW_BROADEN",
  "COMMERCIAL_SCOPE_WRONG_PROPERTY",
  "PROMOTION_SCOPE_BROADEN",
  "COMMERCIAL_ACTIVATION_STALE",
  "COMMERCIAL_OPERATION_INVALID",
] as const;

export type PromotionActivationReasonCode = (typeof PROMOTION_ACTIVATION_REASON_CODES)[number];

export type PromotionActivationPreviewInput = {
  restaurantId: string;
  operation: CommercialActivationOperation;
  promotionId?: string;
  activationId?: string;
  validFrom?: string;
  validTo?: string;
  bookingFrom?: string;
  bookingTo?: string;
  priority?: number;
  roomTypeIds?: string[];
  ratePlanIds?: string[];
  reason?: string | null;
  expectedVersion?: string;
};

export type PromotionMasterPreview = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  promoKind: CommercialPromoKind;
  promoValue: number;
  validFrom: string;
  validTo: string;
  active: boolean;
  roomTypeIds: string[];
  conditions?: string | null;
};

export type PromotionOverlapWarning = {
  code: "PROMOTION_ACTIVATION_OVERLAP";
  activationId: string;
  promotionCode: string;
  promotionName: string;
  overlapFrom: string;
  overlapTo: string;
  roomTypeIds: string[];
  ratePlanIds: string[];
  priority: number;
};

export type PromotionActivationPreviewContext = {
  master: PromotionMasterPreview | null;
  current: PromotionActivation | null;
  existing: PromotionActivation[];
  propertyRoomTypeIds: string[];
  propertyRatePlanIds: string[];
};

export type PromotionActivationPreview = {
  operation: CommercialActivationOperation;
  master: PromotionMasterPreview | null;
  currentActivation: PromotionActivation | null;
  proposedActivation: {
    promotionId: string;
    validFrom: string;
    validTo: string;
    bookingFrom: string;
    bookingTo: string;
    priority: number;
    active: boolean;
    reason: string | null;
    promotionCode: string;
    promotionName: string;
    promoKind: CommercialPromoKind;
    promoValue: number;
    masterValidFrom: string | null;
    masterValidTo: string | null;
    masterRoomTypeIds: string[];
    roomTypeIds: string[];
    ratePlanIds: string[];
  } | null;
  roomTypeScope: { selected: string[]; effective: string[]; all: boolean };
  ratePlanScope: { selected: string[]; effective: string[]; all: boolean };
  warnings: PromotionOverlapWarning[];
  errors: PromotionActivationReasonCode[];
  expectedVersion: CommercialExpectedVersion;
  changedFields: CommercialChangedField[];
  before: CommercialActivationState | null;
  after: CommercialActivationState | null;
  actionType: CommercialActionType | null;
};

function stateFromActivation(activation: PromotionActivation): CommercialActivationState {
  return {
    active: activation.active,
    validFrom: activation.validFrom,
    validTo: activation.validTo,
    bookingFrom: activation.bookingFrom,
    bookingTo: activation.bookingTo,
    priority: activation.priority,
    reason: activation.reason,
    roomTypeIds: [...activation.scope.roomTypeIds],
    ratePlanIds: [...activation.scope.ratePlanIds],
  };
}

export function previewPromotionActivation(
  input: PromotionActivationPreviewInput,
  context: PromotionActivationPreviewContext,
): PromotionActivationPreview {
  const errors: PromotionActivationReasonCode[] = [];
  const operation = input.operation;
  if (!["CREATE", "EDIT", "DEACTIVATE"].includes(operation)) {
    errors.push("COMMERCIAL_OPERATION_INVALID");
  }

  const current = context.current;
  const master = context.master;
  const expectedVersion = operation === "CREATE"
    ? COMMERCIAL_ABSENT_VERSION
    : commercialActivationVersionToken(current?.updatedAt);

  if (operation === "CREATE") {
    if (input.expectedVersion && input.expectedVersion !== COMMERCIAL_ABSENT_VERSION) {
      errors.push("COMMERCIAL_ACTIVATION_STALE");
    }
  } else if (input.expectedVersion && input.expectedVersion !== expectedVersion) {
    errors.push("COMMERCIAL_ACTIVATION_STALE");
  }

  if (operation !== "CREATE" && !current) errors.push("PROMOTION_ACTIVATION_NOT_FOUND");
  if (!master) errors.push("PROMOTION_NOT_FOUND");
  else {
    if (master.restaurantId !== input.restaurantId) errors.push("PROMOTION_WRONG_PROPERTY");
    if (operation === "CREATE" && !master.active) errors.push("PROMOTION_INACTIVE");
    if (operation === "CREATE" && !isV1ExecutablePromoKind(master.promoKind)) {
      errors.push("PROMOTION_KIND_UNSUPPORTED");
    }
  }

  const validFrom = operation === "DEACTIVATE" ? current?.validFrom ?? input.validFrom ?? "" : input.validFrom ?? current?.validFrom ?? "";
  const validTo = operation === "DEACTIVATE" ? current?.validTo ?? input.validTo ?? "" : input.validTo ?? current?.validTo ?? "";
  const bookingFrom = operation === "DEACTIVATE" ? current?.bookingFrom ?? input.bookingFrom ?? "" : input.bookingFrom ?? current?.bookingFrom ?? "";
  const bookingTo = operation === "DEACTIVATE" ? current?.bookingTo ?? input.bookingTo ?? "" : input.bookingTo ?? current?.bookingTo ?? "";
  const priority = operation === "DEACTIVATE" ? current?.priority ?? 100 : input.priority ?? current?.priority ?? 100;
  const reason = operation === "DEACTIVATE" ? current?.reason ?? null : (input.reason ?? current?.reason ?? null);
  const roomTypeIds = uniqueSortedIds(
    operation === "DEACTIVATE" ? current?.scope.roomTypeIds ?? [] : input.roomTypeIds ?? current?.scope.roomTypeIds ?? [],
  );
  const ratePlanIds = uniqueSortedIds(
    operation === "DEACTIVATE" ? current?.scope.ratePlanIds ?? [] : input.ratePlanIds ?? current?.scope.ratePlanIds ?? [],
  );
  const proposedActive = operation === "DEACTIVATE" ? false : true;

  if (!datesValid(validFrom, validTo) || !datesValid(bookingFrom, bookingTo) || !Number.isInteger(priority) || priority < 0) {
    errors.push("COMMERCIAL_DATES_INVALID");
  } else if (master && (validFrom < master.validFrom || validTo > master.validTo)) {
    errors.push("COMMERCIAL_MASTER_WINDOW_BROADEN");
  }

  const unknownRooms = roomTypeIds.filter((id) => !context.propertyRoomTypeIds.includes(id));
  const unknownPlans = ratePlanIds.filter((id) => !context.propertyRatePlanIds.includes(id));
  if (unknownRooms.length > 0 || unknownPlans.length > 0) errors.push("COMMERCIAL_SCOPE_WRONG_PROPERTY");
  if (master && !activationScopeIsSubset(roomTypeIds, master.roomTypeIds)) errors.push("PROMOTION_SCOPE_BROADEN");

  const execution = current
    ? {
        promotionCode: current.promotionCode,
        promotionName: current.promotionName,
        promoKind: current.promoKind,
        promoValue: current.promoValue,
        masterValidFrom: current.masterValidFrom,
        masterValidTo: current.masterValidTo,
        masterRoomTypeIds: [...current.masterRoomTypeIds],
      }
    : master
      ? {
          promotionCode: master.code,
          promotionName: master.name,
          promoKind: master.promoKind,
          promoValue: master.promoValue,
          masterValidFrom: master.validFrom,
          masterValidTo: master.validTo,
          masterRoomTypeIds: [...master.roomTypeIds],
        }
      : null;

  const masterRoomIds = execution?.masterRoomTypeIds ?? master?.roomTypeIds ?? [];
  const roomEffective = effectiveCommercialScope(roomTypeIds, masterRoomIds);
  const rateEffective = effectiveCommercialScope(ratePlanIds, []);

  const proposed = execution && master
    ? {
        promotionId: master.id,
        validFrom,
        validTo,
        bookingFrom,
        bookingTo,
        priority,
        active: proposedActive,
        reason: reason?.trim() ? reason.trim() : null,
        ...execution,
        roomTypeIds,
        ratePlanIds,
      }
    : null;

  const before = current ? stateFromActivation(current) : null;
  const after = proposed
    ? {
        active: proposed.active,
        validFrom,
        validTo,
        bookingFrom,
        bookingTo,
        priority,
        reason: proposed.reason,
        roomTypeIds,
        ratePlanIds,
      }
    : null;

  const warnings: PromotionOverlapWarning[] = [];
  if (proposed && proposedActive && errors.length === 0) {
    for (const other of context.existing) {
      if (!other.active) continue;
      if (current && other.id === current.id) continue;
      const otherRooms = effectiveCommercialScope(other.scope.roomTypeIds, other.masterRoomTypeIds);
      const otherPlans = effectiveCommercialScope(other.scope.ratePlanIds, []);
      const stayOverlap = dateRangesOverlap(validFrom, validTo, other.validFrom, other.validTo);
      if (
        stayOverlap
        && commercialScopesOverlap(roomEffective, otherRooms)
        && commercialScopesOverlap(rateEffective, otherPlans)
      ) {
        const sameExact =
          other.promotionId === proposed.promotionId
          && other.validFrom === validFrom
          && other.validTo === validTo
          && other.bookingFrom === bookingFrom
          && other.bookingTo === bookingTo
          && commercialScopesEqual(roomEffective, otherRooms)
          && commercialScopesEqual(rateEffective, otherPlans);
        if (sameExact) errors.push("PROMOTION_ACTIVATION_DUPLICATE");
        else {
          warnings.push({
            code: "PROMOTION_ACTIVATION_OVERLAP",
            activationId: other.id,
            promotionCode: other.promotionCode,
            promotionName: other.promotionName,
            overlapFrom: validFrom > other.validFrom ? validFrom : other.validFrom,
            overlapTo: validTo < other.validTo ? validTo : other.validTo,
            roomTypeIds: roomEffective.all || otherRooms.all ? [] : roomEffective.ids.filter((id) => otherRooms.ids.includes(id)),
            ratePlanIds: rateEffective.all || otherPlans.all ? [] : rateEffective.ids.filter((id) => otherPlans.ids.includes(id)),
            priority: other.priority,
          });
        }
      }
    }
  }

  return {
    operation,
    master,
    currentActivation: current,
    proposedActivation: proposed,
    roomTypeScope: { selected: roomTypeIds, effective: roomEffective.ids, all: roomEffective.all },
    ratePlanScope: { selected: ratePlanIds, effective: rateEffective.ids, all: rateEffective.all },
    warnings,
    errors: [...new Set(errors)],
    expectedVersion,
    changedFields: commercialChangedFields(before, after ?? {
      active: proposedActive,
      validFrom,
      validTo,
      bookingFrom,
      bookingTo,
      priority,
      reason: reason ?? null,
      roomTypeIds,
      ratePlanIds,
    }),
    before,
    after,
    actionType: errors.length === 0 ? classifyPromotionActivationAction(operation, before) : null,
  };
}

export function promotionActivationPreviewCanApply(preview: PromotionActivationPreview): boolean {
  return preview.errors.length === 0 && preview.proposedActivation != null;
}
