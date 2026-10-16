import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolvedEarlyDeparturePenaltyValue } from "./early-departure-policy.ts";
import { foreignRatePlanPolicyMessage } from "./rate-plan-policy-link.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("early departure policy master and rate plan link", () => {
  const migration = read("../../../../drizzle/migrations/0148_pms_early_departure_policies.sql");
  const supabaseMigration = read(
    "../../../../supabase/migrations/0148_pms_early_departure_policies.sql",
  );
  const sql = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const card2 = read("./rates-card2.functions.ts");
  const rates = read("./rates.functions.ts");
  const ui = read("../components/settings/pms-property-setup-card2-rates.tsx");
  const policies = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const createPage = read("../components/bookings/create-reservation-page.tsx");
  const reservations = read("./reservations.functions.ts");
  const quoteStay = rates.slice(
    rates.indexOf("export const quoteStay"),
    rates.indexOf("export type FlexibleStayWindow"),
  );
  const createCall = createPage.slice(
    createPage.indexOf("submitReservation({"),
    createPage.indexOf("onSuccess:"),
  );
  const earlyUi = policies.slice(
    policies.indexOf('testId="stay-policy-early-departure"'),
    policies.indexOf('testId="stay-policy-refundability"'),
  );

  it("creates pms_early_departure_policies", () => {
    assert.equal(migration, supabaseMigration);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_early_departure_policies/);
    assert.doesNotMatch(sql, /hotel_reservations/);
    assert.doesNotMatch(sql, /additional_policy/);
  });

  it("enforces property and code uniqueness", () => {
    assert.match(sql, /pms_early_departure_policies_code_unique UNIQUE \(restaurant_id, code\)/);
    assert.match(sql, /code ~ '\^\[A-Z0-9_\]\{1,30\}\$'/);
  });

  it("adds composite id and property support", () => {
    assert.match(
      sql,
      /pms_early_departure_policies_id_restaurant_unique UNIQUE \(id, restaurant_id\)/,
    );
  });

  it("adds hotel_rate_plans.early_departure_policy_id", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS early_departure_policy_id uuid/);
    assert.match(rates, /early_departure_policy_id/);
  });

  it("adds a same-property foreign key", () => {
    assert.match(sql, /hotel_rate_plans_early_departure_same_property/);
    assert.match(
      sql,
      /FOREIGN KEY \(early_departure_policy_id, restaurant_id\)\s+REFERENCES public\.pms_early_departure_policies\(id, restaurant_id\)/,
    );
    assert.match(sql, /ON DELETE SET NULL/);
  });

  it("saves a valid rate-plan policy link", () => {
    assert.match(card2, /early_departure_policy_id: data\.earlyDeparturePolicyId \|\| null/);
    assert.match(rates, /early_departure_policy_id: data\.earlyDeparturePolicyId/);
  });

  it("rejects a policy from another property", () => {
    assert.equal(
      foreignRatePlanPolicyMessage("early-departure", "policy-1", false),
      "That early departure policy doesn't belong to this property.",
    );
    assert.equal(foreignRatePlanPolicyMessage("early-departure", "policy-1", true), null);
    assert.match(card2, /foreignRatePlanPolicyMessage\(\s*"early-departure"/);
  });

  it("clears the rate-plan link when the selection is null", () => {
    assert.equal(foreignRatePlanPolicyMessage("early-departure", null, false), null);
    assert.match(card2, /early_departure_policy_id: data\.earlyDeparturePolicyId \|\| null/);
    assert.match(ui, /earlyDeparturePolicyId: optionalId\(earlyDeparturePolicyId\)/);
  });

  it("creates a catalogue row for this property", () => {
    assert.match(card2, /export const saveRateEarlyDeparturePolicyCard2/);
    assert.match(card2, /\.from\("pms_early_departure_policies"\)\.insert\(payload\)/);
    assert.match(card2, /restaurant_id: data\.restaurantId/);
  });

  it("edits a catalogue row for this property", () => {
    assert.match(
      card2,
      /\.from\("pms_early_departure_policies"\)\s*\.update\(payload\)\s*\.eq\("id", data\.id\)\s*\.eq\("restaurant_id", data\.restaurantId\)/,
    );
    assert.match(ui, /Edit early departure policy/);
  });

  it("toggles active without a new reservation field", () => {
    assert.match(card2, /export const setRateEarlyDeparturePolicyActiveCard2/);
    assert.match(card2, /\.update\(\{ active: data\.active \}\)/);
    assert.match(ui, /id="ed-active"/);
    assert.match(ui, /earlyDepartureActiveMut\.mutate/);
  });

  it("rejects a duplicate code for the property", () => {
    assert.match(card2, /result\.error\?\.code === "23505"/);
    assert.match(card2, /That early departure policy code is already used for this property/);
  });

  it("validates penalty values for the no-show penalty set", () => {
    assert.deepEqual(resolvedEarlyDeparturePenaltyValue("none", 25), {
      ok: true,
      penaltyValue: 0,
    });
    assert.deepEqual(resolvedEarlyDeparturePenaltyValue("first_night", 10), {
      ok: true,
      penaltyValue: 0,
    });
    assert.deepEqual(resolvedEarlyDeparturePenaltyValue("full_stay", 10), {
      ok: true,
      penaltyValue: 0,
    });
    assert.equal(resolvedEarlyDeparturePenaltyValue("percent_stay", 0).ok, false);
    assert.equal(resolvedEarlyDeparturePenaltyValue("percent_stay", 101).ok, false);
    assert.deepEqual(resolvedEarlyDeparturePenaltyValue("percent_stay", 25), {
      ok: true,
      penaltyValue: 25,
    });
    assert.equal(resolvedEarlyDeparturePenaltyValue("fixed_amount", 0).ok, false);
    assert.deepEqual(resolvedEarlyDeparturePenaltyValue("fixed_amount", 40), {
      ok: true,
      penaltyValue: 40,
    });
    assert.match(
      sql,
      /penalty_type IN \('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay'\)/,
    );
  });

  it("loads early departure options in the rate plan drawer", () => {
    assert.match(ui, />Early departure policy</);
    assert.match(ui, /earlyDeparturePolicies\.map/);
    assert.match(ui, /No early departure policies configured/);
    assert.match(card2, /from\("pms_early_departure_policies"\)/);
  });

  it("leaves cancellation unchanged", () => {
    assert.match(card2, /cancellation_policy_id: data\.cancellationPolicyId \|\| null/);
    assert.match(rates, /cancellation_policy_id: data\.cancellationPolicyId \?\? null/);
    assert.doesNotMatch(sql, /cancellation_policy_id/);
  });

  it("leaves refundability unchanged", () => {
    assert.match(card2, /refundability_id: data\.refundabilityId \|\| null/);
    assert.match(rates, /refundability_id: data\.refundabilityId \?\? null/);
    assert.doesNotMatch(sql, /refundability_id/);
  });

  it("leaves deposit unchanged", () => {
    assert.match(card2, /deposit_policy_id: data\.depositPolicyId \|\| null/);
    assert.doesNotMatch(sql, /deposit_policy_id/);
  });

  it("leaves no-show unchanged", () => {
    assert.match(card2, /no_show_policy_id: data\.noShowPolicyId \|\| null/);
    assert.match(card2, /export const saveRateNoShowPolicyCard2/);
    assert.doesNotMatch(sql, /no_show_policy_id/);
  });

  it("leaves quoteStay pricing unchanged", () => {
    assert.match(quoteStay, /rpc\("price_hotel_stay"/);
    assert.match(quoteStay, /_quote_currency: data\.quoteCurrency/);
    assert.match(quoteStay, /earlyDeparturePolicyId: plan\.earlyDeparturePolicyId/);
    assert.doesNotMatch(quoteStay, /early_departure_policy_snapshot/);
  });

  it("leaves the 0148 migration off reservation persistence", () => {
    assert.doesNotMatch(createCall, /earlyDeparturePolicyId/);
    assert.doesNotMatch(sql, /hotel_reservations/);
  });

  it("shows the rate plan early departure policy on Step 3", () => {
    assert.match(earlyUi, /data-testid="rate-plan-early-departure-policy"/);
    assert.doesNotMatch(earlyUi, /LOCAL_STAY_POLICY_OPTIONS/);
    assert.doesNotMatch(earlyUi, /<select/);
    assert.match(createPage, /earlyDepartureReviewLabel/);
  });

  it("does not start Additional Policy", () => {
    assert.doesNotMatch(sql, /additional_policy/);
    assert.doesNotMatch(card2, /pms_additional_policies/);
    assert.doesNotMatch(policies, /I have informed the guest/);
    assert.match(policies, /ackInformed/);
  });
});
