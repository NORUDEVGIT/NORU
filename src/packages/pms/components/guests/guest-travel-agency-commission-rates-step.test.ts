import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  emptyGuestTravelAgentCreateDraft,
  travelAgentCommissionReady,
  travelAgentCreateFieldIssues,
  type GuestTravelAgentCreateDraft,
} from "../../lib/guest-travel-agent-create-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Travel Agency Step 3 (Commission & Rates) Component Architecture", () => {
  const step3Code = readRel("./guest-travel-agency-commission-rates-step.tsx");
  const modalCode = readRel("./guest-travel-agency-create-modal.tsx");
  const workspaceCode = readRel("../workspaces/guest-travel-agent-create-workspace.tsx");

  it("1. Step 3 component renders the canonical 6 areas strictly without leakage", () => {
    // 1. Commercial Model
    assert.match(step3Code, /Commercial Model/);
    assert.match(step3Code, /commercial-model-commissionable/);
    assert.match(step3Code, /commercial-model-net-rate/);

    // 2. Commission Setup
    assert.match(step3Code, /Commission Setup/);
    assert.match(step3Code, /commission-currency-select/);
    assert.match(step3Code, /commission-effective-on/);
    assert.match(step3Code, /commission-expires-on/);
    assert.match(step3Code, /Calculated from Room Subtotal excluding taxes\/fees/);
    assert.match(step3Code, /data-testid="commission-notes"/);

    // 3. Commission Application Rules
    assert.match(step3Code, /Commission Application Rules/);
    assert.match(step3Code, /commission-apply-mode-all/);
    assert.match(step3Code, /commission-apply-mode-specific/);
    assert.match(step3Code, /add-commission-rule-btn/);

    // 4. Agency Net Rate Pricing
    assert.match(step3Code, /Agency Net Rate Pricing/);
    assert.match(step3Code, /net-method-rate-plan/);
    assert.match(step3Code, /net-method-discount/);
    assert.match(step3Code, /net-method-contracted/);

    // 6. Commercial Notes
    assert.match(step3Code, /Commercial Notes/);
    assert.match(step3Code, /commercial-notes-input/);
  });

  it("2. Step 3 strictly excludes Step 4 (Booking & Operations) and Step 5 (Payment & Credit) fields", () => {
    // No packages or meal plans in Step 3
    assert.doesNotMatch(step3Code, /draft\.packageId/);
    assert.doesNotMatch(step3Code, /draft\.mealPlanId/);
    assert.doesNotMatch(step3Code, /catalogues\?\.packages/);
    assert.doesNotMatch(step3Code, /catalogues\?\.mealPlans/);

    // No billing arrangements or credit limits in Step 3
    assert.doesNotMatch(step3Code, /draft\.billingArrangement/);
    assert.doesNotMatch(step3Code, /draft\.creditLimitAmount/);
    assert.doesNotMatch(step3Code, /draft\.paymentMethodId/);
  });

  it("3. Exports CommercialSummaryPanel for live right-side review in both modal and workspace", () => {
    assert.match(step3Code, /export function CommercialSummaryPanel/);
    assert.match(step3Code, /data-testid="commercial-summary-panel"/);
    assert.match(modalCode, /<CommercialSummaryPanel/);
    assert.match(workspaceCode, /<CommercialSummaryPanel/);
  });

  it("4. Enforces mutual exclusivity: Commissionable vs Net Rate behavior", () => {
    const draft = emptyGuestTravelAgentCreateDraft();

    // Default is commissionable
    assert.equal(draft.commercialModel, "commissionable");
    assert.equal(draft.commissionEnabled, true);

    // Net rate model invalidates commission readiness
    draft.commercialModel = "net_rate";
    draft.netPricingMethod = null;
    assert.equal(travelAgentCommissionReady(draft), false);

    // Net rate requires validFrom, validUntil, netCurrencyCode, and netPricingMethod
    const netIssues = travelAgentCreateFieldIssues(draft);
    assert.ok(netIssues.some((i) => i.key === "netValidFrom" && i.step === "commission_rates"));
    assert.ok(netIssues.some((i) => i.key === "netValidUntil" && i.step === "commission_rates"));
    assert.ok(netIssues.some((i) => i.key === "netCurrencyCode" && i.step === "commission_rates"));
    assert.ok(netIssues.some((i) => i.key === "netPricingMethod" && i.step === "commission_rates"));
  });

  it("5. Modal ReviewStep integrates Step 3 commercial summary", () => {
    assert.match(modalCode, /ReviewCard title="3\. Commission & Rates"/);
    assert.match(modalCode, /Commercial Model:/);
    assert.match(modalCode, /Commission Currency:/);
    assert.match(modalCode, /Commission Basis:/);
    assert.match(modalCode, /onEdit\("commission_rates"\)/);
  });
});
