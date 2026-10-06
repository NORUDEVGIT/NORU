import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  appliedPackagesTotal,
  buildAvailablePackageCards,
  chargeTypeLabel,
  emptyPackageFilters,
  filterAvailablePackages,
  packageAppliesToStay,
} from "@/packages/pms/lib/reservation-detail-packages";
import type { PackageCard3Row } from "@/packages/pms/lib/meals-card3.server";
import type { EligiblePackageListItem } from "@/packages/pms/lib/revenue/commercial-package";

const packagesUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-packages.tsx"),
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
    active: true,
    roomTypeIds: [],
    ratePlanIds: [],
    ratePlanLinks: [],
    coverImagePath: null,
    coverUrl: null,
  },
  {
    id: "pkg-2",
    code: "SPA",
    name: "Spa Package",
    type: "custom",
    typeLabel: "Custom",
    description: "60 minutes massage",
    packagePrice: 1800,
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
    expect(chargeTypeLabel("per_stay")).toBe("Per Stay");
    expect(packageAppliesToStay(catalogue[1]!, "type-a", null)).toBe(false);
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
    expect(appliedPackagesTotal([{ appliedAmount: 12 }, { appliedAmount: 8 }])).toBe(20);
    const filtered = filterAvailablePackages(cards, {
      ...emptyPackageFilters(),
      search: "breakfast",
    });
    expect(filtered).toHaveLength(1);
  });

  it("does not persist attach/remove or package notes", () => {
    expect(packagesUi).toContain("PACKAGE_BIND_GAP_COPY");
    expect(packagesUi).toContain("PACKAGE_NOTES_GAP_COPY");
    expect(packagesUi).toContain("applied-packages-empty");
    expect(packagesUi).not.toContain("amendReservation");
    expect(packagesUi).not.toContain("hotel_reservation_packages");
  });
});
