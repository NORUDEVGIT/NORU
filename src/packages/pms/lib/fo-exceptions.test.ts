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
  LIVE_EXCEPTION_TYPES,
  MAINTENANCE_LIVE_TYPE,
  comingSoonExceptionTypes,
  deriveExceptionRows,
  deriveOpsStrip,
  exceptionBadgeCount,
  exceptionHighCount,
  folioUnavailableLabel,
  keyCellLabel,
  stayMoneyCellsVisible,
  type ExceptionStayLike,
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
    assert.deepEqual(rows, []);
    assert.equal(exceptionBadgeCount(rows), 0);
    assert.equal(exceptionHighCount(rows), 0);
    assert.equal(EXCEPTION_EMPTY_COPY, "No exceptions right now");
    assert.equal(
      comingSoon.some((item) => item.id === "overbooking" && !("count" in item)),
      true,
    );
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
    assert.equal(comingSoon.some((item) => /overbook/i.test(item.label)), true);
    assert.equal(comingSoon.some((item) => /discrepancy/i.test(item.label)), true);
    assert.equal(comingSoon.some((item) => /early/i.test(item.label)), true);
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

  it("omits Occupancy % and discrepancy counts from the ops strip", () => {
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
      ],
      hkAvailable: true,
    });
    assert.equal(items.some((item) => /occupancy/i.test(item.label)), false);
    assert.equal(items.some((item) => /discrep/i.test(item.label)), false);
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
    assert.match(help, /Cashiering/);
    assert.match(help, /Void/);
    assert.doesNotMatch(help, /fake success/i);

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
    assert.doesNotMatch(fns, /apply_migration|create table/i);
  });
});
