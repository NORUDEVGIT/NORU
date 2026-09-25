import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { foundationRevenueViews, implementedRevenueViews } from "../rate-revenue-workspace.ts";
import {
  buildPackageActivationRow,
  buildPackageMasterRow,
  countPackageOperationalStatuses,
  filterPackageRows,
  packageActivationMatchesScopeFilter,
  packageComponentLabel,
  packageStatusLabel,
  packageTypeLabel,
  summarizePackagePerformance,
  type PackageWorkspaceMaster,
} from "./commercial-packages-ui.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const ROOM = "33333333-3333-4333-8333-333333333333";
const PLAN = "66666666-6666-4666-8666-666666666666";

function master(overrides: Partial<PackageWorkspaceMaster> = {}): PackageWorkspaceMaster {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    code: "BB",
    name: "Bed and Breakfast",
    type: "accommodation",
    packagePrice: 50,
    active: true,
    roomTypeIds: [ROOM],
    ratePlanIds: [PLAN],
    componentCount: 2,
    ...overrides,
  };
}

describe("RR-P5-UI-02 packages workspace", () => {
  it("marks packages implemented and keeps commercial-history foundation", () => {
    assert.ok(implementedRevenueViews().includes("packages"));
    assert.ok(implementedRevenueViews().includes("commercial"));
    assert.ok(implementedRevenueViews().includes("promotions"));
    assert.ok(!foundationRevenueViews().includes("packages"));
    assert.ok(foundationRevenueViews().includes("commercial-history"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /case "packages"/);
    assert.match(workspace, /<PackagesView/);
    assert.doesNotMatch(workspace, /case "commercial-history"/);
  });

  it("computes operational KPIs and honest package performance", () => {
    const active = buildPackageActivationRow(
      {
        activationId: "11111111-1111-4111-8111-111111111111",
        packageId: master().id,
        code: "BB",
        name: "Bed and Breakfast",
        type: "accommodation",
        configuredPrice: 50,
        masterPrice: 60,
        masterActive: true,
        active: true,
        validFrom: "2026-09-01",
        validTo: "2026-09-28",
        roomTypeIds: [ROOM],
        ratePlanIds: [],
        masterRoomTypeIds: [ROOM],
        masterRatePlanIds: [PLAN],
        components: [{ componentType: "meal_plan", componentId: "m1", label: "Breakfast", quantity: 2 }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        businessDate: "2026-09-25",
        performance: summarizePackagePerformance([
          { reservationId: "r1", appliedAmount: 50 },
          { reservationId: "r1", appliedAmount: 25 },
          { reservationId: "r2", appliedAmount: 50 },
        ]),
        roomNames: new Map([[ROOM, "Deluxe"]]),
        planNames: new Map([[PLAN, "BAR"]]),
      },
    );
    const upcoming = buildPackageActivationRow(
      {
        activationId: "22222222-2222-4222-8222-222222222222",
        packageId: master().id,
        code: "BB",
        name: "Bed and Breakfast",
        type: "accommodation",
        configuredPrice: 50,
        masterPrice: 50,
        masterActive: true,
        active: true,
        validFrom: "2026-10-01",
        validTo: "2026-10-20",
        roomTypeIds: [],
        ratePlanIds: [],
        masterRoomTypeIds: [ROOM],
        masterRatePlanIds: [PLAN],
        components: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        businessDate: "2026-09-25",
        performance: summarizePackagePerformance([]),
        roomNames: new Map([[ROOM, "Deluxe"]]),
        planNames: new Map([[PLAN, "BAR"]]),
      },
    );
    const counts = countPackageOperationalStatuses([active, upcoming]);
    assert.equal(counts.activePackages, 1);
    assert.equal(counts.upcomingPackages, 1);
    assert.equal(counts.expiringSoon, 1);
    assert.equal(active.bookings, 2);
    assert.equal(active.revenue, 125);
    assert.equal(active.attributionCount, 3);
    assert.equal(active.averageAppliedAmount, 41.67);
    assert.equal(active.configuredPrice, 50);
    assert.equal(active.masterPrice, 60);
    assert.equal(active.componentCount, 1);
    assert.equal(packageComponentLabel(active.components[0]!), "Breakfast × 2");
    assert.equal(packageTypeLabel("accommodation"), "Accommodation");
    assert.equal(packageTypeLabel("invented"), "invented");
    assert.equal(packageStatusLabel("not_activated"), "Not Activated");
  });

  it("supports master-only rows, multiple activations, and local filters", () => {
    const first = buildPackageActivationRow(
      {
        activationId: "11111111-1111-4111-8111-111111111111",
        packageId: master().id,
        code: "BB",
        name: "Bed and Breakfast",
        type: "accommodation",
        configuredPrice: 50,
        masterPrice: 50,
        masterActive: true,
        active: true,
        validFrom: "2026-09-01",
        validTo: "2026-09-30",
        roomTypeIds: [ROOM],
        ratePlanIds: [PLAN],
        masterRoomTypeIds: [ROOM],
        masterRatePlanIds: [PLAN],
        components: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        businessDate: "2026-09-25",
        performance: summarizePackagePerformance([]),
        roomNames: new Map([[ROOM, "Deluxe"]]),
        planNames: new Map([[PLAN, "BAR"]]),
      },
    );
    const second = buildPackageActivationRow(
      {
        activationId: "22222222-2222-4222-8222-222222222222",
        packageId: master().id,
        code: "BB",
        name: "Bed and Breakfast",
        type: "accommodation",
        configuredPrice: 50,
        masterPrice: 50,
        masterActive: true,
        active: true,
        validFrom: "2026-10-01",
        validTo: "2026-10-15",
        roomTypeIds: [ROOM],
        ratePlanIds: [PLAN],
        masterRoomTypeIds: [ROOM],
        masterRatePlanIds: [PLAN],
        components: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
      {
        businessDate: "2026-09-25",
        performance: summarizePackagePerformance([]),
        roomNames: new Map([[ROOM, "Deluxe"]]),
        planNames: new Map([[PLAN, "BAR"]]),
      },
    );
    const unused = buildPackageMasterRow(master({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code: "SPA", name: "Spa", type: "custom" }), {
      roomNames: new Map([[ROOM, "Deluxe"]]),
      planNames: new Map([[PLAN, "BAR"]]),
    });
    assert.equal(first.rowKey.startsWith("activation:"), true);
    assert.equal(second.rowKey.startsWith("activation:"), true);
    assert.notEqual(first.rowKey, second.rowKey);
    assert.equal(unused.displayStatus, "not_activated");
    assert.equal(unused.kind, "master");
    assert.equal(filterPackageRows([first, second, unused], { search: "spa" }).length, 1);
    assert.equal(filterPackageRows([first, second, unused], { status: "upcoming" }).length, 1);
    assert.equal(filterPackageRows([first, second, unused], { packageType: "custom" }).length, 1);
    assert.equal(packageActivationMatchesScopeFilter(first, "99999999-9999-4999-8999-999999999999", null), false);
    assert.equal(packageActivationMatchesScopeFilter(unused, ROOM, PLAN), true);
  });

  it("packages UI stays honest and previews before apply", () => {
    const view = readRel("../../components/rates/packages/packages-view.tsx");
    const drawer = readRel("../../components/rates/packages/package-detail-drawer.tsx");
    const actions = readRel("../../components/rates/commercial/package-activation-action-sheet.tsx");
    const functions = readRel("./commercial-packages.functions.ts");
    const server = readRel("./commercial-packages.server.ts");
    const ui = readRel("./commercial-packages-ui.ts");
    const overview = readRel("../../components/rates/commercial-overview/commercial-overview-view.tsx");

    assert.match(view, /Activate Package/);
    assert.match(view, /Search name or code/);
    assert.match(view, /PACKAGE_EMPTY_ACTIVATIONS|PACKAGE_EMPTY_MASTERS/);
    assert.doesNotMatch(view, /Create Package/);
    assert.doesNotMatch(view, /Pending Approval|Published|Draft|Rejected/);
    assert.doesNotMatch(view, /Expected Revenue|Occupancy Impact|RevPAR|Package ROI|Inclusion Usage/);
    assert.doesNotMatch(view, /Posted|Collected|Outstanding|Folio Revenue/);
    assert.doesNotMatch(view, /per-night|per-person|OTA|Publish to Channels/);
    assert.match(ui, /Based on attributed package selections since Commercial Engine launch/);
    assert.match(ui, /Attributed package value; not cashiering collection/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Scope & Components/);
    assert.match(drawer, /Performance/);
    assert.match(drawer, /Activity/);
    assert.match(drawer, /PACKAGE_CHARGE_BASIS_LABEL|Per Stay/);
    assert.doesNotMatch(drawer, /Edit Package Master/);
    assert.doesNotMatch(drawer, /Used|Consumed|Delivered/);
    assert.match(actions, /previewPackageActivation/);
    assert.match(actions, /applyPackageActivation/);
    assert.match(actions, /PACKAGE_STALE_COPY/);
    assert.match(actions, /Review/);
    assert.match(actions, /Confirm/);
    assert.match(actions, /Snapshot stays unchanged on edit/);
    assert.match(functions, /requireRateManager/);
    assert.doesNotMatch(server, /from\("pms_packages"\)\s*\.update/);
    assert.doesNotMatch(server, /from\("pms_packages"\)\s*\.insert/);
    assert.doesNotMatch(server, /from\("pms_package_components"\)\s*\.update/);
    assert.match(server, /hotel_reservation_packages/);
    assert.match(overview, /Package Performance/);
    assert.match(overview, /Package Bookings/);
    assert.match(overview, /Package Revenue/);
  });
});
