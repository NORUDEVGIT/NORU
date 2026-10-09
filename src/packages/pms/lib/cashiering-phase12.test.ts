import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0131_cashiering_phase12_exceptions_reports.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0131_cashiering_phase12_exceptions_reports.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");
const panels = readFileSync(
  new URL("../components/cashiering/cashiering-phase-panels.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("./cashiering-shell.ts", import.meta.url), "utf8");

describe("Cashiering Phase 12 exceptions and reports", () => {
  it("derives exceptions and sums canonical ledger lines", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /list_cashiering_exceptions/);
    assert.match(sql, /cashiering_report_totals/);
    assert.match(sql, /unsettled_checkout/);
    assert.doesNotMatch(sql, /mark_resolved/);
    assert.match(poster, /listCashieringExceptions/);
    assert.match(poster, /getCashieringReportTotals/);
    assert.match(panels, /Cleared only by a real settling post/);
    assert.match(shell, /id: "exceptions"/);
    assert.match(shell, /id: "reports"/);
  });
});
