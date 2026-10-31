import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { suggestRoomTypeCode } from "./rooms-card2-code.ts";

describe("suggestRoomTypeCode", () => {
  it("maps known hotel words", () => {
    assert.equal(suggestRoomTypeCode("Deluxe King"), "DLX-KNG");
    assert.equal(suggestRoomTypeCode("Standard Twin"), "STD-TWN");
    assert.equal(suggestRoomTypeCode("Executive Suite"), "EXE-STE");
    assert.equal(suggestRoomTypeCode("Family Queen"), "FAM-QN");
  });

  it("uses first three letters for unknown words and uppercases", () => {
    assert.equal(suggestRoomTypeCode("Ocean View"), "OCE-VIE");
  });

  it("returns empty for blank names and trims length", () => {
    assert.equal(suggestRoomTypeCode("   "), "");
    assert.ok(suggestRoomTypeCode("Deluxe King Superior Executive Family").length <= 20);
  });
});
