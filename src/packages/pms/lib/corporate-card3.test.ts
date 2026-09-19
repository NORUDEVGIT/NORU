import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_CORPORATE_AUDIT_SECTION,
  CARD3_CORPORATE_TABS,
  evaluateCorporateCard3Readiness,
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
      },
    ],
    roomTypes: [{ id: "rt1", code: "C2SM", name: "Small", active: true }],
    currencies: [{ code: "ETB", isBase: true }],
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
  it("uses only not_started, in_progress, and complete for this domain", () => {
    const empty = evaluateCorporateCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);

    const started = evaluateCorporateCard3Readiness(snapshot({ agreements: [activeAgreement] }));
    assert.equal(started.status, "in_progress");
    assert.equal(started.ready, false);

    const complete = evaluateCorporateCard3Readiness(
      snapshot({
        agreements: [activeAgreement],
        contractRates: [activeRate],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.equal(complete.ready, true);
  });

  it("exposes exactly the three Phase 7 tabs and the isolated API files", () => {
    assert.deepEqual(
      CARD3_CORPORATE_TABS.map((tab) => tab.label),
      ["Overview", "Corporate Agreements", "Contract Rates"],
    );
    assert.equal(existsSync(join(here, "corporate-card3.server.ts")), true);
    assert.equal(existsSync(join(here, "corporate-card3.functions.ts")), true);
    assert.match(fns, /export const getCorporateCard3/);
    assert.match(fns, /export const saveCorporateAgreementCard3/);
    assert.match(fns, /export const saveContractRateCard3/);
  });

  it("wires the Phase 7 workspace, inherited catalogues, editing, search, audit, and loading state", () => {
    assert.match(section, /getCorporateCard3/);
    assert.match(section, /PmsPropertySetupCard3Corporate/);
    assert.match(section, /domain\?\.id === "corporate-contract-rates"/);
    assert.match(section, /corporateQuery\.isLoading/);
    assert.match(section, /corporateStatus/);
    assert.match(section, /Loading configuration readiness/);
    assert.match(ui, /PmsPropertySetupCard3Workspace/);
    assert.match(ui, /CARD3_CORPORATE_TABS/);
    assert.match(ui, /onAuditHistory/);
    assert.match(ui, /Search corporate agreements/);
    assert.match(ui, /Search contract rates/);
    assert.match(ui, /Filter contract rates by agreement/);
    assert.match(ui, /Inherited payment terms/);
    assert.match(ui, /Authorized bookers are out of this workspace/);
    assert.match(ui, /no reservation or folio operational changes/);
    assert.match(ui, /saveCorporateAgreementCard3/);
    assert.match(ui, /saveContractRateCard3/);
    assert.match(ui, /focus-visible:ring-\[#C89933\]/);
  });

  it("requires member reads, manager writes, shared audit, and migration fail-soft", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.ok((fns.match(/requireRoomManager/g) ?? []).length >= 2);
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
