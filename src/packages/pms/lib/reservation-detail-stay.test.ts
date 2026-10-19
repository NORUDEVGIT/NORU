import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NOTE_MAX } from "@/packages/pms/lib/reservation-detail-notes";
import {
  buildStayDraft,
  clockFromInstant,
  STAY_NOTES_MAX,
  stayNights,
} from "@/packages/pms/lib/reservation-detail-stay";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

const stayUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-stay.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const amend = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  confirmationNumber: "NR-1",
  guestId: "22222222-2222-4222-8222-222222222222",
  guestName: "Maria Santos",
  guestPhone: "+351",
  guestEmail: "maria@email.com",
  guestVip: true,
  roomTypeId: "33333333-3333-4333-8333-333333333333",
  roomTypeName: "Deluxe King",
  roomId: null,
  roomNumber: null,
  arrivalDate: "2026-09-22",
  departureDate: "2026-09-24",
  nights: 2,
  adults: 2,
  children: 0,
  status: "confirmed",
  createdAt: "2026-09-20T10:24:00Z",
  updatedAt: "2026-09-20T10:24:00Z",
  specialRequests: "early check-in",
  notes: "Staff note",
  cancellationReason: null,
  source: "staff",
  ratePlanId: null,
  ratePlanName: "BAR",
  currency: "ETB",
  roomSubtotal: 9000,
  nightlyRates: [],
  pricedAt: null,
  commercialBookingSource: "direct",
  marketSegment: "leisure",
  externalReference: null,
  guaranteeMethod: "credit_card",
  companyMasterId: null,
  companyName: null,
  travelAgentMasterId: null,
  travelAgentName: null,
  groupAccountMasterId: null,
  groupName: null,
  roomOperationalStatus: null,
  housekeepingStatus: null,
  infants: 1,
  roomsRequested: 1,
  purposeOfStay: "holiday",
  salesChannel: null,
  depositRequirementSnapshot: null,
  cancellationPolicySnapshot: null,
  refundabilitySnapshot: null,
  createdByStaffMembershipId: null,
  createdByName: null,
  bookerGuestId: null,
  lateCheckoutGranted: false,
  expectedArrivalAt: "2026-09-22T14:00:00Z",
  lateCheckoutUntil: null,
} as ReservationDetail;

describe("Reservation Detail Stay tab", () => {
  it("follows the shared editable result and saves only safe stay fields", () => {
    expect(workspace).toContain("<ReservationDetailStayTab");
    expect(workspace).toContain("editable={(detailActions?.editable ?? false) && stayMutable}");
    expect(stayUi).toContain("Internal Notes");
    expect(stayUi).toContain("Save Changes");
    expect(stayUi).toContain("amendReservation");
    expect(stayUi).toContain("stayPayload(reservation.arrivalDate, reservation.departureDate)");
    expect(stayUi).toContain("purposeOfStay: draft.purposeOfStay || null");
    expect(stayUi).toContain("infants: draft.infants");
    expect(stayUi).not.toContain("marketSegment:");
    expect(stayUi).not.toContain("Stay Extensions");
    expect(stayUi).not.toContain("Special Occasion");
    expect(stayUi).not.toContain("Flexible Dates");
    expect(stayUi).toContain("disabled={!editable}");
    const amendFn = amend.slice(amend.indexOf("export const amendReservation"));
    expect(amendFn).toContain("purposeOfStay");
    expect(amendFn).toContain("purpose_of_stay");
    expect(amendFn).toContain("infants");
    expect(amendFn).toContain("assertRoomTypeOccupancy");
  });

  it("seeds persisted stay fields and shares the internal-notes limit", () => {
    const draft = buildStayDraft(base);
    expect(draft.adults).toBe(2);
    expect(draft.infants).toBe(1);
    expect(draft.purposeOfStay).toBe("holiday");
    expect(draft.stayNotes).toBe("Staff note");
    expect(clockFromInstant(base.expectedArrivalAt)).toBe("14:00");
    expect(clockFromInstant(null)).toBe("");
    expect(stayNights("2026-09-22", "2026-09-24")).toBe(2);
    expect(STAY_NOTES_MAX).toBe(NOTE_MAX);
  });
});
