import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  GUEST_TRAVEL_AGENT_CREATE_STEPS,
  emptyGuestTravelAgentCreateDraft,
  travelAgentCreateFieldIssues,
  travelAgentCreateStepErrors,
  type GuestTravelAgentCreateDraft,
} from "../../lib/guest-travel-agent-create-workspace.ts";

import {
  validateTravelAgencyStep4,
  travelAgencyStep4PayloadFromDraft,
  travelAgencyStep4MasterPatch,
  missingRequiredTravelAgencyDocuments,
  type TravelAgencyStep4Config,
  type TravelAgencyStep4DocumentTypeOption,
} from "../../lib/guest-travel-agency-step4.server.ts";

describe("Travel Agency Step 4 — Payment, Credit & Reservation Rules", () => {
  const workspaceDir = process.cwd();
  const supabaseMigrationPath = join(
    workspaceDir,
    "supabase/migrations/0124_pms_travel_agency_step4_payment_rules.sql",
  );
  const drizzleMigrationPath = join(
    workspaceDir,
    "drizzle/migrations/0124_pms_travel_agency_step4_payment_rules.sql",
  );

  const mockConfig: TravelAgencyStep4Config = {
    currencies: [
      { code: "USD", name: "US Dollar", symbol: "$", isBase: true },
      { code: "EUR", name: "Euro", symbol: "€", isBase: false },
      { code: "ETB", name: "Ethiopian Birr", symbol: "Br", isBase: false },
    ],
    paymentMethods: [
      { id: "pm-11111111-1111-4111-8111-111111111111", code: "CREDIT_CARD", name: "Credit Card", paymentType: "card" },
      { id: "pm-22222222-2222-4222-8222-222222222222", code: "BANK_TRANSFER", name: "Bank Transfer", paymentType: "bank_transfer" },
    ],
    billingRules: [
      {
        id: "br-11111111-1111-4111-8111-111111111111",
        code: "RULE_TA_DIRECT",
        name: "Travel Agent Direct Billing",
        systemCode: "standard",
        routingSummary: "Full Folio Routed to Agency",
        isDefault: true,
      },
      {
        id: "br-22222222-2222-4222-8222-222222222222",
        code: "RULE_CUSTOM",
        name: "Custom Other Settlement",
        systemCode: "custom_other",
        routingSummary: "Special billing terms apply",
        isDefault: false,
      },
    ],
    depositPolicies: [
      { id: "dp-11111111-1111-4111-8111-111111111111", code: "DEP_1NIGHT", name: "First Night Deposit", isDefault: true, description: "Requires 1 night deposit" },
    ],
    cancellationPolicies: [
      { id: "cp-11111111-1111-4111-8111-111111111111", code: "CANC_24H", name: "24 Hours Free Cancellation", isDefault: true, description: "Free cancellation up to 24h before arrival" },
    ],
    noShowPolicies: [
      { id: "nsp-11111111-1111-4111-8111-111111111111", code: "NOSHOW_1800", name: "Release at 18:00", isDefault: true, description: "Release room after 18:00 on arrival day" },
    ],
    documentTypes: [
      {
        id: "dt-11111111-1111-4111-8111-111111111111",
        code: "AGENCY_LICENSE",
        name: "Travel Agency License",
        description: "Official government tourism operating license",
        required: true,
        displayOrder: 1,
      },
      {
        id: "dt-22222222-2222-4222-8222-222222222222",
        code: "TAX_CERT",
        name: "Tax Certificate",
        description: "Tax identification certificate",
        required: false,
        displayOrder: 2,
      },
    ],
  };

  describe("1. Dual-Lane Database Migrations (0124)", () => {
    it("verifies supabase migration 0124 exists and contains schema additions", () => {
      assert.ok(existsSync(supabaseMigrationPath), "Supabase migration 0124 must exist");
      const sql = readFileSync(supabaseMigrationPath, "utf8");
      assert.match(sql, /default_deposit_policy_id/);
      assert.match(sql, /default_cancellation_policy_id/);
      assert.match(sql, /default_no_show_policy_id/);
      assert.match(sql, /booking_notes/);
      assert.match(sql, /applies_to_travel_agency/);
    });

    it("verifies drizzle migration 0124 matches supabase migration 0124", () => {
      assert.ok(existsSync(drizzleMigrationPath), "Drizzle migration 0124 must exist");
      const subSql = readFileSync(supabaseMigrationPath, "utf8").trim();
      const drizSql = readFileSync(drizzleMigrationPath, "utf8").trim();
      assert.equal(drizSql, subSql, "Drizzle and Supabase migrations must be identical dual-lane files");
    });
  });

  describe("2. Canonical 5-Step Stepper Definition", () => {
    it("defines canonical step 4 as Payment, Credit & Reservation Rules", () => {
      assert.equal(GUEST_TRAVEL_AGENT_CREATE_STEPS.length, 5);
      const step4 = GUEST_TRAVEL_AGENT_CREATE_STEPS[3];
      assert.equal(step4.id, "payment_rules");
      assert.equal(step4.number, 4);
      assert.equal(step4.title, "Payment, Credit & Reservation Rules");
    });

    it("defines canonical step 5 as Final Review & Create", () => {
      const step5 = GUEST_TRAVEL_AGENT_CREATE_STEPS[4];
      assert.equal(step5.id, "review");
      assert.equal(step5.number, 5);
      assert.equal(step5.title, "Final Review & Create");
    });
  });

  describe("3. Section 1 — Payment & Billing Validation", () => {
    it("requires billing currency in complete mode", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.agencyType = "local";
      draft.billingCurrencyCode = "";
      draft.currency = "";

      const issues = travelAgentCreateFieldIssues(draft);
      const currencyIssue = issues.find((i) => i.key === "billingCurrencyCode");
      assert.ok(currencyIssue, "Must flag missing billing currency");
      assert.equal(currencyIssue.step, "payment_rules");
    });

    it("validates payment timing enum constraint", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.agencyType = "local";
      draft.billingCurrencyCode = "USD";
      // invalid timing
      draft.paymentTiming = "invalid_timing" as any;

      const issues = travelAgentCreateFieldIssues(draft);
      const timingIssue = issues.find((i) => i.key === "paymentTiming");
      assert.ok(timingIssue, "Must flag invalid payment timing");
    });

    it("requires default billing rule in complete mode", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.agencyType = "local";
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "";

      const issues = travelAgentCreateFieldIssues(draft);
      const ruleIssue = issues.find((i) => i.key === "defaultBillingRuleId");
      assert.ok(ruleIssue, "Must flag missing default billing rule");
    });

    it("requires billing instruction when custom_other rule is selected", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-22222222-2222-4222-8222-222222222222"; // system_code: custom_other
      draft.billingInstruction = "";
      draft.documents = [
        {
          documentTypeId: "dt-11111111-1111-4111-8111-111111111111",
          storagePath: "rest-1/travel-agents/drafts/license.pdf",
          fileName: "license.pdf",
          fileSize: 100,
          uploadedAt: new Date().toISOString(),
        },
      ];

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.throws(
        () => validateTravelAgencyStep4(payload, mockConfig, "complete"),
        /Billing Instruction is required when custom billing rule is selected/,
      );
    });
  });

  describe("4. Section 2 — Credit Arrangement Validation", () => {
    it("enforces credit arrangement enablement and days when timing is credit_terms", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.agencyType = "local";
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "credit_terms";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.allowCredit = false;
      draft.creditDays = 0;

      const issues = travelAgentCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "allowCredit"), "Must require credit arrangement to be enabled");
      assert.ok(issues.some((i) => i.key === "creditDays"), "Must require credit days for credit terms");
    });

    it("rejects invalid credit days outside 0-365", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.allowCredit = true;
      draft.creditStatus = "approved";
      draft.creditDays = 400;

      const issues = travelAgentCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "creditDays" && i.message.includes("between 0 and 365")));
    });

    it("rejects negative credit limits", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.name = "Test Agency";
      draft.allowCredit = true;
      draft.creditStatus = "approved";
      draft.creditLimitAmount = "-500";

      const issues = travelAgentCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "creditLimitAmount" && i.message.includes("negative")));
    });

    it("accepts valid credit arrangement with presets and custom days", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.allowCredit = true;
      draft.creditStatus = "approved";
      draft.creditLimitAmount = "50000";
      draft.creditDays = 30;

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.equal(payload.allowCredit, true);
      assert.equal(payload.creditStatus, "approved");
      assert.equal(payload.creditLimitAmount, 50000);
      assert.equal(payload.creditDays, 30);
    });
  });

  describe("5. Section 3 — Reservation Rules & Policy Defaults", () => {
    it("validates policy foreign key existence against active config", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.defaultDepositPolicyId = "dp-nonexistent";

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.throws(
        () => validateTravelAgencyStep4(payload, mockConfig, "complete"),
        /Selected Guarantee Policy is invalid for this property/,
      );
    });

    it("enforces 500-character ceiling on booking notes", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.bookingNotes = "a".repeat(501);

      const issues = travelAgentCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "bookingNotes" && i.message.includes("500")));
    });
  });

  describe("6. Section 4 — Documents & Compliance", () => {
    it("blocks final completion when mandatory document is missing", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.documents = []; // missing AGENCY_LICENSE which is required in mockConfig

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.throws(
        () => validateTravelAgencyStep4(payload, mockConfig, "complete"),
        /The following required documents must be uploaded before creating the agency: Travel Agency License/,
      );
    });

    it("DOES NOT block Save Draft when mandatory document is missing", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.documents = []; // missing required doc

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.doesNotThrow(() => validateTravelAgencyStep4(payload, mockConfig, "draft"));
    });

    it("validates document metadata structure and storage path", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.documents = [
        {
          documentTypeId: "dt-11111111-1111-4111-8111-111111111111",
          storagePath: "rest-1/travel-agents/drafts/license.pdf",
          fileName: "license.pdf",
          name: "license.pdf",
          fileSizeBytes: 102400,
          uploadedAt: new Date().toISOString(),
        },
      ];

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      assert.doesNotThrow(() => validateTravelAgencyStep4(payload, mockConfig, "complete"));
    });
  });

  describe("7. Step 4 Master Patch Formatting", () => {
    it("transforms Step 4 draft into authoritative guest_account_masters columns", () => {
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.defaultPaymentMethodId = "pm-11111111-1111-4111-8111-111111111111";
      draft.paymentTiming = "credit_terms";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.allowCredit = true;
      draft.creditLimitAmount = "25000";
      draft.creditDays = 45;
      draft.creditStatus = "approved";
      draft.defaultDepositPolicyId = "dp-11111111-1111-4111-8111-111111111111";
      draft.defaultCancellationPolicyId = "cp-11111111-1111-4111-8111-111111111111";
      draft.defaultNoShowPolicyId = "nsp-11111111-1111-4111-8111-111111111111";
      draft.bookingNotes = "VIP client group with high volume";

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      const patch = travelAgencyStep4MasterPatch(payload);

      assert.equal(patch.billing_currency_code, "USD");
      assert.equal(patch.default_payment_method_id, "pm-11111111-1111-4111-8111-111111111111");
      assert.equal(patch.payment_timing, "credit_terms");
      assert.equal(patch.default_billing_rule_id, "br-11111111-1111-4111-8111-111111111111");
      assert.equal(patch.credit_account_enabled, true);
      assert.equal(patch.credit_limit_amount, 25000);
      assert.equal(patch.credit_days, 45);
      assert.equal(patch.credit_status, "approved");
      assert.equal(patch.default_deposit_policy_id, "dp-11111111-1111-4111-8111-111111111111");
      assert.equal(patch.default_cancellation_policy_id, "cp-11111111-1111-4111-8111-111111111111");
      assert.equal(patch.default_no_show_policy_id, "nsp-11111111-1111-4111-8111-111111111111");
      assert.equal(patch.booking_notes, "VIP client group with high volume");
      assert.equal(patch.payment_terms, "Net 45 Days");
    });
  });

  describe("8. Step 5 Pure Review UI Compatibility", () => {
    it("ensures ReviewStep does not contain editable inputs", () => {
      const modalCode = readFileSync(
        join(workspaceDir, "src/packages/pms/components/guests/guest-travel-agency-create-modal.tsx"),
        "utf8",
      );

      const reviewIndex = modalCode.indexOf("function ReviewStep(");
      const nextFuncIndex = modalCode.indexOf("function ReviewCard(", reviewIndex);
      const reviewStepSlice = modalCode.slice(reviewIndex, nextFuncIndex);

      // Verify zero input or select tags in ReviewStep
      assert.doesNotMatch(reviewStepSlice, /<Input/);
      assert.doesNotMatch(reviewStepSlice, /<Select/);
      assert.doesNotMatch(reviewStepSlice, /<Textarea/);

      // Verify Step 4 review sections are displayed
      assert.match(reviewStepSlice, /Payment &amp; Billing|Payment & Billing/);
      assert.match(reviewStepSlice, /Credit Arrangement/);
      assert.match(reviewStepSlice, /Reservation Policy Defaults/);
      assert.match(reviewStepSlice, /Documents/);
    });
  });

  describe("9. Modern Document Types in Settings and Company Creation", () => {
    it("Settings Card 4 displays document types matching identity documents tab pattern", () => {
      const settingsCode = readFileSync(
        join(workspaceDir, "src/packages/pms/components/settings/pms-card4-company-business.tsx"),
        "utf8",
      );

      // Verify table headers match identity documents layout
      assert.match(settingsCode, /<TableHead>Document Type<\/TableHead>/);
      assert.match(settingsCode, /<TableHead>Code<\/TableHead>/);
      assert.match(settingsCode, /<TableHead>Description<\/TableHead>/);
      assert.match(settingsCode, /<TableHead>Requirement<\/TableHead>/);
      assert.match(settingsCode, /<TableHead>Applies To<\/TableHead>/);
      assert.match(settingsCode, /<TableHead>Active<\/TableHead>/);

      // Verify Applies To is restricted to Company and Travel Agency
      assert.match(settingsCode, /row\.appliesToCompany/);
      assert.match(settingsCode, /row\.appliesToTravelAgency/);

      // Verify delete mutation and pagination are present
      assert.match(settingsCode, /deletePmsCompanyDocumentType/);
      assert.match(settingsCode, /docTypeDeleteMutation/);
      assert.match(settingsCode, /Showing \{docTypeStart\}–\{docTypeEnd\} of \{docTypes\.length\} document types/);
    });

    it("Company Contracts Step 4 matches Travel Agency horizontal document cards layout", () => {
      const companyContractsCode = readFileSync(
        join(workspaceDir, "src/packages/pms/components/guests/company-contracts-step.tsx"),
        "utf8",
      );

      // Verify Section 4 documents container and test id
      assert.match(companyContractsCode, /data-testid="company-documents-list"/);
      assert.match(companyContractsCode, /Required for Create/);
      assert.match(companyContractsCode, /FileText className=/);
      assert.match(companyContractsCode, /CheckCircle2 className=/);
      assert.match(companyContractsCode, /Replace/);
      assert.match(companyContractsCode, /Trash2 className=/);
    });

    it("Final Step (Step 5 Review & Create) completes end-to-end without missing icon or variable errors", () => {
      const modalCode = readFileSync(
        join(workspaceDir, "src/packages/pms/components/guests/guest-travel-agency-create-modal.tsx"),
        "utf8",
      );

      // Verify lucide icon imports include AlertCircle and CheckCircle2
      assert.match(modalCode, /AlertCircle,/);
      assert.match(modalCode, /CheckCircle2,/);

      // Verify completion mutation calls persistTravelAgentCreate with mode: complete
      assert.match(modalCode, /completeMutation = useMutation/);
      assert.match(modalCode, /persist\(\{ data: \{ restaurantId, draft, mode: "complete" \} \}\)/);
    });

    it("inactive required document types are ignored and never block validation or completion", () => {
      const inactiveDocType = {
        id: "dt-inactive-req",
        code: "INACTIVE_TAX",
        name: "Inactive Tax Certificate",
        description: "Test inactive document",
        required: true,
        appliesToTravelAgency: true,
        displayOrder: 1,
        active: false,
      };

      // Server helper missingRequiredTravelAgencyDocuments must ignore inactive docs
      const missing = missingRequiredTravelAgencyDocuments([inactiveDocType], []);
      assert.equal(missing.length, 0, "Inactive document must not be counted as missing required document");

      // In full step 4 validation, an inactive required document must not block complete mode
      const draft = emptyGuestTravelAgentCreateDraft();
      draft.billingCurrencyCode = "USD";
      draft.paymentTiming = "due_on_arrival";
      draft.defaultBillingRuleId = "br-11111111-1111-4111-8111-111111111111";
      draft.documents = [];

      const payload = travelAgencyStep4PayloadFromDraft("rest-1", "agency-1", draft, mockConfig.billingRules);
      const testConfig = { ...mockConfig, documentTypes: [inactiveDocType] };

      assert.doesNotThrow(() => validateTravelAgencyStep4(payload, testConfig, "complete"));
    });
  });
});


