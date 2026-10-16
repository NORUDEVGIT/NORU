import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertLinkedStayPolicyResolved,
  ratePlanStayPolicyWrite,
} from "./create-reservation-step4.ts";
import {
  buildEarlyDeparturePolicySnapshot,
  earlyDepartureReservationLabel,
  earlyDepartureReviewLabel,
} from "./early-departure-policy.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function master() {
  return {
    id: "ed-1",
    code: "FLEX",
    name: "Flexible departure",
    description: "Charge the first night",
    penaltyType: "first_night",
    penaltyValue: 0,
  };
}

describe("early departure reservation snapshot", () => {
  const migration = read(
    "../../../../drizzle/migrations/0149_hotel_reservation_early_departure_policy_snapshot.sql",
  );
  const supabaseMigration = read(
    "../../../../supabase/migrations/0149_hotel_reservation_early_departure_policy_snapshot.sql",
  );
  const sql = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const reservations = read("./reservations.functions.ts");
  const createPage = read("../components/bookings/create-reservation-page.tsx");
  const policies = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const review = read("../components/bookings/create-reservation-review.tsx");
  const overview = read("../components/workspaces/reservation-detail-overview.tsx");
  const rates = read("./rates.functions.ts");
  const frontOffice = read("./frontoffice.functions.ts");
  const checkOut = read("./fo-check-out.functions.ts");
  const cashiering = read("./cashiering.functions.ts");
  const types = read("../../../integrations/supabase/types.ts");
  const earlyUi = policies.slice(
    policies.indexOf('testId="stay-policy-early-departure"'),
    policies.indexOf('testId="stay-policy-refundability"'),
  );
  const createCall = createPage.slice(
    createPage.indexOf("submitReservation({"),
    createPage.indexOf("onSuccess:"),
  );
  const quoteStay = rates.slice(
    rates.indexOf("export const quoteStay"),
    rates.indexOf("export type FlexibleStayWindow"),
  );
  const pricedArgs = reservations.slice(
    reservations.indexOf("const pricedArgs = {"),
    reservations.indexOf("const hasCommercialSelection"),
  );

  it("adds early_departure_policy_id", () => {
    assert.equal(migration, supabaseMigration);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS early_departure_policy_id uuid/);
    assert.match(types, /early_departure_policy_id: string \| null/);
    assert.doesNotMatch(sql, /additional_policy/);
  });

  it("adds early_departure_policy_snapshot", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS early_departure_policy_snapshot jsonb/);
    assert.match(types, /early_departure_policy_snapshot: Json \| null/);
  });

  it("adds a same-property foreign key", () => {
    assert.match(sql, /hotel_reservations_early_departure_same_property/);
    assert.match(
      sql,
      /FOREIGN KEY \(early_departure_policy_id, restaurant_id\)\s+REFERENCES public\.pms_early_departure_policies\(id, restaurant_id\)/,
    );
    assert.match(sql, /ON DELETE SET NULL/);
    assert.match(sql, /hotel_reservations_early_departure_policy_idx/);
    assert.match(types, /hotel_reservations_early_departure_same_property/);
    assert.doesNotMatch(sql, /CASCADE/);
  });

  it("resolves a valid rate-plan policy", () => {
    assert.match(reservations, /\.select\("early_departure_policy_id"\)/);
    assert.match(reservations, /from\("pms_early_departure_policies"\)/);
    assert.match(reservations, /plan\.data\.deposit_policy_id/);
    assert.match(reservations, /assertLinkedStayPolicyResolved\("early-departure"/);
    const written = ratePlanStayPolicyWrite({
      deposit: null,
      noShow: null,
      earlyDeparture: master(),
      quote: null,
      currency: "USD",
      intendedTenderCode: null,
    });
    assert.equal(written.early_departure_policy_id, "ed-1");
    assert.equal(written.early_departure_policy_snapshot?.name, "Flexible departure");
  });

  it("fails a wrong-property linked policy before create", () => {
    assert.throws(
      () => assertLinkedStayPolicyResolved("early-departure", "ed-other", false),
      /rate plan early departure policy is missing or belongs to another property/,
    );
    const load = reservations.indexOf("async function loadRatePlanStayPolicies");
    const rpc = reservations.indexOf('rpc("create_hotel_reservation_priced"');
    assert.ok(load > 0 && load < rpc);
  });

  it("fails a missing linked policy row before create", () => {
    assert.throws(
      () => assertLinkedStayPolicyResolved("early-departure", "ed-missing", false),
      /rate plan early departure policy is missing or belongs to another property/,
    );
    assert.doesNotThrow(() => assertLinkedStayPolicyResolved("early-departure", null, false));
    assert.match(reservations, /assertLinkedStayPolicyResolved\("early-departure", earlyId/);
    assert.match(reservations, /buildEarlyDeparturePolicySnapshot\(earlyDeparture\)/);
  });

  it("allows create when no policy is linked", () => {
    const written = ratePlanStayPolicyWrite({
      deposit: null,
      noShow: null,
      earlyDeparture: null,
      quote: null,
      currency: "USD",
      intendedTenderCode: null,
    });
    assert.equal(written.early_departure_policy_id, null);
    assert.equal(written.early_departure_policy_snapshot, null);
    assert.match(policies, /No early departure policy configured/);
    assert.match(reservations, /deposit: null, noShow: null, earlyDeparture: null/);
  });

  it("writes real master fields into the snapshot", () => {
    const snapshot = buildEarlyDeparturePolicySnapshot({
      ...master(),
      penaltyType: "percent_stay",
      penaltyValue: 25,
      description: "  Quarter of the stay  ",
    });
    assert.deepEqual(snapshot, {
      id: "ed-1",
      code: "FLEX",
      name: "Flexible departure",
      description: "Quarter of the stay",
      penalty_type: "percent_stay",
      penalty_value: 25,
    });
    assert.match(
      reservations,
      /early_departure_policy_snapshot: write\.early_departure_policy_snapshot/,
    );
  });

  it("keeps a stored snapshot after the master changes", () => {
    const row = master();
    const snapshot = buildEarlyDeparturePolicySnapshot(row);
    row.name = "Renamed later";
    row.penaltyValue = 80;
    row.description = "Changed";
    assert.equal(snapshot.name, "Flexible departure");
    assert.equal(snapshot.penalty_value, 0);
    assert.equal(snapshot.description, "Charge the first night");
  });

  it("does not let the client override the policy", () => {
    assert.doesNotMatch(createCall, /earlyDeparture/);
    assert.doesNotMatch(reservations, /data\.earlyDeparturePolicyId/);
    assert.doesNotMatch(pricedArgs, /early_departure_policy/);
    assert.doesNotMatch(earlyUi, /<select/);
  });

  it("removes the Step 3 local selector", () => {
    assert.doesNotMatch(policies, /LOCAL_STAY_POLICY_OPTIONS/);
    assert.doesNotMatch(policies, /stayPolicyLabel/);
    assert.doesNotMatch(earlyUi, /aria-label="Early Departure Policy"/);
    assert.match(earlyUi, /data-testid="rate-plan-early-departure-policy"/);
    assert.match(earlyUi, /No early departure policy configured/);
  });

  it("stops using the old local option tokens as authority", () => {
    assert.doesNotMatch(policies, /charge_full_stay|charge_first_night|no_charge|custom policy/i);
    assert.doesNotMatch(createPage, /step4Policies\.earlyDeparturePolicy/);
  });

  it("shows the rate plan policy on review", () => {
    assert.equal(
      earlyDepartureReviewLabel({
        name: "Flexible departure",
        penaltyType: "first_night",
        penaltyValue: 0,
        description: "Charge the first night",
      }),
      "Flexible departure · First night · Charge the first night",
    );
    assert.equal(earlyDepartureReviewLabel({ name: "" }), "Not configured");
    assert.match(createPage, /earlyDepartureReviewLabel/);
    assert.match(review, /\["Early Departure Policy", reviewDash\(props\.earlyDeparturePolicy\)\]/);
    assert.doesNotMatch(createPage, /stayPolicyLabel/);
  });

  it("shows reservation detail from the dedicated snapshot", () => {
    assert.match(overview, /earlyDepartureReservationLabel/);
    assert.match(overview, /reservation\.earlyDeparturePolicySnapshot/);
    assert.match(
      reservations,
      /earlyDeparturePolicySnapshot: row\.early_departure_policy_snapshot/,
    );
    assert.match(reservations, /early_departure_policy_id, early_departure_policy_snapshot/);
  });

  it("uses refundability scraping only as a legacy fallback", () => {
    assert.doesNotMatch(overview, /"early_departure"/);
    assert.equal(
      earlyDepartureReservationLabel({
        snapshot: {
          name: "Flexible departure",
          penalty_type: "full_stay",
          penalty_value: 0,
          description: null,
        },
        legacyRefundabilitySnapshot: { early_departure: "Old refundability text" },
      }),
      "Flexible departure · Full stay",
    );
    assert.equal(
      earlyDepartureReservationLabel({
        snapshot: null,
        legacyRefundabilitySnapshot: { early_departure_policy: "Legacy early departure" },
      }),
      "Legacy early departure",
    );
  });

  it("leaves deposit behavior unchanged", () => {
    assert.match(
      reservations,
      /from\("hotel_rate_plans"\)\s*\.select\("deposit_policy_id, no_show_policy_id"\)/,
    );
    assert.match(policies, /data-testid="rate-plan-deposit-policy"/);
    assert.doesNotMatch(createCall, /depositPolicyId/);
    assert.match(reservations, /deposit_requirement_snapshot: write\.deposit_requirement_snapshot/);
    assert.doesNotMatch(sql, /deposit_policy/);
  });

  it("leaves no-show behavior unchanged", () => {
    assert.match(policies, /data-testid="rate-plan-no-show-policy"/);
    assert.match(reservations, /no_show_policy_snapshot: write\.no_show_policy_snapshot/);
    assert.doesNotMatch(sql, /no_show_policy/);
    assert.match(overview, /overviewNoShowLabel\(reservation\.noShowPolicySnapshot\)/);
  });

  it("leaves cancellation unchanged", () => {
    assert.doesNotMatch(sql, /cancellation_policy/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.match(rates, /cancellation_policy_id: data\.cancellationPolicyId \?\? null/);
  });

  it("leaves refundability unchanged", () => {
    assert.doesNotMatch(sql, /refundability_id/);
    assert.match(reservations, /refundability_snapshot/);
    assert.match(rates, /refundability_id: data\.refundabilityId \?\? null/);
  });

  it("leaves room pricing unchanged", () => {
    assert.match(pricedArgs, /_quote_currency/);
    assert.match(reservations, /rpc\("create_hotel_reservation_priced"/);
    assert.doesNotMatch(pricedArgs, /early_departure/);
    assert.doesNotMatch(sql, /room_subtotal/);
  });

  it("leaves quoteStay unchanged", () => {
    assert.match(quoteStay, /rpc\("price_hotel_stay"/);
    assert.match(quoteStay, /_quote_currency: data\.quoteCurrency/);
    assert.match(quoteStay, /earlyDeparturePolicyId: plan\.earlyDeparturePolicyId/);
    assert.doesNotMatch(quoteStay, /early_departure_policy_snapshot/);
    assert.doesNotMatch(quoteStay, /penalty_value/);
  });

  it("leaves Front Office unchanged", () => {
    assert.match(checkOut, /rpc\("check_out_hotel_reservation"/);
    assert.match(frontOffice, /rpc\("check_out_hotel_reservation"/);
    assert.doesNotMatch(checkOut, /early_departure_policy/);
    assert.doesNotMatch(frontOffice, /early_departure_policy/);
  });

  it("leaves Cashiering unchanged", () => {
    assert.doesNotMatch(cashiering, /early_departure_policy/);
    assert.match(cashiering, /unsettled_checkout/);
  });

  it("does not start Additional Policy", () => {
    assert.doesNotMatch(sql, /additional_policy/);
    assert.doesNotMatch(reservations, /pms_additional_policies/);
    assert.doesNotMatch(policies, /I have informed the guest/);
    assert.match(policies, /ackInformed/);
  });
});
