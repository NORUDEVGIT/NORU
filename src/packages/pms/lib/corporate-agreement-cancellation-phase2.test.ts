import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  applyCorporateCancellationMigration,
  corporateIdentityCode,
  corporateMigratedCode,
  mapLegacyCancellationKind,
  mapLegacyCancellationPenalty,
  PHASE2_AMBIGUOUS_ERROR,
  PHASE2_CODE_COLLISION_ERROR,
  PHASE2_CROSS_PROPERTY_ERROR,
  type CanonicalCancellationPolicy,
  type LegacyCancellationPolicy,
  type Phase2CancellationState,
} from "./corporate-agreement-cancellation-phase2.ts";

const propertyA = "property-a";
const propertyB = "property-b";

function legacy(overrides: Partial<LegacyCancellationPolicy> = {}): LegacyCancellationPolicy {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    restaurantId: propertyA,
    code: "CORP24",
    name: "Corporate 24h",
    description: "Legacy cutoff",
    cutoffHours: 24,
    penaltyType: "percent_stay",
    penaltyValue: 50,
    refundableBeforeCutoff: true,
    active: true,
    ...overrides,
  };
}

function canonical(
  overrides: Partial<CanonicalCancellationPolicy> = {},
): CanonicalCancellationPolicy {
  return {
    id: "canonical-existing",
    restaurantId: propertyA,
    code: "FLEX",
    name: "Flexible",
    description: null,
    deadlineHours: 48,
    penaltyType: "none",
    penaltyValue: 0,
    active: true,
    policyKind: "flexible",
    windowValue: 48,
    windowUnit: "hours_before_arrival",
    cutoffTime: null,
    ...overrides,
  };
}

function state(partial: Partial<Phase2CancellationState>): Phase2CancellationState {
  return {
    legacy: partial.legacy ?? [],
    canonical: partial.canonical ?? [],
    agreements: partial.agreements ?? [],
  };
}

describe("corporate agreement cancellation phase 2", () => {
  it("maps penalties and policy kind without treating a cutoff as non-refundable", () => {
    assert.equal(mapLegacyCancellationPenalty("none"), "none");
    assert.equal(mapLegacyCancellationPenalty("first_night"), "first_night");
    assert.equal(mapLegacyCancellationPenalty("percent_stay"), "percentage");
    assert.equal(mapLegacyCancellationPenalty("fixed_amount"), "fixed_amount");
    assert.equal(mapLegacyCancellationPenalty("full_stay"), "full_stay");
    assert.equal(mapLegacyCancellationKind(true), "free_cancellation");
    assert.equal(mapLegacyCancellationKind(false), "flexible");
  });

  it("creates a canonical policy for a referenced legacy policy and keeps the legacy id", () => {
    const policy = legacy();
    const result = applyCorporateCancellationMigration(
      state({
        legacy: [policy, legacy({ id: "unused", code: "UNUSED", name: "Unused" })],
        agreements: [
          {
            id: "agreement-1",
            restaurantId: propertyA,
            cancellationPolicyId: policy.id,
            rateCancellationPolicyId: null,
          },
        ],
      }),
    );
    assert.equal(result.canonical.length, 1);
    assert.equal(result.canonical[0]?.code, "CORP24");
    assert.equal(result.canonical[0]?.penaltyType, "percentage");
    assert.equal(result.canonical[0]?.penaltyValue, 50);
    assert.equal(result.canonical[0]?.policyKind, "free_cancellation");
    assert.equal(result.canonical[0]?.windowValue, 24);
    assert.equal(result.canonical[0]?.deadlineHours, 24);
    assert.equal(result.canonical[0]?.windowUnit, "hours_before_arrival");
    assert.equal(result.canonical[0]?.cutoffTime, null);
    assert.equal(result.canonical[0]?.restaurantId, propertyA);
    assert.equal(result.agreements[0]?.rateCancellationPolicyId, result.canonical[0]?.id);
    assert.equal(result.agreements[0]?.cancellationPolicyId, policy.id);
    assert.equal(
      result.canonical.some((row) => row.code === "UNUSED"),
      false,
    );
  });

  it("reuses one equivalent canonical row instead of inserting another", () => {
    const policy = legacy({
      penaltyType: "fixed_amount",
      penaltyValue: 75,
      refundableBeforeCutoff: false,
    });
    const existing = canonical({
      id: "already",
      code: "OTHER",
      name: policy.name,
      description: policy.description,
      deadlineHours: 24,
      penaltyType: "fixed_amount",
      penaltyValue: 75,
      policyKind: "flexible",
      windowValue: 24,
    });
    const result = applyCorporateCancellationMigration(
      state({
        legacy: [policy],
        canonical: [existing],
        agreements: [
          {
            id: "agreement-1",
            restaurantId: propertyA,
            cancellationPolicyId: policy.id,
            rateCancellationPolicyId: null,
          },
        ],
      }),
    );
    assert.equal(result.canonical.length, 1);
    assert.equal(result.canonical[0]?.id, "already");
    assert.equal(result.canonical[0]?.penaltyType, "fixed_amount");
    assert.equal(result.agreements[0]?.rateCancellationPolicyId, "already");
    assert.equal(result.agreements[0]?.cancellationPolicyId, policy.id);
  });

  it("does not overwrite a canonical id that is already set", () => {
    const policy = legacy();
    const existing = canonical();
    const result = applyCorporateCancellationMigration(
      state({
        legacy: [policy],
        canonical: [existing],
        agreements: [
          {
            id: "agreement-1",
            restaurantId: propertyA,
            cancellationPolicyId: policy.id,
            rateCancellationPolicyId: existing.id,
          },
        ],
      }),
    );
    assert.equal(result.canonical.length, 1);
    assert.equal(result.canonical[0]?.code, "FLEX");
    assert.equal(result.canonical[0]?.penaltyType, "none");
    assert.equal(result.agreements[0]?.rateCancellationPolicyId, existing.id);
    assert.equal(result.agreements[0]?.cancellationPolicyId, policy.id);
  });

  it("rejects a legacy policy from another property", () => {
    const policy = legacy({ restaurantId: propertyB });
    assert.throws(
      () =>
        applyCorporateCancellationMigration(
          state({
            legacy: [policy],
            agreements: [
              {
                id: "agreement-1",
                restaurantId: propertyA,
                cancellationPolicyId: policy.id,
                rateCancellationPolicyId: null,
              },
            ],
          }),
        ),
      new RegExp(PHASE2_CROSS_PROPERTY_ERROR),
    );
  });

  it("does not overwrite a same-code canonical row with different semantics", () => {
    const policy = legacy({ code: "FLEX", penaltyType: "first_night", penaltyValue: 0 });
    const existing = canonical({ code: "FLEX", name: "Different", penaltyType: "none" });
    const blockedCorp = canonical({
      id: "corp-blocked",
      code: corporateMigratedCode("FLEX"),
      name: "Blocked",
      penaltyType: "full_stay",
    });
    const result = applyCorporateCancellationMigration(
      state({
        legacy: [policy],
        canonical: [existing, blockedCorp],
        agreements: [
          {
            id: "agreement-1",
            restaurantId: propertyA,
            cancellationPolicyId: policy.id,
            rateCancellationPolicyId: null,
          },
        ],
      }),
    );
    const untouched = result.canonical.find((row) => row.id === "canonical-existing");
    const blocked = result.canonical.find((row) => row.id === "corp-blocked");
    assert.equal(untouched?.name, "Different");
    assert.equal(untouched?.penaltyType, "none");
    assert.equal(blocked?.penaltyType, "full_stay");
    const created = result.canonical.find(
      (row) => row.code === corporateIdentityCode("FLEX", policy.id),
    );
    assert.ok(created);
    assert.equal(created?.penaltyType, "first_night");
    assert.equal(created?.policyKind, "free_cancellation");
    assert.equal(result.agreements[0]?.rateCancellationPolicyId, created?.id);
    assert.equal(result.agreements[0]?.cancellationPolicyId, policy.id);
  });

  it("fails when two canonical rows are equally equivalent", () => {
    const policy = legacy({
      penaltyType: "full_stay",
      penaltyValue: 0,
      refundableBeforeCutoff: false,
    });
    const equivalent = {
      code: "ONE",
      name: policy.name,
      description: policy.description,
      deadlineHours: 24,
      penaltyType: "full_stay",
      penaltyValue: 0,
      policyKind: "flexible",
      windowValue: 24,
      active: true,
    };
    assert.throws(
      () =>
        applyCorporateCancellationMigration(
          state({
            legacy: [policy],
            canonical: [
              canonical({ id: "one", ...equivalent }),
              canonical({ id: "two", code: "TWO", ...equivalent }),
            ],
            agreements: [
              {
                id: "agreement-1",
                restaurantId: propertyA,
                cancellationPolicyId: policy.id,
                rateCancellationPolicyId: null,
              },
            ],
          }),
        ),
      new RegExp(PHASE2_AMBIGUOUS_ERROR),
    );
  });

  it("is idempotent", () => {
    const policy = legacy({ penaltyType: "none", penaltyValue: 0 });
    const initial = state({
      legacy: [policy],
      agreements: [
        {
          id: "agreement-1",
          restaurantId: propertyA,
          cancellationPolicyId: policy.id,
          rateCancellationPolicyId: null,
        },
      ],
    });
    const once = applyCorporateCancellationMigration(initial);
    const twice = applyCorporateCancellationMigration(once);
    assert.deepEqual(twice, once);
    assert.equal(twice.canonical.length, 1);
    assert.equal(twice.agreements[0]?.cancellationPolicyId, policy.id);
  });

  it("fails closed when every deterministic code is already a different policy", () => {
    const policy = legacy({ code: "FLEX" });
    assert.throws(
      () =>
        applyCorporateCancellationMigration(
          state({
            legacy: [policy],
            canonical: [
              canonical({ code: "FLEX", name: "Other" }),
              canonical({ id: "corp", code: corporateMigratedCode("FLEX"), name: "Other corp" }),
              canonical({
                id: "identity",
                code: corporateIdentityCode("FLEX", policy.id),
                name: "Other identity",
              }),
            ],
            agreements: [
              {
                id: "agreement-1",
                restaurantId: propertyA,
                cancellationPolicyId: policy.id,
                rateCancellationPolicyId: null,
              },
            ],
          }),
        ),
      new RegExp(PHASE2_CODE_COLLISION_ERROR),
    );
  });

  it("keeps the legacy catalogue, the legacy column, and the other cancellation consumers", () => {
    const drizzle = readFileSync(
      new URL(
        "../../../../drizzle/migrations/0143_pms_corporate_agreement_cancellation_backfill.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const supabase = readFileSync(
      new URL(
        "../../../../supabase/migrations/0143_pms_corporate_agreement_cancellation_backfill.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const executable = drizzle.split(/^DO \$\$/m)[1]?.split(/^END \$\$;/m)[0] ?? "";
    assert.equal(drizzle, supabase);
    assert.match(executable, /WHEN 'percent_stay' THEN 'percentage'/);
    assert.match(executable, /WHEN 'fixed_amount' THEN 'fixed_amount'/);
    assert.match(executable, /WHEN 'first_night' THEN 'first_night'/);
    assert.match(executable, /WHEN 'full_stay' THEN 'full_stay'/);
    assert.match(executable, /WHEN 'none' THEN 'none'/);
    assert.match(executable, /THEN 'free_cancellation'/);
    assert.match(executable, /ELSE 'flexible'/);
    assert.doesNotMatch(executable, /non_refundable/);
    assert.match(executable, /rate_cancellation_policy_id = chosen_id/);
    assert.match(executable, /a\.rate_cancellation_policy_id IS NULL/);
    assert.doesNotMatch(executable, /SET cancellation_policy_id/);
    assert.doesNotMatch(executable, /cancellation_policy_id = NULL/);
    assert.doesNotMatch(executable, /DROP TABLE/);
    assert.doesNotMatch(executable, /DROP COLUMN/);
    assert.doesNotMatch(executable, /hotel_rate_plans/);
    assert.doesNotMatch(executable, /hotel_reservations/);
    assert.match(drizzle, /A\. Legacy agreements/);
    assert.match(drizzle, /F\. Material semantic differences/);

    const rates = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
    const reservations = readFileSync(
      new URL("./reservations.functions.ts", import.meta.url),
      "utf8",
    );
    const payments = readFileSync(
      new URL("../components/settings/pms-property-setup-card3-payments.tsx", import.meta.url),
      "utf8",
    );
    const phase1 = readFileSync(
      new URL("./corporate-contracts.server.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(rates, /0143_pms_corporate_agreement_cancellation_backfill/);
    assert.doesNotMatch(rates, /rate_cancellation_policy_id/);
    assert.doesNotMatch(reservations, /0143_pms_corporate_agreement_cancellation_backfill/);
    assert.doesNotMatch(reservations, /rate_cancellation_policy_id/);
    assert.doesNotMatch(payments, /0143_pms_corporate_agreement_cancellation_backfill/);
    assert.doesNotMatch(payments, /rate_cancellation_policy_id/);
    assert.match(phase1, /export function resolveAgreementCancellation/);
    assert.doesNotMatch(phase1, /cancellationViewBase\(input\.legacy, "legacy"\)/);
  });
});
