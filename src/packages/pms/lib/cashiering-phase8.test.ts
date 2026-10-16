import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0128_cashiering_phase8_financial_accounts.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0128_cashiering_phase8_financial_accounts.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");
const panels = readFileSync(
  new URL("../components/cashiering/cashiering-phase-panels.tsx", import.meta.url),
  "utf8",
);
const masterPicker = readFileSync(
  new URL("../components/cashiering/cashiering-master-picker.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 8 financial accounts", () => {
  it("adds real account headers without a stored balance", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /financial_accounts/);
    assert.match(sql, /financial_account_participants/);
    assert.match(sql, /financial_account_balance/);
    assert.match(sql, /folio_transactions_target_check/);
    assert.doesNotMatch(sql, /balance numeric/);
    assert.match(poster, /openFinancialAccount/);
    assert.match(panels, /not Guest Profile stay aggregates/);
    assert.match(panels, /CashieringMasterPicker/);
    assert.match(panels, /Financial account already open/);
    assert.doesNotMatch(panels, /Master ID \(from Guest Profile\)/);
    assert.match(masterPicker, /cashiering-master-picker/);
    assert.match(masterPicker, /Search companies by name or code/);
    assert.match(masterPicker, /listGuestAccounts/);
  });
});
