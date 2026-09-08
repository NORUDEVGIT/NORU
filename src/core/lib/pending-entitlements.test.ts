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
  it("treats missing rows as enabled (legacy)", () => {
    const states = resolvePackages([]);
    assert.equal(states.restaurant_management.enabled, true);
    assert.equal(states.pms.enabled, true);
    assert.equal(states.pos.enabled, true);
    assert.equal(states.back_office.enabled, true);
    assert.equal(states.pms.source, "default_compatibility");
  });

  it("treats explicit disabled rows as off (new tenant)", () => {
    const states = resolvePackages([
      { package_key: "restaurant_management", enabled: false },
      { package_key: "pms", enabled: false },
      { package_key: "pos", enabled: false },
      { package_key: "back_office", enabled: false },
    ]);
    assert.deepEqual(packageFlags(states), {
      restaurant_management: false,
      pms: false,
      pos: false,
      back_office: false,
    });
  });

  it("enables only the explicit package that is on", () => {
    const states = resolvePackages([
      { package_key: "restaurant_management", enabled: true },
      { package_key: "pms", enabled: false },
      { package_key: "pos", enabled: false },
      { package_key: "back_office", enabled: false },
    ]);
    assert.equal(states.restaurant_management.enabled, true);
    assert.equal(states.pms.enabled, false);
    assert.equal(states.pos.enabled, false);
    assert.equal(states.back_office.enabled, false);
  });
});

describe("pending then entitlement", () => {
  it("blocks all packages when the restaurant is not operational", () => {
    const operational = isRestaurantOperational(false, true);
    const flags = packageFlags(
      resolvePackages([
        { package_key: "restaurant_management", enabled: true },
        { package_key: "pms", enabled: true },
        { package_key: "pos", enabled: true },
        { package_key: "back_office", enabled: true },
      ]),
    );
    const visible = operational
      ? flags
      : { restaurant_management: false, pms: false, pos: false, back_office: false };
    assert.deepEqual(visible, {
      restaurant_management: false,
      pms: false,
      pos: false,
      back_office: false,
    });
  });
});
