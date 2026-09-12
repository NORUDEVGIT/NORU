import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shouldSuppressRestaurantPmsRail, LIVE_HORIZONS, RESERVED_BADGE_SLOTS } from "./front-office-shell.ts";
import {
  HARD_ILLEGAL_TOAST,
  NO_STAYS_MATCH_FILTERS,
  RACK_ARRIVAL_LOCKED,
  RACK_LIST_PAGE_SIZE_MAX,
  RATE_IMPACT_UNAVAILABLE_LABEL,
  UNAVAILABLE_TO_VERIFY,
  canConfirmRackChecks,
  cancelRackConfirm,
  classifyVerticalDrop,
  confirmRackAction,
  evaluateDateChecks,
  evaluateMoveChecks,
  liveStayBadges,
  onRackDrop,
  onRackResizeRelease,
  rackRateImpact,
  shouldShowDragHandle,
  type RackDatesDraft,
  type RackMoveDraft,
} from "./fo-rack-power.ts";

const baseMove = (): RackMoveDraft => ({
  kind: "move_room",
  reservationId: "res-1",
  guestName: "Ada Smith",
  confirmationNumber: "NORU-1",
  status: "checked_in",
  currentRoomId: "room-1",
  currentRoomNumber: "101",
  currentRoomTypeId: "type-a",
  currentRoomTypeName: "Deluxe",
  targetRoomId: "room-2",
  targetRoomNumber: "102",
  targetRoomTypeId: "type-a",
  targetRoomTypeName: "Deluxe",
  targetStatus: "available",
  targetHousekeeping: "clean",
  hkKnown: true,
  arrivalDate: "2026-09-11",
  departureDate: "2026-09-14",
});

const baseDates = (): RackDatesDraft => ({
  kind: "change_dates",
  reservationId: "res-1",
  guestName: "Ada Smith",
  confirmationNumber: "NORU-1",
  status: "checked_in",
  currentRoomId: "room-1",
  currentRoomNumber: "101",
  currentRoomTypeId: "type-a",
  arrivalDate: "2026-09-11",
  departureDate: "2026-09-14",
  nextArrivalDate: "2026-09-11",
  nextDepartureDate: "2026-09-16",
  roomSubtotal: 360,
  nightlyRates: [
    { date: "2026-09-11", rate: 120 },
    { date: "2026-09-12", rate: 120 },
    { date: "2026-09-13", rate: 120 },
  ],
});

describe("FO-FS5 confirm-before-write", () => {
  it("drop and resize never invoke a write without Confirm", () => {
    const called: string[] = [];
    const writes = {
      moveReservationRoom: () => called.push("moveReservationRoom"),
      changeStayDates: () => called.push("changeStayDates"),
    };
    const drop = onRackDrop({ reservationId: "res-1", targetRoomId: "room-2" }, writes);
    const resize = onRackResizeRelease(
      { reservationId: "res-1", nextArrival: "2026-09-11", nextDeparture: "2026-09-16" },
      writes,
    );
    assert.equal(drop.invokedWrite, null);
    assert.equal(drop.write, false);
    assert.equal(resize.invokedWrite, null);
    assert.deepEqual(called, []);
  });

  it("Cancel is a no-op write", () => {
    const called: string[] = [];
    const result = cancelRackConfirm({
      moveReservationRoom: () => called.push("move"),
      changeStayDates: () => called.push("dates"),
    });
    assert.equal(result.invokedWrite, null);
    assert.deepEqual(called, []);
  });

  it("Confirm invokes the matching live write only when every check passes", () => {
    const called: string[] = [];
    const writes = {
      moveReservationRoom: () => called.push("moveReservationRoom"),
      changeStayDates: () => called.push("changeStayDates"),
    };
    const pass = evaluateMoveChecks(baseMove(), { state: "ready", roomIds: ["room-2"] }, false);
    assert.equal(canConfirmRackChecks(pass), true);
    assert.equal(confirmRackAction("move_room", pass, writes).invokedWrite, "moveReservationRoom");

    const dates = evaluateDateChecks(baseDates(), { state: "ready", roomIds: ["room-1"] }, false);
    assert.equal(canConfirmRackChecks(dates), true);
    assert.equal(confirmRackAction("change_dates", dates, writes).invokedWrite, "changeStayDates");

    const blocked = evaluateMoveChecks(
      { ...baseMove(), targetHousekeeping: "dirty" },
      { state: "ready", roomIds: ["room-2"] },
      false,
    );
    assert.equal(confirmRackAction("move_room", blocked, writes).invokedWrite, null);
    assert.deepEqual(called, ["moveReservationRoom", "changeStayDates"]);
  });
});

describe("FO-FS5 dirty / pickup Confirm block", () => {
  it("dirty and pickup fail Confirm; pending assignable stays unknown", () => {
    const dirty = evaluateMoveChecks(
      { ...baseMove(), targetHousekeeping: "dirty" },
      { state: "ready", roomIds: ["room-2"] },
      false,
    );
    assert.equal(dirty.find((c) => c.id === "housekeeping")?.state, "fail");
    assert.equal(canConfirmRackChecks(dirty), false);

    const pickup = evaluateMoveChecks(
      { ...baseMove(), targetHousekeeping: "pickup" },
      { state: "ready", roomIds: ["room-2"] },
      false,
    );
    assert.equal(pickup.find((c) => c.id === "housekeeping")?.state, "fail");
    assert.equal(canConfirmRackChecks(pickup), false);

    const pending = evaluateMoveChecks(baseMove(), { state: "pending" }, false);
    assert.equal(pending.find((c) => c.id === "availability")?.state, "unknown");
    assert.equal(pending.find((c) => c.id === "availability")?.detail, UNAVAILABLE_TO_VERIFY);
    assert.equal(canConfirmRackChecks(pending), false);

    const unknownHk = evaluateMoveChecks({ ...baseMove(), hkKnown: false }, { state: "ready", roomIds: ["room-2"] }, false);
    assert.equal(unknownHk.find((c) => c.id === "housekeeping")?.state, "unknown");
    assert.equal(canConfirmRackChecks(unknownHk), false);
  });
});

describe("FO-FS5 hard illegal snap-back", () => {
  it("known OOO, OOS and other type snap back without a sheet", () => {
    assert.equal(
      classifyVerticalDrop({
        reservationId: "res-1",
        currentRoomId: "room-1",
        stayRoomTypeId: "type-a",
        stayRoomTypeName: "Deluxe",
        targetRoomId: "room-9",
        targetStatus: "out_of_order",
        targetRoomTypeId: "type-a",
        targetRoomTypeName: "Deluxe",
      }).action,
      "snap_back",
    );
    assert.equal(
      classifyVerticalDrop({
        reservationId: "res-1",
        currentRoomId: "room-1",
        stayRoomTypeId: "type-a",
        stayRoomTypeName: "Deluxe",
        targetRoomId: "room-9",
        targetStatus: "out_of_service",
        targetRoomTypeId: "type-a",
        targetRoomTypeName: "Deluxe",
      }).action,
      "snap_back",
    );
    const typeChange = classifyVerticalDrop({
      reservationId: "res-1",
      currentRoomId: "room-1",
      stayRoomTypeId: "type-a",
      stayRoomTypeName: "Deluxe",
      targetRoomId: "room-9",
      targetStatus: "available",
      targetRoomTypeId: "type-b",
      targetRoomTypeName: "Suite",
    });
    assert.equal(typeChange.action, "snap_back");
    if (typeChange.action === "snap_back") {
      assert.equal(typeChange.message, HARD_ILLEGAL_TOAST.different_room_type);
    }
    assert.equal(
      classifyVerticalDrop({
        reservationId: "res-1",
        currentRoomId: "room-1",
        stayRoomTypeId: "type-a",
        stayRoomTypeName: "Deluxe",
        targetRoomId: "room-2",
        targetStatus: "available",
        targetRoomTypeId: "type-a",
        targetRoomTypeName: "Deluxe",
      }).action,
      "confirm_sheet",
    );
  });
});

describe("FO-FS5 date honesty", () => {
  it("blocks arrival changes and never invents rate math", () => {
    const shifted = evaluateDateChecks(
      { ...baseDates(), nextArrivalDate: "2026-09-13", nextDepartureDate: "2026-09-16" },
      { state: "ready", roomIds: ["room-1"] },
      false,
    );
    assert.equal(shifted.find((c) => c.id === "arrival")?.state, "fail");
    assert.equal(shifted.find((c) => c.id === "arrival")?.detail, RACK_ARRIVAL_LOCKED);
    assert.equal(canConfirmRackChecks(shifted), false);

    const missingRate = rackRateImpact({ ...baseDates(), roomSubtotal: null, nightlyRates: [] });
    assert.equal(missingRate.kind, "unavailable");
    if (missingRate.kind === "unavailable") {
      assert.equal(missingRate.label, RATE_IMPACT_UNAVAILABLE_LABEL);
    }
  });
});

describe("FO-FS5 badges, horizons, phone handle", () => {
  it("badge IDs are Live only when data exists", () => {
    assert.deepEqual(
      liveStayBadges({ guestVip: true, source: "group", specialRequests: "Near lift" }).map((b) => b.id),
      ["vip_badge", "group_badge", "special_request_badge"],
    );
    assert.deepEqual(liveStayBadges({ guestVip: false, source: "staff", specialRequests: "" }), []);
    assert.deepEqual(
      liveStayBadges({ guestVip: false, source: "CORPORATE", specialRequests: null }).map((b) => b.id),
      ["corporate_badge"],
    );
    assert.deepEqual(
      liveStayBadges({ guestVip: false, hasOpenDiscrepancy: true }).map((b) => b.id),
      ["room_discrepancy_badge"],
    );
    assert.deepEqual(liveStayBadges({ guestVip: false, hasOpenDiscrepancy: false }).map((b) => b.id), []);
    assert.ok(RESERVED_BADGE_SLOTS.filter((slot) => slot.lane === "live").every((slot) => slot.lane === "live"));
    assert.ok(RESERVED_BADGE_SLOTS.some((slot) => slot.id === "early_arrival_badge" && slot.lane === "empty"));
    assert.ok(RESERVED_BADGE_SLOTS.some((slot) => slot.id === "late_arrival_badge" && slot.lane === "empty"));
    assert.deepEqual(LIVE_HORIZONS, [1, 7, 14, 30]);
    assert.equal(shouldShowDragHandle("phone"), false);
    assert.equal(shouldShowDragHandle("desktop"), true);
    assert.equal(NO_STAYS_MATCH_FILTERS, "No stays match these filters.");
    assert.ok(RACK_LIST_PAGE_SIZE_MAX >= 400);
  });
});

describe("FO-FS0 rail lock", () => {
  it("shouldSuppressRestaurantPmsRail(\"front-office\") still true", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /shouldSuppressRestaurantPmsRail/);
    assert.match(shell, /hidePackageRail/);
  });
});

describe("FO-FS5 source locks", () => {
  it("calendar drop opens confirm and never writes; menu Room Move stays dirty-unblocked", () => {
    const calendar = readFileSync(new URL("../components/frontoffice/room-rack-calendar.tsx", import.meta.url), "utf8");
    assert.match(calendar, /FoRackConfirmSheet/);
    assert.match(calendar, /LIVE_HORIZONS/);
    assert.match(calendar, /collectRackReservationPages/);
    assert.match(calendar, /fo-drag-handle/);
    assert.match(calendar, /shouldShowDragHandle/);
    assert.doesNotMatch(calendar, /Coming soon drag/);
    assert.doesNotMatch(calendar, /RACK_COMING_SOON_FILTERS/);
    assert.doesNotMatch(calendar, /yield heatmap/i);
    assert.match(calendar, /NO_STAYS_MATCH_FILTERS/);

    const sheet = readFileSync(new URL("../components/frontoffice/fo-rack-confirm-sheet.tsx", import.meta.url), "utf8");
    assert.match(sheet, /moveReservationRoom/);
    assert.match(sheet, /changeStayDates/);
    assert.match(sheet, /canConfirmRackChecks/);
    assert.match(sheet, /#C89933/);

    const dialogs = readFileSync(new URL("../components/frontoffice/front-office-dialogs.tsx", import.meta.url), "utf8");
    const moveFn = dialogs.slice(dialogs.indexOf("export function RoomMoveDialog"));
    assert.doesNotMatch(moveFn.slice(0, moveFn.indexOf("export function StayDatesDialog")), /isRoomReady/);

    const workspace = readFileSync(
      new URL("../components/workspaces/front-office-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(workspace, /shouldSuppressRestaurantPmsRail/);
    assert.match(workspace, /Room Rack \+ Calendar/);
  });
});
