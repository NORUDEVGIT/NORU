import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SET1_ACTIVATE_DENIED,
  SET1_AUDIT_ACTION,
  SET1_BUSINESS_DATE_COPY,
  SET1_COLUMNS_UNAVAILABLE,
  SET1_COMING_SOON,
  SET1_LIVE_CARDS,
  SET1_DENIED,
  SET1_HUB_HREF,
  SET1_PMS_BACK_HREF,
  SET1_TITLE,
  canActivateSet1,
  canEditSet1,
  canOpenSet1Hub,
  ciCoEqual,
  displayedBusinessDate,
  emptyIdentity,
  emptyOps,
  emptyPolicies,
  emptyTaxes,
  evaluateSet1Checklist,
  feeDefaultsPresent,
  isMissingColumnError,
  isSet1SectionHash,
  propertySetupRedirectHref,
} from "./pms-set1-foundation.ts";
import { FO_FEE_DEFAULTS_SETTINGS_HREF } from "./fo-fee-defaults.ts";
import { completeSet2Activate } from "./pms-set2-structure.ts";

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
const completeSet2 = completeSet2Activate();

function checklist(input: Parameters<typeof evaluateSet1Checklist>[0]) {
  return evaluateSet1Checklist({ set2: completeSet2, ...input });
}

describe("PMS-SET1 role gate", () => {
  it("lets manager save and blocks Activate; owner can Activate; receptionist cannot edit", () => {
    assert.equal(canEditSet1("owner"), true);
    assert.equal(canEditSet1("manager"), true);
    assert.equal(canEditSet1("receptionist"), false);
    assert.equal(canEditSet1("cashier"), false);
    assert.equal(canEditSet1("housekeeper"), false);
    assert.equal(canOpenSet1Hub("manager"), true);
    assert.equal(canOpenSet1Hub("receptionist"), false);

    assert.equal(canActivateSet1("owner"), true);
    assert.equal(canActivateSet1("manager"), false);
    assert.equal(canActivateSet1("receptionist"), false);

    const managerReady = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "manager",
    });
    assert.equal(managerReady.overall, "ready");
    assert.equal(managerReady.canActivate, false);

    const owner = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(owner.canActivate, true);

    const receptionist = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "receptionist",
    });
    assert.equal(canEditSet1("receptionist"), false);
    assert.equal(receptionist.canActivate, false);
    assert.equal(SET1_DENIED.includes("Coming soon"), false);
    assert.equal(SET1_ACTIVATE_DENIED.includes("Coming soon"), false);
  });
});

describe("PMS-SET1 mandatory checklist", () => {
  it("requires name, timezone, currency, CI and CO, tax mode + named rate, and 0042 defaults", () => {
    const missingName = checklist({
      identity: emptyIdentity({ timezone: "Europe/London", currencyCode: "GBP" }),
      ops: completeOps,
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(missingName.domains.identity.readiness, "incomplete");
    assert.ok(missingName.mandatoryMissing.includes("Display name"));
    assert.equal(missingName.canActivate, false);
    assert.equal(missingName.overall, "blocked");

    const missingTimes = checklist({
      identity: completeIdentity,
      ops: emptyOps(),
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(missingTimes.domains.ops.readiness, "incomplete");
    assert.ok(missingTimes.mandatoryMissing.includes("Check-in time"));
    assert.ok(missingTimes.mandatoryMissing.includes("Check-out time"));
    assert.equal(missingTimes.canActivate, false);

    const missingTaxName = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: emptyTaxes({ taxInclusive: true, taxRate: 10 }),
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(missingTaxName.domains.taxes.readiness, "incomplete");
    assert.ok(missingTaxName.mandatoryMissing.includes("Tax name"));
    assert.equal(missingTaxName.canActivate, false);

    const missingFees = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: completeTaxes,
      policies: emptyPolicies({
        fees: {
          cancelFeeRequired: undefined as unknown as boolean,
          cancelFeeDefault: 0,
          noshowFeeRequired: true,
          noshowFeeDefault: 0,
        },
      }),
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.ok(missingFees.mandatoryMissing.includes("Cancel fee defaults"));
    assert.equal(missingFees.domains.policies.readiness, "incomplete");
    assert.equal(missingFees.canActivate, false);

    const ready = checklist({
      identity: completeIdentity,
      ops: completeOps,
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(ready.overall, "ready");
    assert.equal(ready.domains.identity.readiness, "complete");
    assert.equal(ready.domains.ops.readiness, "complete");
    assert.equal(ready.domains.taxes.readiness, "complete");
    assert.equal(ready.domains.policies.readiness, "complete");
    assert.equal(ready.canActivate, true);
    assert.deepEqual(ready.mandatoryMissing, []);
  });

  it("treats equal CI/CO as warning, not a block", () => {
    const same = checklist({
      identity: completeIdentity,
      ops: emptyOps({ checkInTime: "12:00", checkOutTime: "12:00" }),
      taxes: completeTaxes,
      policies: completePolicies,
      foundationColumnsAvailable: true,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(ciCoEqual("12:00", "12:00"), true);
    assert.equal(same.domains.ops.readiness, "warning");
    assert.equal(same.canActivate, true);
    assert.equal(same.overall, "warning");
  });

  it("shows Incomplete/Unavailable when 0047 columns are missing and never fakes Complete", () => {
    const missingCols = checklist({
      identity: completeIdentity,
      ops: emptyOps(),
      taxes: emptyTaxes({ taxInclusive: false, taxRate: 20 }),
      policies: completePolicies,
      foundationColumnsAvailable: false,
      pmsSet1Live: false,
      role: "owner",
    });
    assert.equal(missingCols.domains.ops.readiness, "incomplete");
    assert.ok(missingCols.domains.ops.warnings.includes(SET1_COLUMNS_UNAVAILABLE));
    assert.equal(missingCols.domains.taxes.readiness, "incomplete");
    assert.ok(missingCols.mandatoryMissing.includes("Tax name"));
    assert.equal(missingCols.canActivate, false);
    assert.notEqual(missingCols.domains.identity.readiness, "blocked");
    assert.equal(missingCols.domains.policies.readiness, "warning");
    assert.notEqual(missingCols.overall, "ready");
  });
});

describe("PMS-SET1 fee-defaults single home", () => {
  it("points FO Settings links at #policies and redirects property-setup", () => {
    assert.equal(FO_FEE_DEFAULTS_SETTINGS_HREF, "/restaurant/settings#policies");
    assert.equal(propertySetupRedirectHref(""), SET1_HUB_HREF);
    assert.equal(propertySetupRedirectHref("#policies"), "/restaurant/settings#policies");
    assert.equal(propertySetupRedirectHref("policies"), "/restaurant/settings#policies");
    assert.equal(propertySetupRedirectHref("#cancel-noshow-fees"), "/restaurant/settings#policies");
    assert.equal(isSet1SectionHash("policies"), true);
    assert.equal(isSet1SectionHash("#golive"), true);
    assert.equal(isSet1SectionHash("structure"), true);
    assert.equal(isSet1SectionHash("#rooms"), true);
    assert.equal(isSet1SectionHash("#outlets"), true);

    const setup = readFileSync(new URL("../../../routes/restaurant/pms/property-setup.tsx", import.meta.url), "utf8");
    assert.match(setup, /propertySetupRedirectHref/);
    assert.match(setup, /redirect/);
    assert.doesNotMatch(setup, /PmsPropertySetupWorkspace/);
    assert.doesNotMatch(setup, /FoundationPanel/);

    const settings = readFileSync(
      new URL("../../../core/components/workspaces/settings-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(settings, /FoFeeDefaultsEditor/);

    const policies = readFileSync(
      new URL("../components/settings/pms-set1-section.tsx", import.meta.url),
      "utf8",
    );
    assert.match(policies, /FoFeeDefaultsEditor/);
    assert.match(policies, /id="policies"/);
  });
});

describe("PMS-SET1 business date is not editable", () => {
  it("copies Night Audit ownership and has no business-date editor", () => {
    assert.equal(SET1_BUSINESS_DATE_COPY, "Business date advances when Night Audit closes.");
    assert.equal(displayedBusinessDate(null, "Europe/London").length, 10);
    assert.equal(displayedBusinessDate("2026-09-14", "Europe/London"), "2026-09-14");

    const section = readFileSync(
      new URL("../components/settings/pms-set1-section.tsx", import.meta.url),
      "utf8",
    );
    assert.match(section, /SET1_BUSINESS_DATE_COPY/);
    assert.match(section, /usePropertyBusinessDate/);
    assert.match(section, /read-only|readOnly|Business date/);
    assert.doesNotMatch(section, /id="business-date"/);
    assert.doesNotMatch(section, /name="businessDate"/);
    assert.doesNotMatch(section, /setOps\(\(prev\) => \(\{ \.\.\.prev, businessDate/);

    const fns = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fns, /business_date:/);
    assert.match(fns, /SET1_AUDIT_ACTION/);
    assert.equal(SET1_AUDIT_ACTION, "pms_set1_updated");
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.match(fns, /FO_FEE_DEFAULTS_AUDIT_ACTION/);

    const identity = readFileSync(new URL("../../../core/lib/restaurant.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(identity, /business_date/);
    assert.doesNotMatch(identity, /restaurant_staff_audit_log/);
  });
});

describe("PMS-SET1 hub locks", () => {
  it("keeps Coming soon as labels only and permission denied is not Coming soon", () => {
    assert.equal(SET1_TITLE, "Settings");
    assert.equal(SET1_PMS_BACK_HREF, "/restaurant/pms");
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Structure"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Rooms" || card.title === "Rooms & amenities"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Outlets"));
    assert.ok(SET1_COMING_SOON.some((card) => card.title === "Rates"));
    assert.ok(SET1_COMING_SOON.some((card) => card.title === "Banks"));
    assert.ok(SET1_COMING_SOON.some((card) => card.title === "Roles"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "structure"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "rooms"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "outlets"));

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Coming soon/);
    assert.match(hub, /PermissionDeniedPanel/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    assert.match(hub, /SET1_PMS_BACK_HREF/);
    assert.match(hub, /to=\{SET1_PMS_BACK_HREF/);

    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle047 = join(here, "../../../../drizzle/migrations/0047_pms_set1_foundation_settings.sql");
    const supabase047 = join(here, "../../../../supabase/migrations/0047_pms_set1_foundation_settings.sql");
    assert.equal(existsSync(drizzle047), true);
    if (existsSync(supabase047)) {
      const liveApplied = readFileSync(supabase047, "utf8");
      assert.match(liveApplied, /pms_set1_live/);
      assert.doesNotMatch(liveApplied, /CREATE TABLE/);
    }

    const migration = readFileSync(drizzle047, "utf8");
    assert.match(migration, /pms_set1_live/);
    assert.match(migration, /tax_name/);
    assert.match(migration, /do not apply to live/i);
    assert.match(migration, /drizzle\/migrations\/0047_pms_set1_foundation_settings\.sql/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
    assert.doesNotMatch(migration, /CREATE FUNCTION/);
    assert.doesNotMatch(migration, /CREATE POLICY/);
    assert.doesNotMatch(migration, /SET active/);

    const chrome = readFileSync(
      new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(chrome, /deskHours/);
    assert.match(chrome, /FO_ESCAPE_MODULES/);

    const rmTax = readFileSync(
      new URL("../../restaurant-management/lib/rm-tax.functions.ts", import.meta.url),
      "utf8",
    );
    assert.match(rmTax, /tax_inclusive/);
    assert.match(rmTax, /tax_rate/);
    assert.match(rmTax, /service_enabled/);
    assert.match(rmTax, /service_rate/);

    const feeFns = readFileSync(new URL("./fo-cancel-noshow.functions.ts", import.meta.url), "utf8");
    assert.match(feeFns, /async function loadFeePolicy/);
    assert.match(feeFns, /fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default/);
  });

  it("detects missing-column honesty", () => {
    assert.equal(isMissingColumnError({ code: "42703", message: "column does not exist" }), true);
    assert.equal(isMissingColumnError({ message: "Could not find the 'tax_name' column of 'restaurants'" }), true);
    assert.equal(isMissingColumnError({ message: "permission denied" }), false);
  });
});
