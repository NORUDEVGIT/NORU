import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FO_PRIMARY_TITLE } from "./front-office-shell.ts";
import {
  NA1_BLOCKER_IDS,
  NA1_CONFIRM_LABEL,
  NA1_CONFIRM_ROLES,
  NA1_FO_TITLE_LOCK,
  NA1_HAS_IGNORE,
  NA1_HAS_MARK_NO_SHOW,
  NA1_HAS_REVERSE,
  NA1_HAS_WAIVE,
  NA1_PHONE_CLOSE_COPY,
  NA1_TITLE,
  PHASE_6I_EXTRAS_NOT_NA1,
  buildNa1Blockers,
  canConfirmNightAudit,
  canEnableConfirm,
  liveCountFromSnapshot,
  nextBusinessDate,
  remainingBlockerCount,
  snapshotBlockers,
  workspaceStatus,
  type NaBlockerRow,
} from "./na1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function clearBoard(): NaBlockerRow[] {
  return buildNa1Blockers({
    arrivalsPendingCount: 0,
    overstayCount: 0,
    unpaidFolios: { lane: "live", count: 0 },
    openShift: { tillUsed: true, openCount: 0 },
    hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
  });
}

describe("NA-1 role gate", () => {
  it("lets owner and manager Confirm; receptionist cannot", () => {
    assert.deepEqual([...NA1_CONFIRM_ROLES], ["owner", "manager"]);
    assert.equal(canConfirmNightAudit("owner"), true);
    assert.equal(canConfirmNightAudit("manager"), true);
    assert.equal(canConfirmNightAudit("receptionist"), false);
    assert.equal(canConfirmNightAudit("cashier"), false);
    assert.equal(canConfirmNightAudit("accountant"), false);
    assert.equal(canConfirmNightAudit("housekeeper"), false);
    assert.equal(canConfirmNightAudit("housekeeping_supervisor"), false);
  });
});

describe("NA-1 confirm enablement", () => {
  it("disables Confirm when any applicable Live blocker is Block", () => {
    const blocked = buildNa1Blockers({
      arrivalsPendingCount: 2,
      overstayCount: 0,
      unpaidFolios: { lane: "live", count: 0 },
      openShift: { tillUsed: true, openCount: 0 },
      hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
    });
    assert.equal(blocked.find((row) => row.id === "arrivals_pending")?.state, "block");
    assert.equal(remainingBlockerCount(blocked), 1);
    assert.equal(canEnableConfirm(blocked), false);
    assert.equal(workspaceStatus({ closed: false, rows: blocked }), "blocked");
  });

  it("enables Confirm when all applicable rows are Pass or N/A", () => {
    const clear = clearBoard();
    assert.equal(canEnableConfirm(clear), true);
    assert.equal(remainingBlockerCount(clear), 0);
    assert.equal(workspaceStatus({ closed: false, rows: clear }), "open");

    const tillUnused = buildNa1Blockers({
      arrivalsPendingCount: 0,
      overstayCount: 0,
      unpaidFolios: { lane: "live", count: 0 },
      openShift: { tillUsed: false, openCount: 0 },
      hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
    });
    assert.equal(tillUnused.find((row) => row.id === "open_shift")?.state, "na");
    assert.equal(canEnableConfirm(tillUnused), true);
  });

  it("does not treat Unavailable rows as remaining blockers or as a fake Pass", () => {
    const rows = buildNa1Blockers({
      arrivalsPendingCount: 0,
      overstayCount: 0,
      unpaidFolios: { lane: "unavailable", count: 99 },
      openShift: { tillUsed: false, openCount: 0 },
      hkConflict: { discrepancyLane: "unavailable", discrepancyCount: 4, roomUnavailableCount: 0 },
    });
    const unpaid = rows.find((row) => row.id === "unpaid_folios");
    const cancel = rows.find((row) => row.id === "cancel_noshow_pending");
    const hk = rows.find((row) => row.id === "hk_conflict");
    assert.equal(unpaid?.state, "unavailable");
    assert.equal(unpaid?.count, null);
    assert.equal(cancel?.state, "unavailable");
    assert.equal(cancel?.count, null);
    assert.equal(hk?.state, "pass");
    assert.equal(hk?.count, 0);
    assert.equal(remainingBlockerCount(rows), 0);
    assert.equal(canEnableConfirm(rows), true);
    assert.notEqual(unpaid?.state, "pass");
    assert.notEqual(cancel?.state, "pass");
  });
});

describe("NA-1 date roll", () => {
  it("rolls the business date by one calendar day", () => {
    assert.equal(nextBusinessDate("2026-09-12"), "2026-09-13");
    assert.equal(nextBusinessDate("2026-12-31"), "2027-01-01");
    assert.equal(nextBusinessDate("2026-02-28"), "2026-03-01");
  });
});

describe("NA-1 unavailable honesty", () => {
  it("keeps cancel_noshow_pending Unavailable and never invents Early/Late or Phase 6I extras as Pass", () => {
    const rows = clearBoard();
    assert.deepEqual(
      rows.map((row) => row.id),
      [...NA1_BLOCKER_IDS],
    );
    assert.equal(rows.find((row) => row.id === "cancel_noshow_pending")?.state, "unavailable");
    assert.equal(
      rows.some((row) => (PHASE_6I_EXTRAS_NOT_NA1 as readonly string[]).includes(row.id)),
      false,
    );
    assert.equal(NA1_BLOCKER_IDS.includes("early_arrival" as never), false);
    assert.equal(NA1_BLOCKER_IDS.includes("late_arrival" as never), false);
    assert.equal(NA1_BLOCKER_IDS.includes("dirty_room_without_task" as never), false);

    const snap = snapshotBlockers(rows);
    assert.equal(liveCountFromSnapshot(snap, "cancel_noshow_pending"), null);
    assert.equal(liveCountFromSnapshot(snap, "arrivals_pending"), 0);
  });
});

describe("NA-1 waive off", () => {
  it("has no waive, ignore, reverse or in-workspace mark-no-show control", () => {
    assert.equal(NA1_HAS_WAIVE, false);
    assert.equal(NA1_HAS_IGNORE, false);
    assert.equal(NA1_HAS_REVERSE, false);
    assert.equal(NA1_HAS_MARK_NO_SHOW, false);

    const contract = readRel("./na1.ts");
    assert.doesNotMatch(contract, /action:\s*"ignore"|updateException|markNoShow/);

    const workspace = readRel("../components/workspaces/night-audit-workspace.tsx");
    assert.doesNotMatch(workspace, /updateException/);
    assert.doesNotMatch(workspace, /markNoShow/);
    assert.doesNotMatch(workspace, /RevenuePanel/);
    assert.doesNotMatch(workspace, /ChecklistPanel/);
    assert.doesNotMatch(workspace, />Ignore</);
    assert.match(workspace, /NaBlockerBoard/);
    assert.match(workspace, /NaClosePanel/);
    assert.match(workspace, /NaCloseSummary/);

    const panels = readRel("../components/nightaudit/na1-panels.tsx");
    assert.equal(NA1_PHONE_CLOSE_COPY, "Use desktop to close");
    assert.equal(NA1_CONFIRM_LABEL, "Confirm close");
    assert.match(panels, /NA1_PHONE_CLOSE_COPY/);
    assert.match(panels, /NA1_CONFIRM_LABEL/);
    assert.doesNotMatch(panels, />Ignore</);
    assert.doesNotMatch(panels, /RevenuePanel/);
  });
});

describe("NA-1 FO-FS0 title lock", () => {
  it("keeps Room Rack + Calendar on FO and titles this module Night Audit", () => {
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    assert.equal(NA1_FO_TITLE_LOCK, "Room Rack + Calendar");
    assert.equal(NA1_TITLE, "Night Audit");

    const foShell = readRel("./front-office-shell.ts");
    assert.match(foShell, /export const FO_PRIMARY_TITLE = "Room Rack \+ Calendar"/);

    const modules = readRel("./pms-modules.ts");
    assert.match(modules, /key: "night-audit"/);
    assert.match(modules, /title: "Night Audit"/);

    const workspace = readRel("../components/workspaces/night-audit-workspace.tsx");
    assert.match(workspace, /fallback=\{NA1_TITLE\}/);
    assert.doesNotMatch(workspace, /FO Exceptions/);
  });
});

describe("NA-1 reuse locks", () => {
  it("reuses close_business_date and does not add a migration or night_auditor", () => {
    const fns = readRel("./nightaudit.functions.ts");
    assert.match(fns, /rpc\("close_business_date"/);
    assert.match(fns, /requireCashierManager/);
    assert.match(fns, /evaluateNa1Blockers/);
    assert.doesNotMatch(fns, /night_auditor/);
    assert.doesNotMatch(fns, /CREATE OR REPLACE FUNCTION public\.close_business_date/);

    const server = readRel("./na1.server.ts");
    assert.doesNotMatch(server, /create table/i);
    assert.doesNotMatch(server, /apply_migration/);
    assert.doesNotMatch(server, /early_arrival|late_arrival/);
  });

  it("keys FO chrome off the persisted property business date", () => {
    const hook = readRel("./use-property-business-date.ts");
    assert.match(hook, /getPropertyBusinessDate/);
    assert.match(hook, /propertyToday/);

    const fo = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(fo, /usePropertyBusinessDate/);
    assert.doesNotMatch(fo, /const today = propertyToday\(timezone\)/);
  });
});
