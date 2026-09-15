import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_LOCKED_NON_GOALS,
  CREATE_RESERVATION_MODULE_DONE,
  CREATE_RESERVATION_PHASE1_COMPLETE,
} from "./create-reservation-phase1.ts";
import { canSubmitCreateReservation } from "./create-reservation-phase1-section5.ts";
import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION8,
  CREATE_RESERVATION_PACKAGES_BIND,
  CREATE_RESERVATION_PACKAGES_BOX,
  CREATE_RESERVATION_PACKAGES_CHECKING,
  CREATE_RESERVATION_PACKAGES_CREATE_ALLOWED,
  CREATE_RESERVATION_PACKAGES_DETECT_API,
  CREATE_RESERVATION_PACKAGES_ERROR,
  CREATE_RESERVATION_PACKAGES_GATE_BADGE,
  CREATE_RESERVATION_PACKAGES_NOT_ATTACHED,
  CREATE_RESERVATION_PACKAGES_SET3_EMPTY_COPY,
  CREATE_RESERVATION_PACKAGES_SET3_SCHEMA_COPY,
  CREATE_RESERVATION_PACKAGES_SETTINGS_HREF,
  CREATE_RESERVATION_PACKAGES_SETTINGS_LINK,
  CREATE_RESERVATION_PACKAGES_SETTINGS_LINK_RULE,
  CREATE_RESERVATION_PACKAGES_STICKY,
  CREATE_RESERVATION_SECTION8_DETECT_DOC,
  CREATE_RESERVATION_SECTION8_FLAG_ABEL,
  CREATE_RESERVATION_SECTION8_ISSUE,
  CREATE_RESERVATION_SECTION8_LOCKED_NON_GOALS,
  CREATE_RESERVATION_SECTION8_MIGRATION,
  CREATE_RESERVATION_SECTION8_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION8_PARALLEL_OK,
  CREATE_RESERVATION_SECTION8_PERMISSION_DOC,
  CREATE_RESERVATION_SECTION8_PROGRAMME_RULE,
  CREATE_RESERVATION_SECTION8_SCOPE,
  CREATE_RESERVATION_SECTION8_TIP_AC_MAP,
  CREATE_RESERVATION_STICKY_PACKAGES,
  activePackageCountFromRows,
  canShowPackagesSettingsLink,
  detectCreatePackagesCatalog,
  packagesGateCopy,
  resolveCreatePackagesGateView,
  stickyPackagesCopy,
} from "./create-reservation-phase1-section8.ts";
import { SET3_PACKAGES_WARNING, SET3_RATES_UNAVAILABLE } from "./pms-set3-rates-guest.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR8 = Array.from({ length: 22 }, (_, i) => `AC-CR8-${i + 1}`);

describe("Create Reservation Phase 1 Section 8 lock — AC-CR8-1…22", () => {
  it("locks AC-CR8-1…22 (Spec #149 / issue #151)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION8], CR8);
    assert.equal(CREATE_RESERVATION_SECTION8_ISSUE, 151);
    assert.deepEqual(CREATE_RESERVATION_SECTION8_TIP_AC_MAP["plan-detect-gate-box"], [
      "AC-CR8-1",
      "AC-CR8-2",
      "AC-CR8-3",
      "AC-CR8-4",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION8_TIP_AC_MAP["plan-bind-sticky-quote"], [
      "AC-CR8-5",
      "AC-CR8-6",
      "AC-CR8-7",
      "AC-CR8-8",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION8_TIP_AC_MAP["plan-permissions-closed"], [
      "AC-CR8-9",
      "AC-CR8-10",
      "AC-CR8-11",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION8_TIP_AC_MAP["plan-out-gates"], [
      "AC-CR8-12",
      "AC-CR8-13",
      "AC-CR8-14",
      "AC-CR8-15",
      "AC-CR8-16",
      "AC-CR8-17",
      "AC-CR8-18",
      "AC-CR8-19",
      "AC-CR8-20",
      "AC-CR8-21",
      "AC-CR8-22",
    ]);
    assert.equal(CREATE_RESERVATION_PACKAGES_BOX, "visible-gated");
    assert.equal(CREATE_RESERVATION_PACKAGES_DETECT_API, "getPmsSet3Snapshot");
    assert.equal(CREATE_RESERVATION_PACKAGES_SETTINGS_LINK_RULE, "set3-editors-only");
    assert.equal(CREATE_RESERVATION_PACKAGES_BIND, "out");
    assert.equal(CREATE_RESERVATION_PACKAGES_STICKY, "not-attached-not-in-quote");
  });

  it("AC-CR8-1 Catalog detect: schema missing vs empty vs active-not-attached via SET3 snapshot", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const set3Fns = readRel("./pms-set3-rates-guest.functions.ts");
    assert.match(page, /getPmsSet3Snapshot/);
    assert.match(page, /\["pms-set3-snapshot", restaurantId, "create-reservation-packages"\]/);
    assert.doesNotMatch(page, /list_packages_for_stay|listCreatePackages|getPackagesCatalog/);
    assert.match(set3Fns, /export const getPmsSet3Snapshot/);
    assert.match(set3Fns, /from\("pms_packages"\)/);
    assert.match(set3Fns, /packagesAvailable = false/);
    assert.match(set3Fns, /packagesAvailable = true/);
    assert.match(CREATE_RESERVATION_SECTION8_DETECT_DOC, /getPmsSet3Snapshot/);
    assert.match(CREATE_RESERVATION_SECTION8_DETECT_DOC, /packagesAvailable \+ active count/);
    assert.equal(detectCreatePackagesCatalog({ packagesAvailable: false, activePackageCount: 0 }), "schema_missing");
    assert.equal(detectCreatePackagesCatalog({ packagesAvailable: false, activePackageCount: 4 }), "schema_missing");
    assert.equal(detectCreatePackagesCatalog({ packagesAvailable: true, activePackageCount: 0 }), "empty");
    assert.equal(detectCreatePackagesCatalog({ packagesAvailable: true, activePackageCount: 2 }), "active_not_attached");
    assert.equal(activePackageCountFromRows([{ active: true }, { active: false }, { active: true }]), 2);
    assert.equal(activePackageCountFromRows([]), 0);
    assert.match(gate, /data-packages-detect=\{detectKind\}/);
    assert.match(page, /activePackageCountFromRows\(set3Query\.data\?\.snapshot\.packages \?\? \[\]\)/);
    assert.match(page, /packagesAvailable=\{set3Query\.data\?\.snapshot\.packagesAvailable \?\? false\}/);
  });

  it("AC-CR8-2 Locked finding: Setup catalogue EXISTS; create bind + quoteStay package lines DO NOT", () => {
    const helpers = readRel("./create-reservation-phase1-section8.ts");
    const functions = readRel("./reservations.functions.ts");
    const rates = readRel("./rates.functions.ts");
    const ratesServer = readRel("./rates.server.ts");
    const types = readRel("../../../integrations/supabase/types.ts");
    const set3Sql = readRel("../../../../drizzle/migrations/0049_pms_set3_rates_guest_rules.sql");
    const set3Ui = readRel("../components/settings/pms-set3-section.tsx");
    assert.match(helpers, /Setup `pms_packages`\s+catalogue EXISTS/);
    assert.match(helpers, /Create bind \+ `quoteStay` package lines DO NOT/);
    assert.match(set3Sql, /CREATE TABLE IF NOT EXISTS public\.pms_packages/);
    assert.match(set3Ui, /Set3RatesSection/);
    assert.match(set3Ui, />Packages</);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.doesNotMatch(createFn, /packageId|_package_id/);
    const quoteStart = rates.indexOf("export const quoteStay");
    const quoteFn = rates.slice(quoteStart, rates.indexOf("export const repriceReservation"));
    assert.doesNotMatch(quoteFn, /packageId|_package_id|pms_packages/);
    assert.match(ratesServer, /export interface StayQuote/);
    const stayQuote = ratesServer.slice(
      ratesServer.indexOf("export interface StayQuote"),
      ratesServer.indexOf("type PricingJson"),
    );
    assert.doesNotMatch(stayQuote, /package/);
    const reservationStart = types.indexOf("      hotel_reservations: {");
    const reservationRowStart = types.indexOf("Row: {", reservationStart);
    const reservationRow = types.slice(reservationRowStart, types.indexOf("Insert: {", reservationRowStart));
    assert.doesNotMatch(reservationRow, /package_id|meal_plan_id/);
    const pricedStart = types.indexOf("      create_hotel_reservation_priced: {");
    const pricedArgs = types.slice(pricedStart, types.indexOf("Returns: {", pricedStart));
    assert.doesNotMatch(pricedArgs, /_package_id|_package/);
  });

  it("AC-CR8-3 GATE list/select: no selectable attach; no FO extras / meal plans / sample rows as packages", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    assert.match(page, /CreateReservationPackages/);
    assert.match(gate, /data-testid="create-reservation-packages-gate"/);
    assert.doesNotMatch(gate, /type="checkbox"|role="checkbox"|onSelect|multi-pick|quantity/);
    assert.doesNotMatch(page, /packagePicker|addPackage/);
    assert.doesNotMatch(gate, /packagePicker|addPackage/);
    assert.doesNotMatch(page, /fo_service_catalogue|loadServiceCatalogue/);
    assert.doesNotMatch(gate, /fo_service_catalogue|loadServiceCatalogue|pms_meal_plans|mealPlans/);
    assert.doesNotMatch(gate, /samplePackage|hardcodedPackage|demo package/i);
    assert.doesNotMatch(page, /savePmsPackage/);
  });

  it("AC-CR8-4 No fake packages: honest copy for missing / empty / not-attached; create still allowed", () => {
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    assert.equal(CREATE_RESERVATION_PACKAGES_SET3_SCHEMA_COPY, SET3_RATES_UNAVAILABLE);
    assert.equal(CREATE_RESERVATION_PACKAGES_SET3_EMPTY_COPY, SET3_PACKAGES_WARNING);
    assert.match(CREATE_RESERVATION_PACKAGES_NOT_ATTACHED, /not attached on create/);
    assert.match(CREATE_RESERVATION_PACKAGES_NOT_ATTACHED, /not in this quote/);
    assert.match(CREATE_RESERVATION_PACKAGES_CREATE_ALLOWED, /without a package/);
    assert.equal(
      packagesGateCopy({ kind: "schema_missing", activeCount: 0 }).includes(SET3_RATES_UNAVAILABLE),
      true,
    );
    assert.equal(
      packagesGateCopy({ kind: "empty", activeCount: 0 }).includes(SET3_PACKAGES_WARNING),
      true,
    );
    assert.equal(packagesGateCopy({ kind: "active_not_attached", activeCount: 3 }), CREATE_RESERVATION_PACKAGES_NOT_ATTACHED);
    assert.equal(packagesGateCopy({ kind: "loading" }), CREATE_RESERVATION_PACKAGES_CHECKING);
    assert.equal(packagesGateCopy({ kind: "error" }), CREATE_RESERVATION_PACKAGES_ERROR);
    assert.match(gate, /packagesGateCopy\(view\)/);
    assert.equal(CREATE_RESERVATION_PACKAGES_GATE_BADGE, "Not attached");
    assert.doesNotMatch(gate, /0\.00|£0|package total/i);
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 2,
        status: "pending",
        priced: true,
        canCreateUnpriced: false,
      }),
      true,
    );
  });

  it("AC-CR8-5 Bind GATE: no package arg, no column, no notes smuggling", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const types = readRel("../../../integrations/supabase/types.ts");
    assert.equal(CREATE_RESERVATION_PACKAGES_BIND, "out");
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.doesNotMatch(createFn, /packageId|_package_id|package_id/);
    assert.match(page, /createReservation/);
    const payloadStart = page.indexOf("submitReservation({");
    const payload = page.slice(payloadStart, page.indexOf("}),", payloadStart) + 2);
    assert.doesNotMatch(payload, /packageId|package_id|_package/);
    assert.match(payload, /specialRequests: specialRequests\.trim\(\) \|\| null/);
    assert.match(payload, /notes: notes\.trim\(\) \|\| null/);
    assert.doesNotMatch(page, /notes:.*package|specialRequests:.*package/i);
    const reservationStart = types.indexOf("      hotel_reservations: {");
    const reservationRowStart = types.indexOf("Row: {", reservationStart);
    const reservationRow = types.slice(reservationRowStart, types.indexOf("Insert: {", reservationRowStart));
    assert.doesNotMatch(reservationRow, /package_id/);
    assert.doesNotMatch(functions, /insert\("reservation_packages"\)|pms_reservation_packages/);
  });

  it("AC-CR8-6 Sticky honesty: Section 5 room quote remains; no invented package 0.00", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const ratesServer = readRel("./rates.server.ts");
    assert.equal(stickyPackagesCopy(), CREATE_RESERVATION_STICKY_PACKAGES);
    assert.match(CREATE_RESERVATION_STICKY_PACKAGES, /not attached on create/);
    assert.match(CREATE_RESERVATION_STICKY_PACKAGES, /not in this quote/);
    assert.doesNotMatch(CREATE_RESERVATION_STICKY_PACKAGES, /0\.00|£0|subtotal/);
    assert.match(page, /data-testid="summary-packages"/);
    assert.match(page, /data-testid="summary-packages-honesty"/);
    assert.match(page, /stickyPackagesCopy\(\)/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /money\(pricingState\.quote\.subtotal\)/);
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /stickyRoomAssignmentLabel\(/);
    const stayQuote = ratesServer.slice(
      ratesServer.indexOf("export interface StayQuote"),
      ratesServer.indexOf("type PricingJson"),
    );
    assert.doesNotMatch(stayQuote, /package/);
    assert.doesNotMatch(page, /packageSubtotal|packageTotal|inventedPackage/);
  });

  it("AC-CR8-7 Quote unchanged: quoteStay / price_hotel_stay stay room-plan + dates", () => {
    const rates = readRel("./rates.functions.ts");
    const types = readRel("../../../integrations/supabase/types.ts");
    const quoteStart = rates.indexOf("export const quoteStay");
    const quoteFn = rates.slice(quoteStart, rates.indexOf("export const repriceReservation"));
    assert.match(quoteFn, /price_hotel_stay/);
    assert.match(quoteFn, /_restaurant_id: data\.restaurantId/);
    assert.match(quoteFn, /_rate_plan_id: plan\.id/);
    assert.match(quoteFn, /_room_type_id: data\.roomTypeId/);
    assert.match(quoteFn, /_arrival: data\.arrival/);
    assert.match(quoteFn, /_departure: data\.departure/);
    assert.doesNotMatch(quoteFn, /_package_id|packageId|pms_packages/);
    const priceStart = types.indexOf("      price_hotel_stay: {");
    const priceArgs = types.slice(priceStart, types.indexOf("Returns:", priceStart));
    assert.match(priceArgs, /_arrival/);
    assert.match(priceArgs, /_departure/);
    assert.match(priceArgs, /_rate_plan_id/);
    assert.match(priceArgs, /_room_type_id/);
    assert.doesNotMatch(priceArgs, /_package/);
  });

  it("AC-CR8-8 No second writer; walk-in remains createReservation", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    assert.match(page, /createReservation/);
    assert.doesNotMatch(page, /createPackageReservation|attachPackageAfterCreate|savePmsPackage/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.doesNotMatch(createFn, /pms_packages|attach_package/);
    assert.match(dialogs, /createReservation/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
  });

  it("AC-CR8-9 Existing permission gates preserved; Settings link SET3 editors only", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const functions = readRel("./reservations.functions.ts");
    const set3Fns = readRel("./pms-set3-rates-guest.functions.ts");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(functions, /requireReservationManager/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /await requireReservationManager/);
    assert.match(set3Fns, /canEdit: canEditSet1\(me\.role\)/);
    assert.match(page, /canEditSet3=\{set3Query\.data\?\.canEdit \?\? false\}/);
    assert.match(gate, /canShowPackagesSettingsLink\(canEditSet3\)/);
    assert.equal(canShowPackagesSettingsLink(true), true);
    assert.equal(canShowPackagesSettingsLink(false), false);
    assert.equal(CREATE_RESERVATION_PACKAGES_SETTINGS_LINK_RULE, "set3-editors-only");
    assert.equal(CREATE_RESERVATION_PACKAGES_SETTINGS_HREF, "/restaurant/settings#rates");
    assert.match(gate, /CREATE_RESERVATION_PACKAGES_SETTINGS_HREF/);
    assert.match(CREATE_RESERVATION_SECTION8_PERMISSION_DOC, /canEditSet1/);
    assert.match(CREATE_RESERVATION_SECTION8_PERMISSION_DOC, /Receptionist/);
    assert.match(CREATE_RESERVATION_SECTION8_PERMISSION_DOC, /no RLS/);
    assert.doesNotMatch(page, /new entitlement|requirePackage\("create-reservation"\)/);
  });

  it("AC-CR8-10 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1-section8.ts");
    const section1 = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(section1, /Waves 1–5 \+ GE1–GE3 stay closed/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR8-11 Section 8 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(CREATE_RESERVATION_SECTION8_SCOPE, /does not claim Phase 1/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
    assert.match(page, /CREATE_RESERVATION_SECTION8_SCOPE/);
  });

  it("AC-CR8-12 FO extras OUT — do not mount fo_service_catalogue as stay packages", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const amendFns = readRel("./fo-amendments.functions.ts");
    assert.doesNotMatch(page, /fo_service_catalogue|loadServiceCatalogue|Add Service/);
    assert.doesNotMatch(gate, /fo_service_catalogue|loadServiceCatalogue/);
    assert.match(amendFns, /loadServiceCatalogue/);
    assert.match(amendFns, /fo_service_catalogue/);
  });

  it("AC-CR8-13 Meal plans OUT of create bind; SET3 meal-plan Setup stays Settings", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const set3Ui = readRel("../components/settings/pms-set3-section.tsx");
    assert.doesNotMatch(page, /pms_meal_plans|savePmsMealPlan|mealPlanId/);
    assert.doesNotMatch(gate, /pms_meal_plans|savePmsMealPlan|mealPlanId/);
    assert.match(set3Ui, /savePmsMealPlan/);
  });

  it("AC-CR8-14 No commission settlement, LIVE OTA/RMS package mapping, or email/SMS", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const helpers = readRel("./create-reservation-phase1-section8.ts");
    assert.match(helpers, /commission settlement/);
    assert.match(helpers, /LIVE OTA \/ RMS package mapping/);
    assert.doesNotMatch(page, /commission settlement|channel manager|Send confirmation email|smsConfirmation/i);
    assert.doesNotMatch(gate, /commission|ota package|emailConfirmation|smsConfirmation/i);
  });

  it("AC-CR8-15 CR-100 / Group products are not expanded", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    assert.doesNotMatch(page, /CR-100|rooming list|group block|allotmentPickup/);
    assert.doesNotMatch(gate, /CR-100|rooming list|group block/);
    assert.match(CREATE_RESERVATION_SECTION8_LOCKED_NON_GOALS.join(" | "), /CR-100/);
  });

  it("AC-CR8-16 Rate, Room assign, Guarantee/Confirm are not rewritten; sticky compose keeps §5/§6", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /CreateReservationRate/);
    assert.match(page, /CreateReservationRoomAssignment/);
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /stickyRoomAssignmentLabel\(/);
    assert.match(page, /stickyPricingCopy|money\(pricingState\.quote\.subtotal\)/);
    const roomIdx = page.indexOf('data-testid="summary-room"');
    const rateIdx = page.indexOf('data-testid="summary-rate"');
    const totalIdx = page.indexOf('data-testid="summary-stay-total"');
    const packagesIdx = page.indexOf('data-testid="summary-packages"');
    assert.ok(roomIdx > 0 && rateIdx > roomIdx && totalIdx > rateIdx);
    assert.ok(packagesIdx > totalIdx);
    assert.match(page, /CreateReservationGuarantee/);
    assert.doesNotMatch(page, /Send confirmation email/);
    assert.doesNotMatch(page, /replacePricingLines|removeStayTotal|replaceRoomLine/);
  });

  it("AC-CR8-17 Locked non-goals in §4 are absent", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    const helpers = readRel("./create-reservation-phase1-section8.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION8_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /selectable package attach/);
    assert.match(helpers, /Phase 1 \/ Create Reservation DONE claim/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|Fixed Rate/i);
    assert.doesNotMatch(gate, /channel manager|yield engine|packagePicker/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
    assert.ok(CREATE_RESERVATION_LOCKED_NON_GOALS.includes("fake packages"));
  });

  it("AC-CR8-18 Migration is NONE; Flag Abel NOT required", () => {
    const helpers = readRel("./create-reservation-phase1-section8.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION8_MIGRATION, "NONE");
    assert.equal(CREATE_RESERVATION_SECTION8_FLAG_ABEL, "NOT required");
    assert.match(CREATE_RESERVATION_SECTION8_MIGRATION_REASON, /No new columns/);
    assert.match(CREATE_RESERVATION_SECTION8_MIGRATION_REASON, /Flag Abel: NOT required/);
    assert.match(helpers, /Migration for this section: NONE/);
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    const supabaseDir = join(here, "../../../../supabase/migrations");
    for (const file of readdirSync(drizzleDir)) {
      assert.doesNotMatch(file, /create.reservation.phase1.section8|cr8.section8|package_bind_create/i);
    }
    if (existsSync(supabaseDir)) {
      for (const file of readdirSync(supabaseDir)) {
        assert.doesNotMatch(file, /create.reservation.phase1.section8|cr8.section8|package_bind_create/i);
      }
    }
    assert.doesNotMatch(functions, /create policy|alter policy|enable row level security/i);
  });

  it("AC-CR8-19 Additive expansion of existing /restaurant/bookings/new — modern NORU gated box", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /CreateReservationPackages/);
    assert.match(gate, /rounded-2xl border border-border bg-card/);
    assert.match(gate, /font-display/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/pms\/reservations\/new"\)/);
    assert.doesNotMatch(gate, /legacy chrome|legacy PMS/i);
    assert.equal(CREATE_RESERVATION_PACKAGES_BOX, "visible-gated");
  });

  it("AC-CR8-20 Programme rule: detect Setup catalogue; attach is not LIVE", () => {
    assert.match(CREATE_RESERVATION_SECTION8_PROGRAMME_RULE, /only if CURRENT supports/);
    assert.match(CREATE_RESERVATION_SECTION8_PROGRAMME_RULE, /Do not clone legacy chrome/);
    assert.match(CREATE_RESERVATION_SECTION8_PROGRAMME_RULE, /getPmsSet3Snapshot/);
    assert.equal(CREATE_RESERVATION_PACKAGES_BIND, "out");
    const gate = readRel("../components/bookings/create-reservation-packages.tsx");
    assert.match(gate, /CREATE_RESERVATION_SECTION8_SCOPE/);
    assert.doesNotMatch(gate, /type="checkbox"/);
  });

  it("AC-CR8-21 Parallel Section 6 and Section 7 Spec drafting are not blocked", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(CREATE_RESERVATION_SECTION8_PARALLEL_OK, /Section 6/);
    assert.match(CREATE_RESERVATION_SECTION8_PARALLEL_OK, /Section 7/);
    assert.match(page, /CreateReservationRoomAssignment/);
    assert.match(page, /CREATE_RESERVATION_SECTION6_SCOPE/);
    assert.doesNotMatch(page, /blockSection6|waitForSection7/);
  });

  it("AC-CR8-22 canSubmit does not require a package; prior Unpriced / Unassigned / Associations stand", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "pending",
        priced: true,
        canCreateUnpriced: false,
      }),
      true,
    );
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 3,
        status: "pending",
        priced: false,
        canCreateUnpriced: true,
      }),
      true,
    );
    const submitStart = page.indexOf("canSubmitCreateReservation({");
    assert.ok(submitStart > 0);
    const submitBlock = page.slice(submitStart, page.indexOf("});", submitStart));
    assert.doesNotMatch(submitBlock, /package/);
    assert.match(page, /CreateReservationAssociations/);
    assert.match(page, /const UNASSIGNED = "unassigned"/);
    assert.match(page, /data-testid="summary-unpriced-badge"|summary-stay-total/);
  });

  it("resolveCreatePackagesGateView maps loading / error around catalog detect", () => {
    assert.deepEqual(
      resolveCreatePackagesGateView({
        loading: true,
        error: false,
        packagesAvailable: true,
        activePackageCount: 1,
      }),
      { kind: "loading" },
    );
    assert.deepEqual(
      resolveCreatePackagesGateView({
        loading: false,
        error: true,
        packagesAvailable: false,
        activePackageCount: 0,
      }),
      { kind: "error" },
    );
    assert.deepEqual(
      resolveCreatePackagesGateView({
        loading: false,
        error: false,
        packagesAvailable: true,
        activePackageCount: 4,
      }),
      { kind: "active_not_attached", activeCount: 4 },
    );
    assert.equal(CREATE_RESERVATION_PACKAGES_SETTINGS_LINK, "Open Settings packages");
  });
});
