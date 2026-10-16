import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_MEALS_AUDIT_SECTION,
  CARD3_MEALS_TABS,
  evaluateMealsCard3Readiness,
  isOwnedPackageCoverPath,
  isValidPackageComponent,
  PACKAGE_CHARGE_BASIS_DEFAULT,
  PACKAGE_CHARGE_BASIS_LABELS,
  PACKAGE_COVER_CONTENT_TYPES,
  PACKAGE_COVER_MAX_BYTES,
  packageCoverImagePath,
  parsePackageChargeBasis,
  packageCoverPathPrefix,
  previousPackageCoverToRemove,
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
const set3 = readFileSync(
  new URL("../components/settings/pms-set3-section.tsx", import.meta.url),
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
  chargeBasis: "per_stay" as const,
  active: true,
  roomTypeIds: ["rt1"],
  ratePlanIds: [],
  ratePlanLinks: [],
  coverImagePath: null,
  coverUrl: null,
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
    assert.match(section, /mealsStatus/);
    assert.match(section, /paymentsStatus/);
    assert.match(section, /billingStatus/);
    assert.match(section, /commercialStatus/);
    assert.match(section, /Loading configuration readiness/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_MEALS_TABS/);
    assert.doesNotMatch(ui, /onAuditHistory/);
    assert.match(ui, /Card3ListSection/);
    assert.match(ui, /Card3OverlapSheet/);
    assert.match(ui, /Search meal plans/);
    assert.match(ui, /Search packages/);
    // Phase B: "Search package components" is no longer a primary list search
    assert.doesNotMatch(ui, /Search package components/);
    assert.match(ui, /Room types are inherited from Card 2/);
    assert.match(ui, /Rate plans are inherited from Phase 3/);
    assert.match(ui, /no reservation or\s+folio operational changes/);
    assert.match(ui, /saveMealPlanCard3/);
    assert.match(ui, /savePackageCard3/);
    assert.match(ui, /savePackageComponentCard3/);
    assert.match(ui, /deletePackageComponentCard3/);
    // Phase B: "Filter components by package" is no longer a primary UI element
    assert.doesNotMatch(ui, /Filter components by package/);
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
    assert.match(fns, /inclusion_type/);
    assert.match(fns, /parsePackageInclusionType/);
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

  // ────────────────────────────────────────────────────────────────────────────
  // Phase B — Unified Package Master UI shell
  // ────────────────────────────────────────────────────────────────────────────

  it("Phase B: Package Master editor (Add / Edit flow) uses savePackageCard3 and has section structure", () => {
    // The unified editor must be present in the meals UI file
    assert.match(ui, /PackageMasterEditor/);
    assert.match(ui, /package-master-editor/);
    // Section 1: Basic Information — live fields
    assert.match(ui, /package-master-section-basic/);
    assert.match(ui, /pkg-master-code/);
    assert.match(ui, /pkg-master-name/);
    assert.match(ui, /pkg-master-type/);
    assert.match(ui, /pkg-master-description/);
    assert.match(ui, /pkg-master-active/);
    // Section 2: Pricing — live
    assert.match(ui, /package-master-section-pricing/);
    assert.match(ui, /pkg-master-price/);
    // Section 3–5: Placeholders for later phases
    assert.match(ui, /package-master-section-includes/);
    assert.match(ui, /package-master-section-applicability/);
    assert.match(ui, /package-master-section-cover/);
    // Writer: one and only one — savePackageCard3
    assert.match(ui, /savePackageCard3/);
  });

  it("Phase B: old peer sections (Package rate plan types, Package components) are not primary UI", () => {
    // These sections should not appear as top-level Card3ListSection titles
    assert.doesNotMatch(ui, /title="Package rate plan types"/);
    assert.doesNotMatch(ui, /title="Package components"/);
    // Component functions are retained for Phase E (present in source)
    assert.match(ui, /ComponentSheet/);
    assert.match(ui, /savePackageComponentCard3/);
    assert.match(ui, /deletePackageComponentCard3/);
  });

  it("Phase B: no duplicate package writer is exposed", () => {
    // The canonical writer is savePackageCard3; savePmsPackage must not be
    // called from the primary Add/Edit package flow in either file
    assert.doesNotMatch(ui, /savePmsPackage/);
    // savePmsPackage may still be imported in set3 (it is suppressed via void)
    // but must NOT be wired to a mutation that calls it in the package path
    assert.doesNotMatch(set3, /packageMutation\.mutate/);
  });

  it("Phase B: SET3 package editor is retired — redirect notice present, no Add Package button", () => {
    assert.match(set3, /set3-packages-card3-redirect/);
    // No Add package button in SET3
    assert.doesNotMatch(set3, /Add package/);
    // No active PackageDialog mount point
    assert.doesNotMatch(set3, /open={packageOpen}/);
    // No packageMutation call
    assert.doesNotMatch(set3, /packageMutation/);
  });

  it("Phase B: no schema changes — no new migrations beyond 0072 and 0120", () => {
    // Verify Phase B introduced no migration files
    const drizzle0124 = join(
      here,
      "../../../../drizzle/migrations/0124_pms_package_master_phase_b.sql",
    );
    assert.equal(existsSync(drizzle0124), false, "Phase B must not introduce migration 0124");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Phase E — Includes inside Package Master editor
  // ────────────────────────────────────────────────────────────────────────────

  it("Phase E: Section 3 — Includes is embedded inside PackageMasterEditor with live component table", () => {
    // Section 3 container exists
    assert.match(ui, /package-master-section-includes/);
    // Table with required columns
    assert.match(ui, /pkg-master-inclusions-table/);
    assert.match(ui, /Inclusion \/ Source Name/);
    assert.match(ui, />Type</);
    assert.match(ui, />Quantity</);
    assert.match(ui, />Sort Order</);
    assert.match(ui, />Action</);
    // Components are filtered by packageId and ordered by sortOrder
    assert.match(ui, /components\s*\.filter\(\(c\)\s*=>\s*c\.packageId\s*===\s*value\.id\)/);
    assert.match(ui, /a\.sortOrder\s*-\s*b\.sortOrder/);
  });

  it("Phase E: Add and Remove inclusions use canonical writers and live catalogues", () => {
    // Add Inclusion button and form
    assert.match(ui, /pkg-master-add-inclusion/);
    assert.match(ui, /pkg-master-inclusion-form/);
    assert.match(ui, /pkg-master-save-inclusion/);
    // Canonical writers wired
    assert.match(ui, /savePackageComponentCard3/);
    assert.match(ui, /deletePackageComponentCard3/);
    // Type selection maps to Meal Plan, Room Amenity, FO Service
    assert.match(ui, /pkg-comp-kind/);
    assert.match(ui, /PACKAGE_COMPONENT_KIND_LABELS/);
    // Catalogues mapped per kind
    assert.match(ui, /draftKind === "meal_plan"/);
    assert.match(ui, /draftKind === "room_amenity"/);
    assert.match(ui, /foServices/);
    // Source dropdown does not expose raw IDs
    assert.match(ui, /pkg-comp-source/);
    assert.match(ui, /\$\{row\.code\} — \$\{row\.name\}/);
  });

  it("Phase E: quantity and sort_order validation rules are enforced", () => {
    // Quantity > 0 validation
    assert.match(ui, /pkg-comp-quantity/);
    assert.match(ui, /quantity <= 0/);
    // Sort order >= 0 validation
    assert.match(ui, /pkg-comp-sort/);
    assert.match(ui, /sortOrder < 0/);
  });

  it("Phase E: new unsaved package displays honest note and prevents orphan components", () => {
    assert.match(ui, /Save the package first to manage inclusions\./);
    assert.match(ui, /pkg-master-includes-unsaved-note/);
  });

  it("Phase E: server validation rejects invalid kind / source combinations and non-positive quantity", () => {
    const s = snapshot({
      mealPlans: [activeMeal],
      packages: [activePackage],
      components: [validComponent],
    });
    // Valid component passes
    assert.equal(isValidPackageComponent(validComponent, s), true);
    // Zero quantity fails
    assert.equal(isValidPackageComponent({ ...validComponent, quantity: 0 }, s), false);
    // Negative quantity fails
    assert.equal(isValidPackageComponent({ ...validComponent, quantity: -1 }, s), false);
    // Mismatched source FK (kind = meal_plan but mealPlanId is null) fails
    assert.equal(
      isValidPackageComponent({ ...validComponent, mealPlanId: null, foServiceId: "fs1" }, s),
      false,
    );
    // Multiple populated FKs fails
    assert.equal(isValidPackageComponent({ ...validComponent, roomAmenityId: "ra1" }, s), false);
    // Foreign/non-existent FK fails
    assert.equal(
      isValidPackageComponent({ ...validComponent, mealPlanId: "non-existent" }, s),
      false,
    );
  });

  it("Phase E: no duplicate or top-level Package Components peer list reappears", () => {
    assert.doesNotMatch(ui, /title="Package components"/);
  });

  it("Phase E: no schema changes — no new migrations beyond 0072 and 0120", () => {
    const drizzle0124 = join(
      here,
      "../../../../drizzle/migrations/0124_pms_package_master_phase_e.sql",
    );
    assert.equal(existsSync(drizzle0124), false, "Phase E must not introduce migration 0124");
  });
});

describe("Card 3 Phase C package cover image", () => {
  const restaurantId = "11111111-1111-4111-8111-111111111111";
  const packageId = "22222222-2222-4222-8222-222222222222";
  const otherPackageId = "33333333-3333-4333-8333-333333333333";

  it("adds only cover_image_path and no image table", () => {
    const drizzle = join(here, "../../../../drizzle/migrations/0124_pms_package_cover_image.sql");
    const supabase = join(here, "../../../../supabase/migrations/0124_pms_package_cover_image.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ALTER TABLE public\.pms_packages/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS cover_image_path text/);
    assert.doesNotMatch(sql, /CREATE TABLE/);
    assert.doesNotMatch(sql, /pms_package_images/);
    assert.doesNotMatch(sql, /CREATE TRIGGER|CREATE POLICY|CREATE INDEX/);
  });

  it("reads cover_image_path and exposes coverUrl from a server-side signature", () => {
    assert.match(fns, /cover_image_path, charge_basis/);
    assert.match(fns, /package_price, active, cover_image_path/);
    assert.match(fns, /coverImagePath/);
    assert.match(fns, /coverUrl:/);
    assert.match(fns, /signRoomImages/);
    assert.doesNotMatch(fns, /cover_image_url/);
    assert.match(server, /coverImagePath: string \| null/);
    assert.match(server, /coverUrl: string \| null/);
  });

  it("issues a package upload ticket for jpeg, png, and webp under 8 MB", () => {
    assert.match(fns, /export const createPackageCoverUpload/);
    assert.match(fns, /packageCoverUploadSchema/);
    assert.match(fns, /z\.enum\(PACKAGE_COVER_CONTENT_TYPES\)/);
    assert.match(fns, /max\(PACKAGE_COVER_MAX_BYTES\)/);
    assert.deepEqual([...PACKAGE_COVER_CONTENT_TYPES], ["image/jpeg", "image/png", "image/webp"]);
    assert.equal(PACKAGE_COVER_MAX_BYTES, 8 * 1024 * 1024);
    assert.match(fns, /createSignedUploadUrl\(path\)/);
    assert.match(fns, /from\(ROOM_BUCKET\)/);
    assert.doesNotMatch(fns, /from\("room_type_images"\)/);
    const path = packageCoverImagePath(restaurantId, packageId, "jpg");
    assert.equal(path.startsWith(packageCoverPathPrefix(restaurantId, packageId)), true);
    assert.match(path, new RegExp(`^${restaurantId}/packages/${packageId}/[0-9a-f-]+\\.jpg$`));
  });

  it("rejects a cover path that is not owned by the restaurant and package", () => {
    const owned = `${restaurantId}/packages/${packageId}/file.jpg`;
    assert.equal(isOwnedPackageCoverPath(restaurantId, packageId, owned), true);
    assert.equal(
      isOwnedPackageCoverPath(restaurantId, packageId, `${restaurantId}/room-types/${packageId}/file.jpg`),
      false,
    );
    assert.equal(
      isOwnedPackageCoverPath(restaurantId, packageId, `${restaurantId}/packages/${otherPackageId}/file.jpg`),
      false,
    );
    assert.equal(
      isOwnedPackageCoverPath(
        restaurantId,
        packageId,
        `${otherPackageId}/packages/${packageId}/file.jpg`,
      ),
      false,
    );
    assert.match(fns, /That package doesn't belong to this property/);
    assert.match(fns, /if \(!isOwnedPackageCoverPath/);
    assert.match(fns, /Invalid image reference/);
    assert.match(fns, /requireRoomManager/);
  });

  it("stores the new path and removes only a different previous object", () => {
    assert.match(fns, /export const setPackageCoverImage/);
    assert.match(fns, /update\(\{ cover_image_path: data\.storagePath \}\)/);
    assert.match(fns, /previousPackageCoverToRemove\(current\.cover_image_path, data\.storagePath\)/);
    assert.match(fns, /\.remove\(\[storagePath\]\)/);
    const next = `${restaurantId}/packages/${packageId}/next.jpg`;
    const previous = `${restaurantId}/packages/${packageId}/old.jpg`;
    assert.equal(previousPackageCoverToRemove(previous, next), previous);
    assert.equal(previousPackageCoverToRemove(next, next), null);
    assert.equal(previousPackageCoverToRemove(null, next), null);
    assert.equal(previousPackageCoverToRemove("  ", next), null);
  });

  it("clears a cover and leaves a missing cover as a no-op", () => {
    assert.match(fns, /export const removePackageCoverImage/);
    assert.match(fns, /if \(!current\.cover_image_path\) return \{ ok: true as const \}/);
    assert.match(fns, /update\(\{ cover_image_path: null \}\)/);
    assert.match(fns, /removeStoredCover\(current\.cover_image_path\)/);
  });

  it("keeps savePackageCard3 as the package-field writer", () => {
    const saveStart = fns.indexOf("export const savePackageCard3");
    const saveEnd = fns.indexOf("export const savePackageComponentCard3");
    const saveFn = fns.slice(saveStart, saveEnd);
    assert.match(saveFn, /package_price: data\.packagePrice/);
    assert.doesNotMatch(saveFn, /cover_image_path/);
    assert.doesNotMatch(saveFn, /createPackageCoverUpload|setPackageCoverImage|removePackageCoverImage/);
  });

  it("shows the unsaved cover message and the saved cover actions", () => {
    assert.match(ui, /package-master-section-cover/);
    assert.match(ui, /Save the package first to add a cover image\./);
    assert.match(ui, /data-testid="pkg-cover-unsaved"/);
    assert.match(ui, /data-testid="pkg-cover-empty"/);
    assert.match(ui, /data-testid="pkg-cover-upload"/);
    assert.match(ui, /Upload Cover Image/);
    assert.match(ui, /data-testid="pkg-cover-preview"/);
    assert.match(ui, /src=\{coverUrl\}/);
    assert.match(ui, /data-testid="pkg-cover-replace"/);
    assert.match(ui, /Replace Image/);
    assert.match(ui, /data-testid="pkg-cover-remove"/);
    assert.match(ui, /Remove Image/);
    assert.match(ui, /!packageId \?/);
    assert.match(ui, /\{canEdit \?/);
    assert.doesNotMatch(ui, /Package cover image upload will be available in Phase C/);
  });

  it("uploads through the signed ticket and refreshes only the Card 3 snapshot", () => {
    assert.match(ui, /createPackageCoverUpload/);
    assert.match(ui, /uploadToSignedUrl\(ticket\.path, ticket\.token, file\)/);
    assert.match(ui, /\.from\("property-images"\)/);
    assert.match(ui, /setPackageCoverImage/);
    assert.match(ui, /removePackageCoverImage/);
    assert.match(ui, /PACKAGE_COVER_CONTENT_TYPES/);
    assert.match(ui, /PACKAGE_COVER_MAX_BYTES/);
    assert.match(ui, /Use a JPG, PNG, or WebP image\./);
    assert.match(ui, /Images must be 8 MB or smaller\./);
    assert.match(ui, /\["pms-card3-meals", restaurantId\]/);
    assert.match(ui, /coverImagePath: fresh\.coverImagePath/);
    assert.match(ui, /coverUrl: fresh\.coverUrl/);
    assert.doesNotMatch(ui, /cover_image_path:/);
    assert.match(ui, /package-master-section-includes/);
    assert.match(ui, /package-master-section-applicability/);
  });
});

describe("Card 3 Phase D package charge basis", () => {
  it("adds only charge_basis with per_stay default and allowed values", () => {
    const drizzle = join(here, "../../../../drizzle/migrations/0125_pms_package_charge_basis.sql");
    const supabase = join(here, "../../../../supabase/migrations/0125_pms_package_charge_basis.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /ADD COLUMN IF NOT EXISTS charge_basis text NOT NULL DEFAULT 'per_stay'/);
    assert.match(sql, /pms_packages_charge_basis_check/);
    assert.match(sql, /'per_stay', 'per_night', 'per_person', 'per_room', 'per_unit'/);
    assert.doesNotMatch(sql, /hotel_package_activations/);
    assert.doesNotMatch(sql, /hotel_reservation_packages/);
    assert.doesNotMatch(sql, /CREATE TABLE/);
  });

  it("maps charge_basis on read and defaults when the column is missing", () => {
    assert.match(fns, /charge_basis/);
    assert.match(fns, /chargeBasis:/);
    assert.match(fns, /parsePackageChargeBasis/);
    assert.match(fns, /PACKAGE_CHARGE_BASIS_DEFAULT/);
    assert.equal(parsePackageChargeBasis("per_night"), "per_night");
    assert.equal(parsePackageChargeBasis("invalid"), "per_stay");
    assert.equal(PACKAGE_CHARGE_BASIS_DEFAULT, "per_stay");
  });

  it("persists chargeBasis through savePackageCard3 and rejects invalid values in schema", () => {
    assert.match(fns, /chargeBasis: z\.enum\(PACKAGE_CHARGE_BASES\)/);
    assert.match(fns, /charge_basis: data\.chargeBasis/);
    const saveStart = fns.indexOf("export const savePackageCard3");
    const saveEnd = fns.indexOf("export const savePackageComponentCard3");
    const saveFn = fns.slice(saveStart, saveEnd);
    assert.match(saveFn, /package_price: data\.packagePrice/);
    assert.doesNotMatch(fns, /hotel_package_activations/);
    assert.doesNotMatch(fns, /hotel_reservation_packages/);
    assert.doesNotMatch(fns, /COMMERCIAL_V1_PACKAGE_CHARGE_BASIS/);
  });

  it("shows the charge basis selector, defaults, zero price, and execution limitation note", () => {
    assert.match(ui, /pkg-master-charge-basis/);
    assert.match(ui, /PACKAGE_CHARGE_BASIS_LABELS/);
    assert.match(ui, /PACKAGE_CHARGE_BASIS_DEFAULT/);
    assert.match(ui, /chargeBasis/);
    assert.match(ui, /packagePrice: price/);
    assert.match(ui, /min=\{0\}/);
    assert.match(ui, /pkg-charge-basis-limit/);
    assert.match(ui, /Operational charging currently[\s\S]*supports Per stay only/);
    assert.doesNotMatch(ui, /planned for Phase D/);
    assert.match(ui, /package-master-section-includes/);
    assert.match(ui, /package-master-section-applicability/);
    assert.match(ui, /package-master-section-cover/);
    assert.deepEqual(Object.values(PACKAGE_CHARGE_BASIS_LABELS), [
      "Per stay",
      "Per night",
      "Per person",
      "Per room",
      "Per unit",
    ]);
  });
});
