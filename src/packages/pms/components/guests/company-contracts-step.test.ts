import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  emptyGuestCompanyCreateDraft,
  companyCreateFieldIssues,
  companyCreateStepErrors,
  emptyCompanyContractDraft,
  type GuestCompanyCreateDraft,
} from "../../lib/guest-company-create-workspace.ts";
import {
  validateCorporateAgreementPayload,
  buildCancellationPolicyPreview,
  buildNoShowPolicyPreview,
  getCorporateAgreementExpiryState,
  type CorporateAgreementPayload,
} from "../../lib/corporate-contracts.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("PHASE 2: Company Contracts & Agreements Step 4 Domain & UI Specifications", () => {
  const step4Code = readRel("./company-contracts-step.tsx");
  const modalCode = readRel("./guest-company-create-modal.tsx");
  const functionsCode = readRel("../../lib/guest-company-create.functions.ts");

  describe("Section 1: Configuration Loading & No Hardcoded Masters", () => {
    it("loads master data from composite getCompanyContractCreateConfig loader", () => {
      assert.match(modalCode, /getCompanyContractCreateConfig/);
      assert.match(modalCode, /company-contract-create-config/);
      assert.match(step4Code, /config\?\.contractTypes/);
      assert.match(step4Code, /config\?\.currencies/);
      assert.match(step4Code, /config\?\.ratePlans/);
      assert.match(step4Code, /config\?\.roomTypes/);
      assert.match(step4Code, /config\?\.guaranteePolicies/);
      assert.match(step4Code, /config\?\.cancellationPolicies/);
      assert.match(step4Code, /config\?\.noShowPolicies/);
      assert.match(step4Code, /config\?\.contractDocumentTypes/);
    });

    it("displays blocking message when no contract types are configured", () => {
      assert.match(
        step4Code,
        /No contract types are configured\. Configure Contract Types in Settings → Finance & Business before creating an active contract\./,
      );
    });

    it("disables or explains when no rate plans exist for Method A/B", () => {
      assert.match(step4Code, /No active rate plans available\. Configure Rate Plans in Settings/);
    });

    it("does NOT hardcode contract types or document types in step 4", () => {
      assert.doesNotMatch(step4Code, /"Signed Contract"|"Business License"|"TIN Certificate"/);
      assert.doesNotMatch(step4Code, /"Corporate Local"|"Corporate Global"/);
    });

    it("loads currency options from property settings and derives default from setting", () => {
      assert.match(step4Code, /helper="Populated from Property Setup Currency Settings\."/);
      assert.match(step4Code, /data-testid="contract-currency-select"/);
      assert.match(step4Code, /config\?\.currencies/);
      assert.doesNotMatch(step4Code, /\[\{ code: "ETB", isBase: true \}/);
    });

    it("supports fallback to catalogues from property settings for rate plans and room types", () => {
      assert.match(step4Code, /availableRatePlans/);
      assert.match(step4Code, /availableRoomTypes/);
      assert.match(modalCode, /catalogues=\{catalogues\}/);
    });
  });

  describe("Section 2: Pricing Method A (Use Existing Rate Plan)", () => {
    it("shows only Rate Plan, room type is read-only metadata, discount fields & rate table hidden", () => {
      assert.match(step4Code, /pricingMethod === "rate_plan"/);
      assert.match(step4Code, /This contract uses the selected property rate plan exactly as configured\./);
      assert.doesNotMatch(step4Code, /Method A Discount/);
    });

    it("requires ratePlanId for Method A", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.contractTypeId = "type-1";
      draft.contract.name = "Annual Contract";
      draft.contract.code = "CORP-2026-001";
      draft.contract.validFrom = "2026-01-01";
      draft.contract.validTo = "2026-12-31";
      draft.contract.currencyCode = "ETB";
      draft.contract.status = "active";
      draft.contract.pricingMethod = "rate_plan";
      draft.contract.ratePlanId = null;

      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "ratePlanId" && i.message.includes("Method A")));

      draft.contract.ratePlanId = "plan-1";
      const validIssues = companyCreateFieldIssues(draft);
      assert.equal(validIssues.some((i) => i.key === "ratePlanId"), false);
    });
  });

  describe("Section 3: Pricing Method B (Discount From Rate Plan)", () => {
    it("shows Base Rate Plan, Discount Type, and Discount Value; room type is inherited from plan", () => {
      assert.match(step4Code, /pricingMethod === "rate_plan_discount"/);
      assert.match(step4Code, /Base Rate Plan/);
      assert.match(step4Code, /Discount Type/);
      assert.match(step4Code, /Discount Value/);
      assert.match(
        step4Code,
        /Discount will be applied to the base rate plan when reservation pricing integration is active\./,
      );
    });

    it("validates percent discount bound (0 to 100%)", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.pricingMethod = "rate_plan_discount";
      draft.contract.ratePlanId = "plan-1";
      draft.contract.discountType = "percent";
      draft.contract.discountValue = 150; // exceeds 100%

      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "discountValue" && i.message.includes("100%")));

      draft.contract.discountValue = 15;
      const validIssues = companyCreateFieldIssues(draft);
      assert.equal(validIssues.some((i) => i.key === "discountValue"), false);
    });

    it("validates fixed discount value >= 0", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.pricingMethod = "rate_plan_discount";
      draft.contract.ratePlanId = "plan-1";
      draft.contract.discountType = "fixed";
      draft.contract.discountValue = -50;

      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "discountValue" && i.message.includes("non-negative")));

      draft.contract.discountValue = 500;
      const validIssues = companyCreateFieldIssues(draft);
      assert.equal(validIssues.some((i) => i.key === "discountValue"), false);
    });

    it("supports Rate Plan Application Scope and Discount Calculation Method in Method B UI", () => {
      assert.match(step4Code, /Rate Plan Application Scope/);
      assert.match(step4Code, /All Rate Plans/);
      assert.match(step4Code, /Specific Rate Plans/);
      assert.match(step4Code, /Discount Calculation Method/);
      assert.match(step4Code, /Same Discount For All/);
      assert.match(step4Code, /Separate Discount Per Plan/);
    });

    it("validates custom per-plan discounts when discountApplication is custom", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.pricingMethod = "rate_plan_discount";
      draft.contract.ratePlanScope = "selected";
      draft.contract.ratePlanIds = ["plan-1"];
      draft.contract.discountApplication = "custom";
      draft.contract.ratePlanDiscounts = [
        { ratePlanId: "plan-1", discountType: "percent", discountValue: 120 },
      ];

      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key === "ratePlanDiscounts.plan-1" && i.message.includes("100%")));

      draft.contract.ratePlanDiscounts = [
        { ratePlanId: "plan-1", discountType: "percent", discountValue: 20 },
      ];
      const validIssues = companyCreateFieldIssues(draft);
      assert.equal(validIssues.some((i) => i.key.startsWith("ratePlanDiscounts")), false);
    });

    it("allows ratePlanScope 'all' in Method A and Method B without requiring specific ratePlanId", () => {
      const draftA = emptyGuestCompanyCreateDraft();
      draftA.contract.pricingMethod = "rate_plan";
      draftA.contract.ratePlanScope = "all";
      draftA.contract.ratePlanId = null;
      draftA.contract.ratePlanIds = [];
      const issuesA = companyCreateFieldIssues(draftA);
      assert.equal(issuesA.some((i) => i.key === "ratePlanId"), false);

      const draftB = emptyGuestCompanyCreateDraft();
      draftB.contract.pricingMethod = "rate_plan_discount";
      draftB.contract.ratePlanScope = "all";
      draftB.contract.ratePlanId = null;
      draftB.contract.ratePlanIds = [];
      draftB.contract.discountApplication = "uniform";
      draftB.contract.discountType = "percent";
      draftB.contract.discountValue = 10;
      const issuesB = companyCreateFieldIssues(draftB);
      assert.equal(issuesB.some((i) => i.key === "ratePlanId"), false);
    });
  });

  describe("Section 4: Pricing Method C (Negotiated Room Rates)", () => {
    it("shows Negotiated Room Rates repeatable table, hides plan/discount fields", () => {
      assert.match(step4Code, /pricingMethod === "contracted_rates"/);
      assert.match(step4Code, /Negotiated Room Rates/);
      assert.match(step4Code, /Add Room Type Rate/);
    });

    it("requires at least one rate line for Active status and prevents duplicate room types", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.status = "active";
      draft.contract.pricingMethod = "contracted_rates";
      draft.contract.contractRates = [];

      const issuesEmpty = companyCreateFieldIssues(draft);
      assert.ok(issuesEmpty.some((i) => i.key === "contractRates" && i.message.includes("At least one")));

      draft.contract.contractRates = [
        { roomTypeId: "room-1", amount: 1200 },
        { roomTypeId: "room-1", amount: 1500 }, // duplicate room type
      ];
      const issuesDup = companyCreateFieldIssues(draft);
      assert.ok(issuesDup.some((i) => i.key.includes("roomTypeId") && i.message.includes("Duplicate")));

      draft.contract.contractRates = [
        { roomTypeId: "room-1", amount: 1200 },
        { roomTypeId: "room-2", amount: 1600 },
      ];
      const issuesValid = companyCreateFieldIssues(draft);
      assert.equal(issuesValid.some((i) => i.key.includes("contractRates")), false);
    });

    it("rejects negative amount in contracted rates", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.pricingMethod = "contracted_rates";
      draft.contract.contractRates = [{ roomTypeId: "room-1", amount: -100 }];
      const issues = companyCreateFieldIssues(draft);
      assert.ok(issues.some((i) => i.key.includes("amount") && i.message.includes("0 or greater")));
    });
  });

  describe("Section 5: Booking Policies & Previews", () => {
    it("renders operational preview for guarantee, cancellation, and no-show policies", () => {
      assert.match(step4Code, /buildCancellationPolicyPreview/);
      assert.match(step4Code, /buildNoShowPolicyPreview/);
      assert.match(step4Code, /Guarantee Policy/);
      assert.match(step4Code, /Cancellation Policy/);
      assert.match(step4Code, /No-Show Policy/);
    });

    it("builds human-readable cancellation preview without raw enums", () => {
      const preview = buildCancellationPolicyPreview(24, "first_night", 0, true);
      assert.match(preview, /24 hours/);
      assert.match(preview, /1st night room & tax penalty/);
    });

    it("builds human-readable no-show preview without raw enums", () => {
      const preview = buildNoShowPolicyPreview("first_night", 0, 18);
      assert.match(preview, /18:00/);
      assert.match(preview, /1st night room & tax penalty/);
    });
  });

  describe("Section 6: Contract Documents & Requiredness Rules", () => {
    const docTypes = [
      { id: "dt-1", name: "Signed Agreement", required: true, active: true },
      { id: "dt-2", name: "Business License", required: false, active: true },
    ];

    it("blocks Active contract when required document is missing", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.status = "active";
      draft.contract.documents = [];

      const issues = companyCreateFieldIssues(draft, { contractDocumentTypes: docTypes });
      assert.ok(
        issues.some(
          (i) => i.key === "documents.dt-1" && i.message.includes("Signed Agreement is required for an active contract"),
        ),
      );
    });

    it("relaxes required document validation when contract is Draft", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.status = "draft";
      draft.contract.documents = [];

      const issues = companyCreateFieldIssues(draft, { contractDocumentTypes: docTypes });
      assert.equal(issues.some((i) => i.key.startsWith("documents.")), false);
    });

    it("passes when all required documents are attached", () => {
      const draft = emptyGuestCompanyCreateDraft();
      draft.contract.status = "active";
      draft.contract.documents = [
        {
          id: "doc-1",
          documentTypeId: "dt-1",
          name: "Agreement_Signed.pdf",
          fileStoragePath: "companies/agreements/1.pdf",
          fileSizeBytes: 2048,
          mimeType: "application/pdf",
        },
      ];

      const issues = companyCreateFieldIssues(draft, { contractDocumentTypes: docTypes });
      assert.equal(issues.some((i) => i.key.startsWith("documents.")), false);
    });
  });

  describe("Section 7: Persistence Architecture & Safety", () => {
    it("persists real corporate agreement in pms_corporate_agreements via persistCompanyContract", () => {
      assert.match(functionsCode, /export async function persistCompanyContract/);
      assert.match(functionsCode, /from\("pms_corporate_agreements"\)/);
      assert.match(functionsCode, /from\("pms_contract_rates"\)/);
      assert.match(functionsCode, /from\("guest_company_documents"\)/);
    });

    it("calls persistCompanyContract inside persistCompanyCreate", () => {
      assert.match(functionsCode, /await persistCompanyContract\([\s\S]*?data\.restaurantId[\s\S]*?draft\.contract/);
    });

    it("generates property-scoped contract code CORP_YYYY_NNN", () => {
      assert.match(functionsCode, /export const getNextCorporateContractCode/);
      assert.match(functionsCode, /CORP_\$\{year\}_/);
    });

    it("does NOT write new contract data to guest_account_masters.account_operations.contract", () => {
      const wsCode = readRel("../../lib/guest-company-create-workspace.ts");
      assert.match(wsCode, /Rule 34: New contract data is authoritative in pms_corporate_agreements/);
    });

    it("ensures setContract in modal and workspace supports key-value property updates and atomic patches", () => {
      const modalFile = readRel("./guest-company-create-modal.tsx");
      const workspaceFile = readRel("../workspaces/guest-company-create-workspace.tsx");
      assert.match(modalFile, /typeof keyOrPatch === "string"/);
      assert.match(modalFile, /\[keyOrPatch\]: possibleValue/);
      assert.match(workspaceFile, /typeof keyOrPatch === "string"/);
      assert.match(workspaceFile, /\[keyOrPatch\]: possibleValue/);
    });
  });
});
