import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { previewPostedRoomCharge } from "./room-charge-guest-total.ts";

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
});
