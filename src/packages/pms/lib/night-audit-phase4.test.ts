import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { planExceptionSync, type ExceptionSyncExisting } from "./night-audit-exceptions.ts";
import {
  ALREADY_CLOSED_COPY,
  ALREADY_CLOSED_TITLE,
  FISCAL_OVERRIDEABLE_EXCEPTION_TYPES,
  FISCAL_OVERRIDE_REASON_CATEGORIES,
  closedByThisRequest,
  fiscalStatusForException,
  isActiveFiscalOverride,
  isFiscalOverrideableException,
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
const NOW = "2026-10-21T23:42:00.000Z";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const functions = read("./nightaudit.functions.ts");
const workflow = read("./night-audit-workflow.ts");
const desk = read("../components/nightaudit/night-audit-desk.tsx");
const queue = read("../components/nightaudit/night-audit-exception-queue.tsx");
const history = read("../components/nightaudit/night-audit-history.tsx");
const closePanel = read("../components/nightaudit/na1-panels.tsx");
const workspace = read("../components/workspaces/night-audit-workspace.tsx");
const migration = readFileSync(
  "supabase/migrations/0115_night_audit_phase0_close_guard.sql",
  "utf8",
);
const fiscalOverrideMigration = readFileSync(
  "supabase/migrations/0178_night_audit_fiscal_close_overrides.sql",
  "utf8",
);
const fiscalOverrideLifecycleMigration = readFileSync(
  "supabase/migrations/0179_night_audit_fiscal_override_lifecycle.sql",
  "utf8",
);

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
    const rows = [
      ex({ exceptionType: "overstay", severity: "blocking", referenceType: "room_unit" }),
    ];
    const meta = exceptionMeta(rows[0]!.exceptionType);
    assert.equal(meta.domain, "operations");
    assert.equal(meta.category, "departures");
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, domain: "operations" }).length,
      1,
    );
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, domain: "financial" }).length,
      0,
    );
  });

  it("3. a warning is visible and counted separately", () => {
    const rows = [
      ex({ severity: "warning" }),
      ex({ exceptionType: "overstay", severity: "blocking" }),
    ];
    assert.deepEqual(exceptionCounts(rows), {
      blocking: 1,
      warnings: 1,
      open: 2,
      resolved: 0,
      fiscalOverrides: 0,
    });
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, severity: "warning" }).length,
      1,
    );
  });

  it("4. a fixed source auto-resolves on recheck", () => {
    const plan = planExceptionSync([existing()], []);
    assert.deepEqual(plan.resolveIds, ["row-1"]);
    assert.equal(plan.inserts.length, 0);
    assert.match(
      functions,
      /resolution_note: "Cleared automatically — the underlying issue was fixed\."/,
    );
  });

  it("5. a returning condition reopens the same row (blocker and warning)", () => {
    const derived = [
      {
        exceptionType: "overstay",
        severity: "blocking" as const,
        referenceType: "room_unit",
        referenceId: "unit-1",
        message: "Room 101 overstay",
      },
    ];
    const blocker = planExceptionSync([existing({ status: "resolved" })], derived);
    assert.equal(blocker.inserts.length, 0);
    assert.deepEqual(
      blocker.updates.map((u) => [u.id, u.reopen]),
      [["row-1", true]],
    );

    const warning = planExceptionSync(
      [existing({ exceptionType: "pending_arrival", severity: "warning", status: "resolved" })],
      [{ ...derived[0]!, exceptionType: "pending_arrival", severity: "warning" }],
    );
    assert.equal(warning.updates[0]?.reopen, true);
    assert.match(functions, /status: "open", resolved_at: null, resolution_note: null/);
  });

  it("6. a duplicate recheck does not duplicate the row", () => {
    const derived = [
      {
        exceptionType: "overstay",
        severity: "blocking" as const,
        referenceType: "room_unit",
        referenceId: "unit-1",
        message: "Room 101 overstay",
      },
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
      assert.doesNotMatch(
        source,
        /updateException|Mark Fixed|Mark Resolved|Force Pass|Ignore Blocker|>Ignore</i,
      );
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
    assert.match(
      functions,
      /if \(!current \|\| !canSyncRunExceptions\(\(current as \{ status: string \}\)\.status\)\) return;/,
    );
    assert.match(handler("updateException"), /This run is closed\. Its exceptions are history\./);
  });

  it("10. filters: status, severity, domain, category, search", () => {
    const rows = [
      ex({ exceptionType: "open_cashier_shift", severity: "blocking", message: "Drawer A open" }),
      ex({ exceptionType: "pending_arrival", severity: "warning", message: "Abebe arriving" }),
      ex({ exceptionType: "fiscal_unregistered", severity: "warning", status: "resolved" }),
    ];
    assert.equal(filterExceptions(rows, DEFAULT_EXCEPTION_FILTER).length, 2);
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, status: "resolved" }).length,
      1,
    );
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, category: "drawers" }).length,
      1,
    );
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, status: "all", category: "fiscal" })
        .length,
      1,
    );
    assert.equal(
      filterExceptions(rows, { ...DEFAULT_EXCEPTION_FILTER, search: "abebe" }).length,
      1,
    );
    assert.equal(filterExceptions(rows, DEFAULT_EXCEPTION_FILTER)[0]?.severity, "blocking");
    assert.deepEqual(exceptionFilterForFocus("blockers"), {
      ...DEFAULT_EXCEPTION_FILTER,
      severity: "blocking",
    });
    for (const label of [
      'aria-label="Status"',
      'aria-label="Severity"',
      'aria-label="Domain"',
      'aria-label="Category"',
      'aria-label="Search exceptions"',
    ]) {
      assert.ok(queue.includes(label), label);
    }
    for (const column of [
      "Severity",
      "Category",
      "Issue",
      "Source",
      "Reference",
      "Status",
      "Opened",
      "Last checked",
      "Resolved at",
    ]) {
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
    assert.match(
      desk,
      /financialSummary\.status === "blocked"\) return onOpenFinancial\?\.\("blockers"\)/,
    );
  });

  it("14. blocked operations → Review First Blocker opens Operations", () => {
    assert.equal(overall({ operational: "blocked" }), "blocked");
    assert.match(
      desk,
      /operationalSummary\.status === "blocked"\) return onOpenOperations\?\.\("blockers"\)/,
    );
  });

  it("15. unavailable financial → Overall Unavailable and Retry Checks", () => {
    assert.equal(overall({ financial: "unavailable" }), "unavailable");
    assert.equal(
      effectiveOverallStatus({ server: "ready", financial: "unavailable", operational: "ready" }),
      "unavailable",
    );
    assert.equal(controlPrimaryAction("unavailable").label, "Retry Checks");
  });

  it("16. unavailable operations → Overall Unavailable", () => {
    assert.equal(overall({ operational: "unavailable" }), "unavailable");
    assert.equal(
      effectiveOverallStatus({ server: "warning", financial: "ready", operational: "unavailable" }),
      "unavailable",
    );
    assert.equal(
      effectiveOverallStatus({ server: "closed", financial: "unavailable", operational: "ready" }),
      "closed",
    );
    assert.equal(
      effectiveOverallStatus({ server: "warning", financial: "loading", operational: "ready" }),
      "warning",
    );
  });

  it("17. Control Center counts come from the same Financial and Operations reads", () => {
    assert.match(workspace, /blockerCount: financialQuery\.data\.summary\.blockerCount/);
    assert.match(workspace, /operationsQuery\.data\.summary\.blockerCount/);
    assert.match(workspace, /openDrawerCount: financialQuery\.data\.summary\.openDrawerCount/);
    for (const label of [
      "Financial blockers",
      "Financial warnings",
      "Operational blockers",
      "Operational warnings",
      "Open exceptions",
      "Open drawers",
    ]) {
      assert.ok(desk.includes(label), label);
    }
    assert.match(desk, /data-testid="night-audit-financial-kpis"/);
    assert.match(desk, /data-testid="night-audit-operations-kpis"/);
    assert.doesNotMatch(desk, /NaClosePanel[\s\S]{0,40}tab === "control"/);
  });

  it("18. Refresh rechecks every loader and never writes from the client", () => {
    assert.match(
      workspace,
      /auditQuery\.refetch\(\),\s*financialQuery\.refetch\(\),\s*operationsQuery\.refetch\(\)/,
    );
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
    assert.match(
      functions,
      /previousBusinessDate:\s*lastClosedRaw\.summary\?\.previousBusinessDate \?\? lastClosedRaw\.business_date/,
    );
    assert.deepEqual(closeTargetDates(DATE), { current: DATE, next: NEXT });
  });
});

/* --------------------------------------------------------------- 21–35 */

describe("NA-P4 Run & Close", () => {
  it("21. warning-only allows close", () => {
    const gate = closeGate({
      ...READY_GATE,
      overall: "warning",
      financial: "warning",
      operational: "warning",
    });
    assert.equal(gate.enabled, true);
    assert.match(gate.reason, /warnings do not block/);
  });

  it("22. a financial blocker prevents close", () => {
    assert.equal(
      closeGate({ ...READY_GATE, overall: "blocked", financial: "blocked" }).enabled,
      false,
    );
  });

  it("23. an operational blocker prevents close", () => {
    assert.equal(
      closeGate({ ...READY_GATE, overall: "blocked", operational: "blocked" }).enabled,
      false,
    );
    assert.equal(closeGate({ ...READY_GATE, openBlockingExceptions: 1 }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, boardBlockers: 1 }).enabled, false);
  });

  it("24. unavailable prevents close", () => {
    assert.equal(closeGate({ ...READY_GATE, financial: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, operational: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, overall: "unavailable" }).enabled, false);
    assert.equal(closeGate({ ...READY_GATE, financial: "loading" }).enabled, false);
    assert.equal(
      closeGate({ ...READY_GATE, rechecked: false }).reason,
      "Run Final Recheck before closing.",
    );
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
    for (let i = 1; i < order.length; i += 1)
      assert.ok(order[i - 1]! >= 0 && order[i - 1]! < order[i]!, `step ${i}`);
  });

  it("26. a blocker appearing between page load and click rejects the close", () => {
    const body = handler("closeBusinessDate");
    assert.match(body, /!financialAllowsClose\(closeFinancialStatus\)/);
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
    assert.match(
      handler("closeBusinessDate"),
      /const me = await requireCashierManager\(context as never, data\.restaurantId\);/,
    );
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
    assert.equal(
      canRetryOtbSnapshot({
        runStatus: "closed",
        runBusinessDate: DATE,
        persistedBusinessDate: NEXT,
      }),
      true,
    );
    assert.equal(
      canRetryOtbSnapshot({
        runStatus: "closed",
        runBusinessDate: DATE,
        persistedBusinessDate: "2026-10-23",
      }),
      false,
    );
    assert.equal(
      canRetryOtbSnapshot({
        runStatus: "open",
        runBusinessDate: DATE,
        persistedBusinessDate: NEXT,
      }),
      false,
    );
    assert.equal(
      (handler("closeBusinessDate").match(/rpc\("close_business_date"/g) ?? []).length,
      1,
    );
  });
});

/* --------------------------------------------------------------- 41–54 */

describe("NA-P4 History", () => {
  const body = handler("listNightAuditHistory");

  it("41–42. closed and open runs are listed from night_audit_runs", () => {
    assert.match(
      body,
      /\.from\("night_audit_runs"\)\s*\.select\(RUN_COLUMNS, \{ count: "exact" \}\)/,
    );
    assert.equal(historyStatusLabel("closed"), "Closed");
    assert.equal(historyStatusLabel("open"), "Open");
  });

  it("43–44. terminal failed and superseded runs render safely and remain filterable", () => {
    assert.deepEqual([...HISTORY_STATUSES], ["open", "ready", "closed", "failed", "superseded"]);
    assert.equal(historyStatusLabel("failed"), "Failed");
    assert.equal(historyStatusLabel("superseded"), "Superseded");
    assert.equal(historyStatusLabel("weird_state"), "Weird state");
    assert.match(body, /z\.enum\(\["all", "open", "ready", "closed", "failed", "superseded"\]\)/);
    assert.match(history, /HISTORY_STATUSES\.map/);
    assert.doesNotMatch(functions, /status: "failed"\s*\}/);
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
    assert.match(
      workspace,
      /fetchRun\(\{ data: \{ restaurantId, runId: initialRunId \?\? "" \} \}\)/,
    );
  });

  it("47. an old summary renders Not captured, not zero", () => {
    const old = { warnings: 1, inHouse: 4 };
    assert.equal(summaryCount(old, "financialBlockerCount"), null);
    assert.equal(formatSummaryCount(summaryCount(old, "financialBlockerCount")), "Not captured");
    assert.equal(summaryCount(null, "warnings"), null);
    assert.match(history, /typeof value === "number" \? String\(value\) : "—"/);
  });

  it("48–49. financial and operational counts come from the stored summary", () => {
    const stored = {
      financialBlockerCount: 0,
      financialWarningCount: 3,
      operationalBlockerCount: 0,
      operationalWarningCount: 2,
    };
    assert.equal(summaryCount(stored, "financialWarningCount"), 3);
    assert.equal(summaryCount(stored, "operationalWarningCount"), 2);
    assert.match(history, /run\.summary\?\.financialBlockerCount/);
    assert.match(history, /run\.summary\?\.operationalBlockerCount/);
  });

  it("50–52. closer, closed_at in property time, and note", () => {
    assert.match(
      functions,
      /closedBy: r\.closed_by_membership_id \? \(names\.get\(r\.closed_by_membership_id\) \?\? null\) : null/,
    );
    assert.match(history, /run\.closedAt \? dateTime\(run\.closedAt\)/);
    assert.match(workspace, /const \{ dateTime, time \} = useRestaurantTime\(\)/);
    assert.match(functions, /notes: r\.notes \?\? null/);
    assert.match(history, /Audit note/);
  });

  it("53. exception history comes only from persisted rows", () => {
    const detail = handler("getNightAuditRun");
    assert.match(detail, /Persisted rows only/);
    assert.doesNotMatch(
      detail,
      /evaluateAudit|readFinancialReconciliation|readOperationalReconciliation|syncRunExceptions/,
    );
  });

  it("54. OTB status is read from snapshot rows, never written into the summary", () => {
    assert.match(
      functions,
      /\.from\("hotel_revenue_otb_snapshots"\)\s*\.select\("as_of_business_date", \{ count: "exact", head: true \}\)/,
    );
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
    assert.deepEqual(parseReportsRouteSearch(byId("police").search), {
      report: "police",
      stayDate: DATE,
    });
  });

  it("57. Meal Service uses serviceDate", () => {
    assert.deepEqual(parseReportsRouteSearch(byId("meal-service").search), {
      report: "meal-service",
      serviceDate: DATE,
    });
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
    assert.equal(
      presentExceptionMessage("open_folio_balance", "Folio 120.00", "cashier"),
      "Folio 120.00",
    );
  });

  it("63. receptionist sees counts only", () => {
    const shown = presentRunSummary(summary, "receptionist") as Record<string, unknown>;
    assert.equal("finance" in shown, false);
    assert.equal("taxByCurrency" in shown, false);
    assert.equal(shown.financialBlockerCount, 0);
    assert.equal(shown.openDrawerCount, 1);
    assert.deepEqual(shown.checks, [{ area: "Rooms" }]);
    assert.equal(
      presentExceptionMessage("open_folio_balance", "Folio 120.00", "receptionist"),
      "Open folio balance · details hidden",
    );
  });

  it("64. operational detail follows NA-P3", () => {
    assert.equal(canViewNightAuditOperationalDetail("receptionist"), true);
    assert.equal(canViewNightAuditOperationalDetail("cashier"), false);
    assert.equal(
      presentExceptionMessage("overstay", "Abebe Kebede · Room 101", "receptionist"),
      "Abebe Kebede · Room 101",
    );
    assert.equal(
      presentExceptionMessage("overstay", "Abebe Kebede · Room 101", "cashier"),
      "Overstay · details hidden",
    );
  });

  it("65. unauthorized responses carry no payment data", () => {
    assert.match(
      functions,
      /message: presentExceptionMessage\(row\.exception_type, row\.message, role\)/,
    );
    assert.match(
      functions,
      /summary: presentRunSummary\(\(r\.summary as AuditSummary \| null\) \?\? null, role\)/,
    );
    assert.match(functions, /finance: financialDetail \? evaluation\.finance : null/);
    assert.match(functions, /shifts: financialDetail \? evaluation\.shifts : \[\]/);
    assert.match(
      handler("getNightAuditRun"),
      /toException\(ex, me\.role, new Map\(\), overrides, overrideNames, history\)/,
    );
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
  const rpc = (
    summary: NonNullable<PersistedCloseRow["summary"]>,
    membershipId: string,
  ): PersistedCloseRow => {
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
    if (
      won &&
      note &&
      db.run.status === "closed" &&
      db.run.summary?.closeRequestId === closeRequestId
    ) {
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
    assert.equal(
      closeResultView({ ...first, otbSnapshotStatus: first.otb }).title,
      "Night Audit Complete",
    );
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
    const noteWrite = body.slice(
      body.indexOf(".update({ notes: note })"),
      body.indexOf(".update({ notes: note })") + 300,
    );
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
    assert.equal(
      closedByThisRequest({ ...row, status: "open" }, row.summary!.closeRequestId!),
      false,
    );
    assert.match(
      body,
      /closeRequestId,\r?\n\s*nightAuditWindow: outsideWindowCloseRecord\(.*\),\r?\n\s*\};/,
    );
    assert.match(
      body,
      /if \(!closedByThisRequest\(persisted, closeRequestId\)\) \{\s*if \(persisted\?\.status === "closed"\) return alreadyClosedResult\(persisted\);/,
    );
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
    assert.match(
      workspace,
      /if \(result\.alreadyClosed\) \{\s*setCloseNotice\(otbNotice\);\s*toast\.info\(ALREADY_CLOSED_COPY\);/,
    );
    assert.match(workspace, /refreshAfterClose\(\);\s*\},\s*onError/);
    assert.match(
      functions,
      /\.eq\("status", "closed"\)\s*\.order\("business_date", \{ ascending: false \}\)/,
    );
    assert.match(handler("getNightAuditRun"), /\.select\(RUN_COLUMNS\)/);
    assert.match(
      body,
      /const rejected = async \(message: string\) => \{\s*const latest = await readRun\(\);\s*if \(latest\?\.status === "closed"\) return alreadyClosedResult\(latest\);/,
    );
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
    assert.match(
      body,
      /if \(error\) return \{ ok: false, message: nightAuditError\(error\.message\)\.message \}/,
    );
  });
});

/* ---------------------------------------------------------- navigation */

describe("NA-P4 fiscal close override", () => {
  const authorize = handler("authorizeFiscalCloseOverride");
  const fiscal = ex({
    exceptionType: "fiscal_failed",
    severity: "blocking",
    status: "open",
    referenceId: "doc-1",
  });

  it("1–5. only owner and manager see/use the fiscal-only action", () => {
    assert.equal(isFiscalOverrideableException(fiscal), true);
    assert.deepEqual(
      [...FISCAL_OVERRIDEABLE_EXCEPTION_TYPES],
      ["fiscal_failed", "fiscal_cancel_pending", "fiscal_not_registered", "fiscal_blocked"],
    );
    assert.ok(
      !(FISCAL_OVERRIDEABLE_EXCEPTION_TYPES as readonly string[]).includes("fiscal_unrecognized"),
    );
    assert.match(queue, /Authorize Fiscal Close Override/);
    assert.match(queue, /role === "owner" \|\| role === "manager"/);
    assert.match(authorize, /requireCashierManager/);
    assert.doesNotMatch(queue, /Override Blocker/);
  });

  it("6–10. canonical fiscal blockers require a reason and stop blocking only after authorization", () => {
    assert.equal(fiscalStatusForException("fiscal_failed"), "FAILED");
    assert.equal(fiscalStatusForException("fiscal_not_registered"), "NOT_REGISTERED");
    assert.match(
      authorize,
      /reason: z\.string\(\)\.trim\(\)\.min\(1, "An override reason is required\."\)\.max\(500\)/,
    );
    const overridden = [
      {
        ...fiscal,
        fiscalOverride: {
          id: "override-1",
          fiscalStatus: "FAILED",
          fiscalReference: "INV-1045",
          reason: "Device offline",
          reasonCategory: "fiscal_device_offline" as const,
          overriddenBy: "Manager A",
          overriddenAt: NOW,
          invalidatedAt: null,
          invalidatedReason: null,
        },
      },
    ];
    assert.equal(exceptionCounts(overridden).blocking, 0);
    assert.equal(exceptionCounts(overridden).fiscalOverrides, 1);
    assert.equal(overridden[0]!.fiscalOverride?.fiscalStatus, "FAILED");
    assert.match(functions, /effectiveFinancialStatus/);
    assert.match(functions, /!financialAllowsClose\(closeFinancialStatus\)/);
  });

  it("11–14. override stays visible in Exceptions, Financial, Run/Close, and History", () => {
    assert.match(queue, /data-testid="night-audit-fiscal-override"/);
    assert.match(queue, /Fiscal status remains \{row\.fiscalOverride\.fiscalStatus\}/);
    assert.match(
      read("../components/nightaudit/night-audit-financial-panel.tsx"),
      /Night Audit Override/,
    );
    assert.match(desk, /Fiscal overrides/);
    assert.match(history, /Fiscal Override/);
  });

  it("15–20. no other blocker and no unavailable read can be overridden", () => {
    for (const row of [
      ex({ exceptionType: "closed_folio_nonzero_balance", severity: "blocking" }),
      ex({ exceptionType: "allocation_exceeds_source", severity: "blocking" }),
      ex({ exceptionType: "arrival_not_processed", severity: "blocking" }),
      ex({ exceptionType: "room_double_occupancy", severity: "blocking" }),
      ex({ exceptionType: "open_folio_balance", severity: "warning" }),
    ]) {
      assert.equal(isFiscalOverrideableException(row), false, row.exceptionType);
    }
    assert.equal(isFiscalOverrideableException({ ...fiscal, status: "resolved" }), false);
    assert.match(
      authorize,
      /Only an open canonical fiscal blocker can receive a fiscal close override\./,
    );
    assert.doesNotMatch(authorize, /unavailable.*override/i);
  });

  it("21–23. server rejects unauthorized, cross-property, stale, and closed-run changes", () => {
    assert.match(authorize, /requireCashierManager\(context as never, data\.restaurantId\)/);
    assert.match(authorize, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(authorize, /Closed Night Audit runs cannot be modified\./);
    assert.match(authorize, /property\.businessDate !== runRow\.business_date\.slice\(0, 10\)/);
    assert.doesNotMatch(
      authorize,
      /property\.persistedBusinessDate !== runRow\.business_date\.slice\(0, 10\)/,
    );
  });

  it("24–27. close still rechecks and never writes or retries fiscal documents", () => {
    const close = handler("closeBusinessDate");
    assert.ok(
      close.indexOf("readFinancialReconciliation(") < close.indexOf('rpc("close_business_date"'),
    );
    assert.match(close, /await syncRunExceptions/);
    assert.match(close, /fiscalOverridesForRun/);
    assert.doesNotMatch(authorize + close, /fiscal.*retry|registerFiscal|fiscal.*update/i);
    assert.match(fiscalOverrideMigration, /night_audit_fiscal_overrides/);
    assert.match(
      fiscalOverrideMigration,
      /NOT EXISTS \(\s*SELECT 1\s*FROM public\.night_audit_fiscal_overrides/,
    );
    assert.match(
      fiscalOverrideMigration,
      /UPDATE public\.restaurants\s*SET business_date = _run\.business_date \+ 1/,
    );
    assert.deepEqual(
      [...FISCAL_OVERRIDE_REASON_CATEGORIES],
      [
        "fiscal_device_offline",
        "hardware_failure",
        "network_failure",
        "fiscal_authority_unavailable",
        "integration_failure",
        "vendor_support_pending",
        "other",
      ],
    );
  });
});

/**
 * In-memory model mirroring the lifecycle implemented in syncRunExceptions +
 * fiscalOverridesForRun: an override is valid only for the exact exception
 * occurrence it was authorized for. The source condition resolving
 * invalidates the active override; reopening never reactivates a historical
 * row, and a new authorization creates a brand new row (never overwrites
 * the old one), matching the partial unique index (at most one ACTIVE row
 * per exception).
 */
function fakeFiscalHouse() {
  const exceptionStatus = new Map<string, "open" | "resolved">();
  const overrides: Array<{
    id: string;
    exceptionId: string;
    reason: string;
    overriddenBy: string;
    invalidatedAt: string | null;
    invalidatedReason: string | null;
  }> = [];
  let seq = 0;

  return {
    overrides,
    /** Mirrors planExceptionSync + syncRunExceptions for one fiscal exception row. */
    recheck(exceptionId: string, conditionPresent: boolean) {
      const was = exceptionStatus.get(exceptionId);
      if (conditionPresent) {
        exceptionStatus.set(exceptionId, "open");
        return;
      }
      if (was === "open") {
        exceptionStatus.set(exceptionId, "resolved");
        for (const o of overrides) {
          if (o.exceptionId === exceptionId && o.invalidatedAt === null) {
            o.invalidatedAt = "2026-10-21T23:45:00.000Z";
            o.invalidatedReason = "Source fiscal condition resolved.";
          }
        }
      }
    },
    /** Mirrors authorizeFiscalCloseOverride: rejects unless open, and is idempotent under a race. */
    authorize(
      exceptionId: string,
      by: string,
      reason: string,
    ): { ok: true } | { ok: false; message: string } {
      if (exceptionStatus.get(exceptionId) !== "open") {
        return {
          ok: false,
          message: "Only an open canonical fiscal blocker can receive a fiscal close override.",
        };
      }
      if (overrides.some((o) => o.exceptionId === exceptionId && o.invalidatedAt === null)) {
        return { ok: true }; // duplicate-key race: the winning override is kept, not replaced.
      }
      seq += 1;
      overrides.push({
        id: `override-${seq}`,
        exceptionId,
        reason,
        overriddenBy: by,
        invalidatedAt: null,
        invalidatedReason: null,
      });
      return { ok: true };
    },
    activeOverride(exceptionId: string) {
      return (
        overrides.find((o) => o.exceptionId === exceptionId && o.invalidatedAt === null) ?? null
      );
    },
    historyFor(exceptionId: string) {
      return overrides.filter((o) => o.exceptionId === exceptionId);
    },
    isBlocking(exceptionId: string) {
      return (
        exceptionStatus.get(exceptionId) === "open" && this.activeOverride(exceptionId) === null
      );
    },
  };
}

describe("NA-P4 fiscal override lifecycle", () => {
  it("1–15. an override is valid only for its own exception occurrence; reopen requires a fresh authorization", () => {
    const house = fakeFiscalHouse();
    const exceptionId = "ex-fiscal-1";

    // 1. fiscal blocker appears
    house.recheck(exceptionId, true);
    assert.equal(house.isBlocking(exceptionId), true);

    // 2. Owner authorizes override
    const first = house.authorize(exceptionId, "Owner A", "Fiscal machine offline");
    assert.deepEqual(first, { ok: true });

    // 3. active override suppresses blocker
    assert.equal(house.activeOverride(exceptionId)?.overriddenBy, "Owner A");
    assert.equal(house.isBlocking(exceptionId), false);

    // 4–5. source condition resolves -> exception auto-resolves
    house.recheck(exceptionId, false);

    // 6. active override gets invalidated
    assert.equal(house.activeOverride(exceptionId), null);
    assert.equal(house.historyFor(exceptionId)[0]?.invalidatedAt, "2026-10-21T23:45:00.000Z");
    assert.equal(
      house.historyFor(exceptionId)[0]?.invalidatedReason,
      "Source fiscal condition resolved.",
    );

    // 7. historical override remains stored
    assert.equal(house.historyFor(exceptionId).length, 1);
    assert.equal(house.historyFor(exceptionId)[0]?.id, "override-1");

    // 8–9. source condition returns -> same exception row reopens
    house.recheck(exceptionId, true);

    // 10. old override remains invalidated
    assert.equal(house.historyFor(exceptionId)[0]?.invalidatedAt, "2026-10-21T23:45:00.000Z");

    // 11. reopened exception blocks again
    assert.equal(house.isBlocking(exceptionId), true);
    assert.equal(house.activeOverride(exceptionId), null);

    // 12. Owner/Manager sees override action again (nothing active blocks a fresh authorize call)
    const second = house.authorize(exceptionId, "Manager B", "Device failed again");
    assert.deepEqual(second, { ok: true });

    // 13–14. second authorization creates a new override row that is the only active one
    assert.equal(house.historyFor(exceptionId).length, 2);
    assert.equal(house.activeOverride(exceptionId)?.id, "override-2");
    assert.equal(house.activeOverride(exceptionId)?.overriddenBy, "Manager B");
    assert.equal(house.isBlocking(exceptionId), false);

    // 15. both override events remain in history
    assert.deepEqual(
      house.historyFor(exceptionId).map((o) => o.id),
      ["override-1", "override-2"],
    );
    assert.equal(house.historyFor(exceptionId)[0]?.invalidatedAt !== null, true);
    assert.equal(house.historyFor(exceptionId)[1]?.invalidatedAt, null);

    // Matches the exported active/invalidated predicate.
    assert.equal(isActiveFiscalOverride({ invalidatedAt: null }), true);
    assert.equal(isActiveFiscalOverride({ invalidatedAt: "2026-10-21T23:45:00.000Z" }), false);
  });

  it("16–20. the close gate counts only the active override, in the app and in the database", () => {
    const house = fakeFiscalHouse();
    const exceptionId = "ex-fiscal-2";
    house.recheck(exceptionId, true);
    house.authorize(exceptionId, "Owner A", "Device offline");

    // 16. active override allows the fiscal blocker to be excluded from the blocking count
    assert.equal(house.isBlocking(exceptionId), false);

    // 17. invalidated override does not suppress the blocker
    house.recheck(exceptionId, false); // resolves + invalidates
    house.recheck(exceptionId, true); // reopens with no active override
    assert.equal(house.isBlocking(exceptionId), true);

    // 18. the reopened fiscal exception prevents close
    assert.equal(
      [exceptionId].some((id) => house.isBlocking(id)),
      true,
    );

    // 19. a fresh second override permits close again
    house.authorize(exceptionId, "Manager B", "Device failed again");
    assert.equal(house.isBlocking(exceptionId), false);

    // 20. close_business_date (0179) follows the same active-override rule at the database level
    assert.match(
      fiscalOverrideLifecycleMigration,
      /NOT EXISTS \(\s*SELECT 1\s*FROM public\.night_audit_fiscal_overrides o\s*WHERE o\.exception_id = e\.id\s*AND o\.restaurant_id = _restaurant_id\s*AND o\.night_audit_run_id = _run\.id\s*AND o\.invalidated_at IS NULL\s*\)/,
    );
    assert.match(functions, /\.is\("invalidated_at", null\)/);
  });

  it("21–26. fiscal_unrecognized remains a hard blocker and is never overrideable", () => {
    const unrecognized = ex({
      exceptionType: "fiscal_unrecognized",
      severity: "blocking",
      status: "open",
    });

    // 21. fiscal_unrecognized remains a blocker
    assert.equal(exceptionCounts([unrecognized]).blocking, 1);

    // 22–23. Owner/Manager do not get the override action for it
    assert.equal(isFiscalOverrideableException(unrecognized), false);
    assert.doesNotMatch(FISCAL_OVERRIDEABLE_EXCEPTION_TYPES.join(","), /fiscal_unrecognized/);

    // 24. direct server authorization is rejected the same way as any non-overrideable fiscal issue
    assert.match(
      handler("authorizeFiscalCloseOverride"),
      /Only an open canonical fiscal blocker can receive a fiscal close override\./,
    );

    // 25. fiscal_unrecognized still appears in Financial (never silently dropped) —
    // removing override eligibility never touches financial reconciliation itself.
    assert.match(read("./night-audit-financial.ts"), /"fiscal_unrecognized"/);
    assert.doesNotMatch(
      workflow.slice(workflow.indexOf("fiscalStatusForException")),
      /"fiscal_unrecognized"/,
    );

    // 26. it still prevents close (no override can exempt it)
    assert.equal(exceptionCounts([unrecognized]).blocking, 1);
  });

  it("27–33. non-fiscal, security, and concurrency guarantees are unchanged", () => {
    // 27. non-fiscal blocker remains non-overrideable
    assert.equal(
      isFiscalOverrideableException(
        ex({ exceptionType: "room_double_occupancy", severity: "blocking" }),
      ),
      false,
    );

    // 28–30. unauthorized role, cross-property, and closed-run rejections stay enforced server-side
    const authorize = handler("authorizeFiscalCloseOverride");
    assert.match(authorize, /requireCashierManager\(context as never, data\.restaurantId\)/);
    assert.match(authorize, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(authorize, /Closed Night Audit runs cannot be modified\./);

    // 31. historical invalidated overrides remain visible in History
    assert.match(history, /fiscalOverrideHistory/);
    assert.match(history, /invalidatedAt/);
    assert.match(history, /Invalidated:/);

    // 32. current-state UI (Exceptions/Financial/Control Center) reads only the active override
    assert.match(functions, /ACTIVE override only — never an invalidated one\./);
    assert.match(functions, /\.is\("invalidated_at", null\)/);

    // 33. concurrent override attempts leave exactly one active override
    assert.match(
      fiscalOverrideLifecycleMigration,
      /CREATE UNIQUE INDEX night_audit_fiscal_overrides_active_exception_idx/,
    );
    assert.match(fiscalOverrideLifecycleMigration, /WHERE invalidated_at IS NULL/);
    assert.match(functions, /duplicate key/i);
  });
});

describe("NA-P4 navigation", () => {
  it("final top-level workspaces and legacy aliases", () => {
    assert.deepEqual(
      NIGHT_AUDIT_TABS.map((tab) => tab.label),
      ["Control Center", "Financial", "Operations", "Exceptions", "Run & Close", "History"],
    );
    assert.equal(resolveNightAuditTab("pre-audit"), "operations");
    assert.equal(resolveNightAuditTab("reconciliation"), "financial");
    assert.deepEqual(nightAuditSearch("exceptions", null, "blockers"), {
      tab: "exceptions",
      focus: "blockers",
    });
    assert.equal(OVERALL_STATUS_LABEL.unavailable, "UNAVAILABLE");
  });
});
