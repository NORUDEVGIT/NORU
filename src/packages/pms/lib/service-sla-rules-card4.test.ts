import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyServiceSlaRuleDraft,
  formatDurationMinutes,
  parsePositiveMinutes,
  selectableSlaServiceTypes,
  serviceSlaRulesConfigured,
  validateServiceSlaRuleDraft,
  type ServiceSlaRuleRecord,
} from "./service-sla-rules-card4.server.ts";
import type { ServiceTypeRecord } from "./service-types-card4.server.ts";

const functionsSrc = readFileSync(
  new URL("./service-sla-rules-card4.functions.ts", import.meta.url),
  "utf8",
);
const uiSrc = readFileSync(
  new URL("../components/settings/pms-card4-service-sla-rules.tsx", import.meta.url),
  "utf8",
);
const serviceType: ServiceTypeRecord = {
  id: "00000000-0000-4000-8000-000000000901",
  categoryId: "00000000-0000-4000-8000-000000000701",
  name: "Extra Towels",
  code: "HK_TOWELS",
  description: null,
  active: true,
  displayOrder: 1,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};
const rule: ServiceSlaRuleRecord = {
  id: "00000000-0000-4000-8000-000000001201",
  serviceTypeId: serviceType.id,
  responseMinutes: 15,
  resolutionMinutes: 120,
  active: true,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("Card 4 Guest Service Types SLA rules", () => {
  it("stores positive integer minutes and formats them readably", () => {
    assert.equal(parsePositiveMinutes("15"), 15);
    assert.equal(parsePositiveMinutes("0"), null);
    assert.equal(parsePositiveMinutes("-1"), null);
    assert.equal(parsePositiveMinutes("1.5"), null);
    assert.equal(formatDurationMinutes(15), "15 min");
    assert.equal(formatDurationMinutes(60), "1 hr");
    assert.equal(formatDurationMinutes(135), "2 hrs 15 min");
  });

  it("requires a valid type and both durations and prevents duplicate rules", () => {
    const empty = validateServiceSlaRuleDraft(emptyServiceSlaRuleDraft(), [], [serviceType]);
    assert.equal(
      empty.some((row) => row.field === "serviceTypeId"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "responseMinutes"),
      true,
    );
    assert.equal(
      empty.some((row) => row.field === "resolutionMinutes"),
      true,
    );

    const duplicate = validateServiceSlaRuleDraft(
      {
        ...emptyServiceSlaRuleDraft(serviceType.id),
        responseMinutes: "15",
        resolutionMinutes: "120",
      },
      [rule],
      [serviceType],
    );
    assert.equal(
      duplicate.some((row) => row.message === "This service type already has an SLA rule."),
      true,
    );
  });

  it("keeps an inactive current type editable but excludes it from new rules", () => {
    const inactive = { ...serviceType, active: false };
    assert.equal(selectableSlaServiceTypes([inactive]).length, 0);
    assert.equal(selectableSlaServiceTypes([inactive], inactive.id).length, 1);
    const errors = validateServiceSlaRuleDraft(
      {
        id: rule.id,
        serviceTypeId: inactive.id,
        responseMinutes: "15",
        resolutionMinutes: "120",
        active: true,
      },
      [rule],
      [inactive],
    );
    assert.equal(errors.length, 0);
  });

  it("is configured only with an active rule on an active service type", () => {
    assert.equal(serviceSlaRulesConfigured([rule], [serviceType]), true);
    assert.equal(serviceSlaRulesConfigured([{ ...rule, active: false }], [serviceType]), false);
    assert.equal(serviceSlaRulesConfigured([rule], [{ ...serviceType, active: false }]), false);
  });

  it("stays isolated from maintenance SLA, availability, and operational request types", () => {
    assert.match(functionsSrc, /pms_guest_service_sla_rules/);
    assert.doesNotMatch(functionsSrc, /pms_maintenance_sla/);
    assert.doesNotMatch(functionsSrc, /pms_guest_request_types/);
    assert.doesNotMatch(functionsSrc, /availability|working_hours|blackout/i);
    assert.match(uiSrc, /data-testid="card4-service-sla-rules"/);
    assert.match(uiSrc, /Response Time \(minutes\)/);
    assert.doesNotMatch(uiSrc, /Priority/);
  });
});
