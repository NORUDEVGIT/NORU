import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("corporate agreement cancellation phase 3", () => {
  const payments = read("../components/settings/pms-property-setup-card3-payments.tsx");
  const ratesUi = read("../components/settings/pms-property-setup-card2-rates.tsx");
  const contracts = read("../components/guests/company-contracts-step.tsx");
  const contractConfig = read("./corporate-contracts.functions.ts");
  const contractServer = read("./corporate-contracts.server.ts");
  const rates = read("./rates.functions.ts");
  const reservations = read("./reservations.functions.ts");

  it("removes cancellation management from Payments & Deposits", () => {
    assert.match(payments, /title="Payment methods"/);
    assert.match(payments, /title="Deposit policies"/);
    assert.match(payments, /addLabel="Add payment method"/);
    assert.match(payments, /addLabel="Add deposit policy"/);
    assert.doesNotMatch(payments, /title="Cancellation policies"/);
    assert.doesNotMatch(payments, /Add cancellation policy/i);
    assert.doesNotMatch(payments, /Edit cancellation policy/i);
    assert.doesNotMatch(payments, /listPmsCancellationPolicies/);
    assert.doesNotMatch(payments, /savePmsCancellationPolicy/);
    assert.doesNotMatch(payments, /setPmsCancellationPolicyActive/);
    assert.doesNotMatch(payments, /pms_cancellation_policies/);
    assert.match(payments, /Cancellation policies are managed in Rate &amp; Pricing/);
  });

  it("keeps cancellation and no-show catalogues on Rate & Pricing", () => {
    assert.match(ratesUi, /title="Cancellation policies"/);
    assert.match(ratesUi, /addLabel="Add cancellation policy"/);
    assert.match(ratesUi, /title="No-show policies"/);
    assert.match(ratesUi, /addLabel="Add no-show policy"/);
  });

  it("keeps the corporate agreement picker on the rate cancellation catalogue", () => {
    const start = contractConfig.indexOf("export const getCompanyContractCreateConfig");
    assert.ok(start >= 0);
    const body = contractConfig.slice(start);
    assert.match(body, /from\("pms_rate_cancellation_policies"\)/);
    assert.doesNotMatch(body, /from\("pms_cancellation_policies"\)/);
    assert.match(contracts, /label="Cancellation Policy"/);
    assert.match(contracts, /Uses the Rate & Pricing cancellation catalogue/);
    assert.match(contracts, /config\?\.cancellationPolicies/);
    assert.doesNotMatch(contracts, /pms_cancellation_policies/);
  });

  it("leaves rate plans and reservation create on their own cancellation sources", () => {
    assert.match(rates, /from\("pms_rate_cancellation_policies"\)/);
    assert.match(rates, /cancellation_policy_id/);
    assert.doesNotMatch(rates, /listPmsCancellationPolicies/);
    assert.match(reservations, /cancellation_policy_snapshot/);
    assert.doesNotMatch(reservations, /listPmsCancellationPolicies/);
    assert.doesNotMatch(contractConfig, /export const listPmsCancellationPolicies/);
    assert.doesNotMatch(contractConfig, /export const savePmsCancellationPolicy/);
    assert.doesNotMatch(contractConfig, /export const setPmsCancellationPolicyActive/);
    assert.doesNotMatch(contractConfig, /from\("pms_cancellation_policies"\)/);
    assert.match(contractServer, /export function resolveAgreementCancellation/);
    assert.doesNotMatch(contractServer, /cancellationViewBase\(input\.legacy, "legacy"\)/);
  });
});
