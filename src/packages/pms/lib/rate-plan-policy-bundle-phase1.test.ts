import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { foreignRatePlanPolicyMessage } from "./rate-plan-policy-link.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("rate plan deposit and no-show policy bundle", () => {
  const migration = read("../../../../drizzle/migrations/0146_hotel_rate_plan_deposit_no_show.sql");
  const supabaseMigration = read(
    "../../../../supabase/migrations/0146_hotel_rate_plan_deposit_no_show.sql",
  );
  const card2 = read("./rates-card2.functions.ts");
  const rates = read("./rates.functions.ts");
  const ui = read("../components/settings/pms-property-setup-card2-rates.tsx");
  const reservations = read("./reservations.functions.ts");
  const createPage = read("../components/bookings/create-reservation-page.tsx");
  const policiesUi = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const card3 = read("./rates-card3.functions.ts");

  it("adds deposit_policy_id and no_show_policy_id as same-property foreign keys", () => {
    assert.equal(migration, supabaseMigration);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS deposit_policy_id uuid/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS no_show_policy_id uuid/);
    assert.match(
      migration,
      /FOREIGN KEY \(deposit_policy_id, restaurant_id\)\s+REFERENCES public\.pms_deposit_policies\(id, restaurant_id\)/,
    );
    assert.match(
      migration,
      /FOREIGN KEY \(no_show_policy_id, restaurant_id\)\s+REFERENCES public\.pms_no_show_policies\(id, restaurant_id\)/,
    );
    assert.match(migration, /ON DELETE SET NULL/);
    assert.match(migration, /pms_no_show_policies_id_restaurant_unique/);
    assert.match(migration, /UNIQUE \(id, restaurant_id\)/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.doesNotMatch(migration, /CASCADE/);
    assert.doesNotMatch(migration, /early_departure|additional_policy/i);
    assert.doesNotMatch(migration, /DROP COLUMN IF EXISTS cancellation_policy_id/);
  });

  it("persists both links from saveRatePlanCard2 and allows null", () => {
    assert.match(card2, /deposit_policy_id: data\.depositPolicyId \|\| null/);
    assert.match(card2, /no_show_policy_id: data\.noShowPolicyId \|\| null/);
    assert.match(card2, /from\("pms_deposit_policies"\)/);
    assert.match(card2, /depositPolicyId: row\.deposit_policy_id/);
    assert.match(card2, /noShowPolicyName: noShow\?\.name/);
    assert.equal(foreignRatePlanPolicyMessage("deposit", null, false), null);
    assert.equal(foreignRatePlanPolicyMessage("no-show", undefined, false), null);
  });

  it("rejects a deposit or no-show policy from another property", () => {
    assert.match(
      foreignRatePlanPolicyMessage("deposit", "other-property", false) ?? "",
      /deposit policy doesn't belong to this property/,
    );
    assert.match(
      foreignRatePlanPolicyMessage("no-show", "other-property", false) ?? "",
      /no-show policy doesn't belong to this property/,
    );
    assert.equal(foreignRatePlanPolicyMessage("deposit", "same-property", true), null);
    assert.equal(foreignRatePlanPolicyMessage("no-show", "same-property", true), null);
    assert.match(card2, /foreignRatePlanPolicyMessage\(\s*"deposit"/);
    assert.match(card2, /foreignRatePlanPolicyMessage\(\s*"no-show"/);
  });

  it("loads deposit and no-show options in PlanDrawer without a new master", () => {
    assert.match(ui, />Deposit policy</);
    assert.match(ui, />No-show policy</);
    assert.match(ui, />Cancellation policy</);
    assert.match(ui, />Refundability</);
    assert.match(ui, /depositPolicies\.map/);
    assert.match(ui, /noShowPolicies\.map/);
    assert.match(ui, /No deposit policies configured/);
    assert.match(ui, /No no-show policies configured/);
    assert.match(card2, /from\("pms_deposit_policies"\)/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.doesNotMatch(ui, /saveDepositPolicyCard2|Add deposit policy/);
  });

  it("exposes quote labels without changing room pricing", () => {
    const quoteStart = rates.indexOf("export const quoteStay");
    const quote = rates.slice(quoteStart, rates.indexOf("export type FlexibleStayWindow"));
    assert.match(quote, /depositPolicyId: plan\.depositPolicyId/);
    assert.match(quote, /depositPolicyName: plan\.depositPolicyName/);
    assert.match(quote, /noShowPolicyId: plan\.noShowPolicyId/);
    assert.match(quote, /noShowPolicyName: plan\.noShowPolicyName/);
    assert.match(quote, /rpc\("price_hotel_stay"/);
    assert.match(quote, /_quote_currency: data\.quoteCurrency/);
    assert.doesNotMatch(quote, /deposit_policy_id/);
    assert.match(rates, /cancellation_policy_id: data\.cancellationPolicyId \?\? null/);
    assert.match(rates, /refundability_id: data\.refundabilityId \?\? null/);
    assert.match(createPage, /quoteStay/);
    assert.doesNotMatch(createPage, /depositPolicyId: step4Policies\.depositPolicyId/);
    assert.match(policiesUi, /data-testid="rate-plan-early-departure-policy"/);
    assert.match(policiesUi, /data-testid="deposit-policy"/);
    assert.match(policiesUi, /data-testid="rate-plan-deposit-policy"/);
    assert.match(policiesUi, /data-testid="rate-plan-no-show-policy"/);
    assert.match(reservations, /deposit_requirement_snapshot/);
    assert.match(reservations, /no_show_policy_snapshot/);
    assert.doesNotMatch(card3, /deposit_policy_id/);
    assert.doesNotMatch(card3, /no_show_policy_id/);
  });
});
