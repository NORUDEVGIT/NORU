import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CREATE_RESERVATION_MODULE_DONE,
  CREATE_RESERVATION_PHASE1_COMPLETE,
} from "./create-reservation-phase1.ts";
import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION4,
  CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES,
  CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY,
  CREATE_RESERVATION_CAPACITY_ENFORCEMENT,
  CREATE_RESERVATION_CHECKING_AVAILABILITY,
  CREATE_RESERVATION_EMPTY_CATALOGUE,
  CREATE_RESERVATION_LIMITED_AVAILABLE_MAX,
  CREATE_RESERVATION_LIMITED_THRESHOLD_DOC,
  CREATE_RESERVATION_NO_ROOM_TYPE,
  CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE,
  CREATE_RESERVATION_SECTION4_ISSUE,
  CREATE_RESERVATION_SECTION4_LOCKED_NON_GOALS,
  CREATE_RESERVATION_SECTION4_MIGRATION,
  CREATE_RESERVATION_SECTION4_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION4_SCOPE,
  CREATE_RESERVATION_SECTION4_TIP_AC_MAP,
  CREATE_RESERVATION_STALE_SELECTION_RULE,
  ROOM_TYPE_AVAILABILITY_LABELS,
  isRoomTypeSelectable,
  occupancySoftWarn,
  remainingCountCopy,
  roomTypeAvailabilityCopy,
  roomTypeAvailabilityState,
  roomTypeCapacityDisplay,
  stickyAvailability,
  stickyAvailabilityCopy,
  stickyRoomTypeLabel,
} from "./create-reservation-phase1-section4.ts";
import { occupancyExceeded } from "./fo-amendments.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR4 = Array.from({ length: 21 }, (_, i) => `AC-CR4-${i + 1}`);

describe("Create Reservation Phase 1 Section 4 lock — AC-CR4-1…21", () => {
  it("locks AC-CR4-1…21 (Spec #130 / issue #131)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION4], CR4);
    assert.equal(CREATE_RESERVATION_SECTION4_ISSUE, 131);
    assert.deepEqual(CREATE_RESERVATION_SECTION4_TIP_AC_MAP["plan-list-states"], [
      "AC-CR4-1",
      "AC-CR4-2",
      "AC-CR4-3",
      "AC-CR4-4",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION4_TIP_AC_MAP["plan-occupancy-bind-sot"], [
      "AC-CR4-5",
      "AC-CR4-6",
      "AC-CR4-7",
      "AC-CR4-8",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION4_TIP_AC_MAP["plan-sticky-boundaries"], [
      "AC-CR4-9",
      "AC-CR4-10",
      "AC-CR4-11",
      "AC-CR4-12",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION4_TIP_AC_MAP["plan-gates-honesty"], [
      "AC-CR4-13",
      "AC-CR4-14",
      "AC-CR4-15",
      "AC-CR4-16",
      "AC-CR4-17",
      "AC-CR4-18",
      "AC-CR4-19",
      "AC-CR4-20",
      "AC-CR4-21",
    ]);
  });

  it("maps CURRENT available integers to available / limited / none", () => {
    assert.equal(CREATE_RESERVATION_LIMITED_AVAILABLE_MAX, 2);
    assert.match(CREATE_RESERVATION_LIMITED_THRESHOLD_DOC, /available > 2/);
    assert.match(CREATE_RESERVATION_LIMITED_THRESHOLD_DOC, /available <= 2/);
    assert.equal(roomTypeAvailabilityState(3), "available");
    assert.equal(roomTypeAvailabilityState(2), "limited");
    assert.equal(roomTypeAvailabilityState(1), "limited");
    assert.equal(roomTypeAvailabilityState(0), "none");
    assert.equal(roomTypeAvailabilityState(-1), "none");
    assert.equal(isRoomTypeSelectable(3), true);
    assert.equal(isRoomTypeSelectable(2), true);
    assert.equal(isRoomTypeSelectable(0), false);
    assert.equal(ROOM_TYPE_AVAILABILITY_LABELS.none, "Fully booked");
    assert.match(roomTypeAvailabilityCopy(0, 4), /Fully booked/);
    assert.match(roomTypeAvailabilityCopy(0, 4), /none remaining/);
    assert.match(roomTypeAvailabilityCopy(2, 4), /Limited/);
    assert.match(remainingCountCopy(2), /2 remaining/);
  });

  it("AC-CR4-1 Room type select lists active + sellable types from getRoomTypeAvailability", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /CreateReservationRoomType/);
    assert.match(page, /getRoomTypeAvailability/);
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(roomType, /data-testid="create-reservation-room-type"/);
    assert.match(functions, /export const getRoomTypeAvailability/);
    assert.match(functions, /\.eq\("active", true\)/);
    assert.match(functions, /\.eq\("sellable", true\)/);
    assert.doesNotMatch(functions, /getOtaAvailability|listRmsInventory|yieldAvailability/);
  });

  it("AC-CR4-2 Availability is stay-dated for arrival → departure", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /\["room-type-availability", restaurantId, arrival, departure\]/);
    assert.match(page, /enabled: canManage && datesValid/);
    assert.match(functions, /count_sellable_rooms/);
    assert.match(functions, /count_reserved_rooms/);
    assert.match(functions, /_arrival: arrival/);
    assert.match(functions, /_departure: departure/);
    assert.match(functions, /available: Math\.max\(0, totalRooms - reservedRooms\)/);
  });

  it("AC-CR4-3 Staff-visible states map CURRENT integers; limited threshold documented; no new inventory RPC", () => {
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.match(roomType, /roomTypeAvailabilityState\(row\.available\)/);
    assert.match(roomType, /availability-state-\$\{state\}/);
    assert.match(helpers, /CREATE_RESERVATION_LIMITED_AVAILABLE_MAX = 2/);
    assert.doesNotMatch(functions, /createServerFn[\s\S]*getLimitedAvailability|overbookingEngine/s);
    assert.doesNotMatch(helpers, /count_ota_rooms|rms_yield|allotment_hold/);
  });

  it("AC-CR4-4 None (available === 0) is explicit fully booked and not selectable as success", () => {
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(roomTypeAvailabilityState(0), "none");
    assert.equal(isRoomTypeSelectable(0), false);
    assert.match(roomType, /disabled=\{disabled\}/);
    assert.match(roomType, /isRoomTypeSelectable\(row\.available\)/);
    assert.match(roomType, /ROOM_TYPE_AVAILABILITY_LABELS/);
    assert.match(page, /canSubmit = !!guest && datesValid && !!roomTypeId && \(selectedType\?\.available \?\? 0\) > 0/);
    assert.match(stickyAvailabilityCopy({ kind: "state", state: "none", available: 0, totalRooms: 4 }), /Fully booked \(none\)/);
  });

  it("AC-CR4-5 Occupancy soft-warn uses FO occupancyExceeded; warn-only; not a silent fit", () => {
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(occupancyExceeded(2, 1, 2), true);
    assert.match(occupancySoftWarn(2, 1, 2) ?? "", /maximum occupancy/);
    assert.equal(occupancySoftWarn(2, 0, 2), null);
    assert.equal(occupancySoftWarn(4, 0, undefined), null);
    assert.equal(CREATE_RESERVATION_CAPACITY_ENFORCEMENT, "maxOccupancy-warn-only");
    assert.match(helpers, /occupancyExceeded/);
    assert.match(helpers, /occupancyBlockMessage/);
    assert.match(roomType, /OccupancySoftWarn/);
    assert.match(roomType, /data-testid=\{testId\}/);
    assert.match(page, /summary-occupancy-warn/);
    assert.match(CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE, /not blocked for occupancy/);
    assert.doesNotMatch(page, /occupancyExceeded.*canSubmit|canSubmit.*occupancy/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.doesNotMatch(createFn, /occupancyExceeded|max_occupancy|OCCUPANCY_EXCEEDED/);
    assert.doesNotMatch(createFn, /RAISE EXCEPTION 'OCCUPANCY/);
  });

  it("AC-CR4-6 Selected room type binds room_type_id via createReservation → create_hotel_reservation_priced", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /createReservation/);
    assert.match(page, /roomTypeId,/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /roomTypeId: idSchema/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(functions, /_room_type_id: data\.roomTypeId/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(functions, /insert\("hotel_reservations"\)/);
  });

  it("AC-CR4-7 No fake availability — CURRENT count_* only; no invented OTA/RMS/yield/overbooking", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.match(helpers, /No second inventory API/);
    assert.match(helpers, /LIVE OTA/);
    assert.doesNotMatch(page, /channel manager|stop-sell|overbooking policy|yield engine/i);
    assert.doesNotMatch(roomType, /listOtaAvailability|getRmsYield|inventAvailability/);
    assert.doesNotMatch(functions, /overbooking_limit|ota_stop_sell|rms_yield/);
  });

  it("AC-CR4-8 Server / RPC remains source of truth; create still fail-closes on NO_AVAILABILITY", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const server = readRel("./reservations.server.ts");
    assert.match(page, /\(selectedType\?\.available \?\? 0\) > 0/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(server, /NO_AVAILABILITY: "No rooms of that type are available for those dates\."/);
    const sql = readRel("../../../../drizzle/migrations/0013_create_hotel_reservations.sql");
    assert.match(sql, /assert_reservation_capacity/);
    assert.match(sql, /RAISE EXCEPTION 'NO_AVAILABILITY'/);
    assert.doesNotMatch(functions, /if \(error\.message\.includes\("NO_AVAILABILITY"\)\) return/);
    assert.doesNotMatch(page, /swallowAvailability|ignoreNoAvailability/);
  });

  it("AC-CR4-9 Sticky summary shows selected room type + availability state; no fake rate total", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="create-reservation-summary"/);
    assert.match(page, /data-testid="summary-room-type"/);
    assert.match(page, /data-testid="summary-availability"/);
    assert.match(page, /stickyRoomTypeLabel\(selectedMeta\)/);
    assert.match(page, /stickyAvailabilityCopy\(summaryAvailability\)/);
    assert.equal(stickyRoomTypeLabel(null), CREATE_RESERVATION_NO_ROOM_TYPE);
    assert.equal(stickyRoomTypeLabel({ name: "Deluxe", code: "DLX" }), "Deluxe (DLX)");
    assert.match(page, /CREATE_RESERVATION_SUMMARY_NO_TOTAL/);
    assert.match(page, /summary-no-fake-total/);
    assert.doesNotMatch(page, /stickySummaryTotal|fakeTotal|inventedTotal/);
  });

  it("AC-CR4-10 Section 4 does not force a rate plan; null _rate_plan_id remains allowed", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /ratePlanId: ratePlanId \|\| null/);
    assert.doesNotMatch(page, /canSubmit.*ratePlanId|ratePlanId.*canSubmit/);
    assert.match(functions, /ratePlanId: idSchema\.nullable\(\)\.optional\(\)/);
    assert.match(functions, /_rate_plan_id: \(data\.ratePlanId \?\? null\)/);
    assert.match(page, /the stay can be booked without pricing/);
  });

  it("AC-CR4-11 Specific room assign is not expanded; unassigned default remains", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /Room assignment \(optional\)/);
    assert.match(page, /const UNASSIGNED = "unassigned"/);
    assert.match(page, /roomId: roomId === UNASSIGNED \? null : roomId/);
    assert.match(page, /listAssignableRooms/);
    assert.match(page, /setRoomId\(UNASSIGNED\)/);
    assert.doesNotMatch(page, /forceRoomAssign|requiredRoomId|assign before create/);
    assert.match(page, /the stay can still be booked and assigned later/);
  });

  it("AC-CR4-12 No Group allotment / block / CR-100 / Company-TA inventory", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    assert.match(helpers, /parent Company Reservation CR-100/);
    assert.doesNotMatch(page, /allotmentPickup|rooming list|CR-100|companyTaInventory/i);
    assert.doesNotMatch(roomType, /group block|allotment hold/i);
  });

  it("AC-CR4-13 Existing permission gates preserved; no new entitlement / RLS model", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(functions, /requireReservationManager/);
    assert.doesNotMatch(page, /new entitlement|createReservationRole|requirePackage\("create-reservation"\)/);
    assert.doesNotMatch(functions, /requireAvailabilityManager|inventory_entitlement/);
  });

  it("AC-CR4-14 Confirm chrome is not invented; none still disables create", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /Create reservation/);
    assert.match(page, /disabled=\{!canSubmit \|\| create\.isPending\}/);
    assert.match(page, /\(selectedType\?\.available \?\? 0\) > 0/);
    assert.doesNotMatch(page, /Confirm stay|Guarantee and confirm|Send confirmation/);
    assert.match(CREATE_RESERVATION_SECTION4_SCOPE, /guarantee/);
  });

  it("AC-CR4-15 Date/occupancy change revalidates; keep selection + disable submit if none", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    assert.equal(CREATE_RESERVATION_STALE_SELECTION_RULE, "keep-selection-disable-submit");
    assert.match(page, /\["room-type-availability", restaurantId, arrival, departure\]/);
    assert.match(page, /setAdults/);
    assert.match(page, /setChildren/);
    assert.match(roomType, /OccupancySoftWarn/);
    assert.match(roomType, /childCount=\{childCount\}/);
    assert.doesNotMatch(page, /setRoomTypeId\(""\)/);
    assert.doesNotMatch(page, /setRoomTypeId\(null\)/);
    const loading = stickyAvailability({
      roomTypeId: "t1",
      datesValid: true,
      loading: true,
      live: undefined,
    });
    assert.equal(loading.kind, "loading");
    assert.match(stickyAvailabilityCopy(loading), /Checking availability/);
    const noneAfterDates = stickyAvailability({
      roomTypeId: "t1",
      datesValid: true,
      loading: false,
      live: { available: 0, totalRooms: 4 },
    });
    assert.equal(noneAfterDates.kind, "state");
    if (noneAfterDates.kind === "state") assert.equal(noneAfterDates.state, "none");
  });

  it("AC-CR4-16 Honest empty catalogue; invalid dates do not invent availability", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    assert.match(roomType, /CREATE_RESERVATION_EMPTY_CATALOGUE/);
    assert.match(roomType, /CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES/);
    assert.equal(CREATE_RESERVATION_EMPTY_CATALOGUE, "No sellable room types yet. Add them in Configuration → Rooms.");
    assert.equal(CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES, "Choose valid dates to see availability.");
    assert.match(page, /enabled: canManage && datesValid/);
    const needsDates = stickyAvailability({
      roomTypeId: "t1",
      datesValid: false,
      loading: false,
      live: { available: 5, totalRooms: 5 },
    });
    assert.equal(needsDates.kind, "needs_dates");
    assert.doesNotMatch(stickyAvailabilityCopy(needsDates), /Available/);
  });

  it("AC-CR4-17 Section 4 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(roomType, /CREATE_RESERVATION_SECTION4_SCOPE/);
    assert.match(CREATE_RESERVATION_SECTION4_SCOPE, /Availability \/ room type only/);
    assert.match(CREATE_RESERVATION_SECTION4_SCOPE, /later sections/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
    assert.match(page, /CREATE_RESERVATION_SECTION1_SCOPE/);
  });

  it("AC-CR4-18 Locked non-goals in §4 are absent", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION4_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /LIVE OTA connector/);
    assert.match(helpers, /forced rate plan/);
    assert.match(helpers, /Confirm product/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|overbooking policy/i);
    assert.doesNotMatch(roomType, /channel manager|stop-sell|yield engine/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
    assert.doesNotMatch(page, /Guarantee method|Send confirmation email/i);
  });

  it("AC-CR4-19 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const section1 = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(section1, /Waves 1–5 \+ GE1–GE3 stay closed/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR4-20 Migration is NONE; walk-in remains a mode of the same writer", () => {
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const shell = readRel("./front-office-shell.ts");
    assert.equal(CREATE_RESERVATION_SECTION4_MIGRATION, "NONE");
    assert.match(CREATE_RESERVATION_SECTION4_MIGRATION_REASON, /Inventory and create RPCs already exist/);
    assert.match(helpers, /Migration for this section: NONE/);
    assert.doesNotMatch(functions, /overbooking_limit|availability_state|limited_threshold/);
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    const supabaseDir = join(here, "../../../../supabase/migrations");
    for (const file of readdirSync(drizzleDir)) {
      assert.doesNotMatch(file, /create.reservation.phase1.section4|cr4.section4|room_type_availability_state/i);
    }
    if (existsSync(supabaseDir)) {
      for (const file of readdirSync(supabaseDir)) {
        assert.doesNotMatch(file, /create.reservation.phase1.section4|cr4.section4|room_type_availability_state/i);
      }
    }
    assert.match(dialogs, /createReservation/);
    assert.match(shell, /walk_in[\s\S]*createReservation/);
    assert.match(functions, /export const createReservation/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
  });

  it("AC-CR4-21 Additive expansion of existing /restaurant/bookings/new — no second product", () => {
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /CreateReservationRoomType/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/pms\/reservations\/new"\)/);
  });

  it("adult_capacity / child_capacity are display-only and out of enforcement", () => {
    const helpers = readRel("./create-reservation-phase1-section4.ts");
    const roomType = readRel("../components/bookings/create-reservation-room-type.tsx");
    const amendments = readRel("./fo-amendments.ts");
    assert.match(CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY, /display-only/);
    assert.match(roomTypeCapacityDisplay(2, 1), /display only/);
    assert.match(roomType, /roomTypeCapacityDisplay\(row\.adultCapacity, row\.childCapacity\)/);
    const occupancyFnStart = helpers.indexOf("export function occupancySoftWarn");
    const occupancyFn = helpers.slice(occupancyFnStart);
    assert.match(occupancyFn, /occupancyExceeded\(adults, children, maxOccupancy\)/);
    assert.doesNotMatch(occupancyFn, /adultCapacity|childCapacity|adult_capacity|child_capacity/);
    assert.match(amendments, /occupancyTotal\(adults, children\) > maxOccupancy/);
    assert.doesNotMatch(amendments, /adultCapacity|child_capacity/);
  });

  it("sticky availability does not silently keep an available claim while loading", () => {
    assert.equal(CREATE_RESERVATION_CHECKING_AVAILABILITY, "Checking availability…");
    const unset = stickyAvailability({
      roomTypeId: "",
      datesValid: true,
      loading: false,
      live: { available: 5, totalRooms: 5 },
    });
    assert.equal(unset.kind, "unset");
    const available = stickyAvailability({
      roomTypeId: "t1",
      datesValid: true,
      loading: false,
      live: { available: 5, totalRooms: 8 },
    });
    assert.equal(available.kind, "state");
    if (available.kind === "state") {
      assert.equal(available.state, "available");
      assert.match(stickyAvailabilityCopy(available), /Available · 5 remaining/);
    }
    const limited = stickyAvailability({
      roomTypeId: "t1",
      datesValid: true,
      loading: false,
      live: { available: 2, totalRooms: 8 },
    });
    assert.equal(limited.kind, "state");
    if (limited.kind === "state") {
      assert.equal(limited.state, "limited");
      assert.match(stickyAvailabilityCopy(limited), /Limited · 2 remaining/);
    }
  });
});
