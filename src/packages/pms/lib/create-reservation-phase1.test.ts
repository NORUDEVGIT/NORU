import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA,
  CREATE_RESERVATION_BOOKING_AGENT_COPY,
  CREATE_RESERVATION_COMPANY_PLACEHOLDER,
  CREATE_RESERVATION_CONFIRM_REQUIRED_COPY,
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_LOCKED_NON_GOALS,
  CREATE_RESERVATION_MIGRATION_REASON,
  CREATE_RESERVATION_MODULE_DONE,
  CREATE_RESERVATION_PHASE1_COMPLETE,
  CREATE_RESERVATION_SECTION1_ISSUE,
  CREATE_RESERVATION_SECTION1_MIGRATION,
  CREATE_RESERVATION_SECTION1_SCOPE,
  CREATE_RESERVATION_SEGMENT_HONESTY,
  CREATE_RESERVATION_SOURCE_HONESTY,
  CREATE_RESERVATION_SUMMARY_NO_TOTAL,
  CREATE_RESERVATION_TA_PLACEHOLDER,
  CREATE_RESERVATION_TIP_AC_MAP,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
  RESERVATION_TYPE_MODES,
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
} from "./create-reservation-phase1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR1 = Array.from({ length: 20 }, (_, i) => `AC-CR1-${i + 1}`);

describe("Create Reservation Phase 1 Section 1 lock — AC-CR1-1…20", () => {
  it("locks AC-CR1-1…20 (Spec #120 / issue #121)", () => {
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
    assert.match(context, /company-chrome-placeholder/);
    assert.match(context, /ta-chrome-placeholder/);
    assert.match(context, /CREATE_RESERVATION_COMPANY_PLACEHOLDER/);
    assert.match(context, /CREATE_RESERVATION_TA_PLACEHOLDER/);
    assert.match(CREATE_RESERVATION_COMPANY_PLACEHOLDER, /Section 2/);
    assert.match(CREATE_RESERVATION_TA_PLACEHOLDER, /Section 2/);
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
    assert.match(context, /CREATE_RESERVATION_SOURCE_HONESTY/);
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

  it("AC-CR1-14 Company/TA master persistence is not claimed — chrome placeholders only", () => {
    const context = readRel("../components/bookings/create-reservation-context.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(context, /CREATE_RESERVATION_COMPANY_PLACEHOLDER/);
    assert.match(context, /CREATE_RESERVATION_TA_PLACEHOLDER/);
    assert.doesNotMatch(page, /companyMasterId|travelAgentMasterId|company_master_id|travel_agent_master_id/);
    assert.doesNotMatch(functions, /_company_master|_travel_agent_master|companyMasterId/);
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
});
