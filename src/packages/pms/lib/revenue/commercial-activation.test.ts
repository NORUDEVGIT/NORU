import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PackageActivation, PromotionActivation } from "./commercial-engine.ts";
import {
  COMMERCIAL_ABSENT_VERSION,
  COMMERCIAL_CHANGE_EVENT_IMMUTABLE,
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  commercialActivationVersionToken,
  commercialChangedFields,
  commercialHistoryActorLabel,
  snapshotPackageExecution,
  snapshotPromotionExecution,
} from "./commercial-engine.ts";
import {
  packageActivationPreviewCanApply,
  previewPackageActivation,
  type PackageMasterPreview,
} from "./commercial-package-activation.ts";
import {
  previewPromotionActivation,
  promotionActivationPreviewCanApply,
  type PromotionMasterPreview,
} from "./commercial-promotion-activation.ts";
import { evaluatePromotionEligibility } from "./commercial-promotion.ts";
import { evaluatePackageEligibility } from "./commercial-package.ts";
import {
  commercialHistoryActionLabel,
  commercialHistoryChangedFields,
  commercialHistoryPageSize,
} from "./commercial-history.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const RESTAURANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const PROMOTION = "22222222-2222-4222-8222-222222222222";
const PACKAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM = "33333333-3333-4333-8333-333333333333";
const OTHER_ROOM = "99999999-9999-4999-8999-999999999999";
const PLAN = "66666666-6666-4666-8666-666666666666";
const OTHER_PLAN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTIVATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ACT = "77777777-7777-4777-8777-777777777777";

function promoMaster(overrides: Partial<PromotionMasterPreview> = {}): PromotionMasterPreview {
  return {
    id: PROMOTION,
    restaurantId: RESTAURANT,
    code: "SPRING10",
    name: "Spring 10",
    promoKind: "percent",
    promoValue: 10,
    validFrom: "2026-10-01",
    validTo: "2026-10-31",
    active: true,
    roomTypeIds: [ROOM],
    ...overrides,
  };
}

function promoActivation(overrides: Partial<PromotionActivation> = {}): PromotionActivation {
  return {
    id: ACTIVATION,
    restaurantId: RESTAURANT,
    promotionId: PROMOTION,
    validFrom: "2026-10-05",
    validTo: "2026-10-20",
    bookingFrom: "2026-09-01",
    bookingTo: "2026-09-30",
    active: true,
    priority: 10,
    reason: "Launch",
    createdByMembershipId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    promotionCode: "SPRING10",
    promotionName: "Spring 10",
    promoKind: "percent",
    promoValue: 10,
    masterValidFrom: "2026-10-01",
    masterValidTo: "2026-10-31",
    masterRoomTypeIds: [ROOM],
    scope: { roomTypeIds: [ROOM], ratePlanIds: [] },
    ...overrides,
    scope: overrides.scope ?? { roomTypeIds: [ROOM], ratePlanIds: [] },
  };
}

function packageMaster(overrides: Partial<PackageMasterPreview> = {}): PackageMasterPreview {
  return {
    id: PACKAGE,
    restaurantId: RESTAURANT,
    code: "BB500",
    name: "Bed and breakfast",
    type: "accommodation",
    packagePrice: 500,
    active: true,
    roomTypeIds: [ROOM],
    ratePlanIds: [PLAN],
    components: [{ componentType: "meal_plan", componentId: "mp-1", label: "Breakfast", quantity: 1 }],
    ...overrides,
  };
}

function packageActivation(overrides: Partial<PackageActivation> = {}): PackageActivation {
  return {
    id: ACTIVATION,
    restaurantId: RESTAURANT,
    packageId: PACKAGE,
    validFrom: "2026-10-05",
    validTo: "2026-10-20",
    active: true,
    reason: "Launch",
    createdByMembershipId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    packageCode: "BB500",
    packageName: "Bed and breakfast",
    packageType: "accommodation",
    packagePrice: 500,
    chargeBasis: "per_stay",
    components: [{ componentType: "meal_plan", componentId: "mp-1", label: "Breakfast", quantity: 1 }],
    masterRoomTypeIds: [ROOM],
    masterRatePlanIds: [PLAN],
    scope: { roomTypeIds: [ROOM], ratePlanIds: [PLAN] },
    ...overrides,
    scope: overrides.scope ?? { roomTypeIds: [ROOM], ratePlanIds: [PLAN] },
  };
}

describe("P5A-04 — promotion preview", () => {
  const property = { propertyRoomTypeIds: [ROOM, OTHER_ROOM], propertyRatePlanIds: [PLAN, OTHER_PLAN] };

  it("accepts a valid create, edit, and deactivate", () => {
    const created = previewPromotionActivation(
      {
        restaurantId: RESTAURANT,
        operation: "CREATE",
        promotionId: PROMOTION,
        validFrom: "2026-10-05",
        validTo: "2026-10-20",
        bookingFrom: "2026-09-01",
        bookingTo: "2026-09-30",
        roomTypeIds: [ROOM],
        expectedVersion: "absent",
      },
      { master: promoMaster(), current: null, existing: [], ...property },
    );
    assert.equal(created.errors.length, 0);
    assert.equal(created.expectedVersion, COMMERCIAL_ABSENT_VERSION);
    assert.equal(created.actionType, "promotion_activation_created");
    assert.equal(promotionActivationPreviewCanApply(created), true);

    const edited = previewPromotionActivation(
      {
        restaurantId: RESTAURANT,
        operation: "EDIT",
        activationId: ACTIVATION,
        validFrom: "2026-10-06",
        validTo: "2026-10-18",
        bookingFrom: "2026-09-01",
        bookingTo: "2026-09-30",
        expectedVersion: "2026-09-01T10:00:00.000Z",
      },
      { master: promoMaster(), current: promoActivation(), existing: [], ...property },
    );
    assert.equal(edited.errors.length, 0);
    assert.ok(edited.changedFields.includes("validity"));
    assert.equal(edited.proposedActivation?.promoValue, 10);

    const deactivated = previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "DEACTIVATE", activationId: ACTIVATION, expectedVersion: "2026-09-01T10:00:00.000Z" },
      { master: promoMaster(), current: promoActivation(), existing: [], ...property },
    );
    assert.equal(deactivated.errors.length, 0);
    assert.equal(deactivated.proposedActivation?.active, false);
    assert.equal(deactivated.actionType, "promotion_activation_deactivated");
  });

  it("rejects wrong property, invalid dates, inactive master, and free_night", () => {
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30" },
      { master: promoMaster({ restaurantId: OTHER }), current: null, existing: [], ...property },
    ).errors.includes("PROMOTION_WRONG_PROPERTY"));
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-20", validTo: "2026-10-05", bookingFrom: "2026-09-01", bookingTo: "2026-09-30" },
      { master: promoMaster(), current: null, existing: [], ...property },
    ).errors.includes("COMMERCIAL_DATES_INVALID"));
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30" },
      { master: promoMaster({ active: false }), current: null, existing: [], ...property },
    ).errors.includes("PROMOTION_INACTIVE"));
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30" },
      { master: promoMaster({ promoKind: "free_night", promoValue: 1 }), current: null, existing: [], ...property },
    ).errors.includes("PROMOTION_KIND_UNSUPPORTED"));
  });

  it("allows room-scope subset and rejects broadening or wrong-property IDs", () => {
    const subset = previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30", roomTypeIds: [ROOM] },
      { master: promoMaster({ roomTypeIds: [ROOM, OTHER_ROOM] }), current: null, existing: [], ...property },
    );
    assert.equal(subset.errors.length, 0);
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30", roomTypeIds: [OTHER_ROOM] },
      { master: promoMaster({ roomTypeIds: [ROOM] }), current: null, existing: [], ...property },
    ).errors.includes("PROMOTION_SCOPE_BROADEN"));
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30", ratePlanIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] },
      { master: promoMaster({ roomTypeIds: [] }), current: null, existing: [], propertyRoomTypeIds: [ROOM], propertyRatePlanIds: [PLAN] },
    ).errors.includes("COMMERCIAL_SCOPE_WRONG_PROPERTY"));
    assert.ok(previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-09-01", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30" },
      { master: promoMaster(), current: null, existing: [], ...property },
    ).errors.includes("COMMERCIAL_MASTER_WINDOW_BROADEN"));
  });

  it("warns on overlap and blocks an exact duplicate", () => {
    const overlap = previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-10", validTo: "2026-10-25", bookingFrom: "2026-09-15", bookingTo: "2026-09-30", roomTypeIds: [ROOM] },
      { master: promoMaster(), current: null, existing: [promoActivation({ id: OTHER_ACT })], ...property },
    );
    assert.equal(overlap.errors.length, 0);
    assert.equal(overlap.warnings[0]?.code, "PROMOTION_ACTIVATION_OVERLAP");
    const duplicate = previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", promotionId: PROMOTION, validFrom: "2026-10-05", validTo: "2026-10-20", bookingFrom: "2026-09-01", bookingTo: "2026-09-30", roomTypeIds: [ROOM] },
      { master: promoMaster(), current: null, existing: [promoActivation({ id: OTHER_ACT })], ...property },
    );
    assert.ok(duplicate.errors.includes("PROMOTION_ACTIVATION_DUPLICATE"));
  });

  it("uses absent on create and current updated_at on edit", () => {
    const stale = previewPromotionActivation(
      { restaurantId: RESTAURANT, operation: "EDIT", activationId: ACTIVATION, expectedVersion: "stale" },
      { master: promoMaster(), current: promoActivation(), existing: [], ...property },
    );
    assert.ok(stale.errors.includes("COMMERCIAL_ACTIVATION_STALE"));
    assert.equal(commercialActivationVersionToken("2026-09-01T10:00:00.000Z"), "2026-09-01T10:00:00.000Z");
  });
});

describe("P5A-04 — package preview", () => {
  const property = { propertyRoomTypeIds: [ROOM, OTHER_ROOM], propertyRatePlanIds: [PLAN, OTHER_PLAN] };

  it("accepts create, edit, and deactivate", () => {
    const created = previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-05", validTo: "2026-10-20", roomTypeIds: [ROOM], ratePlanIds: [PLAN], expectedVersion: "absent" },
      { master: packageMaster(), current: null, existing: [], ...property },
    );
    assert.equal(created.errors.length, 0);
    assert.equal(created.proposedActivation?.chargeBasis, "per_stay");
    assert.equal(created.proposedActivation?.components[0]?.label, "Breakfast");
    assert.equal(packageActivationPreviewCanApply(created), true);

    const edited = previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "EDIT", activationId: ACTIVATION, validFrom: "2026-10-06", validTo: "2026-10-18", expectedVersion: "2026-09-01T10:00:00.000Z" },
      { master: packageMaster(), current: packageActivation(), existing: [], ...property },
    );
    assert.equal(edited.errors.length, 0);
    assert.equal(edited.proposedActivation?.packagePrice, 500);

    const deactivated = previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "DEACTIVATE", activationId: ACTIVATION, expectedVersion: "2026-09-01T10:00:00.000Z" },
      { master: packageMaster(), current: packageActivation(), existing: [], ...property },
    );
    assert.equal(deactivated.proposedActivation?.active, false);
  });

  it("rejects wrong property, invalid dates, broaden, unsupported charge basis, and exact duplicate", () => {
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-05", validTo: "2026-10-20" },
      { master: packageMaster({ restaurantId: OTHER }), current: null, existing: [], ...property },
    ).errors.includes("PACKAGE_WRONG_PROPERTY"));
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-20", validTo: "2026-10-05" },
      { master: packageMaster(), current: null, existing: [], ...property },
    ).errors.includes("COMMERCIAL_DATES_INVALID"));
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-05", validTo: "2026-10-20", roomTypeIds: [OTHER_ROOM] },
      { master: packageMaster({ roomTypeIds: [ROOM] }), current: null, existing: [], ...property },
    ).errors.includes("PACKAGE_SCOPE_BROADEN"));
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-05", validTo: "2026-10-20", ratePlanIds: [OTHER_PLAN] },
      { master: packageMaster({ ratePlanIds: [PLAN] }), current: null, existing: [], ...property },
    ).errors.includes("PACKAGE_SCOPE_BROADEN"));
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "EDIT", activationId: ACTIVATION, expectedVersion: "2026-09-01T10:00:00.000Z" },
      { master: packageMaster(), current: packageActivation({ chargeBasis: "per_night" as PackageActivation["chargeBasis"] }), existing: [], ...property },
    ).errors.includes("PACKAGE_CHARGE_BASIS_UNSUPPORTED"));
    assert.ok(previewPackageActivation(
      { restaurantId: RESTAURANT, operation: "CREATE", packageId: PACKAGE, validFrom: "2026-10-05", validTo: "2026-10-20", roomTypeIds: [ROOM], ratePlanIds: [PLAN] },
      { master: packageMaster(), current: null, existing: [packageActivation({ id: OTHER_ACT })], ...property },
    ).errors.includes("PACKAGE_ACTIVATION_DUPLICATE"));
  });
});

describe("P5A-04 — apply, history, snapshot, and reservation safety contracts", () => {
  const drizzle = readRel("../../../../../drizzle/migrations/0107_pms_commercial_activation_apply.sql");
  const supabase = readRel("../../../../../supabase/migrations/0107_pms_commercial_activation_apply.sql");
  const foundation = readRel("../../../../../drizzle/migrations/0104_pms_commercial_engine_foundation.sql");
  const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
  const promoFns = readRel("./commercial-promotion-activation.functions.ts");
  const packageFns = readRel("./commercial-package-activation.functions.ts");
  const historyFns = readRel("./commercial-history.functions.ts");
  const promoServer = readRel("./commercial-promotion-activation.server.ts");
  const packageServer = readRel("./commercial-package-activation.server.ts");

  it("keeps dual-lane 0107 SQL identical and adds apply RPCs without changing price_hotel_stay", () => {
    assert.equal(drizzle, supabase);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0106_pms_commercial_package_engine.sql"));
    assert.ok(migrations.includes("0107_pms_commercial_activation_apply.sql"));
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_promotion_activation/);
    assert.match(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_package_activation/);
    assert.match(supabase, /COMMERCIAL_ACTIVATION_STALE/);
    assert.match(supabase, /INSERT INTO public\.hotel_commercial_change_events/);
    assert.match(supabase, /'rate_revenue'/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /UPDATE public\.hotel_reservation_promotions|DELETE FROM public\.hotel_reservation_promotions/);
    assert.doesNotMatch(supabase, /UPDATE public\.hotel_reservation_packages|DELETE FROM public\.hotel_reservation_packages/);
    assert.doesNotMatch(supabase, /pending_approval|approved_by|publish_state|ota_|forecast|revpar|uplift/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(foundation, /RAISE EXCEPTION 'COMMERCIAL_CHANGE_EVENT_IMMUTABLE'/);
  });

  it("applies create/edit/deactivate atomically with Rate Manager wrappers", () => {
    assert.match(promoServer, /rpc\("apply_hotel_promotion_activation"/);
    assert.match(packageServer, /rpc\("apply_hotel_package_activation"/);
    assert.match(promoFns, /export const previewPromotionActivation/);
    assert.match(promoFns, /export const applyPromotionActivation/);
    assert.match(promoFns, /requireRateManager/);
    assert.match(packageFns, /export const previewPackageActivation/);
    assert.match(packageFns, /export const applyPackageActivation/);
    assert.match(packageFns, /requireRateManager/);
    assert.match(supabase, /FOR UPDATE/);
    assert.match(supabase, /promotion_activation_created/);
    assert.match(supabase, /package_activation_deactivated/);
    assert.match(supabase, /active = true/);
    assert.match(supabase, /SET active = false/);
  });

  it("keeps master snapshots and reservation attribution independent of later edits", () => {
    const snap = snapshotPromotionExecution({ code: "SPRING10", name: "Spring 10", promoKind: "percent", promoValue: 10, masterRoomTypeIds: [ROOM] });
    const pkg = snapshotPackageExecution({ code: "BB500", name: "Bed and breakfast", packagePrice: 500, components: [{ componentType: "meal_plan", componentId: "mp-1", label: "Breakfast", quantity: 1 }] });
    assert.equal(snap.promoValue, 10);
    assert.equal(pkg.packagePrice, 500);
    assert.match(supabase, /master.code, master.name, master.promo_kind, master.promo_value/);
    assert.match(supabase, /master.package_price/);
    assert.doesNotMatch(promoServer, /hotel_reservation_promotions/);
    assert.doesNotMatch(packageServer, /hotel_reservation_packages/);
    const inactive = evaluatePromotionEligibility({
      restaurantId: RESTAURANT,
      promotionActivationId: ACTIVATION,
      bookingBusinessDate: "2026-09-15",
      arrivalDate: "2026-10-10",
      departureDate: "2026-10-12",
      roomTypeId: ROOM,
      ratePlanId: PLAN,
      baseRoomSubtotal: 200,
    }, { activation: promoActivation({ active: false }), master: { id: PROMOTION, restaurantId: RESTAURANT, active: true } });
    assert.equal(inactive.reasonCode, "PROMOTION_INACTIVE");
    const pkgInactive = evaluatePackageEligibility({
      restaurantId: RESTAURANT,
      packageActivationId: ACTIVATION,
      arrivalDate: "2026-10-10",
      departureDate: "2026-10-12",
      roomTypeId: ROOM,
      ratePlanId: PLAN,
    }, { activation: packageActivation({ active: false }), master: { id: PACKAGE, restaurantId: RESTAURANT, active: true } });
    assert.equal(pkgInactive.reasonCode, "PACKAGE_INACTIVE");
  });

  it("lists commercial history with pagination, actor fallback, and immutability", () => {
    assert.deepEqual(COMMERCIAL_HISTORY_PAGE_SIZES, [10, 25, 50]);
    assert.equal(COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE, 25);
    assert.equal(commercialHistoryPageSize(25), 25);
    assert.equal(commercialHistoryPageSize(100), 100);
    assert.equal(commercialHistoryActorLabel({ actorName: null, actorMembershipId: "mem-1" }), "Staff");
    assert.equal(commercialHistoryActionLabel("promotion_activation_created"), "Promotion activation created");
    assert.deepEqual(
      commercialHistoryChangedFields(
        { active: true, validFrom: "2026-10-01", validTo: "2026-10-10", roomTypeIds: [], ratePlanIds: [] },
        { active: false, validFrom: "2026-10-01", validTo: "2026-10-10", roomTypeIds: [], ratePlanIds: [] },
      ),
      ["active"],
    );
    assert.deepEqual(commercialChangedFields(null, {
      active: true, validFrom: "2026-10-01", validTo: "2026-10-02", reason: null, roomTypeIds: [], ratePlanIds: [],
    }), []);
    assert.equal(COMMERCIAL_CHANGE_EVENT_IMMUTABLE, "COMMERCIAL_CHANGE_EVENT_IMMUTABLE");
    assert.match(historyFns, /export const listCommercialChangeHistory/);
    assert.match(historyFns, /export const getCommercialOperationDetail/);
    assert.match(historyFns, /requireRateManager/);
    assert.match(foundation, /BEFORE UPDATE OR DELETE ON public\.hotel_commercial_change_events/);
  });
});
