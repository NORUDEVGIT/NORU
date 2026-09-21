import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_BILLING_AUDIT_SECTION,
  CARD3_BILLING_TABS,
  evaluateBillingCard3Readiness,
  type BillingCard3Snapshot,
} from "./billing-card3.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./billing-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./billing-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-billing.tsx", import.meta.url),
  "utf8",
);

function inherited() {
  return {
    currencyCode: "ETB",
    legalEntityName: "Afrobel PLC",
    legalName: "Afrobel",
    brandName: "Afrobel",
    tradingName: "Afrobel Hotel",
    vatNumber: "VAT1",
    vatRegistered: true,
  };
}

function snapshot(partial?: Partial<BillingCard3Snapshot>): BillingCard3Snapshot {
  return {
    inherited: inherited(),
    invoiceSettings: null,
    billingRules: [],
    ...partial,
  };
}

const settings = {
  prefix: "INV",
  startingNumber: 1,
  numberPadding: 6,
  taxDisplay: "exclusive" as const,
  taxDisplayLabel: "Tax exclusive",
  invoiceFormat: "standard" as const,
  invoiceFormatLabel: "Standard",
};

const defaultRule = {
  id: "br1",
  code: "GUEST",
  name: "Guest pays",
  description: "",
  payerKind: "guest" as const,
  payerKindLabel: "Guest pays",
  splitGuestPercent: null,
  paymentTerms: "Due at checkout",
  isDefault: true,
  active: true,
};

describe("Card 3 Phase 6 billing and invoicing", () => {
  it("uses only not_started, in_progress, and complete for this domain", () => {
    const empty = evaluateBillingCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);

    const started = evaluateBillingCard3Readiness(snapshot({ invoiceSettings: settings }));
    assert.equal(started.status, "in_progress");
    assert.equal(started.ready, false);

    const noDefault = evaluateBillingCard3Readiness(
      snapshot({
        invoiceSettings: settings,
        billingRules: [{ ...defaultRule, isDefault: false }],
      }),
    );
    assert.equal(noDefault.status, "in_progress");

    const complete = evaluateBillingCard3Readiness(
      snapshot({
        invoiceSettings: settings,
        billingRules: [defaultRule],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);
  });

  it("exposes exactly the three Phase 6 tabs and the isolated API files", () => {
    assert.deepEqual(
      CARD3_BILLING_TABS.map((tab) => tab.label),
      ["Overview", "Invoice Settings", "Billing Rules"],
    );
    assert.equal(existsSync(join(here, "billing-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "billing-card3.functions.ts")), true);
    assert.match(fns, /export const getBillingCard3/);
    assert.match(fns, /export const saveInvoiceSettingsCard3/);
    assert.match(fns, /export const saveBillingRuleCard3/);
  });

  it("wires the Phase 6 workspace, inherited Card 1 values, editing, search, audit, and loading state", () => {
    assert.match(section, /getBillingCard3/);
    assert.match(section, /PmsPropertySetupCard3Billing/);
    assert.match(section, /domain\?\.id === "billing-invoicing"/);
    assert.match(section, /billingQuery\.isLoading/);
    assert.match(section, /billingStatus/);
    assert.match(section, /Loading configuration readiness/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_BILLING_TABS/);
    assert.doesNotMatch(ui, /onAuditHistory/);
    assert.match(ui, /Card3ListSection/);
    assert.match(ui, /Card3OverlapSheet/);
    assert.match(ui, /useCard3DraftSave/);
    assert.match(ui, /Search billing rules/);
    assert.match(ui, /Inherited from Card 1/);
    assert.match(ui, /City ledger is out of this workspace/);
    assert.match(ui, /no reservation or folio operational changes/);
    assert.match(ui, /saveInvoiceSettingsCard3/);
    assert.match(ui, /saveBillingRuleCard3/);
    assert.match(ui, /focus-visible:ring-\[#C89933\]/);
  });

  it("requires member reads, manager writes, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.ok((fns.match(/requireRoomManager/g) ?? []).length >= 2);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.equal(CARD3_BILLING_AUDIT_SECTION, "card3-billing");
    assert.match(fns, /card3_invoice_settings_saved/);
    assert.match(fns, /card3_billing_rule_saved/);
    assert.match(fns, /42P01/);
    assert.match(fns, /42703/);
    assert.match(fns, /PGRST205/);
    assert.match(fns, /PGRST204/);
    assert.doesNotMatch(server, /\bany\b/);
    assert.doesNotMatch(server, /pmsDb/);
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("reads Card 1 identity without writing operational billing engines", () => {
    assert.match(fns, /from\("pms_invoice_settings"\)/);
    assert.match(fns, /from\("pms_billing_rules"\)/);
    assert.match(fns, /legal_entity_name/);
    assert.match(fns, /brand_name/);
    assert.match(fns, /vat_number/);
    assert.match(fns, /currency_code/);
    assert.match(fns, /is_default: false/);
    assert.doesNotMatch(fns, /guest_account_masters/);
    assert.doesNotMatch(fns, /folio_transactions|post_folio_transaction|guest_folios/);
    assert.doesNotMatch(fns, /pms_admin_controls|folioPrefix/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme/);
    assert.doesNotMatch(fns, /from\("restaurants"\)\.(?:insert|update|delete)/);
  });

  it("keeps the approved 0074 migration byte-identical and tenant-safe", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0074_pms_card3_billing_invoicing.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0074_pms_card3_billing_invoicing.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_invoice_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_billing_rules/);
    assert.match(sql, /pms_billing_rules_default_unique/);
    assert.match(sql, /payer_kind IN \('guest', 'company', 'group', 'split'\)/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_invoice_settings/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_billing_rules/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.pms_billing_profiles/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.guest_account_masters/);
    assert.doesNotMatch(sql, /\breservation_id\b|\bfolio_id\b/);
  });
});
