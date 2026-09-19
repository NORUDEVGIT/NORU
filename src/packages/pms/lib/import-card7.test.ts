import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyAuditSnapshot } from "./audit-card7.server.ts";
import {
  buildCard7ValidationReport,
  evaluateCard7Overall,
} from "./card7-readiness.server.ts";
import {
  CARD7_IMPORT_NO_MERGE,
  CARD7_IMPORT_NO_RUNNER,
  CARD7_IMPORT_SETUP_ONLY,
  emptyImportSnapshot,
  evaluateCard7ImportReadiness,
  type Card7ImportSnapshot,
} from "./import-card7.server.ts";
import { emptySecuritySnapshot } from "./security-roles-card7.server.ts";

function readyImport(): Card7ImportSnapshot {
  const types = [
    ["guest", "createGuest"],
    ["room", "saveRoom"],
    ["room_type", "saveRoomType"],
    ["rate_category", "saveRateCategory"],
    ["rate_plan", "saveRatePlan"],
  ].map(([code, handlerKey]) => ({
    id: `type-${code}`,
    code,
    name: code,
    description: "",
    handlerKey,
    active: true,
  }));
  const fields = types.flatMap((type) => {
    const required =
      type.code === "guest"
        ? ["first_name"]
        : type.code === "room"
          ? ["room_number", "room_type_code"]
          : type.code === "room_type"
            ? ["code", "name", "max_occupancy"]
            : type.code === "rate_category"
              ? ["code", "name"]
              : ["code", "name", "rate_category_code", "room_type_code", "base_rate"];
    return required.map((code) => ({
      id: `field-${type.code}-${code}`,
      importTypeId: type.id,
      code,
      name: code,
      required: true,
      valueKind: "text" as const,
      active: true,
    }));
  });
  return emptyImportSnapshot({
    types,
    typeSettings: types.map((type) => ({
      id: `setting-${type.id}`,
      importTypeId: type.id,
      enabled: true,
    })),
    fields,
    templates: types.map((type) => ({
      id: `template-${type.id}`,
      importTypeId: type.id,
      name: `${type.code} template`,
      active: true,
      fields: fields
        .filter((field) => field.importTypeId === type.id)
        .map((field) => ({
          id: `map-${field.id}`,
          templateId: `template-${type.id}`,
          fieldDefinitionId: field.id,
          sourceColumn: field.code,
        })),
    })),
    validationRules: types.map((type) => ({
      id: `rule-${type.id}`,
      importTypeId: type.id,
      fieldCode: fields.find((field) => field.importTypeId === type.id)?.code ?? "code",
      ruleKind: "required" as const,
      enabled: true,
    })),
    duplicatePolicies: types.map((type) => ({
      id: `dup-${type.id}`,
      importTypeId: type.id,
      matchKeys: type.code === "guest" ? "email,phone" : "code",
      action: "warn" as const,
    })),
    policy: {
      exists: true,
      enabled: true,
      previewRequired: true,
      maxRows: 500,
      allowedFormat: "csv",
      ownerManagerExecuteOnly: true,
      active: true,
    },
    historyAvailable: true,
  });
}

describe("Card 7 Import readiness", () => {
  it("starts incomplete and describes non-execution", () => {
    const result = evaluateCard7ImportReadiness(emptyImportSnapshot());
    assert.equal(result.ready, false);
    assert.equal(result.status, "not_started");
    assert.ok(result.warnings.includes(CARD7_IMPORT_SETUP_ONLY));
    assert.ok(result.warnings.includes(CARD7_IMPORT_NO_RUNNER));
    assert.ok(result.warnings.includes(CARD7_IMPORT_NO_MERGE));
  });

  it("requires policy, enabled types, mappings, validation and duplicate policy", () => {
    const snapshot = readyImport();
    snapshot.policy = { ...snapshot.policy, enabled: false };
    snapshot.templates = [];
    const result = evaluateCard7ImportReadiness(snapshot);
    assert.equal(result.ready, false);
    assert.equal(result.status, "in_progress");
    assert.match(result.blockers.join(" "), /Save and enable a CSV import policy/);
    assert.match(result.blockers.join(" "), /Add an active mapping template/);
  });

  it("passes Import only and keeps whole Card 7 partial", () => {
    const importDomain = readyImport();
    const readiness = evaluateCard7ImportReadiness(importDomain);
    assert.equal(readiness.ready, true);
    assert.equal(readiness.status, "complete");
    const validation = buildCard7ValidationReport({
      security: emptySecuritySnapshot(),
      audit: emptyAuditSnapshot(),
      importDomain,
    });
    assert.equal(validation.importDomain.verdict, "PASS");
    assert.equal(validation.overall.verdict, "PARTIAL");
    const overall = evaluateCard7Overall(
      { ready: true, status: "complete", blockers: [], warnings: [] },
      { ready: true, status: "complete", blockers: [], warnings: [] },
      { ready: true, status: "complete", blockers: [], warnings: [] },
      readiness,
    );
    assert.equal(overall.ready, true);
    assert.equal(overall.status, "complete");
  });

  it("does not treat empty history as a blocker", () => {
    const snapshot = readyImport();
    snapshot.jobs = [];
    snapshot.jobIssues = [];
    const result = evaluateCard7ImportReadiness(snapshot);
    assert.equal(result.ready, true);
  });
});

describe("Card 7 Import ownership", () => {
  it("does not parse files, run imports, merge guests or write reservations", () => {
    const functions = readFileSync(new URL("./import-card7.functions.ts", import.meta.url), "utf8");
    const tab = readFileSync(
      new URL("../components/settings/pms-card7-import-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.match(functions, /pms_import_mapping_templates/);
    assert.doesNotMatch(functions, /papaparse|exceljs|xlsx|cron\.schedule/);
    assert.doesNotMatch(functions, /mergeGuests|createReservation|saveRateOverride/);
    assert.doesNotMatch(functions, /from\("guest_profiles"\)\.insert|from\("hotel_rooms"\)\.insert/);
    assert.doesNotMatch(tab, /papaparse|exceljs|mergeGuests|createReservation/);
    assert.match(tab, /No import runner/);
  });
});
