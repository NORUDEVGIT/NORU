import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { foSearchFromUnknown, groupRackRooms, LIVE_HORIZONS, parseCalendarHorizon } from "./front-office-shell.ts";
import {
  assignedNotReadyQueueItem,
  filterRoomOpsHistory,
  foRoomActionHints,
  occupancyOnDate,
  queueFromExceptionRows,
  vacantQuickViewHasNoStay,
  type FoRoomStaySnippet,
} from "./front-office-room-operations.ts";
import { classifyVerticalDrop } from "./fo-rack-power.ts";
import type { ExceptionRow } from "./fo-exceptions.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const stay: FoRoomStaySnippet = {
  id: "stay-1",
  confirmationNumber: "NORU-1",
  guestId: "guest-1",
  guestName: "Ada Lovelace",
  guestVip: false,
  status: "checked_in",
  arrivalDate: "2026-09-25",
  departureDate: "2026-09-27",
  roomTypeId: "type-a",
  roomTypeName: "Deluxe",
  ratePlanName: null,
};

describe("FO Phase 1 — Room Quick View honesty", () => {
  it("identifies occupied vs vacant without inventing a stay", () => {
    assert.equal(occupancyOnDate(stay, "2026-09-25"), true);
    assert.equal(occupancyOnDate(stay, "2026-09-27"), false);
    assert.equal(vacantQuickViewHasNoStay({ occupancy: "vacant", currentStay: null }), true);
    assert.equal(vacantQuickViewHasNoStay({ occupancy: "occupied", currentStay: stay }), false);
    assert.equal(vacantQuickViewHasNoStay({ occupancy: "vacant", currentStay: stay }), false);
  });

  it("exposes honest action hints from occupancy/HK/block signals", () => {
    const occupied = foRoomActionHints({
      occupancy: "occupied",
      physicalStatus: "available",
      ready: false,
      currentStay: stay,
      assignedArrival: null,
      unassignedArrival: false,
      blocks: [],
      hasDiscrepancy: false,
    });
    assert.equal(occupied.canMoveGuest, true);
    assert.equal(occupied.canCheckOut, true);
    assert.equal(occupied.canAssign, false);
    assert.equal(occupied.canCheckIn, false);

    const vacantOoo = foRoomActionHints({
      occupancy: "vacant",
      physicalStatus: "out_of_order",
      ready: false,
      currentStay: null,
      assignedArrival: null,
      unassignedArrival: false,
      blocks: [{ id: "b1", kind: "room", blockType: "ooo", reason: "pipe", startDate: "2026-09-25", endDate: "2026-09-28", groupId: null }],
      hasDiscrepancy: false,
    });
    assert.equal(vacantOoo.hasBlock, true);
    assert.equal(vacantOoo.canMoveGuest, false);
    assert.equal(vacantOoo.canOpenStay, false);
  });
});

describe("FO Phase 1 — queue and history are derived", () => {
  it("maps exception rows without a persisted resolved flag", () => {
    const rows: ExceptionRow[] = [
      {
        id: "ex-1",
        type: "unassigned",
        severity: "high",
        label: "Unassigned arrival",
        reason: "No room",
        stayId: "stay-1",
        guestName: "Ada",
        confirmationNumber: "NORU-1",
        roomNumber: null,
        arrivalDate: "2026-09-25",
        departureDate: "2026-09-26",
        ageDays: 0,
        primaryCta: { id: "assign", label: "Assign room" },
        secondary: "none",
        waived: false,
        roomId: null,
        roomTypeName: "Deluxe",
        focusDate: "2026-09-25",
        secondaryCta: null,
      },
    ];
    const queue = queueFromExceptionRows(rows);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.kind, "unassigned");
    assert.equal("resolved" in queue[0]!, false);
    const notReady = assignedNotReadyQueueItem({
      stayId: "stay-2",
      guestName: "Ada",
      confirmationNumber: "NORU-2",
      roomId: "room-1",
      roomNumber: "101",
      reason: "Housekeeping dirty",
    });
    assert.equal(notReady.id, "assigned_not_ready:stay-2");
  });

  it("filters room history by date and event without a second store", () => {
    const rows = [
      {
        id: "h1",
        source: "reservation" as const,
        eventType: "room_moved",
        createdAt: "2026-09-25T10:00:00.000Z",
        actorName: "Abel",
        reservationId: "stay-1",
        confirmationNumber: "NORU-1",
        summary: "room moved",
      },
      {
        id: "h2",
        source: "housekeeping" as const,
        eventType: "status_change",
        createdAt: "2026-09-24T10:00:00.000Z",
        actorName: null,
        reservationId: null,
        confirmationNumber: null,
        summary: "dirty",
      },
    ];
    assert.equal(filterRoomOpsHistory(rows, { date: "2026-09-25" }).length, 1);
    assert.equal(filterRoomOpsHistory(rows, { eventType: "room_moved" })[0]?.id, "h1");
  });
});

describe("FO Phase 1 — rack grouping, horizon, URL", () => {
  it("adds a 3-day horizon without dropping 30", () => {
    assert.deepEqual(LIVE_HORIZONS, [1, 3, 7, 14, 30]);
    assert.equal(parseCalendarHorizon("3"), 3);
    assert.equal(parseCalendarHorizon("2"), undefined);
    assert.equal(foSearchFromUnknown({ tab: "arrivals", horizon: "3", date: "2026-09-25", group: "floor" }).horizon, 3);
    assert.equal(foSearchFromUnknown({ tab: "arrivals", group: "floor" }).group, "floor");
  });

  it("groups visually without duplicating rooms", () => {
    const rooms = [
      { id: "r1", floor: "1", roomTypeName: "Deluxe" },
      { id: "r2", floor: "1", roomTypeName: "Suite" },
      { id: "r3", floor: "2", roomTypeName: "Deluxe" },
    ];
    const floors = groupRackRooms(rooms, "floor");
    assert.equal(floors.length, 2);
    assert.deepEqual(floors.flatMap((g) => g.rooms.map((r) => r.id)), ["r1", "r2", "r3"]);
    const types = groupRackRooms(rooms, "room_type");
    assert.equal(types.length, 2);
    assert.equal(groupRackRooms(rooms, "none").length, 1);
  });
});

describe("FO Phase 1 — writers and overlay contract", () => {
  it("reuses assign/move writers and keeps type-upgrade off the move writer", () => {
    const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
    const assignFn = dialogs.slice(dialogs.indexOf("export function AssignRoomDialog"));
    assert.match(assignFn.slice(0, assignFn.indexOf("export function CheckInDialog")), /assignReservationRoom/);
    const moveFn = dialogs.slice(dialogs.indexOf("export function RoomMoveDialog"));
    const moveBody = moveFn.slice(0, moveFn.indexOf("export function StayDatesDialog"));
    assert.match(moveBody, /moveReservationRoom/);
    assert.match(moveBody, /reason\.trim/);
    assert.doesNotMatch(moveBody, /upgradeReservationType/);
    const amend = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(amend, /upgradeReservationType/);
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
  });

  it("does not add an FO room-status writer or room-block table", () => {
    const ops = readRel("./front-office-room-operations.ts");
    const server = readRel("./front-office-room-operations.server.ts");
    const fns = readRel("./front-office-room-operations.functions.ts");
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    for (const src of [ops, server, fns, qv, workspace]) {
      assert.doesNotMatch(src, /UPDATE hotel_rooms SET status/i);
      assert.doesNotMatch(src, /fo_room_blocks/);
      assert.doesNotMatch(src, /front_office_holds/);
    }
    assert.match(qv, /MAINTENANCE_HREF/);
    assert.match(qv, /INVENTORY_HREF/);
    assert.match(qv, /HK_HREF/);
  });

  it("keeps room identity and stay bar as distinct Quick Views", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /data-testid="fo-room-identity"/);
    assert.match(calendar, /onSelectRoom\(room\.id\)/);
    assert.match(calendar, /data-testid="fo-reservation-bar"/);
    assert.match(calendar, /onSelectStay\(stayFromReservation/);
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /RoomQuickViewSheet/);
    assert.match(workspace, /ReservationSideSheet/);
    assert.match(workspace, /openStayQuickView/);
    assert.match(workspace, /openRoomQuickView/);
    assert.match(workspace, /runAfterRoomQuickView/);
    assert.match(calendar, /FoRackConfirmSheet/);
  });
});
