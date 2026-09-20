import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildCard8ReadinessReport,
  mergeCard8Status,
  type Card8ReadinessSnapshot,
} from "./card8-readiness.server.ts";
import {
  CARD8_OFFLINE_CAPABILITY_CODES,
  emptyCard8OfflinePolicy,
  emptyCard8OfflineSnapshot,
} from "./pms-property-setup-card8-offline.ts";
import { emptyCard8GolivePlan, emptyCard8GoliveTasks } from "./pms-property-setup-card8-golive.ts";
import { CARD8_PROGRAMME_CARD_ID, CARD8_TABS } from "./pms-property-setup-card8.ts";
import type { Card8ValidationReport } from "./pms-property-setup-card8-validation.ts";

function readyValidation(): Card8ValidationReport {
  return {
    verdict: "PASS",
    ready: true,
    generatedAt: "2026-09-20T00:00:00.000Z",
    issues: [],
    counts: {
      critical: 0,
      warning: 0,
      informational: 0,
      passedCards: 7,
      totalCards: 7,
    },
    summaries: ([1, 2, 3, 4, 5, 6, 7] as const).map((cardNumber) => ({
      cardNumber,
      category: cardNumber === 7 ? "security_data" : "property",
      programmeId: `card-${cardNumber}`,
      href: `/card-${cardNumber}`,
      succeeded: true,
      critical: 0,
      warning: 0,
      informational: 0,
    })),
  };
}

function readySnapshot(): Card8ReadinessSnapshot {
  const offline = emptyCard8OfflineSnapshot();
  offline.policy = {
    ...emptyCard8OfflinePolicy(),
    configured: true,
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
  assert.equal(offline.capabilities.length, CARD8_OFFLINE_CAPABILITY_CODES.length);

  const plan = {
    ...emptyCard8GolivePlan(),
    id: "plan",
    status: "ready" as const,
    businessDateConfirmed: true,
    openingStateConfirmed: true,
    futureReservationsConfirmed: true,
    sandboxAcknowledgement: true,
    cutoverLockAcknowledgement: true,
  };
  const tasks = emptyCard8GoliveTasks().map((task) => ({
    ...task,
    id: task.taskKey,
    status: "complete" as const,
  }));
  const validation = readyValidation();
  return {
    offline,
    validation,
    golive: {
      plan,
      tasks,
      departments: [],
      users: [],
      businessDate: "2026-09-20",
      opening: {
        totalRooms: 10,
        occupied: 2,
        vacant: 8,
        available: 8,
        dirty: 0,
        outOfOrder: 0,
        outOfService: 0,
      },
      futureReservations: 1,
      canEdit: true,
    },
    activation: {
      eligible: false,
      blockers: ["Only the property owner can activate."],
      warnings: [],
      property: { id: "property", name: "Hotel", propertyCode: "NRC0001" },
      canonicalLive: false,
      businessDate: "2026-09-20",
      validation: validation.counts,
      golive: {
        ready: true,
        status: "ready",
        incompleteRequiredTasks: 0,
        businessDateConfirmed: true,
        openingStateConfirmed: true,
        futureReservationsConfirmed: true,
        sandboxAcknowledged: true,
        cutoverLockAcknowledged: true,
      },
      ownerAuthorized: false,
      set1ChecklistReady: true,
    },
  };
}

function listSql(dir: string): string[] {
  const absolute = join(process.cwd(), dir);
  return existsSync(absolute) ? readdirSync(absolute).filter((name) => name.endsWith(".sql")) : [];
}

describe("Card 8 Phase 5 overall readiness", () => {
  it("returns PASS for all six slices without requiring activation or the current caller to be owner", () => {
    const report = buildCard8ReadinessReport(readySnapshot());
    assert.equal(report.offline.verdict, "PASS");
    assert.equal(report.validation.verdict, "PASS");
    assert.equal(report.golive.verdict, "PASS");
    assert.equal(report.activation.verdict, "PASS");
    assert.equal(report.integrity.verdict, "PASS");
    assert.equal(report.overall.verdict, "PASS");
    assert.equal(report.overall.status, "complete");
    assert.equal(report.canonicalLive, false);
    assert.ok(report.offline.warnings.some((warning) => /runtime limitation/i.test(warning)));
  });

  it("keeps critical validation, incomplete Go-Live and activation preconditions visible", () => {
    const snapshot = readySnapshot();
    snapshot.validation = {
      ...snapshot.validation,
      ready: false,
      counts: { ...snapshot.validation.counts, critical: 1, passedCards: 6 },
      issues: [
        {
          id: "critical",
          cardNumber: 1,
          category: "property",
          domain: "Business date",
          severity: "critical",
          message: "Business date is incomplete.",
        },
      ],
    };
    snapshot.golive.plan.businessDateConfirmed = false;
    snapshot.activation.validation = snapshot.validation.counts;
    snapshot.activation.golive.ready = false;
    snapshot.activation.golive.businessDateConfirmed = false;
    snapshot.activation.blockers = [
      "System Validation has 1 critical issue.",
      "The Go-Live business date confirmation is incomplete.",
      "Card 8 Go-Live governance is not ready.",
    ];
    const report = buildCard8ReadinessReport(snapshot);
    assert.equal(report.validation.verdict, "PARTIAL");
    assert.equal(report.golive.verdict, "PARTIAL");
    assert.equal(report.activation.verdict, "PARTIAL");
    assert.equal(report.overall.verdict, "PARTIAL");
    assert.match(report.overall.blockers.join(" "), /Business date is incomplete/);
  });

  it("persists programme completion under the existing Card 8 id without changing live state", () => {
    const report = buildCard8ReadinessReport(readySnapshot());
    const merged = mergeCard8Status(
      { cards: { "property-business": "complete" }, card1Steps: {} },
      report.overall,
    );
    assert.equal(CARD8_PROGRAMME_CARD_ID, "payments-administration");
    assert.equal(merged.cards[CARD8_PROGRAMME_CARD_ID], "complete");
    assert.equal(merged.cards["property-business"], "complete");
    assert.equal(report.canonicalLive, false);
  });

  it("keeps Validate read-only and programme writes on existing Card 8 saves", () => {
    const validate = readFileSync(
      new URL("./pms-property-setup-card8.functions.ts", import.meta.url),
      "utf8",
    );
    const persistence = readFileSync(
      new URL("./card8-readiness.functions.ts", import.meta.url),
      "utf8",
    );
    const offline = readFileSync(
      new URL("./pms-property-setup-card8-offline.functions.ts", import.meta.url),
      "utf8",
    );
    const golive = readFileSync(
      new URL("./pms-property-setup-card8-golive.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(validate, /getCard8Readiness/);
    assert.doesNotMatch(validate, /\.update\(|\.insert\(|\.upsert\(|activatePmsSet1/);
    assert.match(persistence, /pms_property_setup_status/);
    assert.doesNotMatch(persistence, /pms_set1_live:\s*true/);
    assert.match(offline, /persistCard8Overall/);
    assert.match(golive, /persistCard8Overall/);
  });

  it("wires exactly four tabs and a conservative accessible overall report", () => {
    const section = readFileSync(
      new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(CARD8_TABS.length, 4);
    assert.deepEqual(
      CARD8_TABS.map((tab) => tab.label),
      ["Offline & Sync", "System Validation", "Go-Live", "Property Activation"],
    );
    assert.match(section, /Checking overall status/);
    assert.match(section, /pms-card8-overall-validate/);
    assert.match(section, /pms-card8-readiness-report/);
    assert.match(section, /aria-label="Card 8 readiness report"/);
    assert.match(section, /focus-visible:ring-\[#C89933\]/);
    assert.match(section, /overflow-x-auto/);
  });

  it("adds no Phase 5 schema, runtime, lifecycle or second activation path", () => {
    const sql = [...listSql("drizzle/migrations"), ...listSql("supabase/migrations")];
    assert.equal(
      sql.some((name) => name.includes("0092")),
      false,
    );
    const files = [
      "./card8-readiness.server.ts",
      "./card8-readiness.functions.ts",
      "./pms-property-setup-card8.functions.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    const joined = files.join("\n");
    assert.doesNotMatch(
      joined,
      /activateCard8Property|pms_property_live|pms_property_lifecycle|serviceWorker|indexedDB/,
    );
    assert.doesNotMatch(joined, /CREATE TABLE|ALTER TABLE/);
  });
});
