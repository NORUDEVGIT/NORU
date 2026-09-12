import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { HK_STATUS_TAB_LABEL } from "./housekeeping-labels.ts";
import {
  FO_ACTIONS,
  FO_ESCAPE_MODULES,
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
  shouldSuppressRestaurantPmsRail,
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
    assert.ok(FO_NAV_ITEMS.some((item) => item.label === "Amendments" && item.id === "amendments"));
  });

  it("does not include a Room Moves sidebar item in source", () => {
    const workspace = readFileSync(new URL("../components/workspaces/front-office-workspace.tsx", import.meta.url), "utf8");
    assert.match(workspace, /Room Rack \+ Calendar/);
    assert.doesNotMatch(workspace, /Room Moves/);
    assert.match(workspace, /resolveFoNav\(initialTab\)/);
  });
});

describe("FO-FS0 single left nav", () => {
  it("suppresses the RestaurantShell package rail only on Front Office", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("reservations"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("housekeeping"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("cashiering"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("night-audit"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("rates-revenue"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("reports"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("room-inventory"), false);
    assert.equal(shouldSuppressRestaurantPmsRail(undefined), false);
  });

  it("exposes exactly eight PMS escape destinations and never Front Office or Room Moves", () => {
    assert.equal(FO_ESCAPE_MODULES.length, 8);
    assert.deepEqual(
      FO_ESCAPE_MODULES.map((item) => [item.label, item.to]),
      [
        ["PMS Home", "/restaurant/pms/dashboard"],
        ["Reservations", "/restaurant/pms/reservations"],
        ["Housekeeping", "/restaurant/pms/housekeeping"],
        ["Cashiering", "/restaurant/pms/cashiering"],
        ["Night Audit", "/restaurant/pms/night-audit"],
        ["Rates", "/restaurant/pms/rates-revenue"],
        ["Reports", "/restaurant/pms/reports"],
        ["Settings", "/restaurant/settings"],
      ],
    );
    assert.equal(
      FO_ESCAPE_MODULES.some((item) => item.to.includes("front-office") || /front office/i.test(item.label)),
      false,
    );
    assert.equal(
      FO_ESCAPE_MODULES.some((item) => /room moves/i.test(item.label) || item.to.includes("room-move")),
      false,
    );
    assert.equal(navHasRoomMoves(), false);
    assert.ok(FO_NAV_ITEMS.some((item) => item.label === "Amendments"));
  });

  it("wires RestaurantShell suppression and the FO escape hatch in source", () => {
    const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /shouldSuppressRestaurantPmsRail/);
    assert.match(shell, /hidePackageRail/);
    assert.match(shell, /hidePackageRail \? null/);
    assert.doesNotMatch(shell, /Option A/);

    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.match(chrome, /fo-pms-modules-escape/);
    assert.match(chrome, /FO_ESCAPE_MODULES/);
    assert.match(chrome, /PMS modules/);
    assert.match(chrome, /fo-mobile-nav/);
    assert.doesNotMatch(chrome, /Room Moves/);
    assert.match(chrome, /FO_NAV_ITEMS/);
    assert.match(chrome, /#251605/);
    assert.match(chrome, /#C89933/);
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
    assert.ok(actionsForMenu("quick").some((a) => a.id === "guest_request" && a.lane === "live"));
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
