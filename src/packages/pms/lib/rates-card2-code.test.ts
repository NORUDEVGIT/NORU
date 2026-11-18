import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidRatePlanCode,
  suggestRatePlanCode,
} from "./rates-card2-code.ts";

describe("suggestRatePlanCode", () => {
  it("builds codes from category + room type with underscores", () => {
    assert.equal(suggestRatePlanCode("BAR", "Standard King Room"), "BAR_STD_KING");
    assert.equal(suggestRatePlanCode("CORPORATE", "Deluxe Twin Room"), "CORPORATE_DLX_TWIN");
    assert.equal(suggestRatePlanCode("PROMOTIONAL", "Junior Suite"), "PROMO_JR_SUITE");
  });

  it("never emits hyphens and stays within 30 chars", () => {
    const code = suggestRatePlanCode("BAR", "Standard King Room");
    assert.equal(code.includes("-"), false);
    assert.ok(code.length <= 30);
    assert.ok(isValidRatePlanCode(code));
  });

  it("handles empty inputs gracefully", () => {
    assert.equal(suggestRatePlanCode("", ""), "");
    assert.equal(suggestRatePlanCode("BAR", ""), "BAR");
    assert.equal(suggestRatePlanCode("", "Standard King Room"), "STD_KING");
  });
});
