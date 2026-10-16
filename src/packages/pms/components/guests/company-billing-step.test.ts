import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_BILLING_TIMINGS,
  COMPANY_CREDIT_STATUSES,
  companyCreateFieldIssues,
  emptyGuestCompanyCreateDraft,
  draftToCompanyAccountInput,
  paymentTimingLabel,
  creditStatusLabel,
} from "../../lib/guest-company-create-workspace.ts";
import {
  CANONICAL_BILLING_RULES,
  isBillingRuleApplicableToProfile,
} from "../../lib/billing-card3.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Company Creation Step 3 — Billing & Credit Domain & UI Specifications", () => {
  const billingStepCode = readRel("./company-billing-step.tsx");
  const workspaceCode = readRel("../workspaces/guest-company-create-workspace.tsx");
  const modalCode = readRel("./guest-company-create-modal.tsx");
  const functionsCode = readRel("../../lib/guest-company-create.functions.ts");
  const billingViewCode = readRel("./guest-company-billing.tsx");
  const supabaseSql = readRel("../../../../../supabase/migrations/0121_pms_card3_company_billing_credit.sql");
  const drizzleSql = readRel("../../../../../drizzle/migrations/0121_pms_card3_company_billing_credit.sql");
  const supabase0122Sql = readRel("../../../../../supabase/migrations/0122_pms_card3_canonical_billing_rules.sql");
  const drizzle0122Sql = readRel("../../../../../drizzle/migrations/0122_pms_card3_canonical_billing_rules.sql");
  const billingServerCode = readRel("../../lib/billing-card3.server.ts");
  const billingFunctionsCode = readRel("../../lib/billing-card3.functions.ts");
  const settingsBillingUiCode = readRel("../settings/pms-property-setup-card3-billing.tsx");

  describe("Section 1: Configuration Loading & Settings Sourcing", () => {
    it("sources billing rules from active pms_billing_rules", () => {
      assert.match(functionsCode, /pms_billing_rules/);
      assert.match(functionsCode, /getCompanyBillingCreditCreateConfig/);
      assert.match(billingStepCode, /config\?\.billingRules/);
      assert.doesNotMatch(billingStepCode, /Company Direct|Per Reservation/);
    });

    it("sources settlement methods from active pms_payment_methods", () => {
      assert.match(functionsCode, /pms_payment_methods/);
      assert.match(billingStepCode, /config\?\.paymentMethods/);
      assert.doesNotMatch(billingStepCode, /value="city_ledger"/i);
    });

    it("sources tax exemption rules from active pms_tax_exemption_rules", () => {
      assert.match(functionsCode, /pms_tax_exemption_rules/);
      assert.match(billingStepCode, /config\?\.taxExemptionRules/);
    });

    it("loads configured currencies and defaults to base currency", () => {
      assert.match(functionsCode, /baseCurrency/);
      assert.match(functionsCode, /pms_property_currencies/);
      assert.match(billingStepCode, /config\?\.currencies/);
    });
  });

  describe("Section 2: Removed Decorative & Obsolete Fields", () => {
    it("does NOT render Invoice Delivery Method, Invoice Recipient Email, TIN, or VAT numbers in Step 3", () => {
      assert.doesNotMatch(billingStepCode, /Invoice Delivery Method/i);
      assert.doesNotMatch(billingStepCode, /Invoice Recipient Email/i);
      assert.doesNotMatch(billingStepCode, /VAT Registered/i);
      assert.doesNotMatch(billingStepCode, /VAT Number/i);
      assert.doesNotMatch(billingStepCode, /TIN Number/i);
    });

    it("does NOT render a fake folio charge-routing matrix in Step 3", () => {
      assert.doesNotMatch(billingStepCode, /Room Charges payer/i);
      assert.doesNotMatch(billingStepCode, /Incidentals payer/i);
      assert.doesNotMatch(billingStepCode, /Meals payer/i);
      assert.doesNotMatch(billingStepCode, /Minibar payer/i);
      assert.doesNotMatch(billingStepCode, /Extras payer/i);
    });

    it("does NOT use Credit Limit Note as the primary input", () => {
      assert.match(billingStepCode, /creditLimitAmount/);
      assert.doesNotMatch(billingStepCode, /creditLimitNote/);
    });
  });

  describe("Section 3: Client Validation Rules", () => {
    it("requires Default Billing Rule and Payment Timing", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.name = "Noru Corp";
      draft.businessProfileTypeId = "11111111-1111-4111-8111-111111111111";

      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "defaultBillingRuleId" && i.step === "billing"));
      assert.ok(issues.some((i) => i.key === "paymentTiming" && i.step === "billing"));

      draft.defaultBillingRuleId = "22222222-2222-4222-8222-222222222222";
      draft.paymentTiming = "due_on_arrival";
      const resolvedIssues = companyCreateFieldIssues(draft);
      assert.equal(resolvedIssues.filter((i) => i.step === "billing").length, 0);
    });

    it("validates that paymentTiming = 'credit_terms' requires credit enabled and credit days > 0", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.defaultBillingRuleId = "22222222-2222-4222-8222-222222222222";
      draft.paymentTiming = "credit_terms";
      draft.creditAccountEnabled = false;

      let issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "creditAccountEnabled" && i.message.includes("Enable Credit Facility")));
      assert.ok(issues.some((i) => i.key === "creditDays" && i.message.includes("Credit days are required")));

      draft.creditAccountEnabled = true;
      draft.creditStatus = "approved";
      draft.creditDays = 30;
      issues = companyCreateFieldIssues(draft);
      assert.equal(issues.filter((i) => i.step === "billing").length, 0);
    });

    it("validates credit facility status and limit constraints", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.defaultBillingRuleId = "22222222-2222-4222-8222-222222222222";
      draft.paymentTiming = "due_on_arrival";
      draft.creditAccountEnabled = true;
      draft.creditStatus = null;
      draft.creditLimitAmount = -500;

      let issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "creditStatus" && i.message.includes("Credit status is required")));
      assert.ok(issues.some((i) => i.key === "creditLimitAmount" && i.message.includes("0 or greater")));

      draft.creditStatus = "pending_approval";
      draft.creditLimitAmount = 10000;
      issues = companyCreateFieldIssues(draft);
      assert.equal(issues.filter((i) => i.step === "billing").length, 0);
    });

    it("blocks credit account enablement when company type has creditAccountAllowed = false", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.defaultBillingRuleId = "22222222-2222-4222-8222-222222222222";
      draft.paymentTiming = "due_on_arrival";
      draft.creditAccountEnabled = true;
      draft.creditStatus = "approved";

      const issues = companyCreateFieldIssues(draft, { creditAccountAllowed: false });
      assert.ok(issues.some((i) => i.key === "creditAccountEnabled" && i.message.includes("does not allow a credit account")));
    });

    it("validates tax exemption rule and required certificate documentation", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.defaultBillingRuleId = "22222222-2222-4222-8222-222222222222";
      draft.paymentTiming = "due_on_arrival";
      draft.taxExempt = true;
      draft.taxExemptionRuleId = null;

      let issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "taxExemptionRuleId" && i.message.includes("Tax exemption rule is required")));

      draft.taxExemptionRuleId = "33333333-3333-4333-8333-333333333333";
      issues = companyCreateFieldIssues(draft, {
        taxExemptionRules: [
          { id: "33333333-3333-4333-8333-333333333333", documentationRequired: true },
        ],
      });
      assert.ok(issues.some((i) => i.key === "taxExemptionCertificateNumber" && i.message.includes("Certificate or reference number is required")));

      draft.taxExemptionCertificateNumber = "CERT-9900";
      issues = companyCreateFieldIssues(draft, {
        taxExemptionRules: [
          { id: "33333333-3333-4333-8333-333333333333", documentationRequired: true },
        ],
      });
      assert.equal(issues.filter((i) => i.step === "billing").length, 0);
    });
  });

  describe("Section 4: Persistence Mapping & Field Clearing", () => {
    it("maps structured columns onto guest_account_masters input", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.name = "Ethiopian Airlines";
      draft.defaultBillingRuleId = "11111111-2222-3333-4444-555555555555";
      draft.defaultPaymentMethodId = "22222222-3333-4444-5555-666666666666";
      draft.billingCurrencyCode = "ETB";
      draft.paymentTiming = "credit_terms";
      draft.creditAccountEnabled = true;
      draft.creditLimitAmount = 500000;
      draft.creditDays = 45;
      draft.creditStatus = "approved";
      draft.taxExempt = true;
      draft.taxExemptionRuleId = "33333333-4444-5555-6666-777777777777";
      draft.taxExemptionCertificateNumber = "ET-TAX-001";
      draft.taxExemptionValidTo = "2027-12-31";
      draft.billingInstruction = "Direct folio transfer for all crew lodging.";

      const mapped = draftToCompanyAccountInput(draft);
      assert.equal(mapped.defaultBillingRuleId, "11111111-2222-3333-4444-555555555555");
      assert.equal(mapped.defaultPaymentMethodId, "22222222-3333-4444-5555-666666666666");
      assert.equal(mapped.billingCurrencyCode, "ETB");
      assert.equal(mapped.paymentTiming, "credit_terms");
      assert.equal(mapped.creditAccountEnabled, true);
      assert.equal(mapped.creditLimitAmount, 500000);
      assert.equal(mapped.creditDays, 45);
      assert.equal(mapped.creditStatus, "approved");
      assert.equal(mapped.taxExempt, true);
      assert.equal(mapped.taxExemptionRuleId, "33333333-4444-5555-6666-777777777777");
      assert.equal(mapped.taxExemptionCertificateNumber, "ET-TAX-001");
      assert.equal(mapped.taxExemptionValidTo, "2027-12-31");
      assert.equal(mapped.billingInstruction, "Direct folio transfer for all crew lodging.");
    });

    it("clears dependent credit fields when creditAccountEnabled = false", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.name = "Ethiopian Airlines";
      draft.creditAccountEnabled = false;
      draft.creditLimitAmount = 500000;
      draft.creditDays = 45;
      draft.creditStatus = "approved";

      const mapped = draftToCompanyAccountInput(draft);
      assert.equal(mapped.creditAccountEnabled, false);
      assert.equal(mapped.creditLimitAmount, null);
      assert.equal(mapped.creditDays, null);
      assert.equal(mapped.creditStatus, null);
    });

    it("clears dependent exemption fields when taxExempt = false", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.name = "Ethiopian Airlines";
      draft.taxExempt = false;
      draft.taxExemptionRuleId = "33333333-4444-5555-6666-777777777777";
      draft.taxExemptionCertificateNumber = "EX-12345";
      draft.taxExemptionValidTo = "2027-12-31";

      const mapped = draftToCompanyAccountInput(draft);
      assert.equal(mapped.taxExempt, false);
      assert.equal(mapped.taxExemptionRuleId, null);
      assert.equal(mapped.taxExemptionCertificateNumber, null);
      assert.equal(mapped.taxExemptionValidTo, null);
    });
  });

  describe("Section 5: UI & Review Integration", () => {
    it("workspace renders CompanyBillingStep with the 4 sections", () => {
      assert.match(workspaceCode, /<CompanyBillingStep/);
      assert.match(workspaceCode, /billingCreditConfig\.data/);
      assert.match(billingStepCode, /1\. Billing Configuration/);
      assert.match(billingStepCode, /2\. Credit Facility/);
      assert.match(billingStepCode, /3\. Tax Exemption/);
      assert.match(billingStepCode, /4\. Billing Notes & Instructions/);
    });

    it("modal renders CompanyBillingStep with the 4 sections", () => {
      assert.match(modalCode, /<CompanyBillingStep/);
      assert.match(modalCode, /billingCreditConfig\.data/);
    });

    it("review step displays structured Billing & Credit summary in workspace and modal", () => {
      assert.match(workspaceCode, /Billing Rule:/);
      assert.match(workspaceCode, /Settlement Method:/);
      assert.match(workspaceCode, /Payment Timing:/);
      assert.match(workspaceCode, /Tax Exemption/);
      assert.match(modalCode, /Billing Rule:/);
      assert.match(modalCode, /Settlement Method:/);
      assert.match(modalCode, /Payment Timing:/);
      assert.match(modalCode, /Tax Exemption/);
    });

    it("company profile billing tab displays structured fields with legacy fallback", () => {
      assert.match(billingViewCode, /Default Billing Rule/);
      assert.match(billingViewCode, /Settlement Method/);
      assert.match(billingViewCode, /Billing Currency/);
      assert.match(billingViewCode, /Payment Timing/);
      assert.match(billingViewCode, /Tax Exemption/);
      assert.match(billingViewCode, /Credit Limit/);
      assert.match(billingViewCode, /Credit Days/);
      assert.match(billingViewCode, /Credit Status/);
      assert.match(billingViewCode, /Payment terms/);
      assert.match(billingViewCode, /Credit limit note/);
    });
  });

  describe("Section 6: Dual-Lane Migration 0121 Verification", () => {
    it("has identical migration 0121 files in supabase and drizzle", () => {
      assert.equal(supabaseSql, drizzleSql);
    });

    it("contains all structured columns, constraints, foreign keys, and indexes", () => {
      assert.match(supabaseSql, /default_billing_rule_id uuid/);
      assert.match(supabaseSql, /default_payment_method_id uuid/);
      assert.match(supabaseSql, /billing_currency_code text/);
      assert.match(supabaseSql, /payment_timing text/);
      assert.match(supabaseSql, /credit_days integer/);
      assert.match(supabaseSql, /credit_status text/);
      assert.match(supabaseSql, /tax_exempt boolean/);
      assert.match(supabaseSql, /tax_exemption_rule_id uuid/);
      assert.match(supabaseSql, /tax_exemption_certificate_number text/);
      assert.match(supabaseSql, /tax_exemption_valid_to date/);
      assert.match(supabaseSql, /guest_account_masters_default_billing_rule_fk/);
      assert.match(supabaseSql, /guest_account_masters_default_payment_method_fk/);
      assert.match(supabaseSql, /guest_account_masters_tax_exemption_rule_fk/);
      assert.match(supabaseSql, /payment_timing IN \('due_on_arrival', 'due_on_departure', 'prepaid', 'credit_terms'\)/);
      assert.match(supabaseSql, /credit_status IN \('pending_approval', 'approved', 'suspended'\)/);
      assert.match(supabaseSql, /credit_days >= 0/);
      assert.match(supabaseSql, /credit_limit_amount >= 0/);
    });
  });

  describe("Section 7: Canonical Billing Rules & Profile Applicability (Correction Specifications)", () => {
    it("canonical rule set exists with all 10 predefined NORU rules", () => {
      assert.equal(CANONICAL_BILLING_RULES.length, 10);
      const systemCodes = CANONICAL_BILLING_RULES.map((r) => r.systemCode);
      const expectedCodes = [
        "none",
        "company_master",
        "individual_guest",
        "split_billing",
        "third_party",
        "direct_bill_city_ledger",
        "travel_agency",
        "tour_operator",
        "government_organization",
        "custom_other",
      ];
      assert.deepEqual(systemCodes, expectedCodes);

      // Verify human-readable names
      const names = CANONICAL_BILLING_RULES.map((r) => r.name);
      assert.ok(names.includes("None"));
      assert.ok(names.includes("Company Master"));
      assert.ok(names.includes("Individual Guest"));
      assert.ok(names.includes("Split Billing"));
      assert.ok(names.includes("Third Party"));
      assert.ok(names.includes("Direct Bill / City Ledger"));
      assert.ok(names.includes("Travel Agency"));
      assert.ok(names.includes("Tour Operator"));
      assert.ok(names.includes("Government / Organization"));
      assert.ok(names.includes("Custom / Other"));
    });

    it("Company flow filters profile-inappropriate rules (travel_agency & tour_operator reserved)", () => {
      const travelAgency = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "travel_agency");
      const tourOperator = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "tour_operator");
      const companyMaster = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "company_master");
      const individualGuest = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "individual_guest");
      const splitBilling = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "split_billing");
      const directBill = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "direct_bill_city_ledger");
      const thirdParty = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "third_party");
      const governmentOrg = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "government_organization");
      const customOther = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "custom_other");
      const noneRule = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "none");

      assert.ok(travelAgency && tourOperator && companyMaster);

      // Travel Agency and Tour Operator must NOT be applicable to company registration
      assert.equal(isBillingRuleApplicableToProfile(travelAgency, "company"), false);
      assert.equal(isBillingRuleApplicableToProfile(tourOperator, "company"), false);

      // Company registration must expose: None, Company Master, Individual Guest, Split Billing, Third Party, Direct Bill, Government / Org, Custom / Other
      assert.equal(isBillingRuleApplicableToProfile(noneRule!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(companyMaster, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(individualGuest!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(splitBilling!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(thirdParty!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(directBill!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(governmentOrg!, "company"), true);
      assert.equal(isBillingRuleApplicableToProfile(customOther!, "company"), true);

      // Verify that getCompanyBillingCreditCreateConfig filters via isBillingRuleApplicableToProfile
      assert.match(functionsCode, /isBillingRuleApplicableToProfile\(r,\s*"company"\)/);
    });

    it("arbitrary unsupported billing behaviors cannot be created if system-controlled mode is used", () => {
      // Functions rejects arbitrary rule codes not in canonical set
      assert.match(
        billingFunctionsCode,
        /Billing rules must correspond to a predefined canonical NORU billing rule type/,
      );

      // Settings UI only allows configuring canonical system rules
      assert.match(settingsBillingUiCode, /CANONICAL_BILLING_RULES/);
      assert.match(settingsBillingUiCode, /System Rule Type/);
      assert.match(settingsBillingUiCode, /NORU Canonical Catalogue/);
    });

    it("Step 3 loads Billing Rules from Settings with display name, not in dropdown with raw codes or descriptions", () => {
      assert.match(functionsCode, /from\("pms_billing_rules"\)/);
      assert.match(billingStepCode, /config\?\.billingRules/);
      assert.match(billingStepCode, /rule\.name/);
      assert.match(billingStepCode, /selectedBillingRule\.description/);
      assert.doesNotMatch(billingStepCode, /rule\.systemCode/);
    });

    it("Step 3 fields and section containers use square (rounded-none) UI for formal aesthetic", () => {
      assert.match(billingStepCode, /rounded-none.*billing-configuration-section/s);
      assert.match(billingStepCode, /default-billing-rule-select/);
      assert.match(billingStepCode, /rounded-none.*credit-facility-section/s);
    });

    it("removed 'Room Only / Room & Breakfast / All Charges' semantics do not appear", () => {
      assert.doesNotMatch(billingStepCode, /Room Only/i);
      assert.doesNotMatch(billingStepCode, /Room & Breakfast/i);
      assert.doesNotMatch(billingStepCode, /All Charges/i);

      assert.doesNotMatch(billingServerCode, /Room Only/i);
      assert.doesNotMatch(billingServerCode, /Room & Breakfast/i);
      assert.doesNotMatch(billingServerCode, /All Charges/i);

      assert.doesNotMatch(billingFunctionsCode, /Room Only/i);
      assert.doesNotMatch(billingFunctionsCode, /Room & Breakfast/i);
      assert.doesNotMatch(billingFunctionsCode, /All Charges/i);

      assert.doesNotMatch(functionsCode, /Room Only/i);
      assert.doesNotMatch(functionsCode, /Room & Breakfast/i);
      assert.doesNotMatch(functionsCode, /All Charges/i);
    });

    it("Custom / Other remains descriptive only and does not define automated folio routing", () => {
      assert.match(billingStepCode, /isCustomOtherRule/);
      assert.match(billingStepCode, /data-testid="custom-billing-instruction-input"/);
      assert.match(
        billingStepCode,
        /Stored as descriptive metadata only\. Does not alter system folio routing or cashiering logic\./,
      );
      // Persisted into guest_account_masters.billing_instruction as text
      assert.match(functionsCode, /billing_instruction:\s*draft\.billingInstruction/);
      assert.doesNotMatch(functionsCode, /create_folio_routing_rule/);
    });

    it("Direct Bill / City Ledger selection does not incorrectly imply operational AR support", () => {
      // Domain metadata marks it as planned
      const directBill = CANONICAL_BILLING_RULES.find((r) => r.systemCode === "direct_bill_city_ledger");
      assert.equal(directBill?.operationalStatus, "planned");
      assert.match(directBill?.operationalStatusNote ?? "", /City ledger accounting is planned/);

      // Step 3 UI renders operational notice banner
      assert.match(billingStepCode, /isDirectBillRule/);
      assert.match(billingStepCode, /data-testid="direct-bill-city-ledger-notice"/);
      assert.match(
        billingStepCode,
        /Automated Accounts Receivable \(AR\) and City Ledger posting engine will be activated in a future release/,
      );
      assert.match(
        billingStepCode,
        /Selecting this rule does not create an operational City Ledger account or post live folios/,
      );

      // Folio or AR posting is NOT triggered
      assert.doesNotMatch(functionsCode, /post_city_ledger|create_ar_account|city_ledger_entries/);
    });

    it("has identical dual-lane migration 0122 with schema changes and idempotent seeding", () => {
      assert.equal(supabase0122Sql, drizzle0122Sql);

      // Column additions
      assert.match(supabase0122Sql, /ADD COLUMN IF NOT EXISTS system_code text/);
      assert.match(supabase0122Sql, /ADD COLUMN IF NOT EXISTS is_system boolean/);
      assert.match(supabase0122Sql, /ADD COLUMN IF NOT EXISTS operational_status text/);
      assert.match(supabase0122Sql, /ADD COLUMN IF NOT EXISTS applicable_profile_types text\[\]/);

      // Relaxed check constraints
      assert.match(supabase0122Sql, /pms_billing_rules_code_check/);
      assert.match(supabase0122Sql, /code ~\*\s*'\^\[a-z0-9_\]\{1,50\}\$'/);
      assert.match(supabase0122Sql, /pms_billing_rules_split_check/);
      assert.match(supabase0122Sql, /pms_billing_rules_operational_status_check/);
      assert.match(supabase0122Sql, /pms_billing_rules_restaurant_system_code_idx/);

      // Idempotent seeding for 10 rules
      assert.match(supabase0122Sql, /INSERT INTO public\.pms_billing_rules/);
      assert.match(supabase0122Sql, /'COMPANY_MASTER',\s*'company_master'/);
      assert.match(supabase0122Sql, /'DIRECT_BILL_CITY_LEDGER',\s*'direct_bill_city_ledger'/);
      assert.match(supabase0122Sql, /'SPLIT_BILLING',\s*'split_billing'/);
      assert.match(supabase0122Sql, /'CUSTOM_OTHER',\s*'custom_other'/);
      assert.match(supabase0122Sql, /'TRAVEL_AGENCY',\s*'travel_agency'/);
      assert.match(supabase0122Sql, /'TOUR_OPERATOR',\s*'tour_operator'/);
      assert.match(supabase0122Sql, /'GOVERNMENT_ORGANIZATION',\s*'government_organization'/);
      assert.match(supabase0122Sql, /WHERE NOT EXISTS/);
    });
  });
});
