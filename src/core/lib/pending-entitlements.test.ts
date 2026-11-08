import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRestaurantOperational } from "./restaurant-access.server.ts";
import { packageFlags, resolvePackages } from "./package-entitlements.ts";

describe("isRestaurantOperational", () => {
  it("allows only approved and active", () => {
    assert.equal(isRestaurantOperational(true, true), true);
    assert.equal(isRestaurantOperational(false, true), false);
    assert.equal(isRestaurantOperational(true, false), false);
    assert.equal(isRestaurantOperational(false, false), false);
  });
});

describe("resolvePackages compatibility", () => {
  it("enables missing PMS only", () => {
    const states = resolvePackages([]);
    assert.equal(states.pms.enabled, true);
    assert.equal(states.pms.source, "default_compatibility");
    assert.deepEqual(Object.keys(states), ["pms"]);
  });

  it("treats explicit disabled PMS as off (new tenant)", () => {
    const states = resolvePackages([{ package_key: "pms", enabled: false }]);
    assert.deepEqual(packageFlags(states), { pms: false });
  });

  it("ignores leftover retired-package rows", () => {
    const states = resolvePackages([
      { package_key: "restaurant_management", enabled: true },
      { package_key: "pms", enabled: false },
      { package_key: "pos", enabled: true },
      { package_key: "back_office", enabled: true },
    ]);
    assert.equal(states.pms.enabled, false);
    assert.deepEqual(Object.keys(states), ["pms"]);
  });
});

describe("pending then entitlement", () => {
  it("blocks all packages when the restaurant is not operational", () => {
    const operational = isRestaurantOperational(false, true);
    const flags = packageFlags(
      resolvePackages([{ package_key: "pms", enabled: true }]),
    );
    const visible = operational ? flags : { pms: false };
    assert.deepEqual(visible, { pms: false });
  });
});
