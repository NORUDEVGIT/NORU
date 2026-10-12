import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  agreementCancellationColumnsForSave,
  resolveAgreementCancellation,
  type CanonicalAgreementCancellationRow,
} from "./corporate-contracts.server.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const canonical: CanonicalAgreementCancellationRow = {
  id: "rate-policy",
  code: "FLEX_24",
  name: "Flexible 24h",
  description: null,
  penaltyType: "percentage",
  penaltyValue: 10,
  policyKind: "flexible",
  windowValue: 24,
  windowUnit: "hours_before_arrival",
  cutoffTime: null,
  deadlineHours: 24,
};

describe("legacy cancellation catalogue phase 4B", () => {
  const migration = read(
    "../../../../drizzle/migrations/0145_retire_legacy_cancellation_catalogue.sql",
  );
  const migrationCopy = read(
    "../../../../supabase/migrations/0145_retire_legacy_cancellation_catalogue.sql",
  );
  const contracts = read("./corporate-contracts.functions.ts");
  const contractServer = read("./corporate-contracts.server.ts");
  const companyDetail = read("./guest-company-detail.functions.ts");
  const companyCreate = read("./guest-company-create.functions.ts");
  const travel = read("./guest-travel-agency-step4.server.ts");
  const card2 = read("./rates-card2.functions.ts");
  const rates = read("./rates.functions.ts");
  const reservations = read("./reservations.functions.ts");
  const cashiering = read("./cashiering.functions.ts");
  const frontOffice = read("../components/workspaces/reservation-cancel-workspace.tsx");
  const payments = read("../components/settings/pms-property-setup-card3-payments.tsx");
  const ratesUi = read("../components/settings/pms-property-setup-card2-rates.tsx");

  it("resolves a corporate agreement from the canonical policy only", () => {
    const view = resolveAgreementCancellation({
      rateCancellationPolicyId: canonical.id,
      canonical,
    });
    assert.equal(view?.source, "canonical");
    assert.equal(view?.id, canonical.id);
    assert.equal(resolveAgreementCancellation({ rateCancellationPolicyId: null, canonical }), null);
    assert.doesNotMatch(companyDetail, /from\("pms_cancellation_policies"\)/);
    assert.doesNotMatch(companyDetail, /(?<!rate_)cancellation_policy_id/);
    assert.match(companyDetail, /rate_cancellation_policy_id/);
  });

  it("writes only the canonical corporate agreement id", () => {
    assert.deepEqual(
      agreementCancellationColumnsForSave({
        selectedPolicyId: canonical.id,
        canonical: { id: canonical.id, restaurantId: "property-a" },
        restaurantId: "property-a",
      }),
      { rate_cancellation_policy_id: canonical.id },
    );
    assert.deepEqual(
      agreementCancellationColumnsForSave({
        selectedPolicyId: null,
        canonical: null,
        restaurantId: "property-a",
      }),
      { rate_cancellation_policy_id: null },
    );
    assert.doesNotMatch(companyCreate, /(?<!rate_)cancellation_policy_id/);
    assert.match(
      companyCreate,
      /rate_cancellation_policy_id: cancellationColumns.rate_cancellation_policy_id/,
    );
    assert.doesNotMatch(contractServer, /legacyCancellationPolicyId/);
  });

  it("removes the legacy cancellation APIs and keeps canonical catalogues", () => {
    assert.doesNotMatch(contracts, /export const listPmsCancellationPolicies/);
    assert.doesNotMatch(contracts, /export const savePmsCancellationPolicy/);
    assert.doesNotMatch(contracts, /export const setPmsCancellationPolicyActive/);
    assert.doesNotMatch(contracts, /pms_cancellation_policies/);
    assert.doesNotMatch(contractServer, /CancellationPolicyRecord/);
    assert.doesNotMatch(contractServer, /cancellationPolicyDraftSchema/);
    assert.match(contracts, /from\("pms_rate_cancellation_policies"\)/);
    assert.match(travel, /from\("pms_rate_cancellation_policies"\)/);
    assert.match(travel, /rate_cancellation_policy_id: payload.defaultCancellationPolicyId/);
    const saveStart = card2.indexOf("export const saveRateCancellationPolicyCard2");
    const saveEnd = card2.indexOf("export const saveRateRefundabilityCard2");
    const save = card2.slice(saveStart, saveEnd);
    assert.match(save, /from\("pms_rate_cancellation_policies"\)/);
    assert.doesNotMatch(save, /pms_cancellation_policies/);
    assert.match(ratesUi, /title="Cancellation policies"/);
    assert.match(payments, /Cancellation policies are managed in Rate &amp; Pricing/);
    assert.doesNotMatch(payments, /title="Cancellation policies"/);
  });

  it("asserts safety, drops the legacy columns and table, and does not use CASCADE", () => {
    assert.equal(migration, migrationCopy);
    assert.match(migration, /corporate agreement still has only a legacy cancellation policy/);
    assert.match(
      migration,
      /corporate agreement canonical cancellation policy is missing or belongs to another property/,
    );
    assert.match(migration, /guest account still has only a legacy cancellation policy/);
    assert.match(
      migration,
      /guest account canonical cancellation policy is missing or belongs to another property/,
    );
    assert.match(
      migration,
      /DROP CONSTRAINT IF EXISTS pms_corporate_agreements_cancellation_policy_id_fkey/,
    );
    assert.match(
      migration,
      /DROP CONSTRAINT IF EXISTS guest_account_masters_default_cancellation_policy_fk/,
    );
    assert.match(migration, /DROP COLUMN IF EXISTS cancellation_policy_id/);
    assert.match(migration, /DROP COLUMN IF EXISTS default_cancellation_policy_id/);
    assert.match(migration, /DROP TABLE IF EXISTS public\.pms_cancellation_policies;/);
    assert.doesNotMatch(migration, /CASCADE/);
    assert.doesNotMatch(migration, /DROP COLUMN IF EXISTS rate_cancellation_policy_id/);
    assert.doesNotMatch(
      migration,
      /DROP CONSTRAINT IF EXISTS pms_corporate_agreements_rate_cancellation_same_property/,
    );
    assert.doesNotMatch(
      migration,
      /DROP CONSTRAINT IF EXISTS guest_account_masters_rate_cancellation_same_property/,
    );
    assert.match(migration, /refusing to drop the table while dependencies remain/);
  });

  it("leaves rate plans, quotes, reservation create, front office, and cashiering unchanged", () => {
    assert.match(rates, /export const quoteStay/);
    assert.match(rates, /cancellation_policy_id: data\.cancellationPolicyId/);
    assert.doesNotMatch(rates, /pms_cancellation_policies/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.doesNotMatch(reservations, /pms_cancellation_policies/);
    assert.doesNotMatch(frontOffice, /pms_cancellation_policies/);
    assert.match(frontOffice, /cancellationPolicySnapshot/);
    assert.doesNotMatch(cashiering, /pms_cancellation_policies/);
    assert.doesNotMatch(cashiering, /cancellation_policy_id/);
  });
});
