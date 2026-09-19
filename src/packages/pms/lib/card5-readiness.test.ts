import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  emptyDepartmentDraft,
  emptyOperatingHours,
  evaluateCard5DepartmentsReadiness,
} from "./departments-card5.server.ts";
import { emptyFacilityDraft, emptyFacilitiesSnapshot } from "./outlets-card5.server.ts";
import {
  emptyFunctionSpace,
  emptyPackageTemplate,
  emptyPipelineStage,
  emptySalesItem,
  emptySalesSnapshot,
  evaluateCard5SalesReadiness,
} from "./sales-events-card5.server.ts";
import {
  CARD5_PROGRAMME_CARD_ID,
  buildCard5ValidationReport,
  card5FinishActivatesProperty,
  card5Verdict,
  evaluateCard5Integrity,
  evaluateCard5Overall,
  mergeCard5Status,
} from "./card5-readiness.server.ts";
import {
  emptyPropertySetupStatus,
  evaluateProgrammeCardStatus,
} from "./pms-property-setup-card1.ts";

const completeSlice = {
  ready: true,
  status: "complete" as const,
  blockers: [],
  warnings: [],
};
const notStartedSlice = {
  ready: false,
  status: "not_started" as const,
  blockers: ["Add at least one active department."],
  warnings: [],
};
const inProgressSlice = {
  ready: false,
  status: "in_progress" as const,
  blockers: ["Needs work"],
  warnings: [],
};

function readyDepartment() {
  return emptyDepartmentDraft({
    id: "dept-1",
    code: "HK",
    name: "Housekeeping",
    operatingHours: emptyOperatingHours({ is24Hours: true }),
  });
}

function readyFacility() {
  return emptyFacilityDraft({
    id: "out-1",
    code: "CONF",
    name: "Conference Hall",
    facilityCategory: "events",
    facilityTypeCode: "conference_hall",
    departmentId: "dept-1",
    availabilityMode: "always_available",
    operatingHours: emptyOperatingHours({ is24Hours: true }),
  });
}

function readySales() {
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
      emptyFunctionSpace({ id: "f", code: "BALL", name: "Ballroom", outletIds: ["out-1"] }),
    ],
    pipelineStages: [emptyPipelineStage({ id: "p", code: "LEAD", name: "Lead" })],
    packageTemplates: [
      emptyPackageTemplate({ id: "pkg", code: "PKG", name: "Day package", outletIds: ["out-1"] }),
    ],
    facilities: [{ id: "out-1", name: "Conference Hall", active: true }],
  };
}

describe("Card 5 overall readiness", () => {
  it("completes only when all three domains are complete and integrity is clean", () => {
    assert.equal(card5Verdict("complete"), "PASS");
    assert.equal(card5Verdict("in_progress"), "PARTIAL");
    assert.equal(card5Verdict("not_started"), "FAIL");
    assert.equal(card5FinishActivatesProperty(), false);

    const allComplete = evaluateCard5Overall({
      departments: completeSlice,
      facilities: completeSlice,
      sales: completeSlice,
      integrity: completeSlice,
    });
    assert.equal(allComplete.status, "complete");
    assert.equal(allComplete.ready, true);

    const oneComplete = evaluateCard5Overall({
      departments: completeSlice,
      facilities: notStartedSlice,
      sales: notStartedSlice,
      integrity: completeSlice,
    });
    assert.equal(oneComplete.status, "in_progress");
    assert.equal(oneComplete.ready, false);

    const none = evaluateCard5Overall({
      departments: notStartedSlice,
      facilities: notStartedSlice,
      sales: notStartedSlice,
      integrity: completeSlice,
    });
    assert.equal(none.status, "not_started");

    const integrityFail = evaluateCard5Overall({
      departments: completeSlice,
      facilities: completeSlice,
      sales: completeSlice,
      integrity: inProgressSlice,
    });
    assert.equal(integrityFail.status, "in_progress");
    assert.equal(integrityFail.ready, false);
  });

  it("writes only the departments-services card key", () => {
    const stored = emptyPropertySetupStatus({
      cards: { "property-business": "complete", "rooms-inventory": "in_progress" },
      card1Steps: { identity: "complete" },
      card2Steps: { "room-types": "complete" },
    });
    const next = mergeCard5Status(stored, completeSlice);
    assert.equal(next.cards["departments-services"], "complete");
    assert.equal(next.cards["property-business"], "complete");
    assert.equal(next.cards["rooms-inventory"], "in_progress");
    assert.equal(next.card1Steps.identity, "complete");
    assert.equal(next.card2Steps?.["room-types"], "complete");
    assert.equal(
      evaluateProgrammeCardStatus("rooms-inventory", next, "complete"),
      "in_progress",
    );
    assert.equal(
      evaluateProgrammeCardStatus(CARD5_PROGRAMME_CARD_ID, next, "not_started"),
      "complete",
    );
    assert.equal(evaluateProgrammeCardStatus("property-business", next, "in_progress"), "in_progress");
    assert.equal(
      evaluateProgrammeCardStatus("rates-guest-rules", next, "complete"),
      "not_started",
    );
  });
});

describe("Card 5 integrity", () => {
  it("requires facility departments and sales outlet maps to match Card 5 masters", () => {
    const departments = { departments: [readyDepartment()], routing: [], staff: [] };
    const facilities = {
      ...emptyFacilitiesSnapshot(),
      facilities: [readyFacility()],
      departments: [{ id: "dept-1", name: "Housekeeping", active: true }],
    };
    const sales = readySales();
    assert.equal(evaluateCard5Integrity(departments, facilities, sales).ready, true);

    const unknownDept = evaluateCard5Integrity(
      { departments: [], routing: [], staff: [] },
      facilities,
      sales,
    );
    assert.ok(unknownDept.blockers.some((row) => /department is not a Card 5 department/i.test(row)));

    const unknownOutlet = evaluateCard5Integrity(departments, emptyFacilitiesSnapshot(), sales);
    assert.ok(unknownOutlet.blockers.some((row) => /not in Card 5/i.test(row)));
  });
});

describe("Card 5 validation report", () => {
  it("marks overall PASS only when every domain and integrity PASS", () => {
    const departments = { departments: [readyDepartment()], routing: [], staff: [] };
    const facilities = {
      ...emptyFacilitiesSnapshot(),
      facilities: [readyFacility()],
      departments: [{ id: "dept-1", name: "Housekeeping", active: true }],
    };
    const report = buildCard5ValidationReport(departments, facilities, readySales());
    assert.equal(evaluateCard5DepartmentsReadiness(departments).status, "complete");
    assert.equal(evaluateCard5SalesReadiness(readySales()).status, "complete");
    assert.equal(report.integrity.verdict, "PASS");
    assert.equal(report.overall.verdict, "PASS");

    const partial = buildCard5ValidationReport(departments, emptyFacilitiesSnapshot(), emptySalesSnapshot());
    assert.equal(partial.departments.verdict, "PASS");
    assert.equal(partial.facilities.verdict, "FAIL");
    assert.equal(partial.sales.verdict, "FAIL");
    assert.equal(partial.overall.verdict, "PARTIAL");
  });
});

describe("Card 5 Validate ownership", () => {
  it("keeps getCard5Validation read-only and does not own live operational tables", () => {
    const validate = readFileSync(
      new URL("./pms-property-setup-card5.functions.ts", import.meta.url),
      "utf8",
    );
    const persist = readFileSync(new URL("./card5-readiness.functions.ts", import.meta.url), "utf8");
    const dept = readFileSync(new URL("./departments-card5.functions.ts", import.meta.url), "utf8");
    const outlets = readFileSync(new URL("./outlets-card5.functions.ts", import.meta.url), "utf8");
    const sales = readFileSync(new URL("./sales-events-card5.functions.ts", import.meta.url), "utf8");
    assert.match(validate, /getCard5Validation/);
    assert.doesNotMatch(validate, /\.update\(/);
    assert.doesNotMatch(validate, /\.insert\(/);
    assert.match(persist, /pms_property_setup_status/);
    assert.match(persist, /cards\["departments-services"\]|CARD5_PROGRAMME_CARD_ID|mergeCard5Status/);
    for (const source of [validate, persist, dept, outlets, sales]) {
      assert.doesNotMatch(source, /from\("pms_packages"\)/);
      assert.doesNotMatch(source, /from\("pms_corporate_agreements"\)/);
      assert.doesNotMatch(source, /from\("pms_leads"\)/);
      assert.doesNotMatch(source, /from\("fo_guest_requests"\)/);
      assert.doesNotMatch(source, /from\("pms_routing_defaults"\)/);
      assert.doesNotMatch(source, /pms_set1_live/);
    }
    assert.match(sales, /from\("pms_market_segments"\)/);
    assert.match(sales, /from\("pms_outlets"\)/);
    assert.match(outlets, /from\("pms_outlets"\)/);
  });
});
