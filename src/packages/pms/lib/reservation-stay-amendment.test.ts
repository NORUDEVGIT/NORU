import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildStayAmendmentResult } from "@/packages/pms/lib/reservation-stay-amendment";
import { stayAmendmentCopy } from "@/packages/pms/lib/reservation-detail-stay";

const sql = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0151_amend_hotel_stay_priced.sql"),
  "utf8",
);
const metadata = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0152_hotel_reservation_stay_metadata.sql"),
  "utf8",
);
const stayUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-stay.tsx"),
  "utf8",
);
const summaryUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-summary.tsx"),
  "utf8",
);
const requestsUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-requests.tsx"),
  "utf8",
);

describe("stay amendment result", () => {
  it("returns nights, occupancy, and the room subtotal delta from stored amounts", () => {
    const result = buildStayAmendmentResult({
      previousArrival: "2026-10-14",
      nextArrival: "2026-10-14",
      previousDeparture: "2026-10-16",
      nextDeparture: "2026-10-18",
      previousAdults: 1,
      nextAdults: 2,
      previousChildren: 0,
      nextChildren: 1,
      previousInfants: 0,
      nextInfants: 1,
      currency: "ETB",
      previousRoomSubtotal: 1000,
      nextRoomSubtotal: 1800,
    });
    expect(result).toMatchObject({
      previousNights: 2,
      nextNights: 4,
      previousAdults: 1,
      nextAdults: 2,
      roomSubtotalDelta: 800,
      currency: "ETB",
    });
    expect(stayAmendmentCopy(result!, (value) => `ETB ${value}`)).toContain("ETB 1000 to ETB 1800");
    expect(stayAmendmentCopy(result!, (value) => `ETB ${value}`)).not.toContain("Grand total");
  });

  it("returns null when the stay dates and occupancy are unchanged", () => {
    expect(
      buildStayAmendmentResult({
        previousArrival: "2026-10-14",
        nextArrival: "2026-10-14",
        previousDeparture: "2026-10-16",
        nextDeparture: "2026-10-16",
        previousAdults: 2,
        nextAdults: 2,
        previousChildren: 0,
        nextChildren: 0,
        previousInfants: 0,
        nextInfants: 0,
        currency: "ETB",
        previousRoomSubtotal: 1000,
        nextRoomSubtotal: 1000,
      }),
    ).toBeNull();
  });

  it("prices one room with the reservation occupancy and writes stay history", () => {
    expect(sql).toContain("public.price_hotel_stay(");
    expect(sql).toContain("1,\n      updated.adults");
    expect(sql).toContain("stay_dates_changed");
    expect(sql).toContain("stay_extended");
    expect(sql).toContain("'repriced'");
    expect(sql).toContain("INVALID_TRANSITION");
    expect(sql).toContain("deposit_requirement_snapshot");
    expect(sql).not.toContain("cancellation_policy_snapshot =");
    expect(sql).not.toContain("rooms_requested");
    expect(metadata).toContain("arrival_transport");
    expect(metadata).toContain("pickup_note");
    expect(metadata).toContain("special_occasion");
    expect(metadata).toContain("Not a transport workflow");
  });

  it("keeps date changes, extensions, arrival operations, and one room on the stay screen", () => {
    expect(stayUi).toContain("Amend dates");
    expect(stayUi).toContain("Extend Stay");
    expect(stayUi).toContain("setExpectedArrivalTime");
    expect(stayUi).toContain("setLateCheckout");
    expect(stayUi).toContain("stayPayload(reservation.arrivalDate, reservation.departureDate)");
    expect(summaryUi).toContain("This reservation has one room.");
    expect(stayUi).toContain("does not create a pickup request");
    expect(stayUi).not.toContain("rooms_requested");
    expect(stayUi).not.toContain("Special Occasion");
    expect(stayUi).not.toContain("Flexible Dates");
    expect(requestsUi).toContain("Special Occasion");
    expect(requestsUi).toContain("specialOccasion: occasion.trim() || null");
  });
});
