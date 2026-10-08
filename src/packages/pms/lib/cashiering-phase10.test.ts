import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0130_cashiering_phase10_extended_settlement.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0130_cashiering_phase10_extended_settlement.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");

describe("Cashiering Phase 10 extended settlement", () => {
  it("closes accounts at zero and posts write-offs as new ledger rows", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /close_financial_account/);
    assert.match(sql, /post_settlement_write_off/);
    assert.match(sql, /BALANCE_NOT_ZERO/);
    assert.match(sql, /settlement_write_off/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions SET amount/);
    assert.match(poster, /postSettlementWriteOff/);
    assert.match(poster, /closeFinancialAccount/);
  });
});
