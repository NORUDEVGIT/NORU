import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeRatePlanBaseFromDefaults,
  occupancyFieldsFromRoomTypeDefaults,
  occupancyFieldsFromSavedRatePlan,
  roomTypeBaseIsConfigured,
} from "./rate-plan-from-defaults.ts";

describe("computeRatePlanBaseFromDefaults", () => {
  it("use_base / discount / markup / fixed", () => {
    assert.deepEqual(
      computeRatePlanBaseFromDefaults({ method: "use_base", roomTypeBase: 12500 }),
      { ok: true, baseRate: 12500, roomTypeBase: 12500, adjustment: 0 },
    );
    assert.deepEqual(
      computeRatePlanBaseFromDefaults({ method: "discount", roomTypeBase: 12500, percent: 10 }),
      { ok: true, baseRate: 11250, roomTypeBase: 12500, adjustment: -1250 },
    );
    assert.deepEqual(
      computeRatePlanBaseFromDefaults({ method: "markup", roomTypeBase: 12500, percent: 10 }),
      { ok: true, baseRate: 13750, roomTypeBase: 12500, adjustment: 1250 },
    );
    assert.deepEqual(
      computeRatePlanBaseFromDefaults({ method: "fixed", roomTypeBase: 12500, fixedPrice: 10000 }),
      { ok: true, baseRate: 10000, roomTypeBase: 12500, adjustment: 0 },
    );
  });

  it("requires fixed when room type base is missing and does not treat NULL as zero", () => {
    assert.equal(roomTypeBaseIsConfigured(null), false);
    assert.equal(roomTypeBaseIsConfigured(0), true);
    const missing = computeRatePlanBaseFromDefaults({ method: "use_base", roomTypeBase: null });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.match(missing.message, /No Room Type base price is configured/);
    }
    const discountMissing = computeRatePlanBaseFromDefaults({
      method: "discount",
      roomTypeBase: null,
      percent: 10,
    });
    assert.equal(discountMissing.ok, false);
    const fixed = computeRatePlanBaseFromDefaults({
      method: "fixed",
      roomTypeBase: null,
      fixedPrice: 9000,
    });
    assert.deepEqual(fixed, { ok: true, baseRate: 9000, roomTypeBase: null, adjustment: 0 });
  });

  it("copies Room Type occupancy defaults and keeps saved Rate Plan values independent", () => {
    const type = {
      standardOccupancy: 2,
      extraAdultRateDefault: 1200,
      extraChildRateDefault: 600,
    };
    assert.deepEqual(occupancyFieldsFromRoomTypeDefaults(type), {
      includedOccupancy: "2",
      extraAdultRate: "1200",
      extraChildRate: "600",
    });
    const edited = occupancyFieldsFromSavedRatePlan({
      includedOccupancy: 3,
      extraAdultRate: 900,
      extraChildRate: 0,
    });
    assert.deepEqual(edited, {
      includedOccupancy: "3",
      extraAdultRate: "900",
      extraChildRate: "0",
    });
    assert.deepEqual(occupancyFieldsFromRoomTypeDefaults(type), {
      includedOccupancy: "2",
      extraAdultRate: "1200",
      extraChildRate: "600",
    });
    assert.deepEqual(occupancyFieldsFromSavedRatePlan({
      includedOccupancy: null,
      extraAdultRate: null,
      extraChildRate: null,
    }), {
      includedOccupancy: "",
      extraAdultRate: "",
      extraChildRate: "",
    });
  });
});
