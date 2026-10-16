import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeFiscalRegion } from "./fiscal-region.ts";

describe("fiscal region codes", () => {
  it("drops names and keeps a 1 to 3 digit provider code", () => {
    assert.equal(normalizeFiscalRegion(null), null);
    assert.equal(normalizeFiscalRegion(undefined), null);
    assert.equal(normalizeFiscalRegion(""), null);
    assert.equal(normalizeFiscalRegion("   "), null);
    assert.equal(normalizeFiscalRegion("Addis Ababa"), null);
    assert.equal(normalizeFiscalRegion("Oromia"), null);
    assert.equal(normalizeFiscalRegion("1234"), null);
    assert.equal(normalizeFiscalRegion("1A"), null);
    assert.equal(normalizeFiscalRegion(1), null);
    assert.equal(normalizeFiscalRegion("1"), "1");
    assert.equal(normalizeFiscalRegion("12"), "12");
    assert.equal(normalizeFiscalRegion("001"), "001");
    assert.equal(normalizeFiscalRegion("123"), "123");
    assert.equal(normalizeFiscalRegion(" 12 "), "12");
  });
});
