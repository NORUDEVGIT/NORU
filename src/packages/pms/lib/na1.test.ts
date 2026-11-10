import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FO_PRIMARY_TITLE } from "./front-office-shell.ts";
import {
  NIGHT_AUDIT_OTB_FAILED_NOTICE,
  formatNa1Date,
  nextBusinessDate,
  nightAuditOtbNotice,
  summaryRoomUnitCount,
} from "./na1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("Night Audit date roll", () => {
  it("rolls the business date by one calendar day", () => {
    assert.equal(nextBusinessDate("2026-09-12"), "2026-09-13");
    assert.equal(nextBusinessDate("2026-12-31"), "2027-01-01");
    assert.equal(nextBusinessDate("2026-02-28"), "2026-03-01");
  });

  it("formats dates without shifting the calendar day", () => {
    assert.equal(formatNa1Date("2026-11-08"), "8 Nov 2026");
    assert.equal(formatNa1Date("bad"), "bad");
  });

  it("trusts a stored in-house count only when overstays were stored separately", () => {
    assert.equal(summaryRoomUnitCount({ inHouse: 7, overstays: 1 }), 7);
    assert.equal(summaryRoomUnitCount({ inHouse: 7 }), null);
    assert.equal(summaryRoomUnitCount(null), null);
  });

  it("reports an OTB failure as information after a successful close", () => {
    assert.equal(nightAuditOtbNotice("failed"), NIGHT_AUDIT_OTB_FAILED_NOTICE);
    assert.equal(nightAuditOtbNotice("captured"), null);
    assert.equal(nightAuditOtbNotice("already_present"), null);
  });
});

describe("Night Audit module locks", () => {
  it("has no waive, ignore, reverse, or in-workspace no-show control", () => {
    const workspace = readRel("../components/workspaces/night-audit-workspace.tsx");
    const steps = readRel("../components/nightaudit/end-of-day-steps.tsx");
    const parts = readRel("../components/nightaudit/end-of-day-parts.tsx");
    for (const source of [workspace, steps, parts]) {
      assert.doesNotMatch(source, /updateException|markNoShow|reviewWarning|>Ignore<|Waive/);
    }
  });

  it("keeps Room Rack + Calendar on FO and the module titled Night Audit", () => {
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    const modules = readRel("./pms-modules.ts");
    assert.match(modules, /key: "night-audit"/);
    assert.match(modules, /title: "Night Audit"/);
    const chrome = readRel("../components/nightaudit/night-audit-chrome.tsx");
    assert.match(chrome, /activeModule="Night Audit"/);
    assert.doesNotMatch(chrome, /FO Exceptions/);
  });

  it("reuses close_business_date and the existing permission", () => {
    const fns = readRel("./nightaudit.functions.ts");
    assert.match(fns, /rpc\("close_business_date"/);
    assert.match(fns, /NIGHT_AUDIT_CLOSE_DATE/);
    assert.doesNotMatch(fns, /night_auditor/);
    assert.doesNotMatch(fns, /CREATE OR REPLACE FUNCTION public\.close_business_date/);
    assert.doesNotMatch(fns, /evaluateNa1Blockers|na1\.server/);
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
