import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PACKAGE_MODULE_MAP } from "../../../core/lib/package-entitlements.ts";
import {
  PMS_MODULE_NAV,
  PMS_NON_NAV_ROUTES,
} from "./pms-module-nav.ts";

describe("PMS module nav contract", () => {
  it("locks exactly ten modules in product order", () => {
    assert.deepEqual(
      PMS_MODULE_NAV.map((item) => item.label),
      [
        "Front Office",
        "Reservations",
        "Guest Profile",
        "Rooms & Inventory",
        "Housekeeping",
        "Cashiering",
        "Rate & Revenue",
        "Night Audit",
        "Reports",
        "Settings",
      ],
    );
    assert.equal(PMS_MODULE_NAV.length, 10);
    assert.equal(PMS_MODULE_NAV.find((item) => item.id === "settings")?.to, "/restaurant/settings");
    assert.equal(
      PMS_MODULE_NAV.some((item) => item.label === "F&B" || item.to.includes("restaurant-management")),
      false,
    );
    assert.equal(PMS_MODULE_NAV.some((item) => item.label === "Maintenance"), false);
    assert.ok(PMS_NON_NAV_ROUTES.includes("/restaurant/pms/maintenance"));
    assert.ok(PMS_NON_NAV_ROUTES.includes("/restaurant/bookings/new"));
    const home = readFileSync(new URL("../components/pms/pms-home-desk.tsx", import.meta.url), "utf8");
    const route = readFileSync(new URL("../../../routes/restaurant/pms/index.tsx", import.meta.url), "utf8");
    assert.match(home, /getPmsPropertySetupCard1/);
    assert.match(home, /Hotel operating system/);
    assert.doesNotMatch(home, /More/);
    assert.doesNotMatch(home, /SharedModuleLinks/);
    assert.doesNotMatch(route, /SharedModuleLinks/);
    for (const title of [
      "Front Office",
      "Reservations",
      "Guest Profile",
      "Rooms & Inventory",
      "Housekeeping",
      "Cashiering",
      "Rate & Revenue",
      "Night Audit",
      "Reports",
      "Settings",
    ]) {
      assert.match(home, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("does not require a foreign package on the ten desks", () => {
    const foreign = /requireRoutePackage\("(restaurant_management|back_office|pos)"\)/;
    const routes: Array<[string, string]> = [
      ["front-office.tsx", "requireRoutePackage(\"pms\")"],
      ["reservations.index.tsx", "requireRoutePackage(\"pms\")"],
      ["guests.index.tsx", "requireRoutePackage(\"pms\")"],
      ["room-inventory.tsx", "requireRoutePackage(\"pms\")"],
      ["housekeeping.tsx", "requireRoutePackage(\"pms\")"],
      ["cashiering.tsx", "requireRoutePackage(\"pms\")"],
      ["rates-revenue.tsx", "requireRoutePackage(\"pms\")"],
      ["night-audit.tsx", "requireRoutePackage(\"pms\")"],
      ["reports.tsx", "requireRoutePackage(\"pms\")"],
    ];
    for (const [file, gate] of routes) {
      const source = readFileSync(new URL(`../../../routes/restaurant/pms/${file}`, import.meta.url), "utf8");
      assert.match(source, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(source, foreign);
    }
    const settings = readFileSync(new URL("../../../routes/restaurant/settings.tsx", import.meta.url), "utf8");
    assert.match(settings, /packages\.has\("pms"\)/);
    assert.doesNotMatch(settings, foreign);
    for (const key of ["front_office", "housekeeping", "configuration", "reports_analytics", "accounting_finance", "property_settings"] as const) {
      assert.ok(PACKAGE_MODULE_MAP.pms.includes(key), key);
    }
  });
});
