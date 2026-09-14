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
import { completeSet4Activate } from "./pms-set4-hk-inventory.ts";
import { completeSet5Activate } from "./pms-set5-depts-guestsvc.ts";
import {
  SET3_AUDIT_GUEST_RULES,
  SET3_AUDIT_ID_TYPE,
  SET3_AUDIT_MEAL,
  SET3_AUDIT_PACKAGE,
  SET3_AUDIT_VIP,
  SET3_CONTACT_REQUIRED,
  SET3_GUEST_RULES_UNAVAILABLE,
  SET3_GUEST_RULES_UNSAVED,
  SET3_GUESTS_HREF,
  SET3_ID_TYPES_WARNING,
  SET3_ID_VIP_UNAVAILABLE,
  SET3_MEALS_WARNING,
  SET3_PACKAGES_WARNING,
  SET3_RATES_HREF,
  SET3_RATES_UNAVAILABLE,
  SET3_VIP_WARNING,
  completeSet3Activate,
  countActiveRatePlans,
  emptyGuestProfileRules,
  emptySet3Activate,
  guestCreateBlocked,
  guestMinComplete,
  guestRulesSaveBlocked,
} from "./pms-set3-rates-guest.ts";

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

function foundationReady(set3 = completeSet3Activate(), role = "owner") {
  return evaluateSet1Checklist({
    identity: completeIdentity,
    ops: completeOps,
    taxes: completeTaxes,
    policies: completePolicies,
    foundationColumnsAvailable: true,
    pmsSet1Live: false,
    role,
    set2: completeSet2Activate(),
    set3,
    set4: completeSet4Activate(),
    set5: completeSet5Activate(),
  });
}

describe("PMS-SET3 rate-count honesty", () => {
  it("counts hotel_rate_plans.active only and never invents sellable", () => {
    assert.equal(countActiveRatePlans([{ active: true }, { active: false }, { active: true }]), 2);
    assert.equal(countActiveRatePlans([]), 0);
    const missingPlans = foundationReady(emptySet3Activate({ activeRatePlanCount: 0, guestRulesAvailable: true, guestRulesSaved: true, guestMinComplete: true }));
    assert.equal(missingPlans.domains.rates.readiness, "incomplete");
    assert.ok(missingPlans.mandatoryMissing.includes("Active rate plan"));
    assert.equal(missingPlans.canActivate, false);

    const oneActive = foundationReady(completeSet3Activate({ mealPlanCount: 0, packageCount: 0 }));
    assert.equal(oneActive.domains.rates.missing.includes("Active rate plan"), false);
    assert.equal(oneActive.canActivate, true);

    const fns = readFileSync(new URL("./pms-set3-rates-guest.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /hotel_rate_plans/);
    assert.match(fns, /eq\("active", true\)/);
    assert.doesNotMatch(fns, /sellable/);
    const contract = readFileSync(new URL("./pms-set3-rates-guest.ts", import.meta.url), "utf8");
    assert.doesNotMatch(contract, /sellable/);
  });
});

describe("PMS-SET3 guest min and draft Incomplete", () => {
  it("keeps the prefill draft Incomplete until Save and requires first name + phone or email + consent", () => {
    const draft = emptyGuestProfileRules();
    assert.equal(draft.savedAt, null);
    assert.equal(guestMinComplete(draft, true), false);
    assert.equal(guestCreateBlocked(draft, { firstName: "Ada" }), null);
    assert.equal(guestRulesSaveBlocked({ ...draft, requiredFields: { ...draft.requiredFields, phone: false, email: false } }), "Require a phone number or an email address.");

    const unsaved = foundationReady(
      emptySet3Activate({
        activeRatePlanCount: 1,
        mealPlansAvailable: true,
        packagesAvailable: true,
        guestRulesAvailable: true,
        guestRulesSaved: false,
        guestMinComplete: false,
        idTypesAvailable: true,
        vipLevelsAvailable: true,
      }),
    );
    assert.equal(unsaved.domains["guest-profile"].readiness, "incomplete");
    assert.ok(unsaved.domains["guest-profile"].warnings.includes(SET3_GUEST_RULES_UNSAVED));
    assert.ok(unsaved.mandatoryMissing.includes("Guest profile rules"));
    assert.equal(unsaved.canActivate, false);

    const saved = emptyGuestProfileRules({
      requiredFields: { firstName: true, lastName: false, phone: true, email: false },
      savedAt: "2026-09-14T09:00:00.000Z",
    });
    assert.equal(guestMinComplete(saved, true), true);
    assert.equal(guestCreateBlocked(saved, { firstName: "Ada" }), SET3_CONTACT_REQUIRED);
    assert.equal(guestCreateBlocked(saved, { firstName: "Ada", phone: "+44111" }), null);
    assert.equal(guestCreateBlocked(saved, { firstName: "Ada", email: "ada@example.com" }), null);
  });
});

describe("PMS-SET3 Warning catalogues are non-blocking", () => {
  it("keeps Activate available when meals, packages, ID types or VIP levels are empty", () => {
    const emptyCatalogues = foundationReady(
      completeSet3Activate({
        mealPlanCount: 0,
        packageCount: 0,
        idTypeCount: 0,
        vipLevelCount: 0,
      }),
    );
    assert.equal(emptyCatalogues.domains.rates.readiness, "warning");
    assert.ok(emptyCatalogues.domains.rates.warnings.includes(SET3_MEALS_WARNING));
    assert.ok(emptyCatalogues.domains.rates.warnings.includes(SET3_PACKAGES_WARNING));
    assert.equal(emptyCatalogues.domains["guest-profile"].readiness, "warning");
    assert.ok(emptyCatalogues.domains["guest-profile"].warnings.includes(SET3_ID_TYPES_WARNING));
    assert.ok(emptyCatalogues.domains["guest-profile"].warnings.includes(SET3_VIP_WARNING));
    assert.equal(emptyCatalogues.canActivate, true);
    assert.equal(emptyCatalogues.overall, "warning");
    assert.ok(!emptyCatalogues.mandatoryMissing.includes("Meal plan"));
    assert.ok(!emptyCatalogues.mandatoryMissing.includes("Package"));

    const missing0049 = foundationReady(
      emptySet3Activate({
        activeRatePlanCount: 2,
        guestRulesAvailable: false,
      }),
    );
    assert.ok(missing0049.domains.rates.warnings.includes(SET3_RATES_UNAVAILABLE));
    assert.equal(missing0049.domains.rates.missing.includes("Active rate plan"), false);
    assert.equal(missing0049.domains["guest-profile"].readiness, "incomplete");
    assert.ok(missing0049.domains["guest-profile"].warnings.includes(SET3_GUEST_RULES_UNAVAILABLE));
    assert.ok(missing0049.domains["guest-profile"].warnings.includes(SET3_ID_VIP_UNAVAILABLE));
    assert.equal(missing0049.canActivate, false);
  });
});

describe("PMS-SET3 single Activate and checklist expand", () => {
  it("keeps one pms_set1_live flag and expands mandatory to rates and guest rules", () => {
    const set2Only = foundationReady(emptySet3Activate());
    assert.equal(set2Only.canActivate, false);
    assert.ok(set2Only.mandatoryMissing.includes("Active rate plan"));
    assert.ok(set2Only.mandatoryMissing.includes("Guest profile rules"));

    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(owner.overall, "warning");
    assert.equal(canActivateSet1("owner"), true);

    const manager = foundationReady(completeSet3Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);
  });
});

describe("PMS-SET3 hub unmute and deep-links", () => {
  it("promotes Rates and Guest profile to Live cards and deep-links the existing workspaces", () => {
    assert.equal(SET3_RATES_HREF, "/restaurant/pms/rates-revenue");
    assert.equal(SET3_GUESTS_HREF, "/restaurant/pms/guests");
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "rates" && card.title === "Rates & meal plans"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "guest-profile" && card.title === "Guest profile rules"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Rates" || card.title === "Rates & meal plans"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Guest profile rules" || card.title === "Guests"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Banks"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Roles"));
    assert.ok(SET1_COMING_SOON.every((card) => card.wave === "SET6"));

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Set3RatesSection/);
    assert.match(hub, /Set3GuestSection/);
    assert.match(hub, /Show all/);
    assert.match(hub, /Hide/);
    assert.doesNotMatch(hub, /FO-CHROME1/);

    const section = readFileSync(new URL("../components/settings/pms-set3-section.tsx", import.meta.url), "utf8");
    assert.match(section, /SET3_RATES_HREF/);
    assert.match(section, /Open rates workspace/);
    assert.match(section, /SET3_GUESTS_HREF/);
    assert.match(section, /Open guest profiles/);
    assert.doesNotMatch(section, /rate calendar/i);
    assert.doesNotMatch(section, /FO-CHROME1/);
    assert.doesNotMatch(section, /deskHours/);
  });
});

describe("PMS-SET3 no second Activate and SET4–6 out", () => {
  it("does not add pms_set3_live or SET4–6 forms", () => {
    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_set3_live/);
    assert.match(activate, /SET3_AUDIT_ACTIONS/);

    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(chrome, /FO-CHROME1/);
    assert.equal(SET3_AUDIT_MEAL, "pms_set3_meal_updated");
    assert.equal(SET3_AUDIT_PACKAGE, "pms_set3_package_updated");
    assert.equal(SET3_AUDIT_GUEST_RULES, "pms_set3_guest_rules_updated");
    assert.equal(SET3_AUDIT_ID_TYPE, "pms_set3_id_type_updated");
    assert.equal(SET3_AUDIT_VIP, "pms_set3_vip_updated");
  });
});

describe("PMS-SET3 migration 0049 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes and does not apply live", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0049_pms_set3_rates_guest_rules.sql");
    const supabase = join(here, "../../../../supabase/migrations/0049_pms_set3_rates_guest_rules.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /pms_meal_plans/);
    assert.match(drizzleSql, /pms_packages/);
    assert.match(drizzleSql, /pms_guest_id_types/);
    assert.match(drizzleSql, /pms_guest_vip_levels/);
    assert.match(drizzleSql, /pms_rate_package_rules/);
    assert.match(drizzleSql, /pms_guest_profile_rules/);
    assert.match(drizzleSql, /room_only.*breakfast.*half_board.*full_board.*all_inclusive.*custom/);
    assert.match(drizzleSql, /accommodation.*business.*romantic.*conference.*custom/);
    assert.doesNotMatch(drizzleSql, /SECURITY DEFINER/i);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_meal_plans/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_packages/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.hotel_rate_plans/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.guest_profiles/);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
  });
});
