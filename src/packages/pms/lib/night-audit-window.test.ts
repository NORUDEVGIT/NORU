import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  NIGHT_AUDIT_OUTSIDE_WINDOW,
  OWNER_OUTSIDE_WINDOW_COPY,
  canBypassNightAuditWindow,
  evaluateNightAuditWindow,
  isWithinNightAuditWindow,
  nightAuditWindowConfig,
  outsideWindowCloseRecord,
  parseWindowTime,
  propertyLocalMinutes,
} from "./night-audit-window.ts";
import { closeGate, type CloseGateInput } from "./night-audit-workflow.ts";
import {
  BUSINESS_DATE_ACTIVE_RUN_MESSAGE,
  BUSINESS_DATE_ADJUST_WARNING,
  BUSINESS_DATE_NORMAL_COPY,
  BUSINESS_DATE_STALE_MESSAGE,
  businessDateAdjustmentError,
  businessDateAdjustmentProblem,
  canAdjustBusinessDate,
  isValidBusinessDate,
} from "./business-date-recovery.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const functionsSrc = read("./nightaudit.functions.ts");
const windowSrc = read("./night-audit-window.ts");
const recoveryFnSrc = read("./business-date-recovery.functions.ts");
const migration = read("../../../../supabase/migrations/0184_business_date_adjustments.sql");
const recoveryLifecycleMigration = read(
  "../../../../supabase/migrations/0185_business_date_recovery_superseded_runs.sql",
);
const closeMigration = read(
  "../../../../supabase/migrations/0179_night_audit_fiscal_override_lifecycle.sql",
);
const panelsSrc = read("../components/nightaudit/na1-panels.tsx");
const dialogSrc = read("../components/settings/business-date-recovery-dialog.tsx");
const stepsSrc = read("../components/settings/pms-property-setup-card1-steps.tsx");
const card1FnSrc = read("./pms-property-setup-card1.functions.ts");
const card1Src = read("./pms-property-setup-card1.ts");

function closeHandler(): string {
  const start = functionsSrc.indexOf("export const closeBusinessDate");
  const end = functionsSrc.indexOf("export const retryNightAuditOtbSnapshot");
  return functionsSrc.slice(start, end);
}

/** A UTC instant whose wall clock in UTC is hh:mm on 2026-10-25. */
const utcAt = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 25, hh, mm));

const OVERNIGHT = { start: "23:00", end: "04:00", timezone: "UTC" };

function ready(window: CloseGateInput["window"], extra: Partial<CloseGateInput> = {}) {
  return closeGate({
    overall: "ready",
    financial: "ready",
    operational: "ready",
    openBlockingExceptions: 0,
    boardBlockers: 0,
    canClose: true,
    busy: false,
    runStatus: "open",
    rechecked: true,
    window,
    ...extra,
  });
}

describe("Night Audit Window", () => {
  it("1. manager inside the window may close when ready", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "manager", now: utcAt(23, 30) });
    assert.equal(w.open, true);
    assert.equal(ready(w).enabled, true);
  });

  it("2. manager before the window cannot close", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "manager", now: utcAt(22, 59) });
    assert.equal(w.allowsClose, false);
    const gate = ready(w);
    assert.equal(gate.enabled, false);
    assert.equal(gate.reason, "Night Audit can be closed between 11:00 PM and 4:00 AM.");
  });

  it("3. manager after the window cannot close", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "manager", now: utcAt(4, 0) });
    assert.equal(w.allowsClose, false);
    assert.equal(ready(w).enabled, false);
  });

  it("4. owner inside the window may close", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(1, 0) });
    assert.equal(w.open, true);
    assert.equal(w.ownerBypass, false);
    assert.equal(ready(w).enabled, true);
  });

  it("5. owner before the window may close when ready", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(18, 0) });
    assert.equal(w.open, false);
    assert.equal(w.ownerBypass, true);
    assert.equal(ready(w).enabled, true);
    assert.match(panelsSrc, /OWNER_OUTSIDE_WINDOW_COPY/);
    assert.equal(
      OWNER_OUTSIDE_WINDOW_COPY,
      "Owner access: closing outside the configured Night Audit window.",
    );
  });

  it("6. owner after the window may close when ready", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(9, 0) });
    assert.equal(w.ownerBypass, true);
    assert.equal(ready(w).enabled, true);
  });

  it("7. owner outside the window is still blocked by a financial blocker", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(12, 0) });
    assert.equal(ready(w, { financial: "blocked", overall: "blocked" }).enabled, false);
    const handler = closeHandler();
    assert.ok(
      handler.indexOf("!closeWindow.allowsClose") <
        handler.indexOf("!financialAllowsClose(closeFinancialStatus)"),
    );
  });

  it("8. owner outside the window is still blocked by an operational blocker", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(12, 0) });
    assert.equal(ready(w, { operational: "blocked", overall: "blocked" }).enabled, false);
    assert.equal(ready(w, { boardBlockers: 1 }).enabled, false);
    assert.equal(ready(w, { openBlockingExceptions: 1 }).enabled, false);
    assert.equal(ready(w, { rechecked: false }).enabled, false);
    assert.ok(closeHandler().indexOf("!operationalAllowsClose(operational.result.status)") > 0);
  });

  it("9. owner outside the window is still blocked when reconciliation is unavailable", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(12, 0) });
    assert.equal(ready(w, { financial: "unavailable" }).enabled, false);
    assert.equal(ready(w, { operational: "unavailable" }).enabled, false);
    const handler = closeHandler();
    assert.ok(
      handler.indexOf("!closeWindow.allowsClose") <
        handler.indexOf("FINANCIAL_UNAVAILABLE_MESSAGE"),
    );
  });

  it("10. an overnight window works across midnight", () => {
    const s = parseWindowTime("23:00")!;
    const e = parseWindowTime("04:00")!;
    assert.equal(isWithinNightAuditWindow(s, e, parseWindowTime("23:00")!), true);
    assert.equal(isWithinNightAuditWindow(s, e, parseWindowTime("00:00")!), true);
    assert.equal(isWithinNightAuditWindow(s, e, parseWindowTime("03:59")!), true);
    assert.equal(isWithinNightAuditWindow(s, e, parseWindowTime("04:00")!), false);
    assert.equal(isWithinNightAuditWindow(s, e, parseWindowTime("12:00")!), false);
    assert.equal(
      isWithinNightAuditWindow(
        parseWindowTime("01:00")!,
        parseWindowTime("05:00")!,
        parseWindowTime("00:30")!,
      ),
      false,
    );
  });

  it("11. the property timezone is used, not the server clock", () => {
    const instant = new Date(Date.UTC(2026, 9, 25, 21, 30));
    assert.equal(propertyLocalMinutes("Africa/Addis_Ababa", instant), 30);
    const addis = evaluateNightAuditWindow({
      ...OVERNIGHT,
      timezone: "Africa/Addis_Ababa",
      role: "manager",
      now: instant,
    });
    const utc = evaluateNightAuditWindow({
      ...OVERNIGHT,
      timezone: "UTC",
      role: "manager",
      now: instant,
    });
    assert.equal(addis.localTime, "00:30");
    assert.equal(addis.open, true);
    assert.equal(utc.open, false);
    assert.match(closeHandler(), /timezone: property\.timezone,\s*role: me\.role/);
  });

  it("12. the server rejects a non-owner outside the window with NIGHT_AUDIT_OUTSIDE_WINDOW", () => {
    assert.equal(NIGHT_AUDIT_OUTSIDE_WINDOW, "NIGHT_AUDIT_OUTSIDE_WINDOW");
    assert.match(
      closeHandler(),
      /if \(!closeWindow\.allowsClose\) \{[\s\S]*?code: closeWindow\.configValid \? NIGHT_AUDIT_OUTSIDE_WINDOW : NIGHT_AUDIT_INVALID_WINDOW/,
    );
    assert.equal(canBypassNightAuditWindow("manager"), false);
    assert.equal(canBypassNightAuditWindow("night_auditor"), false);
    assert.equal(canBypassNightAuditWindow("owner"), true);
  });

  it("13. the rejection returns before close_business_date is called", () => {
    const handler = closeHandler();
    const reject = handler.indexOf("code: closeWindow.configValid");
    const rpc = handler.indexOf('rpc("close_business_date"');
    assert.ok(reject > 0 && rpc > reject);
    assert.ok(
      handler.indexOf("await syncRunExceptions(") > reject,
      "no exception sync before the window check",
    );
  });

  it("14. an owner outside-window close is recorded on the run summary", () => {
    const w = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(15, 5) });
    const record = outsideWindowCloseRecord(w, "member-1", "2026-10-25T15:05:00.000Z");
    assert.deepEqual(record, {
      outsideWindow: true,
      windowStart: "23:00",
      windowEnd: "04:00",
      timezone: "UTC",
      localTime: "15:05",
      requestedAt: "2026-10-25T15:05:00.000Z",
      actorMembershipId: "member-1",
    });
    const inside = evaluateNightAuditWindow({ ...OVERNIGHT, role: "owner", now: utcAt(23, 5) });
    assert.equal(outsideWindowCloseRecord(inside, "member-1", "x"), null);
    assert.match(
      closeHandler(),
      /nightAuditWindow: outsideWindowCloseRecord\(closeWindow, me\.id, new Date\(\)\.toISOString\(\)\)/,
    );
  });

  it("15. the window never closes, schedules, or rolls the date by itself", () => {
    assert.doesNotMatch(
      windowSrc,
      /setInterval|setTimeout|rpc\(|close_business_date|business_date\s*=/,
    );
    const rpcCalls = functionsSrc.match(/rpc\("close_business_date"/g) ?? [];
    assert.equal(rpcCalls.length, 1);
    const hook = read("../components/nightaudit/use-live-night-audit-window.ts");
    assert.match(hook, /setNow\(new Date\(\)\)/);
    assert.doesNotMatch(hook, /onConfirm|close\(|mutate/);
  });

  it("falls back to the setup default when the stored window is malformed", () => {
    assert.deepEqual(
      nightAuditWindowConfig({ nightAuditWindowStart: "23:00", nightAuditWindowEnd: "04:00" }),
      {
        start: "23:00",
        end: "04:00",
        configValid: true,
      },
    );
    assert.deepEqual(nightAuditWindowConfig(null), {
      start: "00:00",
      end: "04:00",
      configValid: true,
    });
    assert.deepEqual(nightAuditWindowConfig({ nightAuditWindowStart: "25:00" }), {
      start: "00:00",
      end: "04:00",
      configValid: true,
    });
  });

  it("rejects equal window times in Settings and never opens Manager access from legacy config", () => {
    const equal = evaluateNightAuditWindow({
      start: "04:00",
      end: "04:00",
      timezone: "UTC",
      role: "manager",
      now: utcAt(4, 0),
    });
    assert.equal(equal.configValid, false);
    assert.equal(equal.open, false);
    assert.equal(equal.allowsClose, false);
    assert.equal(ready(equal).enabled, false);
    assert.equal(equal.message, "Night Audit window start and end times must be different.");
    assert.match(card1FnSrc, /nightAuditWindowConfigProblem/);
    assert.match(card1Src, /nightAuditWindowConfigProblem/);
  });

  it("keeps Owner bypass explicit for an invalid equal-time legacy window", () => {
    const owner = evaluateNightAuditWindow({
      start: "04:00",
      end: "04:00",
      timezone: "UTC",
      role: "owner",
      now: utcAt(12, 0),
    });
    assert.equal(owner.configValid, false);
    assert.equal(owner.open, false);
    assert.equal(owner.ownerBypass, true);
    assert.equal(owner.allowsClose, true);
  });
});

/* ------------------------------------------------ business date recovery */

type Run = {
  businessDate: string;
  status: "open" | "ready" | "closed" | "superseded";
  fiscalOverride?: boolean;
  closing?: boolean;
  recovery?: { newBusinessDate: string; reason: string; by: string };
};
type Adjustment = {
  oldBusinessDate: string | null;
  newBusinessDate: string;
  reason: string;
  changedBy: string;
  changedAt: string;
};

/** In-memory mirror of adjust_business_date's rules, checked against the SQL below. */
function fakeHouse(stored: string | null, runs: Run[], today = "2026-10-25") {
  const state = { stored, runs: runs.map((r) => ({ ...r })), adjustments: [] as Adjustment[] };
  let tick = 0;
  function adjust(input: {
    expected: string | null;
    next: string;
    reason: string;
    member: string;
  }) {
    if (!isValidBusinessDate(input.next)) throw new Error("BUSINESS_DATE_INVALID");
    if (!input.reason.trim() || input.reason.trim().length > 500)
      throw new Error("BUSINESS_DATE_REASON_REQUIRED");
    if (state.stored !== input.expected) throw new Error("BUSINESS_DATE_STALE");
    if (state.stored != null && state.stored === input.next)
      throw new Error("BUSINESS_DATE_UNCHANGED");
    const effective = state.stored ?? today;
    if (state.runs.some((r) => r.businessDate === effective && r.status === "closed")) {
      throw new Error("ACTIVE_NIGHT_AUDIT_RUN");
    }
    const active = state.runs.find(
      (r) => r.businessDate === effective && (r.status === "open" || r.status === "ready"),
    );
    if (active && input.next !== effective) {
      if (active.fiscalOverride || active.closing) throw new Error("ACTIVE_NIGHT_AUDIT_RUN");
      active.status = "superseded";
      active.recovery = {
        newBusinessDate: input.next,
        reason: input.reason.trim(),
        by: input.member,
      };
    }
    const closed = state.runs
      .filter((r) => r.status === "closed")
      .map((r) => r.businessDate)
      .sort();
    const lastClosed = closed.at(-1);
    if (lastClosed && input.next <= lastClosed)
      throw new Error("BUSINESS_DATE_BEFORE_CLOSED_HISTORY");
    const row = Object.freeze({
      oldBusinessDate: state.stored,
      newBusinessDate: input.next,
      reason: input.reason.trim(),
      changedBy: input.member,
      changedAt: `2026-10-25T10:00:0${tick++}Z`,
    });
    state.adjustments.push(row);
    state.stored = input.next;
    return row;
  }
  function close(runDate: string) {
    const run = state.runs.find((r) => r.businessDate === runDate);
    if (!run || run.status === "superseded") throw new Error("AUDIT_RUN_NOT_CLOSABLE");
    if (state.stored != null && state.stored !== runDate) throw new Error("STALE_BUSINESS_DATE");
    run.status = "closed";
    const [y, m, d] = runDate.split("-").map(Number);
    state.stored = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  }
  return { state, adjust, close };
}

const fnBody = migration.slice(
  migration.indexOf("CREATE OR REPLACE FUNCTION public.adjust_business_date"),
);
const lifecycleFnBody = recoveryLifecycleMigration.slice(
  recoveryLifecycleMigration.indexOf("CREATE OR REPLACE FUNCTION public.adjust_business_date"),
);

describe("Owner Business Date recovery", () => {
  it("16. owner sees Adjust Business Date", () => {
    assert.equal(canAdjustBusinessDate("owner"), true);
    assert.match(dialogSrc, /if \(!canAdjustBusinessDate\(role\)\) return null;/);
    assert.match(dialogSrc, /Adjust Business Date/);
  });

  for (const [n, role] of [
    [17, "manager"],
    [18, "receptionist"],
    [19, "cashier"],
    [20, "accountant"],
  ] as const) {
    it(`${n}. ${role} does not see Adjust Business Date`, () => {
      assert.equal(canAdjustBusinessDate(role), false);
    });
  }

  it("21. a direct non-owner server request is rejected before the RPC", () => {
    assert.ok(
      recoveryFnSrc.indexOf("if (!canAdjustBusinessDate(me.role))") <
        recoveryFnSrc.indexOf('rpc("adjust_business_date"'),
    );
    assert.match(recoveryFnSrc, /callerMembership\(context as never, data\.restaurantId\)/);
    assert.match(recoveryFnSrc, /requireSupabaseAuth/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.adjust_business_date\(uuid, date, date, text, uuid\) FROM public, anon, authenticated;/,
    );
  });

  it("22. a reason is required", () => {
    const base = {
      currentBusinessDate: "2026-10-25",
      newBusinessDate: "2026-10-26",
      confirmation: "CONFIRM",
    };
    assert.equal(
      businessDateAdjustmentProblem({ ...base, reason: "   " }),
      "A reason is required.",
    );
    assert.match(businessDateAdjustmentProblem({ ...base, reason: "x".repeat(501) }) ?? "", /500/);
    assert.equal(
      businessDateAdjustmentProblem({ ...base, reason: "Setup", confirmation: "confirm" }),
      "Type CONFIRM to confirm.",
    );
    assert.equal(businessDateAdjustmentProblem({ ...base, reason: "  Setup  " }), null);
    assert.match(fnBody, /BUSINESS_DATE_REASON_REQUIRED/);
  });

  it("23. an invalid date is rejected", () => {
    for (const bad of ["", "2026-02-30", "2026-13-01", "25/10/2026"])
      assert.equal(isValidBusinessDate(bad), false);
    assert.equal(
      businessDateAdjustmentProblem({
        currentBusinessDate: null,
        newBusinessDate: "2026-02-30",
        reason: "r",
        confirmation: "CONFIRM",
      }),
      "Enter a valid business date.",
    );
  });

  it("24. a NULL business date can be initialized", () => {
    const house = fakeHouse(null, []);
    const row = house.adjust({
      expected: null,
      next: "2026-10-25",
      reason: "Initial setup",
      member: "owner-1",
    });
    assert.equal(row.oldBusinessDate, null);
    assert.equal(house.state.stored, "2026-10-25");
    assert.match(migration, /old_business_date date NULL/);
    assert.match(fnBody, /IF _stored IS DISTINCT FROM _expected_business_date THEN/);
  });

  it("25. an initialized date stays read-only in normal settings", () => {
    assert.match(stepsSrc, /id="card1-business-date-current"[\s\S]*?readOnly\s+disabled/);
    assert.match(stepsSrc, /BUSINESS_DATE_NORMAL_COPY/);
    assert.equal(BUSINESS_DATE_NORMAL_COPY, "Normally advanced by Night Audit.");
    assert.match(card1FnSrc, /delete[^;\n]*business_date/);
  });

  it("26–31. an owner recovery change stores old date, new date, actor, timestamp and reason", () => {
    const house = fakeHouse("2026-10-20", [{ businessDate: "2026-10-19", status: "closed" }]);
    const row = house.adjust({
      expected: "2026-10-20",
      next: "2026-10-25",
      reason: "  Recovery after outage ",
      member: "owner-1",
    });
    assert.equal(house.state.stored, "2026-10-25");
    assert.equal(row.oldBusinessDate, "2026-10-20");
    assert.equal(row.newBusinessDate, "2026-10-25");
    assert.equal(row.changedBy, "owner-1");
    assert.ok(row.changedAt);
    assert.equal(row.reason, "Recovery after outage");
    assert.match(
      fnBody,
      /INSERT INTO public\.business_date_adjustments \(\s*restaurant_id, old_business_date, new_business_date, reason, changed_by_membership_id\s*\) VALUES \(\s*_restaurant_id, _stored, _new_business_date, trim\(_reason\), _membership_id/,
    );
    assert.match(migration, /changed_at timestamptz NOT NULL DEFAULT now\(\)/);
    assert.ok(
      fnBody.indexOf("INSERT INTO public.business_date_adjustments") <
        fnBody.indexOf("UPDATE public.restaurants"),
    );
  });

  it("32. a harmless auto-created current run is superseded during recovery", () => {
    const house = fakeHouse("2026-10-25", [{ businessDate: "2026-10-25", status: "open" }]);
    house.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "recovery", member: "o" });
    assert.equal(house.state.adjustments.length, 1);
    assert.equal(house.state.runs[0]?.status, "superseded");
    assert.deepEqual(house.state.runs[0]?.recovery, {
      newBusinessDate: "2026-10-27",
      reason: "recovery",
      by: "o",
    });
    assert.match(lifecycleFnBody, /SET status = 'superseded'/);
    assert.match(lifecycleFnBody, /'businessDateRecovery'/);
    assert.match(lifecycleFnBody, /'adjustmentId', _row\.id/);
  });

  it("33. a superseded old run cannot later close against the new business date", () => {
    const house = fakeHouse("2026-10-25", [{ businessDate: "2026-10-25", status: "ready" }]);
    house.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "recovery", member: "o" });
    assert.throws(() => house.close("2026-10-25"), /AUDIT_RUN_NOT_CLOSABLE/);
    assert.match(lifecycleFnBody, /AND status IN \('open', 'ready'\);/);
  });

  it("34. fiscal-override, in-progress close, and anomalous closed current runs still block recovery", () => {
    const fiscal = fakeHouse("2026-10-25", [
      { businessDate: "2026-10-25", status: "open", fiscalOverride: true },
    ]);
    assert.throws(
      () => fiscal.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "r", member: "o" }),
      /ACTIVE_NIGHT_AUDIT_RUN/,
    );
    const closing = fakeHouse("2026-10-25", [
      { businessDate: "2026-10-25", status: "ready", closing: true },
    ]);
    assert.throws(
      () =>
        closing.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "r", member: "o" }),
      /ACTIVE_NIGHT_AUDIT_RUN/,
    );
    const closed = fakeHouse("2026-10-25", [{ businessDate: "2026-10-25", status: "closed" }]);
    assert.throws(
      () => closed.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "r", member: "o" }),
      /ACTIVE_NIGHT_AUDIT_RUN/,
    );
    assert.match(lifecycleFnBody, /FROM public\.night_audit_fiscal_overrides/);
    assert.match(lifecycleFnBody, /\? 'closeRequestId'/);
    assert.match(lifecycleFnBody, /business_date = _effective\s+AND status = 'closed'/);
    assert.equal(
      businessDateAdjustmentError("ERROR: ACTIVE_NIGHT_AUDIT_RUN"),
      BUSINESS_DATE_ACTIVE_RUN_MESSAGE,
    );
    assert.equal(
      BUSINESS_DATE_ACTIVE_RUN_MESSAGE,
      "An active Night Audit run exists for the current business date. Complete or reset the active run before manually adjusting the business date.",
    );
  });

  it("35. closed history remains untouched", () => {
    assert.doesNotMatch(lifecycleFnBody, /DELETE FROM public\.night_audit_runs/);
    const house = fakeHouse("2026-10-21", [{ businessDate: "2026-10-20", status: "closed" }]);
    assert.throws(
      () => house.adjust({ expected: "2026-10-21", next: "2026-10-20", reason: "r", member: "o" }),
      /BUSINESS_DATE_BEFORE_CLOSED_HISTORY/,
    );
    assert.deepEqual(house.state.runs, [{ businessDate: "2026-10-20", status: "closed" }]);
  });

  it("36. adjustment history is immutable", () => {
    assert.match(migration, /BEFORE UPDATE ON public\.business_date_adjustments/);
    assert.match(migration, /GRANT SELECT ON public\.business_date_adjustments TO authenticated;/);
    assert.doesNotMatch(migration, /GRANT[^;]*(UPDATE|DELETE)[^;]*business_date_adjustments/);
    assert.doesNotMatch(migration, /FOR (UPDATE|DELETE|INSERT|ALL) TO authenticated/);
    const house = fakeHouse(null, []);
    const row = house.adjust({ expected: null, next: "2026-10-25", reason: "r", member: "o" });
    assert.throws(() => {
      (row as { reason: string }).reason = "edited";
    });
  });

  it("37. a stale concurrent adjustment is rejected", () => {
    const house = fakeHouse("2026-10-25", []);
    house.adjust({ expected: "2026-10-25", next: "2026-10-27", reason: "first", member: "o1" });
    assert.throws(
      () =>
        house.adjust({
          expected: "2026-10-25",
          next: "2026-10-28",
          reason: "second",
          member: "o2",
        }),
      /BUSINESS_DATE_STALE/,
    );
    assert.equal(house.state.adjustments.length, 1);
    assert.match(fnBody, /FROM public\.restaurants\s+WHERE id = _restaurant_id\s+FOR UPDATE;/);
    assert.equal(businessDateAdjustmentError("BUSINESS_DATE_STALE"), BUSINESS_DATE_STALE_MESSAGE);
    assert.match(recoveryFnSrc, /_expected_business_date: data\.expectedBusinessDate/);
  });

  it("38. a successful adjustment refreshes the canonical date consumers", () => {
    for (const key of [
      '["pms-card1", restaurantId]',
      "[PROPERTY_BUSINESS_DATE_KEY, restaurantId]",
      '["night-audit", restaurantId]',
    ]) {
      assert.ok(dialogSrc.includes(key), key);
    }
    assert.match(fnBody, /UPDATE public\.restaurants\s+SET business_date = _new_business_date/);
    assert.match(dialogSrc, /BUSINESS_DATE_ADJUST_WARNING/);
    assert.match(BUSINESS_DATE_ADJUST_WARNING, /Use this only for setup or recovery\.$/);
  });

  it("39. the normal +1 Night Audit close is unchanged", () => {
    assert.doesNotMatch(migration, /FUNCTION public\.close_business_date/);
    assert.match(closeMigration, /SET business_date = _run\.business_date \+ 1/);
    const house = fakeHouse("2026-10-25", [{ businessDate: "2026-10-25", status: "ready" }]);
    house.close("2026-10-25");
    assert.equal(house.state.stored, "2026-10-26");
    assert.equal(house.state.adjustments.length, 0);
  });
});
