import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assignmentLabel,
  marketSegmentLabel,
  nightlyBreakdownRows,
  packageNightsLabel,
  snapshotNightlyTotal,
  stayRatePerNight,
  weekdayLabel,
} from "@/packages/pms/lib/reservation-detail-rates";
import type { RatePlan } from "@/packages/pms/lib/rates.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

const ratesUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-rates.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const reservation = {
  id: "11111111-1111-4111-8111-111111111111",
  confirmationNumber: "NR-000245",
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
  specialRequests: null,
  notes: null,
  cancellationReason: null,
  source: "staff",
  ratePlanId: "44444444-4444-4444-8444-444444444444",
  ratePlanName: "BAR",
  currency: "ETB",
  roomSubtotal: 9000,
  nightlyRates: [
    { date: "2026-09-22", rate: 4500 },
    { date: "2026-09-23", rate: 4500 },
  ],
  pricedAt: "2026-09-20T10:24:00Z",
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
  cancellationPolicySnapshot: { name: "Free cancellation until 20 Sep 2026" },
  refundabilitySnapshot: null,
  createdByStaffMembershipId: null,
  createdByName: null,
  bookerGuestId: null,
  lateCheckoutGranted: false,
  expectedArrivalAt: null,
  lateCheckoutUntil: null,
} as ReservationDetail;

const plan = {
  id: reservation.ratePlanId,
  code: "BAR",
  name: "BAR (Best Available Rate)",
  description: "Best available flexible rate",
  categoryId: "c1",
  categoryName: "BAR",
  roomTypeId: reservation.roomTypeId,
  roomTypeName: "Deluxe King",
  currency: "ETB",
  baseRate: 4500,
  validFrom: null,
  validTo: null,
  mealPlanId: "mp-1",
  mealPlanName: "Breakfast Included",
  breakfastIncluded: true,
  cancellationPolicyId: null,
  cancellationName: "Flexible",
  refundabilityId: null,
  refundabilityName: "As per hotel policy",
  refundabilityKind: null,
  minAdvanceDays: null,
  maxAdvanceDays: null,
  packages: [],
  active: true,
} as RatePlan;

describe("Reservation Detail Rates tab", () => {
  it("wires the Rates workspace into the existing overlay", () => {
    expect(workspace).toContain("<ReservationDetailRatesTab");
    expect(workspace).toContain('detailTab === "rates"');
    expect(workspace).toContain('onBackToRooms={() => setDetailTab("rooms")}');
    expect(workspace).toContain("function PricingSection");
    expect(workspace).toContain('{ id: "overview", label: "Overview" }');
    expect(ratesUi).toContain("Rate Information");
    expect(ratesUi).toContain("Daily Rate Breakdown");
    expect(ratesUi).toContain("Rate Plan Details");
    expect(ratesUi).toContain("Discounts & Adjustments");
    expect(ratesUi).toContain("Packages & Promotions");
    expect(ratesUi).toContain("Rate Notes");
    expect(ratesUi).toContain("Back to Rooms");
    expect(ratesUi).toContain("Save Changes");
    expect(ratesUi).toContain("repriceReservation");
    expect(ratesUi).toContain("getReservationCommercialAttribution");
    expect(ratesUi).not.toContain("stayPanel");
  });

  it("builds nightly rows only from the stored snapshot", () => {
    expect(weekdayLabel("2026-09-22")).toBe("Tue");
    expect(assignmentLabel(reservation)).toBe("Not Assigned");
    expect(marketSegmentLabel("leisure")).toBe("Leisure");
    expect(stayRatePerNight(reservation)).toBe(4500);
    const rows = nightlyBreakdownRows(reservation, plan);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.rate).toBe(4500);
    expect(rows[0]?.discount).toBeNull();
    expect(rows[0]?.inclusion).toBe("Breakfast");
    expect(snapshotNightlyTotal(rows)).toBe(9000);
    expect(nightlyBreakdownRows({ ...reservation, nightlyRates: [] }, plan)).toEqual([]);
    expect(packageNightsLabel("per_night", 1, 2)).toBe("2");
  });

  it("does not invent discounts, packages, or rate-note persistence", () => {
    expect(ratesUi).toContain("rate-discounts-empty");
    expect(ratesUi).toContain("rate-packages-empty");
    expect(ratesUi).toContain("RATE_DISCOUNT_GAP_COPY");
    expect(ratesUi).toContain("RATE_PACKAGE_ADD_GAP_COPY");
    expect(ratesUi).toContain("RATE_NOTES_GAP_COPY");
    expect(ratesUi).not.toContain("amendReservation");
    expect(ratesUi).toContain("reservation.roomSubtotal");
    expect(ratesUi).toContain("nightlyBreakdownRows(reservation, plan)");
  });
});
