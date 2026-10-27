import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { foRequiresApprovalLabel } from "./fo-approvals";
import {
  foRackActionStay,
  foRackBarMenuItems,
  foRackMaintenanceRelevant,
  foRackUnitIdentity,
  projectRackStays,
} from "./fo-rack-bar-menu";
import type { ReservationStatus } from "./reservation-dates";
import type { ReservationRoomUnit } from "./reservation-room-units";
import type { ReservationDetail } from "./reservations.functions";

const here = dirname(fileURLToPath(import.meta.url));

function unit(
  id: string,
  roomId: string | null,
  status: string,
  overrides: Partial<ReservationRoomUnit> = {},
): ReservationRoomUnit {
  const values = {
    roomTypeId: "type-1",
    roomId,
    arrivalDate: "2026-10-25",
    departureDate: "2026-10-28",
    adults: 1,
    children: 0,
    infants: 0,
    ratePlanId: null,
    currency: "ETB",
    nightlyRates: [],
    roomSubtotal: null,
    pricedAt: null,
  };
  return {
    ...values,
    id,
    unitSequence: Number(id.replace(/\D/g, "")) || 1,
    authority: "unit",
    matchesMaster: true,
    driftedFields: [],
    stored: values,
    status,
    occupants: [],
    roomNumber: roomId ? roomId.replace("room-", "") : null,
    ...overrides,
  };
}

function header(
  id: string,
  status: ReservationStatus,
  roomId: string | null,
  rooms: ReservationRoomUnit[] | undefined,
): ReservationDetail {
  return {
    id,
    confirmationNumber: `NORU-${id}`,
    guestId: "guest-1",
    guestName: "Almaz Bekele",
    guestPhone: null,
    guestEmail: null,
    guestVip: false,
    roomTypeId: "type-1",
    roomTypeName: "Suite",
    roomId,
    roomNumber: roomId ? roomId.replace("room-", "") : null,
    arrivalDate: "2026-10-25",
    departureDate: "2026-10-28",
    nights: 3,
    adults: 1,
    children: 0,
    status,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    roomSubtotal: null,
    nightlyRates: [],
    rooms,
  } as unknown as ReservationDetail;
}

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

function ids(input: Parameters<typeof foRackBarMenuItems>[0]): string[] {
  return foRackBarMenuItems(input).map((item) => item.id);
}

const preArrival = {
  arrivalDate: "2026-10-26",
  businessDate: "2026-10-26",
  canOpenCashiering: true,
  maintenanceRelevant: true,
};

describe("room rack stay menu", () => {
  it("offers pre-arrival actions and labels the room action from assignment", () => {
    const unassigned = ids({ ...preArrival, status: "confirmed", assigned: false });
    assert.deepEqual(unassigned, ["check_in", "assign_room", "edit_stay", "open_folio", "cancel"]);
    assert.equal(unassigned.includes("check_out"), false);
    assert.equal(unassigned.includes("extend_stay"), false);
    assert.equal(unassigned.includes("early_departure"), false);
    assert.equal(unassigned.includes("no_show"), false);
    assert.equal(unassigned.includes("open_maintenance"), false);

    const assigned = foRackBarMenuItems({ ...preArrival, status: "pending", assigned: true });
    assert.equal(assigned.find((item) => item.id === "change_room")?.label, "Change Room");
    assert.equal(
      assigned.some((item) => item.id === "assign_room"),
      false,
    );
    assert.equal(
      assigned.some((item) => item.id === "check_out"),
      false,
    );
  });

  it("shows Mark No-Show only when the existing past-due rule allows it", () => {
    const due = ids({
      ...preArrival,
      status: "confirmed",
      assigned: true,
      arrivalDate: "2026-10-25",
      businessDate: "2026-10-26",
    });
    assert.equal(due.includes("no_show"), true);
    assert.equal(
      foRackBarMenuItems({
        ...preArrival,
        status: "pending",
        assigned: false,
        arrivalDate: "2026-10-25",
      }).some((item) => item.id === "no_show"),
      false,
    );
  });

  it("hides Open Folio without cashiering access", () => {
    const items = ids({
      ...preArrival,
      status: "confirmed",
      assigned: true,
      canOpenCashiering: false,
    });
    assert.equal(items.includes("open_folio"), false);
    assert.equal(items.includes("cancel"), true);
  });

  it("offers in-house actions from the in-house hints", () => {
    const items = foRackBarMenuItems({
      status: "checked_in",
      assigned: true,
      arrivalDate: "2026-10-24",
      businessDate: "2026-10-26",
      canOpenCashiering: true,
      maintenanceRelevant: false,
      staffRole: "receptionist",
      lateCheckoutNeedsApproval: true,
    });
    assert.deepEqual(
      items.map((item) => item.id),
      [
        "check_out",
        "move_room",
        "extend_stay",
        "early_departure",
        "open_folio",
        "add_service",
        "guest_request",
        "late_checkout",
      ],
    );
    assert.equal(
      items.find((item) => item.id === "late_checkout")?.label,
      foRequiresApprovalLabel("Late Checkout", true),
    );
    assert.equal(
      items.some((item) => item.id === "check_in"),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "assign_room"),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "no_show"),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "cancel"),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "open_maintenance"),
      false,
    );

    const maintained = ids({
      status: "checked_in",
      assigned: true,
      arrivalDate: "2026-10-24",
      businessDate: "2026-10-26",
      canOpenCashiering: true,
      maintenanceRelevant: true,
    });
    assert.equal(maintained.at(-1), "open_maintenance");
    assert.equal(foRackMaintenanceRelevant("open"), true);
    assert.equal(foRackMaintenanceRelevant("none"), false);
    assert.equal(foRackMaintenanceRelevant(null), false);

    const unassigned = ids({
      status: "checked_in",
      assigned: false,
      arrivalDate: "2026-10-24",
      businessDate: "2026-10-26",
      canOpenCashiering: false,
      maintenanceRelevant: false,
    });
    assert.equal(unassigned.includes("move_room"), false);
    assert.equal(unassigned.includes("check_out"), true);
  });

  it("keeps departed, cancelled, and no-show rows read-only", () => {
    for (const status of ["checked_out", "cancelled", "no_show"] as const) {
      const items = ids({
        status,
        assigned: true,
        arrivalDate: "2026-10-20",
        businessDate: "2026-10-26",
        canOpenCashiering: true,
        maintenanceRelevant: true,
      });
      assert.deepEqual(items, ["open_folio", "view_details"]);
    }
    const hiddenFolio = ids({
      status: "cancelled",
      assigned: false,
      arrivalDate: "2026-10-20",
      businessDate: "2026-10-26",
      canOpenCashiering: false,
      maintenanceRelevant: false,
    });
    assert.deepEqual(hiddenFolio, ["view_details"]);
  });

  it("gives a checked-in bar the reservationRoomId of its own unit row", () => {
    const [bar] = projectRackStays([
      header("res-in", "checked_in", "room-502", [unit("unit-502", "room-502", "checked_in")]),
    ]);
    assert.equal(bar?.reservationRoomId, "unit-502");
    assert.equal(bar?.roomId, "room-502");
    assert.equal(bar?.status, "checked_in");
    assert.deepEqual(foRackUnitIdentity(bar!), { kind: "unit", reservationRoomId: "unit-502" });
  });

  it("gives a confirmed assigned bar its own unit id", () => {
    const [bar] = projectRackStays([
      header("res-conf", "confirmed", "room-301", [unit("unit-301", "room-301", "confirmed")]),
    ]);
    assert.equal(bar?.reservationRoomId, "unit-301");
    assert.equal(foRackActionStay(bar!, "2026-10-26").reservationRoomId, "unit-301");
  });

  it("draws one bar per unit on a multi-room reservation, each with a different id", () => {
    const bars = projectRackStays([
      header("res-multi", "checked_in", "room-501", [
        unit("unit-501", "room-501", "checked_in"),
        unit("unit-502", "room-502", "checked_in", { departureDate: "2026-10-29" }),
        unit("unit-503", null, "confirmed"),
      ]),
    ]);
    assert.deepEqual(
      bars.map((bar) => [bar.roomId, bar.reservationRoomId, bar.status]),
      [
        ["room-501", "unit-501", "checked_in"],
        ["room-502", "unit-502", "checked_in"],
        [null, "unit-503", "confirmed"],
      ],
    );
    assert.equal(new Set(bars.map((bar) => bar.rackKey)).size, 3);
    assert.equal(bars[1]?.departureDate, "2026-10-29");
    assert.equal(bars[1]?.nights, 4);
    assert.equal(bars[0]?.roomNumber, "501");
    assert.equal(bars[2]?.roomNumber, null);
  });

  it("dispatches the exact bar unit and never a sibling", () => {
    const bars = projectRackStays([
      header("res-multi", "checked_in", "room-501", [
        unit("unit-501", "room-501", "checked_in"),
        unit("unit-502", "room-502", "checked_in"),
      ]),
    ]);
    const room502 = bars.find((bar) => bar.roomId === "room-502")!;
    const actionStay = foRackActionStay(room502, "2026-10-26");
    for (const action of ["check_out", "move_room", "extend_stay", "early_departure"]) {
      assert.equal(actionStay.reservationRoomId, "unit-502", `${action} keeps the clicked unit`);
    }
    assert.equal(actionStay.roomId, "room-502");
    assert.deepEqual(
      actionStay.roomUnits?.map((target) => target.id),
      ["unit-501", "unit-502"],
    );
  });

  it("does not repair a bar that lost its unit id from a sibling", () => {
    const [bar] = projectRackStays([
      header("res-multi", "checked_in", "room-501", [
        unit("unit-501", "room-501", "checked_in"),
        unit("unit-502", "room-502", "checked_in"),
      ]),
    ]);
    const lost = { ...bar!, reservationRoomId: null };
    assert.deepEqual(foRackUnitIdentity(lost), { kind: "invalid" });
    assert.equal(foRackActionStay(lost, "2026-10-26").reservationRoomId, undefined);
    const foreign = { ...bar!, reservationRoomId: "unit-other" };
    assert.deepEqual(foRackUnitIdentity(foreign), { kind: "invalid" });
    assert.equal(foRackActionStay(foreign, "2026-10-26").reservationRoomId, undefined);
  });

  it("treats a row read without its unit rows as an invalid projection", () => {
    const [unread] = projectRackStays([header("res-x", "checked_in", "room-9", undefined)]);
    assert.equal(unread?.reservationRoomId, null);
    assert.deepEqual(foRackUnitIdentity(unread!), { kind: "invalid" });
    assert.equal(foRackActionStay(unread!, "2026-10-26").reservationRoomId, undefined);

    const [legacy] = projectRackStays([header("res-y", "checked_in", "room-9", [])]);
    assert.deepEqual(foRackUnitIdentity(legacy!), { kind: "header" });
  });

  it("reads hotel_reservation_rooms for the rack instead of inferring from occupancy", () => {
    const calendar = read("../components/frontoffice/room-rack-calendar.tsx");
    const reservations = read("reservations.functions.ts");
    const menu = read("fo-rack-bar-menu.ts");
    assert.match(calendar, /includeRoomUnits: true/);
    assert.match(calendar, /projectRackStays\(reservationsQuery\.data\?\.rows/);
    assert.match(calendar, /key=\{stay\.rackKey\}/);
    assert.match(calendar, /setData\(FO_DRAG_MIME, stay\.rackKey\)/);
    assert.match(reservations, /includeRoomUnits: z\.boolean\(\)\.optional\(\)/);
    assert.match(
      reservations,
      /\.from\("hotel_reservation_rooms"\)[\s\S]*?\.in\("reservation_id", ids\)/,
    );
    assert.doesNotMatch(menu, /occupied|OccupancyRoom/);
  });

  it("blocks an unresolved checked-in unit before the owner loader", () => {
    const workspace = read("../components/workspaces/front-office-workspace.tsx");
    const calendar = read("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(workspace, /if \(!stay\.reservationRoomId\) \{/);
    assert.match(workspace, /toast\.error\(FO_RACK_UNRESOLVED_UNIT_MESSAGE\)/);
    assert.match(workspace, /reservationRoomId: stay\.reservationRoomId/);
    assert.match(
      workspace,
      /message === "ROOM_UNIT_NOT_FOUND" \? FO_RACK_UNRESOLVED_UNIT_MESSAGE : message/,
    );
    assert.match(calendar, /foRackActionStay\(stay, businessDate\)/);
    assert.match(calendar, /onAction=\{\(action\) => onRackAction\(action, actionStay\)\}/);
    assert.doesNotMatch(workspace, /toast\.error\(error instanceof Error \? error\.message/);
  });

  it("routes the menu through the existing desk handlers and stops the bar click", () => {
    const calendar = read("../components/frontoffice/room-rack-calendar.tsx");
    const workspace = read("../components/workspaces/front-office-workspace.tsx");
    assert.match(calendar, /data-testid="fo-rack-bar-actions"/);
    assert.match(calendar, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(calendar, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(
      calendar,
      /onOpen=\{\(selected\) =>\s*selectRackStay\(selected, room, selected\.arrivalDate, onSelectStay, onSelectInHouse\)/,
    );
    assert.match(calendar, /foRackBarMenuItems/);
    assert.match(calendar, /foRackActionStay\(stay, businessDate\)/);
    assert.match(workspace, /onRackAction=\{onRackBarAction\}/);
    assert.match(workspace, /onSheetAction\("assign", stay\)/);
    assert.match(workspace, /onContinueCheckInFromWorkspace\(stay\)/);
    assert.match(workspace, /openLoadedInHouseAction\("amend_stay", stay\)/);
    assert.match(workspace, /openLoadedInHouseAction\("room_move", stay\)/);
    assert.match(workspace, /openLoadedInHouseAction\("check_out", stay\)/);
    assert.match(workspace, /openLoadedInHouseAction\("late_checkout", stay\)/);
    assert.match(workspace, /reservationRoomId: stay\.reservationRoomId/);
    assert.match(workspace, /setSearchCancelStay\(stay\)/);
    assert.match(workspace, /navigate\(\{ to: MAINTENANCE_HREF \}\)/);
    assert.doesNotMatch(calendar, /completeFoCheckIn|completeFoCheckOut|amendReservation/);
  });
});
