import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  depositRulesAreShared,
  groupDepositPresentation,
  packageBookingNote,
  roomingSummary,
  roomPolicyFromLabels,
  sharedPolicyNote,
  stayPoliciesAreShared,
} from "./create-reservation-group-step23";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const bar = roomPolicyFromLabels({
  cancellationName: "Flexible",
  cancellationLabel: "Free until 14 Oct 2026",
  noShowName: "Full stay",
  noShowPenalty: "Full stay",
  earlyDepartureName: "No charge",
  earlyDeparturePenalty: "No charge",
  refundabilityKind: "non_refundable",
  refundabilityLabel: "Non-refundable rate",
  depositName: "Standard",
  depositType: "percent",
  depositValue: 25,
  depositRequired: true,
});

const corporate = roomPolicyFromLabels({
  cancellationName: "Strict",
  cancellationLabel: "24 hours",
  noShowName: "First night",
  noShowPenalty: "First night",
  earlyDepartureName: "First night",
  earlyDeparturePenalty: "First night",
  refundabilityKind: "refundable",
  depositName: "First night",
  depositType: "first_night",
  depositValue: 0,
  depositRequired: true,
});

describe("GROUP-RES-04 Step 2 and Step 3", () => {
  const page = read("../components/bookings/create-reservation-page.tsx");
  const details = read("../components/bookings/create-reservation-booking-details.tsx");
  const policies = read("../components/bookings/create-reservation-policies-guarantee.tsx");
  const packages = read("../components/bookings/create-reservation-packages.tsx");
  const summary = read("../components/bookings/create-reservation-rooming-summary.tsx");
  const guarantee = read("../components/bookings/create-reservation-guarantee.tsx");
  const review = page.slice(
    page.indexOf("const reviewSection"),
    page.indexOf("function roomRateLabel"),
  );
  const booking = page.slice(
    page.indexOf("const bookingDetailsSection"),
    page.indexOf("const stepSections"),
  );
  const step3 = page.slice(
    page.indexOf("const policiesSection"),
    page.indexOf("const reviewSection"),
  );

  it("keeps single Step 2 on the existing cards", () => {
    expect(details).toContain("Source & Channel");
    expect(details).toContain("Company / Agent / Group");
    expect(details).toContain('["group", "Group / Block"]');
    expect(details).toContain("Packages & Add-ons");
    expect(details).toContain("Guest Requests & Preferences");
    expect(booking).toContain("groupSummary ?");
    expect(booking).not.toContain("CreateReservationRoomingList");
    expect(summary).toContain("Rooming Summary");
  });

  it("derives the rooming summary from room units", () => {
    const result = roomingSummary([
      {
        occupantName: "Abel Abraha",
        roomTypeName: "Card2 Smoke Twin",
        ratePlanName: "BAR",
        adults: 2,
        children: 0,
        infants: 0,
      },
      {
        occupantName: "Loza Tilahun",
        roomTypeName: "Deluxe King",
        ratePlanName: "Corporate",
        adults: 2,
        children: 1,
        infants: 0,
      },
      {
        occupantName: "Yonas Tesfaye",
        roomTypeName: "Single Room",
        ratePlanName: "Deluxe-king J",
        adults: 1,
        children: 0,
        infants: 0,
      },
    ]);
    expect(result.headline).toBe("3 rooms · 5 adults · 1 child");
    expect(result.lines[0]).toEqual({
      title: "Room 1 · Abel Abraha",
      detail: "Card2 Smoke Twin · BAR",
    });
    expect(result.lines[1]?.title).toBe("Room 2 · Loza Tilahun");
    expect(result.lines[2]?.detail).toBe("Single Room · Deluxe-king J");
    expect(JSON.stringify(result)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("returns to Step 1 without clearing Step 2 state", () => {
    expect(booking).toContain("onEditStep1={() => setWorkflowStep(0)}");
    expect(summary).toContain('data-testid="edit-rooming-in-step-1"');
    expect(summary).toContain("Edit in Step 1");
    const edit = booking.slice(
      booking.indexOf("onEditStep1"),
      booking.indexOf("/>", booking.indexOf("onEditStep1")),
    );
    expect(edit).not.toContain("setBookingSource");
    expect(edit).not.toContain("setPackageActivationIds");
    expect(edit).not.toContain("setGuaranteeMethod");
  });

  it("keeps Group / Block optional and on the existing link path", () => {
    expect(details).toContain('data-testid="group-block-optional-note"');
    expect(details).toContain("can stay ad hoc");
    expect(details).toContain('data-testid="linked-group-block-caption"');
    expect(details).toContain("onLinkedGroupChange");
    expect(details).not.toContain("createGroup");
    expect(page).toContain("pmsGroupId: linkedGroupId");
    expect(page).toContain("pmsGroupBlockId: linkedBlockId");
    expect(page).not.toContain('reservationMode === "group" && !linkedGroupId');
  });

  it("keeps packages reservation-level and scopes the catalog honestly", () => {
    expect(packageBookingNote({ group: false, rooms: [] })).toBeNull();
    expect(
      packageBookingNote({
        group: true,
        rooms: [
          { roomTypeId: "twin", ratePlanId: "bar" },
          { roomTypeId: "twin", ratePlanId: "bar" },
        ],
      }),
    ).toBe("Added once for this booking.");
    expect(
      packageBookingNote({
        group: true,
        rooms: [
          { roomTypeId: "twin", ratePlanId: "bar" },
          { roomTypeId: "king", ratePlanId: "corp" },
        ],
      }),
    ).toContain("does not check the other rooms");
    expect(packages).toContain('data-testid="package-booking-scope"');
    expect(page).toContain("packageActivationIds");
    expect(packages).not.toContain("reservationRoomId");
  });

  it("labels saved preferences as the primary guest in group mode", () => {
    expect(details).toContain('data-testid="lead-guest-preferences"');
    expect(details).toContain("Primary Guest / Booker");
    expect(details).toContain("Room guest preferences are managed per guest profile.");
    expect(details).toContain("Special Requests");
    expect(details).toContain('data-testid="booking-details-internal-notes"');
    expect(page).toContain("leadGuestPreferences={groupMode}");
  });

  it("keeps payment and deposit booking-level", () => {
    expect(guarantee).toContain("Payment Information");
    expect(guarantee).toContain("Payment Type");
    expect(step3.match(/CreateReservationGuarantee/g)?.length).toBe(1);
    expect(policies).toContain(">Deposit<");
    expect(policies).toContain("Based on the selected rate plan.");
    expect(policies).not.toContain("Deposit Room");
  });

  it("uses one shared policy view when the effective policies match", () => {
    const twin = roomPolicyFromLabels({
      cancellationName: "Flexible",
      cancellationLabel: "  Free until 14 Oct 2026 ",
      noShowName: "Full stay",
      noShowPenalty: "Full stay",
      earlyDepartureName: "No charge",
      earlyDeparturePenalty: "No charge",
      refundabilityKind: "non_refundable",
      depositName: "Standard",
      depositType: "percent",
      depositValue: 25,
      depositRequired: true,
    });
    expect(stayPoliciesAreShared([bar, twin])).toBe(true);
    expect(sharedPolicyNote(3)).toBe("Applies to all 3 rooms");
    expect(policies).toContain('data-testid="stay-policies-applies-all"');
    expect(policies).toContain('title="Cancellation"');
    expect(page).toContain("sharedPolicyNote(1 + extraRoomUnits.length)");
  });

  it("renders room policies when the sets differ and does not treat Room 1 as global", () => {
    expect(stayPoliciesAreShared([bar, corporate])).toBe(false);
    expect(policies).toContain("Policies vary by room");
    expect(policies).toContain('data-testid="stay-policies-varied"');
    expect(page).toContain("groupMode && !groupPoliciesShared");
    expect(step3).toContain("roomPolicyRows=");
    expect(review).not.toContain("roomPolicyRows");
    expect(review).not.toContain("CreateReservationRoomingSummary");
  });

  it("prices the deposit from the combined room total", () => {
    const shared = groupDepositPresentation({
      policies: [bar, bar],
      currency: "ETB",
      rooms: [
        { subtotal: 1500, nightlyRates: [1500] },
        { subtotal: 2200, nightlyRates: [2200] },
      ],
    });
    expect(shared.amountKnown).toBe(true);
    expect(shared.quote?.subtotal).toBe(3700);
    expect(shared.quote?.nightly[0]?.rate).toBe(3700);
    expect(shared.note).toBe("Based on the combined room total.");
    expect(depositRulesAreShared([bar, corporate])).toBe(false);
    const mixed = groupDepositPresentation({
      policies: [bar, corporate],
      currency: "ETB",
      rooms: [
        { subtotal: 1500, nightlyRates: [1500] },
        { subtotal: 2200, nightlyRates: [2200] },
      ],
    });
    expect(mixed.quote?.subtotal).toBe(3700);
    expect(mixed.note).toContain("Room 1's rate plan");
    const incomplete = groupDepositPresentation({
      policies: [bar, null],
      currency: "ETB",
      rooms: [
        { subtotal: 1500, nightlyRates: [1500] },
        { subtotal: null, nightlyRates: [] },
      ],
    });
    expect(incomplete.quote).toBeNull();
    expect(incomplete.amountKnown).toBe(false);
    expect(incomplete.note).not.toContain("1500");
  });
});
