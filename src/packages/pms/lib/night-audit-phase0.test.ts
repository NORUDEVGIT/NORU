import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { NA1_STALE_BUSINESS_DATE } from "./na1.ts";
import {
  DEFAULT_END_OF_DAY_POLICY,
  RETIRED_CONDITION_CODES,
  conditionFromIssue,
  endOfDaySteps,
  openBlockers,
  persistedBlockerRows,
  type SourceIssue,
} from "./night-audit-steps.ts";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0115_night_audit_phase0_close_guard.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0115_night_audit_phase0_close_guard.sql", import.meta.url),
  "utf8",
);
const closeFn = readFileSync(new URL("./nightaudit.functions.ts", import.meta.url), "utf8");

function issue(code: string, severity: SourceIssue["severity"], referenceId = "ref-1"): SourceIssue {
  return {
    code,
    severity,
    title: code,
    description: `${code} description`,
    referenceType: "reservation",
    referenceId,
    route: "/restaurant/pms/front-office",
  };
}

describe("Night Audit Phase 0 close contract", () => {
  it("ships the same close guard on both migration lanes", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /RAISE EXCEPTION 'STALE_BUSINESS_DATE'/);
    assert.match(sql, /RAISE EXCEPTION 'AUDIT_RUN_NOT_FOUND'/);
    assert.match(sql, /RAISE EXCEPTION 'AUDIT_RUN_NOT_CLOSABLE'/);
    assert.match(sql, /RAISE EXCEPTION 'BLOCKING_EXCEPTIONS_OPEN'/);
    assert.match(sql, /IF _run\.status = 'closed' THEN/);
    assert.match(sql, /IF _run\.status NOT IN \('open', 'ready'\) THEN/);
    assert.match(sql, /_house_date IS NOT NULL AND _house_date <> _run\.business_date/);
    assert.match(sql, /business_date > _run\.business_date/);
    assert.match(sql, /SET business_date = _run\.business_date \+ 1/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.close_business_date/);
    assert.doesNotMatch(sql, /folio_transactions|hotel_reservations|hotel_rooms|housekeeping_/);
    assert.doesNotMatch(sql, /open_business_date/);
  });

  it("refuses a stale run in the app before the RPC", () => {
    assert.match(closeFn, /persistedBusinessDate/);
    assert.match(closeFn, /NA1_STALE_BUSINESS_DATE/);
    assert.equal(
      NA1_STALE_BUSINESS_DATE,
      "This run is not the current business date. Refresh Night Audit and close the current date.",
    );
    assert.match(closeFn, /openBlockers\(conditions\)/);
    assert.match(closeFn, /persistedBlockerRows\(conditions\)/);
    assert.doesNotMatch(closeFn, /remainingBlockerCount|persistedNightAuditExceptions|evaluateAudit/);
  });

  it("blocks close for each integrity condition and persists it as blocking", () => {
    for (const code of [
      "checked_in_without_room",
      "room_double_occupancy",
      "closed_folio_nonzero_balance",
      "closed_folio_post_activity",
      "duplicate_room_charge",
    ]) {
      const condition = conditionFromIssue(issue(code, "blocking"), DEFAULT_END_OF_DAY_POLICY);
      assert.ok(condition, code);
      assert.equal(condition.kind, "blocker", code);
      assert.equal(openBlockers([condition]).length, 1, code);
      const stored = persistedBlockerRows([condition]);
      assert.equal(stored.length, 1, code);
      assert.equal(stored[0]?.severity, "blocking", code);
      const steps = endOfDaySteps({ runStatus: "open", conditions: [condition] });
      assert.equal(steps.find((step) => step.id === condition.step)?.status, "blocked", code);
      assert.equal(steps.find((step) => step.id === "business_date")?.status, "blocked", code);
    }
  });

  it("never persists information and never blocks on it", () => {
    const rows = [
      conditionFromIssue(issue("dirty_room_without_task", "warning", "room-1"), DEFAULT_END_OF_DAY_POLICY),
      conditionFromIssue(issue("departure_due_today", "warning", "stay-1"), DEFAULT_END_OF_DAY_POLICY),
      conditionFromIssue(issue("open_folio_balance", "warning", "folio-1"), DEFAULT_END_OF_DAY_POLICY),
    ].filter((row) => row != null);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.kind === "information"));
    assert.equal(openBlockers(rows).length, 0);
    assert.deepEqual(persistedBlockerRows(rows), []);
  });

  it("retires the board-era codes", () => {
    assert.deepEqual([...RETIRED_CONDITION_CODES].sort(), [
      "cancel_noshow_pending",
      "pending_arrival",
      "unpaid_folio",
    ]);
    const source = readFileSync(new URL("./nightaudit.server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /unpaid_folio|NON_IGNORABLE_TYPES|evaluateAudit/);
  });
});
