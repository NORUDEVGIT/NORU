import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { planExceptionSync, type ExceptionSyncExisting } from "./night-audit-exceptions.ts";
import {
  ALREADY_CLOSED_COPY,
  ALREADY_CLOSED_TITLE,
  closedByThisRequest,
  persistedCloseFacts,
  type PersistedCloseRow,
  DEFAULT_EXCEPTION_FILTER,
  DEFAULT_HISTORY_FILTER,
  HISTORY_PAGE_SIZES,
  HISTORY_STATUSES,
  CLOSE_CONFIRM_COPY,
  OVERALL_STATUS_LABEL,
  canRetryOtbSnapshot,
  canSyncRunExceptions,
  canViewNightAuditOperationalDetail,
  closeGate,
  closeResultView,
  closeTargetDates,
  controlPrimaryAction,
  effectiveOverallStatus,
  exceptionAllowsManualStatus,
  exceptionCounts,
  exceptionDefaultSource,
  exceptionFilterForFocus,
  exceptionMeta,
  exceptionStatusLabel,
  filterExceptions,
  formatSummaryCount,
  historyFiltersActive,
  historyRange,
  historySearchDates,
  historyStatusLabel,
  nightAuditReportLinks,
  nightAuditRunState,
  otbStatusLabel,
  parseHistoryPageSize,
  presentExceptionMessage,
  presentRunSummary,
  summaryCount,
  type CloseGateInput,
  type WorkflowException,
} from "./night-audit-workflow.ts";
import { nightAuditAllowsClose, nightAuditOverallStatus } from "./night-audit-operational.ts";
import { canViewNightAuditFinancialDetail } from "./night-audit-financial.ts";
import { NA1_CONFIRM_LABEL, canConfirmNightAudit, nightAuditOtbNotice } from "./na1.ts";
import { NIGHT_AUDIT_TABS, nightAuditSearch, resolveNightAuditTab } from "./night-audit-shell.ts";
import { parseReportsRouteSearch } from "./reports-shell.ts";

const DATE = "2026-10-21";
const NEXT = "2026-10-22";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const functions = read("./nightaudit.functions.ts");
const workflow = read("./night-audit-workflow.ts");
const desk = read("../components/nightaudit/night-audit-desk.tsx");
const queue = read("../components/nightaudit/night-audit-exception-queue.tsx");
const history = read("../components/nightaudit/night-audit-history.tsx");
const closePanel = read("../components/nightaudit/na1-panels.tsx");
const workspace = read("../components/workspaces/night-audit-workspace.tsx");
const migration = readFileSync("supabase/migrations/0115_night_audit_phase0_close_guard.sql", "utf8");

function handler(name: string): string {
  const start = functions.indexOf(`export const ${name} =`);
  assert.ok(start >= 0, `${name} exists`);
  const next = functions.indexOf("export const ", start + 10);
  return functions.slice(start, next < 0 ? undefined : next);
}

let seq = 0;
function ex(input: Partial<WorkflowException> = {}): WorkflowException {
  seq += 1;
  return {
    id: `ex-${String(seq).padStart(3, "0")}`,
    exceptionType: "open_folio_balance",
    severity: "warning",
    referenceType: "folio",
    referenceId: `ref-${seq}`,
    message: "Folio balance 120.00",
    status: "open",
    createdAt: "2026-10-21T18:00:00.000Z",
    resolvedAt: null,
    ...input,
  };
}

function existing(input: Partial<ExceptionSyncExisting> = {}): ExceptionSyncExisting {
  return {
    id: "row-1",
    exceptionType: "overstay",
    severity: "blocking",
    referenceId: "unit-1",
    message: "Room 101 overstay",
    status: "open",
    ...input,
  };
}

const READY_GATE: CloseGateInput = {
  overall: "ready",
  financial: "ready",
  operational: "ready",
  openBlockingExceptions: 0,
  boardBlockers: 0,
  canClose: true,
  busy: false,
  runStatus: "open",
  rechecked: true,
};

/* ---------------------------------------------------------------- 1–10 */

describe("NA-P4 exceptions", () => {
  it("1. a financial blocker is visible in the unified queue", () => {
    const rows = [ex({ exceptionType: "allocation_exceeds_source", severity: "blocking" })];
    const visible = filterExceptions(rows, DEFAULT_EXCEPTION_FILTER);
    assert.equal(visible.length, 1);
    const meta = exceptionMeta(visible[0]!.exceptionType);
    assert.equal(meta.domain, "financial");
    assert.equal(meta.categoryLabel, "Payments");
    assert.equal(exceptionCounts(rows).blocking, 1);
  });

  it("2. an operational blocker is visible in the unified queue", () => {
    const rows = [ex({ exceptionType: "overstay", severity: "blocking", referenceType: "room_unit" })];
    const meta = exceptionMeta(rows[0]!.exceptionType);
    assert.equal(meta.domain, "operations");
    assert.equal(meta.category, "departures");
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, domain: "operations" }).length, 1);
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, domain: "financial" }).length, 0);
  });

  it("3. a warning is visible and counted separately", () => {
    const rows = [ex({ severity: "warning" }), ex({ exceptionType: "overstay", severity: "blocking" })];
    assert.deepEqual(exceptionCounts(rows), { blocking: 1, warnings: 1, open: 2, resolved: 0 });
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, severity: "warning" }).length, 1);
  });

  it("4. a fixed source auto-resolves on recheck", () => {
    const plan = planExceptionSync([existing()], []);
    assert.deepEqual(plan.resolveIds, ["row-1"]);
    assert.equal(plan.inserts.length, 0);
    assert.match(functions, /resolution_note: "Cleared automatically — the underlying issue was fixed\."/);
  });

  it("5. a returning condition reopens the same row (blocker and warning)", () => {
    const derived = [
      { exceptionType: "overstay", severity: "blocking" as const, referenceType: "room_unit", referenceId: "unit-1", message: "Room 101 overstay" },
    ];
    const blocker = planExceptionSync([existing({ status: "resolved" })], derived);
    assert.equal(blocker.inserts.length, 0);
    assert.deepEqual(blocker.updates.map((u) => [u.id, u.reopen]), [["row-1", true]]);

    const warning = planExceptionSync(
      [existing({ exceptionType: "pending_arrival", severity: "warning", status: "resolved" })],
      [{ ...derived[0]!, exceptionType: "pending_arrival", severity: "warning" }],
    );
    assert.equal(warning.updates[0]?.reopen, true);
    assert.match(functions, /status: "open", resolved_at: null, resolution_note: null/);
  });

  it("6. a duplicate recheck does not duplicate the row", () => {
    const derived = [
      { exceptionType: "overstay", severity: "blocking" as const, referenceType: "room_unit", referenceId: "unit-1", message: "Room 101 overstay" },
    ];
    const plan = planExceptionSync([existing()], derived);
    assert.deepEqual(plan, { inserts: [], updates: [], resolveIds: [] });
  });

  it("7. a blocker cannot be ignored or manually resolved", () => {
    assert.equal(exceptionAllowsManualStatus({ severity: "blocking" }), false);
    const body = handler("updateException");
    assert.match(body, /data\.action === "resolve"/);
    assert.match(body, /This integrity exception can't be ignored/);
    assert.match(body, /exception\.severity === "blocking"/);
    for (const source of [desk, queue, history, workspace]) {
      assert.doesNotMatch(source, /updateException|Mark Fixed|Mark Resolved|Force Pass|Ignore Blocker|>Ignore</i);
    }
  });

  it("8. resolved rows are retained in run history", () => {
    const rows = [ex({ status: "resolved", resolvedAt: "2026-10-21T20:00:00.000Z" }), ex()];
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, status: "all" }).length, 2);
    assert.equal(exceptionCounts(rows).resolved, 1);
    assert.doesNotMatch(functions, /\.from\("night_audit_exceptions"\)\s*\.delete\(/);
    assert.match(history, /resolved during run/);
  });

  it("9. a closed run's exceptions never reopen from a later business date", () => {
    assert.equal(canSyncRunExceptions("closed"), false);
    assert.equal(canSyncRunExceptions("failed"), false);
    assert.equal(canSyncRunExceptions("open"), true);
    assert.equal(canSyncRunExceptions("ready"), true);
    assert.match(functions, /if \(!current \|\| !canSyncRunExceptions\(\(current as \{ status: string \}\)\.status\)\) return;/);
    assert.match(handler("updateException"), /This run is closed\. Its exceptions are history\./);
  });

  it("10. filters: status, severity, domain, category, search", () => {
    const rows = [
      ex({ exceptionType: "open_cashier_shift", severity: "blocking", message: "Drawer A open" }),
      ex({ exceptionType: "pending_arrival", severity: "warning", message: "Abebe arriving" }),
      ex({ exceptionType: "fiscal_unregistered", severity: "warning", status: "resolved" }),
    ];
    assert.equal(filterExceptions(rows, DEFAULT_EXCEPTION_FILTER).length, 2);
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, status: "resolved" }).length, 1);
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, category: "drawers" }).length, 1);
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, status: "all", category: "fiscal" }).length, 1);
    assert.equal(filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, search: "abebe" }).length, 1);
    assert.equal(filterExceptions(rows, DEFAULT_EXCEPTION_FILTER)[0]?.severity, "blocking");
    assert.deepEqual(exceptionFilterForFocus("blockers"), { ...DEFAULT_EXCEPTION_FILTER, severity: "blocking" });
    for (const label of ['aria-label="Status"', 'aria-label="Severity"', 'aria-label="Domain"', 'aria-label="Category"', 'aria-label="Search exceptions"']) {
      assert.ok(queue.includes(label), label);
    }
    for (const column of ["Severity", "Category", "Issue", "Source", "Reference", "Status", "Opened", "Last checked", "Resolved at"]) {
      assert.ok(queue.includes(`>${column}</th>`), column);
    }
    assert.match(queue, /Open Source/);
    assert.equal(exceptionStatusLabel("ignored"), "Ignored (legacy)");
    assert.deepEqual(exceptionDefaultSource("open_cashier_shift", DATE), {
      route: "/restaurant/pms/cashiering",
      search: { tab: "cashier-shift" },
    });
  });
});

/* --------------------------------------------------------------- 11–20 */

const overall = (input: Partial<Parameters<typeof nightAuditOverallStatus>[0]>) =>
  nightAuditOverallStatus({
    closed: false,
    boardBlockers: 0,
    boardUnavailable: false,
    openBlockingExceptions: 0,
    financial: "ready",
    operational: "ready",
    warnings: 0,
    ...input,
  });

describe("NA-P4 Control Center", () => {
  it("11. ready → Run & Close", () => {
    const status = overall({});
    assert.equal(status, "ready");
    assert.equal(controlPrimaryAction(status).label, "Run & Close");
    assert.equal(nightAuditRunState({ runStatus: "open", overall: status }), "Ready");
  });

  it("12. warning → Review & Close", () => {
    const status = overall({ warnings: 2 });
    assert.equal(status, "warning");
    assert.equal(controlPrimaryAction(status).label, "Review & Close");
    assert.equal(nightAuditAllowsClose(status), true);
  });

  it("13. blocked financial → Review First Blocker", () => {
    const status = overall({ financial: "blocked" });
    assert.equal(status, "blocked");
    assert.equal(controlPrimaryAction(status).label, "Review First Blocker");
    assert.equal(nightAuditRunState({ runStatus: "open", overall: status }), "Blocked");
    assert.match(desk, /financialSummary\.status === "blocked"\) return onOpenFinancial\?\.\("blockers"\)/);
  });

  it("14. blocked operations → Review First Blocker opens Operations", () => {
    assert.equal(overall({ operational: "blocked" }), "blocked");
    assert.match(desk, /operationalSummary\.status === "blocked"\) return onOpenOperations\?\.\("blockers"\)/);
  });

  it("15. unavailable financial → Overall Unavailable and Retry Checks", () => {
    assert.equal(overall({ financial: "unavailable" }), "unavailable");
    assert.equal(effectiveOverallStatus({ server: "ready", financial: "unavailable", operational: "ready" }), "unavailable");
    assert.equal(controlPrimaryAction("unavailable").label, "Retry Checks");
  });

  it("16. unavailable operations → Overall Unavailable", () => {
    assert.equal(overall({ operational: "unavailable" }), "unavailable");
    assert.equal(effectiveOverallStatus({ server: "warning", financial: "ready", operational: "unavailable" }), "unavailable");
    assert.equal(effectiveOverallStatus({ server: "closed", financial: "unavailable", operational: "ready" }), "closed");
    assert.equal(effectiveOverallStatus({ server: "warning", financial: "loading", operational: "ready" }), "warning");
  });

  it("17. Control Center counts come from the same Financial and Operations reads", () => {
    assert.match(workspace, /blockerCount: financialQuery\.data\.summary\.blockerCount/);
    assert.match(workspace, /operationsQuery\.data\.summary\.blockerCount/);
    assert.match(workspace, /openDrawerCount: financialQuery\.data\.summary\.openDrawerCount/);
    for (const label of ["Financial blockers", "Financial warnings", "Operational blockers", "Operational warnings", "Open exceptions", "Open drawers"]) {
      assert.ok(desk.includes(label), label);
    }
    assert.match(desk, /data-testid="night-audit-financial-kpis"/);
    assert.match(desk, /data-testid="night-audit-operations-kpis"/);
    assert.doesNotMatch(desk, /NaClosePanel[\s\S]{0,40}tab === "control"/);
  });

  it("18. Refresh rechecks every loader and never writes from the client", () => {
    assert.match(workspace, /auditQuery\.refetch\(\),\s*financialQuery\.refetch\(\),\s*operationsQuery\.refetch\(\)/);
    assert.match(desk, /onClick=\{onRecheck\}/);
    assert.match(desk, /primary\.kind === "retry"\) return onRecheck\(\)/);
  });

  it("19. last close is displayed from the stored close", () => {
    assert.match(desk, /<NaCloseSummary lastClosed=\{lastClosed\} \/>/);
    assert.match(closePanel, /Last successful Night Audit/);
    assert.match(functions, /lastClosedRunId: lastClosedRaw\?\.id \?\? null/);
  });

  it("20. current business date stays distinct from last close", () => {
    assert.match(desk, /formatNa1Date\(businessDate\)/);
    assert.match(functions, /previousBusinessDate: lastClosedRaw\.summary\?\.previousBusinessDate \?\? lastClosedRaw\.business_date/);
    assert.deepEqual(closeTargetDates(DATE), { current: DATE, next: NEXT });
  });
});

/* --------------------------------------------------------------- 21–35 */

describe("NA-P4 Run & Close", () => {
  it("21. warning-only allows close", () => {
    const gate = closeGate({ ...READY_GATE, overall: "warning", financial: "warning", operational: "warning" });
    assert.equal(gate.enabled, true);
    assert.match(gate.reason, /warnings do not block/);
  });

  it("22. a financial blocker prevents close", () => {
    assert.equal(closeGate({ ...READY_GATE, overall: "blocked", financial: "blocked" }).enabled, false);
  });

  it("23. an operational blocker prevents close", () => {
    assert.equal(closeGate({ ...READY_GATE, overall: "blocked", operational: "blocked" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, openBlockingExceptions: 1 }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, boardBlockers: 1 }).enabled, false);
  });

  it("24. unavailable prevents close", () => {
    assert.equal(closeGate({ ...READY_GATE, financial: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, operational: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, overall: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, financial: "loading" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, rechecked: false }).reason, "Run Final Recheck before closing.");
  });

  it("25. the server rechecks Financial, Operations and exceptions before the RPC", () => {
    const body = handler("closeBusinessDate");
    const rpc = body.indexOf('rpc("close_business_date"');
    const order = [
      body.indexOf("readFinancialReconciliation("),
      body.indexOf("readOperationalReconciliation("),
      body.indexOf("await syncRunExceptions("),
      body.indexOf("remainingBlockerCount(blockers) > 0"),
      body.indexOf('.eq("severity", "blocking")'),
      body.indexOf("nightAuditAllowsClose(overallStatus)"),
      rpc,
    ];
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1]! >= 0 && order[i - 1]! < order[i]!, `step ${i}`);
  });

  it("26. a blocker appearing between page load and click rejects the close", () => {
    const body = handler("closeBusinessDate");
    assert.match(body, /!financialAllowsClose\(financial\.result\.status\)/);
    assert.match(body, /!operationalAllowsClose\(operational\.result\.status\)/);
    assert.match(body, /Blocking exceptions are still open for this business date\./);
    assert.match(migration, /BLOCKING_EXCEPTIONS_OPEN/);
  });

  it("27–30. owner and manager may close; receptionist and cashier may not", () => {
    assert.equal(canConfirmNightAudit("owner"), true);
    assert.equal(canConfirmNightAudit("manager"), true);
    assert.equal(canConfirmNightAudit("receptionist"), false);
    assert.equal(canConfirmNightAudit("cashier"), false);
    assert.equal(closeGate({ ...READY_GATE, canClose: false }).enabled, false);
    assert.match(handler("closeBusinessDate"), /const me = await requireCashierManager\(context as never, data\.restaurantId\);/);
    assert.match(handler("retryNightAuditOtbSnapshot"), /await requireCashierManager\(/);
  });

  it("31. a double click advances once", () => {
    assert.match(closePanel, /if \(submitted\.current \|\| busy \|\| !gate\.enabled\) return;/);
    assert.match(workspace, /if \(closing\.current \|\| closeMutation\.isPending\) return;/);
    assert.match(migration, /FOR UPDATE/);
    assert.equal(closeGate({ ...READY_GATE, busy: true }).enabled, false);
  });

  it("32. an already-closed run is idempotent", () => {
    const body = handler("closeBusinessDate");
    assert.match(body, /if \(run\.status === "closed"\) return alreadyClosedResult\(run\);/);
    assert.match(body, /const alreadyClosedResult = async[\s\S]*?alreadyClosed: true/);
    assert.match(migration, /IF _run\.status = 'closed' THEN\s*RETURN _run;/);
    assert.equal(closeGate({ ...READY_GATE, runStatus: "closed" }).enabled, false);
  });

  it("33. a stale business date is rejected", () => {
    const body = handler("closeBusinessDate");
    assert.match(body, /data\.expectedBusinessDate && data\.expectedBusinessDate !== runDate/);
    assert.match(body, /NA1_STALE_BUSINESS_DATE/);
    assert.match(workspace, /expectedBusinessDate: vars\.businessDate\.slice\(0, 10\)/);
    assert.match(migration, /STALE_BUSINESS_DATE/);
  });

  it("34. the audit note persists on the winning close and never bypasses checks", () => {
    const body = handler("closeBusinessDate");
    const note = body.indexOf(".update({ notes: note })");
    assert.ok(note > body.indexOf("nightAuditAllowsClose(overallStatus)"));
    assert.ok(note > body.indexOf("closedByThisRequest(persisted, closeRequestId)"));
    assert.equal((body.match(/\.update\(\{ notes: note \}\)/g) ?? []).length, 1);
    assert.match(functions, /summary, notes"/);
  });

  it("35. the next business date is shown correctly", () => {
    assert.deepEqual(closeTargetDates("2026-12-31"), { current: "2026-12-31", next: "2027-01-01" });
    assert.match(migration, /SET business_date = _run\.business_date \+ 1/);
    assert.match(closePanel, /Next business date/);
    assert.equal(NA1_CONFIRM_LABEL, "Close Business Date");
    assert.match(CLOSE_CONFIRM_COPY, /This action cannot be reversed from Night Audit\./);
    assert.doesNotMatch(closePanel + desk, /Close & Override|Open Next Business Date/);
  });
});

/* --------------------------------------------------------------- 36–40 */

describe("NA-P4 OTB", () => {
  const base = { businessDate: DATE, nextBusinessDate: NEXT, alreadyClosed: false };

  it("36. close + OTB success", () => {
    const view = closeResultView({ ...base, otbSnapshotStatus: "captured" });
    assert.equal(view.title, "Night Audit Complete");
    assert.equal(view.otb, "Captured");
    assert.equal(view.otbFailed, false);
    assert.equal(otbStatusLabel("already_present"), "Captured");
  });

  it("37–39. OTB failure keeps the close result and is visible", () => {
    const view = closeResultView({ ...base, otbSnapshotStatus: "failed" });
    assert.equal(view.newBusinessDate, NEXT);
    assert.equal(view.closedBusinessDate, DATE);
    assert.equal(view.otbFailed, true);
    assert.equal(view.otbNotice, "Business date advanced successfully. OTB snapshot failed.");
    assert.ok(nightAuditOtbNotice("failed"));
    assert.match(workspace, /nightAuditOtbNotice\(result\.otbSnapshotStatus\)/);
    assert.match(closePanel, /data-testid="night-audit-close-result-otb"/);
    const body = handler("closeBusinessDate");
    assert.match(body, /Never roll back a completed close/);
    const after = body.slice(body.indexOf('rpc("close_business_date"'));
    assert.doesNotMatch(after, /status: "failed"|\.update\(\{ status/);
  });

  it("40. retrying OTB never calls close again", () => {
    const retry = handler("retryNightAuditOtbSnapshot");
    assert.doesNotMatch(retry, /close_business_date/);
    assert.match(retry, /captureOtbAfterClose\(/);
    assert.equal(canRetryOtbSnapshot({ runStatus: "closed", runBusinessDate: DATE, persistedBusinessDate: NEXT }), true);
    assert.equal(canRetryOtbSnapshot({ runStatus: "closed", runBusinessDate: DATE, persistedBusinessDate: "2026-10-23" }), false);
    assert.equal(canRetryOtbSnapshot({ runStatus: "open", runBusinessDate: DATE, persistedBusinessDate: NEXT }), false);
    assert.equal((handler("closeBusinessDate").match(/rpc\("close_business_date"/g) ?? []).length, 1);
  });
});

/* --------------------------------------------------------------- 41–54 */

describe("NA-P4 History", () => {
  const body = handler("listNightAuditHistory");

  it("41–42. closed and open runs are listed from night_audit_runs", () => {
    assert.match(body, /\.from\("night_audit_runs"\)\s*\.select\(RUN_COLUMNS, \{ count: "exact" \}\)/);
    assert.equal(historyStatusLabel("closed"), "Closed");
    assert.equal(historyStatusLabel("open"), "Open");
  });

  it("43–44. failed renders safely and the status filter includes it", () => {
    assert.deepEqual([...HISTORY_STATUSES], ["open", "ready", "closed", "failed"]);
    assert.equal(historyStatusLabel("failed"), "Failed");
    assert.equal(historyStatusLabel("weird_state"), "Weird state");
    assert.match(body, /z\.enum\(\["all", "open", "ready", "closed", "failed"\]\)/);
    assert.match(history, /HISTORY_STATUSES\.map/);
    assert.doesNotMatch(functions, /status: "failed"/);
  });

  it("45. server pagination (10 / 25 / 50, default 25)", () => {
    assert.deepEqual([...HISTORY_PAGE_SIZES], [10, 25, 50]);
    assert.equal(DEFAULT_HISTORY_FILTER.pageSize, 25);
    assert.equal(parseHistoryPageSize("50"), 50);
    assert.equal(parseHistoryPageSize(100), 25);
    assert.deepEqual(historyRange(3, 10), { from: 20, to: 29, page: 3 });
    assert.deepEqual(historyRange(0, 25), { from: 0, to: 24, page: 1 });
    assert.match(body, /\.range\(range\.from, range\.to\)/);
    assert.match(workspace, /pageSize: historyFilter\.pageSize/);
    assert.deepEqual(historySearchDates("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
    assert.equal(historySearchDates("Abebe"), null);
  });

  it("46. run detail drawer reads the stored run", () => {
    assert.match(history, /data-testid="night-audit-run-detail"/);
    assert.match(workspace, /fetchRun\(\{ data: \{ restaurantId, runId: initialRunId \?\? "" \} \}\)/);
  });

  it("47. an old summary renders Not captured, not zero", () => {
    const old = { warnings: 1, inHouse: 4 };
    assert.equal(summaryCount(old, "financialBlockerCount"), null);
    assert.equal(formatSummaryCount(summaryCount(old, "financialBlockerCount")), "Not captured");
    assert.equal(summaryCount(null, "warnings"), null);
    assert.match(history, /typeof value === "number" \? String\(value\) : "—"/);
  });

  it("48–49. financial and operational counts come from the stored summary", () => {
    const stored = { financialBlockerCount: 0, financialWarningCount: 3, operationalBlockerCount: 0, operationalWarningCount: 2 };
    assert.equal(summaryCount(stored, "financialWarningCount"), 3);
    assert.equal(summaryCount(stored, "operationalWarningCount"), 2);
    assert.match(history, /run\.summary\?\.financialBlockerCount/);
    assert.match(history, /run\.summary\?\.operationalBlockerCount/);
  });

  it("50–52. closer, closed_at in property time, and note", () => {
    assert.match(functions, /closedBy: r\.closed_by_membership_id \? \(names\.get\(r\.closed_by_membership_id\) \?\? null\) : null/);
    assert.match(history, /run\.closedAt \? dateTime\(run\.closedAt\)/);
    assert.match(workspace, /const \{ dateTime, time \} = useRestaurantTime\(\)/);
    assert.match(functions, /notes: r\.notes \?\? null/);
    assert.match(history, /Audit note/);
  });

  it("53. exception history comes only from persisted rows", () => {
    const detail = handler("getNightAuditRun");
    assert.match(detail, /Persisted rows only/);
    assert.doesNotMatch(detail, /evaluateAudit|readFinancialReconciliation|readOperationalReconciliation|syncRunExceptions/);
  });

  it("54. OTB status is read from snapshot rows, never written into the summary", () => {
    assert.match(functions, /\.from\("hotel_revenue_otb_snapshots"\)\s*\.select\("as_of_business_date", \{ count: "exact", head: true \}\)/);
    assert.match(history, /OTB snapshot/);
  });

  it("empty, unavailable and filtered states stay distinct", () => {
    assert.match(history, /No runs yet\./);
    assert.match(history, /History unavailable/);
    assert.match(history, /No runs match filters\./);
    assert.equal(historyFiltersActive(DEFAULT_HISTORY_FILTER), false);
    assert.equal(historyFiltersActive({ ...DEFAULT_HISTORY_FILTER, status: "failed" }), true);
    assert.match(body, /throw nightAuditError\("Night Audit history is unavailable\."\)/);
  });
});

/* --------------------------------------------------------------- 55–59 */

describe("NA-P4 report links", () => {
  const links = nightAuditReportLinks(DATE);
  const byId = (id: string) => links.find((link) => link.id === id)!;

  it("55. Cashier Invoice uses from = to = closed business date", () => {
    assert.deepEqual(parseReportsRouteSearch(byId("cashier-invoice").search), {
      report: "cashier-invoice",
      from: DATE,
      to: DATE,
    });
  });

  it("56. Police / Guest Stay uses stayDate", () => {
    assert.deepEqual(parseReportsRouteSearch(byId("police").search), { report: "police", stayDate: DATE });
  });

  it("57. Meal Service uses serviceDate", () => {
    assert.deepEqual(parseReportsRouteSearch(byId("meal-service").search), { report: "meal-service", serviceDate: DATE });
  });

  it("58. Service Fulfillment uses serviceDate", () => {
    assert.deepEqual(parseReportsRouteSearch(byId("service-fulfillment").search), {
      report: "service-fulfillment",
      serviceDate: DATE,
    });
  });

  it("59. no wall-clock date substitution", () => {
    assert.deepEqual(nightAuditReportLinks(""), []);
    assert.deepEqual(nightAuditReportLinks("today"), []);
    const start = workflow.indexOf("export function nightAuditReportLinks");
    const fn = workflow.slice(start, workflow.indexOf("/* ---", start));
    assert.doesNotMatch(fn, /new Date|Date\.now|toISOString/);
    assert.match(history, /nightAuditReportLinks\(run\.businessDate\.slice\(0, 10\)\)/);
    assert.match(history, /run\.status === "closed" \? nightAuditReportLinks/);
  });
});

/* --------------------------------------------------------------- 60–65 */

describe("NA-P4 redaction", () => {
  const summary = {
    finance: { roomRevenue: 1200 },
    taxByCurrency: [{ currency: "ETB", tax: 150, serviceCharge: 100 }],
    warnings: 2,
    financialBlockerCount: 0,
    openDrawerCount: 1,
    operationalBlockerCount: 0,
    checks: [{ area: "Folios" }, { area: "Payments & Revenue" }, { area: "Rooms" }],
  };

  it("60–61. owner and manager see the full run summary", () => {
    assert.deepEqual(presentRunSummary(summary, "owner"), summary);
    assert.deepEqual(presentRunSummary(summary, "manager"), summary);
  });

  it("62. cashier sees financial detail per NA-P2", () => {
    assert.equal(canViewNightAuditFinancialDetail("cashier"), true);
    assert.deepEqual(presentRunSummary(summary, "cashier"), summary);
    assert.equal(presentExceptionMessage("open_folio_balance", "Folio 120.00", "cashier"), "Folio 120.00");
  });

  it("63. receptionist sees counts only", () => {
    const shown = presentRunSummary(summary, "receptionist") as Record<string, unknown>;
    assert.equal("finance" in shown, false);
    assert.equal("taxByCurrency" in shown, false);
    assert.equal(shown.financialBlockerCount, 0);
    assert.equal(shown.openDrawerCount, 1);
    assert.deepEqual(shown.checks, [{ area: "Rooms" }]);
    assert.equal(presentExceptionMessage("open_folio_balance", "Folio 120.00", "receptionist"), "Open folio balance · details hidden");
  });

  it("64. operational detail follows NA-P3", () => {
    assert.equal(canViewNightAuditOperationalDetail("receptionist"), true);
    assert.equal(canViewNightAuditOperationalDetail("cashier"), false);
    assert.equal(presentExceptionMessage("overstay", "Abebe Kebede · Room 101", "receptionist"), "Abebe Kebede · Room 101");
    assert.equal(presentExceptionMessage("overstay", "Abebe Kebede · Room 101", "cashier"), "Overstay · details hidden");
  });

  it("65. unauthorized responses carry no payment data", () => {
    assert.match(functions, /message: presentExceptionMessage\(row\.exception_type, row\.message, role\)/);
    assert.match(functions, /summary: presentRunSummary\(\(r\.summary as AuditSummary \| null\) \?\? null, role\)/);
    assert.match(functions, /finance: financialDetail \? evaluation\.finance : null/);
    assert.match(functions, /shifts: financialDetail \? evaluation\.shifts : \[\]/);
    assert.match(handler("getNightAuditRun"), /toException\(ex, me\.role\)/);
    assert.match(handler("listNightAuditRuns"), /toRunRow\(r, names, me\.role\)/);
  });
});

/* ------------------------------------------------- concurrent close */

/**
 * In-memory model of close_business_date (0115): an already-closed run is
 * returned unchanged; otherwise status, summary, closer and closed_at are set
 * once and the house date moves +1. The model drives the same pure helpers the
 * server uses to decide who closed the run.
 */
function fakeHouse() {
  const db = {
    businessDate: DATE,
    clock: 0,
    run: {
      business_date: DATE,
      status: "open",
      closed_at: null as string | null,
      closed_by_membership_id: null as string | null,
      summary: null as PersistedCloseRow["summary"],
      notes: null as string | null,
    },
    otb: new Map<string, number>(),
    rpcCalls: 0,
  };
  const rpc = (summary: NonNullable<PersistedCloseRow["summary"]>, membershipId: string): PersistedCloseRow => {
    db.rpcCalls += 1;
    if (db.run.status === "closed") return { ...db.run };
    if (db.businessDate !== db.run.business_date) throw new Error("STALE_BUSINESS_DATE");
    db.clock += 1;
    db.run = {
      ...db.run,
      status: "closed",
      summary,
      closed_by_membership_id: membershipId,
      closed_at: `2026-10-21T21:0${db.clock}:00.000Z`,
    };
    db.businessDate = NEXT;
    return { ...db.run };
  };
  const capture = (date: string) => {
    if (db.otb.has(date)) return "already_present" as const;
    db.otb.set(date, 1);
    return "captured" as const;
  };
  const close = (membershipId: string, note: string) => {
    const closeRequestId = randomUUID();
    const row = rpc({ nextBusinessDate: NEXT, warnings: 1, closeRequestId }, membershipId);
    const won = closedByThisRequest(row, closeRequestId);
    if (won && note && db.run.status === "closed" && db.run.summary?.closeRequestId === closeRequestId) {
      db.run.notes = note;
    }
    return { alreadyClosed: !won, ...persistedCloseFacts(row), otb: capture(row.business_date) };
  };
  return { db, close };
}

describe("NA-P4 concurrent close", () => {
  const body = handler("closeBusinessDate");

  it("1. the first close succeeds", () => {
    const house = fakeHouse();
    const first = house.close("owner-a", "Quiet night");
    assert.equal(first.alreadyClosed, false);
    assert.equal(first.closedByMembershipId, "owner-a");
    assert.equal(house.db.run.notes, "Quiet night");
    assert.equal(closeResultView({ ...first, otbSnapshotStatus: first.otb }).title, "Night Audit Complete");
  });

  it("2. the second close returns alreadyClosed = true", () => {
    const house = fakeHouse();
    house.close("owner-a", "");
    const second = house.close("manager-b", "");
    assert.equal(second.alreadyClosed, true);
    const view = closeResultView({ ...second, otbSnapshotStatus: second.otb });
    assert.equal(view.title, ALREADY_CLOSED_TITLE);
    assert.equal(ALREADY_CLOSED_COPY, "This business date was already closed.");
    assert.match(closePanel, /\{ALREADY_CLOSED_COPY\}/);
  });

  it("3. the second close does not advance the business date", () => {
    const house = fakeHouse();
    house.close("owner-a", "");
    const second = house.close("owner-a", "");
    assert.equal(house.db.businessDate, NEXT);
    assert.equal(second.nextBusinessDate, NEXT);
    assert.match(migration, /IF _run\.status = 'closed' THEN\s*RETURN _run;/);
  });

  it("4. the second close returns the original closer", () => {
    const house = fakeHouse();
    house.close("owner-a", "");
    const second = house.close("manager-b", "");
    assert.equal(second.closedByMembershipId, "owner-a");
    const after = body.slice(body.indexOf('rpc("close_business_date"'));
    assert.doesNotMatch(after, /staffNames\([^)]*\[me\.id\]/);
    assert.match(after, /closed\.closedByMembershipId/);
    assert.match(body, /facts\.closedByMembershipId/);
  });

  it("5. the second close returns the original closed_at", () => {
    const house = fakeHouse();
    const first = house.close("owner-a", "");
    const second = house.close("manager-b", "");
    assert.equal(second.closedAt, first.closedAt);
    assert.equal(house.db.run.closed_at, first.closedAt);
  });

  it("6. the second close does not overwrite the close note", () => {
    const house = fakeHouse();
    house.close("owner-a", "Winner note");
    house.close("manager-b", "Loser note");
    assert.equal(house.db.run.notes, "Winner note");
    const noteWrite = body.slice(body.indexOf(".update({ notes: note })"), body.indexOf(".update({ notes: note })") + 300);
    assert.match(noteWrite, /\.eq\("status", "closed"\)/);
    assert.match(noteWrite, /\.eq\("summary->>closeRequestId", closeRequestId\)/);
    assert.ok(body.indexOf(".update({ notes: note })") > body.indexOf('rpc("close_business_date"'));
  });

  it("7. concurrent callers cannot change closed_by_membership_id (same user double click included)", () => {
    const house = fakeHouse();
    const a = house.close("owner-a", "");
    const b = house.close("owner-a", "");
    const c = house.close("manager-b", "");
    assert.deepEqual([a.alreadyClosed, b.alreadyClosed, c.alreadyClosed], [false, true, true]);
    assert.equal(house.db.run.closed_by_membership_id, "owner-a");
    const row: PersistedCloseRow = { ...house.db.run };
    assert.equal(closedByThisRequest(row, "other-request"), false);
    assert.equal(closedByThisRequest(null, "any"), false);
    assert.equal(closedByThisRequest({ ...row, status: "open" }, row.summary!.closeRequestId!), false);
    assert.match(body, /closeRequestId,\r?\n\s*\};/);
    assert.match(body, /if \(!closedByThisRequest\(persisted, closeRequestId\)\) \{\s*if \(persisted\?\.status === "closed"\) return alreadyClosedResult\(persisted\);/);
    assert.doesNotMatch(functions, /\.update\(\{[^}]*closed_by_membership_id/);
  });

  it("8. OTB stays insert-once and idempotent", () => {
    const house = fakeHouse();
    const first = house.close("owner-a", "");
    const second = house.close("manager-b", "");
    assert.equal(first.otb, "captured");
    assert.equal(second.otb, "already_present");
    assert.equal(house.db.otb.size, 1);
    assert.match(body, /OTB capture is insert-once, so a retry reuses the existing snapshot/);
  });

  it("9. refresh after an already-closed response shows the persisted closed run", () => {
    assert.match(workspace, /if \(result\.alreadyClosed\) \{\s*setCloseNotice\(otbNotice\);\s*toast\.info\(ALREADY_CLOSED_COPY\);/);
    assert.match(workspace, /refreshAfterClose\(\);\s*\},\s*onError/);
    assert.match(functions, /\.eq\("status", "closed"\)\s*\.order\("business_date", \{ ascending: false \}\)/);
    assert.match(handler("getNightAuditRun"), /\.select\(RUN_COLUMNS\)/);
    assert.match(body, /const rejected = async \(message: string\) => \{\s*const latest = await readRun\(\);\s*if \(latest\?\.status === "closed"\) return alreadyClosedResult\(latest\);/);
    assert.match(body, /return rejected\(NA1_STALE_BUSINESS_DATE\)/);
  });

  it("10. a normal single close is unchanged", () => {
    const house = fakeHouse();
    const only = house.close("manager-b", "Checked");
    assert.equal(only.alreadyClosed, false);
    assert.equal(only.businessDate, DATE);
    assert.equal(only.nextBusinessDate, NEXT);
    assert.equal(only.warningCount, 1);
    assert.equal(house.db.rpcCalls, 1);
    assert.equal((body.match(/rpc\("close_business_date"/g) ?? []).length, 1);
    assert.match(body, /if \(error\) return \{ ok: false, message: nightAuditError\(error\.message\)\.message \}/);
  });
});

/* ---------------------------------------------------------- navigation */

describe("NA-P4 navigation", () => {
  it("final top-level workspaces and legacy aliases", () => {
    assert.deepEqual(
      NIGHT_AUDIT_TABS.map((tab) => tab.label),
      ["Control Center", "Financial", "Operations", "Exceptions", "Run & Close", "History"],
    );
    assert.equal(resolveNightAuditTab("pre-audit"), "operations");
    assert.equal(resolveNightAuditTab("reconciliation"), "financial");
    assert.deepEqual(nightAuditSearch("exceptions", null, "blockers"), { tab: "exceptions", focus: "blockers" });
    assert.equal(OVERALL_STATUS_LABEL.unavailable, "UNAVAILABLE");
  });
});
