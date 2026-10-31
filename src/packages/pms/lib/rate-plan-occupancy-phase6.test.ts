import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { computeFinalNightlyRate } from "./occupancy-allocation.ts";
import { occupancyFieldsFromRoomTypeDefaults } from "./rate-plan-from-defaults.ts";

const card2Ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card2-rates.tsx", import.meta.url),
  "utf8",
);
const card3Ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-rates.tsx", import.meta.url),
  "utf8",
);
const setupUi = readFileSync(
  new URL("../components/settings/rate-plan-pricing-setup.tsx", import.meta.url),
  "utf8",
);
const card2Fns = readFileSync(new URL("./rates-card2.functions.ts", import.meta.url), "utf8");
const card3Fns = readFileSync(new URL("./rates-card3.functions.ts", import.meta.url), "utf8");
const roomsFns = readFileSync(new URL("./rooms.functions.ts", import.meta.url), "utf8");
const publicFns = readFileSync(new URL("./public-booking.functions.ts", import.meta.url), "utf8");
const ratesFns = readFileSync(new URL("./rates.functions.ts", import.meta.url), "utf8");
const cashieringFns = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const engine = readFileSync(
  new URL("../../../../drizzle/migrations/0192_price_hotel_stay_occupancy_surcharge.sql", import.meta.url),
  "utf8",
);

describe("Phase 6 Rate Plan occupancy pricing", () => {
  it("uses the shared create-time helper and occupancy setup on interactive writers", () => {
    assert.match(card2Ui, /RatePlanPricingSetup/);
    assert.match(card3Ui, /RatePlanPricingSetup/);
    assert.match(card2Ui, /computeRatePlanBaseFromDefaults/);
    assert.match(card3Ui, /computeRatePlanBaseFromDefaults/);
    assert.match(card2Ui, /occupancyFieldsFromRoomTypeDefaults/);
    assert.match(card3Ui, /occupancyFieldsFromRoomTypeDefaults/);
    assert.match(setupUi, /Use Room Type Base/);
    assert.match(setupUi, /No Room Type base price is configured/);
    assert.match(setupUi, /Recalculate from Room Type Defaults/);
    assert.doesNotMatch(card2Fns, /pricing_method/);
    assert.doesNotMatch(card3Fns, /pricing_method/);
    assert.doesNotMatch(setupUi, /use_base.*live/);
  });

  it("persists Rate Plan occupancy fields and validates included occupancy against max", () => {
    assert.match(card2Fns, /included_occupancy: data\.includedOccupancy/);
    assert.match(card2Fns, /extra_adult_rate: data\.extraAdultRate/);
    assert.match(card2Fns, /extra_child_rate: data\.extraChildRate/);
    assert.match(card3Fns, /included_occupancy: data\.includedOccupancy/);
    assert.match(card3Fns, /extra_adult_rate: data\.extraAdultRate/);
    assert.match(card2Fns, /ratePlanOccupancyValidationError/);
    assert.match(card3Fns, /ratePlanOccupancyValidationError/);
    assert.match(card2Fns, /Rate Plan occupancy pricing is unavailable until migration 0191/);
    assert.match(ratesFns, /includedOccupancy: z\.number\(\)\.int\(\)\.min\(1\)/);
    assert.match(ratesFns, /included_occupancy: data\.includedOccupancy/);
  });

  it("does not cascade Room Type default edits onto Rate Plans", () => {
    const saveType = roomsFns.slice(roomsFns.indexOf("export const saveRoomType"));
    assert.doesNotMatch(saveType, /hotel_rate_plans/);
    assert.doesNotMatch(saveType, /from\("hotel_rate_plans"\)/);
    assert.deepEqual(
      occupancyFieldsFromRoomTypeDefaults({
        standardOccupancy: 2,
        extraAdultRateDefault: 1200,
        extraChildRateDefault: 600,
      }),
      { includedOccupancy: "2", extraAdultRate: "1200", extraChildRate: "600" },
    );
  });

  it("quotes occupancy through price_hotel_stay for staff and public search", () => {
    const quote = ratesFns.slice(ratesFns.indexOf("export const quoteStay"));
    assert.match(quote, /rpc\("price_hotel_stay"/);
    assert.match(quote, /_adults: data\.adults/);
    assert.match(quote, /_children: data\.children/);
    const search = publicFns.slice(publicFns.indexOf("export const searchStay"));
    assert.match(search, /rpc\("price_hotel_stay"/);
    assert.match(search, /_adults: data\.adults/);
    assert.match(search, /_children: data\.children/);
    assert.doesNotMatch(search, /computeOccupancySurcharge/);
    assert.doesNotMatch(search, /extra_adult_rate_default/);
    assert.match(publicFns, /t\.max_occupancy >= guests/);
    assert.match(publicFns, /data\.adults \+ data\.children > type\.max_occupancy/);
  });

  it("keeps one nightly accommodation amount and does not invent extra-guest folio lines", () => {
    assert.match(engine, /jsonb_build_object\('date', to_char\(night, 'YYYY-MM-DD'\), 'rate', converted\)/);
    assert.doesNotMatch(engine, /Extra Guest Charge/);
    assert.doesNotMatch(cashieringFns, /extra_guest/);
    assert.doesNotMatch(cashieringFns, /extra_child_charge/);
    assert.equal(
      computeFinalNightlyRate(12500, {
        adults: 3,
        children: 0,
        includedOccupancy: 2,
        extraAdultRate: 1200,
        extraChildRate: 600,
      }),
      13700,
    );
  });
});
