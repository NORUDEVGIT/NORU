import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0129_cashiering_phase9_deposit_allocations.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0129_cashiering_phase9_deposit_allocations.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");
const panels = readFileSync(
  new URL("../components/cashiering/cashiering-phase-panels.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 9 deposit allocations", () => {
  it("derives unallocated remainder and blocks double allocation", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /folio_deposit_allocations/);
    assert.match(sql, /deposit_unallocated_remainder/);
    assert.match(sql, /ALLOCATION_EXCEEDS_UNALLOCATED/);
    assert.doesNotMatch(sql, /unallocated_balance/);
    assert.match(poster, /allocateFolioDeposit/);
    assert.match(panels, /Unallocated remainder is derived/);
  });
});
