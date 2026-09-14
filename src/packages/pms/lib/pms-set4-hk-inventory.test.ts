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
  SET1_LIVE_CARDS,
} from "./pms-set1-foundation.ts";
import { completeSet2Activate } from "./pms-set2-structure.ts";
import { completeSet3Activate } from "./pms-set3-rates-guest.ts";
import { completeSet5Activate } from "./pms-set5-depts-guestsvc.ts";
import {
  SET4_AUDIT_CATEGORY,
  SET4_AUDIT_HK_CLEANING,
  SET4_AUDIT_HK_STATUS,
  SET4_AUDIT_OOO_OOS,
  SET4_AUDIT_PRIORITY,
  SET4_AUDIT_REASON,
  SET4_AUDIT_SLA,
  SET4_AUDIT_TYPE_TAG,
  SET4_CATEGORIES_WARNING,
  SET4_CLEANING_WARNING,
  SET4_HK_HREF,
  SET4_HK_UNAVAILABLE,
  SET4_HK_UNSAVED,
  SET4_MAINT_HREF,
  SET4_MAINT_UNAVAILABLE,
  SET4_OOO_UNSAVED,
  SET4_PRIORITIES_WARNING,
  SET4_REASONS_WARNING,
  SET4_RI_HREF,
  SET4_RI_UNAVAILABLE,
  SET4_SLA_WARNING,
  SET4_STOCK_HELPER_HREF,
  SET4_TAGS_WARNING,
  cleaningTypeAllowed,
  completeSet4Activate,
  emptyHkStatusRules,
  emptyOooOosPosture,
  emptySet4Activate,
  hkStatusMinComplete,
  hkStatusSaveBlocked,
  maintenanceCategoryAllowed,
  oooOosSaveBlocked,
  resolveCleaningTypesForCreate,
  resolveMaintenanceCategoriesForCreate,
  restrictionSaveBlocked,
} from "./pms-set4-hk-inventory.ts";

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

function foundationReady(set4 = completeSet4Activate(), role = "owner") {
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
    set4,
    set5: completeSet5Activate(),
  });
}

describe("PMS-SET4 HK status draft Incomplete", () => {
  it("prefills the live baseline as a draft and stays Incomplete until Save", () => {
    const draft = emptyHkStatusRules();
    assert.equal(draft.savedAt, null);
    assert.equal(hkStatusMinComplete(draft, true), false);
    assert.equal(hkStatusSaveBlocked({ ...draft, statuses: draft.statuses.map((row) => (row.code === "dirty" ? { ...row, active: false } : row)) }), "Dirty must stay active.");

    const unsaved = foundationReady(
      emptySet4Activate({
        hkColumnsAvailable: true,
        oooOosAvailable: true,
        oooOosSaved: true,
        restrictionReasonsAvailable: true,
        maintenanceAvailable: true,
        maintenanceCategoryCount: 1,
        maintenancePriorityCount: 1,
        maintenanceTypeTagCount: 1,
        maintenanceSlaSaved: true,
      }),
    );
    assert.equal(unsaved.domains["housekeeping-rules"].readiness, "incomplete");
    assert.ok(unsaved.domains["housekeeping-rules"].warnings.includes(SET4_HK_UNSAVED));
    assert.ok(unsaved.mandatoryMissing.includes("Housekeeping statuses"));
    assert.equal(unsaved.canActivate, false);

    const saved = emptyHkStatusRules({ savedAt: "2026-09-14T10:00:00.000Z" });
    assert.equal(hkStatusMinComplete(saved, true), true);
  });
});

describe("PMS-SET4 OOO/OOS mandatory and optional Warning", () => {
  it("blocks Activate when OOO/OOS is never saved and keeps catalogues as Warning", () => {
    assert.equal(oooOosSaveBlocked(emptyOooOosPosture({ oooMeaning: "" })), "Describe what out of order means.");

    const missingOoo = foundationReady(
      completeSet4Activate({
        oooOosSaved: false,
        restrictionReasonCount: 0,
        cleaningTypeCount: 0,
      }),
    );
    assert.equal(missingOoo.domains["room-inventory-rules"].readiness, "incomplete");
    assert.ok(missingOoo.domains["room-inventory-rules"].warnings.includes(SET4_OOO_UNSAVED));
    assert.ok(missingOoo.mandatoryMissing.includes("OOO and OOS meaning"));
    assert.equal(missingOoo.canActivate, false);

    const warningsOnly = foundationReady(
      completeSet4Activate({
        cleaningTypeCount: 0,
        restrictionReasonCount: 0,
        maintenanceCategoryCount: 0,
        maintenancePriorityCount: 0,
        maintenanceTypeTagCount: 0,
        maintenanceSlaSaved: false,
      }),
    );
    assert.equal(warningsOnly.domains["housekeeping-rules"].readiness, "warning");
    assert.ok(warningsOnly.domains["housekeeping-rules"].warnings.includes(SET4_CLEANING_WARNING));
    assert.ok(warningsOnly.domains["room-inventory-rules"].warnings.includes(SET4_REASONS_WARNING));
    assert.equal(warningsOnly.domains["maintenance-rules"].readiness, "warning");
    assert.ok(warningsOnly.domains["maintenance-rules"].warnings.includes(SET4_CATEGORIES_WARNING));
    assert.ok(warningsOnly.domains["maintenance-rules"].warnings.includes(SET4_PRIORITIES_WARNING));
    assert.ok(warningsOnly.domains["maintenance-rules"].warnings.includes(SET4_TAGS_WARNING));
    assert.ok(warningsOnly.domains["maintenance-rules"].warnings.includes(SET4_SLA_WARNING));
    assert.equal(warningsOnly.canActivate, true);
    assert.equal(warningsOnly.overall, "warning");
  });
});

describe("PMS-SET4 maintenance never Incomplete-blocks Activate", () => {
  it("keeps Activate available when only maintenance catalogues are empty or missing", () => {
    const emptyMaint = foundationReady(
      completeSet4Activate({
        maintenanceAvailable: false,
        maintenanceCategoryCount: 0,
        maintenancePriorityCount: 0,
        maintenanceTypeTagCount: 0,
        maintenanceSlaSaved: false,
      }),
    );
    assert.equal(emptyMaint.domains["maintenance-rules"].readiness, "warning");
    assert.ok(emptyMaint.domains["maintenance-rules"].warnings.includes(SET4_MAINT_UNAVAILABLE));
    assert.deepEqual(emptyMaint.domains["maintenance-rules"].missing, []);
    assert.equal(emptyMaint.canActivate, true);

    const missing0050 = foundationReady(emptySet4Activate());
    assert.equal(missing0050.domains["housekeeping-rules"].readiness, "incomplete");
    assert.ok(missing0050.domains["housekeeping-rules"].warnings.includes(SET4_HK_UNAVAILABLE));
    assert.equal(missing0050.domains["room-inventory-rules"].readiness, "incomplete");
    assert.ok(missing0050.domains["room-inventory-rules"].warnings.includes(SET4_RI_UNAVAILABLE));
    assert.equal(missing0050.domains["maintenance-rules"].readiness, "warning");
    assert.equal(missing0050.canActivate, false);
  });
});

describe("PMS-SET4 single Activate and checklist expand", () => {
  it("keeps one pms_set1_live flag and expands mandatory to HK statuses and OOO/OOS", () => {
    const set3Only = foundationReady(emptySet4Activate());
    assert.equal(set3Only.canActivate, false);
    assert.ok(set3Only.mandatoryMissing.includes("Housekeeping statuses"));
    assert.ok(set3Only.mandatoryMissing.includes("OOO and OOS meaning"));

    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(owner.overall, "warning");
    assert.equal(canActivateSet1("owner"), true);

    const manager = foundationReady(completeSet4Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);
  });
});

describe("PMS-SET4 hub unmute and deep-links", () => {
  it("promotes HK, room inventory and maintenance to Live cards and remints Coming soon as SET6 only", () => {
    assert.equal(SET4_HK_HREF, "/restaurant/pms/housekeeping");
    assert.equal(SET4_RI_HREF, "/restaurant/pms/room-inventory");
    assert.equal(SET4_MAINT_HREF, "/restaurant/pms/maintenance");
    assert.equal(SET4_STOCK_HELPER_HREF, "/restaurant/inventory");
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "housekeeping-rules" && card.title === "Housekeeping rules"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "room-inventory-rules" && card.title === "Room inventory rules"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "maintenance-rules" && card.title === "Maintenance rules"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.wave === "SET4"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Departments"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Banks"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Roles"));
    assert.ok(SET1_COMING_SOON.every((card) => card.wave === "SET6"));
    assert.ok(!SET1_COMING_SOON.some((card) => ["Housekeeping rules", "Room inventory rules", "Maintenance rules"].includes(card.title)));

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Set4HousekeepingSection/);
    assert.match(hub, /Set4RoomInventorySection/);
    assert.match(hub, /Set4MaintenanceSection/);
    assert.match(hub, /Show all/);
    assert.doesNotMatch(hub, /FO-CHROME1/);

    const section = readFileSync(new URL("../components/settings/pms-set4-section.tsx", import.meta.url), "utf8");
    assert.match(section, /SET4_HK_HREF/);
    assert.match(section, /Open housekeeping/);
    assert.match(section, /SET4_RI_HREF/);
    assert.match(section, /Open room inventory/);
    assert.match(section, /SET4_MAINT_HREF/);
    assert.match(section, /Open maintenance/);
    assert.match(section, /SET4_STOCK_HELPER_HREF/);
    assert.doesNotMatch(section, /CMMS/i);
    assert.doesNotMatch(section, /overbooking/i);
    assert.doesNotMatch(section, /warehouse/i);
    assert.doesNotMatch(section, /FO-CHROME1/);
    assert.doesNotMatch(section, /room rack/i);
  });
});

describe("PMS-SET4 consume catalogues after save", () => {
  it("reads saved catalogues for create and does not invent samples when empty", () => {
    const draftTypes = resolveCleaningTypesForCreate(null);
    assert.equal(draftTypes.some((row) => row.code === "turn_down"), false);
    assert.equal(cleaningTypeAllowed(null, "departure_cleaning"), true);
    assert.equal(cleaningTypeAllowed(null, "turn_down"), false);

    const savedTypes = resolveCleaningTypesForCreate({
      savedAt: "2026-09-14T10:00:00.000Z",
      inspectionGate: true,
      serviceTiming: { morningFrom: "", morningTo: "", eveningFrom: "", eveningTo: "" },
      priorities: [],
      types: [
        { code: "departure_cleaning", label: "Departure", active: true },
        { code: "turn_down", label: "Turn-down", active: true },
      ],
    });
    assert.equal(savedTypes.some((row) => row.code === "turn_down"), true);
    assert.equal(cleaningTypeAllowed({
      savedAt: "2026-09-14T10:00:00.000Z",
      inspectionGate: true,
      serviceTiming: { morningFrom: "", morningTo: "", eveningFrom: "", eveningTo: "" },
      priorities: [],
      types: [{ code: "departure_cleaning", label: "Departure", active: true }, { code: "stayover_cleaning", label: "Stayover", active: false }, { code: "touch_up", label: "Touch-up", active: false }, { code: "deep_cleaning", label: "Deep", active: false }, { code: "re_clean", label: "Re-clean", active: false }, { code: "turn_down", label: "Turn-down", active: false }],
    }, "stayover_cleaning"), false);

    const baselineCats = resolveMaintenanceCategoriesForCreate([]);
    assert.deepEqual(baselineCats.map((row) => row.code), ["plumbing", "electrical", "furniture", "equipment", "other"]);
    assert.equal(maintenanceCategoryAllowed([], "plumbing"), true);
    assert.equal(
      maintenanceCategoryAllowed([{ id: "1", code: "plumbing", name: "Pipes", active: true }], "electrical"),
      false,
    );

    assert.equal(restrictionSaveBlocked(null, { status: "out_of_order" }), null);
    assert.equal(
      restrictionSaveBlocked(emptyOooOosPosture({ savedAt: "2026-09-14T10:00:00.000Z", reasonRequired: true }), {
        status: "out_of_order",
      }),
      "A reason is required.",
    );
    assert.equal(
      restrictionSaveBlocked(emptyOooOosPosture({ savedAt: "2026-09-14T10:00:00.000Z", expectedReturnRequired: true }), {
        status: "out_of_service",
        reason: "Leak",
      }),
      "Expected return is required.",
    );
  });
});

describe("PMS-SET4 no second Activate and SET5–6 / FO-CHROME1 / overbooking out", () => {
  it("does not add pms_set4_live or later-wave forms", () => {
    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_set4_live/);
    assert.match(activate, /SET4_AUDIT_ACTIONS/);

    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(chrome, /FO-CHROME1/);
    assert.equal(SET4_AUDIT_HK_STATUS, "pms_set4_hk_status_updated");
    assert.equal(SET4_AUDIT_HK_CLEANING, "pms_set4_hk_cleaning_updated");
    assert.equal(SET4_AUDIT_OOO_OOS, "pms_set4_ooo_oos_updated");
    assert.equal(SET4_AUDIT_REASON, "pms_set4_restriction_reason_updated");
    assert.equal(SET4_AUDIT_CATEGORY, "pms_set4_maintenance_category_updated");
    assert.equal(SET4_AUDIT_PRIORITY, "pms_set4_maintenance_priority_updated");
    assert.equal(SET4_AUDIT_TYPE_TAG, "pms_set4_maintenance_tag_updated");
    assert.equal(SET4_AUDIT_SLA, "pms_set4_maintenance_sla_updated");
  });
});

describe("PMS-SET4 migration 0050 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes and does not apply live", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0050_pms_set4_hk_inventory_maintenance.sql");
    const supabase = join(here, "../../../../supabase/migrations/0050_pms_set4_hk_inventory_maintenance.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /pms_hk_status_rules/);
    assert.match(drizzleSql, /pms_hk_cleaning_posture/);
    assert.match(drizzleSql, /pms_ooo_oos_posture/);
    assert.match(drizzleSql, /pms_maintenance_sla/);
    assert.match(drizzleSql, /pms_restriction_reasons/);
    assert.match(drizzleSql, /pms_maintenance_categories/);
    assert.match(drizzleSql, /pms_maintenance_priorities/);
    assert.match(drizzleSql, /pms_maintenance_type_tags/);
    assert.doesNotMatch(drizzleSql, /SECURITY DEFINER/i);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_restriction_reasons/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_maintenance_categories/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.housekeeping_maintenance_requests/);
    assert.doesNotMatch(drizzleSql, /overbooking/i);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
    assert.match(drizzleSql, /APPLY HELD/i);
  });
});
