import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARD3_TAXES_AUDIT_SECTION,
  CARD3_TAXES_TABS,
  amountIsValid,
  evaluateTaxesCard3Readiness,
  isSetupCode,
  type TaxesCard3Snapshot,
} from "./taxes-card3.server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fns = readFileSync(new URL("./taxes-card3.functions.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./taxes-card3.server.ts", import.meta.url), "utf8");
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-section.tsx", import.meta.url),
  "utf8",
);
const ui = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-taxes.tsx", import.meta.url),
  "utf8",
);

function snapshot(partial?: Partial<TaxesCard3Snapshot>): TaxesCard3Snapshot {
  return {
    taxes: [],
    groups: [],
    serviceCharges: [],
    fees: [],
    exemptionRules: [],
    ...partial,
  };
}

describe("Card 3 Phase 2 taxes readiness", () => {
  it("stays not started until anything is saved and never completes the Card 3 programme", () => {
    const empty = evaluateTaxesCard3Readiness(snapshot());
    assert.equal(empty.status, "not_started");
    assert.equal(empty.ready, false);
    const started = evaluateTaxesCard3Readiness(
      snapshot({
        taxes: [
          {
            id: "t1",
            code: "VAT",
            name: "VAT",
            chargeType: "percentage",
            amount: 15,
            basis: "all",
            calculation: "exclusive",
            active: true,
          },
        ],
      }),
    );
    assert.equal(started.status, "in_progress");
    const complete = evaluateTaxesCard3Readiness(
      snapshot({
        taxes: [
          {
            id: "t1",
            code: "VAT",
            name: "VAT",
            chargeType: "percentage",
            amount: 15,
            basis: "all",
            calculation: "exclusive",
            active: true,
          },
        ],
        groups: [{ id: "g1", code: "STD", name: "Standard", active: true, taxIds: ["t1"] }],
        serviceCharges: [
          {
            id: "s1",
            code: "SC",
            name: "Service",
            chargeType: "percentage",
            amount: 10,
            basis: "fnb",
            active: true,
          },
        ],
        fees: [
          {
            id: "f1",
            code: "CITY",
            name: "City levy",
            chargeType: "fixed",
            amount: 5,
            basis: "night",
            active: true,
          },
        ],
        exemptionRules: [
          {
            id: "e1",
            code: "DIPL",
            name: "Diplomatic",
            description: "",
            reasonCategory: "diplomatic",
            documentationRequired: true,
            approvalRequired: true,
            active: true,
          },
        ],
      }),
    );
    assert.equal(complete.status, "complete");
    assert.doesNotMatch(fns, /rates-guest-rules/);
    assert.doesNotMatch(fns, /pms_property_setup_status/);
  });

  it("rejects invalid codes, percentage amounts, and cross-tenant group mappings", () => {
    assert.equal(isSetupCode("VAT"), true);
    assert.equal(isSetupCode("vat-1"), false);
    assert.equal(amountIsValid("percentage", 15), true);
    assert.equal(amountIsValid("percentage", 150), false);
    assert.equal(amountIsValid("fixed", 12.5), true);
    assert.match(fns, /Tax group mappings must use taxes from this property/);
    assert.match(fns, /eq\("restaurant_id"/);
    assert.doesNotMatch(fns, /from\("pms_tax_exemptions"\)/);
    assert.doesNotMatch(fns, /tax_rate|service_rate|service_enabled/);
    assert.doesNotMatch(fns, /from\("restaurants"\)/);
  });

  it("reads as a member, writes as owner/manager, and audits on the shared staff log", () => {
    assert.match(fns, /requireFrontOfficeAccess/);
    assert.match(fns, /requireRoomManager/);
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.match(fns, /card3_tax_saved/);
    assert.match(fns, /card3_tax_group_saved/);
    assert.match(fns, /card3_service_charge_saved/);
    assert.match(fns, /card3_fee_saved/);
    assert.match(fns, /card3_exemption_rule_saved/);
    assert.equal(CARD3_TAXES_AUDIT_SECTION, "card3-taxes");
    assert.doesNotMatch(fns, /pms_tax_activity/);
    assert.doesNotMatch(server, /reservation_id|folio_id/);
    const types = readFileSync(join(here, "../../../../src/integrations/supabase/types.ts"), "utf8");
    assert.doesNotMatch(types, /pms_tax_exemption_rules/);
    assert.doesNotMatch(types, /pms_taxes:/);
  });

  it("keeps six taxes tabs and leaves remaining Card 3 domains as placeholders", () => {
    assert.deepEqual(
      CARD3_TAXES_TABS.map((tab) => tab.label),
      ["Overview", "Taxes", "Tax Groups", "Service Charges", "Fees", "Exemptions"],
    );
    assert.match(section, /PmsPropertySetupCard3Taxes/);
    assert.match(ui, /CARD3_TAXES_SET1_COPY/);
    assert.match(section, /CARD3_DOMAIN_PLACEHOLDER/);
    assert.doesNotMatch(ui, /Rates & Pricing/);
  });
});
