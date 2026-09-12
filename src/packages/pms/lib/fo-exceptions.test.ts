import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FO_PRIMARY_TITLE,
  menuHasVoid,
  shouldSuppressRestaurantPmsRail,
} from "./front-office-shell.ts";
import {
  COMING_SOON_EXCEPTION_TYPES,
  EXCEPTION_EMPTY_COPY,
  EXCEPTION_HONESTY_HELP,
  LATE_ARRIVAL_AUTO_NOSHOW,
  LATE_ARRIVAL_PRIMARY_CTA,
  LATE_ARRIVAL_SECONDARY_CTA,
  LIVE_EXCEPTION_TYPES,
  MAINTENANCE_LIVE_TYPE,
  comingSoonExceptionTypes,
  deriveExceptionRows,
  deriveOpsStrip,
  discrepancyBrief,
  exceptionBadgeCount,
  exceptionHighCount,
  folioUnavailableLabel,
  keyCellLabel,
  occupancyPercent,
  stayMoneyCellsVisible,
  type ExceptionDiscrepancyLike,
  type ExceptionStayLike,
  type OverbookStayLike,
  type StayMoneySignal,
} from "./fo-exceptions.ts";

function stay(partial: Partial<ExceptionStayLike> & Pick<ExceptionStayLike, "id">): ExceptionStayLike {
  return {
    confirmationNumber: `NORU-${partial.id}`,
    guestName: "Ada Smith",
    roomId: null,
    roomNumber: null,
    arrivalDate: "2026-09-12",
    departureDate: "2026-09-14",
    status: "confirmed",
    overstay: false,
    ...partial,
  };
}

function money(partial: Partial<StayMoneySignal> = {}): StayMoneySignal {
  return {
    folioId: null,
    folioNumber: null,
    balance: null,
    depositPosted: null,
    depositWaived: false,
    checkoutOverride: false,
    keyIssued: false,
    keyWaived: false,
    ...partial,
  };
}

describe("FO-FS6 exception honesty", () => {
  it("badge is 0 when there are no rows and never invents a non-zero count", () => {
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
    });
    assert.equal(rows.some((row) => row.type === "overbooking" || row.type === "room_discrepancy"), false);
    assert.deepEqual(rows, []);
    assert.equal(exceptionBadgeCount(rows), 0);
    assert.equal(exceptionHighCount(rows), 0);
    assert.equal(EXCEPTION_EMPTY_COPY, "No exceptions right now");
    assert.equal(comingSoon.some((item) => item.id === "early_arrival" && !("count" in item)), true);
    assert.equal(comingSoon.some((item) => item.id === "late_arrival" && !("count" in item)), true);
    assert.equal(comingSoon.some((item) => item.id === "overbooking"), false);
    assert.equal(comingSoon.some((item) => item.id === "room_discrepancy"), false);
  });

  it("maps unassigned, OOO-assigned, payment, maintenance and overstay to Live rows with deep-links", () => {
    const unassigned = stay({ id: "arr-1", roomId: null, status: "confirmed" });
    const oooStay = stay({
      id: "ooo-1",
      roomId: "room-ooo",
      roomNumber: "101",
      status: "checked_in",
    });
    const payArrival = stay({ id: "pay-1", roomId: "room-2", roomNumber: "102", status: "confirmed" });
    const overstay = stay({
      id: "over-1",
      roomId: "room-3",
      roomNumber: "103",
      status: "checked_in",
      departureDate: "2026-09-10",
      overstay: true,
    });

    const { rows } = deriveExceptionRows({
      arrivals: [unassigned, payArrival],
      inHouse: [oooStay, overstay],
      departures: [overstay],
      rooms: [
        { id: "room-ooo", status: "out_of_order" },
        { id: "room-2", status: "available" },
        { id: "room-3", status: "available" },
      ],
      folioLane: "live",
      moneyByStay: {
        "pay-1": money({ folioId: "f1", folioNumber: "F-1", depositPosted: 0 }),
        "over-1": money({ folioId: "f2", folioNumber: "F-2", balance: 0 }),
      },
      businessDate: "2026-09-12",
    });

    const unassignedRow = rows.find((row) => row.type === "unassigned");
    const oooRow = rows.find((row) => row.type === "room_unavailable");
    const payRow = rows.find((row) => row.type === "payment_issue");
    const overstayRow = rows.find((row) => row.type === "overstay");

    assert.ok(unassignedRow);
    assert.equal(unassignedRow.primaryCta.id, "assign");
    assert.equal(unassignedRow.primaryCta.label, "Assign room");
    assert.equal(unassignedRow.roomNumber, null);

    assert.ok(oooRow);
    assert.equal(oooRow.primaryCta.id, "move");
    assert.equal(MAINTENANCE_LIVE_TYPE, "room_unavailable");
    assert.equal(rows.filter((row) => row.stayId === "ooo-1").length, 1);

    assert.ok(payRow);
    assert.equal(payRow.primaryCta.id, "check_in");
    assert.equal(payRow.waived, false);

    assert.ok(overstayRow);
    assert.equal(overstayRow.primaryCta.id, "check_out");
    assert.equal(overstayRow.ageDays, 2);
    assert.equal(exceptionBadgeCount(rows), 4);
    assert.ok(LIVE_EXCEPTION_TYPES.includes("overstay"));
  });

  it("does not invent a payment row or £0.00 when folio is unavailable", () => {
    const arrival = stay({ id: "arr-2" });
    const inHouse = stay({ id: "in-2", status: "checked_in", roomId: "r1", roomNumber: "201" });
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [arrival],
      inHouse: [inHouse],
      departures: [],
      rooms: [{ id: "r1", status: "available" }],
      folioLane: "coming_soon",
      moneyByStay: {},
      businessDate: "2026-09-12",
    });
    assert.equal(rows.some((row) => row.type === "payment_issue"), false);
    assert.ok(comingSoon.some((item) => item.id === "payment_issue"));
    assert.equal(
      comingSoon.every((item) => !("count" in item)),
      true,
    );
  });

  it("permission denied for folios is not Coming soon", () => {
    const soon = comingSoonExceptionTypes("permission_denied");
    assert.equal(soon.some((item) => item.id === "payment_issue"), false);
    assert.equal(folioUnavailableLabel("permission_denied"), "Unavailable");
    assert.equal(folioUnavailableLabel("coming_soon"), null);
  });

  it("progressive types without a signal stay Coming soon with no counts", () => {
    const { comingSoon } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
    });
    assert.deepEqual(
      comingSoon.map((item) => item.id),
      COMING_SOON_EXCEPTION_TYPES.map((item) => item.id),
    );
    assert.equal(comingSoon.some((item) => /early/i.test(item.label)), true);
    assert.equal(comingSoon.some((item) => /late/i.test(item.label)), true);
    assert.equal(comingSoon.some((item) => /overbook/i.test(item.label)), false);
    assert.equal(comingSoon.some((item) => /discrepancy/i.test(item.label)), false);
    assert.equal(
      comingSoon.every((item) => !("count" in item) && !("value" in item)),
      true,
    );
  });

  it("shows Waived on a payment row when an active waive is already stored", () => {
    const stayRow = stay({ id: "pay-w", status: "checked_in", roomId: "r1", roomNumber: "9" });
    const { rows } = deriveExceptionRows({
      arrivals: [],
      inHouse: [stayRow],
      departures: [],
      rooms: [{ id: "r1", status: "available" }],
      folioLane: "live",
      moneyByStay: {
        "pay-w": money({ folioId: "f", folioNumber: "F-9", balance: 40, checkoutOverride: true }),
      },
      businessDate: "2026-09-12",
    });
    const pay = rows.find((row) => row.type === "payment_issue");
    assert.ok(pay);
    assert.equal(pay.waived, true);
    assert.equal(pay.primaryCta.id, "check_out");
  });

  it("shows Occupancy % and discrepancy counts only when those feeds are trusted", () => {
    const items = deriveOpsStrip({
      arrivalsToday: 2,
      departuresToday: 1,
      inHouse: 4,
      availableRooms: 3,
      occupiedRooms: 5,
      outOfOrder: 1,
      outOfService: 0,
      rooms: [
        { occupancy: "vacant", status: "available", housekeepingStatus: "dirty" },
        { occupancy: "vacant", status: "available", housekeepingStatus: "clean" },
        { occupancy: "occupied", status: "available", housekeepingStatus: "dirty" },
        { occupancy: "occupied", status: "available", housekeepingStatus: "dirty" },
        { occupancy: "occupied", status: "available", housekeepingStatus: "clean" },
        { occupancy: "vacant", status: "out_of_order", housekeepingStatus: "dirty" },
      ],
      hkAvailable: true,
      openDiscrepancies: 2,
    });
    const occupancy = items.find((item) => item.id === "occupancy_pct");
    assert.ok(occupancy);
    assert.equal(occupancy.value, 100);
    assert.equal(occupancy.display, "100%");
    assert.ok(items.some((item) => item.id === "discrepancies" && item.value === 2));
    assert.ok(items.some((item) => item.id === "vacant_dirty" && item.value === 1));
    assert.ok(items.some((item) => item.id === "vacant_clean" && item.value === 1));

    const noHk = deriveOpsStrip({
      arrivalsToday: 0,
      departuresToday: 0,
      inHouse: 0,
      availableRooms: 1,
      occupiedRooms: 0,
      outOfOrder: 0,
      outOfService: 0,
      rooms: [{ occupancy: "vacant", status: "available", housekeepingStatus: "dirty" }],
      hkAvailable: false,
    });
    assert.equal(noHk.some((item) => item.id === "vacant_dirty"), false);
    assert.ok(noHk.some((item) => item.id === "vacant"));
    assert.equal(noHk.some((item) => item.id === "discrepancies"), false);
    assert.ok(noHk.some((item) => item.id === "occupancy_pct" && item.value === 0));
  });

  it("lists money columns only when the signal exists; key stays empty without FO-FS1 state", () => {
    const visible = stayMoneyCellsVisible({
      folioLane: "live",
      signals: [money({ folioId: "f", folioNumber: "F-1", balance: 12.5 })],
    });
    assert.deepEqual(visible, { balance: true, deposit: true, key: false, folio: true });
    assert.equal(keyCellLabel(money()), null);
    assert.equal(keyCellLabel(money({ keyIssued: true })), "Issued");

    const noFolio = stayMoneyCellsVisible({ folioLane: "coming_soon", signals: [] });
    assert.equal(noFolio.balance, false);
    assert.equal(noFolio.deposit, false);
  });
});

describe("FO-FS0 / chrome locks", () => {
  it("still suppresses the restaurant PMS rail and keeps Room Rack + Calendar", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    assert.equal(menuHasVoid("quick"), false);
    assert.equal(menuHasVoid("bar"), false);
    assert.equal(menuHasVoid("sheet"), false);
  });

  it("Help opens a real panel and the user menu has FO activity", () => {
    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.match(chrome, /FO activity/);
    assert.match(chrome, /fo-user-menu/);
    assert.match(chrome, /fo-help/);
    assert.match(chrome, /FoHelpSheet/);
    assert.doesNotMatch(chrome, /Help — Coming soon/);
    assert.match(chrome, /fo-notifications/);
    assert.match(chrome, /notificationsComingSoon/);
    assert.match(chrome, /exceptionBadge/);

    const help = readFileSync(new URL("../components/frontoffice/fo-help-sheet.tsx", import.meta.url), "utf8");
    assert.match(help, /Room Rack/);
    assert.match(help, /Exceptions/);
    assert.match(help, /empty means clear/);
    assert.match(help, /Cashiering/);
    assert.match(help, /Void/);
    assert.doesNotMatch(help, /fake success/i);
    assert.equal(EXCEPTION_HONESTY_HELP, "Exceptions only show real feeds — empty means clear.");

    const audit = readFileSync(new URL("../components/frontoffice/fo-audit-viewer.tsx", import.meta.url), "utf8");
    assert.match(audit, /FO activity/);
    assert.match(audit, /listReservationAmendments/);
    assert.doesNotMatch(audit, /Night Audit/);
  });

  it("does not add a migration or a second till / FO Void", () => {
    const exceptions = readFileSync(new URL("./fo-exceptions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(exceptions, /create table/i);
    assert.doesNotMatch(exceptions, /FO Void|fo_void/i);
    const fns = readFileSync(new URL("./fo-exceptions.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /guest_folios/);
    assert.match(fns, /fo_checkin_progress/);
    assert.match(fns, /hotel_reservation_history/);
    assert.match(fns, /housekeeping_discrepancies/);
    assert.doesNotMatch(fns, /apply_migration|create table|0044|fo_checkin_time/i);
  });
});

function demand(partial: Partial<OverbookStayLike> & Pick<OverbookStayLike, "id" | "roomTypeId">): OverbookStayLike {
  return {
    confirmationNumber: `NORU-${partial.id}`,
    guestName: "Ada Smith",
    roomTypeName: "Deluxe",
    roomId: null,
    roomNumber: null,
    arrivalDate: "2026-09-12",
    departureDate: "2026-09-14",
    status: "confirmed",
    ...partial,
  };
}

function openDiscrepancy(partial: Partial<ExceptionDiscrepancyLike> & Pick<ExceptionDiscrepancyLike, "id">): ExceptionDiscrepancyLike {
  return {
    roomId: "room-1",
    roomNumber: "101",
    reportedOccupancy: "vacant",
    actualOccupancy: "occupied",
    reportedHkStatus: null,
    actualHkStatus: null,
    reason: null,
    status: "open",
    ...partial,
  };
}

describe("FO-EX1 exception feeds", () => {
  it("does not invent an Overbooking row when demand equals sellable", () => {
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [
        { id: "r1", status: "available", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
        { id: "r2", status: "available", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
      ],
      folioLane: "live",
      businessDate: "2026-09-12",
      demandStays: [
        demand({ id: "d1", roomTypeId: "deluxe" }),
        demand({ id: "d2", roomTypeId: "deluxe", roomId: "r2", roomNumber: "102" }),
      ],
    });
    assert.equal(rows.some((row) => row.type === "overbooking"), false);
    assert.equal(comingSoon.some((item) => item.id === "overbooking"), false);
  });

  it("emits one High Overbooking row when demand exceeds sellable", () => {
    const { rows } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [
        { id: "r1", status: "available", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
        { id: "ooo", status: "out_of_order", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
      ],
      folioLane: "live",
      businessDate: "2026-09-12",
      demandStays: [
        demand({
          id: "held",
          roomTypeId: "deluxe",
          roomId: "r1",
          roomNumber: "101",
          departureDate: "2026-09-13",
        }),
        demand({ id: "extra", roomTypeId: "deluxe", departureDate: "2026-09-13" }),
      ],
    });
    const over = rows.filter((row) => row.type === "overbooking");
    assert.equal(over.length, 1);
    assert.equal(over[0]?.severity, "high");
    assert.equal(over[0]?.reason, "Demand exceeds sellable for Deluxe on 2026-09-12");
    assert.equal(over[0]?.primaryCta.id, "open_rack");
    assert.equal(over[0]?.stayId, "extra");
    assert.equal(over[0]?.secondaryCta?.id, "assign");
  });

  it("does not count OOO/OOS rooms as sellable and ignores a soft occupancy threshold", () => {
    const { rows } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [
        { id: "r1", status: "available", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
        { id: "oos", status: "out_of_service", roomTypeId: "deluxe", roomTypeName: "Deluxe" },
      ],
      folioLane: "live",
      businessDate: "2026-09-12",
      demandStays: [demand({ id: "only", roomTypeId: "deluxe", roomId: "r1", roomNumber: "101" })],
    });
    assert.equal(rows.some((row) => row.type === "overbooking"), false);
  });

  it("keeps Overbooking Coming soon when that feed is untrusted", () => {
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [{ id: "r1", status: "available", roomTypeId: "deluxe", roomTypeName: "Deluxe" }],
      folioLane: "live",
      businessDate: "2026-09-12",
      overbookingLane: "coming_soon",
      demandStays: [demand({ id: "a", roomTypeId: "deluxe" }), demand({ id: "b", roomTypeId: "deluxe" })],
    });
    assert.equal(rows.some((row) => row.type === "overbooking"), false);
    assert.ok(comingSoon.some((item) => item.id === "overbooking" && !("count" in item)));
  });

  it("maps an open discrepancy to a Live row with resolve or Unavailable", () => {
    const live = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [{ id: "room-1", status: "available" }],
      folioLane: "live",
      businessDate: "2026-09-12",
      discrepancies: [openDiscrepancy({ id: "disc-1" })],
      canResolveDiscrepancy: true,
    });
    const row = live.rows.find((item) => item.type === "room_discrepancy");
    assert.ok(row);
    assert.equal(row.reason, "Room 101 discrepancy open — reported vacant, actual occupied");
    assert.equal(row.primaryCta.id, "open_room");
    assert.equal(row.resolveAvailable, true);
    assert.equal(row.secondaryCta?.id, "resolve");
    assert.equal(live.comingSoon.some((item) => item.id === "room_discrepancy"), false);

    const viewOnly = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
      discrepancies: [openDiscrepancy({ id: "disc-2", reason: "Sleep-out" })],
      canResolveDiscrepancy: false,
    });
    const locked = viewOnly.rows.find((item) => item.type === "room_discrepancy");
    assert.ok(locked);
    assert.equal(locked.reason, "Room 101 discrepancy open — Sleep-out");
    assert.equal(locked.resolveAvailable, false);
    assert.equal(locked.secondaryCta, null);
  });

  it("does not treat discrepancy permission denied as Coming soon", () => {
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
      discrepancyLane: "permission_denied",
      discrepancies: [openDiscrepancy({ id: "hidden" })],
    });
    assert.equal(rows.some((row) => row.type === "room_discrepancy"), false);
    assert.equal(comingSoon.some((item) => item.id === "room_discrepancy"), false);
  });

  it("keeps discrepancy Coming soon when the table is unavailable", () => {
    const { comingSoon, rows } = deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
      discrepancyLane: "coming_soon",
    });
    assert.equal(rows.some((row) => row.type === "room_discrepancy"), false);
    assert.ok(comingSoon.some((item) => item.id === "room_discrepancy" && !("count" in item)));
  });

  it("omits Occupancy % when sellable is 0 or counts are untrusted", () => {
    assert.equal(occupancyPercent(4, 0), null);
    assert.equal(occupancyPercent(0, 0), null);
    assert.equal(occupancyPercent(3, 4), 75);
    const zeroSellable = deriveOpsStrip({
      arrivalsToday: 0,
      departuresToday: 0,
      inHouse: 0,
      availableRooms: 0,
      occupiedRooms: 2,
      outOfOrder: 1,
      outOfService: 1,
      rooms: [
        { occupancy: "vacant", status: "out_of_order" },
        { occupancy: "vacant", status: "out_of_service" },
      ],
      hkAvailable: false,
    });
    assert.equal(zeroSellable.some((item) => item.id === "occupancy_pct"), false);
    const untrusted = deriveOpsStrip({
      arrivalsToday: 0,
      departuresToday: 0,
      inHouse: 0,
      availableRooms: 4,
      occupiedRooms: 2,
      outOfOrder: 0,
      outOfService: 0,
      rooms: [{ occupancy: "occupied", status: "available" }, { occupancy: "vacant", status: "available" }],
      hkAvailable: false,
      occupancyTrusted: false,
    });
    assert.equal(untrusted.some((item) => item.id === "occupancy_pct"), false);
    assert.doesNotMatch(JSON.stringify(untrusted), /78%/);
  });

  it("never auto no-shows Late arrival and does not invent Early/Late rows", () => {
    assert.equal(LATE_ARRIVAL_AUTO_NOSHOW, false);
    assert.equal(LATE_ARRIVAL_PRIMARY_CTA, "check_in");
    assert.equal(LATE_ARRIVAL_SECONDARY_CTA, "no_show");
    const { rows, comingSoon } = deriveExceptionRows({
      arrivals: [stay({ id: "late-1", status: "confirmed" })],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane: "live",
      businessDate: "2026-09-12",
    });
    assert.equal(rows.some((row) => /early|late/i.test(row.type)), false);
    assert.ok(comingSoon.some((item) => item.id === "early_arrival" && !("count" in item)));
    assert.ok(comingSoon.some((item) => item.id === "late_arrival" && !("count" in item)));
    const fns = readFileSync(new URL("./fo-exceptions.functions.ts", import.meta.url), "utf8");
    const frame = readFileSync(new URL("../components/frontoffice/fo-exceptions-frame.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(fns, /markNoShow|mark_hotel_reservation_no_show/);
    assert.doesNotMatch(frame, /markNoShow/);
    assert.equal(discrepancyBrief({
      reportedOccupancy: null,
      actualOccupancy: null,
      reportedHkStatus: "dirty",
      actualHkStatus: "clean",
      reason: null,
    }), "HK reported dirty, actual clean");
  });
});
