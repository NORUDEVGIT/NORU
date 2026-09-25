import { describe, expect, it } from "vitest";

import { reservationAmendImpact } from "./reservation-amend-impact";

const base = {
  guestId: "guest-1",
  guestName: "Ada",
  arrival: "2026-09-24",
  departure: "2026-09-25",
  adults: 1,
  children: 0,
  roomTypeId: "type-1",
  roomTypeName: "Deluxe",
  roomId: "room-1",
  roomNumber: "101",
  specialRequests: "",
  notes: "",
  commercialBookingSource: "phone",
  marketSegment: "leisure",
  externalReference: "",
  guaranteeMethod: "card",
  available: 3,
  currentTotal: 100,
  proposedTotal: 100,
};

describe("reservationAmendImpact", () => {
  it("lists Current → Proposed differences and flags assignment/rate impact", () => {
    const impact = reservationAmendImpact(base, {
      ...base,
      arrival: "2026-09-26",
      departure: "2026-09-28",
      roomId: null,
      roomNumber: null,
      proposedTotal: 180,
      available: 0,
    });
    expect(impact.changes.map((row) => row.field)).toEqual([
      "Arrival",
      "Departure",
      "Assigned room",
      "Stay total",
    ]);
    expect(impact.assignmentCleared).toBe(true);
    expect(impact.availabilityNone).toBe(true);
    expect(impact.rateMayChange).toBe(true);
  });
});
