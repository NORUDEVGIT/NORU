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
  isSet1SectionHash,
  propertySetupRedirectHref,
  resolveSet1SectionHash,
  SET1_COMING_SOON,
  SET1_FOUNDATION_CHIP,
  SET1_HUB_HREF,
  SET1_LIVE_CARDS,
} from "./pms-set1-foundation.ts";
import { completeSet2Activate } from "./pms-set2-structure.ts";
import { completeSet3Activate } from "./pms-set3-rates-guest.ts";
import { completeSet4Activate } from "./pms-set4-hk-inventory.ts";
import { completeSet5Activate } from "./pms-set5-depts-guestsvc.ts";
import { completeSet6Activate } from "./pms-set6-sales-distribution.ts";
import {
  applyFeePreset,
  cashieringTenderOptions,
  completePolish1Activate,
  customFeePresetBlocked,
  emptyPolish1Activate,
  evaluateAdministration,
  evaluatePaymentMethods,
  FALLBACK_CASHIERING_TENDERS,
  FEE_PRESET_MAP,
  feePresetFromStorage,
  feePresetSaveBlocked,
  POLISH1_ADMIN_HREF,
  POLISH1_AUDIT_FEE_PRESET,
  POLISH1_AUDIT_PAYMENT_METHOD,
  POLISH1_AUDIT_SHIFT,
  POLISH1_CUSTOM_FEE_BLANK,
  POLISH1_PAYMENT_METHODS_HREF,
  POLISH1_PAYMENTS_UNAVAILABLE,
  POLISH1_PAYMENTS_WARNING,
  POLISH1_SHIFTS_UNAVAILABLE,
  POLISH1_SHIFTS_WARNING,
  polish1MandatoryMissing,
  SET5_TENDERS_LIVE_ON_PAYMENT_METHODS,
} from "./pms-polish1-payment-admin.ts";

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

function foundationReady(polish1 = completePolish1Activate(), role = "owner") {
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
    set6: completeSet6Activate(),
    polish1,
  });
}

describe("PMS Polish Wave 1 Warning-only catalogues", () => {
  it("keeps empty Payment methods as Warning and does not block Activate", () => {
    const empty = evaluatePaymentMethods(emptyPolish1Activate({ paymentMethodsAvailable: true }));
    assert.equal(empty.readiness, "warning");
    assert.ok(empty.warnings.includes(POLISH1_PAYMENTS_WARNING));
    assert.deepEqual(empty.missing, []);
    assert.equal(evaluatePaymentMethods(completePolish1Activate()).readiness, "complete");

    const missing0056 = foundationReady(emptyPolish1Activate());
    assert.deepEqual(polish1MandatoryMissing(emptyPolish1Activate()), []);
    assert.equal(missing0056.canActivate, true);
    assert.equal(missing0056.domains["payment-methods"].readiness, "warning");
    assert.ok(missing0056.domains["payment-methods"].warnings.includes(POLISH1_PAYMENTS_UNAVAILABLE));
    assert.ok(missing0056.domains.administration.warnings.includes(POLISH1_SHIFTS_UNAVAILABLE));
    assert.ok(!missing0056.mandatoryMissing.includes("Payment method"));
    assert.ok(!missing0056.mandatoryMissing.includes("Shift"));
  });
});

describe("PMS Polish Wave 1 payments stay off Administration", () => {
  it("keeps Payment methods as its own card and does not nest tenders under Administration", () => {
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "payment-methods" && card.title === "Payment methods"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "administration" && card.title === "Administration"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Admin controls"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Banks"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => String(card.id) === "admin-controls"));

    const admin = evaluateAdministration(completePolish1Activate(), completeSet5Activate());
    assert.equal(admin.id, "administration");
    assert.ok(!admin.warnings.some((warning) => /payment method/i.test(warning)));

    const section = readFileSync(new URL("../components/settings/pms-polish1-section.tsx", import.meta.url), "utf8");
    assert.match(section, /id="payment-methods"/);
    assert.match(section, /id="administration"/);
    assert.match(section, /Set5AdminSection/);
    assert.match(section, /POLISH1_ADMIN_HREF/);
    assert.doesNotMatch(section, /StaffManager/);
    const adminBlock = section.slice(section.indexOf("export function Polish1AdministrationSection"));
    assert.doesNotMatch(adminBlock, /savePmsPaymentMethod/);
    assert.doesNotMatch(adminBlock, /Payment methods catalogue/);
  });
});

describe("PMS Polish Wave 1 fee preset map and Custom Save-block", () => {
  it("maps 50 / 10 / Full charge 100 and blocks Custom when blank", () => {
    assert.deepEqual(FEE_PRESET_MAP.fifty, { basis: "percent_stay", value: 50 });
    assert.deepEqual(FEE_PRESET_MAP.ten, { basis: "percent_stay", value: 10 });
    assert.deepEqual(FEE_PRESET_MAP.full, { basis: "percent_stay", value: 100 });
    assert.equal(feePresetFromStorage("percent_stay", 50), "fifty");
    assert.equal(feePresetFromStorage("percent_stay", 10), "ten");
    assert.equal(feePresetFromStorage("percent_stay", 100), "full");
    assert.equal(feePresetFromStorage("percent_stay", 25), "custom");
    assert.equal(feePresetFromStorage("fixed", 100), "custom");
    assert.equal(feePresetFromStorage("first_night", 1), "custom");
    assert.deepEqual(applyFeePreset("full"), { basis: "percent_stay", value: 100 });
    assert.deepEqual(applyFeePreset("custom", { basis: "fixed", value: 40 }), { basis: "fixed", value: 40 });
    assert.equal(customFeePresetBlocked("fifty", "", ""), false);
    assert.equal(customFeePresetBlocked("custom", "", ""), true);
    assert.equal(customFeePresetBlocked("custom", "percent_stay", ""), true);
    assert.equal(customFeePresetBlocked("custom", "fixed", "12"), false);
    assert.equal(
      feePresetSaveBlocked(
        { preset: "custom", basis: "", value: "" },
        { preset: "fifty", basis: "percent_stay", value: "50" },
      ),
      POLISH1_CUSTOM_FEE_BLANK,
    );
    assert.equal(
      feePresetSaveBlocked(
        { preset: "full", basis: "percent_stay", value: "100" },
        { preset: "ten", basis: "percent_stay", value: "10" },
      ),
      null,
    );
  });
});

describe("PMS Polish Wave 1 Integrations stay own card", () => {
  it("does not merge Integrations into Payment methods", () => {
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "integrations" && card.title === "Integrations"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "payment-methods"));
    assert.equal(SET5_TENDERS_LIVE_ON_PAYMENT_METHODS.includes("Payment methods"), true);

    const integrations = readFileSync(new URL("../components/settings/pms-set5-section.tsx", import.meta.url), "utf8");
    assert.match(integrations, /SET5_TENDERS_LIVE_ON_PAYMENT_METHODS/);
    assert.match(integrations, /id="integrations"/);
    assert.doesNotMatch(integrations, /id="payment-methods"/);
  });
});

describe("PMS Polish Wave 1 single Activate and Coming soon empty", () => {
  it("keeps one pms_set1_live flag and does not add Coming soon cards", () => {
    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(canActivateSet1("owner"), true);
    const manager = foundationReady(completePolish1Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);
    assert.deepEqual(SET1_COMING_SOON, []);
    assert.equal(SET1_FOUNDATION_CHIP, "Foundation");
    assert.equal(resolveSet1SectionHash("#payment-methods"), "payment-methods");
    assert.equal(resolveSet1SectionHash("#administration"), "administration");
    assert.equal(resolveSet1SectionHash("#banks"), "payment-methods");
    assert.equal(resolveSet1SectionHash("#admin-controls"), "administration");
    assert.equal(isSet1SectionHash("#banks"), true);
    assert.equal(isSet1SectionHash("#admin-controls"), true);
    assert.equal(propertySetupRedirectHref("#banks"), `${SET1_HUB_HREF}#payment-methods`);
    assert.equal(propertySetupRedirectHref("#admin-controls"), `${SET1_HUB_HREF}#administration`);
    assert.equal(POLISH1_PAYMENT_METHODS_HREF, "/restaurant/settings#payment-methods");
    assert.equal(POLISH1_ADMIN_HREF, "/restaurant/pms/administration");

    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_polish1_live/);
    assert.match(activate, /POLISH1_AUDIT_ACTIONS/);

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Polish1PaymentMethodsSection/);
    assert.match(hub, /Polish1AdministrationSection/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    assert.doesNotMatch(hub, /overbooking/i);
  });
});

describe("PMS Polish Wave 1 cashiering consumes Active tenders", () => {
  it("uses Active catalogue methods and falls back only when 0056 is absent", () => {
    assert.deepEqual(
      cashieringTenderOptions({ available: false, methods: [] }).map((row) => row.code),
      FALLBACK_CASHIERING_TENDERS.map((row) => row.code),
    );
    assert.deepEqual(
      cashieringTenderOptions({
        available: true,
        methods: [
          { code: "CASH", name: "Cash", active: true },
          { code: "ROOM", name: "Room charge", active: false },
        ],
      }),
      [{ code: "CASH", name: "Cash" }],
    );
    assert.deepEqual(cashieringTenderOptions({ available: true, methods: [] }), []);

    const dialogs = readFileSync(new URL("../components/cashiering/folio-dialogs.tsx", import.meta.url), "utf8");
    assert.match(dialogs, /cashieringTenderOptions/);
    assert.doesNotMatch(dialogs, /const PAYMENT_METHODS = \["Cash"/);

    const admin = readFileSync(new URL("../components/workspaces/pms-administration-workspace.tsx", import.meta.url), "utf8");
    assert.match(admin, /settings#payment-methods/);
    assert.doesNotMatch(admin, /to="\/restaurant\/pms\/cashiering"/);
  });
});

describe("PMS Polish Wave 1 migration 0056 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes and does not apply live", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0056_pms_polish1_payment_methods_admin_fee_presets.sql");
    const supabase = join(here, "../../../../supabase/migrations/0056_pms_polish1_payment_methods_admin_fee_presets.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /pms_payment_methods/);
    assert.match(drizzleSql, /pms_shift_definitions/);
    assert.match(drizzleSql, /type_class/);
    assert.match(drizzleSql, /start_time/);
    assert.match(drizzleSql, /end_time/);
    assert.doesNotMatch(drizzleSql, /ADD COLUMN.*pms_fee_preset_posture/i);
    assert.doesNotMatch(drizzleSql, /CREATE TABLE.*pms_fee_preset/i);
    assert.doesNotMatch(drizzleSql, /ADD COLUMN.*pms_polish1_live/i);
    assert.doesNotMatch(drizzleSql, /pms_polish1_live boolean/i);
    assert.doesNotMatch(drizzleSql, /SECURITY DEFINER/i);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_payment_methods/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_shift_definitions/);
    assert.doesNotMatch(drizzleSql, /CREATE TABLE.*staff_shifts/i);
    assert.doesNotMatch(drizzleSql, /REFERENCES public\.staff_shifts/i);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
    assert.match(drizzleSql, /APPLY AFTER MERGE/i);
    assert.match(drizzleSql, /IN THE PR ONLY/);
    assert.equal(POLISH1_AUDIT_PAYMENT_METHOD, "pms_polish1_payment_method_updated");
    assert.equal(POLISH1_AUDIT_SHIFT, "pms_polish1_shift_updated");
    assert.equal(POLISH1_AUDIT_FEE_PRESET, "pms_polish1_fee_preset_updated");
  });
});
