import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_COMPANY_CREATE_STEPS,
  GUEST_COMPANY_CREATE_TITLE,
  GUEST_COMPANY_CREATE_START_OVER,
  emptyGuestCompanyCreateDraft,
  companyCreateFieldIssues,
  guestCompanyCreateCompletion,
  guestCompanyCreateHasChanges,
} from "@/packages/pms/lib/guest-company-create-workspace";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Guest Profile: New Company Wide Modal Modernization (5-Step Architecture)", () => {
  const modalCode = readRel("./guest-company-create-modal.tsx");
  const shellCode = readRel("../workspaces/guest-profile-workspace.tsx");
  const directoryCode = readRel("./guest-company-directory.tsx");

  it("1. New Company opens the wide modal with Reservation-style overlay sizing", () => {
    assert.match(modalCode, /DialogContent/);
    assert.match(modalCode, /data-testid="guest-company-create-modal"/);
    assert.match(modalCode, /w-\[min\(98vw,1550px\)\]/);
    assert.match(modalCode, /h-\[min\(92vh,960px\)\]/);
  });

  it("2. Guest Profile workspace remains mounted behind modal when create === 'company'", () => {
    assert.match(
      shellCode,
      /create === "company"[\s\S]*?<GuestListingWorkspace[\s\S]*?<GuestCompanyCreateModal/,
    );
  });

  it("3. Modal has compact 5-step horizontal navigation matching established business steps", () => {
    assert.equal(GUEST_COMPANY_CREATE_STEPS.length, 5);
    assert.deepEqual(
      GUEST_COMPANY_CREATE_STEPS.map((s) => s.id),
      ["details", "contacts", "business", "billing", "review"],
    );
    assert.deepEqual(
      GUEST_COMPANY_CREATE_STEPS.map((s) => s.title),
      [
        "Company Details",
        "Contacts",
        "Business & Commercial",
        "Billing & Credit",
        "Review & Confirm",
      ],
    );
    assert.match(modalCode, /data-testid="guest-company-create-stepper"/);
    assert.match(modalCode, /GUEST_COMPANY_CREATE_STEPS\.map/);
  });

  it("4. Next and Back navigation works across the 5 steps", () => {
    assert.match(modalCode, /go\(GUEST_COMPANY_CREATE_STEPS\[stepIndex - 1\]\.id\)/);
    assert.match(modalCode, /go\(GUEST_COMPANY_CREATE_STEPS\[stepIndex \+ 1\]\.id\)/);
    assert.match(modalCode, /validateCurrent\(\)/);
  });

  it("5. Core company, contact, address, business, and billing fields are preserved", () => {
    assert.match(modalCode, /Profile Type/);
    assert.match(modalCode, /Company \(COM\)/);
    assert.match(modalCode, /draft\.name/);
    assert.match(modalCode, /draft\.tradeName/);
    assert.match(modalCode, /draft\.businessProfileTypeId/);
    assert.match(modalCode, /draft\.companyType/);
    assert.match(modalCode, /draft\.code/);
    assert.match(modalCode, /draft\.accountStatus/);
    assert.match(modalCode, /draft\.taxId/);
    assert.match(modalCode, /draft\.registrationNumber/);
    assert.match(modalCode, /draft\.website/);
    assert.match(modalCode, /draft\.contacts/);
    assert.match(modalCode, /draft\.addressLine1/);
    assert.match(modalCode, /draft\.city/);
    assert.match(modalCode, /draft\.country/);
    assert.match(modalCode, /draft\.marketSegmentId/);
    assert.match(modalCode, /draft\.sourceCodeId/);
    assert.match(modalCode, /draft\.contractReference/);
    assert.match(modalCode, /draft\.contractStartDate/);
    assert.match(modalCode, /draft\.contractEndDate/);
    assert.match(modalCode, /draft\.billingArrangement/);
    assert.match(modalCode, /draft\.paymentMethodId/);
    assert.match(modalCode, /draft\.creditAccountEnabled/);
  });

  it("6. Canonical persistCompanyCreate function is used for persistence", () => {
    assert.match(modalCode, /persistCompanyCreate/);
    assert.match(modalCode, /saveCompanyCreateDraft/);
    assert.match(modalCode, /deleteCompanyCreateDraft/);
  });

  it("7. Duplicate detection is preserved with clear matching alert and header action", () => {
    assert.match(modalCode, /findCompanyDuplicates/);
    assert.match(modalCode, /Check for Duplicates/);
    assert.match(modalCode, /Possible Matching Profiles/);
    assert.match(modalCode, /acknowledgeNameDuplicate/);
  });

  it("8. Closing dirty form confirms discard via AlertDialog", () => {
    assert.match(modalCode, /guestCompanyCreateHasChanges/);
    assert.match(modalCode, /discardConfirmOpen/);
    assert.match(modalCode, /Discard new company\?/);
  });

  it("9. Start over confirmation and clear draft logic preserved", () => {
    assert.match(modalCode, /GUEST_COMPANY_CREATE_START_OVER/);
    assert.match(modalCode, /startOverOpen/);
    assert.match(modalCode, /data-testid="company-create-start-over"/);
  });

  it("10. Fields use square settings-style styling (rounded-[6px] and border-[#CCCCCC])", () => {
    assert.match(modalCode, /rounded-\[6px\]/);
    assert.match(modalCode, /border-\[#CCCCCC\]/);
    assert.match(modalCode, /MODAL_CONTROL_CLASS/);
    assert.match(modalCode, /MODAL_SELECT_TRIGGER_CLASS/);
  });

  it("11. Right-side panel includes profile preview, completion progress, and step guidance", () => {
    assert.match(modalCode, /data-testid="company-create-profile-preview"/);
    assert.match(modalCode, /guestCompanyCreateCompletion/);
    assert.match(modalCode, /Step Guidance/);
    assert.match(modalCode, /Property Setup Controlled/);
  });

  it("12. Sticky footer includes Back, Next, Save Draft, and gold Create Company CTA", () => {
    assert.match(modalCode, /Save as Draft/);
    assert.match(modalCode, /data-testid="company-create-save-draft"/);
    assert.match(modalCode, /Create Company/);
    assert.match(modalCode, /data-testid="create-company-final"/);
    assert.match(modalCode, /bg-\[#C89933\]/);
  });

  it("13. Strict Independence: GuestCompanyCreateModal does NOT import or render GuestCreateModal", () => {
    assert.doesNotMatch(modalCode, /GuestCreateModal/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-create-modal["']/);
  });

  it("14. Address uses SearchableSelect for Country with dynamic concurrent Region selection", () => {
    assert.match(modalCode, /import \{ SearchableSelect \} from "@/);
    assert.match(modalCode, /id="company-create-country"/);
    assert.match(modalCode, /countryOptions = useMemo/);
    assert.match(modalCode, /regionsForCountry\(draft\.country\)/);
    assert.match(modalCode, /isRegionValidForCountry/);
    assert.match(modalCode, /id="company-create-region"/);
    assert.match(modalCode, /layout\.regionLabel/);
  });

  it("15. Dropdowns are wired to Property Setup catalogues and format labels with codes", () => {
    assert.match(modalCode, /catalogues\?\.businessTypes/);
    assert.match(modalCode, /catalogues\?\.contactRoles/);
    assert.match(modalCode, /catalogues\?\.marketSegments/);
    assert.match(modalCode, /catalogues\?\.sourceCodes/);
    assert.match(modalCode, /catalogues\?\.staff/);
    assert.match(modalCode, /catalogues\?\.ratePlans/);
    assert.match(modalCode, /catalogues\?\.packages/);
    assert.match(modalCode, /catalogues\?\.mealPlans/);
    assert.match(modalCode, /catalogues\?\.paymentMethods/);
    assert.match(modalCode, /catalogues\?\.currencies/);
    assert.match(modalCode, /row\.code && row\.code !== row\.name \? `\$\{row\.code\} — \$\{row\.name\}` : row\.name/);
  });

  it("16. Settings defaults (default company type, currency, auto-approval status) are wired into draft initialization", () => {
    assert.match(modalCode, /defaultBusinessTypeId/);
    assert.match(modalCode, /defaultCurrency/);
    assert.match(modalCode, /autoApproval === false/);
  });
});

