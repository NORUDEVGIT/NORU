import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMERCIAL_ABSENT_VERSION,
  COMMERCIAL_ACTION_TYPES,
  COMMERCIAL_CHANGE_EVENT_IMMUTABLE,
  COMMERCIAL_DEFAULT_PRIORITY,
  COMMERCIAL_ENTITY_TYPES,
  COMMERCIAL_NO_STACKING,
  COMMERCIAL_UNSUPPORTED_PROMO_KINDS,
  COMMERCIAL_V1_EXECUTABLE_PROMO_KINDS,
  COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
  commercialActivationVersionToken,
  comparePromotionPriority,
  emptyPromotionRatePlanScopeAllowsAll,
  emptyPromotionRoomTypeScopeInheritsMaster,
  isV1ExecutablePromoKind,
  packageAppliedAmount,
  roomSubtotalAfterPromotion,
  snapshotPackageExecution,
  snapshotPromotionExecution,
} from "./commercial-engine.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const drizzle = readRel("../../../../../drizzle/migrations/0104_pms_commercial_engine_foundation.sql");
const supabase = readRel("../../../../../supabase/migrations/0104_pms_commercial_engine_foundation.sql");
const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
const reservations = readRel("../../../../../drizzle/migrations/0013_create_hotel_reservations.sql");
const card3 = readRel("../../../../../drizzle/migrations/0076_pms_card3_revenue_commercial_rules.sql");
const packagesSql = readRel("../../../../../drizzle/migrations/0049_pms_set3_rates_guest_rules.sql");
const packageJoins = readRel("../../../../../drizzle/migrations/0072_pms_card3_meal_plans_packages.sql");
const domain = readRel("./commercial-engine.ts");

describe("P5A-01 — dual-lane migration structure", () => {
  it("keeps 0104 SQL identical across drizzle and supabase", () => {
    assert.equal(drizzle, supabase);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0103_pms_revenue_otb_snapshots.sql"));
    assert.ok(migrations.includes("0104_pms_commercial_engine_foundation.sql"));
  });

  it("creates promotion activations and scope mappings", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_promotion_activations/);
    assert.match(supabase, /CREATE TABLE public\.hotel_promotion_activation_room_types/);
    assert.match(supabase, /CREATE TABLE public\.hotel_promotion_activation_rate_plans/);
    assert.match(supabase, /promotion_code text NOT NULL/);
    assert.match(supabase, /promo_kind text NOT NULL/);
    assert.match(supabase, /promo_value numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /booking_from date NOT NULL/);
    assert.match(supabase, /booking_to date NOT NULL/);
    assert.match(supabase, /priority integer NOT NULL DEFAULT 100/);
    assert.match(supabase, /master_room_type_ids jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(supabase, /hotel_promotion_activation_room_types_unique UNIQUE \(activation_id, room_type_id\)/);
    assert.match(supabase, /hotel_promotion_activation_rate_plans_unique UNIQUE \(activation_id, rate_plan_id\)/);
    assert.match(supabase, /valid_to >= valid_from/);
    assert.match(supabase, /booking_to >= booking_from/);
    assert.match(supabase, /priority >= 0/);
    assert.match(supabase, /promo_kind IN \('percent', 'fixed', 'free_night'\)/);
    assert.match(supabase, /promo_value >= 0/);
    assert.doesNotMatch(supabase, /stacking_policy/);
    assert.doesNotMatch(supabase, /day_of_week|weekday|dow_/);
    assert.doesNotMatch(supabase, /source_id|channel_id|sales_channel/);
  });

  it("creates package activations and scope mappings", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_package_activations/);
    assert.match(supabase, /CREATE TABLE public\.hotel_package_activation_room_types/);
    assert.match(supabase, /CREATE TABLE public\.hotel_package_activation_rate_plans/);
    assert.match(supabase, /package_code text NOT NULL/);
    assert.match(supabase, /package_price numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /charge_basis text NOT NULL DEFAULT 'per_stay'/);
    assert.match(supabase, /components_snapshot jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(supabase, /charge_basis = 'per_stay'/);
    assert.match(supabase, /hotel_package_activation_room_types_unique UNIQUE \(activation_id, room_type_id\)/);
    assert.match(supabase, /hotel_package_activation_rate_plans_unique UNIQUE \(activation_id, rate_plan_id\)/);
    assert.doesNotMatch(supabase, /per_person|per_night|per_room|inclusive|rate_modifier/);
    assert.doesNotMatch(supabase, /CREATE TABLE public\.hotel_package_activations[\s\S]*booking_from/);
  });

  it("creates reservation attribution tables with V1 cardinality", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_reservation_promotions/);
    assert.match(supabase, /CREATE TABLE public\.hotel_reservation_packages/);
    assert.match(supabase, /hotel_reservation_promotions_reservation_unique UNIQUE \(reservation_id\)/);
    assert.match(supabase, /hotel_reservation_packages_reservation_activation_unique UNIQUE \(reservation_id, package_activation_id\)/);
    assert.match(supabase, /base_room_subtotal numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /discount_amount numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /room_subtotal_after_promotion numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /quantity integer NOT NULL DEFAULT 1/);
    assert.match(supabase, /unit_amount numeric\(12,2\) NOT NULL/);
    assert.match(supabase, /applied_amount numeric\(12,2\) NOT NULL/);
  });

  it("creates commercial history with operation grouping", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_commercial_change_events/);
    assert.match(supabase, /operation_id uuid NOT NULL/);
    assert.match(supabase, /entity_type text NOT NULL/);
    assert.match(supabase, /promotion_activation_created/);
    assert.match(supabase, /package_activation_scope_changed/);
    assert.match(supabase, /before_state jsonb/);
    assert.match(supabase, /after_state jsonb/);
    assert.doesNotMatch(supabase, /approval|publish_state|pending_approval/);
  });
});

describe("P5A-01 — immutability, tenant safety, and write policy", () => {
  it("rejects UPDATE and DELETE on commercial change events", () => {
    assert.match(supabase, /RAISE EXCEPTION 'COMMERCIAL_CHANGE_EVENT_IMMUTABLE'/);
    assert.equal(COMMERCIAL_CHANGE_EVENT_IMMUTABLE, "COMMERCIAL_CHANGE_EVENT_IMMUTABLE");
    assert.match(supabase, /BEFORE UPDATE OR DELETE ON public\.hotel_commercial_change_events/);
    assert.match(supabase, /prevent_hotel_commercial_change_event_mutation/);
  });

  it("keeps activations tenant-scoped and manager-read only", () => {
    assert.match(supabase, /GRANT SELECT ON public\.hotel_promotion_activations TO authenticated/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_package_activations TO authenticated/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_commercial_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_promotion_activations TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT UPDATE ON public\.hotel_promotion_activations TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT DELETE ON public\.hotel_promotion_activations TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_commercial_change_events TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_reservation_promotions TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_reservation_packages TO authenticated/);
    assert.match(supabase, /GRANT ALL ON public\.hotel_commercial_change_events TO service_role/);
    assert.match(supabase, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(supabase, /has_restaurant_role\(restaurant_id, 'manager'\)/);
    assert.doesNotMatch(supabase, /has_restaurant_role\(restaurant_id, 'accountant'\)/);
    assert.doesNotMatch(supabase, /has_restaurant_role\(restaurant_id, 'staff'\)/);
  });

  it("touches updated_at on activation edits", () => {
    assert.match(supabase, /CREATE TRIGGER set_hotel_promotion_activations_updated_at/);
    assert.match(supabase, /CREATE TRIGGER set_hotel_package_activations_updated_at/);
    assert.match(supabase, /EXECUTE FUNCTION public\.set_updated_at\(\)/);
  });
});

describe("P5A-01 — ownership, snapshots, and old reservations", () => {
  it("does not modify Property Setup masters", () => {
    assert.match(card3, /CREATE TABLE IF NOT EXISTS public\.pms_promotions/);
    assert.match(card3, /CREATE TABLE IF NOT EXISTS public\.pms_commercial_restrictions/);
    assert.match(packagesSql, /CREATE TABLE IF NOT EXISTS public\.pms_packages/);
    assert.match(packageJoins, /CREATE TABLE IF NOT EXISTS public\.pms_package_components/);
    assert.match(packageJoins, /CREATE TABLE IF NOT EXISTS public\.pms_package_room_types/);
    assert.match(packageJoins, /CREATE TABLE IF NOT EXISTS public\.pms_package_rate_plans/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_promotions/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_packages/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_package_components/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_commercial_restrictions/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_meal_plans/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_seasons/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.pms_corporate_agreements/);
  });

  it("does not add commercial requirements to hotel_reservations", () => {
    assert.doesNotMatch(supabase, /ALTER TABLE public\.hotel_reservations/);
    assert.doesNotMatch(reservations, /hotel_reservation_promotions|hotel_reservation_packages/);
    assert.doesNotMatch(reservations, /promotion_activation_id|package_activation_id/);
    assert.match(supabase, /Missing row on older reservations is valid/);
    assert.match(supabase, /no reservation attribution backfill/);
  });

  it("does not change 0016 pricing or create apply/quote RPCs", () => {
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.create_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.amend_hotel_reservation_priced/);
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.reprice_hotel_reservation/);
    assert.match(pricing, /nightly_rate_snapshot/);
    assert.match(pricing, /room_subtotal/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.quote_hotel_stay_commercial/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_promotion_activation/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.apply_hotel_package_activation/);
    assert.doesNotMatch(domain, /CREATE OR REPLACE FUNCTION public\.(apply_hotel_promotion_activation|quote_hotel_stay_commercial)/);
  });
});

describe("P5A-01 — domain types and V1 locks", () => {
  it("distinguishes master promo kinds from V1 executable kinds", () => {
    assert.deepEqual(COMMERCIAL_V1_EXECUTABLE_PROMO_KINDS, ["percent", "fixed"]);
    assert.deepEqual(COMMERCIAL_UNSUPPORTED_PROMO_KINDS, ["free_night"]);
    assert.equal(isV1ExecutablePromoKind("percent"), true);
    assert.equal(isV1ExecutablePromoKind("fixed"), true);
    assert.equal(isV1ExecutablePromoKind("free_night"), false);
    assert.match(domain, /export type CommercialPromoKind/);
    assert.match(domain, /export type CommercialExecutablePromoKind/);
    assert.match(domain, /export type PromotionActivation/);
    assert.match(domain, /export type PackageActivation/);
    assert.match(domain, /export type ReservationPromotionAttribution/);
    assert.match(domain, /export type ReservationPackageAttribution/);
    assert.match(domain, /export type CommercialChangeEvent/);
    assert.match(domain, /export type CommercialExpectedVersion/);
    assert.ok(COMMERCIAL_ENTITY_TYPES.includes("promotion_activation"));
    assert.ok(COMMERCIAL_ACTION_TYPES.includes("promotion_activation_created"));
  });

  it("snapshots promotion and package execution fields without inventing component prices", () => {
    const promo = snapshotPromotionExecution({
      code: "SPRING",
      name: "Spring stay",
      promoKind: "fixed",
      promoValue: 40,
      masterValidFrom: "2026-04-01",
      masterValidTo: "2026-04-30",
      masterRoomTypeIds: ["rt-1"],
    });
    assert.equal(promo.promotionCode, "SPRING");
    assert.equal(promo.promoKind, "fixed");
    assert.equal(promo.promoValue, 40);
    assert.deepEqual(promo.masterRoomTypeIds, ["rt-1"]);

    const pkg = snapshotPackageExecution({
      code: "BB",
      name: "Bed and breakfast",
      packageType: "accommodation",
      packagePrice: 25,
      components: [{ componentType: "meal_plan", componentId: "mp-1", label: "Breakfast", quantity: 1 }],
      masterRoomTypeIds: ["rt-1"],
      masterRatePlanIds: ["rp-1"],
    });
    assert.equal(pkg.chargeBasis, COMMERCIAL_V1_PACKAGE_CHARGE_BASIS);
    assert.equal(pkg.packagePrice, 25);
    assert.equal(pkg.components[0]?.componentType, "meal_plan");
    assert.equal("unitPrice" in pkg.components[0]!, false);
    assert.doesNotMatch(domain, /componentPrice|unitPrice|pricePerComponent/);
  });

  it("locks no stacking, empty-scope inherit, and priority order", () => {
    assert.equal(COMMERCIAL_NO_STACKING, true);
    assert.equal(COMMERCIAL_DEFAULT_PRIORITY, 100);
    assert.equal(emptyPromotionRoomTypeScopeInheritsMaster([]), true);
    assert.equal(emptyPromotionRoomTypeScopeInheritsMaster(["rt-1"]), false);
    assert.equal(emptyPromotionRatePlanScopeAllowsAll([]), true);
    assert.equal(emptyPromotionRatePlanScopeAllowsAll(["rp-1"]), false);
    assert.ok(comparePromotionPriority(
      { priority: 10, discountAmount: 5, createdAt: "2026-09-25T10:00:00.000Z" },
      { priority: 20, discountAmount: 50, createdAt: "2026-09-24T10:00:00.000Z" },
    ) < 0);
    assert.ok(comparePromotionPriority(
      { priority: 10, discountAmount: 50, createdAt: "2026-09-25T10:00:00.000Z" },
      { priority: 10, discountAmount: 20, createdAt: "2026-09-24T10:00:00.000Z" },
    ) < 0);
    assert.ok(comparePromotionPriority(
      { priority: 10, discountAmount: 20, createdAt: "2026-09-24T10:00:00.000Z" },
      { priority: 10, discountAmount: 20, createdAt: "2026-09-25T10:00:00.000Z" },
    ) < 0);
    assert.equal(commercialActivationVersionToken(null), COMMERCIAL_ABSENT_VERSION);
  });

  it("keeps promotion and package money outside the room snapshot", () => {
    assert.equal(roomSubtotalAfterPromotion(200, 40), 160);
    assert.equal(roomSubtotalAfterPromotion(20, 40), 0);
    assert.equal(packageAppliedAmount(25, 1), 25);
    assert.equal(packageAppliedAmount(12.5, 2), 25);
    assert.match(domain, /room_subtotal stays pre-commercial/);
    assert.match(domain, /packages are additive per_stay/);
  });
});
