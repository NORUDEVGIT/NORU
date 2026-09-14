import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canActivateSet1,
  canEditSet1,
  emptyIdentity,
  emptyOps,
  emptyPolicies,
  emptyTaxes,
  evaluateSet1Checklist,
  SET1_COMING_SOON,
  SET1_FOUNDATION_CHIP,
  SET1_LIVE_CARDS,
} from "./pms-set1-foundation.ts";
import { completeSet2Activate } from "./pms-set2-structure.ts";
import { completeSet3Activate } from "./pms-set3-rates-guest.ts";
import { completeSet4Activate } from "./pms-set4-hk-inventory.ts";
import { completeSet5Activate } from "./pms-set5-depts-guestsvc.ts";
import {
  SET6_AUDIT_ACCOUNT_TYPE,
  SET6_AUDIT_DISTRIBUTION_CHANNEL,
  SET6_AUDIT_DISTRIBUTION_MAPPING,
  SET6_AUDIT_EVENT_TYPE,
  SET6_AUDIT_FUNCTION_SPACE,
  SET6_AUDIT_MARKET_SEGMENT,
  SET6_AUDIT_OFFLINE_ENABLEMENT,
  SET6_AUDIT_OFFLINE_SYNC,
  SET6_AUDIT_REPORTS_CATALOGUE,
  SET6_AUDIT_REPORTS_SCHEDULE,
  SET6_AUDIT_SALES_CHANNEL,
  SET6_AUDIT_SOURCE_CODE,
  SET6_CHANNEL_WARNING,
  SET6_CORPORATE_FOUNDATION,
  SET6_DIRECT_LIVE_NOTE,
  SET6_DISTRIBUTION_HREF,
  SET6_DISTRIBUTION_UNAVAILABLE,
  SET6_GDS_FOUNDATION,
  SET6_MAPPING_WARNING,
  SET6_OFFLINE_ENABLE_WARNING,
  SET6_OFFLINE_INTENT_ONLY,
  SET6_OFFLINE_SYNC_WARNING,
  SET6_OFFLINE_UNAVAILABLE,
  SET6_OTA_FOUNDATION,
  SET6_REPORTS_CATALOGUE_WARNING,
  SET6_REPORTS_HREF,
  SET6_REPORTS_NO_BI,
  SET6_REPORTS_SCHEDULE_WARNING,
  SET6_REPORTS_UNAVAILABLE,
  SET6_SALES_HREF,
  SET6_SALES_PLANNED,
  SET6_SALES_UNAVAILABLE,
  SET6_SALES_WARNING,
  completeSet6Activate,
  distributionHonestyRows,
  emptySet6Activate,
  evaluateDistribution,
  evaluateOfflineSync,
  evaluateReports,
  evaluateSalesEvents,
  neverFakeConnectedOta,
  neverFakeOfflineReady,
  set6MandatoryMissing,
} from "./pms-set6-sales-distribution.ts";

const completeIdentity = emptyIdentity({
  name: "Harbour House",
  timezone: "Europe/London",
  currencyCode: "GBP",
  propertyCode: "HH",
  legalName: "Harbour House Ltd",
  propertyType: "hotel",
  taxIdentities: [{ label: "VAT", value: "GB123" }],
});
const completeOps = emptyOps({ checkInTime: "15:00", checkOutTime: "11:00" });
const completeTaxes = emptyTaxes({ taxInclusive: false, taxName: "VAT", taxRate: 20 });
const completePolicies = emptyPolicies({
  fees: {
    cancelFeeRequired: true,
    cancelFeeDefault: 0,
    noshowFeeRequired: true,
    noshowFeeDefault: 25,
  },
});

function foundationReady(set6 = completeSet6Activate(), role = "owner") {
  return evaluateSet1Checklist({
    identity: completeIdentity,
    ops: completeOps,
    taxes: completeTaxes,
    policies: completePolicies,
    foundationColumnsAvailable: true,
    pmsSet1Live: false,
    role,
    set2: completeSet2Activate(),
    set3: completeSet3Activate(),
    set4: completeSet4Activate(),
    set5: completeSet5Activate(),
    set6,
  });
}

describe("PMS-SET6 Warning-only catalogues and posture", () => {
  it("keeps empty sales catalogues as Warning and Complete when one active sales or event row exists", () => {
    const empty = evaluateSalesEvents(
      emptySet6Activate({ salesCataloguesAvailable: true, eventTypesAvailable: true }),
    );
    assert.equal(empty.readiness, "warning");
    assert.ok(empty.warnings.includes(SET6_SALES_WARNING));
    assert.deepEqual(empty.missing, []);

    assert.equal(
      evaluateSalesEvents(
        emptySet6Activate({ salesCataloguesAvailable: true, eventTypesAvailable: true, activeMarketSegmentCount: 1 }),
      ).readiness,
      "complete",
    );
    assert.equal(
      evaluateSalesEvents(
        emptySet6Activate({ salesCataloguesAvailable: true, eventTypesAvailable: true, activeSourceCodeCount: 1 }),
      ).readiness,
      "complete",
    );
    assert.equal(
      evaluateSalesEvents(
        emptySet6Activate({ salesCataloguesAvailable: false, eventTypesAvailable: true, activeEventTypeCount: 1 }),
      ).readiness,
      "complete",
    );

    const unsavedDistribution = evaluateDistribution(emptySet6Activate({ distributionAvailable: true }));
    assert.equal(unsavedDistribution.readiness, "warning");
    assert.ok(unsavedDistribution.warnings.includes(SET6_CHANNEL_WARNING));
    assert.ok(unsavedDistribution.warnings.includes(SET6_MAPPING_WARNING));
    assert.equal(
      evaluateDistribution(emptySet6Activate({ distributionAvailable: true, channelPostureSaved: true, mappingPostureSaved: true }))
        .readiness,
      "complete",
    );

    const unsavedReports = evaluateReports(emptySet6Activate({ reportsAvailable: true }));
    assert.equal(unsavedReports.readiness, "warning");
    assert.ok(unsavedReports.warnings.includes(SET6_REPORTS_CATALOGUE_WARNING));
    assert.ok(unsavedReports.warnings.includes(SET6_REPORTS_SCHEDULE_WARNING));
    assert.equal(
      evaluateReports(emptySet6Activate({ reportsAvailable: true, reportsCatalogueSaved: true, reportsScheduleSaved: true }))
        .readiness,
      "complete",
    );

    const unsavedOffline = evaluateOfflineSync(emptySet6Activate({ offlineAvailable: true }));
    assert.equal(unsavedOffline.readiness, "warning");
    assert.ok(unsavedOffline.warnings.includes(SET6_OFFLINE_ENABLE_WARNING));
    assert.ok(unsavedOffline.warnings.includes(SET6_OFFLINE_SYNC_WARNING));
    assert.equal(
      evaluateOfflineSync(emptySet6Activate({ offlineAvailable: true, offlineEnablementSaved: true, offlineSyncSaved: true }))
        .readiness,
      "complete",
    );
  });
});

describe("PMS-SET6 no new Activate Incomplete blockers", () => {
  it("never adds SET6 missing to Activate and keeps SET1–5 mandatory", () => {
    const missing0052 = foundationReady(emptySet6Activate());
    assert.deepEqual(set6MandatoryMissing(emptySet6Activate()), []);
    assert.equal(missing0052.canActivate, true);
    assert.equal(missing0052.domains["sales-events"].readiness, "warning");
    assert.ok(missing0052.domains["sales-events"].warnings.includes(SET6_SALES_UNAVAILABLE));
    assert.ok(missing0052.domains.distribution.warnings.includes(SET6_DISTRIBUTION_UNAVAILABLE));
    assert.ok(missing0052.domains.reports.warnings.includes(SET6_REPORTS_UNAVAILABLE));
    assert.ok(missing0052.domains["offline-sync"].warnings.includes(SET6_OFFLINE_UNAVAILABLE));
    assert.ok(!missing0052.mandatoryMissing.includes("Market segment"));
    assert.ok(!missing0052.mandatoryMissing.includes("Source code"));
    assert.ok(!missing0052.mandatoryMissing.includes("Event type"));
    assert.ok(!missing0052.mandatoryMissing.includes("Distribution"));
    assert.ok(!missing0052.mandatoryMissing.includes("Reports"));
    assert.ok(!missing0052.mandatoryMissing.includes("Offline"));
  });
});

describe("PMS-SET6 single Activate and checklist expand", () => {
  it("keeps one pms_set1_live flag and does not let SET6 warnings block Activate", () => {
    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(owner.overall, "warning");
    assert.equal(canActivateSet1("owner"), true);

    const manager = foundationReady(completeSet6Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);
  });
});

describe("PMS-SET6 hub unmute and Coming soon cleared", () => {
  it("promotes four Live cards and clears Coming soon entirely", () => {
    assert.equal(SET6_SALES_HREF, "/restaurant/pms/sales-events");
    assert.equal(SET6_DISTRIBUTION_HREF, "/restaurant/pms/distribution");
    assert.equal(SET6_REPORTS_HREF, "/restaurant/pms/reports");
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "sales-events" && card.title === "Sales & events"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "distribution" && card.title === "Distribution"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "reports" && card.title === "Reports"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "offline-sync" && card.title === "Offline & sync"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Banks"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Roles"));
    assert.deepEqual(SET1_COMING_SOON, []);
    assert.equal(SET1_FOUNDATION_CHIP, "Foundation");

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Set6SalesEventsSection/);
    assert.match(hub, /Set6DistributionSection/);
    assert.match(hub, /Set6ReportsSection/);
    assert.match(hub, /Set6OfflineSyncSection/);
    assert.match(hub, /SET1_FOUNDATION_CHIP/);
    assert.match(hub, /Show all/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    assert.doesNotMatch(hub, /overbooking/i);

    const section = readFileSync(new URL("../components/settings/pms-set6-section.tsx", import.meta.url), "utf8");
    assert.match(section, /SET6_SALES_HREF/);
    assert.match(section, /SET6_DISTRIBUTION_HREF/);
    assert.match(section, /SET6_REPORTS_HREF/);
    assert.match(section, /Open sales/);
    assert.match(section, /Open distribution/);
    assert.match(section, /Open reports/);
    assert.doesNotMatch(section, /Open offline/i);
    assert.doesNotMatch(section, /Offline Ready/i);
    assert.match(section, /SET6_OFFLINE_INTENT_ONLY/);
    assert.match(section, /SET6_SALES_PLANNED/);
    assert.doesNotMatch(section, /FO-CHROME1/);
    assert.doesNotMatch(section, /overbooking/i);
    assert.doesNotMatch(section, /Sales CRM/i);
    assert.doesNotMatch(section, /channel manager is live/i);
  });
});

describe("PMS-SET6 distribution and offline honesty", () => {
  it("keeps Direct Live, OTA Foundation, and never fakes Offline Ready", () => {
    const rows = distributionHonestyRows();
    assert.equal(rows[0]?.status, "live");
    assert.match(rows[0]?.note ?? "", /Direct booking is live/);
    assert.equal(rows[1]?.status, "warning");
    assert.equal(SET6_DIRECT_LIVE_NOTE.includes("Direct booking is live"), true);
    assert.equal(SET6_OTA_FOUNDATION.includes("not connected"), true);
    assert.ok(neverFakeConnectedOta(SET6_OTA_FOUNDATION));
    assert.ok(neverFakeConnectedOta(SET6_GDS_FOUNDATION));
    assert.ok(neverFakeConnectedOta(SET6_CORPORATE_FOUNDATION));
    assert.ok(neverFakeOfflineReady(SET6_OFFLINE_INTENT_ONLY));
    assert.equal(SET6_REPORTS_NO_BI.includes("not a BI rebuild"), true);
  });
});

describe("PMS-SET6 no second Activate and FO-CHROME1 / overbooking out", () => {
  it("does not add pms_set6_live or later-wave forms", () => {
    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_set6_live/);
    assert.match(activate, /SET6_AUDIT_ACTIONS/);

    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(chrome, /FO-CHROME1/);
    assert.equal(SET6_AUDIT_MARKET_SEGMENT, "pms_set6_market_segment_updated");
    assert.equal(SET6_AUDIT_SOURCE_CODE, "pms_set6_source_code_updated");
    assert.equal(SET6_AUDIT_SALES_CHANNEL, "pms_set6_sales_channel_updated");
    assert.equal(SET6_AUDIT_ACCOUNT_TYPE, "pms_set6_account_type_updated");
    assert.equal(SET6_AUDIT_EVENT_TYPE, "pms_set6_event_type_updated");
    assert.equal(SET6_AUDIT_FUNCTION_SPACE, "pms_set6_function_space_updated");
    assert.equal(SET6_AUDIT_DISTRIBUTION_CHANNEL, "pms_set6_distribution_channel_updated");
    assert.equal(SET6_AUDIT_DISTRIBUTION_MAPPING, "pms_set6_distribution_mapping_updated");
    assert.equal(SET6_AUDIT_REPORTS_CATALOGUE, "pms_set6_reports_catalogue_updated");
    assert.equal(SET6_AUDIT_REPORTS_SCHEDULE, "pms_set6_reports_schedule_updated");
    assert.equal(SET6_AUDIT_OFFLINE_ENABLEMENT, "pms_set6_offline_enablement_updated");
    assert.equal(SET6_AUDIT_OFFLINE_SYNC, "pms_set6_offline_sync_updated");
  });
});

describe("PMS-SET6 migration 0052 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes and does not apply live", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0052_pms_set6_sales_distribution_reports_offline.sql");
    const supabase = join(here, "../../../../supabase/migrations/0052_pms_set6_sales_distribution_reports_offline.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /pms_market_segments/);
    assert.match(drizzleSql, /pms_source_codes/);
    assert.match(drizzleSql, /pms_sales_channel_labels/);
    assert.match(drizzleSql, /pms_account_type_labels/);
    assert.match(drizzleSql, /pms_event_types/);
    assert.match(drizzleSql, /pms_function_space_labels/);
    assert.match(drizzleSql, /pms_distribution_channel_posture/);
    assert.match(drizzleSql, /pms_distribution_mapping_posture/);
    assert.match(drizzleSql, /pms_reports_catalogue_posture/);
    assert.match(drizzleSql, /pms_reports_schedule_access_posture/);
    assert.match(drizzleSql, /pms_offline_enablement_posture/);
    assert.match(drizzleSql, /pms_offline_sync_posture/);
    assert.doesNotMatch(drizzleSql, /SECURITY DEFINER/i);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_market_segments/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_source_codes/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_event_types/);
    assert.doesNotMatch(drizzleSql, /overbooking/i);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
    assert.match(drizzleSql, /APPLY AFTER MERGE/i);
  });
});
