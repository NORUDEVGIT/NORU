import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TAX_SETUP_CODE_MAX,
  suggestTaxSetupCode,
  taxSetupCodeIsTaken,
} from "./taxes-card3-code.ts";

describe("suggestTaxSetupCode", () => {
  it("builds a name slug of letters, numbers, and underscores", () => {
    assert.equal(suggestTaxSetupCode("Service Charge"), "SERVICE_CHARGE");
    assert.equal(suggestTaxSetupCode("Tourism Fee"), "TOURISM_FEE");
    assert.equal(suggestTaxSetupCode("Standard Room Taxes"), "STANDARD_ROOM_TAXES");
    assert.equal(suggestTaxSetupCode("  spa & wellness!! "), "SPA_WELLNESS");
    assert.equal(suggestTaxSetupCode("A   B---C"), "A_B_C");
    assert.equal(suggestTaxSetupCode("___"), "");
  });

  it("appends a percentage rate only when the code still fits", () => {
    assert.equal(
      suggestTaxSetupCode("Value Added Tax", { percentageRate: 15 }),
      "VALUE_ADDED_TAX_15",
    );
    assert.equal(suggestTaxSetupCode("City Tax", { percentageRate: 7.5 }), "CITY_TAX_7_5");
    assert.equal(suggestTaxSetupCode("City Tax", { percentageRate: 15 }), "CITY_TAX_15");
    assert.equal(suggestTaxSetupCode("City Tax"), "CITY_TAX");
    assert.equal(suggestTaxSetupCode("City Tax", { percentageRate: 0 }), "CITY_TAX");
    assert.equal(suggestTaxSetupCode("City Tax", { percentageRate: 150 }), "CITY_TAX");
  });

  it("keeps the name slug when a rate suffix would exceed 20 characters", () => {
    const name = "Municipal Accommodation Levy";
    const base = suggestTaxSetupCode(name);
    const withRate = suggestTaxSetupCode(name, { percentageRate: 15 });
    assert.equal(withRate, base);
    assert.ok(withRate.length <= TAX_SETUP_CODE_MAX);
    assert.match(withRate, /^[A-Z0-9_]+$/);
    assert.equal(withRate.startsWith("_") || withRate.endsWith("_"), false);
  });

  it("trims a truncated code so it does not end on an underscore", () => {
    const code = suggestTaxSetupCode("AAAAAAAAAAAAAAAAAAA_EXTRA");
    assert.equal(code, "AAAAAAAAAAAAAAAAAAA");
    assert.ok(code.length <= TAX_SETUP_CODE_MAX);
  });
});

describe("taxSetupCodeIsTaken", () => {
  it("flags another row and ignores the record's own saved code", () => {
    assert.equal(taxSetupCodeIsTaken("SERVICE_CHARGE", ["SERVICE_CHARGE", "VAT"]), true);
    assert.equal(
      taxSetupCodeIsTaken("SERVICE_CHARGE", ["SERVICE_CHARGE"], "SERVICE_CHARGE"),
      false,
    );
    assert.equal(taxSetupCodeIsTaken("", ["SERVICE_CHARGE"]), false);
  });
});
