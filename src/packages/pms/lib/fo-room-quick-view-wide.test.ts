import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  FO_ROOM_QV_ACTIVITY_PAGE_SIZE,
  FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS,
  FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS,
  FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS,
  foRoomActionHints,
  foRoomQuickViewHasActiveStay,
  foRoomQuickViewLayoutMode,
  foRoomQuickViewQuickActionVisibility,
  foRoomQuickViewStayDependentDisabled,
  formatFoRoomHistoryTableRow,
  paginateFoRoomHistory,
  vacantQuickViewHasNoStay,
  type FoRoomQuickView,
} from "./front-office-room-operations";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const baseView = (): FoRoomQuickView =>
  ({
    roomId: "room-1",
    roomNumber: "101",
    roomCode: null,
    roomTypeId: "type-1",
    roomTypeName: "Deluxe",
    floor: "1",
    building: "Main",
    wing: null,
    maxOccupancy: 2,
    physicalStatus: "available",
    occupancy: "vacant",
    sellable: true,
    housekeepingStatus: "clean",
    maintenanceStatus: "normal",
    ready: true,
    readinessReason: null,
    restrictionReason: null,
    restrictionExpectedReturn: null,
    currentStay: null,
    assignedArrival: null,
    nextStay: null,
    blocks: [],
    recentHistory: [],
    actionHints: {
      canAssign: false,
      canReassign: false,
      canMoveGuest: false,
      canCheckIn: false,
      canCheckOut: false,
      canOpenStay: false,
      canOpenHousekeeping: true,
      canOpenMaintenance: true,
      hasBlock: false,
      hasConflict: false,
    },
    roomInfo: { imageUrl: null, view: null, size: null, bedType: null, amenities: [] },
    inHouseGuest: null,
    folio: {
      lane: "live",
      folioId: null,
      folioNumber: null,
      totalCharges: null,
      totalPayments: null,
      balance: null,
    },
    specialRequests: { reservationText: null, guestPreferencesText: null },
  }) as FoRoomQuickView;

describe("FO Room Quick View — wide operational sheet", () => {
  it("uses a wide workspace sheet instead of the old narrow panel", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(qv, /FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS/);
    assert.match(FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS, /min\(78vw,1180px\)/);
    assert.match(FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS, /max-w-\[1180px\]/);
    assert.doesNotMatch(FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS, /680px/);
    assert.doesNotMatch(qv, /sm:max-w-md/);
    assert.doesNotMatch(qv, /sm:max-w-\[680px\]/);
  });

  it("uses desktop two-column main grid only for occupied layout", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(qv, /FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS/);
    assert.match(qv, /FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS/);
    assert.equal(FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS, "md:grid-cols-[0.36fr_0.64fr]");
    assert.equal(FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS, "md:grid-cols-2");
    assert.match(qv, /layoutMode === "occupied"/);
    assert.match(qv, /fo-room-qv-vacant-layout/);
    assert.match(qv, /fo-room-qv-right-grid/);
  });

  it("keeps room row vs stay bar as separate entry points", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(calendar, /onSelectRoom\(room\.id\)/);
    assert.match(calendar, /onSelectStay\(stayFromReservation/);
    assert.match(workspace, /openRoomQuickView/);
    assert.match(workspace, /openStayQuickView/);
    assert.match(workspace, /ReservationSideSheet/);
    assert.match(workspace, /FoCheckInWorkspaceSheet/);
  });

  it("hides stay/guest cards on vacant idle rooms in source layout", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(qv, /fo-room-qv-vacant-layout/);
    assert.match(qv, /foRoomQuickViewLayoutMode/);
    assert.match(qv, /foRoomQuickViewQuickActionVisibility/);
    assert.doesNotMatch(qv, /No in-house guest/);
    assert.doesNotMatch(qv, /disabled=\{stayDisabled\}/);
  });

  it("does not compute folio totals in the browser", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.doesNotMatch(qv, /folio_transactions/);
    assert.match(readRel("./front-office-room-operations.server.ts"), /folio_transactions/);
  });

  it("maps recent activity from reader rows only", () => {
    const row = formatFoRoomHistoryTableRow({
      id: "h1",
      source: "reservation",
      eventType: "check_in",
      createdAt: "2026-09-25T14:30:00Z",
      actorName: "Alex",
      reservationId: "stay-1",
      confirmationNumber: "CONF-1",
      summary: "check in",
    });
    assert.equal(row.user, "Alex");
    assert.match(row.action, /check in/);
    assert.equal(row.details, "check in");
    assert.match(row.when, /2026/);
  });

  it("vacant idle: no stay cards and no stay quick actions", () => {
    const vacant = baseView();
    assert.equal(foRoomQuickViewLayoutMode(vacant), "vacant_idle");
    assert.equal(vacantQuickViewHasNoStay(vacant), true);
    const visible = foRoomQuickViewQuickActionVisibility({
      hints: vacant.actionHints,
      layoutMode: "vacant_idle",
      inHouseGuest: null,
      folio: vacant.folio,
    });
    assert.equal(visible.move, false);
    assert.equal(visible.check_in, false);
    assert.equal(visible.view_reservation, false);
    assert.equal(visible.extend_stay, false);
    assert.equal(visible.housekeeping, true);
    assert.equal(visible.view_history, true);
  });

  it("vacant assigned: check-in and reservation actions follow hints", () => {
    const assigned = baseView();
    assigned.assignedArrival = {
      id: "stay-a",
      confirmationNumber: "CONF-A",
      guestId: "guest-a",
      guestName: "Arrival Guest",
      guestVip: false,
      status: "confirmed",
      arrivalDate: "2026-09-25",
      departureDate: "2026-09-27",
      roomTypeId: "type-1",
      roomTypeName: "Deluxe",
      ratePlanName: "BAR",
      adults: 2,
      children: 0,
      nights: 2,
      rateLabel: null,
      packageName: null,
      specialRequests: null,
    };
    assigned.actionHints = foRoomActionHints({
      occupancy: "vacant",
      physicalStatus: "available",
      ready: true,
      currentStay: null,
      assignedArrival: assigned.assignedArrival,
      unassignedArrival: false,
      blocks: [],
      hasDiscrepancy: false,
    });
    assert.equal(foRoomQuickViewLayoutMode(assigned), "vacant_assigned");
    const visible = foRoomQuickViewQuickActionVisibility({
      hints: assigned.actionHints,
      layoutMode: "vacant_assigned",
      inHouseGuest: null,
      folio: assigned.folio,
    });
    assert.equal(visible.check_in, true);
    assert.equal(visible.view_reservation, true);
    assert.equal(visible.move, false);
    assert.equal(visible.check_out, false);
    assert.equal(visible.extend_stay, false);
  });

  it("checked-in: full stay actions and no check-in", () => {
    const occupied = baseView();
    occupied.occupancy = "occupied";
    occupied.currentStay = {
      id: "stay-1",
      confirmationNumber: "CONF-1",
      guestId: "guest-1",
      guestName: "Guest",
      guestVip: false,
      status: "checked_in",
      arrivalDate: "2026-09-24",
      departureDate: "2026-09-26",
      roomTypeId: "type-1",
      roomTypeName: "Deluxe",
      ratePlanName: "BAR",
      adults: 2,
      children: 0,
      nights: 2,
      rateLabel: "GBP 200.00",
      packageName: null,
      specialRequests: "Late arrival",
    };
    occupied.inHouseGuest = {
      guestId: "guest-1",
      fullName: "Guest",
      nationality: "GB",
      phone: "+1",
      email: "g@test.com",
      company: null,
      vip: false,
    };
    occupied.folio.folioId = "folio-1";
    occupied.actionHints = foRoomActionHints({
      occupancy: "occupied",
      physicalStatus: "available",
      ready: false,
      currentStay: occupied.currentStay,
      assignedArrival: null,
      unassignedArrival: false,
      blocks: [],
      hasDiscrepancy: false,
    });
    assert.equal(foRoomQuickViewLayoutMode(occupied), "occupied");
    assert.equal(foRoomQuickViewHasActiveStay(occupied), true);
    assert.equal(foRoomQuickViewStayDependentDisabled(occupied), false);
    const visible = foRoomQuickViewQuickActionVisibility({
      hints: occupied.actionHints,
      layoutMode: "occupied",
      inHouseGuest: occupied.inHouseGuest,
      folio: occupied.folio,
    });
    assert.equal(visible.check_in, false);
    assert.equal(visible.check_out, true);
    assert.equal(visible.move, true);
    assert.equal(visible.open_folio, true);
  });

  it("uses cover image presentation and activity pagination", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(qv, /fo-room-qv-cover-image/);
    assert.match(qv, /aspect-\[4\/3\]/);
    assert.match(qv, /FO_ROOM_QV_ACTIVITY_PAGE_SIZE/);
    assert.match(qv, /fo-room-qv-activity-pagination/);
    assert.match(qv, /setActivityPage\(1\)/);
    assert.equal(FO_ROOM_QV_ACTIVITY_PAGE_SIZE, 5);
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `h-${i}`,
      source: "reservation" as const,
      eventType: "check_in",
      createdAt: "2026-09-25T10:00:00Z",
      actorName: "Staff",
      reservationId: null,
      confirmationNumber: null,
      summary: "check in",
    }));
    const page1 = paginateFoRoomHistory(rows, 1);
    assert.equal(page1.rows.length, 5);
    assert.equal(page1.totalPages, 3);
    const page2 = paginateFoRoomHistory(rows, 2);
    assert.equal(page2.rows.length, 5);
  });

  it("moves grouping-adjacent toolbar patterns only in rack calendar, not room header", () => {
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.doesNotMatch(qv, /RackGroupSelect/);
  });
});
