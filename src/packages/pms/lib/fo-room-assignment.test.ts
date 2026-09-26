import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  UNABLE_TO_LOAD_ELIGIBLE_ROOMS,
  assignableListUi,
  formatRoomTypeLabel,
  noEligibleRoomsCopy,
} from "./fo-room-assignment.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO room assignment — selector states", () => {
  it("keeps loading, error, empty, and ready distinct", () => {
    assert.equal(assignableListUi({ isPending: true, isError: false, rooms: undefined }).status, "loading");
    assert.equal(assignableListUi({ isPending: false, isError: true, rooms: [] }).status, "error");
    assert.equal(assignableListUi({ isPending: false, isError: false, rooms: [] }).status, "empty");
    assert.equal(
      assignableListUi({ isPending: false, isError: false, rooms: [{ id: "room-1" }] }).status,
      "ready",
    );
    assert.notEqual(assignableListUi({ isPending: true, isError: false, rooms: [] }).status, "empty");
    assert.notEqual(assignableListUi({ isPending: false, isError: true, rooms: [] }).status, "empty");
  });

  it("RoomSelect shows an error, not no-availability copy, when the query fails", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const picker = dialogs.slice(dialogs.indexOf("function RoomSelect"), dialogs.indexOf("export function AssignRoomDialog"));
    assert.match(picker, /assignableListUi/);
    assert.match(picker, /AssignableRoomsHint/);
    assert.match(picker, /retry:\s*false/);
    const hint = readRel("../components/frontoffice/assignable-rooms-hint.tsx");
    assert.match(hint, /fo-assignable-rooms-error/);
    assert.match(hint, /fo-assignable-rooms-empty/);
    assert.match(hint, /fo-assignable-rooms-loading/);
    assert.match(hint, /UNABLE_TO_LOAD_ELIGIBLE_ROOMS/);
    assert.match(hint, /detail \?/);
    assert.equal(UNABLE_TO_LOAD_ELIGIBLE_ROOMS, "Unable to load eligible rooms.");
    assert.doesNotMatch(hint, /status === "error"[\s\S]*No eligible/);
    const emptyCopy = noEligibleRoomsCopy("Deluxe-King (DLX-J)");
    assert.equal(emptyCopy, "No eligible Deluxe-King (DLX-J) rooms are free for these dates.");
    assert.match(hint, /noEligibleRoomsCopy/);
  });

  it("check-in, walk-in, and upgrade selectors reuse the same error/empty contract", () => {
    const checkIn = readRel("../components/frontoffice/fo-check-in-stepper.tsx");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const amend = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(checkIn, /AssignableRoomsHint/);
    assert.match(checkIn, /assignableListUi/);
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkIn, /AssignableRoomsHint/);
    assert.match(amend, /AssignableRoomsHint/);
  });
});

describe("FO room assignment — listAssignableRooms contract", () => {
  it("does not swallow clash or non-compatibility RPC errors", () => {
    const functions = readRel("./reservations.functions.ts");
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.match(listFn, /getAssignmentEligibilityCompat/);
    assert.match(listFn, /clashError/);
    assert.match(listFn, /if \(clashError\) throw new Error\(clashError\.message\)/);
    assert.match(listFn, /excludeReservationId/);
    assert.match(listFn, /\.neq\("id", data\.excludeReservationId\)/);
    assert.match(listFn, /\.eq\("room_type_id", data\.roomTypeId\)/);
    assert.match(listFn, /\.eq\("active", true\)/);
    assert.match(listFn, /\.lt\("arrival_date", departure\)/);
    assert.match(listFn, /\.gt\("departure_date", arrival\)/);
    assert.match(listFn, /\.in\("status", \["pending", "confirmed", "checked_in"\]\)/);
    assert.doesNotMatch(listFn, /catch\s*\{[\s\S]*return \[\]/);
    assert.doesNotMatch(listFn, /eligible:\s*true,\s*\n\s*blockers:\s*\[\]/);
  });

  it("keeps missing-function fallback only inside the compatibility wrapper", () => {
    const compat = readRel("./room-inventory-compat.ts");
    const assignStart = compat.indexOf("export async function getAssignmentEligibilityCompat");
    const assignFn = compat.slice(assignStart, compat.indexOf("function hasAdvancedRestrictionInput"));
    assert.match(assignFn, /isMissingRpcFunction\(modern\.error, "pms_evaluate_room_assignment"\)/);
    assert.match(assignFn, /legacyFallback\(\)/);
    assert.match(assignFn, /if \(!row \|\| !\("eligible" in row\)\)/);
    assert.doesNotMatch(assignFn, /code === "42501"/);
    assert.doesNotMatch(assignFn, /INSUFFICIENT_PRIVILEGE[\s\S]*legacyFallback/);
  });
});

describe("FO room assignment — user JWT on eligibility RPC", () => {
  it("pins the server-fn user token on PostgREST fetch instead of using service_role", () => {
    const middleware = readRel("../../../integrations/supabase/auth-middleware.ts");
    assert.match(middleware, /createUserScopedFetch\(SUPABASE_PUBLISHABLE_KEY!, token\)/);
    assert.doesNotMatch(middleware, /SUPABASE_SERVICE_ROLE_KEY/);
    const listFn = readRel("./reservations.functions.ts");
    const listStart = listFn.indexOf("export const listAssignableRooms");
    const handler = listFn.slice(listStart, listFn.indexOf("export const listReservations"));
    assert.match(handler, /getAssignmentEligibilityCompat\(\s*context\.supabase/);
    assert.doesNotMatch(handler, /supabaseAdmin/);
  });
});

describe("FO room assignment — eligibility rules remain canonical", () => {
  it("does not loosen overlap, OOO, blocks, or HK assignment policy in the list handler", () => {
    const functions = readRel("./reservations.functions.ts");
    const listStart = functions.indexOf("export const listAssignableRooms");
    const listFn = functions.slice(listStart, functions.indexOf("export const listReservations"));
    assert.doesNotMatch(listFn, /forCheckIn:\s*true/);
    assert.doesNotMatch(listFn, /housekeeping_status === "inspected"/);
    assert.doesNotMatch(listFn, /status !== "out_of_order"/);
    const compat = readRel("./room-inventory-compat.ts");
    assert.match(compat, /_for_check_in: input.forCheckIn \?\? false/);
  });
});

describe("FO room assignment — duplicate type names", () => {
  it("disambiguates Deluxe-King by code without merging types", () => {
    assert.equal(formatRoomTypeLabel("Deluxe-King", "DLX-J"), "Deluxe-King (DLX-J)");
    assert.equal(formatRoomTypeLabel("Deluxe-King", "DLX-K"), "Deluxe-King (DLX-K)");
    assert.equal(formatRoomTypeLabel("Deluxe-King (DLX-J)", "DLX-J"), "Deluxe-King (DLX-J)");
    assert.equal(formatRoomTypeLabel("Deluxe-King", null), "Deluxe-King");
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const picker = dialogs.slice(dialogs.indexOf("function RoomSelect"), dialogs.indexOf("export function AssignRoomDialog"));
    assert.match(picker, /formatRoomTypeLabel\(stay\.roomTypeName, stay\.roomTypeCode\)/);
    const walkIn = dialogs.slice(dialogs.indexOf("export function WalkInDialog"));
    assert.match(walkIn, /formatRoomTypeLabel\(t\.name, t\.code\)/);
    const amend = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(amend, /formatRoomTypeLabel\(t\.name, t\.code\)/);
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.doesNotMatch(calendar, /formatRoomTypeLabel/);
  });
});
