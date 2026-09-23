import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import {
  CARD8_CUTOVER_LOCK_POSTURES,
  CARD8_GOLIVE_CAPABILITIES,
  CARD8_GOLIVE_MIGRATION,
  CARD8_GOLIVE_NO_SET1_ACTIVATE,
  CARD8_GOLIVE_PHASE3_REASON,
  CARD8_GOLIVE_PLAN_STATUSES,
  CARD8_GOLIVE_SCHEMA_APPLIED,
  CARD8_GOLIVE_SCHEMA_JUSTIFIED,
  CARD8_GOLIVE_TABLES,
  CARD8_GOLIVE_TASK_CATALOGUE,
  CARD8_GOLIVE_TASK_CATEGORIES,
  CARD8_GOLIVE_TASK_STATUSES,
  CARD8_SANDBOX_POSTURES,
  card8GoliveReady,
  evaluateCard8GolivePhase3,
} from "./pms-property-setup-card8-golive.ts";

const root = process.cwd();
const drizzleSqlPath = join(root, "drizzle/migrations/0091_pms_card8_golive.sql");
const supabaseSqlPath = join(root, "supabase/migrations/0091_pms_card8_golive.sql");
const moduleSrc = readFileSync(
  new URL("./pms-property-setup-card8-golive.ts", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
  "utf8",
);
const tab = readFileSync(
  new URL("../components/settings/pms-card8-golive-tab.tsx", import.meta.url),
  "utf8",
);
const functionsPath = join(
  root,
  "src/packages/pms/lib/pms-property-setup-card8-golive.functions.ts",
);
const functionsSrc = readFileSync(functionsPath, "utf8");

describe("PMS Property Setup Card 8 Phase 3 Go-Live governance", () => {
  it("classifies the applied governance implementation as PASS without activation", () => {
    const report = evaluateCard8GolivePhase3();
    assert.equal(report.verdict, "PASS");
    assert.equal(report.schemaJustified, true);
    assert.equal(CARD8_GOLIVE_SCHEMA_JUSTIFIED, true);
    assert.equal(report.schemaApplied, true);
    assert.equal(CARD8_GOLIVE_SCHEMA_APPLIED, true);
    assert.equal(report.ready, false);
    assert.equal(report.sandbox, "unavailable");
    assert.equal(report.cutoverLock, "unsupported_deferred");
    assert.equal(report.reason, CARD8_GOLIVE_PHASE3_REASON);
  });

  it("keeps dual-lane 0091 identity and adds scoped persistence without activation", () => {
    assert.equal(CARD8_GOLIVE_MIGRATION, "0091_pms_card8_golive.sql");
    assert.deepEqual([...CARD8_GOLIVE_TABLES], ["pms_golive_plans", "pms_golive_tasks"]);
    assert.equal(existsSync(drizzleSqlPath), true);
    assert.equal(existsSync(supabaseSqlPath), true);
    const sql = readFileSync(drizzleSqlPath, "utf8");
    assert.equal(sql, readFileSync(supabaseSqlPath, "utf8"));
    assert.equal(existsSync(functionsPath), true);
    assert.doesNotMatch(moduleSrc, /createServerFn|activatePmsSet1\(|evaluateSet1Checklist\(/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /pms_set1_live\s*=/);
    assert.match(sql, /does NOT touch:\n--   restaurants\.pms_set1_live/);
    assert.match(functionsSrc, /export const getCard8Golive/);
    assert.match(functionsSrc, /export const saveCard8Golive/);
    assert.match(functionsSrc, /callerMembership/);
    assert.match(functionsSrc, /canEditSet1/);
    assert.match(functionsSrc, /restaurant_staff_audit_log/);
    assert.doesNotMatch(functionsSrc, /pms_set1_live|activatePmsSet1|evaluateSet1Checklist/);
  });

  it("stores plan confirmations and acknowledgements without operational snapshots", () => {
    const sql = readFileSync(drizzleSqlPath, "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_golive_plans/);
    assert.match(sql, /business_date_confirmed boolean/);
    assert.match(sql, /opening_state_confirmed boolean/);
    assert.match(sql, /future_reservations_confirmed boolean/);
    assert.match(sql, /sandbox_acknowledgement boolean/);
    assert.match(sql, /cutover_lock_acknowledgement boolean/);
    assert.match(sql, /status IN \('draft', 'preparing', 'ready'\)/);
    assert.match(sql, /status NOT IN \('live', 'active', 'activated'\)/);
    assert.doesNotMatch(sql, /available_rooms|dirty_count|ooo_count|upcoming_count|occupied_count/);
    assert.doesNotMatch(sql, /critical_count|sandbox_supported|lock_enabled/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_validation_/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_golive_sandbox/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_golive_locks/);
  });

  it("stores explicit checklist ownership against Card 5 departments and restaurant_users", () => {
    const sql = readFileSync(drizzleSqlPath, "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_golive_tasks/);
    assert.match(sql, /REFERENCES public\.pms_departments \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.restaurant_users \(restaurant_id, user_id\)/);
    assert.match(
      sql,
      /category IN \(\s*'property',\s*'commercial',\s*'operations',\s*'connectivity',\s*'security',\s*'data'\s*\)/,
    );
    assert.match(sql, /status IN \('not_started', 'in_progress', 'complete', 'not_applicable'\)/);
    assert.match(sql, /UNIQUE \(restaurant_id, task_key\)/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_audit_events/);
    assert.match(sql, /restaurant_staff_audit_log/);
    assert.match(sql, /is_restaurant_member/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(sql, /WITH CHECK/);
    assert.deepEqual([...CARD8_GOLIVE_PLAN_STATUSES], ["draft", "preparing", "ready"]);
    assert.deepEqual(
      [...CARD8_GOLIVE_TASK_STATUSES],
      ["not_started", "in_progress", "complete", "not_applicable"],
    );
    assert.deepEqual(
      [...CARD8_GOLIVE_TASK_CATEGORIES],
      ["property", "commercial", "operations", "connectivity", "security", "data"],
    );
    assert.equal(CARD8_GOLIVE_TASK_CATALOGUE.length, 6);
  });

  it("keeps SET1 Activate, sandbox and cutover lock out of this contract", () => {
    assert.match(CARD8_GOLIVE_NO_SET1_ACTIVATE, /activatePmsSet1/);
    assert.deepEqual([...CARD8_SANDBOX_POSTURES], ["unavailable", "unavailable_acknowledged"]);
    assert.deepEqual(
      [...CARD8_CUTOVER_LOCK_POSTURES],
      ["unsupported_deferred", "unsupported_acknowledged"],
    );
    const byId = Object.fromEntries(CARD8_GOLIVE_CAPABILITIES.map((row) => [row.id, row]));
    assert.equal(byId["sandbox"]?.classification, "GOVERNANCE ONLY");
    assert.equal(byId["cutover-lock"]?.classification, "GOVERNANCE ONLY");
    assert.equal(byId["set1-activate"]?.classification, "OPERATIONAL");
    assert.equal(byId["validation"]?.classification, "REUSABLE");
    assert.equal(byId["checklist"]?.classification, "OPERATIONAL");
  });

  it("treats READY as zero critical plus confirmations, acknowledgements and complete tasks", () => {
    const base = {
      validationCritical: 0,
      businessDateConfirmed: true,
      openingStateConfirmed: true,
      futureReservationsConfirmed: true,
      sandboxPosture: "unavailable_acknowledged" as const,
      cutoverLockPosture: "unsupported_acknowledged" as const,
      incompleteRequiredTasks: 0,
    };
    assert.equal(card8GoliveReady(base), true);
    assert.equal(card8GoliveReady({ ...base, validationCritical: 1 }), false);
    assert.equal(card8GoliveReady({ ...base, sandboxPosture: "unavailable" }), false);
    assert.equal(card8GoliveReady({ ...base, cutoverLockPosture: "unsupported_deferred" }), false);
    assert.equal(card8GoliveReady({ ...base, incompleteRequiredTasks: 1 }), false);
    assert.equal(card8GoliveReady({ ...base, businessDateConfirmed: false }), false);
  });

  it("renders Phase 3 controls without Activate or a working lock control", () => {
    assert.match(section, /Card8GoliveTab/);
    assert.doesNotMatch(section, /getCard8Golive|saveCard8Golive/);
    assert.match(tab, /getCard8Golive/);
    assert.match(tab, /saveCard8Golive/);
    assert.match(tab, /UNAVAILABLE/);
    assert.match(tab, /UNSUPPORTED \/ DEFERRED/);
    assert.match(tab, /Save Go-Live Preparation/);
    assert.match(tab, /System Validation/);
    assert.match(tab, /Business date/);
    assert.match(tab, /Future reservations/);
    assert.doesNotMatch(tab, /createServerFn|activatePmsSet1/);
    assert.doesNotMatch(tab, /Lock Configuration|PROPERTY ACTIVE/);
    assert.match(tab, /disabled/);
  });
});
