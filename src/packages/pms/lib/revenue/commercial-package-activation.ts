/**
 * P5A-04 — Package activation preview.
 * Read-only. Apply revalidates in SQL. Do not trust browser price or components.
 * Packages have no booking window. Overlaps are allowed; only exact duplicates fail.
 */

import {
  COMMERCIAL_ABSENT_VERSION,
  COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
  activationScopeIsSubset,
  classifyPackageActivationAction,
  commercialActivationVersionToken,
  commercialChangedFields,
  commercialScopesEqual,
  dateRangesOverlap,
  datesValid,
  effectiveCommercialScope,
  uniqueSortedIds,
  type CommercialActionType,
  type CommercialActivationOperation,
  type CommercialActivationState,
  type CommercialChangedField,
  type CommercialExpectedVersion,
  type PackageActivation,
  type PackageComponentSnapshot,
} from "./commercial-engine.ts";

export const PACKAGE_ACTIVATION_REASON_CODES = [
  "PACKAGE_NOT_FOUND",
  "PACKAGE_ACTIVATION_NOT_FOUND",
  "PACKAGE_INACTIVE",
  "PACKAGE_CHARGE_BASIS_UNSUPPORTED",
  "PACKAGE_PRICE_INVALID",
  "PACKAGE_WRONG_PROPERTY",
  "PACKAGE_ACTIVATION_DUPLICATE",
  "COMMERCIAL_DATES_INVALID",
  "COMMERCIAL_SCOPE_WRONG_PROPERTY",
  "PACKAGE_SCOPE_BROADEN",
  "COMMERCIAL_ACTIVATION_STALE",
  "COMMERCIAL_OPERATION_INVALID",
] as const;

export type PackageActivationReasonCode = (typeof PACKAGE_ACTIVATION_REASON_CODES)[number];

export type PackageActivationPreviewInput = {
  restaurantId: string;
  operation: CommercialActivationOperation;
  packageId?: string;
  activationId?: string;
  validFrom?: string;
  validTo?: string;
  roomTypeIds?: string[];
  ratePlanIds?: string[];
  reason?: string | null;
  expectedVersion?: string;
};

export type PackageMasterPreview = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  type: string | null;
  packagePrice: number;
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
  components: PackageComponentSnapshot[];
};

export type PackageActivationPreviewContext = {
  master: PackageMasterPreview | null;
  current: PackageActivation | null;
  existing: PackageActivation[];
  propertyRoomTypeIds: string[];
  propertyRatePlanIds: string[];
};

export type PackageActivationPreview = {
  operation: CommercialActivationOperation;
  master: PackageMasterPreview | null;
  currentActivation: PackageActivation | null;
  proposedActivation: {
    packageId: string;
    validFrom: string;
    validTo: string;
    active: boolean;
    reason: string | null;
    packageCode: string;
    packageName: string;
    packageType: string | null;
    packagePrice: number;
    chargeBasis: typeof COMMERCIAL_V1_PACKAGE_CHARGE_BASIS;
    components: PackageComponentSnapshot[];
    masterRoomTypeIds: string[];
    masterRatePlanIds: string[];
    roomTypeIds: string[];
    ratePlanIds: string[];
  } | null;
  roomTypeScope: { selected: string[]; effective: string[]; all: boolean };
  ratePlanScope: { selected: string[]; effective: string[]; all: boolean };
  warnings: [];
  errors: PackageActivationReasonCode[];
  expectedVersion: CommercialExpectedVersion;
  changedFields: CommercialChangedField[];
  before: CommercialActivationState | null;
  after: CommercialActivationState | null;
  actionType: CommercialActionType | null;
};

function stateFromActivation(activation: PackageActivation): CommercialActivationState {
  return {
    active: activation.active,
    validFrom: activation.validFrom,
    validTo: activation.validTo,
    reason: activation.reason,
    roomTypeIds: [...activation.scope.roomTypeIds],
    ratePlanIds: [...activation.scope.ratePlanIds],
  };
}

export function previewPackageActivation(
  input: PackageActivationPreviewInput,
  context: PackageActivationPreviewContext,
): PackageActivationPreview {
  const errors: PackageActivationReasonCode[] = [];
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

  if (operation !== "CREATE" && !current) errors.push("PACKAGE_ACTIVATION_NOT_FOUND");
  if (!master) errors.push("PACKAGE_NOT_FOUND");
  else {
    if (master.restaurantId !== input.restaurantId) errors.push("PACKAGE_WRONG_PROPERTY");
    if (operation === "CREATE" && !master.active) errors.push("PACKAGE_INACTIVE");
    if (operation === "CREATE" && !(Number.isFinite(master.packagePrice) && master.packagePrice > 0)) {
      errors.push("PACKAGE_PRICE_INVALID");
    }
  }

  const validFrom = operation === "DEACTIVATE" ? current?.validFrom ?? input.validFrom ?? "" : input.validFrom ?? current?.validFrom ?? "";
  const validTo = operation === "DEACTIVATE" ? current?.validTo ?? input.validTo ?? "" : input.validTo ?? current?.validTo ?? "";
  const reason = operation === "DEACTIVATE" ? current?.reason ?? null : (input.reason ?? current?.reason ?? null);
  const roomTypeIds = uniqueSortedIds(
    operation === "DEACTIVATE" ? current?.scope.roomTypeIds ?? [] : input.roomTypeIds ?? current?.scope.roomTypeIds ?? [],
  );
  const ratePlanIds = uniqueSortedIds(
    operation === "DEACTIVATE" ? current?.scope.ratePlanIds ?? [] : input.ratePlanIds ?? current?.scope.ratePlanIds ?? [],
  );
  const proposedActive = operation === "DEACTIVATE" ? false : true;

  if (!datesValid(validFrom, validTo)) errors.push("COMMERCIAL_DATES_INVALID");

  const unknownRooms = roomTypeIds.filter((id) => !context.propertyRoomTypeIds.includes(id));
  const unknownPlans = ratePlanIds.filter((id) => !context.propertyRatePlanIds.includes(id));
  if (unknownRooms.length > 0 || unknownPlans.length > 0) errors.push("COMMERCIAL_SCOPE_WRONG_PROPERTY");
  if (master && !activationScopeIsSubset(roomTypeIds, master.roomTypeIds)) errors.push("PACKAGE_SCOPE_BROADEN");
  if (master && !activationScopeIsSubset(ratePlanIds, master.ratePlanIds)) errors.push("PACKAGE_SCOPE_BROADEN");

  const execution = current
    ? {
        packageCode: current.packageCode,
        packageName: current.packageName,
        packageType: current.packageType,
        packagePrice: current.packagePrice,
        chargeBasis: current.chargeBasis,
        components: current.components.map((row) => ({ ...row })),
        masterRoomTypeIds: [...current.masterRoomTypeIds],
        masterRatePlanIds: [...current.masterRatePlanIds],
      }
    : master
      ? {
          packageCode: master.code,
          packageName: master.name,
          packageType: master.type,
          packagePrice: master.packagePrice,
          chargeBasis: COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
          components: master.components.map((row) => ({ ...row })),
          masterRoomTypeIds: [...master.roomTypeIds],
          masterRatePlanIds: [...master.ratePlanIds],
        }
      : null;

  if (execution && execution.chargeBasis !== COMMERCIAL_V1_PACKAGE_CHARGE_BASIS) {
    errors.push("PACKAGE_CHARGE_BASIS_UNSUPPORTED");
  }

  const masterRoomIds = execution?.masterRoomTypeIds ?? master?.roomTypeIds ?? [];
  const masterPlanIds = execution?.masterRatePlanIds ?? master?.ratePlanIds ?? [];
  const roomEffective = effectiveCommercialScope(roomTypeIds, masterRoomIds);
  const rateEffective = effectiveCommercialScope(ratePlanIds, masterPlanIds);

  const proposed = execution && master
    ? {
        packageId: master.id,
        validFrom,
        validTo,
        active: proposedActive,
        reason: reason?.trim() ? reason.trim() : null,
        ...execution,
        chargeBasis: COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
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
        reason: proposed.reason,
        roomTypeIds,
        ratePlanIds,
      }
    : null;

  if (proposed && proposedActive && errors.length === 0) {
    for (const other of context.existing) {
      if (!other.active) continue;
      if (current && other.id === current.id) continue;
      const otherRooms = effectiveCommercialScope(other.scope.roomTypeIds, other.masterRoomTypeIds);
      const otherPlans = effectiveCommercialScope(other.scope.ratePlanIds, other.masterRatePlanIds);
      if (
        other.packageId === proposed.packageId
        && other.validFrom === validFrom
        && other.validTo === validTo
        && commercialScopesEqual(roomEffective, otherRooms)
        && commercialScopesEqual(rateEffective, otherPlans)
        && dateRangesOverlap(validFrom, validTo, other.validFrom, other.validTo)
      ) {
        errors.push("PACKAGE_ACTIVATION_DUPLICATE");
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
    warnings: [],
    errors: [...new Set(errors)],
    expectedVersion,
    changedFields: commercialChangedFields(before, after ?? {
      active: proposedActive,
      validFrom,
      validTo,
      reason: reason ?? null,
      roomTypeIds,
      ratePlanIds,
    }),
    before,
    after,
    actionType: errors.length === 0 ? classifyPackageActivationAction(operation, before) : null,
  };
}

export function packageActivationPreviewCanApply(preview: PackageActivationPreview): boolean {
  return preview.errors.length === 0 && preview.proposedActivation != null;
}
