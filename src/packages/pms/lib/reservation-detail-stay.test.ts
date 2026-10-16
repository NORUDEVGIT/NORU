import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildStayDraft,
  clockFromInstant,
  nextStayExtension,
  requestStatusLabel,
  stayNights,
  stayRangeOk,
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
  infants: 0,
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
  it("wires the Stay tab into the existing overlay workspace", () => {
    expect(workspace).toContain("<ReservationDetailStayTab");
    expect(workspace).toContain('detailTab === "stay"');
    expect(workspace).toContain('onBackToOverview={() => setDetailTab("overview")}');
    expect(stayUi).toContain("Stay Information");
    expect(stayUi).toContain("Stay Extensions");
    expect(stayUi).toContain("Early Arrival / Late Departure");
    expect(stayUi).toContain("Stay Notes");
    expect(stayUi).toContain("Back to Overview");
    expect(stayUi).toContain("Save Changes");
    expect(stayUi).toContain("amendReservation");
  });

  it("seeds live stay fields and falls back cleanly", () => {
    const draft = buildStayDraft(base);
    expect(draft.arrival).toBe("2026-09-22");
    expect(draft.departure).toBe("2026-09-24");
    expect(draft.adults).toBe(2);
    expect(draft.marketSegment).toBe("leisure");
    expect(draft.purposeOfStay).toBe("holiday");
    expect(draft.stayNotes).toBe("Staff note");
    expect(draft.expectedArrivalTime).toBe("14:00");
    expect(draft.allowEarlyCheckIn).toBe(true);
    expect(clockFromInstant(null)).toBe("");
    expect(stayNights("2026-09-22", "2026-09-24")).toBe(2);
    expect(stayRangeOk("2026-09-24", "2026-09-22")).toBe(false);
    expect(requestStatusLabel(false)).toBe("Not Requested");
  });

  it("keeps extensions and occasion/pickup local-only", () => {
    expect(nextStayExtension("2026-09-24").status).toBe("unsaved");
    expect(stayUi).toContain("STAY_OCCASION_OPTIONS");
    expect(stayUi).not.toContain("purposeOfStay: draft.purposeOfStay");
    expect(stayUi).toContain("marketSegment: draft.marketSegment");
    expect(stayUi).toContain("notes: draft.stayNotes");
    expect(stayUi).toContain("stay-extensions-empty");
  });
});
