import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PromotionActivation } from "./commercial-engine.ts";
import {
  PROMOTION_EMPTY_MASTER_ROOM_TYPES_ALLOW_ALL,
  PROMOTION_FULL_STAY_REQUIRED,
  PROMOTION_PERFORMANCE_REVENUE_FIELD,
  buildPromotionAttributionSnapshot,
  composePromotionQuote,
  computePromotionDiscount,
  evaluatePromotionEligibility,
  lastStayNight,
  listEligiblePromotionItems,
  stayFullyWithinWindow,
  summarizePromotionPerformance,
  type PromotionEligibilityInput,
  type PromotionMasterRecord,
} from "./commercial-promotion.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const RESTAURANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const ACTIVATION = "11111111-1111-4111-8111-111111111111";
const PROMOTION = "22222222-2222-4222-8222-222222222222";
const ROOM_TYPE = "33333333-3333-4333-8333-333333333333";
const RATE_PLAN = "66666666-6666-4666-8666-666666666666";

function activation(overrides: Partial<PromotionActivation> = {}): PromotionActivation {
  return {
    id: ACTIVATION,
    restaurantId: RESTAURANT,
    promotionId: PROMOTION,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    bookingFrom: "2026-09-01",
    bookingTo: "2026-09-30",
    active: true,
    priority: 10,
    reason: "Spring launch",
    createdByMembershipId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    promotionCode: "SPRING10",
    promotionName: "Spring 10",
    promoKind: "percent",
    promoValue: 10,
    masterValidFrom: "2026-10-01",
    masterValidTo: "2026-10-31",
    masterRoomTypeIds: [],
    scope: { roomTypeIds: [], ratePlanIds: [] },
    ...overrides,
    scope: overrides.scope ?? { roomTypeIds: [], ratePlanIds: [] },
  };
}

function master(overrides: Partial<PromotionMasterRecord> = {}): PromotionMasterRecord {
  return { id: PROMOTION, restaurantId: RESTAURANT, active: true, ...overrides };
}

function input(overrides: Partial<PromotionEligibilityInput> = {}): PromotionEligibilityInput {
  return {
    restaurantId: RESTAURANT,
    promotionActivationId: ACTIVATION,
    bookingBusinessDate: "2026-09-15",
    arrivalDate: "2026-10-10",
    departureDate: "2026-10-12",
    roomTypeId: ROOM_TYPE,
    ratePlanId: RATE_PLAN,
    baseRoomSubtotal: 200,
    ...overrides,
  };
}

function evaluate(act: PromotionActivation, extra: Partial<PromotionEligibilityInput> = {}, masterRow = master()) {
  return evaluatePromotionEligibility(input(extra), { activation: act, master: masterRow });
}

describe("P5A-02 — eligibility", () => {
  it("accepts an active executable promotion inside both windows", () => {
    const result = evaluate(activation());
    assert.equal(result.eligible, true);
    assert.equal(result.reasonCode, "PROMOTION_ELIGIBLE");
    assert.equal(result.computedDiscount, 20);
    assert.equal(result.roomSubtotalAfterPromotion, 180);
    assert.equal(PROMOTION_FULL_STAY_REQUIRED, true);
    assert.equal(lastStayNight("2026-10-12"), "2026-10-11");
  });

  it("rejects inactive activation or master", () => {
    assert.equal(evaluate(activation({ active: false })).reasonCode, "PROMOTION_INACTIVE");
    assert.equal(evaluate(activation(), {}, master({ active: false })).reasonCode, "PROMOTION_INACTIVE");
    assert.equal(
      evaluatePromotionEligibility(input(), { activation: null, master: master() }).reasonCode,
      "PROMOTION_ACTIVATION_NOT_FOUND",
    );
    assert.equal(evaluate(activation(), {}, null as never).reasonCode, "PROMOTION_NOT_FOUND");
  });

  it("rejects the wrong property", () => {
    assert.equal(evaluate(activation({ restaurantId: OTHER })).reasonCode, "PROMOTION_WRONG_PROPERTY");
    assert.equal(evaluate(activation(), { restaurantId: OTHER }).reasonCode, "PROMOTION_WRONG_PROPERTY");
  });

  it("rejects booking before and after the booking window", () => {
    assert.equal(evaluate(activation(), { bookingBusinessDate: "2026-08-31" }).reasonCode, "PROMOTION_BOOKING_WINDOW_MISMATCH");
    assert.equal(evaluate(activation(), { bookingBusinessDate: "2026-10-01" }).reasonCode, "PROMOTION_BOOKING_WINDOW_MISMATCH");
  });

  it("rejects a stay outside or only partially inside the stay window", () => {
    assert.equal(evaluate(activation(), { arrivalDate: "2026-09-30", departureDate: "2026-10-02" }).reasonCode, "PROMOTION_STAY_WINDOW_MISMATCH");
    assert.equal(evaluate(activation(), { arrivalDate: "2026-10-31", departureDate: "2026-11-02" }).reasonCode, "PROMOTION_STAY_WINDOW_MISMATCH");
    assert.equal(
      stayFullyWithinWindow({
        arrivalDate: "2026-10-01",
        departureDate: "2026-11-01",
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
      }),
      true,
    );
    assert.equal(
      stayFullyWithinWindow({
        arrivalDate: "2026-10-01",
        departureDate: "2026-11-02",
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
      }),
      false,
    );
  });

  it("enforces room-type and rate-plan scope, including inherit/all semantics", () => {
    assert.equal(PROMOTION_EMPTY_MASTER_ROOM_TYPES_ALLOW_ALL, true);
    assert.equal(evaluate(activation()).eligible, true);
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: ["other-rt"], ratePlanIds: [] } })).reasonCode,
      "PROMOTION_ROOM_TYPE_MISMATCH",
    );
    assert.equal(
      evaluate(activation({ masterRoomTypeIds: [ROOM_TYPE], scope: { roomTypeIds: [], ratePlanIds: [] } })).eligible,
      true,
    );
    assert.equal(
      evaluate(activation({ masterRoomTypeIds: ["other-rt"], scope: { roomTypeIds: [], ratePlanIds: [] } })).reasonCode,
      "PROMOTION_ROOM_TYPE_MISMATCH",
    );
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: [], ratePlanIds: [] } })).eligible,
      true,
    );
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: [], ratePlanIds: ["other-plan"] } })).reasonCode,
      "PROMOTION_RATE_PLAN_MISMATCH",
    );
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: [], ratePlanIds: [RATE_PLAN] } })).eligible,
      true,
    );
  });

  it("marks free_night unsupported and does not calculate a discount", () => {
    const result = evaluate(activation({ promoKind: "free_night", promoValue: 1 }));
    assert.equal(result.eligible, false);
    assert.equal(result.reasonCode, "PROMOTION_KIND_UNSUPPORTED");
    assert.equal(result.computedDiscount, 0);
  });
});

describe("P5A-02 — calculation", () => {
  it("computes percent, 100 percent, fixed, and clamps fixed above subtotal", () => {
    assert.deepEqual(computePromotionDiscount({ promoKind: "percent", promoValue: 10, baseRoomSubtotal: 200 }), {
      ok: true,
      discount: 20,
      roomSubtotalAfterPromotion: 180,
    });
    assert.deepEqual(computePromotionDiscount({ promoKind: "percent", promoValue: 100, baseRoomSubtotal: 80 }), {
      ok: true,
      discount: 80,
      roomSubtotalAfterPromotion: 0,
    });
    assert.deepEqual(computePromotionDiscount({ promoKind: "fixed", promoValue: 40, baseRoomSubtotal: 200 }), {
      ok: true,
      discount: 40,
      roomSubtotalAfterPromotion: 160,
    });
    assert.deepEqual(computePromotionDiscount({ promoKind: "fixed", promoValue: 250, baseRoomSubtotal: 200 }), {
      ok: true,
      discount: 200,
      roomSubtotalAfterPromotion: 0,
    });
  });

  it("rejects zero or invalid values and never returns a negative total", () => {
    assert.equal(computePromotionDiscount({ promoKind: "percent", promoValue: 0, baseRoomSubtotal: 200 }).ok, false);
    assert.equal(computePromotionDiscount({ promoKind: "percent", promoValue: 101, baseRoomSubtotal: 200 }).ok, false);
    assert.equal(computePromotionDiscount({ promoKind: "fixed", promoValue: 0, baseRoomSubtotal: 200 }).ok, false);
    assert.equal(computePromotionDiscount({ promoKind: "free_night", promoValue: 1, baseRoomSubtotal: 200 }).ok, false);
    const rounded = computePromotionDiscount({ promoKind: "percent", promoValue: 33.333, baseRoomSubtotal: 100 });
    assert.equal(rounded.ok, true);
    if (rounded.ok) {
      assert.equal(rounded.discount, 33.33);
      assert.equal(rounded.roomSubtotalAfterPromotion, 66.67);
    }
  });
});

describe("P5A-02 — quote compose", () => {
  const room = { subtotal: 200, currency: "GBP", nightly: [{ date: "2026-10-10", rate: 100 }] };

  it("keeps the room quote when no promotion is selected", () => {
    const quote = composePromotionQuote(room, null, []);
    assert.equal(quote.baseRoomSubtotal, 200);
    assert.equal(quote.promotionDiscount, 0);
    assert.equal(quote.packagesSubtotal, 0);
    assert.equal(quote.grandCommercialSubtotal, 200);
    assert.equal(quote.room.subtotal, 200);
    assert.deepEqual(quote.room.nightly, room.nightly);
  });

  it("applies eligible percent and fixed promotions without changing room money", () => {
    const percent = evaluate(activation());
    const percentQuote = composePromotionQuote(room, percent, []);
    assert.equal(percentQuote.promotionDiscount, 20);
    assert.equal(percentQuote.room.subtotal, 200);
    const fixed = evaluate(activation({ promoKind: "fixed", promoValue: 35, promotionCode: "FIX35" }));
    const fixedQuote = composePromotionQuote(room, fixed, []);
    assert.equal(fixedQuote.promotionDiscount, 35);
    assert.equal(fixedQuote.grandCommercialSubtotal, 165);
    assert.equal(fixedQuote.room.currency, "GBP");
  });

  it("does not apply an ineligible or free-night selection", () => {
    const missed = evaluate(activation(), { bookingBusinessDate: "2026-08-01" });
    const missedQuote = composePromotionQuote(room, missed, []);
    assert.equal(missedQuote.appliedPromotion, null);
    assert.ok(missedQuote.commercialWarnings.includes("PROMOTION_BOOKING_WINDOW_MISMATCH"));
    assert.equal(missedQuote.grandCommercialSubtotal, 200);
    const free = evaluate(activation({ promoKind: "free_night", promoValue: 1 }));
    const freeQuote = composePromotionQuote(room, free, []);
    assert.equal(freeQuote.appliedPromotion, null);
    assert.ok(freeQuote.commercialWarnings.includes("PROMOTION_KIND_UNSUPPORTED"));
  });

  it("lists eligible promotions without auto-applying a winner", () => {
    const items = listEligiblePromotionItems(input(), [
      { activation: activation({ priority: 20, promotionCode: "B" }), master: master() },
      { activation: activation({ id: "77777777-7777-4777-8777-777777777777", priority: 5, promotionCode: "A" }), master: master() },
      { activation: activation({ promoKind: "free_night", promoValue: 1, promotionCode: "FREE" }), master: master() },
    ]);
    assert.deepEqual(items.map((row) => row.code), ["A", "B"]);
    const quote = composePromotionQuote(room, null, items);
    assert.equal(quote.appliedPromotion, null);
    assert.ok(quote.commercialWarnings.includes("PROMOTION_OVERLAP_WARNING"));
  });
});

describe("P5A-02 — create, reprice, snapshot, and performance contracts", () => {
  const drizzle = readRel("../../../../../drizzle/migrations/0105_pms_commercial_promotion_engine.sql");
  const supabase = readRel("../../../../../supabase/migrations/0105_pms_commercial_promotion_engine.sql");
  const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
  const createFns = readRel("../reservations.functions.ts");
  const ratesFns = readRel("../rates.functions.ts");
  const quoteFns = readRel("./commercial-promotion.functions.ts");
  const foAmend = readRel("../fo-amendments.functions.ts");

  it("keeps dual-lane 0105 SQL identical and does not replace price_hotel_stay", () => {
    assert.equal(drizzle, supabase);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0104_pms_commercial_engine_foundation.sql"));
    assert.ok(migrations.includes("0105_pms_commercial_promotion_engine.sql"));
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.sync_hotel_reservation_promotion/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced_commercial/);
    assert.match(supabase, /create_hotel_reservation_priced\(/);
    assert.match(supabase, /_mode = 'apply'/);
    assert.match(supabase, /'reevaluate'/);
    assert.match(supabase, /ON CONFLICT \(reservation_id\) DO UPDATE/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /quote_hotel_stay_commercial/);
    assert.doesNotMatch(supabase, /apply_hotel_promotion_activation/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /nightly_rate_snapshot/);
    assert.match(pricing, /room_subtotal = \(pricing->>'subtotal'\)::numeric/);
  });

  it("creates with optional promotion atomically and leaves room snapshots pre-commercial", () => {
    const createStart = createFns.indexOf("export const createReservation");
    const createFn = createFns.slice(createStart, createFns.indexOf("export const copyReservation"));
    assert.match(createFn, /promotionActivationId: idSchema\.optional\(\)/);
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.match(createFn, /create_hotel_reservation_priced_commercial/);
    assert.match(createFn, /data\.promotionActivationId/);
    assert.match(supabase, /INSERT INTO public\.hotel_reservation_promotions/);
    assert.match(supabase, /base_room_subtotal/);
    assert.doesNotMatch(supabase, /SET room_subtotal = after_promo|room_subtotal = discount/);
    assert.doesNotMatch(supabase, /nightly_rate_snapshot = .*promotion|nightly_rate_snapshot = after_promo/);
    assert.match(createFn, /requireReservationManager/);
    assert.doesNotMatch(createFn, /requireRateManager/);
    assert.match(quoteFns, /requireReservationManager/);
    assert.doesNotMatch(quoteFns, /requireRateManager/);
  });

  it("reprices and priced-amends the current attribution without substituting another promotion", () => {
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(supabase, /sync_hotel_reservation_promotion\(\s+_restaurant_id, updated.id, NULL, 'reevaluate'/);
    assert.match(supabase, /DELETE FROM public\.hotel_reservation_promotions WHERE reservation_id = reservation.id/);
    assert.doesNotMatch(supabase, /ORDER BY priority|lowest priority|auto.?best/i);
    assert.match(ratesFns, /rpc\("reprice_hotel_reservation"/);
    assert.match(createFns, /rpc\("amend_hotel_reservation_priced"/);
    assert.match(foAmend, /amend_hotel_reservation/);
    assert.doesNotMatch(foAmend, /amend_hotel_reservation_priced|sync_hotel_reservation_promotion/);
  });

  it("keeps attribution snapshots independent of later master or activation edits", () => {
    const original = activation({ promotionCode: "SPRING10", promoValue: 10 });
    const snapshot = buildPromotionAttributionSnapshot(original);
    original.promotionCode = "CHANGED";
    original.promoValue = 90;
    original.scope.roomTypeIds.push("later-rt");
    assert.equal(snapshot.code, "SPRING10");
    assert.equal(snapshot.value, 10);
    assert.deepEqual(snapshot.roomTypeIds, []);
    assert.match(supabase, /activation.promotion_code/);
    assert.match(supabase, /activation.promo_value/);
    assert.doesNotMatch(supabase, /UPDATE public\.hotel_reservation_promotions[\s\S]*pms_promotions/);
  });

  it("supports post-launch performance from attribution only", () => {
    assert.equal(PROMOTION_PERFORMANCE_REVENUE_FIELD, "room_subtotal_after_promotion");
    const summary = summarizePromotionPerformance([
      { reservationId: "r1", discountAmount: 20, roomSubtotalAfterPromotion: 180 },
      { reservationId: "r2", discountAmount: 15, roomSubtotalAfterPromotion: 85 },
    ]);
    assert.equal(summary.bookingCount, 2);
    assert.equal(summary.discountAmount, 35);
    assert.equal(summary.roomRevenueAfterPromotion, 265);
    assert.deepEqual(summarizePromotionPerformance([]), {
      bookingCount: 0,
      discountAmount: 0,
      roomRevenueAfterPromotion: 0,
    });
  });
});
