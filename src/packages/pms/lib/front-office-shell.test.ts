import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { HK_STATUS_TAB_LABEL } from "./housekeeping-labels.ts";
import {
  FO_ACTIONS,
  FO_LANDING_NAV,
  FO_NAV_ITEMS,
  FO_PRIMARY_TITLE,
  actionsForMenu,
  classifyUnavailable,
  deriveExceptionSlots,
  handleReservationBarDrop,
  invokeFoAction,
  isLiveHorizon,
  menuHasVoid,
  navHasRoomMoves,
  reservationBarPlacement,
  resolveFoNav,
  shouldShowWeekGantt,
} from "./front-office-shell.ts";

describe("FO IA nav", () => {
  it("exposes exactly nine sidebar items and lands on Room Rack + Calendar", () => {
    assert.equal(FO_NAV_ITEMS.length, 9);
    assert.deepEqual(
      FO_NAV_ITEMS.map((item) => item.label),
      [
        "Room Rack + Calendar",
        "Arrivals",
        "In-House Guests",
        "Departures",
        "Walk-ins",
        "Amendments",
        "Cancellations",
        "No-Shows",
        "Exceptions",
      ],
    );
    assert.equal(FO_LANDING_NAV, "rack");
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    assert.equal(resolveFoNav(undefined), "rack");
    assert.equal(resolveFoNav("overview"), "rack");
    assert.equal(navHasRoomMoves(), false);
  });

  it("does not include a Room Moves sidebar item in source", () => {
    const workspace = readFileSync(new URL("../components/workspaces/front-office-workspace.tsx", import.meta.url), "utf8");
    assert.match(workspace, /Room Rack \+ Calendar/);
    assert.doesNotMatch(workspace, /Room Moves/);
    assert.match(workspace, /resolveFoNav\(initialTab\)/);
  });
});

describe("Coming soon and writes", () => {
  it("Coming soon clicks never invoke write functions", () => {
    const called: string[] = [];
    const writes = {
      checkInReservation: () => called.push("checkInReservation"),
      checkOutReservation: () => called.push("checkOutReservation"),
      moveReservationRoom: () => called.push("moveReservationRoom"),
      changeStayDates: () => called.push("changeStayDates"),
      markNoShow: () => called.push("markNoShow"),
      assignReservationRoom: () => called.push("assignReservationRoom"),
      createReservation: () => called.push("createReservation"),
      amendReservation: () => called.push("amendReservation"),
      setReservationStatus: () => called.push("setReservationStatus"),
    };

    for (const action of FO_ACTIONS.filter((a) => a.lane === "coming_soon")) {
      const result = invokeFoAction(action.id, writes);
      assert.equal(result.lane, "coming_soon");
      assert.equal(result.invokedWrite, null);
    }
    assert.deepEqual(called, []);
  });

  it("drag does not call moveReservationRoom", () => {
    let moved = false;
    const result = handleReservationBarDrop(
      { reservationId: "res-1", targetRoomId: "room-2" },
      { moveReservationRoom: () => {
        moved = true;
      } },
    );
    assert.equal(result.moved, false);
    assert.equal(result.lane, "coming_soon");
    assert.equal(moved, false);
  });

  it("keeps permission denied distinct from Coming soon", () => {
    assert.equal(classifyUnavailable("permission"), "permission_denied");
    assert.equal(classifyUnavailable("coming_soon"), "coming_soon");
    assert.notEqual(classifyUnavailable("permission"), "coming_soon");
  });
});

describe("menus", () => {
  it("omits Void from Quick Action and bar menus", () => {
    assert.equal(menuHasVoid("quick"), false);
    assert.equal(menuHasVoid("bar"), false);
    assert.equal(menuHasVoid("sheet"), false);
    const labels = FO_ACTIONS.map((a) => a.label.toLowerCase());
    assert.equal(labels.some((l) => l.includes("void")), false);
    assert.ok(actionsForMenu("quick").some((a) => a.id === "guest_request" && a.lane === "coming_soon"));
    assert.ok(actionsForMenu("quick").some((a) => a.id === "room_move" && a.lane === "live"));
  });
});

describe("HK title lock", () => {
  it("does not title the housekeeping tab Room Rack", () => {
    assert.equal(HK_STATUS_TAB_LABEL, "Room status");
    assert.notEqual(HK_STATUS_TAB_LABEL, "Room Rack");

    const hk = readFileSync(new URL("../components/workspaces/housekeeping-workspace.tsx", import.meta.url), "utf8");
    assert.match(hk, /HK_STATUS_TAB_LABEL/);
    assert.doesNotMatch(hk, /TabsTrigger value="rack">Room Rack</);

    const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /HK_STATUS_TAB_LABEL/);
    assert.doesNotMatch(shell, /label: "Room Rack"/);
  });
});

describe("calendar helpers", () => {
  it("treats 1 and 7 day windows as live and 14/30 as coming soon", () => {
    assert.equal(isLiveHorizon(1), true);
    assert.equal(isLiveHorizon(7), true);
    assert.equal(isLiveHorizon(14), false);
    assert.equal(isLiveHorizon(30), false);
    assert.equal(shouldShowWeekGantt("phone"), false);
    assert.equal(shouldShowWeekGantt("desktop"), true);
  });

  it("places a stay bar on the occupied nights only", () => {
    const place = reservationBarPlacement("2026-09-11", "2026-09-14", "2026-09-11", 7);
    assert.ok(place);
    assert.equal(place.startCol, 1);
    assert.equal(place.endCol, 4);
    assert.equal(reservationBarPlacement("2026-09-20", "2026-09-22", "2026-09-11", 7), null);
  });
});

describe("exceptions", () => {
  it("derives honest Live counts and leaves the rest Coming soon", () => {
    const slots = deriveExceptionSlots({
      unassignedArrivals: 2,
      overstays: 1,
      dueOutInHouse: 3,
      outOfOrder: 0,
      outOfService: 4,
    });
    const live = slots.filter((s) => s.lane === "live");
    const soon = slots.filter((s) => s.lane === "coming_soon");
    assert.equal(live.length, 5);
    assert.ok(soon.length >= 5);
    assert.equal(slots.find((s) => s.id === "unassigned_arrivals")?.count, 2);
    assert.equal(slots.find((s) => s.id === "occupancy_discrepancy")?.count, null);
  });
});
