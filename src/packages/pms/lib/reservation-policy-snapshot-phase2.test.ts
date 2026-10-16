import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertLinkedStayPolicyResolved,
  buildNoShowPolicySnapshot,
  computeDepositRequirementAmount,
  ratePlanStayPolicyWrite,
  type DepositComputeQuote,
} from "./create-reservation-step4.ts";
import type { DepositPolicyCard3Row } from "./payments-card3.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const quote: DepositComputeQuote = {
  subtotal: 400,
  nightly: [{ rate: 120 }, { rate: 280 }],
  currency: "USD",
};

function depositPolicy(overrides: Partial<DepositPolicyCard3Row> = {}): DepositPolicyCard3Row {
  return {
    id: "dep-1",
    code: "STD",
    name: "Standard deposit",
    description: "Half the stay",
    required: true,
    depositType: "percent",
    depositTypeLabel: "Percent",
    depositValue: 25,
    isDefault: false,
    active: true,
    ...overrides,
  };
}

function noShowMaster() {
  return {
    id: "ns-1",
    code: "NS1",
    name: "First night",
    description: "Charge the first night after 18:00",
    penaltyType: "first_night",
    penaltyValue: 0,
    releaseHour: 18,
    active: true,
  };
}

describe("reservation deposit and no-show snapshots", () => {
  const migration = read(
    "../../../../drizzle/migrations/0147_hotel_reservation_no_show_policy_snapshot.sql",
  );
  const supabaseMigration = read(
    "../../../../supabase/migrations/0147_hotel_reservation_no_show_policy_snapshot.sql",
  );
  const reservations = read("./reservations.functions.ts");
  const createPage = read("../components/bookings/create-reservation-page.tsx");
  const policies = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const overview = read("../components/workspaces/reservation-detail-overview.tsx");
  const guarantee = read("../components/bookings/create-reservation-guarantee.tsx");
  const rates = read("./rates.functions.ts");
  const fo = read("./fo-cancel-noshow.functions.ts");
  const frontOffice = read("./frontoffice.functions.ts");
  const types = read("../../../integrations/supabase/types.ts");

  const depositUi = policies.slice(
    policies.indexOf('data-testid="deposit-policy"'),
    policies.indexOf('data-testid="stay-policies"'),
  );
  const noShowUi = policies.slice(
    policies.indexOf('testId="stay-policy-no-show"'),
    policies.indexOf('testId="stay-policy-early-departure"'),
  );
  const earlyUi = policies.slice(
    policies.indexOf('testId="stay-policy-early-departure"'),
    policies.indexOf('testId="stay-policy-refundability"'),
  );
  const createCall = createPage.slice(
    createPage.indexOf("submitReservation({"),
    createPage.indexOf("onSuccess:"),
  );
  const pricedArgs = reservations.slice(
    reservations.indexOf("const pricedArgs = {"),
    reservations.indexOf("const hasCommercialSelection"),
  );
  const policyUpdate = reservations.slice(
    reservations.indexOf("deposit_policy_id: write.deposit_policy_id"),
    reservations.indexOf("deposit_policy_id: write.deposit_policy_id") + 450,
  );
  const quoteStay = rates.slice(
    rates.indexOf("export const quoteStay"),
    rates.indexOf("export type FlexibleStayWindow"),
  );

  it("adds no_show_policy_id", () => {
    assert.equal(migration, supabaseMigration);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS no_show_policy_id uuid/);
    assert.match(types, /no_show_policy_id: string \| null/);
  });

  it("adds no_show_policy_snapshot", () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS no_show_policy_snapshot jsonb/);
    assert.match(types, /no_show_policy_snapshot: Json \| null/);
  });

  it("uses a same-property foreign key for no_show_policy_id", () => {
    assert.match(migration, /hotel_reservations_no_show_same_property/);
    assert.match(
      migration,
      /FOREIGN KEY \(no_show_policy_id, restaurant_id\)\s+REFERENCES public\.pms_no_show_policies\(id, restaurant_id\)/,
    );
    assert.match(migration, /ON DELETE SET NULL/);
    assert.match(types, /hotel_reservations_no_show_same_property/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.doesNotMatch(migration, /CASCADE/);
  });

  it("takes the deposit policy from the selected rate plan", () => {
    assert.match(
      reservations,
      /from\("hotel_rate_plans"\)\s*\.select\("deposit_policy_id, no_show_policy_id"\)/,
    );
    assert.match(reservations, /plan\.data\.deposit_policy_id/);
    assert.match(reservations, /from\("pms_deposit_policies"\)/);
    assert.doesNotMatch(reservations, /row\.active && row\.isDefault/);
    const written = ratePlanStayPolicyWrite({
      deposit: depositPolicy(),
      noShow: null,
      quote,
      currency: "USD",
      intendedTenderCode: "CASH",
    });
    assert.equal(written.deposit_policy_id, "dep-1");
    assert.equal(written.deposit_requirement_snapshot?.id, "dep-1");
    assert.equal(written.deposit_requirement_snapshot?.name, "Standard deposit");
  });

  it("takes the no-show policy from the selected rate plan", () => {
    assert.match(reservations, /plan\.data\.no_show_policy_id/);
    assert.match(reservations, /from\("pms_no_show_policies"\)/);
    const written = ratePlanStayPolicyWrite({
      deposit: null,
      noShow: noShowMaster(),
      quote,
      currency: "USD",
      intendedTenderCode: null,
    });
    assert.equal(written.no_show_policy_id, "ns-1");
    assert.equal(written.no_show_policy_snapshot?.name, "First night");
  });

  it("does not let the client override the deposit policy", () => {
    assert.doesNotMatch(createCall, /depositPolicyId/);
    assert.doesNotMatch(reservations, /data\.depositPolicyId/);
    assert.doesNotMatch(depositUi, /aria-label="Deposit Policy"/);
    assert.doesNotMatch(pricedArgs, /deposit_policy/);
  });

  it("does not let the client override the no-show policy", () => {
    assert.doesNotMatch(createCall, /noShowPolicy/);
    assert.doesNotMatch(reservations, /data\.noShowPolicyId/);
    assert.doesNotMatch(noShowUi, /<select/);
    assert.doesNotMatch(pricedArgs, /no_show_policy/);
  });

  it("writes the deposit snapshot from the rate-plan policy", () => {
    const policy = depositPolicy();
    const written = ratePlanStayPolicyWrite({
      deposit: policy,
      noShow: null,
      quote,
      currency: "USD",
      intendedTenderCode: "CARD",
    });
    assert.equal(written.deposit_requirement_snapshot?.deposit_type, "percent");
    assert.equal(written.deposit_requirement_snapshot?.deposit_value, 25);
    assert.equal(written.deposit_requirement_snapshot?.computed_amount, 100);
    assert.equal(written.deposit_requirement_snapshot?.intended_tender_code, "CARD");
    assert.equal(written.deposit_requirement_snapshot?.required, true);
    policy.name = "Renamed later";
    assert.equal(written.deposit_requirement_snapshot?.name, "Standard deposit");
    assert.match(policyUpdate, /deposit_requirement_snapshot: write\.deposit_requirement_snapshot/);
  });

  it("writes the no-show snapshot from the rate-plan policy", () => {
    const master = noShowMaster();
    const snapshot = buildNoShowPolicySnapshot(master);
    assert.deepEqual(snapshot, {
      id: "ns-1",
      code: "NS1",
      name: "First night",
      description: "Charge the first night after 18:00",
      penalty_type: "first_night",
      penalty_value: 0,
      release_hour: 18,
      active: true,
    });
    master.name = "Renamed later";
    master.penaltyValue = 40;
    assert.equal(snapshot.name, "First night");
    assert.equal(snapshot.penalty_value, 0);
    assert.match(policyUpdate, /no_show_policy_snapshot: write\.no_show_policy_snapshot/);
    assert.match(reservations, /noShowPolicySnapshot: row\.no_show_policy_snapshot/);
  });

  it("persists null deposit policy and snapshot when the rate plan has none", () => {
    const written = ratePlanStayPolicyWrite({
      deposit: null,
      noShow: noShowMaster(),
      quote,
      currency: "USD",
      intendedTenderCode: null,
    });
    assert.equal(written.deposit_policy_id, null);
    assert.equal(written.deposit_requirement_snapshot, null);
    assert.match(depositUi, /No deposit policy configured/);
    assert.doesNotMatch(reservations, /That deposit policy is not active/);
  });

  it("persists null no-show policy and snapshot when the rate plan has none", () => {
    const written = ratePlanStayPolicyWrite({
      deposit: depositPolicy(),
      noShow: null,
      quote,
      currency: "USD",
      intendedTenderCode: null,
    });
    assert.equal(written.no_show_policy_id, null);
    assert.equal(written.no_show_policy_snapshot, null);
    assert.match(noShowUi, /No no-show policy configured/);
    assert.match(reservations, /deposit: null, noShow: null, earlyDeparture: null/);
  });

  it("fails when a linked policy is missing or belongs to another property", () => {
    assert.throws(
      () => assertLinkedStayPolicyResolved("deposit", "dep-other", false),
      /rate plan deposit policy is missing or belongs to another property/,
    );
    assert.throws(
      () => assertLinkedStayPolicyResolved("no-show", "ns-other", false),
      /rate plan no-show policy is missing or belongs to another property/,
    );
    assert.doesNotThrow(() => assertLinkedStayPolicyResolved("deposit", null, false));
    assert.doesNotThrow(() => assertLinkedStayPolicyResolved("no-show", "ns-1", true));
    assert.match(reservations, /assertLinkedStayPolicyResolved\("deposit"/);
    assert.match(reservations, /assertLinkedStayPolicyResolved\("no-show"/);
    assert.match(reservations, /\.eq\("restaurant_id", restaurantId\)/);
  });

  it("removes the independent Step 3 deposit policy selector", () => {
    assert.match(depositUi, /data-testid="deposit-policy"/);
    assert.match(depositUi, /data-testid="rate-plan-deposit-policy"/);
    assert.doesNotMatch(policies, /depositPolicyId/);
    assert.doesNotMatch(depositUi, /aria-label="Deposit Policy"/);
  });

  it("stops using hardcoded no-show options as reservation authority", () => {
    assert.doesNotMatch(noShowUi, /LOCAL_STAY_POLICY_OPTIONS/);
    assert.doesNotMatch(noShowUi, /charge_full_stay|charge_first_night|no_charge/);
    assert.match(noShowUi, /data-testid="rate-plan-no-show-policy"/);
    assert.match(earlyUi, /data-testid="rate-plan-early-departure-policy"/);
  });

  it("keeps payment information editable", () => {
    assert.match(guarantee, /aria-label="Payment Method"/);
    assert.match(guarantee, /data-testid="deposit-payment-method"/);
    assert.match(guarantee, /aria-label="Payment Reference"/);
    assert.doesNotMatch(guarantee, /disabled=\{!depositFieldsOpen\}/);
    assert.match(createCall, /depositTenderCode/);
  });

  it("leaves room price unchanged", () => {
    const priced = { ...quote, nightly: [...quote.nightly] };
    assert.equal(
      computeDepositRequirementAmount({ depositType: "percent", depositValue: 25 }, priced),
      100,
    );
    assert.equal(priced.subtotal, 400);
    assert.doesNotMatch(policyUpdate, /room_subtotal/);
    assert.match(pricedArgs, /_quote_currency/);
    assert.match(reservations, /rpc\("create_hotel_reservation_priced"/);
  });

  it("leaves cancellation behavior unchanged", () => {
    const sql = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sql, /cancellation_policy/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.doesNotMatch(policyUpdate, /cancellation_policy/);
    assert.match(rates, /cancellation_policy_id: data\.cancellationPolicyId \?\? null/);
  });

  it("leaves refundability unchanged", () => {
    const sql = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(sql, /refundability/);
    assert.match(reservations, /refundability_snapshot/);
    assert.doesNotMatch(policyUpdate, /refundability/);
    assert.match(rates, /refundability_id: data\.refundabilityId \?\? null/);
  });

  it("leaves quoteStay pricing unchanged", () => {
    assert.match(quoteStay, /rpc\("price_hotel_stay"/);
    assert.match(quoteStay, /_quote_currency: data\.quoteCurrency/);
    assert.doesNotMatch(quoteStay, /no_show_policy_snapshot/);
    assert.doesNotMatch(quoteStay, /deposit_requirement_snapshot/);
    assert.match(quoteStay, /depositPolicyId: plan\.depositPolicyId/);
    assert.match(quoteStay, /noShowPolicyId: plan\.noShowPolicyId/);
  });

  it("leaves Front Office no-show execution unchanged", () => {
    assert.match(fo, /fo_noshow_fee_required, fo_noshow_fee_default/);
    assert.doesNotMatch(fo, /no_show_policy_snapshot/);
    assert.match(frontOffice, /rpc\("mark_hotel_reservation_no_show"/);
    assert.doesNotMatch(frontOffice, /no_show_policy_snapshot/);
  });

  it("shows reservation detail from the stored snapshots", () => {
    assert.match(overview, /overviewNoShowLabel\(reservation\.noShowPolicySnapshot\)/);
    assert.match(
      overview,
      /parseDepositRequirementSnapshot\(reservation\.depositRequirementSnapshot\)/,
    );
    assert.doesNotMatch(overview, /snapshotField\(reservation\.refundabilitySnapshot, \["no_show"/);
    assert.match(reservations, /no_show_policy_id, no_show_policy_snapshot/);
  });

  it("does not start Early Departure or Additional Policy", () => {
    assert.doesNotMatch(migration, /early_departure|additional_policy/);
    assert.match(policies, /ackInformed/);
  });
});
