import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const desk = readFileSync(
  new URL("../components/cashiering/cashiering-desk.tsx", import.meta.url),
  "utf8",
);
const dialogs = readFileSync(
  new URL("../components/cashiering/folio-dialogs.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../components/cashiering/guest-folio-page.tsx", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");

describe("Cashiering held phases 11, 13, 14", () => {
  it("does not ship city ledger, FX, offline cashiering, or e-invoice", () => {
    const ui = `${desk}\n${dialogs}\n${page}\n${poster}`;
    assert.match(page, /Issue invoice/);
    assert.match(page, /not an issued invoice/);
    assert.doesNotMatch(ui, /\bcity ledger\b|\be-invoice\b|\boffline queue\b|\bfx conversion\b/i);
    assert.doesNotMatch(poster, /pms_exchange_rates|city_ledger|offline_policy/);
  });
});
