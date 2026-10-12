/**
 * Phase 2 mapping for corporate agreement cancellation backfill.
 * Migration 0143 applies the same rules in SQL. This module is the
 * deterministic spec the focused tests execute without a database.
 */

export const PHASE2_CROSS_PROPERTY_ERROR =
  "Phase 2: corporate agreement references a cancellation policy from another property";
export const PHASE2_CANNOT_CONVERT_ERROR =
  "Phase 2: referenced cancellation policy cannot be converted";
export const PHASE2_PENALTY_ERROR = "Phase 2: unsupported cancellation penalty type";
export const PHASE2_AMBIGUOUS_ERROR = "Phase 2: ambiguous canonical cancellation policy matches";
export const PHASE2_CODE_COLLISION_ERROR = "Phase 2: canonical cancellation code collision";

const SUPPORTED_LEGACY_PENALTIES = [
  "none",
  "first_night",
  "percent_stay",
  "fixed_amount",
  "full_stay",
] as const;

export type LegacyCancellationPolicy = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  cutoffHours: number;
  penaltyType: string;
  penaltyValue: number;
  refundableBeforeCutoff: boolean;
  active: boolean;
};

export type CanonicalCancellationPolicy = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  description: string | null;
  deadlineHours: number | null;
  penaltyType: string;
  penaltyValue: number;
  active: boolean;
  policyKind: string;
  windowValue: number | null;
  windowUnit: string;
  cutoffTime: string | null;
};

export type CorporateAgreementCancellationLink = {
  id: string;
  restaurantId: string;
  cancellationPolicyId: string | null;
  rateCancellationPolicyId: string | null;
};

export type Phase2CancellationState = {
  legacy: LegacyCancellationPolicy[];
  canonical: CanonicalCancellationPolicy[];
  agreements: CorporateAgreementCancellationLink[];
};

export function mapLegacyCancellationPenalty(penaltyType: string): string {
  switch (penaltyType) {
    case "none":
    case "first_night":
    case "fixed_amount":
    case "full_stay":
      return penaltyType;
    case "percent_stay":
      return "percentage";
    default:
      throw new Error(`${PHASE2_PENALTY_ERROR}: ${penaltyType}`);
  }
}

/**
 * true → free_cancellation, as specified.
 * false → flexible, not non_refundable. Card 2 stores non_refundable with a
 * null window and null deadline. Legacy rows always keep cutoff_hours, and
 * false means the penalty applies before that cutoff.
 */
export function mapLegacyCancellationKind(
  refundableBeforeCutoff: boolean,
): "free_cancellation" | "flexible" {
  return refundableBeforeCutoff ? "free_cancellation" : "flexible";
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function corporateMigratedCode(legacyCode: string): string {
  const base = legacyCode.length <= 15 ? legacyCode : legacyCode.slice(0, 15);
  return `${base}_CORP`;
}

export function corporateIdentityCode(legacyCode: string, legacyId: string): string {
  const hex = legacyId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${legacyCode.slice(0, 11)}_${hex}`;
}

export function canonicalCodeFits(code: string): boolean {
  return /^[A-Z0-9_]{1,20}$/.test(code);
}

function mappedFromLegacy(policy: LegacyCancellationPolicy) {
  return {
    restaurantId: policy.restaurantId,
    name: policy.name.trim(),
    description: blankToNull(policy.description),
    active: policy.active,
    policyKind: mapLegacyCancellationKind(policy.refundableBeforeCutoff),
    windowValue: policy.cutoffHours,
    windowUnit: "hours_before_arrival" as const,
    cutoffTime: null,
    deadlineHours: policy.cutoffHours,
    penaltyType: mapLegacyCancellationPenalty(policy.penaltyType),
    penaltyValue: policy.penaltyValue,
  };
}

export function canonicalMatchesMappedLegacy(
  canonical: CanonicalCancellationPolicy,
  policy: LegacyCancellationPolicy,
): boolean {
  if (
    !SUPPORTED_LEGACY_PENALTIES.includes(
      policy.penaltyType as (typeof SUPPORTED_LEGACY_PENALTIES)[number],
    )
  ) {
    return false;
  }
  const mapped = mappedFromLegacy(policy);
  return (
    canonical.restaurantId === mapped.restaurantId &&
    canonical.name.trim() === mapped.name &&
    blankToNull(canonical.description) === mapped.description &&
    canonical.active === mapped.active &&
    canonical.policyKind === mapped.policyKind &&
    canonical.windowValue === mapped.windowValue &&
    canonical.windowUnit === mapped.windowUnit &&
    canonical.deadlineHours === mapped.deadlineHours &&
    canonical.penaltyType === mapped.penaltyType &&
    Number(canonical.penaltyValue) === Number(mapped.penaltyValue) &&
    canonical.cutoffTime == null
  );
}

function cloneState(state: Phase2CancellationState): Phase2CancellationState {
  return {
    legacy: state.legacy.map((row) => ({ ...row })),
    canonical: state.canonical.map((row) => ({ ...row })),
    agreements: state.agreements.map((row) => ({ ...row })),
  };
}

/**
 * Backfill agreements that still have only a legacy cancellation id.
 * Existing canonical ids and legacy ids are left in place.
 */
export function applyCorporateCancellationMigration(
  state: Phase2CancellationState,
): Phase2CancellationState {
  const next = cloneState(state);
  const pending = next.agreements.filter(
    (agreement) => agreement.rateCancellationPolicyId == null && agreement.cancellationPolicyId,
  );

  for (const agreement of pending) {
    const sameProperty = next.legacy.find(
      (policy) =>
        policy.id === agreement.cancellationPolicyId &&
        policy.restaurantId === agreement.restaurantId,
    );
    const anyProperty = next.legacy.find((policy) => policy.id === agreement.cancellationPolicyId);
    if (anyProperty && anyProperty.restaurantId !== agreement.restaurantId) {
      throw new Error(PHASE2_CROSS_PROPERTY_ERROR);
    }
    if (!sameProperty) throw new Error(PHASE2_CANNOT_CONVERT_ERROR);
    mapLegacyCancellationPenalty(sameProperty.penaltyType);
  }

  const pendingPolicyIds = [
    ...new Set(pending.map((agreement) => agreement.cancellationPolicyId as string)),
  ].sort();

  for (const policyId of pendingPolicyIds) {
    const policy = next.legacy.find((row) => row.id === policyId);
    if (!policy) throw new Error(PHASE2_CANNOT_CONVERT_ERROR);
    const needing = pending.filter(
      (agreement) =>
        agreement.cancellationPolicyId === policy.id &&
        agreement.restaurantId === policy.restaurantId,
    );
    if (!needing.length) continue;

    const matches = next.canonical.filter((row) => canonicalMatchesMappedLegacy(row, policy));
    if (matches.length > 1)
      throw new Error(`${PHASE2_AMBIGUOUS_ERROR} for legacy policy ${policy.id}`);

    let chosenId = matches[0]?.id ?? null;
    if (!chosenId) {
      const corpCode = corporateMigratedCode(policy.code);
      const identityCode = corporateIdentityCode(policy.code, policy.id);
      const taken = (code: string) =>
        next.canonical.some((row) => row.restaurantId === policy.restaurantId && row.code === code);
      let targetCode: string | null = null;
      if (canonicalCodeFits(policy.code) && !taken(policy.code)) targetCode = policy.code;
      else if (!taken(corpCode) && canonicalCodeFits(corpCode)) targetCode = corpCode;
      else if (!taken(identityCode) && canonicalCodeFits(identityCode)) targetCode = identityCode;
      else throw new Error(`${PHASE2_CODE_COLLISION_ERROR} for legacy policy ${policy.id}`);

      const mapped = mappedFromLegacy(policy);
      chosenId = `migrated:${policy.id}:${targetCode}`;
      next.canonical.push({
        id: chosenId,
        restaurantId: mapped.restaurantId,
        code: targetCode,
        name: mapped.name,
        description: mapped.description,
        deadlineHours: mapped.deadlineHours,
        penaltyType: mapped.penaltyType,
        penaltyValue: mapped.penaltyValue,
        active: mapped.active,
        policyKind: mapped.policyKind,
        windowValue: mapped.windowValue,
        windowUnit: mapped.windowUnit,
        cutoffTime: mapped.cutoffTime,
      });
    }

    for (const agreement of next.agreements) {
      if (
        agreement.cancellationPolicyId === policy.id &&
        agreement.restaurantId === policy.restaurantId &&
        agreement.rateCancellationPolicyId == null
      ) {
        agreement.rateCancellationPolicyId = chosenId;
      }
    }
  }

  const unresolved = next.agreements.some(
    (agreement) => agreement.cancellationPolicyId && agreement.rateCancellationPolicyId == null,
  );
  if (unresolved) throw new Error(PHASE2_CANNOT_CONVERT_ERROR);
  return next;
}
