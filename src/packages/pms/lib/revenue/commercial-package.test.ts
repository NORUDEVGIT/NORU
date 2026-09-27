import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PackageActivation, PackageComponentSnapshot } from "./commercial-engine.ts";
import {
  PACKAGE_EMPTY_MASTER_SCOPE_ALLOW_ALL,
  PACKAGE_FULL_STAY_REQUIRED,
  PACKAGE_PERFORMANCE_REVENUE_FIELD,
  PACKAGE_V1_QUANTITY,
  buildPackageAttributionSnapshot,
  composeCommercialQuote,
  computePackageAmount,
  evaluatePackageEligibility,
  evaluateSelectedPackages,
  listEligiblePackageItems,
  summarizePackagePerformance,
  uniquePackageActivationIds,
  type PackageEligibilityInput,
  type PackageMasterRecord,
} from "./commercial-package.ts";
import { evaluatePromotionEligibility, type PromotionEligibilityInput } from "./commercial-promotion.ts";
import type { PromotionActivation } from "./commercial-engine.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const RESTAURANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const ACTIVATION = "11111111-1111-4111-8111-111111111111";
const ACTIVATION_B = "77777777-7777-4777-8777-777777777777";
const PACKAGE = "22222222-2222-4222-8222-222222222222";
const PACKAGE_B = "88888888-8888-4888-8888-888888888888";
const ROOM_TYPE = "33333333-3333-4333-8333-333333333333";
const RATE_PLAN = "66666666-6666-4666-8666-666666666666";
const OTHER_ROOM = "99999999-9999-4999-8999-999999999999";
const OTHER_PLAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROMO_ACTIVATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROMOTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const BREAKFAST: PackageComponentSnapshot = {
  componentType: "meal_plan",
  componentId: "mp-1",
  label: "Breakfast",
  quantity: 1,
};

function activation(overrides: Partial<PackageActivation> = {}): PackageActivation {
  return {
    id: ACTIVATION,
    restaurantId: RESTAURANT,
    packageId: PACKAGE,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    active: true,
    reason: "Autumn launch",
    createdByMembershipId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    packageCode: "BB500",
    packageName: "Bed and breakfast",
    packageType: "accommodation",
    packagePrice: 500,
    chargeBasis: "per_stay",
    components: [BREAKFAST],
    masterRoomTypeIds: [],
    masterRatePlanIds: [],
    scope: { roomTypeIds: [], ratePlanIds: [] },
    ...overrides,
    scope: overrides.scope ?? { roomTypeIds: [], ratePlanIds: [] },
    components: overrides.components ?? [BREAKFAST],
  };
}

function master(overrides: Partial<PackageMasterRecord> = {}): PackageMasterRecord {
  return { id: PACKAGE, restaurantId: RESTAURANT, active: true, ...overrides };
}

function input(overrides: Partial<PackageEligibilityInput> = {}): PackageEligibilityInput {
  return {
    restaurantId: RESTAURANT,
    packageActivationId: ACTIVATION,
    arrivalDate: "2026-10-10",
    departureDate: "2026-10-12",
    roomTypeId: ROOM_TYPE,
    ratePlanId: RATE_PLAN,
    ...overrides,
  };
}

function evaluate(act: PackageActivation, extra: Partial<PackageEligibilityInput> = {}, masterRow = master()) {
  return evaluatePackageEligibility(input(extra), { activation: act, master: masterRow });
}

function promoActivation(): PromotionActivation {
  return {
    id: PROMO_ACTIVATION,
    restaurantId: RESTAURANT,
    promotionId: PROMOTION,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    bookingFrom: "2026-09-01",
    bookingTo: "2026-09-30",
    active: true,
    priority: 10,
    reason: null,
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
  };
}

function promoInput(): PromotionEligibilityInput {
  return {
    restaurantId: RESTAURANT,
    promotionActivationId: PROMO_ACTIVATION,
    bookingBusinessDate: "2026-09-15",
    arrivalDate: "2026-10-10",
    departureDate: "2026-10-12",
    roomTypeId: ROOM_TYPE,
    ratePlanId: RATE_PLAN,
    baseRoomSubtotal: 10000,
  };
}

describe("P5A-03 — eligibility", () => {
  it("accepts an active per-stay package inside the full stay window", () => {
    const result = evaluate(activation());
    assert.equal(result.eligible, true);
    assert.equal(result.reasonCode, "PACKAGE_ELIGIBLE");
    assert.equal(result.quantity, PACKAGE_V1_QUANTITY);
    assert.equal(result.unitAmount, 500);
    assert.equal(result.appliedAmount, 500);
    assert.equal(PACKAGE_FULL_STAY_REQUIRED, true);
    assert.equal(PACKAGE_EMPTY_MASTER_SCOPE_ALLOW_ALL, true);
  });

  it("rejects inactive activation or master", () => {
    assert.equal(evaluate(activation({ active: false })).reasonCode, "PACKAGE_INACTIVE");
    assert.equal(evaluate(activation(), {}, master({ active: false })).reasonCode, "PACKAGE_INACTIVE");
    assert.equal(
      evaluatePackageEligibility(input(), { activation: null, master: master() }).reasonCode,
      "PACKAGE_ACTIVATION_NOT_FOUND",
    );
    assert.equal(evaluate(activation(), {}, null as never).reasonCode, "PACKAGE_NOT_FOUND");
  });

  it("rejects the wrong property", () => {
    assert.equal(evaluate(activation({ restaurantId: OTHER })).reasonCode, "PACKAGE_WRONG_PROPERTY");
    assert.equal(evaluate(activation(), { restaurantId: OTHER }).reasonCode, "PACKAGE_WRONG_PROPERTY");
  });

  it("rejects a stay before, after, or only partially inside the validity window", () => {
    assert.equal(evaluate(activation(), { arrivalDate: "2026-09-30", departureDate: "2026-10-02" }).reasonCode, "PACKAGE_STAY_WINDOW_MISMATCH");
    assert.equal(evaluate(activation(), { arrivalDate: "2026-10-31", departureDate: "2026-11-02" }).reasonCode, "PACKAGE_STAY_WINDOW_MISMATCH");
    assert.equal(evaluate(activation(), { arrivalDate: "2026-10-30", departureDate: "2026-11-02" }).reasonCode, "PACKAGE_STAY_WINDOW_MISMATCH");
    assert.equal(evaluate(activation(), { arrivalDate: "2026-10-01", departureDate: "2026-11-01" }).reasonCode, "PACKAGE_ELIGIBLE");
  });

  it("rejects room-type and rate-plan mismatches", () => {
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: [OTHER_ROOM], ratePlanIds: [] } })).reasonCode,
      "PACKAGE_ROOM_TYPE_MISMATCH",
    );
    assert.equal(
      evaluate(activation({ scope: { roomTypeIds: [], ratePlanIds: [OTHER_PLAN] } })).reasonCode,
      "PACKAGE_RATE_PLAN_MISMATCH",
    );
  });

  it("inherits empty activation room and rate mappings from the master snapshot", () => {
    const inherited = evaluate(activation({
      masterRoomTypeIds: [ROOM_TYPE],
      masterRatePlanIds: [RATE_PLAN],
      scope: { roomTypeIds: [], ratePlanIds: [] },
    }));
    assert.equal(inherited.eligible, true);
    assert.equal(
      evaluate(activation({
        masterRoomTypeIds: [OTHER_ROOM],
        masterRatePlanIds: [],
        scope: { roomTypeIds: [], ratePlanIds: [] },
      })).reasonCode,
      "PACKAGE_ROOM_TYPE_MISMATCH",
    );
    assert.equal(
      evaluate(activation({
        masterRoomTypeIds: [],
        masterRatePlanIds: [OTHER_PLAN],
        scope: { roomTypeIds: [], ratePlanIds: [] },
      })).reasonCode,
      "PACKAGE_RATE_PLAN_MISMATCH",
    );
  });

  it("does not let activation mappings broaden master scope", () => {
    assert.equal(
      evaluate(activation({
        masterRoomTypeIds: [ROOM_TYPE],
        scope: { roomTypeIds: [ROOM_TYPE, OTHER_ROOM], ratePlanIds: [] },
      }), { roomTypeId: OTHER_ROOM }).reasonCode,
      "PACKAGE_ROOM_TYPE_MISMATCH",
    );
  });

  it("rejects an unsupported charge basis without approximating", () => {
    assert.equal(
      evaluate(activation({ chargeBasis: "per_night" as PackageActivation["chargeBasis"] })).reasonCode,
      "PACKAGE_CHARGE_BASIS_UNSUPPORTED",
    );
  });
});

describe("P5A-03 — package money", () => {
  it("applies one and multiple per-stay packages additively", () => {
    const one = computePackageAmount({ packagePrice: 500, chargeBasis: "per_stay" });
    assert.equal(one.ok, true);
    if (one.ok) {
      assert.equal(one.quantity, 1);
      assert.equal(one.appliedAmount, 500);
    }
    const two = computePackageAmount({ packagePrice: 1200, chargeBasis: "per_stay", quantity: 1 });
    assert.equal(two.ok, true);
    if (two.ok) assert.equal(two.appliedAmount, 1200);
  });

  it("rejects zero or negative prices and never returns a negative amount", () => {
    assert.equal(computePackageAmount({ packagePrice: 0, chargeBasis: "per_stay" }).ok, false);
    assert.equal(computePackageAmount({ packagePrice: -10, chargeBasis: "per_stay" }).ok, false);
    const rounded = computePackageAmount({ packagePrice: 33.333, chargeBasis: "per_stay" });
    assert.equal(rounded.ok, true);
    if (rounded.ok) {
      assert.equal(rounded.unitAmount, 33.33);
      assert.equal(rounded.appliedAmount, 33.33);
    }
  });

  it("does not let a promotion discount the package amount", () => {
    const room = { subtotal: 10000, nightly: [{ date: "2026-10-10", rate: 5000 }] };
    const promo = evaluatePromotionEligibility(promoInput(), {
      activation: promoActivation(),
      master: { id: PROMOTION, restaurantId: RESTAURANT, active: true },
    });
    const pkg = evaluate(activation({ packagePrice: 500 }));
    const selected = evaluateSelectedPackages(input(), [ACTIVATION], [{ activation: activation({ packagePrice: 500 }), master: master() }]);
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    const quote = composeCommercialQuote(room, promo, [], selected.applied, [], []);
    assert.equal(quote.promotionDiscount, 1000);
    assert.equal(quote.roomSubtotalAfterPromotion, 9000);
    assert.equal(quote.packagesSubtotal, 500);
    assert.equal(quote.grandCommercialSubtotal, 9500);
    assert.equal(pkg.appliedAmount, 500);
  });
});

describe("P5A-03 — commercial quote", () => {
  const room = { subtotal: 10000, currency: "ETB", nightly: [{ date: "2026-10-10", rate: 5000 }, { date: "2026-10-11", rate: 5000 }] };
  const breakfast = activation({ packagePrice: 500 });
  const spa = activation({
    id: ACTIVATION_B,
    packageId: PACKAGE_B,
    packageCode: "SPA1200",
    packageName: "Spa",
    packagePrice: 1200,
    components: [{ componentType: "fo_service", componentId: "spa-1", label: "Spa", quantity: 1 }],
  });

  it("keeps the room quote when nothing commercial is selected", () => {
    const quote = composeCommercialQuote(room, null, [], [], [], []);
    assert.equal(quote.baseRoomSubtotal, 10000);
    assert.equal(quote.promotionDiscount, 0);
    assert.deepEqual(quote.packages, []);
    assert.equal(quote.packagesSubtotal, 0);
    assert.equal(quote.grandCommercialSubtotal, 10000);
    assert.equal(quote.room.subtotal, 10000);
    assert.deepEqual(quote.room.nightly, room.nightly);
  });

  it("applies promotion only without changing room money", () => {
    const promo = evaluatePromotionEligibility(promoInput(), {
      activation: promoActivation(),
      master: { id: PROMOTION, restaurantId: RESTAURANT, active: true },
    });
    const quote = composeCommercialQuote(room, promo, [], [], [], []);
    assert.equal(quote.promotionDiscount, 1000);
    assert.equal(quote.packagesSubtotal, 0);
    assert.equal(quote.grandCommercialSubtotal, 9000);
    assert.equal(quote.room.subtotal, 10000);
  });

  it("applies package only after the unchanged room subtotal", () => {
    const selected = evaluateSelectedPackages(input(), [ACTIVATION], [{ activation: breakfast, master: master() }]);
    assert.equal(selected.ok, true);
    if (!selected.ok) return;
    const quote = composeCommercialQuote(room, null, [], selected.applied, [], []);
    assert.equal(quote.promotionDiscount, 0);
    assert.equal(quote.packagesSubtotal, 500);
    assert.equal(quote.grandCommercialSubtotal, 10500);
    assert.equal(quote.room.subtotal, 10000);
    assert.equal(quote.packages[0]?.components[0]?.componentType, "meal_plan");
  });

  it("applies promotion plus one or many packages after room money", () => {
    const promo = evaluatePromotionEligibility(promoInput(), {
      activation: promoActivation(),
      master: { id: PROMOTION, restaurantId: RESTAURANT, active: true },
    });
    const one = evaluateSelectedPackages(input(), [ACTIVATION], [{ activation: breakfast, master: master() }]);
    assert.equal(one.ok, true);
    if (!one.ok) return;
    const oneQuote = composeCommercialQuote(room, promo, [], one.applied, [], []);
    assert.equal(oneQuote.roomSubtotalAfterPromotion, 9000);
    assert.equal(oneQuote.packagesSubtotal, 500);
    assert.equal(oneQuote.grandCommercialSubtotal, 9500);

    const many = evaluateSelectedPackages(input(), [ACTIVATION, ACTIVATION_B], [
      { activation: breakfast, master: master() },
      { activation: spa, master: master({ id: PACKAGE_B }) },
    ]);
    assert.equal(many.ok, true);
    if (!many.ok) return;
    const manyQuote = composeCommercialQuote(room, promo, [], many.applied, [], []);
    assert.equal(manyQuote.packagesSubtotal, 1700);
    assert.equal(manyQuote.grandCommercialSubtotal, 10700);
    assert.equal(manyQuote.room.subtotal, 10000);
  });

  it("fails an invalid or duplicate selected package instead of dropping it", () => {
    const invalid = evaluateSelectedPackages(input(), [ACTIVATION], [{
      activation: activation({ active: false }),
      master: master(),
    }]);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.reasonCode, "PACKAGE_INACTIVE");
    const duplicate = uniquePackageActivationIds([ACTIVATION, ACTIVATION]);
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.reasonCode, "PACKAGE_DUPLICATE_SELECTION");
    const listed = listEligiblePackageItems(input(), [
      { activation: breakfast, master: master() },
      { activation: activation({ active: false, packageCode: "OFF" }), master: master() },
    ]);
    assert.deepEqual(listed.map((row) => row.code), ["BB500"]);
    assert.equal(listed[0]?.components[0]?.label, "Breakfast");
  });
});

describe("P5A-03 — create, reprice, snapshot, and cashiering contracts", () => {
  const drizzle = readRel("../../../../../drizzle/migrations/0106_pms_commercial_package_engine.sql");
  const supabase = readRel("../../../../../supabase/migrations/0106_pms_commercial_package_engine.sql");
  const prior = readRel("../../../../../drizzle/migrations/0105_pms_commercial_promotion_engine.sql");
  const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
  const createFns = readRel("../reservations.functions.ts");
  const ratesFns = readRel("../rates.functions.ts");
  const quoteFns = readRel("./commercial-promotion.functions.ts");
  const packageFns = readRel("./commercial-package.functions.ts");
  const quoteServer = readRel("./commercial-promotion.server.ts");
  const foAmend = readRel("../fo-amendments.functions.ts");
  const domain = readRel("./commercial-package.ts");
  const packageServer = readRel("./commercial-package.server.ts");

  it("keeps dual-lane 0106 SQL identical and does not replace price_hotel_stay", () => {
    assert.equal(drizzle, supabase);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0105_pms_commercial_promotion_engine.sql"));
    assert.ok(migrations.includes("0106_pms_commercial_package_engine.sql"));
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.sync_hotel_reservation_packages/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced_commercial/);
    assert.match(supabase, /_package_activation_ids uuid\[\] DEFAULT NULL/);
    assert.match(supabase, /create_hotel_reservation_priced\(/);
    assert.match(supabase, /_mode = 'apply'/);
    assert.match(supabase, /'reevaluate'/);
    assert.match(supabase, /ON CONFLICT \(reservation_id, package_activation_id\) DO UPDATE/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /apply_hotel_package_activation/);
    assert.doesNotMatch(supabase, /quote_hotel_stay_commercial/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /nightly_rate_snapshot/);
    assert.match(pricing, /room_subtotal = \(pricing->>'subtotal'\)::numeric/);
    assert.match(prior, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced_commercial/);
  });

  it("creates with optional packages atomically and leaves room snapshots pre-commercial", () => {
    const createStart = createFns.indexOf("export const createReservation");
    const createFn = createFns.slice(createStart, createFns.indexOf("export const copyReservation"));
    assert.match(createFn, /packageActivationIds: z\.array\(idSchema\)\.optional\(\)/);
    assert.match(createFn, /promotionActivationId: idSchema\.optional\(\)/);
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.match(createFn, /create_hotel_reservation_priced_commercial/);
    assert.match(createFn, /hasCommercialSelection/);
    assert.match(createFn, /_package_activation_ids/);
    assert.match(supabase, /INSERT INTO public\.hotel_reservation_packages/);
    assert.match(supabase, /IF _mode = 'apply' THEN\s+RAISE EXCEPTION '%', reason;/);
    assert.doesNotMatch(createFn, /from\("hotel_reservation_packages"\)[\s\S]*insert/);
    assert.doesNotMatch(supabase, /SET room_subtotal = .*applied_amount|room_subtotal = packages/);
    assert.doesNotMatch(supabase, /nightly_rate_snapshot = .*package|nightly_rate_snapshot = applied/);
    assert.match(createFn, /requireReservationManager/);
    assert.doesNotMatch(createFn, /requireRateManager/);
    assert.match(packageFns, /requireReservationManager/);
    assert.doesNotMatch(packageFns, /requireRateManager/);
    assert.match(quoteFns, /packageActivationIds/);
    assert.match(quoteServer, /if \(selectedPackages\.failedReason\)/);
  });

  it("reprices and priced-amends current packages without auto-adding another package", () => {
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(supabase, /sync_hotel_reservation_packages\(\s+_restaurant_id, updated.id, NULL, 'reevaluate'/);
    assert.match(supabase, /SELECT COALESCE\(array_agg\(package_activation_id\), ARRAY\[\]::uuid\[\]\)/);
    assert.match(supabase, /DELETE FROM public\.hotel_reservation_packages/);
    assert.doesNotMatch(supabase, /auto.?add|newly eligible|substitute another package/i);
    assert.match(ratesFns, /rpc\("reprice_hotel_reservation"/);
    assert.match(createFns, /rpc\("amend_hotel_reservation_priced"/);
    assert.match(foAmend, /amend_hotel_reservation/);
    assert.doesNotMatch(foAmend, /amend_hotel_reservation_priced|sync_hotel_reservation_packages/);
  });

  it("keeps attribution snapshots independent of later master edits", () => {
    const original = activation({ packagePrice: 500, packageCode: "BB500" });
    const snapshot = buildPackageAttributionSnapshot(original);
    original.packagePrice = 999;
    original.packageCode = "CHANGED";
    original.components.push({ componentType: "room_amenity", componentId: "late", label: "Later", quantity: 1 });
    original.masterRoomTypeIds.push(OTHER_ROOM);
    assert.equal(snapshot.packagePrice, 500);
    assert.equal(snapshot.code, "BB500");
    assert.deepEqual(snapshot.components, [BREAKFAST]);
    assert.deepEqual(snapshot.roomTypeIds, []);
    assert.match(supabase, /activation.package_price/);
    assert.match(supabase, /activation.components_snapshot/);
    assert.doesNotMatch(supabase, /UPDATE public\.hotel_reservation_packages[\s\S]*pms_packages/);
    assert.doesNotMatch(supabase, /UPDATE public\.hotel_package_activations[\s\S]*pms_packages/);
  });

  it("does not claim package cashiering or folio posting", () => {
    assert.doesNotMatch(domain, /packagePosted|packagePaid|packageCollected|folio posting/);
    assert.doesNotMatch(packageServer, /post_folio|posted charge|package paid|package collected/);
    assert.doesNotMatch(supabase, /post_folio_transaction|folio_lines|package posted|package paid/);
    assert.match(packageFns, /listEligiblePackageActivations/);
    assert.match(packageFns, /getReservationPackageAttributions/);
    assert.match(packageFns, /getReservationCommercialAttribution/);
  });

  it("supports post-launch package performance from attribution only", () => {
    assert.equal(PACKAGE_PERFORMANCE_REVENUE_FIELD, "applied_amount");
    const summary = summarizePackagePerformance([
      { reservationId: "r1", appliedAmount: 500 },
      { reservationId: "r1", appliedAmount: 1200 },
      { reservationId: "r2", appliedAmount: 500 },
    ]);
    assert.equal(summary.bookingCount, 2);
    assert.equal(summary.packageRevenue, 2200);
    assert.deepEqual(summarizePackagePerformance([]), { bookingCount: 0, packageRevenue: 0 });
  });
});
