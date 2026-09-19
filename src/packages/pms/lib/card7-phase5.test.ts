import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { emptyAuditSnapshot } from "./audit-card7.server.ts";
import {
  CARD7_INTEGRITY_COPY,
  CARD7_PROGRAMME_CARD_ID,
  buildCard7ValidationReport,
  card7FinishActivatesProperty,
  evaluateCard7Integrity,
  evaluateCard7Overall,
  laterCard7TabSlice,
  mergeCard7Status,
} from "./card7-readiness.server.ts";
import { emptyImportSnapshot } from "./import-card7.server.ts";
import { emptyPropertySetupStatus } from "./pms-property-setup-card1.ts";
import { CARD7_PROGRAMME_CARD_ID as PROGRAMME_ID } from "./pms-property-setup-card7.ts";
import { emptyReportsSnapshot } from "./reports-card7.server.ts";
import { emptySecuritySnapshot } from "./security-roles-card7.server.ts";

const complete = {
  ready: true,
  status: "complete" as const,
  blockers: [] as string[],
  warnings: [] as string[],
};
const notStarted = laterCard7TabSlice();

describe("Card 7 Phase 5 overall readiness", () => {
  it("completes only when all four domains are ready and never activates the property", () => {
    assert.equal(card7FinishActivatesProperty(), false);
    assert.equal(PROGRAMME_ID, "sales-distribution");
    assert.equal(CARD7_PROGRAMME_CARD_ID, "sales-distribution");

    const allReady = evaluateCard7Overall(complete, complete, complete, complete);
    assert.equal(allReady.ready, true);
    assert.equal(allReady.status, "complete");
    const stored = mergeCard7Status(
      emptyPropertySetupStatus({
        cards: { "property-business": "complete", "rooms-inventory": "in_progress" },
      }),
      allReady,
    );
    assert.equal(stored.cards[CARD7_PROGRAMME_CARD_ID], "complete");
    assert.equal(stored.cards["property-business"], "complete");
    assert.equal(stored.cards["rooms-inventory"], "in_progress");

    const mixed = evaluateCard7Overall(complete, notStarted, notStarted, notStarted);
    assert.equal(mixed.ready, false);
    assert.equal(mixed.status, "in_progress");

    const untouched = evaluateCard7Overall(notStarted, notStarted, notStarted, notStarted);
    assert.equal(untouched.ready, false);
    assert.equal(untouched.status, "not_started");
  });

  it("marks Validate overall PASS from four ready snapshots and PARTIAL from one domain", () => {
    const fourReady = buildCard7ValidationReport({
      security: {
        ...emptySecuritySnapshot(),
        roles: [
          {
            id: "role-1",
            code: "FO",
            name: "Front office",
            description: "",
            departmentId: "dept-1",
            active: true,
          },
        ],
        permissions: [
          {
            id: "perm-1",
            code: "front_office.reservation.view",
            module: "front_office",
            functionKey: "reservation",
            action: "view",
            name: "View",
            description: "",
            sensitive: false,
            active: true,
          },
        ],
        mappings: [
          {
            id: "map-1",
            roleId: "role-1",
            permissionId: "perm-1",
            allowed: true,
            dataScope: "property",
          },
        ],
        departments: [{ id: "dept-1", name: "Front office", code: "FO", active: true }],
        memberships: [
          {
            membershipId: "mem-1",
            userId: "user-1",
            name: "Ada",
            staffRole: "receptionist",
            hotelRoleId: "role-1",
            active: true,
          },
        ],
      },
      audit: emptyAuditSnapshot({
        policy: {
          exists: true,
          enabled: true,
          retentionDays: 365,
          maskIdNumbers: true,
          restrictGuestExport: false,
          active: true,
        },
        categories: [
          { id: "iam", code: "iam", name: "IAM", description: "", defaultSeverity: "critical", active: true },
          {
            id: "guest_privacy",
            code: "guest_privacy",
            name: "Privacy",
            description: "",
            defaultSeverity: "critical",
            active: true,
          },
          {
            id: "cashiering",
            code: "cashiering",
            name: "Cashiering",
            description: "",
            defaultSeverity: "critical",
            active: true,
          },
          {
            id: "night_audit",
            code: "night_audit",
            name: "Night audit",
            description: "",
            defaultSeverity: "critical",
            active: true,
          },
        ],
        categorySettings: ["iam", "guest_privacy", "cashiering", "night_audit"].map((code) => ({
          id: `set-${code}`,
          categoryId: code,
          enabled: true,
          severity: "critical" as const,
          critical: true,
        })),
        sensitivePermissions: [
          { id: "p1", code: "administration.staff.edit", name: "Edit staff", module: "administration", active: true },
        ],
        coverage: [{ id: "c1", permissionId: "p1", coverage: "required", notes: "" }],
      }),
      reports: emptyReportsSnapshot({
        categories: [
          { id: "operational", code: "operational", name: "Operational", description: "", active: true },
          { id: "financial", code: "financial", name: "Financial", description: "", active: true },
          { id: "occupancy", code: "occupancy", name: "Occupancy", description: "", active: true },
          { id: "revenue", code: "revenue", name: "Revenue", description: "", active: true },
          { id: "management", code: "management", name: "Management", description: "", active: true },
        ],
        definitions: [
          {
            id: "d-op",
            code: "operational",
            categoryId: "operational",
            name: "Operational",
            description: "",
            queryKey: "getBookingsDashboard",
            active: true,
          },
          {
            id: "d-fin",
            code: "financial",
            categoryId: "financial",
            name: "Financial",
            description: "",
            queryKey: "getCashieringDashboard",
            active: true,
          },
          {
            id: "d-occ",
            code: "occupancy",
            categoryId: "occupancy",
            name: "Occupancy",
            description: "",
            queryKey: "getBookingsDashboard",
            active: true,
          },
          {
            id: "d-rev",
            code: "revenue",
            categoryId: "revenue",
            name: "Revenue",
            description: "",
            queryKey: "getRevenueOverview",
            active: true,
          },
          {
            id: "d-mgmt",
            code: "management",
            categoryId: "management",
            name: "Management",
            description: "",
            queryKey: "listNightAuditRuns",
            active: true,
          },
        ],
        definitionSettings: ["d-op", "d-fin", "d-occ", "d-rev", "d-mgmt"].map((id) => ({
          id: `s-${id}`,
          definitionId: id,
          enabled: true,
        })),
        metrics: [
          {
            id: "m-or",
            code: "occupancy_range",
            name: "Occupancy range",
            description: "",
            queryKey: "getRevenueOverview",
            formulaNotes: "sold / available",
            unit: "percent",
            active: true,
          },
          {
            id: "m-oi",
            code: "occupancy_in_house",
            name: "In house",
            description: "",
            queryKey: "getBookingsDashboard",
            formulaNotes: "staying / sellable",
            unit: "percent",
            active: true,
          },
          {
            id: "m-adr",
            code: "adr",
            name: "ADR",
            description: "",
            queryKey: "getRevenueOverview",
            formulaNotes: "revenue / sold",
            unit: "amount",
            active: true,
          },
          {
            id: "m-revpar",
            code: "revpar",
            name: "RevPAR",
            description: "",
            queryKey: "getRevenueOverview",
            formulaNotes: "revenue / available",
            unit: "amount",
            active: true,
          },
        ],
        metricSettings: ["m-or", "m-oi", "m-adr", "m-revpar"].map((id) => ({
          id: `ms-${id}`,
          metricId: id,
          enabled: true,
          displayName: "",
        })),
        permissions: [
          { id: "rp1", code: "reports.pms.view", name: "View", action: "view", active: true },
        ],
        permissionMappings: ["d-op", "d-fin", "d-occ", "d-rev", "d-mgmt"].map((id) => ({
          id: `map-${id}`,
          definitionId: id,
          permissionId: "rp1",
        })),
        policy: {
          exists: true,
          exportAllowed: true,
          exportCsv: true,
          exportPdf: false,
          maskGuestNames: true,
          ownerManagerExportOnly: true,
          defaultDateRangeDays: 30,
          scheduleIntentEnabled: false,
          scheduleCadence: null,
          periodBasis: "business_date",
          active: true,
        },
      }),
      importDomain: emptyImportSnapshot({
        types: [
          { id: "t-guest", code: "guest", name: "Guest", description: "", handlerKey: "createGuest", active: true },
        ],
        typeSettings: [{ id: "ts-guest", importTypeId: "t-guest", enabled: true }],
        fields: [
          {
            id: "f-first",
            importTypeId: "t-guest",
            code: "first_name",
            name: "First name",
            required: true,
            valueKind: "text",
            active: true,
          },
        ],
        templates: [
          {
            id: "tpl-guest",
            importTypeId: "t-guest",
            name: "Guest template",
            active: true,
            fields: [
              {
                id: "mf-first",
                templateId: "tpl-guest",
                fieldDefinitionId: "f-first",
                sourceColumn: "first_name",
              },
            ],
          },
        ],
        validationRules: [
          {
            id: "vr-guest",
            importTypeId: "t-guest",
            fieldCode: "first_name",
            ruleKind: "required",
            enabled: true,
          },
        ],
        duplicatePolicies: [
          { id: "dup-guest", importTypeId: "t-guest", matchKeys: "email,phone", action: "warn" },
        ],
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
      }),
    });
    assert.equal(fourReady.security.verdict, "PASS");
    assert.equal(fourReady.audit.verdict, "PASS");
    assert.equal(fourReady.reports.verdict, "PASS");
    assert.equal(fourReady.importDomain.verdict, "PASS");
    assert.equal(fourReady.integrity.verdict, "PASS");
    assert.equal(fourReady.overall.verdict, "PASS");
    assert.equal(fourReady.overall.status, "complete");
    assert.ok(fourReady.integrity.warnings.includes(CARD7_INTEGRITY_COPY));

    const oneReady = evaluateCard7Overall(complete, laterCard7TabSlice(), laterCard7TabSlice(), laterCard7TabSlice());
    assert.equal(oneReady.ready, false);
    assert.equal(oneReady.status, "in_progress");
  });

  it("fails integrity when a report query or import type is outside Card 7 ownership", () => {
    const reports = emptyReportsSnapshot({
      definitions: [
        {
          id: "rogue",
          code: "rogue",
          categoryId: "x",
          name: "Rogue",
          description: "",
          queryKey: "executeAnything",
          active: true,
        },
      ],
    });
    const importDomain = emptyImportSnapshot({
      types: [
        {
          id: "res",
          code: "reservation",
          name: "Reservation",
          description: "",
          handlerKey: "createReservation",
          active: true,
        },
      ],
    });
    const integrity = evaluateCard7Integrity(reports, importDomain);
    assert.equal(integrity.ready, false);
    assert.match(integrity.blockers.join(" "), /unsupported query key/);
    assert.match(integrity.blockers.join(" "), /not a supported Card 7 handler/);
    const report = buildCard7ValidationReport({
      security: emptySecuritySnapshot(),
      audit: emptyAuditSnapshot(),
      reports,
      importDomain,
    });
    assert.equal(report.integrity.verdict, "PARTIAL");
    assert.equal(report.overall.ready, false);
  });
});

describe("Card 7 Phase 5 ownership and Validate", () => {
  it("keeps Validate read-only and stores programme status on sales-distribution only", () => {
    const validation = readFileSync(
      new URL("./pms-property-setup-card7.functions.ts", import.meta.url),
      "utf8",
    );
    const persist = readFileSync(new URL("./card7-readiness.functions.ts", import.meta.url), "utf8");
    const section = readFileSync(
      new URL("../components/settings/pms-property-setup-card7-section.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(validation, /persistCard7Overall/);
    assert.doesNotMatch(validation, /\.update\(/);
    assert.match(validation, /buildCard7ValidationReport/);
    assert.match(persist, /persistCard7Overall/);
    assert.match(persist, /pms_property_setup_status/);
    assert.match(section, /Checking overall status/);
    assert.match(section, /Integrity/);
    assert.match(section, /focus-visible:ring-\[#C89933\]/);
    assert.match(section, /overflow-x-auto/);
    assert.match(section, /pms-card7-overall-validate/);
  });

  it("does not rewrite live authz, Card 5, types.ts, import execution or report runners", () => {
    const files = [
      "./pms-property-setup-card7.functions.ts",
      "./card7-readiness.functions.ts",
      "./card7-readiness.server.ts",
      "./security-roles-card7.functions.ts",
      "./audit-card7.functions.ts",
      "./reports-card7.functions.ts",
      "./import-card7.functions.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    const joined = files.join("\n");
    assert.doesNotMatch(joined, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.doesNotMatch(joined, /from\("staff_module_access"\)/);
    assert.doesNotMatch(joined, /integrations\/supabase\/types\.ts/);
    assert.doesNotMatch(joined, /mergeGuests|createReservation/);
    assert.doesNotMatch(joined, /getRevenueOverview\(/);
    assert.doesNotMatch(joined, /papaparse|exceljs|cron\.schedule|pg_cron/);
    const reports = readFileSync(new URL("./reports-card7.functions.ts", import.meta.url), "utf8");
    assert.match(reports, /fiscal_year_start_month/);
    assert.match(reports, /from\("pms_financial_settings"\)\s*\n\s*\.select\(/);
    assert.doesNotMatch(reports, /pms_financial_settings[\s\S]{0,80}\.update\(/);
    const set5 = readFileSync(new URL("./pms-set5-depts-guestsvc.functions.ts", import.meta.url), "utf8");
    const set6 = readFileSync(new URL("./pms-set6-sales-distribution.functions.ts", import.meta.url), "utf8");
    assert.match(set5, /pms_audit_retention_posture/);
    assert.match(set5, /upsertAuditPolicyFromSet5/);
    assert.match(set6, /pms_reports_catalogue_posture/);
    assert.match(set6, /syncCard7DefinitionsFromSet6/);
    assert.match(set6, /syncCard7PolicyFromSet6/);
  });
});
