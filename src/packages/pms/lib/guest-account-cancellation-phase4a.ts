/**
 * Phase 4A mapping for guest-account cancellation backfill.
 * Migration 0144 applies the same rules in SQL. This module is the
 * deterministic spec the focused tests execute without a database.
 *
 * An id that already exists on the canonical catalogue for the same property
 * is reused. Otherwise the Phase 2 equivalence rules apply. An existing
 * canonical id is not overwritten, and the legacy id is left in place.
 */

import {
  applyCorporateCancellationMigration,
  canonicalMatchesMappedLegacy,
  PHASE2_AMBIGUOUS_ERROR,
  PHASE2_CANNOT_CONVERT_ERROR,
  PHASE2_CODE_COLLISION_ERROR,
  PHASE2_CROSS_PROPERTY_ERROR,
  PHASE2_PENALTY_ERROR,
  type CanonicalCancellationPolicy,
  type CorporateAgreementCancellationLink,
  type LegacyCancellationPolicy,
  type Phase2CancellationState,
} from "./corporate-agreement-cancellation-phase2.ts";

export const PHASE4A_CROSS_PROPERTY_ERROR =
  "Phase 4A: guest account references a cancellation policy from another property";
export const PHASE4A_CANNOT_CONVERT_ERROR =
  "Phase 4A: referenced cancellation policy cannot be converted";
export const PHASE4A_AMBIGUOUS_ERROR = "Phase 4A: ambiguous canonical cancellation policy matches";
export const PHASE4A_CODE_COLLISION_ERROR = "Phase 4A: canonical cancellation code collision";
export const PHASE4A_PENALTY_ERROR = "Phase 4A: unsupported cancellation penalty type";

export type GuestAccountCancellationLink = {
  id: string;
  restaurantId: string;
  defaultCancellationPolicyId: string | null;
  rateCancellationPolicyId: string | null;
};

export type Phase4ACancellationState = {
  legacy: LegacyCancellationPolicy[];
  canonical: CanonicalCancellationPolicy[];
  accounts: GuestAccountCancellationLink[];
};

function cloneState(state: Phase4ACancellationState): Phase4ACancellationState {
  return {
    legacy: state.legacy.map((row) => ({ ...row })),
    canonical: state.canonical.map((row) => ({ ...row })),
    accounts: state.accounts.map((row) => ({ ...row })),
  };
}

function translatePhase2Error(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith(PHASE2_CROSS_PROPERTY_ERROR))
    throw new Error(PHASE4A_CROSS_PROPERTY_ERROR);
  if (message.startsWith(PHASE2_AMBIGUOUS_ERROR)) throw new Error(PHASE4A_AMBIGUOUS_ERROR);
  if (message.startsWith(PHASE2_CODE_COLLISION_ERROR))
    throw new Error(PHASE4A_CODE_COLLISION_ERROR);
  if (message.startsWith(PHASE2_PENALTY_ERROR)) throw new Error(PHASE4A_PENALTY_ERROR);
  if (message.startsWith(PHASE2_CANNOT_CONVERT_ERROR))
    throw new Error(PHASE4A_CANNOT_CONVERT_ERROR);
  throw error;
}

/**
 * Backfill guest accounts that still have only a legacy cancellation id.
 * Existing canonical ids and legacy ids are left in place.
 */
export function applyGuestAccountCancellationBackfill(
  state: Phase4ACancellationState,
): Phase4ACancellationState {
  const next = cloneState(state);

  for (const account of next.accounts) {
    if (account.rateCancellationPolicyId != null || !account.defaultCancellationPolicyId) continue;
    const legacySame = next.legacy.find(
      (policy) =>
        policy.id === account.defaultCancellationPolicyId &&
        policy.restaurantId === account.restaurantId,
    );
    const legacyAny = next.legacy.find(
      (policy) => policy.id === account.defaultCancellationPolicyId,
    );
    if (legacyAny && !legacySame) throw new Error(PHASE4A_CROSS_PROPERTY_ERROR);
  }

  for (const account of next.accounts) {
    if (account.rateCancellationPolicyId != null || !account.defaultCancellationPolicyId) continue;
    const direct = next.canonical.find(
      (policy) =>
        policy.id === account.defaultCancellationPolicyId &&
        policy.restaurantId === account.restaurantId,
    );
    if (direct) account.rateCancellationPolicyId = direct.id;
  }

  const pending = next.accounts.filter(
    (account) => account.rateCancellationPolicyId == null && account.defaultCancellationPolicyId,
  );
  const phase2: Phase2CancellationState = {
    legacy: next.legacy,
    canonical: next.canonical,
    agreements: pending.map((account): CorporateAgreementCancellationLink => ({
      id: account.id,
      restaurantId: account.restaurantId,
      cancellationPolicyId: account.defaultCancellationPolicyId,
      rateCancellationPolicyId: null,
    })),
  };

  let migrated: Phase2CancellationState;
  try {
    migrated = applyCorporateCancellationMigration(phase2);
  } catch (error) {
    translatePhase2Error(error);
  }

  next.canonical = migrated.canonical;
  for (const account of next.accounts) {
    if (account.rateCancellationPolicyId != null) continue;
    const updated = migrated.agreements.find((row) => row.id === account.id);
    if (updated?.rateCancellationPolicyId) {
      account.rateCancellationPolicyId = updated.rateCancellationPolicyId;
    }
  }

  const unresolved = next.accounts.some(
    (account) => account.defaultCancellationPolicyId && account.rateCancellationPolicyId == null,
  );
  if (unresolved) throw new Error(PHASE4A_CANNOT_CONVERT_ERROR);
  return next;
}

export function equivalentCanonicalCount(
  canonical: CanonicalCancellationPolicy[],
  policy: LegacyCancellationPolicy,
): number {
  return canonical.filter((row) => canonicalMatchesMappedLegacy(row, policy)).length;
}
