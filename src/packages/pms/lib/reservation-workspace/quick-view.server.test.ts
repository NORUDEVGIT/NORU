import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { deskActionHints } from "./desk.server.ts";
import { quickViewExceptionKeys } from "./quick-view.server.ts";
import { operationalRoomState, toReservationOperationalSummary } from "./search.server.ts";

const qv = readFileSync(new URL("./quick-view.server.ts", import.meta.url), "utf8");
const desk = readFileSync(new URL("./desk.server.ts", import.meta.url), "utf8");

const base = {
  status: "confirmed" as const,
  roomId: "room-1",
  operationalStatus: "available" as string | null,
  housekeepingStatus: "clean" as string | null,
  ratePlanId: "rate-1",
  roomSubtotal: 100,
  arrivalDate: "2026-09-23",
  departureDate: "2026-09-25",
  businessDate: "2026-09-23",
};

describe("DB-04I-03 Reservation Quick View read model", () => {
  it("scopes reads to restaurantId + reservationId and rejects missing rows", () => {
    assert.match(qv, /requireReservationManager/);
    assert.match(qv, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(qv, /\.eq\("id", data\.reservationId\)/);
    assert.match(qv, /Reservation not found for this property/);
    assert.match(qv, /\.eq\("reservation_id", data\.reservationId\)/);
  });

  it("reuses the operational mapper, shared SELECT, and Desk action hints", () => {
    assert.match(qv, /OPERATIONAL_RESERVATION_SELECT/);
    assert.match(qv, /toReservationOperationalSummary/);
    assert.match(qv, /deskActionHints\(summary\)/);
    assert.match(qv, /from "\.\/desk\.server"/);
    assert.match(desk, /export function deskActionHints/);
    assert.doesNotMatch(qv, /getReservation\b|listReservations\b/);
    assert.doesNotMatch(qv, /pms_evaluate_room_assignment/);
  });

  it("maps identity, stay, room, unassigned, and guest VIP from the shared summary", () => {
    const row = toReservationOperationalSummary({
      id: "00000000-0000-4000-8000-000000000001",
      confirmation_number: "NORU-2401",
      arrival_date: "2026-09-23",
      departure_date: "2026-09-26",
      adults: 2,
      children: 1,
      status: "pending",
      source: "staff",
      room_type_id: "type-1",
      room_id: null,
      guest_id: "guest-1",
      rate_plan_id: null,
      room_subtotal: null,
      currency: null,
      company_master_id: null,
      travel_agent_master_id: null,
      group_account_master_id: null,
      commercial_booking_source: null,
      market_segment: null,
      external_reference: null,
      guarantee_method: null,
      special_requests: null,
      notes: null,
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-22T10:00:00Z",
      guest_profiles: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+44 20 0000 0000",
        email: "ada@example.test",
        vip_status: true,
      },
      room_types: { name: "Deluxe King" },
      hotel_rooms: null,
      rate_plan: null,
      company: null,
      travel_agent: null,
      group_account: null,
    });
    assert.equal(row.guestName, "Ada Lovelace");
    assert.equal(row.guestVip, true);
    assert.equal(row.guestPhone, "+44 20 0000 0000");
    assert.equal(row.roomId, null);
    assert.equal(row.roomNumber, null);
    assert.equal(row.status, "pending");
    assert.equal(row.nights, 3);
    assert.deepEqual(operationalRoomState({ hotel_rooms: null } as never), {
      operationalStatus: null,
      housekeepingStatus: null,
    });
  });

  it("maps Company, TA and Group when linked and keeps null relationships honest", () => {
    assert.match(qv, /linkedMaster\(summary\.companyMasterId, summary\.companyName\)/);
    assert.match(qv, /linkedMaster\(summary\.travelAgentMasterId, summary\.travelAgentName\)/);
    assert.match(qv, /linkedMaster\(summary\.groupAccountMasterId, summary\.groupName\)/);
    assert.match(qv, /if \(!id\) return null/);
  });

  it("preserves priced snapshot vs unpriced pending and Section 7 nulls", () => {
    assert.match(qv, /ratePlanId: summary\.ratePlanId/);
    assert.match(qv, /roomSubtotal: summary\.roomSubtotal/);
    assert.match(qv, /guaranteeMethod: summary\.guaranteeMethod/);
    assert.doesNotMatch(qv, /price_hotel_stay|quoteStay/);
  });

  it("loads financial signal without failing Quick View when Cashiering is denied", () => {
    assert.match(qv, /requireCashieringAccess/);
    assert.match(qv, /permission_denied/);
    assert.match(qv, /not_available/);
    assert.match(qv, /from\("guest_folios"\)/);
    assert.match(qv, /from\("folio_transactions"\)/);
    assert.match(qv, /\.select\("amount"\)/);
    assert.doesNotMatch(qv, /card_number|payment_method_details/);
    assert.match(qv, /loadQuickViewFinancial\(/);
    assert.match(qv, /Promise\.all\(\[/);
  });

  it("reads housekeeping and operational room state from the assigned room embed", () => {
    assert.deepEqual(
      operationalRoomState({
        hotel_rooms: { room_number: "404", status: "out_of_order", housekeeping_status: "dirty" },
      } as never),
      { operationalStatus: "out_of_order", housekeepingStatus: "dirty" },
    );
    assert.match(qv, /operationalRoomState\(row\)/);
  });

  it("loads only the latest history event", () => {
    assert.match(qv, /from\("hotel_reservation_history"\)/);
    assert.match(qv, /\.order\("created_at", \{ ascending: false \}\)/);
    assert.match(qv, /\.limit\(1\)/);
    assert.doesNotMatch(qv, /\.limit\(100\)/);
  });

  it("reuses Desk hints and does not invent FO/Reservation-invalid transitions", () => {
    const confirmed = deskActionHints({ status: "confirmed", roomId: "room-1" });
    const inHouse = deskActionHints({ status: "checked_in", roomId: "room-1" });
    const departed = deskActionHints({ status: "checked_out", roomId: "room-1" });
    assert.equal(confirmed.canCheckIn, true);
    assert.equal(confirmed.canCheckOut, false);
    assert.equal(inHouse.canCancel, false);
    assert.equal(inHouse.canConfirm, false);
    assert.equal(departed.canCheckIn, false);
    assert.equal(departed.canCheckOut, false);
    assert.match(
      qv,
      /canOpenFolio: financial\.state === "available" && financial\.folioId !== null/,
    );
  });

  it("derives only current-safe exception keys", () => {
    assert.deepEqual(quickViewExceptionKeys({ ...base, roomId: null }), ["unassigned"]);
    assert.deepEqual(quickViewExceptionKeys({ ...base, operationalStatus: "out_of_order" }), [
      "room_unavailable",
    ]);
    assert.deepEqual(quickViewExceptionKeys({ ...base, housekeepingStatus: "dirty" }), [
      "room_not_ready",
    ]);
    assert.deepEqual(quickViewExceptionKeys({ ...base, ratePlanId: null, roomSubtotal: null }), [
      "missing_rate_snapshot",
    ]);
    assert.deepEqual(
      quickViewExceptionKeys({ ...base, status: "pending", ratePlanId: null, roomSubtotal: null }),
      [],
    );
    assert.deepEqual(quickViewExceptionKeys({ ...base, arrivalDate: "2026-09-20" }), [
      "overdue_arrival",
    ]);
    assert.deepEqual(
      quickViewExceptionKeys({
        ...base,
        status: "checked_in",
        departureDate: "2026-09-20",
      }),
      ["overdue_departure"],
    );
  });

  it("does not open Detail, Calendar, Arrivals, Exceptions, or change lifecycle", () => {
    assert.doesNotMatch(qv, /getReservationDesk|listOperationalReservations/);
    assert.doesNotMatch(qv, /check_in_hotel_reservation|setReservationStatus/);
    assert.doesNotMatch(qv, /CREATE_RESERVATION_SECTION7_APPLY/);
  });
});
