import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { occupancyExceeded } from "@/packages/pms/lib/fo-amendments";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  affectedRoomLabel,
  assignmentEditLocked,
  buildConfirmNextEvents,
  buildEditChangeRows,
  buildEditImpactRows,
  confirmIsEnabled,
  datesEditLocked,
  draftFromReservation,
  EDIT_NO_CHANGE,
  EDIT_NOT_EVALUATED,
  folioReconciliationNotice,
  occupancyIsBlocked,
  persistableChanges,
  pickLatestAmendHistory,
  roomTotalImpact,
  roomTypeEditLocked,
  stayDatesLabel,
  stayEditLocked,
} from "@/packages/pms/lib/reservation-edit-workspace";

function reservation(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    confirmationNumber: "NR-000245",
    guestId: "22222222-2222-2222-2222-222222222222",
    guestName: "Maria Santos",
    guestPhone: "+351 91 234 5678",
    guestEmail: "maria@email.com",
    guestVip: true,
    roomTypeId: "33333333-3333-3333-3333-333333333333",
    roomTypeName: "Deluxe King",
    roomTypeCode: "DK",
    roomId: "44444444-4444-4444-4444-444444444444",
    roomNumber: "305",
    arrivalDate: "2026-09-22",
    departureDate: "2026-09-24",
    nights: 2,
    adults: 2,
    children: 0,
    status: "confirmed",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    specialRequests: "High floor, airport pickup.",
    notes: "",
    cancellationReason: null,
    source: "walk_in",
    ratePlanId: "55555555-5555-5555-5555-555555555555",
    ratePlanName: "BAR (Best Available Rate)",
    currency: "ETB",
    roomSubtotal: 9000,
    nightlyRates: [
      { date: "2026-09-22", rate: 4500 },
      { date: "2026-09-23", rate: 4500 },
    ],
    pricedAt: "2026-09-20T00:00:00.000Z",
    commercialBookingSource: "direct",
    marketSegment: "leisure",
    externalReference: "TA-45891",
    guaranteeMethod: "credit_card",
    companyMasterId: null,
    companyName: "ABC Trading PLC",
    travelAgentMasterId: null,
    travelAgentName: "XYZ Travel Agency",
    groupAccountMasterId: null,
    groupName: "ETA Annual Conference 2026",
    roomOperationalStatus: null,
    housekeepingStatus: null,
    infants: 0,
    roomsRequested: 1,
    purposeOfStay: "holiday",
    salesChannel: "walk_in",
    depositRequirementSnapshot: {
      required: true,
      computed_amount: 4500,
      intended_tender_code: "credit_card",
    },
    cancellationPolicySnapshot: { name: "Free cancellation until 20 Sep 2026" },
    refundabilitySnapshot: null,
    createdByStaffMembershipId: null,
    createdByName: "Abebawe Demeke",
    bookerGuestId: null,
    lateCheckoutGranted: null,
    expectedArrivalAt: null,
    lateCheckoutUntil: null,
    reservationMode: "single",
    ...overrides,
  };
}

describe("reservation edit workspace helpers", () => {
  it("maps live reservation fields into an edit draft", () => {
    const draft = draftFromReservation(reservation());
    expect(draft.guestName).toBe("Maria Santos");
    expect(draft.guestId).toBe(reservation().guestId);
    expect(draft.unitCount).toBe(1);
    expect(draft.reservationRoomId).toBeNull();
    expect(stayDatesLabel(draft.arrival, draft.departure)).toContain("2 nights");
  });

  it("selects the only room unit and leaves a multi-room stay unselected", () => {
    const only = draftFromReservation(
      reservation({
        rooms: [
          {
            id: "66666666-6666-6666-6666-666666666666",
            unitSequence: 1,
            roomTypeId: "33333333-3333-3333-3333-333333333333",
            roomId: "44444444-4444-4444-4444-444444444444",
            arrivalDate: "2026-09-22",
            departureDate: "2026-09-24",
            adults: 2,
            children: 0,
            ratePlanId: "55555555-5555-5555-5555-555555555555",
            status: "confirmed",
          },
        ] as ReservationDetail["rooms"],
      }),
    );
    expect(only.reservationRoomId).toBe("66666666-6666-6666-6666-666666666666");
    expect(stayEditLocked(only)).toBe(false);
    expect(datesEditLocked(only)).toBe(false);
    expect(roomTypeEditLocked(only)).toBe(false);

    const many = draftFromReservation(
      reservation({
        rooms: [
          {
            id: "66666666-6666-6666-6666-666666666666",
            unitSequence: 1,
            roomTypeId: "33333333-3333-3333-3333-333333333333",
            roomId: null,
            arrivalDate: "2026-09-22",
            departureDate: "2026-09-24",
            adults: 2,
            children: 0,
            ratePlanId: null,
            status: "confirmed",
          },
          {
            id: "77777777-7777-7777-7777-777777777777",
            unitSequence: 2,
            roomTypeId: "33333333-3333-3333-3333-333333333333",
            roomId: null,
            arrivalDate: "2026-09-22",
            departureDate: "2026-09-24",
            adults: 1,
            children: 0,
            ratePlanId: null,
            status: "checked_in",
          },
        ] as ReservationDetail["rooms"],
      }),
    );
    expect(many.reservationRoomId).toBeNull();
    expect(many.unitCount).toBe(2);
    expect(stayEditLocked(many)).toBe(true);
    expect(datesEditLocked(many)).toBe(true);
    expect(roomTypeEditLocked(many)).toBe(true);
    expect(assignmentEditLocked(many)).toBe(true);

    const checkedIn = { ...only, unitStatus: "checked_in" };
    expect(assignmentEditLocked(checkedIn)).toBe(true);
    expect(datesEditLocked(checkedIn)).toBe(true);
  });

  it("lists only fields confirm writes, and ignores a typed guest name", () => {
    const before = draftFromReservation(reservation());
    const after = {
      ...before,
      departure: "2026-09-26",
      guestName: "Typed Name",
      notes: "Staff note",
    };
    const rows = buildEditChangeRows({ before, after });
    const items = rows.map((row) => row.item);
    expect(items).not.toContain("Purpose of Stay");
    expect(items).not.toContain("Company");
    expect(items).not.toContain("Travel Agent");
    expect(items).not.toContain("Group");
    expect(items).not.toContain("Channel");
    expect(items).not.toContain("Flexible Dates");
    expect(items).not.toContain("Packages");
    expect(items).not.toContain("Rooms");
    expect(items).not.toContain("Booking Contact");
    const stay = rows.find((row) => row.item === "Stay Dates");
    expect(stay?.change).toContain("+ 2 night");
    expect(stay?.persistable).toBe(true);
    expect(rows.find((row) => row.item === "Guest")?.change).toBe(EDIT_NO_CHANGE);
    expect(rows.find((row) => row.item === "Reservation Internal Notes")?.persistable).toBe(true);
    expect(persistableChanges(rows).map((row) => row.item)).toEqual([
      "Stay Dates",
      "Reservation Internal Notes",
    ]);

    const linked = buildEditChangeRows({
      before,
      after: { ...before, guestId: "88888888-8888-8888-8888-888888888888", guestName: "New Guest" },
    });
    expect(linked.find((row) => row.item === "Guest")?.after).toBe("New Guest");
  });

  it("does not fake impact when availability or quote are missing", () => {
    const rows = buildEditImpactRows({
      datesValid: true,
      availability: null,
      availabilityLoaded: false,
      occupancyBlocked: false,
      maxOccupancy: 3,
      quotedTotal: null,
      quoteLoaded: false,
      currentTotal: 9000,
      money: (value) => `ETB ${value}`,
      assignmentCleared: false,
      roomChanged: false,
      ratePlanChanged: false,
      stayChanged: true,
      occupancyChanged: false,
      updatedCancellation: null,
    });
    expect(rows.find((row) => row.id === "availability")?.detail).toBe(EDIT_NOT_EVALUATED);
    expect(rows.find((row) => row.id === "rate")?.detail).toBe(
      "The updated room total is not available yet.",
    );
    expect(rows.find((row) => row.id === "guest-services")).toBeUndefined();
    expect(rows.find((row) => row.id === "deposit")).toBeUndefined();
    expect(rows.find((row) => row.id === "housekeeping")).toBeUndefined();
    expect(rows.some((row) => /notified|rpc|writer|re-quoted/i.test(row.detail))).toBe(false);
  });

  it("formats stay dates for staff and prices only authoritative totals", () => {
    expect(stayDatesLabel("2026-10-23", "2026-10-24")).toBe("23 Oct 2026 – 24 Oct 2026 (1 night)");
    expect(
      roomTotalImpact({
        label: "Reservation Room Total",
        priceChanging: true,
        previousTotal: 1000,
        quotedTotal: 1500,
      }),
    ).toMatchObject({ previous: 1000, next: 1500, delta: 500 });
    expect(
      roomTotalImpact({
        label: "Reservation Room Total",
        priceChanging: true,
        previousTotal: 1000,
        quotedTotal: null,
      })?.delta,
    ).toBeNull();
    expect(
      folioReconciliationNotice({
        commercialChange: false,
        folioStatus: "open",
        invoiced: false,
        hasRoomCharge: true,
      }),
    ).toBeNull();
    expect(
      folioReconciliationNotice({
        commercialChange: true,
        folioStatus: "open",
        invoiced: false,
        hasRoomCharge: true,
      })?.detail,
    ).toContain("reconciled");
    expect(
      folioReconciliationNotice({
        commercialChange: true,
        folioStatus: "closed",
        invoiced: false,
        hasRoomCharge: true,
      })?.tone,
    ).toBe("warn");
    const single = draftFromReservation(reservation());
    expect(
      affectedRoomLabel({ ...single, roomNumber: "401", roomTypeName: "Card2 Smoke Twin" }),
    ).toBe("Room 401 · Card2 Smoke Twin");
  });

  it("enables confirm only when persistable changes pass existing validation", () => {
    expect(
      confirmIsEnabled({
        datesValid: true,
        availabilityNone: false,
        occupancyBlocked: false,
        hasPersistableChange: true,
      }),
    ).toBe(true);
    expect(
      confirmIsEnabled({
        datesValid: true,
        availabilityNone: true,
        occupancyBlocked: false,
        hasPersistableChange: true,
      }),
    ).toBe(false);
    expect(
      confirmIsEnabled({
        datesValid: true,
        availabilityNone: false,
        occupancyBlocked: false,
        hasPersistableChange: false,
      }),
    ).toBe(false);
    expect(occupancyIsBlocked(3, 1, 3)).toBe(occupancyExceeded(3, 1, 3));
  });

  it("only claims next events the existing amendment path performs", () => {
    const events = buildConfirmNextEvents({
      inventoryChanged: true,
      rateMayChange: true,
      folioReconciled: false,
    });
    expect(events.map((event) => event.id)).toEqual(["updated", "inventory", "rate", "audit"]);
    expect(
      buildConfirmNextEvents({
        inventoryChanged: false,
        rateMayChange: false,
        folioReconciled: true,
      }).map((event) => event.id),
    ).toEqual(["updated", "folio", "audit"]);
    expect(
      events.some((event) => /email|guest notified|rpc|writer|server reprice/i.test(event.detail)),
    ).toBe(false);
  });

  it("prefers amended history after confirm", () => {
    const latest = pickLatestAmendHistory([
      {
        id: "h1",
        eventType: "amended",
        previousValues: null,
        newValues: null,
        notes: "Guest extended stay by 2 nights.",
        createdAt: "2026-09-20T10:24:00.000Z",
        actorName: "Abebawe Demeke",
      },
    ]);
    expect(latest?.actorName).toBe("Abebawe Demeke");
  });
});

describe("reservation edit workspace UI", () => {
  const ui = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-edit-workspace.tsx"),
    "utf8",
  );
  const detail = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx",
    ),
    "utf8",
  );
  const desk = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
    "utf8",
  );

  it("renders the three edit steps and only the committed controls", () => {
    expect(ui).toContain('data-testid="edit-reservation-workspace"');
    expect(ui).toContain("Draft Summary");
    expect(ui).toContain("Not yet saved");
    expect(ui).toContain("Reservation Internal Notes");
    expect(ui).toContain("Reservation Room Total");
    expect(ui).toContain("reservationRoomId: liveDraft.reservationRoomId");
    expect(ui).toContain("Booking Source & Classification");
    expect(ui).toContain("Room & Rate");
    expect(ui).toContain("Special Requests");
    expect(ui).toContain("Stay Details");
    expect(ui).toContain("Changes Summary");
    expect(ui).toContain("Impact Analysis");
    expect(ui).toContain("Review Changes");
    expect(ui).toContain("Search existing guest");
    expect(ui).toContain("Current reservation");
    expect(ui).not.toContain('aria-label="Close"');
    expect(ui).toContain("onRegisterCloseGuard");
    expect(ui).toContain("Edited");
    expect(ui).toContain("Reservation Summary");
    expect(ui).toContain("Changes saved");
    expect(ui).toContain("Changes Saved Successfully");
    expect(ui).toContain("System Updates Completed");
    expect(ui).toContain("Print Amendment");
    expect(ui).toContain("ReservationAmendmentPrint");
    expect(ui).not.toContain("The reservation has been successfully updated.");
    expect(ui).not.toContain("Print reservation");
    expect(ui).not.toContain("Dates and occupancy save for a one-room stay.");
    expect(ui).toContain("amendReservation");
    expect(ui).toContain("quoteStay");
    expect(ui).toContain("getRoomTypeAvailability");
    expect(ui).not.toContain("View Profile");
    expect(ui).not.toContain("View Reservation");
    expect(ui).not.toContain("Back to Reservation");
    expect(ui).not.toContain("Go to Reservation");
    expect(ui).not.toContain("Save Draft");
    expect(ui).not.toContain("saveSessionDraft");
    expect(ui).not.toContain("sessionStorage");
    expect(ui).not.toContain("Purpose of Stay");
    expect(ui).not.toContain("Flexible Dates");
    expect(ui).not.toContain("Keep room unassigned");
    expect(ui).not.toContain("local in this phase");
    expect(ui).not.toContain("display-only in this phase");
    expect(ui).not.toContain("does not recalculate");
    expect(ui).not.toMatch(
      /amendment writer|existing amendment RPC|server reprice|persistable stay/i,
    );
    const printUi = readFileSync(
      resolve(
        process.cwd(),
        "src/packages/pms/components/bookings/reservation-amendment-print.tsx",
      ),
      "utf8",
    );
    const printLib = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/reservation-amendment-print.ts"),
      "utf8",
    );
    expect(printLib).toContain("RESERVATION AMENDMENT CONFIRMATION");
    expect(printUi).toContain("AMENDMENT_PRINT_TITLE");
    expect(printUi).toContain("reservation-print-document");
    expect(printUi).toContain("Changes to your reservation");
    expect(printUi).toContain("Reservation Room Total");
    expect(printUi).toContain("Package Amount");
    expect(printUi).not.toContain("Reservation Internal Notes");
    expect(printUi).not.toContain("Total Amount");
    expect(desk).not.toContain("hideClose");
    expect(desk).toContain("editCloseGuardRef.current()");
    expect(ui).not.toContain("Guest notified");
    expect(ui).not.toContain("Confirmation Sent");
    expect(ui).not.toContain("email sent successfully");
  });

  it("keeps unit assignment, reprice, and folio reconciliation on the confirm path", () => {
    const functions = readFileSync(
      resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
      "utf8",
    );
    const drizzle = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0178_edit_reservation_room_charge_reconcile.sql"),
      "utf8",
    );
    const supabase = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0178_edit_reservation_room_charge_reconcile.sql"),
      "utf8",
    );
    const edit = functions.slice(
      functions.indexOf("async function applyUnitScopedReservationEdit"),
      functions.indexOf("export const amendReservation"),
    );
    expect(edit).toContain("reprice_hotel_reservation_room");
    expect(edit).toContain("assign_hotel_reservation_room_unit");
    expect(edit).toContain("assert_reservation_unit_room_charge_reconcilable");
    expect(edit).toContain("reconcile_reservation_unit_room_charge");
    expect(edit).not.toContain("open_folio_for_reservation");
    expect(drizzle).toBe(supabase);
    expect(drizzle).toContain("DROP INDEX IF EXISTS public.folio_transactions_room_charge_once");
    expect(drizzle).toContain("FOLIO_CLOSED");
    expect(drizzle).toContain("CORRECTION_INVOICED");
    expect(drizzle).not.toMatch(/open_folio_for_reservation\s*\(/);
  });

  it("opens from Desk Edit and removes the Detail header Edit button", () => {
    expect(desk).toContain("openEditReservation(row.reservationId)");
    expect(desk).toContain("<ReservationEditWorkspace");
    expect(desk).not.toContain("amendRequest");
    expect(detail).not.toContain("<Pencil");
    expect(detail).toContain("Amend stay");
    expect(detail).toContain('data-testid="amend-stay-dialog"');
  });
});
