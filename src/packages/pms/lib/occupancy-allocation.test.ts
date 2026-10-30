import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateIncludedOccupancy,
  computeFinalNightlyRate,
  computeOccupancySurcharge,
  ratePlanOccupancyValidationError,
} from "./occupancy-allocation.ts";

describe("allocateIncludedOccupancy (included=2)", () => {
  const included = 2;

  it("charges extras by adult-first rule", () => {
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 2, children: 0, includedOccupancy: included }),
      { adultsIncluded: 2, childrenIncluded: 0, extraAdults: 0, extraChildren: 0 },
    );
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 3, children: 0, includedOccupancy: included }),
      { adultsIncluded: 2, childrenIncluded: 0, extraAdults: 1, extraChildren: 0 },
    );
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 2, children: 1, includedOccupancy: included }),
      { adultsIncluded: 2, childrenIncluded: 0, extraAdults: 0, extraChildren: 1 },
    );
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 1, children: 2, includedOccupancy: included }),
      { adultsIncluded: 1, childrenIncluded: 1, extraAdults: 0, extraChildren: 1 },
    );
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 2, children: 2, includedOccupancy: included }),
      { adultsIncluded: 2, childrenIncluded: 0, extraAdults: 0, extraChildren: 2 },
    );
    assert.deepEqual(
      allocateIncludedOccupancy({ adults: 3, children: 1, includedOccupancy: included }),
      { adultsIncluded: 2, childrenIncluded: 0, extraAdults: 1, extraChildren: 1 },
    );
  });

  it("infants do not consume included slots", () => {
    const result = allocateIncludedOccupancy({
      adults: 2,
      children: 0,
      includedOccupancy: included,
    });
    assert.deepEqual(result, {
      adultsIncluded: 2,
      childrenIncluded: 0,
      extraAdults: 0,
      extraChildren: 0,
    });
    assert.equal(
      computeFinalNightlyRate(12500, {
        adults: 2,
        children: 0,
        infants: 2,
        includedOccupancy: 2,
        extraAdultRate: 1200,
        extraChildRate: 600,
      }),
      12500,
    );
  });

  it("Extra Guest Allowed OFF yields zero surcharge without changing guest counts", () => {
    assert.deepEqual(
      allocateIncludedOccupancy({
        adults: 3,
        children: 1,
        includedOccupancy: included,
        extraGuestAllowed: false,
      }),
      { adultsIncluded: 3, childrenIncluded: 1, extraAdults: 0, extraChildren: 0 },
    );
  });
});

describe("computeOccupancySurcharge / final nightly", () => {
  const plan = {
    includedOccupancy: 2,
    extraAdultRate: 1200,
    extraChildRate: 600,
  };

  it("matches accepted quote examples", () => {
    assert.equal(computeFinalNightlyRate(12500, { adults: 2, children: 0, ...plan }), 12500);
    assert.equal(computeFinalNightlyRate(12500, { adults: 3, children: 0, ...plan }), 13700);
    assert.equal(computeFinalNightlyRate(12500, { adults: 2, children: 1, ...plan }), 13100);
    assert.equal(computeFinalNightlyRate(12500, { adults: 2, children: 2, ...plan }), 13700);
    assert.equal(computeFinalNightlyRate(12500, { adults: 3, children: 1, ...plan }), 14300);
    assert.equal(computeFinalNightlyRate(15000, { adults: 3, children: 0, ...plan }), 16200);
  });

  it("NULL extra rates disable that surcharge; 0 is explicitly free", () => {
    assert.equal(
      computeOccupancySurcharge({
        adults: 3,
        children: 1,
        includedOccupancy: 2,
        extraAdultRate: null,
        extraChildRate: 600,
      }).surcharge,
      600,
    );
    assert.equal(
      computeOccupancySurcharge({
        adults: 3,
        children: 1,
        includedOccupancy: 2,
        extraAdultRate: 0,
        extraChildRate: 0,
      }).surcharge,
      0,
    );
  });

  it("NULL included occupancy keeps historical no-surcharge behavior", () => {
    assert.equal(
      computeOccupancySurcharge({
        adults: 4,
        children: 2,
        includedOccupancy: null,
        extraAdultRate: 1200,
        extraChildRate: 600,
      }).surcharge,
      0,
    );
  });
});

describe("ratePlanOccupancyValidationError", () => {
  it("rejects included occupancy above room type max", () => {
    assert.equal(
      ratePlanOccupancyValidationError({
        includedOccupancy: 5,
        extraAdultRate: 0,
        extraChildRate: null,
        maxOccupancy: 4,
      }),
      "Included occupancy cannot exceed the room type maximum occupancy.",
    );
    assert.equal(
      ratePlanOccupancyValidationError({
        includedOccupancy: 2,
        extraAdultRate: null,
        extraChildRate: null,
        maxOccupancy: 4,
      }),
      null,
    );
  });
});
