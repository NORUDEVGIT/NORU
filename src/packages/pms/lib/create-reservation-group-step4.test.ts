import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { compactRoomOccupancy, groupRoomTotal } from "./create-reservation-group-step23";
import { buildDraftReservationPrintData } from "./reservation-print-document";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("GROUP-RES-05 Step 4 review", () => {
  const page = read("../components/bookings/create-reservation-page.tsx");
  const review = read("../components/bookings/create-reservation-review.tsx");
  const printUi = read("../components/bookings/reservation-print-document.tsx");
  const fo = read("./fo-check-in.functions.ts");
  const reviewSection = page.slice(
    page.indexOf("const reviewSection"),
    page.indexOf("function roomRateLabel"),
  );

  it("keeps the single Step 4 cards", () => {
    expect(review).toContain("Guest & Booker Information");
    expect(review).toContain('title="Stay Information"');
    expect(review).toContain('title="Room & Rate Information"');
    expect(review).toContain('testId="review-card-rate"');
    expect(review).toContain('data-testid="review-room-lines"');
    expect(review).toContain("(props.roomLines?.length ?? 0) > 1");
    expect(review).toContain('title="Payment & Deposit"');
    expect(review).toContain('title="Stay Policies"');
    expect(review).toContain("Saved Preferences");
    expect(review).toContain('reservationKind === "group"');
  });

  it("identifies a group reservation and separates the booker from room occupants", () => {
    expect(review).toContain("Group Reservation");
    expect(review).toContain("Primary Guest / Booker");
    expect(review).toContain('data-testid="review-reservation-type"');
    expect(review).toContain("Rooms & Occupants");
    expect(review).toContain("Primary Occupant");
    expect(reviewSection).toContain('reservationKind={groupMode ? "group" : "single"}');
    expect(page).toContain('occupantName: guest?.fullName?.trim() || "No guest"');
  });

  it("derives stay totals and one rooming row per room", () => {
    expect(compactRoomOccupancy(2, 1, 0)).toBe("2A · 1C");
    expect(compactRoomOccupancy(1, 0, 0)).toBe("1A");
    expect(page).toContain("compactRoomOccupancy(adults, children, infants)");
    expect(reviewSection).toContain("adults={groupMode ? stayTotals.adults : adults}");
    expect(review).toContain('data-testid="review-rooming-row"');
    expect(review).toContain("Rate / Night");
    expect(review).toContain("Subtotal");
    expect(review).toContain('data-testid="review-room-total"');
  });

  it("sums room subtotals and refuses an incomplete total", () => {
    expect(groupRoomTotal([1500, 2200, 2500])).toEqual({ complete: true, total: 6200 });
    expect(groupRoomTotal([1500, null])).toEqual({ complete: false, total: null });
    expect(review).toContain('data-testid="review-room-total-incomplete"');
    expect(page).toContain("groupRoomTotal(groupReviewRooms.map((row) => row.subtotal))");
    expect(reviewSection).toContain("incomplete: !groupReviewTotal?.complete");
  });

  it("shows Group / Block only when linked and keeps booking-level source and packages", () => {
    expect(review).toContain('data-testid="review-linked-group"');
    expect(review).toContain("{props.linkedGroup ? (");
    expect(reviewSection).toContain("groupMode && linkedGroupRecord");
    expect(review).toContain('title="Booking Source & Classification"');
    expect(review).toContain('data-testid="review-package-scope"');
    expect(reviewSection).toContain(
      'packageScopeNote={groupMode ? "Booking-level package" : null}',
    );
    expect(review).not.toContain("card.price *");
  });

  it("keeps preferences on the primary guest and reuses the group deposit and policies", () => {
    expect(review).toContain("Primary Guest Preference");
    expect(review).toContain("Reservation Special Requests");
    expect(review).toContain('data-testid="review-lead-preferences"');
    expect(reviewSection).toContain("leadGuestPreferences={groupMode}");
    expect(reviewSection).toContain(
      "money(computeDepositRequirementAmount(ratePlanDepositPolicy, groupDeposit.quote))",
    );
    expect(reviewSection).toContain(
      "depositNote={groupMode ? (groupDeposit?.note ?? null) : null}",
    );
    expect(review).toContain('data-testid="review-deposit-note"');
    expect(review).toContain('data-testid="review-policies-applies-all"');
    expect(review).toContain('data-testid="review-policy-rooms"');
    expect(reviewSection).toContain("policyRooms={stepPolicyRooms}");
    expect(review).toContain("{props.policyRooms ? (");
  });

  it("sends every group room to the shared print document and keeps one confirmation number", () => {
    const printed = buildDraftReservationPrintData({
      generatedAt: "14 Oct 2026",
      propertyName: "NORU House",
      guestName: "Abel Abraha",
      phone: null,
      email: null,
      nationality: null,
      idDocumentNumber: null,
      bookedBy: "Same as guest",
      bookingSource: "Direct",
      salesChannel: "Phone",
      marketSegment: "Leisure",
      companyName: null,
      companyTerms: null,
      travelAgentName: null,
      travelAgentTerms: null,
      groupName: null,
      arrivalLabel: "14 Oct 2026",
      departureLabel: "15 Oct 2026",
      nights: 1,
      rooms: 2,
      adults: 3,
      children: 1,
      infants: 0,
      roomImageUrl: null,
      roomName: "Card2 Smoke Twin",
      roomCode: null,
      ratePlan: "BAR",
      inclusions: null,
      ratePerNight: null,
      roomTotal: "ETB 3,700",
      packages: [],
      paymentType: "Cash",
      paymentMethod: "Cash",
      depositRequired: "Yes",
      depositAmount: "ETB 370",
      depositDueDate: null,
      cancellation: "Flexible",
      noShowPolicy: null,
      noShowPenalty: null,
      earlyDeparture: null,
      refundabilityKind: null,
      refundabilityLabel: null,
      preferences: [],
      serviceRequests: [],
      specialRequests: null,
      roomAssignment: null,
      guestRole: "Primary Guest / Booker",
      roomRows: [
        {
          sequence: "1",
          occupant: "Abel Abraha",
          roomType: "Card2 Smoke Twin",
          occupancy: "2A",
          ratePlan: "BAR",
          ratePerNight: "ETB 1,500",
          subtotal: "ETB 1,500",
        },
        {
          sequence: "2",
          occupant: "Loza Tilahun",
          roomType: "Deluxe King",
          occupancy: "1A · 1C",
          ratePlan: "Corporate",
          ratePerNight: "ETB 2,200",
          subtotal: "ETB 2,200",
        },
      ],
    });
    expect(printed.confirmationNumber).toBeNull();
    expect(printed.roomRows).toHaveLength(2);
    expect(printed.roomRows[1]?.occupant).toBe("Loza Tilahun");
    expect(printed.room.roomTotal).toBe("ETB 3,700");
    expect(printUi).toContain('data-testid="print-room-rows"');
    expect(printUi).toContain(
      "body > *:not(.reservation-print-document) { display: none !important; }",
    );
    expect(page).toContain("confirmationNumber: result.confirmationNumber");
    expect(page).not.toContain("confirmationNumbers");
    expect(fo).not.toContain("review-rooming-list");
    expect(fo).not.toContain("groupReviewRooms");
  });
});
