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
  canSubmitCreateReservation,
} from "./create-reservation-phase1-section5.ts";
import {
  CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION6,
  CREATE_RESERVATION_ASSIGN_LATER,
  CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED,
  CREATE_RESERVATION_HK_CHIP,
  CREATE_RESERVATION_OCCUPIED_DISPLAY,
  CREATE_RESERVATION_ROOM_EMPTY,
  CREATE_RESERVATION_ROOM_STALE_DATE_WARN,
  CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN,
  CREATE_RESERVATION_SECTION6_ISSUE,
  CREATE_RESERVATION_SECTION6_LOCKED_NON_GOALS,
  CREATE_RESERVATION_SECTION6_MIGRATION,
  CREATE_RESERVATION_SECTION6_MIGRATION_REASON,
  CREATE_RESERVATION_SECTION6_PERMISSION_DOC,
  CREATE_RESERVATION_SECTION6_PROGRAMME_RULE,
  CREATE_RESERVATION_SECTION6_SCOPE,
  CREATE_RESERVATION_SECTION6_TIP_AC_MAP,
  CREATE_RESERVATION_STALE_ROOM_RULE,
  CREATE_RESERVATION_STICKY_ROOM_LABEL,
  CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN,
  CREATE_RESERVATION_UNASSIGNED_LABEL,
  formatAssignedRoomLabel,
  shouldClearStaleAssignedRoom,
  shouldWarnRoomClearedOnTypeChange,
  stickyRoomAssignmentLabel,
} from "./create-reservation-phase1-section6.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const CR6 = Array.from({ length: 22 }, (_, i) => `AC-CR6-${i + 1}`);

describe("Create Reservation Phase 1 Section 6 lock — AC-CR6-1…22", () => {
  it("locks AC-CR6-1…22 (Spec #143 / issue #145)", () => {
    assert.deepEqual([...CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION6], CR6);
    assert.equal(CREATE_RESERVATION_SECTION6_ISSUE, 145);
    assert.deepEqual(CREATE_RESERVATION_SECTION6_TIP_AC_MAP["plan-list-bind-unassigned"], [
      "AC-CR6-1",
      "AC-CR6-2",
      "AC-CR6-3",
      "AC-CR6-4",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION6_TIP_AC_MAP["plan-conflict-warn-sticky"], [
      "AC-CR6-5",
      "AC-CR6-6",
      "AC-CR6-7",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION6_TIP_AC_MAP["plan-no-second-writer"], [
      "AC-CR6-8",
      "AC-CR6-9",
      "AC-CR6-10",
      "AC-CR6-11",
    ]);
    assert.deepEqual(CREATE_RESERVATION_SECTION6_TIP_AC_MAP["plan-out-gates"], [
      "AC-CR6-12",
      "AC-CR6-13",
      "AC-CR6-14",
      "AC-CR6-15",
      "AC-CR6-16",
      "AC-CR6-17",
      "AC-CR6-18",
      "AC-CR6-19",
      "AC-CR6-20",
      "AC-CR6-21",
      "AC-CR6-22",
    ]);
    assert.equal(CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN, "toast");
    assert.equal(CREATE_RESERVATION_STALE_ROOM_RULE, "clear-to-unassigned-toast");
    assert.equal(CREATE_RESERVATION_OCCUPIED_DISPLAY, "omit");
    assert.equal(CREATE_RESERVATION_STICKY_ROOM_LABEL, "Room");
    assert.equal(CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED, true);
    assert.equal(CREATE_RESERVATION_HK_CHIP, "omit");
  });

  it("AC-CR6-1 Specific-room list is filtered by selected room type + stay dates via listAssignableRooms", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /listAssignableRooms/);
    assert.match(page, /\["assignable-rooms", restaurantId, roomTypeId, arrival, departure\]/);
    assert.match(page, /CreateReservationRoomAssignment/);
    assert.match(assignment, /data-testid="create-reservation-room-assignment"/);
    assert.match(assignment, /data-testid="room-assignment-list"/);
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.match(listFn, /\.eq\("room_type_id", data\.roomTypeId\)/);
    assert.match(listFn, /\.eq\("active", true\)/);
    assert.match(listFn, /\.eq\("status", "available"\)/);
    assert.match(listFn, /\.lt\("arrival_date", departure\)/);
    assert.match(listFn, /\.gt\("departure_date", arrival\)/);
    assert.match(page, /enabled: canManage && datesValid && !!roomTypeId/);
    assert.doesNotMatch(page, /listAllRoomsInHouse|all rooms in house/i);
  });

  it("AC-CR6-2 Selecting a room binds roomId → _room_id on the same writer", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.match(page, /createReservation/);
    assert.match(page, /roomId: roomId === UNASSIGNED \? null : roomId/);
    assert.match(functions, /export const createReservation/);
    assert.match(functions, /roomId: idSchema\.nullable\(\)\.optional\(\)/);
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(functions, /_room_id: \(data\.roomId \?\? null\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(functions, /insert\("hotel_reservations"\)/);
  });

  it("AC-CR6-3 Unassigned create is allowed; canSubmit does not require a specific room", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    assert.match(page, /const UNASSIGNED = "unassigned"/);
    assert.match(page, /roomId: roomId === UNASSIGNED \? null : roomId/);
    assert.match(page, /the stay can still be booked and assigned later/);
    assert.equal(CREATE_RESERVATION_ROOM_EMPTY.includes("assigned later"), true);
    assert.match(assignment, /data-testid="room-assignment-unassigned"/);
    assert.equal(CREATE_RESERVATION_ASSIGN_LATER, "Assign later");
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
    assert.doesNotMatch(page, /forceRoomAssign|requiredRoomId|assign before create/);
    const submitStart = page.indexOf("canSubmitCreateReservation({");
    assert.ok(submitStart > 0);
    const submitBlock = page.slice(submitStart, page.indexOf("});", submitStart));
    assert.doesNotMatch(submitBlock, /roomId/);
  });

  it("AC-CR6-4 Walk-in honesty: FO WalkInDialog requires a room; create path does not", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const functions = readRel("./reservations.functions.ts");
    const walkInStart = dialogs.indexOf("export function WalkInDialog");
    const walkIn = dialogs.slice(walkInStart);
    assert.equal(CREATE_RESERVATION_FO_WALKIN_ROOM_REQUIRED, true);
    assert.match(walkIn, /createReservation/);
    assert.match(walkIn, /disabled=\{!guest \|\| !roomTypeId \|\| !roomId \|\| !ratePlanId/);
    assert.doesNotMatch(walkIn, /Assign later|unassigned/);
    assert.match(page, /createReservation/);
    assert.doesNotMatch(page, /bookingSource === ["']walk_in["'][\s\S]{0,120}roomId/);
    assert.doesNotMatch(page, /walk_in[\s\S]{0,80}requiredRoom/);
    assert.doesNotMatch(dialogs, /createWalkInReservation|create_walk_in_reservation/);
    assert.match(functions, /export const createReservation/);
  });

  it("AC-CR6-5 Conflict: occupied omitted; ROOM_* errors are visible; no overbook success path", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    const functions = readRel("./reservations.functions.ts");
    const server = readRel("./reservations.server.ts");
    const sql = readRel("../../../../drizzle/migrations/0013_create_hotel_reservations.sql");
    assert.equal(CREATE_RESERVATION_OCCUPIED_DISPLAY, "omit");
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.match(listFn, /\.filter\(\(r\) => !taken\.has\(r\.id\)\)/);
    assert.match(sql, /assert_reservation_capacity/);
    assert.match(sql, /RAISE EXCEPTION 'ROOM_ALREADY_BOOKED'/);
    assert.match(sql, /RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE'/);
    assert.match(server, /ROOM_ALREADY_BOOKED: "That room is already booked or occupied/);
    assert.match(server, /ROOM_NOT_ASSIGNABLE:/);
    assert.match(page, /toast\.error\(error\.message\)/);
    assert.doesNotMatch(page, /swallowRoomClash|ignoreRoomAlreadyBooked|bookOccupiedAnyway/);
    assert.doesNotMatch(assignment, /overbook|book occupied|occupied-with-warn/i);
    assert.doesNotMatch(functions, /if \(error\.message\.includes\("ROOM_ALREADY_BOOKED"\)\) return/);
  });

  it("AC-CR6-6 Type change clears room + toast; date change revalidates and clears stale", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_TYPE_CHANGE_ROOM_WARN, "toast");
    assert.equal(CREATE_RESERVATION_STALE_ROOM_RULE, "clear-to-unassigned-toast");
    assert.match(page, /setRoomId\(UNASSIGNED\)/);
    assert.match(page, /shouldWarnRoomClearedOnTypeChange/);
    assert.match(page, /toast\.warning\(CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN\)/);
    assert.match(page, /shouldClearStaleAssignedRoom/);
    assert.match(page, /toast\.warning\(CREATE_RESERVATION_ROOM_STALE_DATE_WARN\)/);
    assert.match(page, /handleArrivalChange/);
    assert.match(page, /\["assignable-rooms", restaurantId, roomTypeId, arrival, departure\]/);
    assert.match(CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN, /Unassigned/);
    assert.match(CREATE_RESERVATION_ROOM_STALE_DATE_WARN, /Unassigned/);
    assert.equal(
      shouldWarnRoomClearedOnTypeChange({ previousRoomId: "room-1", unassignedValue: "unassigned" }),
      true,
    );
    assert.equal(
      shouldWarnRoomClearedOnTypeChange({ previousRoomId: "unassigned", unassignedValue: "unassigned" }),
      false,
    );
    assert.equal(
      shouldClearStaleAssignedRoom({
        roomId: "room-1",
        unassignedValue: "unassigned",
        roomsReady: true,
        assignableIds: ["room-2"],
      }),
      true,
    );
    assert.equal(
      shouldClearStaleAssignedRoom({
        roomId: "room-1",
        unassignedValue: "unassigned",
        roomsReady: true,
        assignableIds: ["room-1"],
      }),
      false,
    );
    assert.equal(
      shouldClearStaleAssignedRoom({
        roomId: "room-1",
        unassignedValue: "unassigned",
        roomsReady: false,
        assignableIds: [],
      }),
      false,
    );
    assert.equal(
      shouldClearStaleAssignedRoom({
        roomId: "unassigned",
        unassignedValue: "unassigned",
        roomsReady: true,
        assignableIds: [],
      }),
      false,
    );
  });

  it("AC-CR6-7 Sticky shows Room {number} (+ floor) or honest Unassigned", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_STICKY_ROOM_LABEL, "Room");
    assert.equal(CREATE_RESERVATION_UNASSIGNED_LABEL, "Unassigned");
    assert.match(page, /data-testid="create-reservation-summary"/);
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /data-testid="summary-room-assignment"/);
    assert.match(page, />Room</);
    assert.match(page, /stickyRoomAssignmentLabel\(/);
    assert.equal(formatAssignedRoomLabel({ roomNumber: "101", floor: null }), "Room 101");
    assert.equal(formatAssignedRoomLabel({ roomNumber: "101", floor: "2" }), "Room 101 · Floor 2");
    assert.equal(
      stickyRoomAssignmentLabel({
        roomTypeId: "",
        roomId: "unassigned",
        unassignedValue: "unassigned",
        room: null,
      }),
      "Unassigned",
    );
    assert.equal(
      stickyRoomAssignmentLabel({
        roomTypeId: "rt-1",
        roomId: "unassigned",
        unassignedValue: "unassigned",
        room: null,
      }),
      "Unassigned",
    );
    assert.equal(
      stickyRoomAssignmentLabel({
        roomTypeId: "rt-1",
        roomId: "room-1",
        unassignedValue: "unassigned",
        room: { roomNumber: "204", floor: "3" },
      }),
      "Room 204 · Floor 3",
    );
    assert.doesNotMatch(page, /fakeRoomNumber|inventedRoom/);
  });

  it("AC-CR6-8 No second assignment writer; walk-in remains createReservation", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    assert.match(page, /createReservation/);
    assert.doesNotMatch(page, /assignReservationRoom/);
    assert.doesNotMatch(page, /assert_room_assignable/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /create_hotel_reservation_priced/);
    assert.doesNotMatch(createFn, /assignReservationRoom/);
    assert.match(functions, /export const assignReservationRoom/);
    assert.match(dialogs, /createReservation/);
    assert.doesNotMatch(dialogs, /createWalkInReservation/);
  });

  it("AC-CR6-9 Existing permission gates preserved; no requireRoomManager on create assign", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const rooms = readRel("./rooms.functions.ts");
    assert.match(page, /requireRoutePackage\("pms"\)/);
    assert.match(page, /getBookingsAccess/);
    assert.match(functions, /requireReservationManager/);
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.match(listFn, /await requireReservationManager/);
    assert.doesNotMatch(listFn, /requireRoomManager/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /await requireReservationManager/);
    assert.doesNotMatch(createFn, /requireRoomManager/);
    assert.match(rooms, /export const saveRoom/);
    assert.match(CREATE_RESERVATION_SECTION6_PERMISSION_DOC, /requireReservationManager/);
    assert.match(CREATE_RESERVATION_SECTION6_PERMISSION_DOC, /no RLS/);
    assert.doesNotMatch(page, /new entitlement|requirePackage\("create-reservation"\)/);
    assert.doesNotMatch(page, /requireRoomManager/);
  });

  it("AC-CR6-10 Section 6 does not claim Phase 1 or Create Reservation DONE", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(CREATE_RESERVATION_PHASE1_COMPLETE, false);
    assert.equal(CREATE_RESERVATION_MODULE_DONE, false);
    assert.match(CREATE_RESERVATION_SECTION6_SCOPE, /Section 6 is Room assignment/);
    assert.match(CREATE_RESERVATION_SECTION6_SCOPE, /later sections/);
    assert.doesNotMatch(page, /Phase 1 complete|Create Reservation DONE/i);
    assert.match(page, /CREATE_RESERVATION_SECTION6_SCOPE/);
  });

  it("AC-CR6-11 Guest Waves 1–5 + GE1–GE3 stay closed", () => {
    const helpers = readRel("./create-reservation-phase1-section6.ts");
    const section1 = readRel("./create-reservation-phase1.ts");
    assert.match(helpers, /Waves 1–5 \+ GE1–GE3 stay closed/);
    assert.match(section1, /Waves 1–5 \+ GE1–GE3 stay closed/);
    const wave1 = readRel("./guest-profile-wave1.ts");
    const ge2 = readRel("./guest-profile-individual.ts");
    assert.match(wave1, /GUEST_PROFILE_CARDS|Wave 1/);
    assert.match(ge2, /Waves 1–5 stay closed/);
  });

  it("AC-CR6-12 + create room is OUT — no saveRoom on this page", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    assert.doesNotMatch(page, /saveRoom/);
    assert.doesNotMatch(assignment, /saveRoom|createRoom|Add room/);
    assert.doesNotMatch(page, /create-room-from-reservation|room-inventory-drawer/);
  });

  it("AC-CR6-13 No invented LIVE OTA / RMS / allotment / overbooking engine", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    const helpers = readRel("./create-reservation-phase1-section6.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.match(helpers, /LIVE OTA \/ RMS \/ allotment/);
    assert.match(page, /listAssignableRooms/);
    assert.doesNotMatch(page, /channel manager|rms yield|allotmentPickup|ota assignment/i);
    assert.doesNotMatch(assignment, /listOtaRooms|getRmsYield|overbookRoom/);
    assert.doesNotMatch(functions, /rms_yield|ota_assignment|allotment_steal|overbook_engine/);
  });

  it("AC-CR6-14 HK full board OUT — picker does not filter or show housekeeping status", () => {
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_HK_CHIP, "omit");
    assert.doesNotMatch(assignment, /housekeepingStatus|housekeeping_status|HK chip|dirty|inspected/);
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.doesNotMatch(listFn, /\.eq\("housekeeping_status"/);
    assert.doesNotMatch(listFn, /\.neq\("housekeeping_status"/);
  });

  it("AC-CR6-15 RTC / Guarantee product / packages / email are not expanded", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    assert.doesNotMatch(page, /roomTypeCharged|rtcRoomType|Send confirmation email/);
    assert.doesNotMatch(page, /packagePicker|addPackage|emailConfirmation|smsConfirmation/);
    assert.doesNotMatch(assignment, /Guarantee|packagePicker|RTC/);
    assert.match(CREATE_RESERVATION_SECTION6_SCOPE, /later sections/);
  });

  it("AC-CR6-16 Server / RPC remains source of truth; UI cannot override ROOM_* / NO_AVAILABILITY", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./reservations.functions.ts");
    const server = readRel("./reservations.server.ts");
    assert.match(functions, /create_hotel_reservation_priced/);
    assert.match(server, /NO_AVAILABILITY: "No rooms of that type are available for those dates\."/);
    assert.match(server, /ROOM_ALREADY_BOOKED/);
    assert.match(server, /ROOM_NOT_ASSIGNABLE/);
    assert.doesNotMatch(page, /swallowAvailability|ignoreNoAvailability|overrideCapacity/);
    assert.doesNotMatch(functions, /if \(error\.message\.includes\("NO_AVAILABILITY"\)\) return/);
    assert.match(page, /available: selectedType\?\.available \?\? 0/);
  });

  it("AC-CR6-17 Section 4 type availability fail-closed create is not weakened", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /CreateReservationRoomType/);
    assert.match(page, /available: selectedType\?\.available \?\? 0/);
    assert.equal(
      canSubmitCreateReservation({
        hasGuest: true,
        datesValid: true,
        roomTypeId: "rt-1",
        available: 0,
        status: "pending",
        priced: true,
        canCreateUnpriced: true,
      }),
      false,
    );
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
    assert.doesNotMatch(page, /forceRoomAssign|requiredRoomId/);
  });

  it("AC-CR6-18 Locked non-goals in §4 are absent", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    const helpers = readRel("./create-reservation-phase1-section6.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION6_LOCKED_NON_GOALS.length, 12);
    assert.match(helpers, /\+ create room \/ saveRoom on this page/);
    assert.match(helpers, /Phase 1 \/ Create Reservation DONE claim/);
    assert.doesNotMatch(page, /commission settlement|rooming list|CR-100|Fixed Rate/i);
    assert.doesNotMatch(assignment, /channel manager|yield engine|housekeeping board/i);
    assert.doesNotMatch(functions, /sendConfirmation|createDeposit|offlineQueue|allotmentPickup/i);
  });

  it("AC-CR6-19 Migration is NONE; capability-only; no RLS model change", () => {
    const helpers = readRel("./create-reservation-phase1-section6.ts");
    const functions = readRel("./reservations.functions.ts");
    assert.equal(CREATE_RESERVATION_SECTION6_MIGRATION, "NONE");
    assert.match(CREATE_RESERVATION_SECTION6_MIGRATION_REASON, /already exist/);
    assert.match(CREATE_RESERVATION_SECTION6_MIGRATION_REASON, /Flag Abel: NOT required/);
    assert.match(helpers, /Migration for this section: NONE/);
    assert.match(CREATE_RESERVATION_SECTION6_PERMISSION_DOC, /no RLS/);
    const drizzleDir = join(here, "../../../../drizzle/migrations");
    const supabaseDir = join(here, "../../../../supabase/migrations");
    for (const file of readdirSync(drizzleDir)) {
      assert.doesNotMatch(file, /create.reservation.phase1.section6|cr6.section6|room_assign_create/i);
    }
    if (existsSync(supabaseDir)) {
      for (const file of readdirSync(supabaseDir)) {
        assert.doesNotMatch(file, /create.reservation.phase1.section6|cr6.section6|room_assign_create/i);
      }
    }
    assert.doesNotMatch(functions, /create policy|alter policy|enable row level security/i);
  });

  it("AC-CR6-20 Additive expansion of existing /restaurant/bookings/new — no second product", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /createFileRoute\("\/restaurant\/bookings\/new"\)/);
    assert.match(page, /createReservation/);
    assert.match(page, /CreateReservationRoomAssignment/);
    assert.match(page, /Room assignment \(optional\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/bookings\/create"\)/);
    assert.doesNotMatch(page, /createFileRoute\("\/restaurant\/pms\/reservations\/new"\)/);
    assert.doesNotMatch(page, /legacy chrome|Fixed Rate LIVE/i);
  });

  it("AC-CR6-21 Programme rule honoured: NORU UI, + create room OUT", () => {
    const assignment = readRel("../components/bookings/create-reservation-room-assignment.tsx");
    assert.match(CREATE_RESERVATION_SECTION6_PROGRAMME_RULE, /modern NORU UI/);
    assert.match(CREATE_RESERVATION_SECTION6_PROGRAMME_RULE, /Do not clone legacy chrome/);
    assert.match(CREATE_RESERVATION_SECTION6_PROGRAMME_RULE, /\+ create room OUT/);
    assert.match(assignment, /data-testid="create-reservation-room-assignment"/);
    assert.match(assignment, /CREATE_RESERVATION_SECTION6_SCOPE/);
    assert.doesNotMatch(assignment, /saveRoom|legacy PMS chrome/);
  });

  it("AC-CR6-22 Sticky room line composes with Section 5 rate/total — does not replace", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx") + readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(page, /data-testid="summary-room"/);
    assert.match(page, /data-testid="summary-rate"/);
    assert.match(page, /data-testid="summary-stay-total"/);
    assert.match(page, /data-testid="summary-availability"/);
    assert.match(page, /CreateReservationRate/);
    const roomIdx = page.indexOf('data-testid="summary-room"');
    const rateIdx = page.indexOf('data-testid="summary-rate"');
    const totalIdx = page.indexOf('data-testid="summary-stay-total"');
    assert.ok(roomIdx > 0 && rateIdx > roomIdx && totalIdx > rateIdx);
    assert.doesNotMatch(page, /replacePricingLines|removeStayTotal/);
  });
});
