import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyFunctionSpace,
  emptyPackageTemplate,
  emptyPipelineStage,
  emptySalesItem,
  emptySalesSnapshot,
  evaluateCard5SalesReadiness,
} from "./sales-events-card5.server.ts";

describe("Card 5 Sales & Events readiness", () => {
  it("scores only this domain and does not require live operational records", () => {
    assert.equal(evaluateCard5SalesReadiness(emptySalesSnapshot()).status, "not_started");
    const ready = evaluateCard5SalesReadiness({
      ...emptySalesSnapshot(),
      marketSegments: [emptySalesItem({ id: "m", code: "CORP", name: "Corporate" })],
      sourceCodes: [emptySalesItem({ id: "s", code: "WEB", name: "Website" })],
      leadTypes: [emptySalesItem({ id: "l", code: "INQ", name: "Inquiry" })],
      eventTypes: [emptySalesItem({ id: "e", code: "WED", name: "Wedding" })],
      eventStatuses: [
        { id: "st", code: "TENT", name: "Tentative", description: "", sortOrder: 1, active: true },
      ],
      functionSpaces: [
        emptyFunctionSpace({ id: "f", code: "BALL", name: "Ballroom", outletIds: ["o1"] }),
      ],
      pipelineStages: [emptyPipelineStage({ id: "p", code: "LEAD", name: "Lead" })],
      facilities: [{ id: "o1", name: "Grand Ballroom", active: true }],
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.status, "complete");
    const duplicateSort = evaluateCard5SalesReadiness({
      ...readySnapshot(),
      pipelineStages: [
        emptyPipelineStage({ id: "p1", code: "LEAD", name: "Lead", sortOrder: 1 }),
        emptyPipelineStage({ id: "p2", code: "WON", name: "Won", sortOrder: 1 }),
      ],
    });
    assert.ok(duplicateSort.blockers.some((row) => /sort order/i.test(row)));
    assert.equal(
      evaluateCard5SalesReadiness({
        ...readySnapshot(),
        packageTemplates: [
          emptyPackageTemplate({
            id: "pkg",
            code: "PKG",
            name: "Banquet",
            validFrom: "2026-12-01",
            validTo: "2026-01-01",
          }),
        ],
      }).ready,
      false,
    );
  });
});

function readySnapshot() {
  return {
    ...emptySalesSnapshot(),
    marketSegments: [emptySalesItem({ id: "m", code: "CORP", name: "Corporate" })],
    sourceCodes: [emptySalesItem({ id: "s", code: "WEB", name: "Website" })],
    leadTypes: [emptySalesItem({ id: "l", code: "INQ", name: "Inquiry" })],
    eventTypes: [emptySalesItem({ id: "e", code: "WED", name: "Wedding" })],
    eventStatuses: [
      { id: "st", code: "TENT", name: "Tentative", description: "", sortOrder: 1, active: true },
    ],
    functionSpaces: [
      emptyFunctionSpace({ id: "f", code: "BALL", name: "Ballroom", outletIds: ["o1"] }),
    ],
    pipelineStages: [emptyPipelineStage({ id: "p", code: "LEAD", name: "Lead" })],
    facilities: [{ id: "o1", name: "Grand Ballroom", active: true }],
  };
}

describe("Card 5 Sales & Events ownership", () => {
  it("writes SET6 and 0079 setup tables only", () => {
    const functions = readFileSync(
      new URL("./sales-events-card5.functions.ts", import.meta.url),
      "utf8",
    );
    const tab = readFileSync(
      new URL("../components/settings/pms-card5-sales-events-tab.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /from\("pms_market_segments"\)/);
    assert.match(functions, /from\("pms_source_codes"\)/);
    assert.match(functions, /from\("pms_event_types"\)/);
    assert.match(functions, /from\("pms_function_space_labels"\)/);
    assert.match(functions, /from\("pms_function_space_outlets"\)/);
    assert.match(functions, /from\("pms_lead_types"\)/);
    assert.match(functions, /from\("pms_event_package_templates"\)/);
    assert.match(functions, /from\("pms_event_contract_defaults"\)/);
    assert.match(functions, /from\("fo_service_catalogue"\)/);
    assert.match(functions, /from\("pms_outlets"\)/);
    assert.match(functions, /restaurant_staff_audit_log/);
    assert.match(functions, /canEditSet1/);
    assert.doesNotMatch(functions, /from\("pms_packages"\)/);
    assert.doesNotMatch(functions, /from\("pms_corporate_agreements"\)/);
    for (const source of [functions, tab]) {
      assert.doesNotMatch(source, /pms_property_setup_status/);
      assert.doesNotMatch(source, /from\("pms_leads"\)/);
    }
  });
});
