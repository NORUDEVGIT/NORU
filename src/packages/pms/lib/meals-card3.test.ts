import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_MEALS_AUDIT_SECTION,
  CARD3_MEALS_TABS,
  evaluateMealsCard3Readiness,
  type MealsCard3Snapshot,
} from "./meals-card3.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./meals-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./meals-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-meals.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<MealsCard3Snapshot>): MealsCard3Snapshot {
  return {
    currencyCode: "ETB",
    mealPlans: [],
    packages: [],
    components: [],
    roomTypes: [{ id: "rt1", code: "DLX", name: "Deluxe", active: true }],
    roomAmenities: [{ id: "ra1", code: "WIFI", name: "Wi-Fi", category: "general", active: true }],
    ratePlans: [{ id: "rp1", code: "BAR", name: "Best available", active: true }],
    foServices: [{ id: "fs1", name: "Airport transfer", active: true }],
    ...partial,
  };
}

const activeMeal = {
  id: "mp1",
  code: "BB",
  name: "Bed and breakfast",
  type: "breakfast" as const,
  typeLabel: "Breakfast",
  description: "Breakfast included",
  includesBreakfast: true,
  includesLunch: false,
  includesDinner: false,
  taxPosture: "inherit" as const,
  taxPostureLabel: "Inherit property tax",
  active: true,
};

const activePackage = {
  id: "pk1",
  code: "WEEKEND",
  name: "Weekend",
  type: "accommodation" as const,
  typeLabel: "Accommodation",
  description: "Weekend package",
  packagePrice: 2500,
  active: true,
  roomTypeIds: ["rt1"],
  ratePlanIds: [],
};

const validComponent = {
  id: "pc1",
  packageId: "pk1",
  kind: "meal_plan" as const,
  kindLabel: "Meal plan",
  mealPlanId: "mp1",
  roomAmenityId: null,
  foServiceId: null,
  sourceLabel: "Bed and breakfast",
  quantity: 1,
  sortOrder: 0,
};

describe("Card 3 Phase 4 meal plans and packages", () => {
  it("uses only not_started, in_progress, and complete for this domain", () => {
    const empty = evaluateMealsCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);

    const started = evaluateMealsCard3Readiness(snapshot({ mealPlans: [activeMeal] }));
    assert.equal(started.status, "in_progress");
    assert.equal(started.ready, false);

    const noApplicability = evaluateMealsCard3Readiness(
      snapshot({
        mealPlans: [activeMeal],
        packages: [{ ...activePackage, roomTypeIds: [] }],
        components: [validComponent],
      }),
    );
    assert.equal(noApplicability.status, "in_progress");

    const invalidComponent = evaluateMealsCard3Readiness(
      snapshot({
        mealPlans: [activeMeal],
        packages: [activePackage],
        components: [{ ...validComponent, mealPlanId: null, foServiceId: "foreign" }],
      }),
    );
    assert.equal(invalidComponent.status, "in_progress");

    const complete = evaluateMealsCard3Readiness(
      snapshot({
        mealPlans: [activeMeal],
        packages: [activePackage],
        components: [validComponent],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);
  });

  it("exposes exactly the four Phase 4 tabs and the isolated API files", () => {
    assert.deepEqual(
      CARD3_MEALS_TABS.map((tab) => tab.label),
      ["Overview", "Meal Plans", "Packages", "Package Components"],
    );
    assert.equal(existsSync(join(here, "meals-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "meals-card3.functions.ts")), true);
    assert.match(fns, /export const getMealsCard3/);
    assert.match(fns, /export const saveMealPlanCard3/);
    assert.match(fns, /export const savePackageCard3/);
    assert.match(fns, /export const savePackageComponentCard3/);
    assert.match(fns, /export const deletePackageComponentCard3/);
  });

  it("wires the Phase 4 workspace, inherited catalogues, editing, search, audit, and loading state", () => {
    assert.match(section, /getMealsCard3/);
    assert.match(section, /PmsPropertySetupCard3Meals/);
    assert.match(section, /domain\?\.id === "meal-plans-packages"/);
    assert.match(section, /currencyQuery\.isLoading/);
    assert.match(section, /mealsQuery\.isLoading/);
    assert.match(section, /currencyStatus/);
    assert.match(section, /taxesStatus/);
    assert.match(section, /ratesStatus/);
    assert.match(section, /mealsStatus/);
    assert.match(section, /paymentsStatus/);
    assert.match(section, /Loading configuration readiness/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_MEALS_TABS/);
    assert.match(ui, /onAuditHistory/);
    assert.match(ui, /Search meal plans/);
    assert.match(ui, /Search packages/);
    assert.match(ui, /Search package components/);
    assert.match(ui, /Room types are inherited from Card 2/);
    assert.match(ui, /Rate plans are inherited from Phase 3/);
    assert.match(ui, /no reservation or folio operational changes/);
    assert.match(ui, /saveMealPlanCard3/);
    assert.match(ui, /savePackageCard3/);
    assert.match(ui, /savePackageComponentCard3/);
    assert.match(ui, /deletePackageComponentCard3/);
    assert.match(ui, /Filter components by package/);
    assert.match(ui, /Package price \(\{currencyCode/);
    assert.match(ui, /focus-visible:ring-\[#C89933\]/);
  });

  it("requires member reads, manager writes, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.ok((fns.match(/requireRoomManager/g) ?? []).length >= 5);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.equal(CARD3_MEALS_AUDIT_SECTION, "card3-meals");
    assert.match(fns, /card3_meal_plan_saved/);
    assert.match(fns, /card3_package_saved/);
    assert.match(fns, /card3_package_component_saved/);
    assert.match(fns, /card3_package_component_deleted/);
    assert.match(fns, /42P01/);
    assert.match(fns, /42703/);
    assert.match(fns, /PGRST205/);
    assert.match(fns, /PGRST204/);
    assert.doesNotMatch(server, /\bany\b/);
    assert.doesNotMatch(server, /pmsDb/);
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("reads typed fields and inherited masters without writing legacy or operational data", () => {
    assert.match(fns, /includes_breakfast/);
    assert.match(fns, /includes_lunch/);
    assert.match(fns, /includes_dinner/);
    assert.match(fns, /package_price/);
    assert.match(fns, /from\("pms_package_room_types"\)/);
    assert.match(fns, /from\("pms_package_rate_plans"\)/);
    assert.match(fns, /from\("pms_package_components"\)/);
    assert.match(fns, /from\("room_types"\)/);
    assert.match(fns, /from\("room_amenities"\)/);
    assert.match(fns, /from\("hotel_rate_plans"\)/);
    assert.match(fns, /from\("fo_service_catalogue"\)/);
    assert.match(fns, /currency_code/);
    assert.doesNotMatch(fns, /\bincluded\s*:/);
    assert.doesNotMatch(fns, /\bchargeable\s*:/);
    assert.doesNotMatch(fns, /\binclusion\s*:/);
    assert.doesNotMatch(fns, /hotel_reservations|reservation_lines|folio_transactions/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme|reprice|quoteStay/);
    assert.doesNotMatch(fns, /from\("room_types"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("room_amenities"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("hotel_rate_plans"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("fo_service_catalogue"\)\.(?:insert|update|delete)/);
    assert.match(fns, /Package room types must belong to this property/);
    assert.match(fns, /Package rate plans must belong to this property/);
    assert.match(fns, /meal_plan_id: data\.kind === "meal_plan"/);
    assert.match(fns, /room_amenity_id: data\.kind === "room_amenity"/);
    assert.match(fns, /fo_service_id: data\.kind === "fo_service"/);
  });

  it("keeps the approved 0072 migration byte-identical and tenant-safe", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0072_pms_card3_meal_plans_packages.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0072_pms_card3_meal_plans_packages.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ALTER TABLE public\.pms_meal_plans/);
    assert.match(sql, /includes_breakfast boolean NOT NULL DEFAULT false/);
    assert.match(sql, /includes_lunch boolean NOT NULL DEFAULT false/);
    assert.match(sql, /includes_dinner boolean NOT NULL DEFAULT false/);
    assert.match(sql, /package_price numeric\(12,2\) NOT NULL DEFAULT 0/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_package_room_types/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_package_rate_plans/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_package_components/);
    assert.match(sql, /pms_package_components_source_check/);
    assert.match(sql, /component_kind IN \('meal_plan', 'room_amenity', 'fo_service'\)/);
    assert.match(sql, /FOREIGN KEY \(package_id, restaurant_id\)/);
    assert.match(sql, /FOREIGN KEY \(meal_plan_id, restaurant_id\)/);
    assert.match(sql, /FOREIGN KEY \(room_amenity_id, restaurant_id\)/);
    assert.match(sql, /FOREIGN KEY \(fo_service_id, restaurant_id\)/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_meal_plans/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_packages/);
    assert.doesNotMatch(sql, /\breservation_id\b|\bfolio_id\b/);
  });
});
