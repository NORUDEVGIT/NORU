import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BILLING_ROUTING_EXECUTABLE,
  TRANSFER_TARGET_KINDS,
  TRANSFER_TRANSACTION_TYPES,
} from "./cashiering-transfer-model.ts";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0127_cashiering_phase7_windows_transfers.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0127_cashiering_phase7_windows_transfers.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("./cashiering-shell.ts", import.meta.url), "utf8");

describe("Cashiering Phase 7 windows and transfers", () => {
  it("locks the transfer target model and keeps routing held", () => {
    assert.deepEqual(TRANSFER_TARGET_KINDS, ["folio_window", "guest_folio", "financial_account"]);
    assert.deepEqual(TRANSFER_TRANSACTION_TYPES, ["transfer_out", "transfer_in"]);
    assert.equal(BILLING_ROUTING_EXECUTABLE, false);
  });

  it("creates windows, paired transfer rows, and idempotent replay", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /guest_folio_windows/);
    assert.match(sql, /transfer_id uuid/);
    assert.match(sql, /transfer_out/);
    assert.match(sql, /TRANSFER_EXCEEDS_REMAINDER/);
    assert.match(sql, /post_folio_transfer/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
    assert.match(poster, /post_folio_transfer/);
    assert.match(shell, /id: "transfers"/);
  });
});
