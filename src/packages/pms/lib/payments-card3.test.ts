import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_PAYMENTS_AUDIT_SECTION,
  CARD3_PAYMENTS_TABS,
  evaluatePaymentsCard3Readiness,
  type PaymentsCard3Snapshot,
} from "./payments-card3.server.ts";
import { suggestPaymentMethodCode } from "./payments-card3-code.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./payments-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./payments-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-payments.tsx", import.meta.url),
  "utf8",
);
const card3 = readFileSync(new URL("./pms-property-setup-card3.ts", import.meta.url), "utf8");

function snapshot(partial?: Partial<PaymentsCard3Snapshot>): PaymentsCard3Snapshot {
  return {
    currencyCode: "ETB",
    paymentMethods: [],
    depositPolicies: [],
    paymentIntegrations: [],
    ...partial,
  };
}

const activeMethod = {
  id: "pm1",
  code: "CASH",
  name: "Cash",
  typeClass: "cash" as const,
  typeClassLabel: "Cash",
  notes: "",
  active: true,
  processingMode: "manual" as const,
  providerIntegrationId: null,
  providerLabel: "—",
};

describe("Card 3 Phase 5 payments", () => {
  it("completes from active payment methods without deposit policies on this page", () => {
    const empty = evaluatePaymentsCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);

    const complete = evaluatePaymentsCard3Readiness(snapshot({ paymentMethods: [activeMethod] }));
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);
    assert.equal(complete.blockers.length, 0);
  });

  it("exposes Payments tabs without Deposit Policies and keeps isolated API files", () => {
    assert.deepEqual(
      CARD3_PAYMENTS_TABS.map((tab) => tab.label),
      ["Overview", "Payment Methods"],
    );
    assert.equal(existsSync(join(here, "payments-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "payments-card3.functions.ts")), true);
    assert.match(fns, /export const getPaymentsCard3/);
    assert.match(fns, /export const savePaymentMethodCard3/);
    assert.match(fns, /export const saveDepositPolicyCard3/);
  });

  it("wires the Payments workspace with auto code, rectangular fields, and no deposit section", () => {
    assert.match(section, /getPaymentsCard3/);
    assert.match(section, /PmsPropertySetupCard3Payments/);
    assert.match(section, /domain\?\.id === "payments-deposits"/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_PAYMENTS_TABS/);
    assert.match(ui, /Card3ListSection/);
    assert.match(ui, /Card3OverlapSheet/);
    assert.match(ui, /Search payment methods/);
    assert.match(ui, /suggestPaymentMethodCode/);
    assert.match(ui, /payment-code-auto/);
    assert.match(ui, /No payment provider is connected yet/);
    assert.match(ui, /Manage integrations/);
    assert.match(ui, /CARD6_HREF/);
    assert.match(ui, /PAY_FIELD_CLASS/);
    assert.match(ui, /"Name", "Code", "Type", "Processing", "Provider", "Status"/);
    assert.doesNotMatch(ui, /title="Deposit policies"/);
    assert.doesNotMatch(ui, /addLabel="Add deposit policy"/);
    assert.doesNotMatch(ui, /Search deposit policies/);
    assert.match(ui, /export function DepositPolicySheet/);
    assert.match(card3, /title: "Payments"/);
    assert.doesNotMatch(card3, /Payments & Deposits/);
  });

  it("requires financial configure writes, immutable codes, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requirePmsSetupActor/);
    assert.match(fns, /CONFIG_FINANCIAL_CONFIGURE/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.equal(CARD3_PAYMENTS_AUDIT_SECTION, "card3-payments");
    assert.match(fns, /card3_payment_method_saved/);
    assert.match(fns, /card3_deposit_policy_saved/);
    assert.match(fns, /Code cannot be changed after it is saved/);
    assert.match(fns, /category", "payments"/);
    assert.match(fns, /42P01/);
    assert.match(fns, /42703/);
    assert.match(fns, /PGRST205/);
    assert.match(fns, /PGRST204/);
    assert.doesNotMatch(server, /\bany\b/);
    assert.doesNotMatch(server, /pmsDb/);
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("reuses tenders and keeps deposit policy API for Rate Plan without operational engines", () => {
    assert.match(fns, /from\("pms_payment_methods"\)/);
    assert.match(fns, /from\("pms_deposit_policies"\)/);
    assert.match(fns, /currency_code/);
    assert.match(fns, /is_default: false/);
    assert.doesNotMatch(fns, /deposit_required/);
    assert.doesNotMatch(fns, /folio_transactions|post_folio_transaction|fo_checkin_progress/);
    assert.doesNotMatch(fns, /hotel_reservations|guarantee_method/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme/);
    assert.doesNotMatch(fns, /from\("restaurants"\)\.(?:insert|update|delete)/);
  });

  it("keeps the approved 0073 migration byte-identical and tenant-safe", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0073_pms_card3_payments_deposits.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0073_pms_card3_payments_deposits.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /pms_payment_methods_type_class_check/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_deposit_policies/);
    assert.match(sql, /pms_deposit_policies_default_unique/);
    assert.match(sql, /restaurants\.deposit_\*/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_deposit_policies/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_payment_methods/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.restaurants/);
    assert.doesNotMatch(sql, /\breservation_id\b|\bfolio_id\b/);
  });

  it("generates underscore payment codes from names", () => {
    assert.equal(suggestPaymentMethodCode("Cash"), "CASH");
    assert.equal(suggestPaymentMethodCode("Bank Transfer"), "BANK_TRANSFER");
    assert.equal(suggestPaymentMethodCode("CBE Birr"), "CBE_BIRR");
    assert.equal(suggestPaymentMethodCode("Front Desk Card"), "FRONT_DESK_CARD");
  });
});
