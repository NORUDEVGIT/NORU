import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { legacyAuditFinance, summarizeDayFinance } from "./night-audit-day-finance.ts";
import {
  DEFAULT_END_OF_DAY_POLICY,
  END_OF_DAY_STEP_IDS,
  OPEN_SHIFT_POLICY_LABEL,
  RETIRED_CONDITION_CODES,
  conditionDomain,
  conditionFromIssue,
  endOfDayDomains,
  endOfDayPolicyFromBlockers,
  endOfDaySteps,
  historySeverityLabel,
  isEndOfDayStepId,
  openBlockers,
  sortConditions,
  stepChecks,
  withOpenShiftPolicy,
  type EndOfDayCondition,
  type EndOfDayPolicy,
} from "./night-audit-steps.ts";
import { CARD1_DEFAULT_BLOCKERS, parseBusinessDateBlockers } from "./pms-property-setup-card1.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

let seq = 0;
function condition(
  code: string,
  severity: "blocking" | "warning" | "info" = "blocking",
  policy: EndOfDayPolicy = DEFAULT_END_OF_DAY_POLICY,
): EndOfDayCondition {
  seq += 1;
  const row = conditionFromIssue(
    {
      code,
      severity,
      title: code,
      description: `${code} detail`,
      referenceType: "reference",
      referenceId: `ref-${seq}`,
      route: "/restaurant/pms/cashiering",
    },
    policy,
  );
  assert.ok(row, code);
  return row;
}

describe("End of Day steps", () => {
  it("keeps nine persisted step ids that match the migration check", () => {
    const migration = read("../../../../supabase/migrations/0203_night_audit_end_of_day.sql");
    for (const id of END_OF_DAY_STEP_IDS) assert.match(migration, new RegExp(`'${id}'`), id);
    assert.equal(END_OF_DAY_STEP_IDS.length, 9);
    assert.equal(isEndOfDayStepId("cashier"), true);
    assert.equal(isEndOfDayStepId("exceptions"), false);
  });

  it("shows Not Started before a run and Completed after close", () => {
    const blocker = condition("overstay");
    assert.ok(
      endOfDaySteps({ runStatus: null, conditions: [blocker] }).every(
        (s) => s.status === "not_started",
      ),
    );
    assert.ok(
      endOfDaySteps({ runStatus: "closed", conditions: [blocker] }).every(
        (s) => s.status === "completed",
      ),
    );
  });

  it("names every check and puts an unknown integrity code under Other checks", () => {
    const unknown = condition("brand_new_integrity_code");
    const checks = stepChecks(unknown.step, [unknown]);
    assert.equal(checks.find((row) => row.id === "other")?.status, "blocked");
    const clean = stepChecks("reconcile", []);
    assert.ok(clean.length > 0 && clean.every((row) => row.status === "passed"));
  });

  it("sorts blockers before information", () => {
    const sorted = sortConditions([
      condition("open_folio_balance", "warning"),
      condition("overstay"),
    ]);
    assert.equal(sorted[0]?.kind, "blocker");
    assert.equal(sorted[1]?.kind, "information");
  });
});

describe("End of Day conditions", () => {
  it("keeps an unknown code at the reconciler severity", () => {
    assert.equal(condition("brand_new_integrity_code", "blocking").kind, "blocker");
    assert.equal(condition("brand_new_note", "warning").kind, "information");
  });

  it("follows the reconciler split for missing folios", () => {
    assert.equal(condition("missing_folio", "blocking").kind, "blocker");
    assert.equal(condition("missing_folio", "warning").kind, "information");
  });

  it("applies the Card 1 open-shift policy and keeps integrity blockers regardless", () => {
    const block = condition("open_cashier_shift", "blocking", { openCashierShifts: "block" });
    const allow = condition("open_cashier_shift", "blocking", {
      openCashierShifts: "do_not_block",
    });
    assert.equal(block.kind, "blocker");
    assert.equal(block.scope, "policy");
    assert.equal(allow.kind, "information");
    const integrity = condition("closed_folio_nonzero_balance", "blocking", {
      openCashierShifts: "do_not_block",
    });
    assert.equal(integrity.kind, "blocker");
    assert.equal(integrity.scope, "system");
  });

  it("only canonical fiscal blockers are overrideable", () => {
    for (const code of [
      "fiscal_failed",
      "fiscal_cancel_pending",
      "fiscal_not_registered",
      "fiscal_blocked",
    ]) {
      assert.equal(condition(code).fiscalOverrideable, true, code);
    }
    assert.equal(condition("fiscal_unrecognized").fiscalOverrideable, false);
    assert.equal(condition("fiscal_pending", "warning").kind, "information");
    assert.equal(condition("allocation_exceeds_source").fiscalOverrideable, false);
  });

  it("labels retired and legacy history without inventing data", () => {
    assert.deepEqual(
      [...RETIRED_CONDITION_CODES],
      ["unpaid_folio", "pending_arrival", "cancel_noshow_pending"],
    );
    assert.equal(historySeverityLabel("blocking"), "Blocker");
    assert.equal(historySeverityLabel("warning"), "Legacy information");
  });
});

describe("End of Day domains", () => {
  it("maps conditions to the six Step 1 domains", () => {
    assert.equal(conditionDomain(condition("fiscal_failed")), "fiscal");
    assert.equal(conditionDomain(condition("hk_conflict")), "housekeeping");
    assert.equal(conditionDomain(condition("invalid_stay_dates")), "reservations");
    assert.equal(conditionDomain(condition("overstay")), "reservations");
    assert.equal(conditionDomain(condition("checked_in_without_room")), "front_office");
    assert.equal(conditionDomain(condition("open_cashier_shift")), "cashiering");
    assert.equal(conditionDomain(condition("allocation_exceeds_source")), "financial_integrity");
  });

  it("counts blockers and information per domain", () => {
    const view = endOfDayDomains([
      condition("fiscal_failed"),
      condition("open_folio_balance", "warning"),
    ]);
    assert.equal(view.length, 6);
    assert.equal(view.find((row) => row.id === "fiscal")?.status, "blocked");
    assert.equal(view.find((row) => row.id === "cashiering")?.status, "passed");
    assert.equal(view.find((row) => row.id === "cashiering")?.informationCount, 1);
    assert.equal(openBlockers([condition("open_folio_balance", "warning")]).length, 0);
  });
});

describe("Card 1 open-shift policy", () => {
  it("reads the policy from the stored blocker list", () => {
    assert.deepEqual(endOfDayPolicyFromBlockers(parseBusinessDateBlockers(null)), {
      openCashierShifts: "block",
    });
    assert.deepEqual(endOfDayPolicyFromBlockers(["unsettled_folios"]), {
      openCashierShifts: "do_not_block",
    });
    assert.deepEqual(OPEN_SHIFT_POLICY_LABEL, {
      block: "Must be closed",
      do_not_block: "Do not block",
    });
  });

  it("writes the policy without dropping the other defaults", () => {
    const defaults = parseBusinessDateBlockers([]);
    const off = withOpenShiftPolicy(defaults, "do_not_block");
    assert.equal(off.includes("open_cashier_shifts"), false);
    assert.deepEqual(
      [...off].sort(),
      CARD1_DEFAULT_BLOCKERS.filter((row) => row !== "open_cashier_shifts").sort(),
    );
    assert.deepEqual(withOpenShiftPolicy([], "do_not_block").sort(), [...off].sort());
    assert.deepEqual(withOpenShiftPolicy(off, "block").sort(), [...CARD1_DEFAULT_BLOCKERS].sort());
    assert.deepEqual(withOpenShiftPolicy(["open_cashier_shifts"], "block"), [
      "open_cashier_shifts",
    ]);
  });

  it("is exposed in Card 1 and states that integrity checks cannot be turned off", () => {
    const card1 = read("../components/settings/pms-property-setup-card1-steps.tsx");
    assert.match(card1, /id="card1-eod-open-shifts"/);
    assert.match(card1, /Open cashier shifts before End of Day/);
    assert.match(
      card1,
      /System integrity checks always block End of Day and cannot be turned off\./,
    );
  });
});

describe("End of Day day finance", () => {
  const day = summarizeDayFinance(
    [
      {
        transactionType: "charge",
        category: "room",
        amount: 100,
        paymentMethod: null,
        referenceType: null,
      },
      {
        transactionType: "charge",
        category: "tax",
        amount: 15,
        paymentMethod: null,
        referenceType: null,
      },
      {
        transactionType: "charge",
        category: "service_charge",
        amount: 10,
        paymentMethod: null,
        referenceType: null,
      },
      {
        transactionType: "charge",
        category: "minibar",
        amount: 5.555,
        paymentMethod: null,
        referenceType: null,
      },
      {
        transactionType: "payment",
        category: null,
        amount: -80,
        paymentMethod: "card",
        referenceType: null,
      },
      {
        transactionType: "payment",
        category: null,
        amount: -20,
        paymentMethod: "crypto",
        referenceType: null,
      },
      {
        transactionType: "deposit",
        category: null,
        amount: -50,
        paymentMethod: "cash",
        referenceType: null,
      },
      {
        transactionType: "refund",
        category: null,
        amount: 10,
        paymentMethod: null,
        referenceType: null,
      },
      {
        transactionType: "adjustment",
        category: null,
        amount: -3,
        paymentMethod: null,
        referenceType: "settlement_write_off",
      },
      {
        transactionType: "adjustment",
        category: null,
        amount: 2,
        paymentMethod: null,
        referenceType: null,
      },
    ],
    "ETB",
  );

  it("buckets stored postings without re-pricing", () => {
    assert.equal(day.transactionCount, 10);
    assert.deepEqual(day.charges, {
      room: 100,
      package: 0,
      other: 5.56,
      tax: 15,
      serviceCharge: 10,
      total: 130.56,
    });
    assert.equal(day.payments, 100);
    assert.equal(day.paymentsByMethod.card, 80);
    assert.equal(day.paymentsByMethod.other, 20);
    assert.equal(day.deposits, 50);
    assert.equal(day.refunds, 10);
    assert.equal(day.writeOffs, 3);
    assert.equal(day.adjustments, 2);
  });

  it("keeps the legacy summary.finance shape for older History readers", () => {
    const legacy = legacyAuditFinance(day);
    assert.equal(legacy.roomRevenue, 100);
    assert.equal(legacy.charges, 130.56);
    assert.equal(legacy.otherCharges, 30.56);
    assert.equal(legacy.currency, "ETB");
  });

  it("never posts nightly room charges", () => {
    const sources = [
      read("./night-audit-day-finance.ts"),
      read("./night-audit-financial.server.ts"),
      read("./night-audit-operational.server.ts"),
      read("./nightaudit.functions.ts"),
    ].join("\n");
    assert.doesNotMatch(
      sources,
      /post_folio|post_room_charge|postRoomCharge|\.from\("hotel_folio_transactions"\)\s*\.insert/,
    );
  });
});

describe("End of Day migration 0203", () => {
  const supabase = readFileSync("supabase/migrations/0203_night_audit_end_of_day.sql", "utf8");
  const drizzle = readFileSync("drizzle/migrations/0203_night_audit_end_of_day.sql", "utf8");

  it("is mirrored byte for byte", () => {
    assert.equal(drizzle, supabase);
  });

  it("is additive and keeps warning history", () => {
    assert.doesNotMatch(supabase, /DROP TABLE|DELETE FROM|TRUNCATE/i);
    assert.doesNotMatch(supabase, /night_audit_warning_reviews\s*(DROP|RENAME)/i);
    assert.match(supabase, /ADD COLUMN IF NOT EXISTS current_step text/);
    assert.match(
      supabase,
      /CREATE UNIQUE INDEX IF NOT EXISTS night_audit_runs_one_live_run_per_date/,
    );
    assert.match(supabase, /WHERE status <> 'superseded'/);
    assert.match(supabase, /'night_audit\.business_date\.window_override'/);
  });
});

describe("End of Day UI", () => {
  const ui = readdirSync(new URL("../components/nightaudit/", import.meta.url))
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => read(`../components/nightaudit/${name}`))
    .join("\n");
  const workspace = read("../components/workspaces/night-audit-workspace.tsx");

  it("has no exception queue, warning review, or POS reconciliation", () => {
    for (const source of [ui, workspace]) {
      assert.doesNotMatch(
        source,
        /ExceptionQueue|WarningSummary|runPrimary|reviewWarning|unpaid_folio/,
      );
      assert.doesNotMatch(source, /\bPOS\b|F&B reconciliation|pseudo room/i);
    }
  });

  it("keeps date range and filters in the shared search filter", () => {
    assert.match(workspace, /title="Filter End of Day"/);
    assert.match(workspace, /data-testid="end-of-day-date-range"/);
    assert.match(workspace, /PmsFilterSelect/);
    assert.match(workspace, /data-testid="end-of-day-filter-chips"/);
    assert.match(read("../components/nightaudit/night-audit-history.tsx"), /HISTORY_STATUSES\.map/);
  });

  it("walks the checklist after End of Day starts", () => {
    assert.match(workspace, /data-testid="end-of-day-scan"/);
    assert.match(workspace, /Checking \{endOfDayStep\(shownStep\)\.title\}/);
    assert.match(workspace, /setScan\(\{ startedAt: Date\.now\(\), index: 0, phase: "waiting" \}\)/);
    assert.match(read("../components/nightaudit/end-of-day-parts.tsx"), /animate-spin text-\[#8A641A\]/);
  });

  it("uses the NORU surface and avoids horizontal scrolling", () => {
    assert.match(read("../components/nightaudit/night-audit-chrome.tsx"), /bg-\[#F7F4EE\]/);
    assert.match(ui, /bg-white/);
    assert.doesNotMatch(workspace, /overflow-x-scroll/);
  });

  it("links Step 9 to current reports only and marks the package as future", () => {
    const steps = read("../components/nightaudit/end-of-day-steps.tsx");
    assert.match(steps, /nightAuditReportLinks\(previous\.slice\(0, 10\)\)/);
    assert.match(steps, /A packaged End of Day report is a planned enhancement\./);
  });
});
