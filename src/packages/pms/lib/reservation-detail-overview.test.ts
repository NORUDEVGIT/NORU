import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { maskGuaranteePan } from "@/packages/pms/lib/create-reservation-review";
import {
  arriveInLabel,
  bookedByLabel,
  DETAIL_DASH,
  DETAIL_SIDEBAR_ITEMS,
  detailGuaranteeCardNumber,
  parseDepositRequirementSnapshot,
  stayStatusLabel,
  storedRatePerNight,
} from "@/packages/pms/lib/reservation-detail-overview";

const overviewUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-overview.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const overlay = readFileSync(
  resolve(
    process.cwd(),
    "src/packages/pms/components/reservations/reservation-workspace-overlay.tsx",
  ),
  "utf8",
);

describe("Reservation Detail Overview-first", () => {
  it("keeps Detail in a wide workspace overlay", () => {
    expect(overlay).toContain("w-[min(98vw,1680px)]");
    expect(overlay).toContain("h-[min(94vh,1080px)]");
    expect(workspace).toContain("onBackToList");
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
  });

  it("renders KPI strip, left sidebar, and nine Overview cards", () => {
    expect(workspace).toContain("depositStatusLabel");
    expect(workspace).toContain("ReservationDetailKpiStrip");
    expect(workspace).toContain("reservation-detail-sidebar");
    expect(overviewUi).toContain("reservation-detail-kpi");
    expect(workspace).toContain('{ id: "overview", label: "Overview" }');
    expect(DETAIL_SIDEBAR_ITEMS.map((item) => item.label)).toEqual([
      "Overview",
      "Stay",
      "Guest",
      "Rooms",
      "Rates",
      "Packages",
      "Folio & Payments",
      "Requests & Preferences",
      "Notes & Traces",
      "Communication",
      "Linked Reservations",
      "History",
    ]);
    expect(overviewUi).toContain("overview-card-guest");
    expect(overviewUi).toContain("overview-card-stay");
    expect(overviewUi).toContain("overview-card-room");
    expect(overviewUi).toContain("overview-card-source");
    expect(overviewUi).toContain("overview-card-rate");
    expect(overviewUi).toContain("overview-card-guarantee");
    expect(overviewUi).toContain("overview-card-policies");
    expect(overviewUi).toContain("overview-card-requests");
    expect(overviewUi).toContain("overview-card-additional");
  });

  it("falls back to dash for missing values and never exposes a raw PAN", () => {
    expect(arriveInLabel("2026-09-24", "2026-09-22")).toBe("2 Days");
    expect(arriveInLabel("2026-09-20", "2026-09-22")).toBe(DETAIL_DASH);
    expect(
      stayStatusLabel({
        status: "confirmed",
        arrivalDate: "2026-09-24",
        departureDate: "2026-09-26",
        businessDate: "2026-09-22",
      }),
    ).toBe("Due In");
    expect(parseDepositRequirementSnapshot(null)).toBeNull();
    expect(storedRatePerNight([], null, 2)).toBeNull();
    expect(bookedByLabel(null, "guest-1")).toBe("Same as guest");
    expect(detailGuaranteeCardNumber("credit_card")).toBe(DETAIL_DASH);
    expect(maskGuaranteePan("4111111111111111")).toBe("•••• •••• •••• 1111");
    expect(overviewUi).toContain("detailGuaranteeCardNumber");
    expect(overviewUi).not.toContain("cvv");
    expect(overviewUi).not.toContain("CVV");
    expect(overviewUi).toContain("reviewDash");
  });

  it("reuses existing actions instead of inventing new backends", () => {
    expect(workspace).toContain("window.print()");
    expect(workspace).toContain("Send is not available in this workspace yet.");
    expect(workspace).toContain("setAmendOpen(true)");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("Copy stay");
    expect(workspace).toContain("Open guest profile");
  });
});
