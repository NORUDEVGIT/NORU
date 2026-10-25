import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeNoShowPenalty,
  evaluateNoShowReadiness,
  isMatchingNoShowCharge,
  isNoShowPastDue,
  type NoShowReadinessFacts,
} from "./fo-no-show-readiness";

const baseFacts: NoShowReadinessFacts = {
  businessDate: "2026-10-21",
  unitRequired: false,
  target: {
    reservationRoomId: "00000000-0000-4000-8000-000000000001",
    unitSequence: 1,
    status: "confirmed",
    arrivalDate: "2026-10-20",
    roomId: "00000000-0000-4000-8000-000000000002",
    roomNumber: "101",
  },
  unitStatuses: ["confirmed"],
  fee: {
    required: true,
    posted: true,
    waived: false,
    folioStatus: "open",
    penalty: {
      amount: 100,
      basis: "first_night",
      calculable: true,
      currency: "ETB",
    },
  },
  checkInProgress: false,
};

describe("no-show readiness", () => {
  it("uses the strict property business-date rule", () => {
    expect(isNoShowPastDue("confirmed", "2026-10-20", "2026-10-21")).toBe(true);
    expect(isNoShowPastDue("confirmed", "2026-10-21", "2026-10-21")).toBe(false);
    expect(isNoShowPastDue("pending", "2026-10-20", "2026-10-21")).toBe(false);
  });

  it("requires a target for multi-room reservations", () => {
    const result = evaluateNoShowReadiness({
      ...baseFacts,
      unitRequired: true,
      target: null,
      unitStatuses: ["confirmed", "confirmed"],
    });
    expect(result.canComplete).toBe(false);
    expect(result.blockers.map((row) => row.code)).toContain("ROOM_UNIT_REQUIRED");
  });

  it("blocks active check-in progress and an unsatisfied fee", () => {
    const result = evaluateNoShowReadiness({
      ...baseFacts,
      fee: { ...baseFacts.fee, posted: false },
      checkInProgress: true,
    });
    expect(result.canComplete).toBe(false);
    expect(result.blockers.map((row) => row.code)).toEqual(
      expect.arrayContaining(["FEE_REQUIRED", "CHECK_IN_PROGRESS"]),
    );
  });

  it("predicts the rolled master status for a selected unit", () => {
    expect(
      evaluateNoShowReadiness({
        ...baseFacts,
        unitStatuses: ["confirmed", "checked_in"],
      }).predictedReservationStatus,
    ).toBe("checked_in");
  });
});

describe("no-show policy calculation", () => {
  const quote = {
    roomSubtotal: 1000,
    nightlyRates: [
      { date: "2026-10-20", rate: 400 },
      { date: "2026-10-21", rate: 600 },
    ],
    currency: "ETB",
  };

  it.each([
    ["none", 0, 0],
    ["first_night", 0, 400],
    ["percent_stay", 25, 250],
    ["fixed_amount", 175, 175],
    ["full_stay", 0, 1000],
  ])("calculates %s", (penaltyType, penaltyValue, amount) => {
    expect(
      computeNoShowPenalty({
        snapshot: { penalty_type: penaltyType, penalty_value: penaltyValue },
        ...quote,
      }),
    ).toMatchObject({ amount, calculable: true });
  });

  it("does not invent a first-night amount without nightly rates", () => {
    expect(
      computeNoShowPenalty({
        snapshot: { penalty_type: "first_night", penalty_value: 0 },
        roomSubtotal: 1000,
        nightlyRates: [],
        currency: "ETB",
      }),
    ).toMatchObject({ amount: null, calculable: false });
  });

  it("recognizes an amount-matched, unit-attributed no-show charge", () => {
    expect(
      isMatchingNoShowCharge(
        {
          type: "charge",
          description: "No-show charge",
          amount: 400,
          referenceType: "reservation_no_show",
          referenceId: "unit-1",
        },
        { reservationId: "reservation-1", reservationRoomId: "unit-1", expectedAmount: 400 },
      ),
    ).toBe(true);
    expect(
      isMatchingNoShowCharge(
        { type: "charge", description: "No-show charge", amount: 200 },
        { reservationId: "reservation-1", reservationRoomId: null, expectedAmount: 400 },
      ),
    ).toBe(false);
  });
});

describe("atomic no-show completion migration", () => {
  const drizzle = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0179_complete_reservation_no_show.sql"),
    "utf8",
  );
  const supabase = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0179_complete_reservation_no_show.sql"),
    "utf8",
  );

  it("keeps dual-lane SQL identical and owns status, release, and audit in one writer", () => {
    expect(supabase).toBe(drizzle);
    expect(drizzle).toContain("complete_hotel_reservation_no_show");
    expect(drizzle).toContain("arrival_date >= property_business_date");
    expect(drizzle).toContain("SET status = 'no_show'");
    expect(drizzle).toContain("room_id = NULL");
    expect(drizzle).toContain("'no_show_reason', clean_reason");
    expect(drizzle).toContain("RETURNING id INTO audit_id");
  });
});
