import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { maskGuaranteePan } from "@/packages/pms/lib/create-reservation-review";
import { getReservationActions } from "@/packages/pms/lib/reservation-actions";
import { reservationDetailActionInput } from "@/packages/pms/lib/reservation-detail-actions";
import {
  arriveInLabel,
  bookedByLabel,
  DETAIL_DASH,
  DETAIL_SIDEBAR_ITEMS,
  detailGuaranteeCardNumber,
  OVERVIEW_LABEL_UNAVAILABLE,
  overviewBookingSourceLabel,
  overviewCatalogueLabel,
  overviewChannelLabel,
  overviewNoShowLabel,
  overviewPartyName,
  overviewPaymentLabel,
  overviewRefundabilityLabel,
  parseDepositRequirementSnapshot,
  stayStatusLabel,
  storedRatePerNight,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { ReservationStatus } from "@/packages/pms/lib/reservation-dates";

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
    expect(workspace).toContain("No deposit received");
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
    expect(overviewUi).toContain("overviewPaymentLabel");
    expect(overviewUi).not.toContain("Guarantee & Deposit");
    expect(overviewUi).toContain("Payment & Deposit");
    expect(overviewUi).toContain("Stay Policies");
    expect(overviewUi).not.toContain("cvv");
    expect(overviewUi).not.toContain("CVV");
    expect(overviewUi).toContain("reviewDash");
  });

  it("reuses existing actions instead of inventing new backends", () => {
    expect(workspace).toContain("window.print()");
    expect(workspace).not.toContain("Send is not available in this workspace yet.");
    expect(workspace).toContain("getReservationActions(");
    expect(workspace).toContain("setAmendOpen(true)");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("copyMutation.mutate()");
    expect(workspace).toContain("Open guest profile");
  });
});

const BUSINESS_DATE = "2026-10-11";
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "22222222-2222-4222-8222-222222222222";
const SEGMENT_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_ID = "44444444-4444-4444-8444-444444444444";

const catalogues = {
  sources: [{ id: SOURCE_ID, code: "phone", name: "Phone" }],
  channels: [{ id: CHANNEL_ID, code: "direct", name: "Direct" }],
  segments: [{ id: SEGMENT_ID, code: "leisure", name: "Leisure" }],
};

function overviewEditable(status: ReservationStatus, arrivalDate: string, departureDate: string) {
  return getReservationActions(
    reservationDetailActionInput({
      status,
      businessDate: BUSINESS_DATE,
      arrivalDate,
      departureDate,
      roomId: null,
      role: "receptionist",
    }),
  ).editable;
}

describe("Reservation Detail Overview editability and labels", () => {
  it("shows Edit only when the shared action result is editable", () => {
    expect(overviewEditable("pending", "2026-10-14", "2026-10-16")).toBe(true);
    expect(overviewEditable("confirmed", "2026-10-14", "2026-10-16")).toBe(true);
    expect(overviewEditable("pending", "2026-10-01", "2026-10-04")).toBe(false);
    expect(overviewEditable("confirmed", "2026-10-01", "2026-10-04")).toBe(false);
    expect(overviewEditable("checked_in", "2026-10-08", "2026-10-12")).toBe(false);
    expect(overviewEditable("checked_out", "2026-10-01", "2026-10-04")).toBe(false);
    expect(overviewEditable("cancelled", "2026-10-14", "2026-10-16")).toBe(false);
    expect(overviewEditable("no_show", "2026-10-10", "2026-10-12")).toBe(false);
    expect(workspace).toContain("editable={(detailActions?.editable ?? false) && stayMutable}");
    expect(workspace).toContain("getReservationActions(");
    for (const tab of ["guest", "stay", "rooms", "rates", "requests", "notes"]) {
      expect(overviewUi).toContain(`editTab("${tab}")`);
    }
    expect(overviewUi).toContain("editable ? () => onEditTab(tab)");
    expect(overviewUi).not.toContain("getReservationActions");
    expect(overviewUi).not.toMatch(/status ===/);
    expect(overviewUi).not.toContain("businessDate");
  });

  it("resolves source, channel, and segment labels and never prints a raw id", () => {
    expect(overviewBookingSourceLabel("staff", SOURCE_ID, catalogues.sources)).toBe("Phone");
    expect(overviewChannelLabel("staff", CHANNEL_ID, catalogues.channels)).toBe("Direct");
    expect(overviewCatalogueLabel(SEGMENT_ID, catalogues.segments)).toBe("Leisure");
    expect(overviewBookingSourceLabel("staff", MISSING_ID, catalogues.sources)).toBe(
      OVERVIEW_LABEL_UNAVAILABLE,
    );
    expect(overviewChannelLabel("staff", MISSING_ID, catalogues.channels)).toBe(
      OVERVIEW_LABEL_UNAVAILABLE,
    );
    expect(overviewCatalogueLabel(MISSING_ID, catalogues.segments)).toBe(
      OVERVIEW_LABEL_UNAVAILABLE,
    );
    expect(overviewBookingSourceLabel("staff", MISSING_ID, catalogues.sources)).not.toBe(
      MISSING_ID,
    );
    expect(overviewPartyName("Northwind", MISSING_ID)).toBe("Northwind");
    expect(overviewPartyName("Atlas Travel", MISSING_ID)).toBe("Atlas Travel");
    expect(overviewPartyName("Summit Group", MISSING_ID)).toBe("Summit Group");
    expect(overviewPartyName(null, MISSING_ID)).toBe(OVERVIEW_LABEL_UNAVAILABLE);
    expect(overviewPartyName(MISSING_ID, MISSING_ID)).toBe(OVERVIEW_LABEL_UNAVAILABLE);
    expect(overviewPaymentLabel(MISSING_ID)).toBe(OVERVIEW_LABEL_UNAVAILABLE);
  });

  it("keeps stay policy text on the stored snapshots", () => {
    expect(overviewNoShowLabel({ name: "Standard no-show", penalty_type: "first_night" })).toBe(
      "Standard no-show · First night",
    );
    expect(overviewRefundabilityLabel({ name: "Flexible", kind: "refundable" })).toBe(
      "Refundable · Flexible",
    );
    expect(overviewUi).toContain("reservation.cancellationPolicySnapshot");
    expect(overviewUi).toContain("reservation.noShowPolicySnapshot");
    expect(overviewUi).toContain("reservation.earlyDeparturePolicySnapshot");
    expect(overviewUi).toContain("reservation.refundabilitySnapshot");
    expect(overviewUi).toContain("Payment & Deposit");
    expect(overviewUi).toContain("Stay Policies");
    expect(overviewUi).not.toContain("Guarantee & Deposit");
    expect(overviewUi).not.toContain('title="Policies"');
  });
});
