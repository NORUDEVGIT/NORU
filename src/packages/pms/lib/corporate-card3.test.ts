import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_CORPORATE_AUDIT_SECTION,
  CARD3_CORPORATE_TABS,
  evaluateCorporateCard3Readiness,
  suggestCorporateAgreementCode,
  type CorporateCard3Snapshot,
} from "./corporate-card3.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./corporate-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./corporate-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-corporate.tsx", import.meta.url),
  "utf8",
);
const wizard = readFileSync(
  new URL("../components/settings/corporate-agreement-wizard.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<CorporateCard3Snapshot>): CorporateCard3Snapshot {
  return {
    companies: [
      {
        id: "co1",
        code: "ACME",
        name: "Acme PLC",
        active: true,
        paymentTerms: "NET30",
        creditLimitNote: "Review monthly",
        defaultBillingRuleId: null,
      },
    ],
    roomTypes: [{ id: "rt1", code: "C2SM", name: "Small", active: true }],
    currencies: [{ code: "ETB", isBase: true }],
    billingRules: [],
    agreements: [],
    contractRates: [],
    ...partial,
  };
}

const activeAgreement = {
  id: "ag1",
  companyId: "co1",
  companyLabel: "ACME — Acme PLC",
  code: "CORP1",
  name: "Acme 2026",
  contractNumber: "C-100",
  contractTypeId: null,
  contractTypeLabel: "",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  currencyCode: "ETB",
  description: "",
  active: true,
};

const activeRate = {
  id: "cr1",
  agreementId: "ag1",
  agreementLabel: "CORP1 — Acme 2026",
  roomTypeId: "rt1",
  roomTypeLabel: "C2SM — Small",
  rateKind: "negotiated" as const,
  rateKindLabel: "Negotiated",
  amount: 140,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  active: true,
};

describe("Card 3 Phase 7 corporate and contract rates", () => {
  it("treats empty corporate catalogues as optional and activation-ready", () => {
    const empty = evaluateCorporateCard3Readiness(snapshot());
    assert.equal(empty.status, "complete");
    assert.equal(empty.ready, true);
    assert.deepEqual(empty.blockers, []);

    const withAgreement = evaluateCorporateCard3Readiness(
      snapshot({ agreements: [activeAgreement] }),
    );
    assert.equal(withAgreement.status, "complete");
    assert.equal(withAgreement.ready, true);
    assert.deepEqual(withAgreement.blockers, []);

    const complete = evaluateCorporateCard3Readiness(
      snapshot({
        agreements: [activeAgreement],
        contractRates: [activeRate],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);

    const invalid = evaluateCorporateCard3Readiness(
      snapshot({
        agreements: [{ ...activeAgreement, validTo: "2020-01-01" }],
      }),
    );
    assert.equal(invalid.ready, true);
    assert.equal(invalid.blockers.length, 0);
    assert.ok(invalid.warnings.length > 0);
  });

  it("suggests sequential CORP_YYYY_NNN agreement codes", () => {
    assert.equal(
      suggestCorporateAgreementCode(["CORP_2026_001", "CORP_2026_003"], 2026),
      "CORP_2026_004",
    );
  });

  it("exposes corporate tabs and the isolated API files", () => {
    assert.deepEqual(
      CARD3_CORPORATE_TABS.map((tab) => tab.label),
      ["Corporate Agreements", "Contract Rates", "Contract Types"],
    );
    assert.equal(existsSync(join(here, "corporate-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "corporate-card3.functions.ts")), true);
    assert.match(fns, /export const getCorporateCard3/);
    assert.match(fns, /export const saveCorporateAgreementCard3/);
    assert.match(fns, /export const saveContractRateCard3/);
  });

  it("wires the consolidated corporate agreement wizard workspace", () => {
    assert.match(section, /getCorporateCard3/);
    assert.match(section, /PmsPropertySetupCard3Corporate/);
    assert.match(section, /domain\?\.id === "corporate-contract-rates"/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /New Corporate Agreement/);
    assert.match(ui, /No corporate agreements configured/);
    assert.match(ui, /Optional/);
    assert.match(ui, /Manage contract types/);
    assert.match(ui, /CorporateAgreementWizard/);
    assert.match(wizard, /Create Corporate Agreement/);
    assert.match(wizard, /Complete Corporate Agreement/);
    assert.match(wizard, /GuestCompanyCreateModal/);
    assert.match(wizard, /Contract Rates/);
    assert.match(wizard, /Billing & Commercial/);
    assert.match(fns, /contract_type_id/);
    assert.match(fns, /agreementId/);
  });

  it("requires setup actor, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requirePmsSetupActor/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.equal(CARD3_CORPORATE_AUDIT_SECTION, "card3-corporate");
    assert.match(fns, /card3_corporate_agreement_saved/);
    assert.match(fns, /card3_contract_rate_saved/);
    assert.match(fns, /42P01/);
    assert.match(fns, /42703/);
    assert.match(fns, /PGRST205/);
    assert.match(fns, /PGRST204/);
    assert.doesNotMatch(server, /\bany\b/);
    assert.doesNotMatch(server, /pmsDb/);
    assert.doesNotMatch(fns, /Database\[/);
  });

  it("reuses companies and room types without writing Guest Profile or reservation engines", () => {
    assert.match(fns, /from\("pms_corporate_agreements"\)/);
    assert.match(fns, /from\("pms_contract_rates"\)/);
    assert.match(fns, /from\("guest_account_masters"\)/);
    assert.match(fns, /from\("room_types"\)/);
    assert.match(fns, /from\("pms_property_currencies"\)/);
    assert.match(fns, /account_type", "company"/);
    assert.match(fns, /payment_terms/);
    assert.match(fns, /credit_limit_note/);
    assert.doesNotMatch(fns, /from\("guest_account_masters"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /from\("room_types"\)\.(?:insert|update|delete)/);
    assert.doesNotMatch(fns, /guest_account_links|authorized_booker/);
    assert.doesNotMatch(fns, /hotel_reservations|price_hotel_stay|folio_transactions/);
    assert.doesNotMatch(fns, /pms_property_setup_status|programme/);
  });

  it("keeps the approved 0075 migration byte-identical and tenant-safe", () => {
    const drizzle = join(
      here,
      "../../../../drizzle/migrations/0075_pms_card3_corporate_contract_rates.sql",
    );
    const supabase = join(
      here,
      "../../../../supabase/migrations/0075_pms_card3_corporate_contract_rates.sql",
    );
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_corporate_agreements/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_contract_rates/);
    assert.match(sql, /REFERENCES public\.guest_account_masters \(id, restaurant_id\)/);
    assert.match(sql, /REFERENCES public\.room_types \(id, restaurant_id\)/);
    assert.match(sql, /rate_kind IN \('negotiated', 'fixed'\)/);
    assert.match(sql, /IN THE PR ONLY/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_corporate_agreements/);
    assert.doesNotMatch(sql, /INSERT INTO public\.pms_contract_rates/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.guest_account_masters/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.guest_account_links/);
    assert.doesNotMatch(sql, /authorized_booker/);
    assert.doesNotMatch(sql, /\breservation_id\b|\bfolio_id\b/);
  });
});
