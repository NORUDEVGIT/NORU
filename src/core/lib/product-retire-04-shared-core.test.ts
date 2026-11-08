/**
 * PRODUCT-RETIRE-04 — shared/Core services no longer require RMS or Back Office
 * to authorize hotel use. Explicit RMS/BO rows remain sufficient until forced
 * retirement. RBAC/module gates stay intact.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { packageCompatibilityDefault, resolvePackages } from "./package-entitlements.ts";
import {
  inventoryWritePackageAllowed,
  sharedCoreLinkVisible,
  sharedCoreOwningPackage,
  SHARED_CORE_MODULES,
} from "./shared-core-access.ts";
import type { PackageKey } from "./package-entitlements.ts";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../..");

const PMS_ONLY: Record<PackageKey, boolean> = {
  pms: true,
};

function hasFrom(flags: Record<string, boolean>) {
  return (key: PackageKey) => Boolean(flags[key]);
}

const RETIRED_PACKAGE_GUARD =
  /requireRestaurantManagement|requireBackOfficeFinanceRead|requireStandalonePosPackage/;
const RETIRED_PROPERTY_HAS =
  /propertyHasPackage\([^)]*"(restaurant_management|back_office|pos)"/;

describe("PRODUCT-RETIRE-04 inventory write package gate", () => {
  it("allows writes when only PMS is enabled", () => {
    assert.equal(inventoryWritePackageAllowed({ pms: true }), true);
  });

  it("does not authorize inventory when PMS is off", () => {
    assert.equal(inventoryWritePackageAllowed({ pms: false }), false);
  });

  it("keeps module/role checks in front of the package gate", () => {
    const src = readFileSync(join(srcRoot, "lib/inventory.functions.ts"), "utf8");
    assert.match(src, /requireModuleRole/);
    assert.match(src, /"inventory"/);
    assert.match(src, /INVENTORY_ROLES/);
    assert.match(src, /requireInventoryAccess[\s\S]*requireInventoryWritePackage/s);
  });
});

describe("PRODUCT-RETIRE-04 procurement / assets / workforce", () => {
  it("procurement writers stay module-gated and do not require RMS or Back Office", () => {
    for (const file of ["lib/suppliers.functions.ts", "lib/purchasing.functions.ts"]) {
      const src = readFileSync(join(srcRoot, file), "utf8");
      assert.match(src, /requireModuleRole/);
      assert.match(src, /"procurement"/);
      assert.doesNotMatch(src, RETIRED_PACKAGE_GUARD);
      assert.doesNotMatch(src, /publicPackageAvailable/);
    }
  });

  it("assets stay membership/role gated without a retired-package check", () => {
    const src = readFileSync(join(srcRoot, "lib/assets.functions.ts"), "utf8");
    assert.match(src, /callerMembership/);
    assert.match(src, /canViewAssets/);
    assert.doesNotMatch(src, RETIRED_PACKAGE_GUARD);
    assert.doesNotMatch(src, /publicPackageAvailable/);
  });

  it("staff/workforce and PMS administration do not require Back Office", () => {
    const files = [
      "core/lib/staff.functions.ts",
      "core/lib/workforce.functions.ts",
      "packages/pms/lib/pms-staff.functions.ts",
      "packages/pms/lib/pms-permissions.server.ts",
      "routes/restaurant/pms/administration.tsx",
      "routes/restaurant/staff.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(join(srcRoot, file), "utf8");
      assert.doesNotMatch(src, RETIRED_PACKAGE_GUARD, file);
      assert.doesNotMatch(src, /requireRoutePackage\("back_office"\)/, file);
    }
    const admin = readFileSync(join(srcRoot, "routes/restaurant/pms/administration.tsx"), "utf8");
    assert.match(admin, /requireRoutePackage\("pms"\)/);
    const pmsStaff = readFileSync(join(srcRoot, "packages/pms/lib/pms-permissions.server.ts"), "utf8");
    assert.match(pmsStaff, /requirePmsPackage/);
  });
});

describe("PRODUCT-RETIRE-04 shared module link visibility", () => {
  it("shows retained shared links for PMS-only when the module is granted", () => {
    for (const key of SHARED_CORE_MODULES) {
      assert.equal(sharedCoreOwningPackage(key), "pms", key);
      assert.equal(sharedCoreLinkVisible(key, [key], hasFrom(PMS_ONLY)), true, key);
    }
  });

  it("does not render shared links merely because PMS exists", () => {
    assert.equal(sharedCoreLinkVisible("inventory", [], hasFrom(PMS_ONLY)), false);
    assert.equal(
      sharedCoreLinkVisible("procurement", ["human_resources"], hasFrom(PMS_ONLY)),
      false,
    );
  });

  it("does not use Back Office or RMS entitlement for retained shared links", () => {
    const noPms = hasFrom({ pms: false });
    assert.equal(sharedCoreLinkVisible("inventory", ["inventory"], noPms), false);
  });
});

describe("PRODUCT-RETIRE-04 source lock", () => {
  it("inventory package helper includes PMS and never uses POS", () => {
    const src = readFileSync(join(srcRoot, "lib/inventory-package.server.ts"), "utf8");
    assert.match(src, /publicPackageAvailable\(restaurantId, "pms"\)/);
    assert.match(src, /inventoryWritePackageAllowed/);
    assert.doesNotMatch(src, /"pos"/);
  });

  it("SharedModuleLinks owns retained modules through sharedCoreOwningPackage", () => {
    const src = readFileSync(
      join(srcRoot, "packages/pms/components/pms/shared-module-links.tsx"),
      "utf8",
    );
    assert.match(src, /sharedCoreOwningPackage/);
    assert.doesNotMatch(src, /inventory:\s*"back_office"/);
    assert.doesNotMatch(src, /procurement:\s*"back_office"/);
    assert.doesNotMatch(src, /human_resources:\s*"back_office"/);
  });

  it("Property Home shared links follow PMS + module permission", () => {
    const src = readFileSync(join(srcRoot, "routes/restaurant/home.tsx"), "utf8");
    assert.match(src, /sharedCoreLinkVisible/);
    assert.match(src, /SHARED_CORE_LINKS/);
  });

  it("shared inventory shell procurement nav stays on Core routes", () => {
    const src = readFileSync(join(srcRoot, "core/components/restaurant-shell.tsx"), "utf8");
    assert.match(src, /tab:\s*"suppliers"/);
    assert.match(src, /tab:\s*"purchasing"/);
    const procBlock = src.slice(src.indexOf("PROCUREMENT_NAV"), src.indexOf("const STAFF_NAV"));
    assert.match(procBlock, /to:\s*"\/restaurant\/inventory"/);
    assert.doesNotMatch(procBlock, /\/restaurant\/back-office\/procurement/);
  });

  it("does not introduce retired-package guards into retained shared writers", () => {
    const files = [
      "lib/inventory-package.server.ts",
      "lib/inventory.functions.ts",
      "lib/suppliers.functions.ts",
      "lib/purchasing.functions.ts",
      "lib/assets.functions.ts",
      "core/lib/staff.functions.ts",
      "core/lib/workforce.functions.ts",
      "core/lib/shared-core-access.ts",
    ];
    for (const file of files) {
      const src = readFileSync(join(srcRoot, file), "utf8");
      assert.doesNotMatch(src, RETIRED_PACKAGE_GUARD, file);
      assert.doesNotMatch(src, RETIRED_PROPERTY_HAS, file);
    }
  });

  it("pms-modules sharedDependencies remain hotel documentation, not package gates", () => {
    const src = readFileSync(join(srcRoot, "packages/pms/lib/pms-modules.ts"), "utf8");
    assert.match(src, /sharedDependencies:\s*\["inventory", "procurement"\]/);
    assert.match(src, /sharedDependencies:\s*\["human_resources"\]/);
    assert.doesNotMatch(src, /requireRestaurantManagement/);
    assert.doesNotMatch(src, /requireBackOffice/);
  });

  it("Standalone POS is not a shared/Core authorizer", () => {
    const src = readFileSync(join(here, "shared-core-access.ts"), "utf8");
    assert.doesNotMatch(src, /"pos"/);
    assert.equal(inventoryWritePackageAllowed({ pms: false }), false);
  });

  it("does not change PRODUCT-RETIRE-03 missing-row compatibility", () => {
    assert.equal(packageCompatibilityDefault("pms"), true);
    const missing = resolvePackages([]);
    assert.equal(missing.pms.enabled, true);
    assert.deepEqual(Object.keys(missing), ["pms"]);
  });
});
