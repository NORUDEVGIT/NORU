import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  appliedPackagesTotal,
  buildAvailablePackageCards,
  chargeBasisHonestyCopy,
  chargeTypeLabel,
  componentLabelsForPackage,
  emptyPackageFilters,
  filterAvailablePackages,
  packageAppliesToStay,
  packageApplicabilitySummary,
  packageInclusionLabel,
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
    expect(workspace).toContain('onBackToRates={() => setDetailTab("rates")}');
    expect(workspace).not.toContain("PACKAGES_DEFERRED_COPY");
    expect(overview).toContain('{ id: "packages", label: "Packages" }');
    expect(packagesUi).toContain("Applied Packages");
    expect(packagesUi).toContain("Available Packages");
    expect(packagesUi).toContain("Package Notes");
    expect(packagesUi).toContain("Back to Rates");
    expect(packagesUi).toContain("getMealsCard3");
    expect(packagesUi).toContain("getReservationCommercialAttribution");
    expect(packagesUi).toContain("listEligiblePackageActivations");
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
    expect(unevaluated[0]?.components).toEqual(["Meal Plan"]);
  });

  it("does not persist attach/remove or package notes", () => {
    expect(packagesUi).toContain("PACKAGE_BIND_GAP_COPY");
    expect(packagesUi).toContain("PACKAGE_NOTES_GAP_COPY");
    expect(packagesUi).toContain("applied-packages-empty");
    expect(packagesUi).toContain("ReservationPackageMerchandiseGrid");
    expect(packagesUi).toContain("packages-rate-plan-unevaluated");
    expect(packagesUi).not.toContain("amendReservation");
    expect(packagesUi).not.toContain("hotel_reservation_packages");
  });

  it("keeps New Reservation package bind out while showing read-only merchandising", () => {
    expect(createPackagesUi).toContain("create-reservation-package-merch");
    expect(createPackagesUi).toContain("information only");
    expect(createPackagesUi).not.toContain("packageActivationIds");
    expect(createPageUi).toContain("getMealsCard3");
    expect(createPageUi).toContain("buildAvailablePackageCards");
    expect(createPageUi).not.toContain("listCreatePackages");
  });
});
