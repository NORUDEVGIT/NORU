import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  agreementCancellationColumnsForSave,
  CANONICAL_CANCELLATION_PROPERTY_ERROR,
  resolveAgreementCancellation,
  type CanonicalAgreementCancellationRow,
} from "./corporate-contracts.server.ts";

const canonical: CanonicalAgreementCancellationRow = {
  id: "rate-policy",
  code: "FLEX_24",
  name: "Flexible 24h",
  description: "Free until 24 hours",
  penaltyType: "percent",
  penaltyValue: 50,
  policyKind: "flexible",
  windowValue: 1,
  windowUnit: "days_before_arrival",
  cutoffTime: "18:00",
  deadlineHours: 24,
};

const restaurantId = "property-1";

describe("corporate agreement cancellation phase 1", () => {
  it("does not resolve a cancellation when the canonical id is absent", () => {
    const view = resolveAgreementCancellation({
      rateCancellationPolicyId: null,
      canonical: null,
    });
    assert.equal(view, null);
  });

  it("reads the canonical policy", () => {
    const view = resolveAgreementCancellation({
      rateCancellationPolicyId: canonical.id,
      canonical,
    });
    assert.equal(view?.source, "canonical");
    assert.equal(view?.id, canonical.id);
    assert.equal(view?.penaltyType, "percent");
    assert.equal(view?.windowValue, 1);
    assert.equal(view?.windowUnit, "days_before_arrival");
    assert.equal(view?.cutoffTime, "18:00");
    assert.equal(view?.deadlineHours, 24);
  });

  it("ignores a canonical row that does not match the selected id", () => {
    const view = resolveAgreementCancellation({
      rateCancellationPolicyId: null,
      canonical,
    });
    assert.equal(view, null);
  });

  it("persists a selection on the canonical FK only", () => {
    const columns = agreementCancellationColumnsForSave({
      selectedPolicyId: canonical.id,
      canonical: { id: canonical.id, restaurantId },
      restaurantId,
    });
    assert.deepEqual(columns, {
      rate_cancellation_policy_id: canonical.id,
    });
  });

  it("rejects an id that is not a same-property canonical policy", () => {
    assert.throws(
      () =>
        agreementCancellationColumnsForSave({
          selectedPolicyId: "legacy-policy",
          canonical: null,
          restaurantId,
        }),
      new RegExp(CANONICAL_CANCELLATION_PROPERTY_ERROR),
    );
  });

  it("rejects a canonical policy from another property", () => {
    assert.throws(
      () =>
        agreementCancellationColumnsForSave({
          selectedPolicyId: canonical.id,
          canonical: { id: canonical.id, restaurantId: "other-property" },
          restaurantId,
        }),
      new RegExp(CANONICAL_CANCELLATION_PROPERTY_ERROR),
    );
  });

  it("adds the transitional column without copying rows or dropping the legacy catalogue", () => {
    const drizzle = readFileSync(
      new URL(
        "../../../../drizzle/migrations/0142_pms_corporate_agreement_rate_cancellation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const supabase = readFileSync(
      new URL(
        "../../../../supabase/migrations/0142_pms_corporate_agreement_rate_cancellation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /ADD COLUMN IF NOT EXISTS rate_cancellation_policy_id uuid/);
    assert.match(drizzle, /pms_corporate_agreements_rate_cancellation_same_property/);
    assert.match(
      drizzle,
      /FOREIGN KEY \(rate_cancellation_policy_id, restaurant_id\)\s+REFERENCES public\.pms_rate_cancellation_policies\(id, restaurant_id\)/,
    );
    assert.match(drizzle, /ON DELETE SET NULL/);
    assert.doesNotMatch(drizzle, /UPDATE public\.pms_corporate_agreements/);
    assert.doesNotMatch(drizzle, /INSERT INTO/);
    assert.doesNotMatch(drizzle, /DROP TABLE/);
    assert.doesNotMatch(drizzle, /DROP COLUMN IF EXISTS cancellation_policy_id/);
  });

  it("loads the agreement picker from the rate catalogue only", () => {
    const source = readFileSync(
      new URL("./corporate-contracts.functions.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("export const getCompanyContractCreateConfig");
    assert.ok(start >= 0);
    const body = source.slice(start);
    assert.match(body, /from\("pms_rate_cancellation_policies"\)/);
    assert.doesNotMatch(body, /from\("pms_cancellation_policies"\)/);
    assert.match(body, /isDefault: false/);
  });

  it("writes the canonical FK from persistCompanyContract and does not insert legacy policy rows", () => {
    const source = readFileSync(
      new URL("./guest-company-create.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /agreementCancellationColumnsForSave/);
    assert.match(source, /from\("pms_rate_cancellation_policies"\)/);
    assert.doesNotMatch(source, /from\("pms_cancellation_policies"\)/);
    assert.match(source, /\.\.\.cancellationColumns/);
  });

  it("does not change rate plan or reservation-create cancellation sources", () => {
    const rates = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
    const reservations = readFileSync(
      new URL("./reservations.functions.ts", import.meta.url),
      "utf8",
    );
    const payments = readFileSync(
      new URL("../components/settings/pms-property-setup-card3-payments.tsx", import.meta.url),
      "utf8",
    );
    assert.match(rates, /from\("pms_rate_cancellation_policies"\)/);
    assert.match(rates, /cancellation_policy_id/);
    assert.doesNotMatch(rates, /rate_cancellation_policy_id/);
    assert.doesNotMatch(reservations, /rate_cancellation_policy_id/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.doesNotMatch(payments, /rate_cancellation_policy_id/);
  });
});
