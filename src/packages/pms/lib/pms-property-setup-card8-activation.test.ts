import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CARD8_ACTIVATION_CANONICAL_FLAG,
  CARD8_ACTIVATION_CANONICAL_WRITER,
  CARD8_ACTIVATION_CAPABILITIES,
  CARD8_ACTIVATION_LIFECYCLE_JUSTIFIED,
  CARD8_ACTIVATION_NO_LIFECYCLE_SQL,
  CARD8_ACTIVATION_OWNER_ONLY,
  CARD8_ACTIVATION_PHASE4_REASON,
  CARD8_ACTIVATION_SCHEMA_APPLIED,
  CARD8_ACTIVATION_SET1_BYPASS,
  CARD8_ACTIVATION_WRAP_ONLY,
  card8ActivationGatesPass,
  evaluateCard8ActivationPhase4,
} from "./pms-property-setup-card8-activation.ts";

const root = process.cwd();
const moduleSrc = readFileSync(
  new URL("./pms-property-setup-card8-activation.ts", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
  "utf8",
);
const tab = readFileSync(
  new URL("../components/settings/pms-card8-activation-tab.tsx", import.meta.url),
  "utf8",
);
const functionsPath = join(
  root,
  "src/packages/pms/lib/pms-property-setup-card8-activation.functions.ts",
);
const functionsSrc = readFileSync(functionsPath, "utf8");
const serverSrc = readFileSync(
  new URL("./pms-property-setup-card8-activation.server.ts", import.meta.url),
  "utf8",
);
const canonicalSrc = readFileSync(
  new URL("./pms-set1-foundation.functions.ts", import.meta.url),
  "utf8",
);
const set1Ui = readFileSync(
  new URL("../components/settings/pms-set1-section.tsx", import.meta.url),
  "utf8",
);

function listSql(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((name) => name.endsWith(".sql"));
}

describe("PMS Property Setup Card 8 Phase 4 Property Activation", () => {
  it("classifies the hardened canonical activation as PASS with no lifecycle SQL", () => {
    const report = evaluateCard8ActivationPhase4();
    assert.equal(report.verdict, "PASS");
    assert.equal(report.lifecycleJustified, false);
    assert.equal(CARD8_ACTIVATION_LIFECYCLE_JUSTIFIED, false);
    assert.equal(report.schemaApplied, false);
    assert.equal(CARD8_ACTIVATION_SCHEMA_APPLIED, false);
    assert.equal(report.canonicalActivationRetained, true);
    assert.equal(report.hardGatesImplemented, true);
    assert.equal(report.set1BypassClosed, true);
    assert.equal(report.canonicalFlag, "pms_set1_live");
    assert.equal(report.canonicalWriter, "activatePmsSet1");
    assert.equal(report.reason, CARD8_ACTIVATION_PHASE4_REASON);
  });

  it("does not author lifecycle SQL, a second activation mutation, or a second live flag", () => {
    const sql = [...listSql("drizzle/migrations"), ...listSql("supabase/migrations")];
    assert.equal(
      sql.some((name) => name.includes("0092") || name.includes("property_lifecycle")),
      false,
    );
    assert.equal(existsSync(functionsPath), true);
    assert.equal(CARD8_ACTIVATION_CANONICAL_FLAG, "pms_set1_live");
    assert.equal(CARD8_ACTIVATION_CANONICAL_WRITER, "activatePmsSet1");
    assert.doesNotMatch(moduleSrc, /createServerFn|pms_set1_live:\s*true/);
    assert.match(functionsSrc, /getCard8ActivationEligibility/);
    assert.doesNotMatch(functionsSrc, /activateCard8Property|pms_set1_live:\s*true|\.update\(/);
    assert.doesNotMatch(serverSrc, /activateCard8Property|pms_set1_live:\s*true|\.update\(/);
    assert.doesNotMatch(moduleSrc, /CREATE TABLE|ALTER TABLE public\.restaurants/);
    assert.match(CARD8_ACTIVATION_WRAP_ONLY, /invokes activatePmsSet1/);
    assert.match(CARD8_ACTIVATION_NO_LIFECYCLE_SQL, /No 0092/);
  });

  it("keeps SET1 and Card 8 on the same owner-only canonical mutation", () => {
    assert.match(CARD8_ACTIVATION_SET1_BYPASS, /cannot bypass Card 8 gates/);
    assert.match(CARD8_ACTIVATION_OWNER_ONLY, /owner-only/);
    const byId = Object.fromEntries(CARD8_ACTIVATION_CAPABILITIES.map((row) => [row.id, row]));
    assert.equal(byId["canonical-writer"]?.classification, "CANONICAL");
    assert.equal(byId["canonical-flag"]?.classification, "CANONICAL");
    assert.equal(byId["set1-golive-ui"]?.classification, "SUPPORTED");
    assert.equal(byId["card7-activate"]?.classification, "GOVERNANCE ONLY");
    assert.equal(byId["validation"]?.classification, "REUSABLE");
    assert.equal(byId["golive"]?.classification, "REUSABLE");
    assert.equal(byId["explicit-confirm"]?.classification, "SUPPORTED");
    assert.equal(byId["card8-tab"]?.classification, "SUPPORTED");
    assert.equal(byId["lifecycle"]?.classification, "GOVERNANCE ONLY");
    assert.match(set1Ui, /explicitConfirmation/);
    assert.match(set1Ui, /activate\(\{ data: \{ restaurantId, explicitConfirmation \} \}\)/);
  });

  it("treats Activate as zero critical plus Go-Live ready, date confirmed, explicit confirm and owner", () => {
    const base = {
      validationCritical: 0,
      goliveReady: true,
      businessDateConfirmed: true,
      explicitConfirmation: true,
      canActivateSet1: true,
    };
    assert.equal(card8ActivationGatesPass(base), true);
    assert.equal(card8ActivationGatesPass({ ...base, validationCritical: 1 }), false);
    assert.equal(card8ActivationGatesPass({ ...base, goliveReady: false }), false);
    assert.equal(card8ActivationGatesPass({ ...base, businessDateConfirmed: false }), false);
    assert.equal(card8ActivationGatesPass({ ...base, explicitConfirmation: false }), false);
    assert.equal(card8ActivationGatesPass({ ...base, canActivateSet1: false }), false);
  });

  it("gates the only live-state write before canonical activation", () => {
    const eligibilityIndex = canonicalSrc.indexOf("loadCard8ActivationEligibility(");
    const writeIndex = canonicalSrc.indexOf(".update({ pms_set1_live: true })");
    assert.ok(eligibilityIndex >= 0);
    assert.ok(writeIndex > eligibilityIndex);
    assert.match(canonicalSrc, /explicitConfirmation: z\.boolean\(\)/);
    assert.match(canonicalSrc, /Explicit activation confirmation is required/);
    assert.match(canonicalSrc, /loadSet1ActivationState/);
    assert.match(canonicalSrc, /checklist\.canActivate/);
    assert.match(serverSrc, /loadCard8ValidationReport/);
    assert.match(serverSrc, /card8GoliveReady/);
    assert.match(serverSrc, /business_date/);
    assert.match(serverSrc, /canActivateSet1/);
  });

  it("shows preflight and invokes activatePmsSet1 without another writer", () => {
    assert.match(section, /Card8ActivationTab/);
    assert.match(section, /restaurantId=\{restaurantId\}/);
    assert.doesNotMatch(section, /activateCard8Property|saveCard8Activation/);
    assert.match(tab, /activatePmsSet1/);
    assert.match(tab, /pms_set1_live/);
    assert.match(tab, /getCard8ActivationEligibility/);
    assert.match(tab, /explicitConfirmation: confirmed/);
    assert.match(tab, /System Validation/);
    assert.match(tab, /Go-Live readiness/);
    assert.match(tab, /Business date/);
    assert.match(tab, /Blockers/);
    assert.match(tab, /Warnings/);
    assert.doesNotMatch(tab, /createServerFn|pms_set1_live:\s*true/);
    assert.doesNotMatch(tab, /activateCard8Property|Lock Configuration|pms_property_live/);
  });
});
