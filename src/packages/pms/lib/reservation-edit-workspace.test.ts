import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { occupancyExceeded } from "@/packages/pms/lib/fo-amendments";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  buildConfirmNextEvents,
  buildEditChangeRows,
  buildEditImpactRows,
  confirmIsEnabled,
  draftFromReservation,
  EDIT_LOCAL_ONLY,
  EDIT_NO_CHANGE,
  EDIT_NOT_EVALUATED,
  occupancyIsBlocked,
  persistableChanges,
  pickLatestAmendHistory,
  sessionDraftKey,
  stayDatesLabel,
  toggleRequestPref,
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
    ...overrides,
  };
}

describe("reservation edit workspace helpers", () => {
  it("maps live reservation fields into an edit draft", () => {
    const draft = draftFromReservation(reservation());
    expect(draft.guestName).toBe("Maria Santos");
    expect(draft.bookerSameAsGuest).toBe(true);
    expect(draft.keepRoomUnassigned).toBe(false);
    expect(draft.rooms).toBe(1);
    expect(stayDatesLabel(draft.arrival, draft.departure)).toContain("2 nights");
  });

  it("marks persistable stay changes and local-only unsupported fields", () => {
    const before = draftFromReservation(reservation());
    const after = {
      ...before,
      departure: "2026-09-26",
      purposeOfStay: "business",
      companyName: "Other Co",
      flexibleDates: true,
    };
    const rows = buildEditChangeRows({
      before,
      after,
      beforeTotal: "ETB 9,000",
      afterTotal: "ETB 18,000",
      beforeRate: "ETB 4,500",
      afterRate: "ETB 4,500",
      beforePackages: "Breakfast Included",
      afterPackages: "Breakfast Included",
      beforeDeposit: "ETB 4,500 (credit card)",
      afterDeposit: "ETB 4,500 (credit card)",
      beforeCancellation: "Free cancellation until 20 Sep 2026",
      afterCancellation: "Free cancellation until 20 Sep 2026",
    });
    const stay = rows.find((row) => row.item === "Stay Dates");
    expect(stay?.change).toContain("+ 2 night");
    expect(stay?.persistable).toBe(true);
    expect(rows.find((row) => row.item === "Purpose of Stay")?.change).toBe(EDIT_LOCAL_ONLY);
    expect(rows.find((row) => row.item === "Company")?.change).toBe(EDIT_LOCAL_ONLY);
    expect(rows.find((row) => row.item === "Flexible Dates")?.change).toBe(EDIT_LOCAL_ONLY);
    expect(rows.find((row) => row.item === "Packages")?.change).toBe(EDIT_NO_CHANGE);
    expect(persistableChanges(rows).map((row) => row.item)).toContain("Stay Dates");
    expect(persistableChanges(rows).map((row) => row.item)).not.toContain("Purpose of Stay");
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
    });
    expect(rows.find((row) => row.id === "availability")?.detail).toBe(EDIT_NOT_EVALUATED);
    expect(rows.find((row) => row.id === "rate")?.detail).toBe(EDIT_NOT_EVALUATED);
    expect(rows.find((row) => row.id === "guest-services")?.detail).toContain("No guest-services");
    expect(rows.find((row) => row.id === "housekeeping")?.detail).not.toMatch(/notified/i);
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
      stayChanged: true,
      assignmentChanged: false,
      rateMayChange: true,
    });
    expect(events.map((event) => event.id)).toEqual(["updated", "inventory", "rate", "audit"]);
    expect(
      events.some((event) => /email|guest notified|housekeeping notified/i.test(event.title)),
    ).toBe(false);
  });

  it("prefers amended history after confirm and keeps drafts session-scoped", () => {
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
    expect(sessionDraftKey("res-1")).toContain("noru.edit-reservation.draft.");
    expect(toggleRequestPref("High Floor", "Quiet Room", true)).toContain("Quiet Room");
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

  it("renders the three edit steps and live sections without fake persistence", () => {
    expect(ui).toContain('data-testid="edit-reservation-workspace"');
    expect(ui).toContain("Guest & Booker Information");
    expect(ui).toContain("Booking Source & Classification");
    expect(ui).toContain("Room & Rate Details");
    expect(ui).toContain("Special Requests & Preferences");
    expect(ui).toContain("Stay Details");
    expect(ui).toContain("Additional Information");
    expect(ui).toContain("Changes Summary");
    expect(ui).toContain("Impact Analysis");
    expect(ui).toContain("Updated Reservation Details");
    expect(ui).toContain("Updated Financial Summary");
    expect(ui).toContain("What Happens Next");
    expect(ui).toContain("Audit Information");
    expect(ui).toContain("Save Draft");
    expect(ui).toContain("saveSessionDraft");
    expect(ui).toContain("amendReservation");
    expect(ui).toContain("quoteStay");
    expect(ui).toContain("getRoomTypeAvailability");
    expect(ui).not.toContain("Guest notified");
    expect(ui).not.toContain("Confirmation Sent");
    expect(ui).not.toContain("email sent successfully");
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
