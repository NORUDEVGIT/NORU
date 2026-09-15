import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA,
  CREATE_RESERVATION_BOOKING_AGENT_COPY,
  CREATE_RESERVATION_CONFIRM_REQUIRED_COPY,
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_LOCKED_NON_GOALS,
  CREATE_RESERVATION_MASTER_CONFIRM_COPY,
  CREATE_RESERVATION_MASTER_OVERRIDE_RULE,
  CREATE_RESERVATION_MIGRATION_REASON,
  CREATE_RESERVATION_MODULE_DONE,
  CREATE_RESERVATION_PAYMENT_TERMS_COPY,
  CREATE_RESERVATION_PHASE1_COMPLETE,
  CREATE_RESERVATION_SECTION1_ISSUE,
  CREATE_RESERVATION_SECTION1_MIGRATION,
  CREATE_RESERVATION_SECTION1_SCOPE,
  CREATE_RESERVATION_SECTION2_ACCEPTANCE_CRITERIA,
  CREATE_RESERVATION_SECTION2_APPLY,
  CREATE_RESERVATION_SECTION2_ISSUE,
  CREATE_RESERVATION_SECTION2_MIGRATION,
  CREATE_RESERVATION_SECTION2_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION2_SCOPE,
  CREATE_RESERVATION_SECTION2_TIP_AC_MAP,
  CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED,
  CREATE_RESERVATION_SEGMENT_HONESTY,
  CREATE_RESERVATION_SOURCE_HONESTY,
  CREATE_RESERVATION_SUMMARY_NO_TOTAL,
  CREATE_RESERVATION_TIP_AC_MAP,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
  RESERVATION_TYPE_MODES,
  mastersForCreateMode,
  pickPrefillMasterId,
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  typeSwitchDiscardsMaster,
} from "./create-reservation-phase1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR1 = Array.from({ length: 21 }, (_, i) => `AC-CR1-${i + 1}`);

describe("Create Reservation Phase 1 Section 1 lock — AC-CR1-1…21", () => {
  it("locks AC-CR1-1…21 (Spec #120 amend / issue #121)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA], CR1);
    assert.equal(CREATE_RESERVATION_SECTION1_ISSUE, 121);
    assert.deepEqual(CREATE_RESERVATION_TIP_AC_MAP["plan-context-ui"], [
      "AC-CR1-1",
      "AC-CR1-8",
      "AC-CR1-9",
      "AC-CR1-10",
      "AC-CR1-14",
    ]);
    assert.deepEqual(CREATE_RESERVATION_TIP_AC_MAP["plan-guest-search-create"], [
      "AC-CR1-2",
      "AC-CR1-3",
      "AC-CR1-4",
      "AC-CR1-5",
      "AC-CR1-6",
      "AC-CR1-11",
      "AC-CR1-12",
      "AC-CR1-13",
    ]);
    assert.deepEqual(CREATE_RESERVATION_TIP_AC_MAP["plan-gates-honesty"], [
      "AC-CR1-7",
      "AC-CR1-15",
      "AC-CR1-16",
      "AC-CR1-17",
      "AC-CR1-18",
      "AC-CR1-19",
      "AC-CR1-20",
    ]);
    assert.deepEqual(CREATE_RESERVATION_TIP_AC_MAP["plan-sidebar-collapse"], ["AC-CR1-21"]);
  });

  it("AC-CR1-1 Context fields render; type switch shows Corporate/TA chrome without clearing guest", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    assert.match(page, /CreateReservationContext/);
    assert.match(page, /CreateReservationGuest/);
    assert.match(context, /data-testid="create-reservation-context"/);
    assert.deepEqual([...RESERVATION_TYPE_MODES], ["individual", "corporate", "travel_agency"]);
    assert.match(context, /reservation-type-\$\{mode\}/);
    assert.match(context, /CreateReservationMasterPicker/);
    assert.match(context, /kind="company"/);
    assert.match(context, /kind="travel_agent"/);
    assert.doesNotMatch(context, /company-chrome-placeholder|ta-chrome-placeholder/);
    assert.match(page, /CREATE_RESERVATION_TYPE_CHANGE_WARN/);
    assert.match(page, /setReservationType\(pendingType\)/);
    assert.doesNotMatch(page, /setGuest\(null\).*setReservationType|setReservationType.*setGuest\(null\)/s);
    assert.match(guest, /onGuestChange/);
  });

  it("AC-CR1-2 Guest search/select is name/phone/email with debounce; selected card can be cleared", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.equal(CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS, 300);
    assert.match(guest, /CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS/);
    assert.match(guest, /listGuests/);
    assert.match(guest, /Search guests by name, phone or email/);
    assert.match(guest, /data-testid="guest-search"/);
    assert.match(guest, /data-testid="change-guest"/);
    assert.match(guest, /onGuestChange\(null\)/);
    assert.match(functions, /first_name\.ilike/);
    assert.match(functions, /last_name\.ilike/);
    assert.match(functions, /email\.ilike/);
    assert.match(functions, /phone\.ilike/);
    assert.doesNotMatch(functions, /id_document_number\.ilike/);
    assert.doesNotMatch(guest, /document number|ID search|passport number/i);
  });

  it("AC-CR1-3 Create guest opens full GE2 GuestFormDialog and auto-selects", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(guest, /GuestFormDialog/);
    assert.match(guest, /data-testid="create-guest-inline"/);
    assert.match(guest, /onSaved=\{\(guestId\) => void selectById\(guestId\)\}/);
    assert.match(form, /createGuest/);
    assert.match(form, /GuestFormStagedIdentity/);
    assert.match(form, /GuestFormStagedLinks/);
    assert.match(form, /findGuestDuplicates/);
  });

  it("AC-CR1-4 Restricted/blacklisted warn-first; staff can continue; no hard block", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const bits = readRel("../components/guests/guest-bits.tsx");
    assert.match(guest, /GuestRestrictionWarn/);
    assert.match(bits, /guestRestrictionWarning/);
    assert.match(page, /canSubmit = !!guest && datesValid && !!roomTypeId/);
    assert.doesNotMatch(page, /blacklisted|restricted.*canSubmit|canSubmit.*restricted/i);
    assert.doesNotMatch(guest, /hard block|cannot continue|create blocked/i);
  });

  it("AC-CR1-5 Creating a guest does not navigate to the guest directory", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.doesNotMatch(guest, /to="\/restaurant\/pms\/guests"/);
    assert.doesNotMatch(page, /to="\/restaurant\/pms\/guests"/);
    assert.match(guest, /Create guest/);
    assert.match(guest, /without leaving this page/);
  });

  it("AC-CR1-6 No second guest writer — reuse listGuests / createGuest / GuestFormDialog / findGuestDuplicates", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(guest, /listGuests/);
    assert.match(guest, /GuestFormDialog/);
    assert.match(form, /createGuest/);
    assert.match(form, /findGuestDuplicates/);
    assert.doesNotMatch(guest, /insertGuest|guest_profiles_create|create_guest_profile/i);
    assert.doesNotMatch(guest, /from\("guest_profiles"\)/);
  });

  it("AC-CR1-7 Existing gates preserved — pms + reservation manager + guest-manage on writes", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const guests = readRel("./guests.functions.ts");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(page, /getGuestsAccess/);
    assert.match(functions, /requireReservationManager/);
    assert.match(guests, /requireGuestManager/);
    assert.match(page, /canCreateGuest=\{guestAccessQuery\.data\?\.canManage/);
    assert.doesNotMatch(page, /new entitlement|createReservationRole|requirePackage\("create-reservation"\)/);
  });

  it("AC-CR1-8 Changing reservation type warns and preserves guest/stay draft", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /type-change-warn/);
    assert.match(page, /CREATE_RESERVATION_TYPE_CHANGE_WARN/);
    assert.match(CREATE_RESERVATION_TYPE_CHANGE_WARN, /stay as they are/);
    assert.match(page, /setPendingType\(next\)/);
    assert.match(page, /setReservationType\(pendingType\)/);
    assert.doesNotMatch(page, /setGuest\(null\);\s*setArrival/);
    assert.doesNotMatch(page, /setArrival\(today\).*setReservationType/s);
  });

  it("AC-CR1-9 Booking source and market segment use SET6 when active, else §3.1 defaults", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /getPmsSet6Snapshot/);
    assert.match(page, /resolveBookingSourceOptions/);
    assert.match(page, /resolveMarketSegmentOptions/);
    assert.match(context, /booking-source/);
    assert.match(context, /market-segment/);
    assert.doesNotMatch(context, /CREATE_RESERVATION_SOURCE_HONESTY|CREATE_RESERVATION_SEGMENT_HONESTY|CREATE_RESERVATION_CONFIRM_REQUIRED_COPY/);
    assert.match(CREATE_RESERVATION_SOURCE_HONESTY, /Not a LIVE OTA/);
    assert.match(CREATE_RESERVATION_SEGMENT_HONESTY, /not a rate engine/);
    assert.match(CREATE_RESERVATION_CONFIRM_REQUIRED_COPY, /Section 7/);
    const set6 = resolveBookingSourceOptions([
      { id: "s1", code: "PH", name: "Property phone", description: "", active: true },
      { id: "s2", code: "XX", name: "Inactive", description: "", active: false },
    ]);
    assert.deepEqual(set6, [{ value: "s1", label: "Property phone", origin: "set6" }]);
    const defaults = resolveBookingSourceOptions([]);
    assert.equal(defaults.length, DEFAULT_BOOKING_SOURCES.length);
    assert.equal(defaults[0]?.origin, "default");
    assert.deepEqual(
      DEFAULT_BOOKING_SOURCES.map((row) => row.label),
      ["Phone", "Walk-in", "Email", "Direct", "Corporate", "Travel agency", "Other"],
    );
    assert.deepEqual(
      DEFAULT_MARKET_SEGMENTS.map((row) => row.label),
      ["Leisure", "Corporate", "Government", "Complimentary / house", "Other"],
    );
    const defaultSegments = resolveMarketSegmentOptions(undefined);
    assert.equal(defaultSegments.length, DEFAULT_MARKET_SEGMENTS.length);
  });

  it("AC-CR1-10 External reference is optional; booking agent defaults to current user and is not a second staff master", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(context, /external-reference/);
    assert.match(context, /placeholder="Optional"/);
    assert.match(context, /booking-agent/);
    assert.match(context, /readOnly/);
    assert.doesNotMatch(context, /CREATE_RESERVATION_BOOKING_AGENT_COPY/);
    assert.match(page, /actorName/);
    assert.match(functions, /actorName:/);
    assert.match(functions, /created_by_staff_membership_id|_membership_id: me.id/);
    assert.match(CREATE_RESERVATION_BOOKING_AGENT_COPY, /signed-in staff/);
    assert.doesNotMatch(page, /listStaff/);
  });

  it("AC-CR1-11 Duplicate warn on create-guest; no silent merge", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(guest, /onOpenExisting/);
    assert.doesNotMatch(guest, /onMergeRequested/);
    assert.match(form, /findGuestDuplicates/);
    assert.match(form, /Nothing is merged/);
    assert.match(form, /Create anyway/);
    assert.doesNotMatch(form, /automatically merge|one-click merge|silent merge/i);
  });

  it("AC-CR1-12 Change guest clears selection; View guest opens a draft-preserving drawer", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    assert.match(guest, /data-testid="change-guest"/);
    assert.match(guest, /onGuestChange\(null\)/);
    assert.match(guest, /data-testid="view-guest"/);
    assert.match(guest, /data-testid="guest-peek-drawer"/);
    assert.match(guest, /Reservation draft stays on this page/);
    assert.doesNotMatch(guest, /navigate\(\{[^}]*pms\/guests/s);
  });

  it("AC-CR1-13 Selected and result rows show VIP and restriction badges", () => {
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    assert.match(guest, /VipBadge/);
    assert.match(guest, /GuestRestrictionBadges/);
    assert.match(guest, /guest\.vipStatus \? <VipBadge/);
    assert.match(guest, /row\.vipStatus \? <VipBadge/);
  });

  it("AC-CR1-14 Company/TA chrome is Section 2 pickers; Individual still does not persist from this chrome", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(context, /CreateReservationMasterPicker/);
    assert.match(page, /mastersForCreateMode/);
    assert.match(page, /companyMasterId: boundMasters.companyMasterId/);
    assert.match(functions, /companyMasterId/);
    assert.match(functions, /_company_master_id/);
    assert.deepEqual(mastersForCreateMode("individual", "company-1", "ta-1"), {
      companyMasterId: null,
      travelAgentMasterId: null,
    });
  });

  it("AC-CR1-15 Section 1 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(page, /CREATE_RESERVATION_SECTION1_SCOPE/);
    assert.match(CREATE_RESERVATION_SECTION1_SCOPE, /Context \+ Guest only/);
    assert.match(CREATE_RESERVATION_SECTION1_SCOPE, /later sections/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
  });

  it("AC-CR1-16 Locked non-goals are absent from this section", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const guest = readRel("../components/bookings/create-reservation-guest.tsx");
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const functions = readRel("./reservations.functions.ts");
    const helpers = readRel("./create-reservation-phase1.ts");
    assert.equal(CREATE_RESERVATION_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /LIVE OTA connector/);
    assert.match(helpers, /hard blacklist block/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|credit approval engine/i);
    assert.doesNotMatch(guest, /hard blacklist block|cannot continue because this guest is blacklisted/i);
    assert.doesNotMatch(context, /LIVE OTA connector|channel manager/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
    assert.doesNotMatch(page, /package catalog|guarantee method|Send confirmation email/i);
  });

  it("AC-CR1-17 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(helpers, /No second guest writer/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR1-18 Migration is NONE — no additive reservation columns in this section", () => {
    const helpers = readRel("./create-reservation-phase1.ts");
    const functions = readRel("./reservations.functions.ts");
    const types = readRel("../../../integrations/supabase/types.ts");
    const reservationStart = types.indexOf("      hotel_reservations: {");
    const reservationRowStart = types.indexOf("Row: {", reservationStart);
    const reservationRow = types.slice(reservationRowStart, types.indexOf("Insert: {", reservationRowStart));
    assert.equal(CREATE_RESERVATION_SECTION1_MIGRATION, "NONE");
    assert.match(CREATE_RESERVATION_MIGRATION_REASON, /channel origin/);
    assert.match(helpers, /Migration for this section: NONE/);
    assert.match(reservationRow, /source: string/);
    assert.doesNotMatch(functions, /booking_source|market_segment|external_reference/);
    assert.doesNotMatch(reservationRow, /booking_source|market_segment|external_reference/);
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    const supabaseDir = join(here, "../../../../supabase/migrations");
    for (const file of readdirSync(drizzleDir)) {
      assert.doesNotMatch(file, /create.reservation.phase1|booking_source|cr1.section1/i);
    }
    if (existsSync(supabaseDir)) {
      for (const file of readdirSync(supabaseDir)) {
        assert.doesNotMatch(file, /create.reservation.phase1|booking_source|cr1.section1/i);
      }
    }
  });

  it("AC-CR1-19 Walk-in remains a mode of the same writer", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const shell = readRel("./front-office-shell.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.match(dialogs, /createReservation/);
    assert.match(shell, /walk_in[\s\S]*createReservation/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
  });

  it("AC-CR1-20 Additive expansion of existing bookings/new — Doc2 shell does not fake later-section totals", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /create-reservation-summary/);
    assert.match(page, /CREATE_RESERVATION_SUMMARY_NO_TOTAL/);
    assert.match(CREATE_RESERVATION_SUMMARY_NO_TOTAL, /No stay total is shown here/);
    assert.match(page, /summary-no-fake-total/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /stickySummaryTotal|fakeTotal|inventedTotal/);
    assert.match(CREATE_RESERVATION_DENIED_COPY, /receptionists/);
  });

  it("AC-CR1-21 Create Reservation collapses the existing app sidebar; expand stays; other pages unchanged", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const shell = readRel("../../../core/components/restaurant-shell.tsx");
    const bookingsIndex = readRel("../../../routes/restaurant/bookings/index.tsx");
    const reservationsIndex = readRel("../../../routes/restaurant/pms/reservations.index.tsx");
    assert.equal(CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED, true);
    assert.equal(CREATE_RESERVATION_SECTION1_MIGRATION, "NONE");
    assert.match(page, /sidebarDefaultCollapsed=\{CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED\}/);
    assert.doesNotMatch(page, /sidebarDefaultCollapsed=\{reservationType/);
    assert.match(shell, /sidebarDefaultCollapsed\?: boolean/);
    assert.match(shell, /useState\(Boolean\(sidebarDefaultCollapsed\)\)/);
    assert.match(shell, /hidePackageRail \|\| sidebarCollapsed/);
    assert.match(shell, /data-testid="expand-app-sidebar"/);
    assert.match(shell, /Expand navigation/);
    assert.doesNotMatch(bookingsIndex, /sidebarDefaultCollapsed/);
    assert.doesNotMatch(reservationsIndex, /sidebarDefaultCollapsed/);
    assert.match(page, /CREATE_RESERVATION_SUMMARY_NO_TOTAL/);
    assert.doesNotMatch(page, /stickySummaryTotal|fakeTotal|inventedTotal/);
  });
});

const CR2 = Array.from({ length: 18 }, (_, i) => `AC-CR2-${i + 1}`);

describe("Create Reservation Phase 1 Section 2 lock — AC-CR2-1…18", () => {
  it("locks AC-CR2-1…18 (Spec #126 / issue #127)", () => {
    assert.deepEqual([...CREATE_RESERVATION_SECTION2_ACCEPTANCE_CRITERIA], CR2);
    assert.equal(CREATE_RESERVATION_SECTION2_ISSUE, 127);
    assert.deepEqual(CREATE_RESERVATION_SECTION2_TIP_AC_MAP["plan-pickers"], ["AC-CR2-1", "AC-CR2-2", "AC-CR2-3"]);
    assert.deepEqual(CREATE_RESERVATION_SECTION2_TIP_AC_MAP["plan-bind-w4-5"], ["AC-CR2-4", "AC-CR2-7"]);
    assert.deepEqual(CREATE_RESERVATION_SECTION2_TIP_AC_MAP["plan-inline-prefill-terms"], [
      "AC-CR2-5",
      "AC-CR2-6",
      "AC-CR2-8",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION2_TIP_AC_MAP["plan-gates-honesty"], [
      "AC-CR2-9",
      "AC-CR2-10",
      "AC-CR2-11",
      "AC-CR2-12",
      "AC-CR2-13",
      "AC-CR2-14",
      "AC-CR2-15",
      "AC-CR2-16",
      "AC-CR2-17",
      "AC-CR2-18",
    ]);
  });

  it("AC-CR2-1 Corporate mode shows a Company picker over listGuestAccounts company", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /CreateReservationContext/);
    assert.match(context, /reservationType === "corporate"/);
    assert.match(context, /kind="company"/);
    assert.match(picker, /data-testid=\{copy.testId\}/);
    assert.match(picker, /testId: "company-picker"/);
    assert.match(picker, /listGuestAccounts/);
    assert.match(picker, /accountType: kind/);
    assert.match(picker, /status: "active"/);
  });

  it("AC-CR2-2 Travel Agency mode shows a TA picker over listGuestAccounts travel_agent", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    assert.match(context, /reservationType === "travel_agency"/);
    assert.match(context, /kind="travel_agent"/);
    assert.match(picker, /testId: "ta-picker"/);
    assert.match(picker, /accountType: kind/);
  });

  it("AC-CR2-3 Individual mode hides Company and TA pickers and does not require either", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(context, /reservationType === "corporate" \?/);
    assert.match(context, /reservationType === "travel_agency" \?/);
    assert.doesNotMatch(context, /reservationType === "individual"[\s\S]{0,200}CreateReservationMasterPicker/);
    assert.match(page, /canSubmit = !!guest && datesValid && !!roomTypeId/);
    assert.doesNotMatch(page, /companyMaster.*canSubmit|canSubmit.*companyMaster/);
    assert.deepEqual(mastersForCreateMode("individual", "c1", "t1"), {
      companyMasterId: null,
      travelAgentMasterId: null,
    });
  });

  it("AC-CR2-4 Create in Corporate / TA mode binds the selected master on the same writer", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /mastersForCreateMode/);
    assert.match(page, /companyMasterId: boundMasters.companyMasterId/);
    assert.match(page, /travelAgentMasterId: boundMasters.travelAgentMasterId/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /companyMasterId: idSchema.nullable\(\).optional\(\)/);
    assert.match(functions, /travelAgentMasterId: idSchema.nullable\(\).optional\(\)/);
    assert.match(functions, /_company_master_id/);
    assert.match(functions, /_travel_agent_master_id/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.deepEqual(mastersForCreateMode("corporate", "c1", "t1"), {
      companyMasterId: "c1",
      travelAgentMasterId: null,
    });
    assert.deepEqual(mastersForCreateMode("travel_agency", "c1", "t1"), {
      companyMasterId: null,
      travelAgentMasterId: "t1",
    });
  });

  it("AC-CR2-5 Inline Create Company uses GE1 dialog; Create TA uses GE3; save auto-selects", () => {
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    const company = readRel("../components/guests/guest-company-form-dialog.tsx");
    const ta = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    assert.match(picker, /GuestCompanyFormDialog/);
    assert.match(picker, /GuestTravelAgentFormDialog/);
    assert.match(picker, /create-company-inline/);
    assert.match(picker, /create-ta-inline/);
    assert.match(picker, /onSaved=\{\(accountId\) => void selectById\(accountId\)\}/);
    assert.match(picker, /without leaving this page/);
    assert.doesNotMatch(picker, /to="\/restaurant\/pms\/guests"/);
    assert.match(company, /createGuestAccount/);
    assert.match(ta, /createGuestAccount/);
  });

  it("AC-CR2-6 Prefill from guest links; staff override wins when the guest changes", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const helpers = readRel("./create-reservation-phase1.ts");
    assert.match(page, /listGuestAccountLinks/);
    assert.match(page, /pickPrefillMasterId/);
    assert.match(page, /employer/);
    assert.match(page, /booker_ta/);
    assert.match(page, /masterOverride/);
    assert.match(page, /setMasterOverride\(true\)/);
    assert.match(helpers, /Staff override wins/);
    assert.match(CREATE_RESERVATION_MASTER_OVERRIDE_RULE, /keeps a staff-chosen/);
    const newer = pickPrefillMasterId(
      [
        { role: "employer", masterId: "old", createdAt: "2026-01-01T00:00:00Z", masterType: "company" },
        { role: "employer", masterId: "new", createdAt: "2026-09-01T00:00:00Z", masterType: "company" },
        { role: "booker_ta", masterId: "ta", createdAt: "2026-09-02T00:00:00Z", masterType: "travel_agent" },
      ],
      "employer",
    );
    assert.equal(newer, "new");
    const tied = pickPrefillMasterId(
      [
        { role: "booker_ta", masterId: "b", createdAt: "2026-09-01T00:00:00Z", masterType: "travel_agent" },
        { role: "booker_ta", masterId: "a", createdAt: "2026-09-01T00:00:00Z", masterType: "travel_agent" },
      ],
      "booker_ta",
    );
    assert.equal(tied, "a");
  });

  it("AC-CR2-7 AC-W4-5 closed for create; detail setReservationGuestMasters remains for amend", () => {
    const functions = readRel("./reservations.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const detail = readRel("../components/guests/reservation-guest-masters.tsx");
    const migration = readRel("../../../../supabase/migrations/0059_pms_create_reservation_company_ta.sql");
    assert.match(functions, /_company_master_id/);
    assert.match(functions, /_travel_agent_master_id/);
    assert.match(migration, /company_master_id, travel_agent_master_id/);
    assert.match(migration, /AC-W4-5 for create/);
    assert.match(accounts, /export const setReservationGuestMasters/);
    assert.match(detail, /ReservationGuestMastersCard/);
    assert.match(detail, /setReservationGuestMasters/);
    assert.match(detail, /Group account master/);
  });

  it("AC-CR2-8 Selected master shows payment terms read-only; no credit engine", () => {
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    assert.match(picker, /CREATE_RESERVATION_PAYMENT_TERMS_COPY/);
    assert.match(picker, /company-payment-terms/);
    assert.match(picker, /ta-payment-terms/);
    assert.match(picker, /Payment terms:/);
    assert.match(CREATE_RESERVATION_PAYMENT_TERMS_COPY, /not a credit engine/);
    assert.doesNotMatch(picker, /credit approval engine|city-ledger|create-time deposit/i);
  });

  it("AC-CR2-9 No Group / block / allotment / rooming / CR-100 on this create surface", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    assert.doesNotMatch(page, /CR-100|rooming list|allotment|group block/i);
    assert.doesNotMatch(context, /accountType: "group"|kind="group"/);
    assert.doesNotMatch(picker, /kind === "group"|Group account/);
    assert.doesNotMatch(page, /groupAccountMasterId/);
  });

  it("AC-CR2-10 No second Company/TA table or API — reuse GE1/GE3 + list/create/links", () => {
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(picker, /listGuestAccounts/);
    assert.match(picker, /getGuestAccount/);
    assert.match(picker, /GuestCompanyFormDialog/);
    assert.match(picker, /GuestTravelAgentFormDialog/);
    assert.match(page, /listGuestAccountLinks/);
    assert.doesNotMatch(picker, /from\("guest_account_masters"\)/);
    assert.doesNotMatch(picker, /createCompanyMaster|createTravelAgentMaster/);
    assert.doesNotMatch(page, /insertGuestAccount|create_company_on_reservation/i);
  });

  it("AC-CR2-11 Existing permission gates preserved; no new entitlement / RLS model", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0059_pms_create_reservation_company_ta.sql");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(page, /getGuestsAccess/);
    assert.match(functions, /requireReservationManager/);
    assert.match(accounts, /requireGuestManager/);
    assert.match(page, /canCreateMaster=\{guestAccessQuery\.data\?\.canManage/);
    assert.doesNotMatch(page, /new entitlement|createReservationRole|requirePackage\("create-reservation"\)/);
    assert.match(migration, /RLS model: UNCHANGED/);
    assert.match(migration, /Flag Abel: NOT required/);
    assert.doesNotMatch(migration, /CREATE POLICY/);
  });

  it("AC-CR2-12 Type switch warns, preserves guest/stay, and clears Company/TA", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /type-change-warn/);
    assert.match(page, /CREATE_RESERVATION_TYPE_CHANGE_WARN/);
    assert.match(CREATE_RESERVATION_TYPE_CHANGE_WARN, /stay as they are/);
    assert.match(CREATE_RESERVATION_TYPE_CHANGE_WARN, /will be cleared/);
    assert.match(page, /setCompanyMaster\(null\)/);
    assert.match(page, /setTravelAgentMaster\(null\)/);
    assert.match(page, /setMasterOverride\(false\)/);
    assert.doesNotMatch(page, /setGuest\(null\);\s*setArrival/);
    assert.equal(typeSwitchDiscardsMaster("corporate", "c1", null), true);
    assert.equal(typeSwitchDiscardsMaster("travel_agency", null, "t1"), true);
    assert.equal(typeSwitchDiscardsMaster("individual", "c1", "t1"), false);
  });

  it("AC-CR2-13 Confirm hard-block may live in Section 7; Section 2 collects and persists honestly", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    assert.match(page, /canSubmit = !!guest && datesValid && !!roomTypeId/);
    assert.doesNotMatch(page, /canSubmit.*companyMaster|companyMaster.*canSubmit/);
    assert.match(picker, /CREATE_RESERVATION_MASTER_CONFIRM_COPY/);
    assert.match(CREATE_RESERVATION_MASTER_CONFIRM_COPY, /Section 7/);
    assert.match(CREATE_RESERVATION_MASTER_CONFIRM_COPY, /does not hard-block create/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/confirm"\)/);
  });

  it("AC-CR2-14 Section 2 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(page, /CREATE_RESERVATION_SECTION2_SCOPE/);
    assert.match(CREATE_RESERVATION_SECTION2_SCOPE, /later sections/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
  });

  it("AC-CR2-15 Locked non-goals in §4 are absent", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_LOCKED_NON_GOALS.length, 12);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|credit approval engine/i);
    assert.doesNotMatch(picker, /LIVE OTA connector|channel manager/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
  });

  it("AC-CR2-16 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(helpers, /No second guest \/ Company \/ TA writer/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    const ge1 = readRel("./guest-profile-company.ts");
    const ge3 = readRel("./guest-profile-travel-agency.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
    assert.match(ge1, /Waves 1–5 stay closed/);
    assert.match(ge3, /Waves 1–5 stay closed/);
  });

  it("AC-CR2-17 Migration honesty: columns exist; RPC replaced; APPLY HELD; walk-in same writer", () => {
    const helpers = readRel("./create-reservation-phase1.ts");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const supabase = readRel("../../../../supabase/migrations/0059_pms_create_reservation_company_ta.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0059_pms_create_reservation_company_ta.sql");
    assert.equal(CREATE_RESERVATION_SECTION2_MIGRATION, "0059_pms_create_reservation_company_ta.sql");
    assert.equal(CREATE_RESERVATION_SECTION2_APPLY, "HELD");
    assert.match(CREATE_RESERVATION_SECTION2_MIGRATION_REASON, /already exist/);
    assert.match(CREATE_RESERVATION_SECTION2_MIGRATION_REASON, /APPLY HELD/);
    assert.match(helpers, /Dual-lane APPLY HELD/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to non-prod or production from this agent/);
    assert.match(supabase, /SECURITY DEFINER/);
    assert.match(supabase, /_company_master_id uuid DEFAULT NULL/);
    assert.match(supabase, /_travel_agent_master_id uuid DEFAULT NULL/);
    assert.match(drizzle, /APPLY HELD/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(dialogs, /createReservation/);
    assert.doesNotMatch(dialogs, /createWalkInReservation/);
  });

  it("AC-CR2-18 Additive expansion of existing /restaurant/bookings/new — no second product", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.match(CREATE_RESERVATION_CONFIRM_REQUIRED_COPY, /Section 7/);
  });
});

