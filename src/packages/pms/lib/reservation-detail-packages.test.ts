import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { reservationError } from "@/packages/pms/lib/reservations.server";
import {
  appliedPackageAmountDisplay,
  appliedPackagesTotal,
  buildAvailablePackageCards,
  buildUnitPackageCards,
  canBindCreatePackage,
  createPackageUnselectableReason,
  finalizeUnitPackageEligibility,
  managementPackagesForUnit,
  packageEligibilityMessage,
  selectedCreatePackageRows,
  chargeBasisHonestyCopy,
  chargeTypeLabel,
  componentLabelsForPackage,
  emptyPackageFilters,
  filterAvailablePackages,
  packageAppliesToStay,
  packageApplicabilitySummary,
  packageInclusionLabel,
  unitPackageCommercialTotals,
} from "@/packages/pms/lib/reservation-detail-packages";
import type { PackageComponentCard3Row } from "@/packages/pms/lib/meals-card3.server";
import type { PackageCard3Row } from "@/packages/pms/lib/meals-card3.server";
import type { EligiblePackageListItem } from "@/packages/pms/lib/revenue/commercial-package";

const packagesUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-packages.tsx"),
  "utf8",
);
const createPackagesUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-packages.tsx"),
  "utf8",
);
const createPageUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-page.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const overview = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservation-detail-overview.ts"),
  "utf8",
);

const catalogue: PackageCard3Row[] = [
  {
    id: "pkg-1",
    code: "BB",
    name: "Bed & Breakfast",
    type: "accommodation",
    typeLabel: "Accommodation",
    description: "Daily breakfast at main restaurant",
    packagePrice: 0,
    chargeBasis: "per_stay",
    active: true,
    roomTypeIds: [],
    ratePlanIds: ["plan-a"],
    ratePlanLinks: [{ ratePlanId: "plan-a", inclusionType: "included" }],
    coverImagePath: null,
    coverUrl: "https://example.com/bb.jpg",
  },
  {
    id: "pkg-2",
    code: "SPA",
    name: "Spa Package",
    type: "custom",
    typeLabel: "Custom",
    description: "60 minutes massage",
    packagePrice: 1800,
    chargeBasis: "per_person",
    active: true,
    roomTypeIds: ["other-type"],
    ratePlanIds: [],
    ratePlanLinks: [],
    coverImagePath: null,
    coverUrl: null,
  },
  {
    id: "pkg-3",
    code: "OFF",
    name: "Inactive",
    type: "custom",
    typeLabel: "Custom",
    description: "Hidden",
    packagePrice: 10,
    chargeBasis: "per_stay",
    active: false,
    roomTypeIds: [],
    ratePlanIds: [],
    ratePlanLinks: [],
    coverImagePath: null,
    coverUrl: null,
  },
];

const eligible = [
  {
    activationId: "act-1",
    packageId: "pkg-1",
    code: "BB",
    name: "Bed & Breakfast",
    type: "accommodation",
    configuredPrice: 0,
    chargeBasis: "per_stay",
    components: [],
    appliedAmount: 0,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    roomTypeIds: [],
    ratePlanIds: [],
  },
] as EligiblePackageListItem[];

describe("Reservation Detail Packages tab", () => {
  it("wires the Packages workspace into the existing overlay", () => {
    expect(workspace).toContain("<ReservationDetailPackagesTab");
    expect(workspace).toContain('detailTab === "packages"');
    expect(workspace).not.toContain('onBackToRates={() => setDetailTab("rates")}');
    expect(workspace).not.toContain("PACKAGES_DEFERRED_COPY");
    expect(overview).toContain('{ id: "packages", label: "Packages" }');
    expect(packagesUi).toContain("Applied Packages");
    expect(packagesUi).toContain("Available Packages");
    expect(packagesUi).not.toContain("Package Notes");
    expect(packagesUi).not.toContain("Back to Rates");
    expect(packagesUi).not.toContain("Save Changes");
    expect(packagesUi).toContain("getMealsCard3");
    expect(packagesUi).toContain("getReservationUnitPackages");
    expect(packagesUi).toContain("packages-selected-unit");
    expect(packagesUi).toContain("package-commercial-facts");
    expect(packagesUi).not.toContain("getReservationCommercialAttribution");
    expect(packagesUi).not.toContain("listEligiblePackageActivations");
  });

  it("filters catalogue by stay applicability and uses stored prices only", () => {
    expect(chargeTypeLabel("per_stay")).toBe("Per stay");
    expect(packageAppliesToStay(catalogue[1]!, "type-a", null)).toBe(false);
    expect(packageAppliesToStay(catalogue[0]!, "type-a", "plan-b")).toBe(false);
    expect(packageAppliesToStay(catalogue[0]!, "type-a", "plan-a")).toBe(true);
    const cards = buildAvailablePackageCards({
      catalogue,
      components: [],
      eligible,
      roomTypeId: "type-a",
      ratePlanId: "plan-a",
    });
    expect(cards.map((row) => row.id)).toEqual(["pkg-1"]);
    expect(cards[0]?.price).toBe(0);
    expect(cards[0]?.eligible).toBe(true);
    expect(cards[0]?.coverUrl).toBe("https://example.com/bb.jpg");
    expect(cards[0]?.inclusionLabel).toBe("Included in rate");
    expect(cards[0]?.chargeBasis).toBe("per_stay");
    expect(cards[0]?.eligibilityStatus).toBe("activation_eligible");
    expect(cards[0]?.activationId).toBe("act-1");
    expect(canBindCreatePackage(cards[0]!)).toBe(false);
    expect(createPackageUnselectableReason(cards[0]!)).toBe("Not currently attachable");
    expect(selectedCreatePackageRows(cards, ["act-1"])).toEqual([]);
    const priced = buildAvailablePackageCards({
      catalogue: [{ ...catalogue[0]!, chargeBasis: "per_stay", packagePrice: 500 }],
      components: [],
      eligible: [
        { ...eligible[0]!, configuredPrice: 500, appliedAmount: 500, chargeBasis: "per_stay" },
      ],
      roomTypeId: "type-a",
      ratePlanId: "plan-a",
    });
    expect(canBindCreatePackage(priced[0]!)).toBe(true);
    expect(createPackageUnselectableReason(priced[0]!)).toBeNull();
    expect(selectedCreatePackageRows(priced, ["act-1"]).map((row) => row.name)).toEqual([
      "Bed & Breakfast",
    ]);
    const nightly = buildAvailablePackageCards({
      catalogue: [{ ...catalogue[0]!, chargeBasis: "per_night", packagePrice: 500 }],
      components: [],
      eligible: [
        { ...eligible[0]!, configuredPrice: 500, appliedAmount: 500, chargeBasis: "per_night" },
      ],
      roomTypeId: "type-a",
      ratePlanId: "plan-a",
    });
    expect(canBindCreatePackage(nightly[0]!)).toBe(false);
    expect(createPackageUnselectableReason(nightly[0]!)).toBe("Not currently attachable");
    expect(appliedPackagesTotal([{ appliedAmount: 12 }, { appliedAmount: 8 }])).toBe(20);
    const filtered = filterAvailablePackages(cards, {
      ...emptyPackageFilters(),
      search: "breakfast",
    });
    expect(filtered).toHaveLength(1);
  });

  it("exposes charge-basis honesty and applicability defaults", () => {
    expect(chargeBasisHonestyCopy("per_stay")).toBeNull();
    expect(chargeBasisHonestyCopy("per_person")).toContain("Configured basis: Per person");
    expect(chargeBasisHonestyCopy("per_person")).toContain("Per stay only");
    expect(packageApplicabilitySummary(catalogue[0]!)).toEqual({
      room: "All room types",
      rate: "1 rate plan(s)",
    });
    expect(packageInclusionLabel(catalogue[0]!, "plan-a")).toBe("Included in rate");
    const components = [
      {
        id: "c1",
        packageId: "pkg-1",
        kind: "meal_plan",
        kindLabel: "Meal Plan",
        mealPlanId: "mp-1",
        roomAmenityId: null,
        foServiceId: null,
        sourceLabel: "Breakfast Buffet",
        quantity: 1,
      },
    ] as PackageComponentCard3Row[];
    expect(componentLabelsForPackage(components, "pkg-1")).toEqual(["Meal Plan"]);
    const unevaluated = buildAvailablePackageCards({
      catalogue,
      components,
      eligible: [],
      roomTypeId: "type-a",
      ratePlanId: null,
    });
    expect(unevaluated[0]?.eligibilityStatus).toBe("unevaluated");
    expect(createPackageUnselectableReason(unevaluated[0]!)).toBe(
      "Not available for this reservation",
    );
    const catalogueOnly = buildAvailablePackageCards({
      catalogue,
      components: [],
      eligible: [],
      roomTypeId: "type-a",
      ratePlanId: "plan-a",
    });
    expect(catalogueOnly[0]?.eligibilityStatus).toBe("catalogue_only");
    expect(createPackageUnselectableReason(catalogueOnly[0]!)).toBe("Catalogue only");
    expect(unevaluated[0]?.components).toEqual(["Meal Plan"]);
  });

  it("applies from the card and removes only the selected room or a labeled stay row", () => {
    expect(packagesUi).toContain("applyReservationRoomPackage");
    expect(packagesUi).toContain("releaseReservationRoomPackage");
    expect(packagesUi).toContain('stayScope: row.scope === "stay"');
    expect(packagesUi).toContain("card.addAllowed !== true");
    expect(packagesUi).toContain("configuredOnly");
    expect(packagesUi).not.toContain("PACKAGE_BIND_GAP_COPY");
    expect(packagesUi).not.toContain("PACKAGE_NOTES_GAP_COPY");
    expect(packagesUi).not.toContain("Pencil");
    expect(packagesUi).not.toContain("packages-rate-plan-unevaluated");
    expect(packagesUi).not.toContain("reservation.ratePlanId");
    expect(packagesUi).not.toContain("reservation.roomTypeId");
    expect(packagesUi).toContain("applied-packages-empty");
    expect(packagesUi).toContain("ReservationPackageMerchandiseGrid");
    expect(packagesUi).not.toContain("amendReservation");
    expect(packagesUi).not.toContain("hotel_reservation_packages");
  });

  it("keeps the selected room and labeled stay packages, and splits snapshot totals", () => {
    const managed = managementPackagesForUnit({
      selectedRoomId: "unit-1",
      currency: "ETB",
      unitLabel: "Room 1 · 101",
      rows: [
        {
          id: "row-unit",
          packageId: "pkg-1",
          packageActivationId: "act-1",
          packageName: "Bed & Breakfast",
          packageCode: "BB",
          chargeBasis: "per_stay",
          quantity: 1,
          unitAmount: 500,
          appliedAmount: 500,
          appliedAt: "2026-10-20T00:00:00Z",
          reservationRoomId: "unit-1",
          components: [],
          snapshot: { appliedByMembershipId: "member-1" },
        },
        {
          id: "row-stay",
          packageId: "pkg-stay",
          packageActivationId: "act-stay",
          packageName: "Stay",
          packageCode: "STAY",
          chargeBasis: "per_stay",
          quantity: 1,
          unitAmount: 200,
          appliedAmount: 200,
          appliedAt: "2026-10-20T00:00:00Z",
          reservationRoomId: null,
          components: [],
          snapshot: {},
        },
        {
          id: "row-sibling",
          packageId: "pkg-2",
          packageActivationId: "act-2",
          packageName: "Sibling",
          packageCode: "SIB",
          chargeBasis: "per_stay",
          quantity: 1,
          unitAmount: 80,
          appliedAmount: 80,
          appliedAt: "2026-10-20T00:00:00Z",
          reservationRoomId: "unit-2",
          components: [],
        },
      ],
    });
    expect(managed.map((row) => row.id)).toEqual(["row-unit", "row-stay"]);
    expect(managed[0]).toMatchObject({
      scope: "unit",
      unitLabel: "Room 1 · 101",
      actorMembershipId: "member-1",
      removeAllowed: true,
      currency: "ETB",
    });
    expect(managed[1]).toMatchObject({ scope: "stay", unitLabel: null, removeAllowed: true });
    expect(unitPackageCommercialTotals(managed)).toEqual({
      unitPackageTotal: 500,
      stayPackageTotal: 200,
    });
    expect(
      appliedPackageAmountDisplay({
        chargeBasis: "per_person",
        unitAmount: 40,
        appliedAmount: 120,
      }),
    ).toEqual({ amount: 40, configuredOnly: true });
    expect(
      appliedPackageAmountDisplay({ chargeBasis: "per_stay", unitAmount: 40, appliedAmount: 40 }),
    ).toEqual({ amount: 40, configuredOnly: false });
  });

  it("disables add from the server decision and surfaces duplicate rules", () => {
    const eligibility = finalizeUnitPackageEligibility({
      decisions: [
        {
          packageId: "pkg-1",
          activationId: "act-1",
          status: "ELIGIBLE",
          reasonCode: "PACKAGE_ELIGIBLE",
          chargeBasis: "per_stay",
          configuredPrice: 500,
          code: "BB",
          name: "Bed & Breakfast",
        },
        {
          packageId: "pkg-2",
          activationId: "act-2",
          status: "INELIGIBLE",
          reasonCode: "PACKAGE_RATE_PLAN_MISMATCH",
          chargeBasis: "per_night",
          configuredPrice: 80,
          code: "NIGHT",
          name: "Nightly",
        },
        {
          packageId: "pkg-3",
          activationId: null,
          status: "INELIGIBLE",
          reasonCode: "PACKAGE_ACTIVATION_NOT_FOUND",
          chargeBasis: "per_stay",
          configuredPrice: 10,
          code: "CAT",
          name: "Catalogue",
        },
      ],
      applied: [{ packageActivationId: "act-1", scope: "unit" }],
    });
    expect(eligibility.find((row) => row.activationId === "act-1")).toMatchObject({
      status: "INELIGIBLE",
      reasonCode: "PACKAGE_ALREADY_ROOM_SCOPED",
      addAllowed: false,
    });
    const cards = buildUnitPackageCards({
      catalogue,
      components: [],
      eligibility,
      ratePlanId: "plan-a",
    });
    expect(cards.map((row) => row.code)).toEqual(["BB", "CAT", "NIGHT"]);
    expect(cards.find((row) => row.code === "NIGHT")?.addAllowed).toBe(false);
    expect(cards.find((row) => row.code === "NIGHT")?.reasonMessage).toBe(
      "That package does not apply to this rate plan.",
    );
    expect(cards.find((row) => row.code === "NIGHT")?.chargeBasisHonesty).toContain("Per night");
    expect(cards.find((row) => row.code === "CAT")?.addAllowed).toBe(false);
    expect(packageEligibilityMessage("PACKAGE_ALREADY_RESERVATION_SCOPED")).toBe(
      reservationError("PACKAGE_ALREADY_RESERVATION_SCOPED").message,
    );
    expect(packageEligibilityMessage("PACKAGE_RATE_PLAN_MISMATCH")).toBe(
      reservationError("PACKAGE_RATE_PLAN_MISMATCH").message,
    );
  });

  it("reevaluates stay packages from unit rate plans and rejects a sibling remove", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0176_reservation_unit_packages.sql"),
      "utf8",
    );
    const supabase = readFileSync(
      resolve(process.cwd(), "supabase/migrations/0176_reservation_unit_packages.sql"),
      "utf8",
    );
    expect(migration).toBe(supabase);
    expect(migration).toContain("COALESCE(stay_unit.rate_plan_id, reservation.rate_plan_id)");
    expect(migration).toContain("AND reservation_room_id IS NULL");
    expect(migration).toContain("PACKAGE_ALREADY_RESERVATION_SCOPED");
    expect(migration).toContain("PACKAGE_ALREADY_ROOM_SCOPED");
    expect(migration).toContain("PACKAGE_SIBLING_UNIT");
    expect(migration).toContain("PACKAGE_STAY_SCOPE_REQUIRED");
    expect(migration).toContain("package_removed");
    expect(migration).toContain("RESERVATION_CLOSED");
    expect(migration).toContain("ARRIVAL_PASSED");
    expect(migration).not.toContain("checked_in");
    expect(migration).not.toMatch(/UPDATE public\.hotel_reservations[\s\S]*room_subtotal/);
    expect(migration).not.toContain("post_folio");
    const prior = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0157_room_unit_folio_packages.sql"),
      "utf8",
    );
    expect(prior).toContain("hotel_reservation_packages_room_scope_unique");
    expect(prior).toContain("hotel_reservation_packages_reservation_scope_unique");
  });

  it("sends bindable activation ids from New Reservation without inventing a second writer", () => {
    expect(createPackagesUi).toContain("create-reservation-package-merch");
    expect(createPackagesUi).toContain("canBindCreatePackage");
    expect(createPackagesUi).not.toContain("packageActivationIds");
    expect(createPageUi).toContain("packageActivationIds");
    expect(createPageUi).toContain("getMealsCard3");
    expect(createPageUi).toContain("buildAvailablePackageCards");
    expect(createPageUi).not.toContain("listCreatePackages");
    expect(createPageUi).not.toContain("hotel_reservation_packages");
  });
});
