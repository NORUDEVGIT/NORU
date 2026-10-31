import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestRatePlanCode } from "./rates-card2-code.ts";

describe("suggestRatePlanCode", () => {
  it("maps known rate plan phrases to standard codes", () => {
    assert.equal(suggestRatePlanCode("Best Available Rate"), "BAR");
    assert.equal(suggestRatePlanCode("Standard Rate"), "STD-RATE");
    assert.equal(suggestRatePlanCode("Non-Refundable"), "NON-REF");
    assert.equal(suggestRatePlanCode("Bed and Breakfast"), "BB");
  });

  it("converts unknown words to uppercase abbreviation", () => {
    assert.equal(suggestRatePlanCode("Summer Promo"), "SUM-PROMO");
    assert.equal(suggestRatePlanCode("Corporate Special"), "CORP-SPE");
  });

  it("handles empty or blank string gracefully", () => {
    assert.equal(suggestRatePlanCode(""), "");
    assert.equal(suggestRatePlanCode("   "), "");
  });
});
