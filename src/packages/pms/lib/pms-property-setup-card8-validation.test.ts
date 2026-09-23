import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import { CARD7_INTEGRITY_COPY } from "./card7-readiness.server.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import { propertySetupRedirectHref } from "./pms-set1-foundation.ts";
import {
  CARD8_CARD7_INTEGRITY_INFORMATIONAL,
  CARD8_VALIDATION_ADAPTERS,
  CARD8_VALIDATION_HISTORY_JUSTIFIED,
  CARD8_VALIDATION_PROPOSED_MIGRATION,
  CARD8_VALIDATION_READY_RULE,
  CARD8_VALIDATION_RUNS_TABLE,
  card8ValidationReady,
  deriveCard8ValidationCounts,
  mapCard8Blocker,
  mapCard8Warning,
  neverFabricateValidationCounts,
  type Card8ValidationIssue,
} from "./pms-property-setup-card8-validation.ts";
import {
  adaptCard8DomainSlices,
  buildCard8ValidationReport,
  failedCard8Adapter,
} from "./pms-property-setup-card8-validation.server.ts";

const root = process.cwd();
const moduleSrc = readFileSync(
  new URL("./pms-property-setup-card8-validation.ts", import.meta.url),
  "utf8",
);
const serverSrc = readFileSync(
  new URL("./pms-property-setup-card8-validation.server.ts", import.meta.url),
  "utf8",
);
const functionsSrc = readFileSync(
  new URL("./pms-property-setup-card8-validation.functions.ts", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
  "utf8",
);
const tab = readFileSync(
  new URL("../components/settings/pms-card8-validation-tab.tsx", import.meta.url),
  "utf8",
);

function listSql(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((name) => name.endsWith(".sql"));
}

describe("PMS Property Setup Card 8 Phase 2 System Validation aggregator", () => {
  it("keeps the approved live-recompute contract", () => {
    assert.equal(CARD8_VALIDATION_HISTORY_JUSTIFIED, false);
    assert.match(CARD8_VALIDATION_READY_RULE, /0 critical/);
    assert.match(functionsSrc, /export const getCard8Validation/);
    assert.match(functionsSrc, /requireSupabaseAuth/);
    assert.match(functionsSrc, /withPmsPackage/);
  });

  it("does not author 0091 validation-history SQL", () => {
    const sql = [...listSql("drizzle/migrations"), ...listSql("supabase/migrations")];
    assert.equal(
      sql.some((name) => name.includes("validation_history")),
      false,
    );
    assert.equal(
      sql.some((name) => name.includes("0091") && name.includes("validation")),
      false,
    );
    assert.equal(
      existsSync(join(root, "drizzle/migrations", CARD8_VALIDATION_PROPOSED_MIGRATION)),
      false,
    );
    assert.equal(
      existsSync(
        join(root, "src/packages/pms/lib/pms-property-setup-card8-validation.functions.ts"),
      ),
      true,
    );
    assert.doesNotMatch(moduleSrc, /createServerFn/);
    assert.doesNotMatch(moduleSrc, /saveCard8Validation/);
    assert.equal(CARD8_VALIDATION_RUNS_TABLE, "pms_validation_runs");
    assert.doesNotMatch(moduleSrc, /CREATE TABLE/);
    assert.doesNotMatch(functionsSrc, /\.(insert|update|upsert|delete)\(/);
    assert.doesNotMatch(functionsSrc, /pms_validation_/);
  });

  it("maps adapters onto live evaluators without copying rule bodies or SET1 Activate", () => {
    assert.equal(CARD8_VALIDATION_ADAPTERS.length, 7);
    const byCard = Object.fromEntries(
      CARD8_VALIDATION_ADAPTERS.map((row) => [row.cardNumber, row]),
    );
    assert.equal(byCard[1]?.programmeId, "property-business");
    assert.equal(byCard[2]?.programmeId, "rooms-inventory");
    assert.equal(byCard[3]?.programmeId, "rates-guest-rules");
    assert.equal(byCard[4]?.programmeId, "housekeeping-maintenance");
    assert.equal(byCard[5]?.programmeId, "departments-services");
    assert.equal(byCard[6]?.programmeId, "notifications-security");
    assert.equal(byCard[7]?.programmeId, "sales-distribution");
    for (const adapter of CARD8_VALIDATION_ADAPTERS) {
      const card = PROPERTY_SETUP_CARDS.find((row) => row.number === adapter.cardNumber);
      assert.equal(adapter.programmeId, card?.id);
      assert.equal(adapter.href, propertySetupRedirectHref(`#${adapter.hash}`));
    }
    assert.equal(byCard[5]?.classification, "REUSABLE");
    assert.equal(byCard[7]?.classification, "REUSABLE");
    assert.equal(byCard[1]?.classification, "SUPPORTED");
    assert.equal(byCard[2]?.classification, "SUPPORTED");
    assert.equal(byCard[3]?.classification, "SUPPORTED");
    assert.equal(byCard[4]?.classification, "SUPPORTED");
    assert.equal(byCard[6]?.classification, "SUPPORTED");
    assert.match(byCard[2]?.note ?? "", /evaluateCard2StepStatus/);
    assert.doesNotMatch(moduleSrc, /evaluateSet1Checklist\(/);
    assert.doesNotMatch(moduleSrc, /evaluateCard1Status\(|buildCard5ValidationReport\(/);
  });

  it("maps blockers to critical, warnings to warning, and Card 7 integrity copy to informational", () => {
    assert.equal(CARD8_CARD7_INTEGRITY_INFORMATIONAL, CARD7_INTEGRITY_COPY);
    assert.equal(mapCard8Blocker("Identity is incomplete"), "critical");
    assert.equal(mapCard8Warning("VAT certificate missing"), "warning");
    assert.equal(mapCard8Warning(CARD7_INTEGRITY_COPY), "informational");
  });

  it("derives counts from issues and treats READY as zero critical only", () => {
    const issues: Card8ValidationIssue[] = [
      {
        id: "c1",
        cardNumber: 1,
        category: "property",
        domain: "Identity",
        severity: "critical",
        message: "Step identity incomplete",
        href: propertySetupRedirectHref("#property-business"),
      },
      {
        id: "c3w",
        cardNumber: 3,
        category: "financial",
        domain: "Meals",
        severity: "warning",
        message: "Meal plan draft",
        href: propertySetupRedirectHref("#financial-commercial"),
      },
      {
        id: "c7i",
        cardNumber: 7,
        category: "security_data",
        domain: "Integrity",
        severity: "informational",
        message: CARD7_INTEGRITY_COPY,
        href: propertySetupRedirectHref("#security-data-reports"),
      },
    ];
    const counts = deriveCard8ValidationCounts(issues);
    assert.equal(counts.critical, 1);
    assert.equal(counts.warning, 1);
    assert.equal(counts.informational, 1);
    assert.equal(counts.passedCards, 6);
    assert.equal(card8ValidationReady(counts), false);
    assert.equal(
      card8ValidationReady(
        deriveCard8ValidationCounts(issues.filter((row) => row.severity !== "critical")),
      ),
      true,
    );
    assert.equal(neverFabricateValidationCounts("No validation has run."), true);
    assert.equal(neverFabricateValidationCounts("126 Passed"), false);
  });

  it("aggregates actual issues, reports adapter failures, and never fabricates totals", () => {
    const results = CARD8_VALIDATION_ADAPTERS.map((adapter) =>
      adaptCard8DomainSlices(adapter.cardNumber, adapter.category, [
        {
          id: "domain",
          label: "Domain",
          blockers: adapter.cardNumber === 1 ? ["Identity is incomplete."] : [],
          warnings: adapter.cardNumber === 6 ? ["No integrations configured."] : [],
        },
      ]),
    );
    const report = buildCard8ValidationReport(results, "2026-09-20T00:00:00.000Z");
    assert.equal(report.verdict, "PASS");
    assert.equal(report.ready, false);
    assert.equal(report.counts.critical, 1);
    assert.equal(report.counts.warning, 1);
    assert.equal(report.counts.informational, 0);
    assert.equal(report.counts.passedCards, 6);
    assert.equal(report.issues.length, 2);

    const partial = buildCard8ValidationReport([
      ...results.slice(0, 6),
      failedCard8Adapter(7, "security_data", new Error("Unavailable")),
    ]);
    assert.equal(partial.verdict, "PARTIAL");
    assert.equal(partial.ready, false);
    assert.match(partial.reason ?? "", /1 validation adapter/);
  });

  it("enables read-only validation UI while keeping Go-Live out", () => {
    assert.match(section, /Card8ValidationTab/);
    assert.doesNotMatch(section, /getCard8Validation/);
    assert.match(tab, /getCard8Validation/);
    assert.match(tab, /Run Validation Again/);
    assert.match(tab, /View Issues/);
    assert.match(tab, /Fix Configuration/);
    assert.match(tab, /READY/);
    assert.match(tab, /CARD8_VALIDATION_LIVE_RECOMPUTE/);
    assert.doesNotMatch(tab, /createServerFn/);
    assert.doesNotMatch(tab, /126 Passed|Healthy ✓|PROPERTY ACTIVE/);
    assert.doesNotMatch(functionsSrc, /evaluateSet1Checklist/);
    assert.doesNotMatch(serverSrc, /evaluateCard1Status|evaluateCurrencyCard3Readiness/);
    assert.match(tab, /read-only result contributes to overall Card 8 readiness/);
  });
});
