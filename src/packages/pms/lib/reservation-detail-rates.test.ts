import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assignmentLabel,
  buildRatesReadModel,
  marketSegmentLabel,
  nightlyBreakdownRows,
  packageNightsLabel,
  snapshotNightlyTotal,
  stayRatePerNight,
  weekdayLabel,
} from "@/packages/pms/lib/reservation-detail-rates";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
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
    expect(ratesUi).toContain("Manage on Packages");
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
    expect(ratesUi).toContain("applyReservationPromotion");
    expect(ratesUi).toContain("removeReservationPromotion");
    expect(ratesUi).not.toContain("applyReservationRoomPackage");
    expect(ratesUi).toContain("RATE_PACKAGE_SUMMARY_COPY");
    expect(ratesUi).toContain("RATE_OVERRIDE_OWNERSHIP");
    expect(ratesUi).toContain("RATE_PROMOTION_OUTSIDE_SUBTOTAL");
    expect(ratesUi).toContain("saveRateNotes");
    expect(ratesUi).not.toContain("RATE_DISCOUNT_GAP_COPY");
    expect(ratesUi).not.toContain("amendReservation");
    expect(ratesUi).toContain("reservation.roomSubtotal");
    expect(ratesUi).toContain("nightlyBreakdownRows(read.unit, plan)");
    expect(ratesUi).toContain("buildRatesReadModel");
    expect(ratesUi).toContain('data-testid="rates-cashiering-read"');
    expect(ratesUi).toContain("Posted service charge");
    expect(ratesUi).toContain("Posted adjustments");
    expect(ratesUi).toContain("quoteFolioRoomCharge");
    expect(ratesUi).toContain("reservationRoomId: read.selectedUnitId");
  });

  it("reads the selected unit snapshot without inventing nights, tax, or a net payment", () => {
    const selected = roomUnit({
      id: "55555555-5555-4555-8555-555555555555",
      unitSequence: 2,
      nightlyRates: [{ date: "2026-09-22", rate: 3000 }],
      roomSubtotal: 3000,
    });
    const other = roomUnit({
      id: "66666666-6666-4666-8666-666666666666",
      unitSequence: 1,
      nightlyRates: [],
      roomSubtotal: 1500,
      roomNumber: "101",
      status: "confirmed",
    });
    const stay = {
      ...reservation,
      rateNotes: "Comp breakfast",
      rooms: [other, selected],
    };
    const read = buildRatesReadModel({
      reservation: stay,
      selectedUnitId: selected.id,
      promotion: {
        id: "promo-1",
        promotionName: "Stay 10",
        promotionCode: "STAY10",
        promoKind: "percent",
        discountAmount: 300,
        roomSubtotalAfterPromotion: 2700,
      },
      packages: [
        packageRow("pkg-unit", selected.id, 500),
        packageRow("pkg-stay", null, 200),
        packageRow("pkg-other", other.id, 800),
      ],
      folio: {
        balance: 3600,
        transactions: [
          { type: "payment", amount: -4000 },
          { type: "deposit", amount: -500 },
          { type: "refund", amount: 100 },
          { type: "charge", amount: 3000, category: "room" },
          { type: "charge", amount: 720, category: "tax" },
          { type: "charge", amount: 80, category: "service_charge" },
          { type: "adjustment", amount: -15 },
        ],
      },
    });

    expect(read.selectedUnitId).toBe(selected.id);
    expect(read.unit.roomLabel).toBe("Room 2");
    expect(read.unit.roomSubtotal).toBe(3000);
    expect(read.unit.nightlyRates).toEqual([{ date: "2026-09-22", rate: 3000 }]);
    expect(read.unit.roomSubtotal).not.toBe(stay.roomSubtotal);
    const rows = nightlyBreakdownRows(read.unit, plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.discount).toBeNull();
    expect(rows[0]?.adjustment).toBeNull();
    expect(rows[0]).not.toHaveProperty("tax");
    expect(read.promotionDiscount).toBe(300);
    expect(read.promotion?.scope).toBe("reservation");
    expect(read.promotion?.roomSubtotalAfterPromotion).toBe(2700);
    expect(read.packageTotal).toBe(700);
    expect(read.omittedPackageCount).toBe(1);
    expect(read.rateNotes).toBe("Comp breakfast");
    expect(read.cashiering).toEqual({
      payment: 4000,
      deposit: 500,
      refund: 100,
      balance: 3600,
      postedTax: 720,
      postedServiceCharge: 80,
      postedAdjustment: -15,
    });
    expect(read.cashiering.payment).toBe(4000);
    expect(Object.keys(read.cashiering)).toEqual([
      "payment",
      "deposit",
      "refund",
      "balance",
      "postedTax",
      "postedServiceCharge",
      "postedAdjustment",
    ]);

    const emptyUnit = buildRatesReadModel({
      reservation: stay,
      selectedUnitId: other.id,
    });
    expect(emptyUnit.unit.nightlyRates).toEqual([]);
    expect(nightlyBreakdownRows(emptyUnit.unit, plan)).toEqual([]);
    expect(emptyUnit.packageTotal).toBeNull();
    expect(emptyUnit.promotionDiscount).toBeNull();
    expect(emptyUnit.cashiering).toEqual({
      payment: null,
      deposit: null,
      refund: null,
      balance: null,
      postedTax: null,
      postedServiceCharge: null,
      postedAdjustment: null,
    });

    const fallback = buildRatesReadModel({
      reservation: stay,
      selectedUnitId: "missing-unit",
    });
    expect(fallback.selectedUnitId).toBe(other.id);
  });

  it("writes the room unit, blocks master reprice for multi-room stays, and keeps promotion discount outside room subtotal", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0172_unit_rate_plan_and_promotion_remove.sql"),
      "utf8",
    );
    const drizzle = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0172_unit_rate_plan_and_promotion_remove.sql"),
      "utf8",
    );
    expect(drizzle).toBe(migration);
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reprice_hotel_reservation_room");
    expect(migration).toContain("PERFORM public.sync_reservation_room_total");
    expect(migration).toContain("RAISE EXCEPTION 'MULTI_ROOM_REPRICE_REQUIRES_UNIT'");
    const removeStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.remove_hotel_reservation_promotion",
    );
    const removeFn = migration.slice(removeStart);
    expect(removeFn).toContain("DELETE FROM public.hotel_reservation_promotions");
    expect(removeFn).not.toContain("UPDATE public.hotel_reservations");
    expect(removeFn).not.toContain("UPDATE public.hotel_reservation_rooms");
    expect(migration).toContain("Promotion discount stays outside room_subtotal");
    expect(migration).toContain("Folio adjustments stay in Cashiering");
    expect(migration).not.toContain("ADD COLUMN");
  });
});

function roomUnit(
  overrides: Partial<ReservationRoomUnit> & Pick<ReservationRoomUnit, "id" | "unitSequence">,
): ReservationRoomUnit {
  const nightlyRates = overrides.nightlyRates ?? [];
  const roomSubtotal = overrides.roomSubtotal ?? 3000;
  return {
    id: overrides.id,
    unitSequence: overrides.unitSequence,
    authority: "unit",
    matchesMaster: false,
    driftedFields: ["roomSubtotal", "nightlyRates"],
    status: overrides.status ?? "confirmed",
    occupants: [],
    roomTypeId: overrides.roomTypeId ?? "33333333-3333-4333-8333-333333333333",
    roomTypeName: overrides.roomTypeName ?? "Twin",
    roomId: overrides.roomId ?? "77777777-7777-4777-8777-777777777777",
    roomNumber: overrides.roomNumber ?? "204",
    arrivalDate: reservation.arrivalDate,
    departureDate: reservation.departureDate,
    adults: 1,
    children: 0,
    infants: 0,
    ratePlanId: overrides.ratePlanId ?? "88888888-8888-4888-8888-888888888888",
    ratePlanName: overrides.ratePlanName ?? "Corporate",
    currency: "ETB",
    nightlyRates,
    roomSubtotal,
    pricedAt: null,
    assignmentNotes: null,
    stored: {
      roomTypeId: reservation.roomTypeId,
      roomId: overrides.roomId ?? "77777777-7777-4777-8777-777777777777",
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      adults: 1,
      children: 0,
      infants: 0,
      ratePlanId: overrides.ratePlanId ?? "88888888-8888-4888-8888-888888888888",
      currency: "ETB",
      nightlyRates,
      roomSubtotal,
      pricedAt: null,
    },
  };
}

function packageRow(id: string, reservationRoomId: string | null, appliedAmount: number) {
  return {
    id,
    packageId: id,
    packageName: id,
    packageCode: id,
    chargeBasis: "per_stay",
    quantity: 1,
    appliedAmount,
    reservationRoomId,
    roomUnitLabel: reservationRoomId ? "Room" : null,
  };
}
