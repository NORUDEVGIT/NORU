import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { deskActionHints } from "./desk.server.ts";
import { operationalViewStatuses } from "./search.server.ts";
import { OPERATIONAL_RESERVATION_VIEWS } from "./shared-read-models.ts";

const desk = readFileSync(new URL("./desk.server.ts", import.meta.url), "utf8");
const search = readFileSync(new URL("./search.server.ts", import.meta.url), "utf8");

describe("DB-04I-02 Reservation Desk read model", () => {
  it("uses property business date rather than browser-local today", () => {
    assert.match(desk, /resolvePropertyBusinessDate/);
    assert.match(desk, /\.select\("business_date, timezone"\)/);
    assert.doesNotMatch(desk, /propertyToday\(/);
    assert.doesNotMatch(desk, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  it("loads rows from the shared operational search spine", () => {
    assert.match(desk, /searchOperationalReservations\(/);
    assert.doesNotMatch(desk, /listReservations/);
    assert.doesNotMatch(desk, /getBookingsDashboard/);
    assert.doesNotMatch(desk, /OPERATIONAL_RESERVATION_SELECT/);
    assert.match(search, /export async function searchOperationalReservations/);
    assert.match(search, /listOperationalReservations[\s\S]*searchOperationalReservations/);
  });

  it("maps every approved Desk view into the shared search service", () => {
    assert.deepEqual(
      [...OPERATIONAL_RESERVATION_VIEWS],
      ["all", "arrivals", "departures", "in_house", "unassigned", "pending", "groups"],
    );
    assert.match(desk, /const view = data\.view \?\? "all"/);
    assert.match(desk, /input: data/);
    assert.doesNotMatch(desk, /view: "waitlist"|OPERATIONAL_RESERVATION_VIEWS.*waitlist/);
  });

  it("counts KPIs with shared view statuses and business-date predicates", () => {
    assert.deepEqual(operationalViewStatuses("arrivals"), ["pending", "confirmed"]);
    assert.deepEqual(operationalViewStatuses("departures"), ["confirmed", "checked_in"]);
    assert.deepEqual(operationalViewStatuses("in_house"), ["checked_in"]);
    assert.deepEqual(operationalViewStatuses("unassigned"), ["pending", "confirmed"]);
    assert.deepEqual(operationalViewStatuses("groups"), ["pending", "confirmed", "checked_in"]);
    assert.match(desk, /operationalViewStatuses\("arrivals"\)/);
    assert.match(desk, /operationalViewStatuses\("departures"\)/);
    assert.match(desk, /operationalViewStatuses\("unassigned"\)/);
    assert.match(desk, /operationalViewStatuses\("groups"\)/);
    assert.match(desk, /\.eq\("arrival_date", businessDate\)/);
    assert.match(desk, /\.eq\("departure_date", businessDate\)/);
    assert.match(desk, /\.eq\("status", "checked_in"\)/);
    assert.match(desk, /\.eq\("status", "pending"\)/);
    assert.match(desk, /\.is\("room_id", null\)/);
    assert.match(desk, /\.eq\("guest_profiles\.vip_status", true\)/);
    assert.match(desk, /\.not\("group_account_master_id", "is", null\)/);
  });

  it("does not invent a waitlist queue and marks groups as linked-master partial", () => {
    assert.match(desk, /waitlist: null/);
    assert.match(desk, /waitlist: false/);
    assert.match(desk, /groups: "partial"/);
    assert.match(desk, /linkedGroupReservations/);
    assert.doesNotMatch(desk, /waitlist:\s*0/);
    assert.doesNotMatch(desk, /allotment|pickup/);
  });

  it("treats available rooms as physical vacant inventory, not type-night sellable", () => {
    assert.match(desk, /availableRooms: "partial"/);
    assert.match(desk, /\.from\("hotel_rooms"\)/);
    assert.match(desk, /\.eq\("status", "available"\)/);
    assert.match(desk, /availableStatusRooms - occupiedRooms/);
    assert.doesNotMatch(desk, /pms_room_type_availability|count_sellable_rooms/);
    assert.doesNotMatch(desk, /getFrontOfficeDashboard/);
  });

  it("keeps KPI counts head-only and parallel to the shared page read", () => {
    assert.match(desk, /select\("id", \{ count: "exact", head: true \}\)/);
    assert.match(desk, /Promise\.all\(\[\s*loadReservationDeskKpis/);
    assert.match(desk, /searchOperationalReservations/);
    assert.doesNotMatch(desk, /guest_folios|folio_transactions|pms_evaluate_room_assignment/);
  });

  it("preserves shared pagination metadata and tenant scoping on every count", () => {
    assert.match(desk, /page: page\.page/);
    assert.match(desk, /pageSize: page\.pageSize/);
    assert.match(desk, /total: page\.total/);
    assert.match(desk, /hasMore: page\.hasMore/);
    const restaurantEq = desk.match(/\.eq\("restaurant_id"/g) ?? [];
    assert.ok(restaurantEq.length >= 4);
  });

  it("derives lightweight action hints without claiming FO or RBAC authority", () => {
    assert.deepEqual(deskActionHints({ status: "pending", roomId: null }), {
      canOpen: true,
      canAssignRoom: true,
      canConfirm: true,
      canCancel: true,
      canCheckIn: false,
      canCheckOut: false,
    });
    assert.deepEqual(deskActionHints({ status: "confirmed", roomId: "room-1" }), {
      canOpen: true,
      canAssignRoom: false,
      canConfirm: false,
      canCancel: true,
      canCheckIn: true,
      canCheckOut: false,
    });
    assert.deepEqual(deskActionHints({ status: "checked_in", roomId: "room-1" }), {
      canOpen: true,
      canAssignRoom: false,
      canConfirm: false,
      canCancel: false,
      canCheckIn: false,
      canCheckOut: true,
    });
    assert.deepEqual(deskActionHints({ status: "checked_out", roomId: "room-1" }), {
      canOpen: true,
      canAssignRoom: false,
      canConfirm: false,
      canCancel: false,
      canCheckIn: false,
      canCheckOut: false,
    });
  });

  it("does not pull Quick View, calendar, exceptions, or financial columns", () => {
    assert.doesNotMatch(desk, /Quick View|getReservationFolio|listArrivals|listFoException/);
    assert.doesNotMatch(desk, /CREATE_RESERVATION_SECTION7_APPLY/);
    assert.match(desk, /requireReservationManager/);
  });
});
