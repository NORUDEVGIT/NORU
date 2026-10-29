import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultServiceQuantity,
  effectiveServiceQuantity,
  packageChargeFigures,
  packageChargeScopeApplies,
  previewPostedRoomCharge,
  serviceChargeFigures,
  serviceQuantityEditable,
  serviceUnitQuantityLabel,
  sumReservationGuestTotal,
} from "./room-charge-guest-total.ts";

describe("posted room charge guest total", () => {
  it("adds exclusive VAT and occupancy fee on the same pretax rate", () => {
    const posted = previewPostedRoomCharge(1000, [
      { code: "VAT15", name: "VAT", chargeType: "percentage", rate: 15, calculation: "exclusive" },
      { code: "FEE5", name: "Occupancy", chargeType: "percentage", rate: 5, calculation: "exclusive" },
    ]);
    assert.equal(posted.netAmount, 1000);
    assert.equal(posted.tax, 200);
    assert.equal(posted.total, 1200);
    assert.deepEqual(posted.lines, [
      { name: "Occupancy (5%)", amount: 50 },
      { name: "VAT (15%)", amount: 150 },
    ]);
  });

  it("keeps an inclusive tax inside the entered rate", () => {
    const posted = previewPostedRoomCharge(120, [
      { code: "VAT20", chargeType: "percentage", rate: 20, calculation: "inclusive" },
    ]);
    assert.equal(posted.netAmount, 100);
    assert.equal(posted.tax, 20);
    assert.equal(posted.total, 120);
  });

  it("adds an exclusive room service charge on the pretax base", () => {
    const posted = previewPostedRoomCharge(
      1000,
      [{ code: "VAT15", chargeType: "percentage", rate: 15, calculation: "exclusive" }],
      [{ code: "SVC10", chargeType: "percentage", rate: 10 }],
    );
    assert.equal(posted.serviceCharge, 100);
    assert.equal(posted.total, 1250);
  });

  it("leaves the rate unchanged when no room tax or service is set", () => {
    const posted = previewPostedRoomCharge(48000, [], []);
    assert.equal(posted.total, 48000);
  });

  it("adds a packages-only exclusive tax and keeps an all-charges tax on the package", () => {
    assert.equal(packageChargeScopeApplies("packages"), true);
    assert.equal(packageChargeScopeApplies("all"), true);
    assert.equal(packageChargeScopeApplies("rate_plans"), false);
    assert.equal(packageChargeScopeApplies("services"), false);
    const posted = packageChargeFigures(200, {
      taxes: [
        { code: "PKG", name: "Package VAT", chargeType: "percentage", rate: 10, calculation: "exclusive" },
      ],
      services: [],
    });
    assert.equal(posted.netAmount, 200);
    assert.equal(posted.total, 220);
  });
});

describe("service pricing units", () => {
  const stay = { nights: 3, persons: 4, rooms: 2 };

  it("defaults quantity from stay nights, persons, and rooms", () => {
    assert.equal(defaultServiceQuantity("per_night", stay), 3);
    assert.equal(defaultServiceQuantity("per_person", stay), 4);
    assert.equal(defaultServiceQuantity("per_room", stay), 2);
    assert.equal(defaultServiceQuantity("per_item", stay), 1);
    assert.equal(defaultServiceQuantity("per_service", stay), 1);
    assert.equal(serviceUnitQuantityLabel("per_night"), "Nights");
    assert.equal(serviceUnitQuantityLabel("per_person"), "Persons");
    assert.equal(serviceUnitQuantityLabel("per_room"), "Rooms");
    assert.equal(serviceUnitQuantityLabel("per_item"), "Quantity");
  });

  it("keeps per_service fixed at 1 and lets per_room take 1-99", () => {
    assert.equal(serviceQuantityEditable("per_service"), false);
    assert.equal(serviceQuantityEditable("per_room"), true);
    assert.equal(effectiveServiceQuantity("per_service", 7), 1);
    assert.equal(effectiveServiceQuantity("per_room", 2), 2);
    assert.equal(effectiveServiceQuantity("per_room", 120), 99);
  });

  it("taxes unit amount times quantity the same way the folio does", () => {
    const posted = serviceChargeFigures(50, 3, {
      taxes: [
        {
          code: "VAT10",
          name: "VAT",
          chargeType: "percentage",
          rate: 10,
          calculation: "exclusive",
        },
      ],
      services: [],
      departmentTaxes: {},
      departmentServices: {},
    });
    assert.equal(posted.netAmount, 150);
    assert.equal(posted.tax, 15);
    assert.equal(posted.total, 165);
  });

  it("adds room, taxed packages, and taxed services the same way Expected Total does", () => {
    assert.equal(sumReservationGuestTotal(1000, 220, 165), 1385);
    assert.equal(sumReservationGuestTotal(null, 0, 0), null);
    assert.equal(sumReservationGuestTotal(null, 220, 0), 220);
  });
});
