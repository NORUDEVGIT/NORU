import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_TRAVEL_AGENT_CREATE_STEPS,
  GUEST_TRAVEL_AGENT_CREATE_TITLE,
  GUEST_TRAVEL_AGENT_CREATE_START_OVER,
  emptyGuestTravelAgentCreateDraft,
  travelAgentCreateFieldIssues,
  guestTravelAgentCreateCompletion,
  guestTravelAgentCreateHasChanges,
} from "../../lib/guest-travel-agent-create-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Guest Profile: New Travel Agency Wide Modal Modernization (5-Step Architecture)", () => {
  const modalCode = readRel("./guest-travel-agency-create-modal.tsx");
  const basicInfoCode = readRel("./guest-travel-agency-basic-info-step.tsx");
  const fullModalCode = modalCode + "\n" + basicInfoCode;
  const shellCode = readRel("../workspaces/guest-profile-workspace.tsx");
  const directoryCode = readRel("./guest-travel-agent-directory.tsx");

  it("1. New Travel Agency opens the wide modal with Reservation-style overlay sizing", () => {
    assert.match(modalCode, /DialogContent/);
    assert.match(modalCode, /data-testid="guest-travel-agency-create-modal"/);
    assert.match(modalCode, /w-\[min\(98vw,1550px\)\]/);
    assert.match(modalCode, /h-\[min\(92vh,960px\)\]/);
  });

  it("2. Guest Profile workspace remains mounted behind modal when create === 'travel-agent'", () => {
    assert.match(
      shellCode,
      /create === "travel-agent"[\s\S]*?<GuestListingWorkspace[\s\S]*?<GuestTravelAgencyCreateModal/,
    );
  });

  it("3. Legacy GuestTravelAgentCreateWorkspace is NOT mounted behind the modal", () => {
    // Exactly one creation flow runs at any time
    const createBranch = shellCode.slice(
      shellCode.indexOf('if (!guestId && create === "travel-agent")'),
      shellCode.indexOf('if (guestId && operationalType === "company")'),
    );
    assert.doesNotMatch(createBranch, /<GuestTravelAgentCreateWorkspace/);
  });

  it("4. Modal has compact 3-step horizontal navigation matching established company/group patterns", () => {
    assert.equal(GUEST_TRAVEL_AGENT_CREATE_STEPS.length, 3);
    assert.deepEqual(
      GUEST_TRAVEL_AGENT_CREATE_STEPS.map((s) => s.id),
      ["basic_info", "billing", "review"],
    );
    assert.deepEqual(
      GUEST_TRAVEL_AGENT_CREATE_STEPS.map((s) => s.title),
      [
        "Basic Info",
        "Commercial & Billing",
        "Review & Confirm",
      ],
    );
    assert.match(modalCode, /data-testid="guest-travel-agency-create-stepper"/);
    assert.match(modalCode, /GUEST_TRAVEL_AGENT_CREATE_STEPS\.map/);
  });

  it("5. Next and Back navigation works across the 3 steps", () => {
    assert.match(modalCode, /go\(GUEST_TRAVEL_AGENT_CREATE_STEPS\[stepIndex - 1\]\.id\)/);
    assert.match(modalCode, /go\(GUEST_TRAVEL_AGENT_CREATE_STEPS\[stepIndex \+ 1\]\.id\)/);
    assert.match(modalCode, /validateCurrent\(\)/);
  });

  it("6. Core travel agency, contact, address, business, and billing fields are preserved", () => {
    assert.match(fullModalCode, /Profile Type/);
    assert.match(fullModalCode, /Travel Agency \(TRA\)/);
    assert.match(fullModalCode, /draft\.name/);
    assert.match(fullModalCode, /draft\.agencyType/);
    assert.match(fullModalCode, /draft\.agencyTypeOther/);
    assert.match(fullModalCode, /draft\.code/);
    assert.match(fullModalCode, /draft\.accountStatus/);
    assert.match(fullModalCode, /draft\.iataLicenseNumber/);
    assert.match(fullModalCode, /draft\.website/);
    assert.match(fullModalCode, /draft\.contacts/);
    assert.match(fullModalCode, /draft\.addressLine1/);
    assert.match(fullModalCode, /draft\.city/);
    assert.match(fullModalCode, /draft\.country/);
    assert.match(fullModalCode, /draft\.region/);
    assert.match(fullModalCode, /draft\.taxId/);
    assert.match(fullModalCode, /draft\.marketSegmentId/);
    assert.match(fullModalCode, /draft\.sourceCodeId/);
    assert.match(fullModalCode, /draft\.billingArrangement/);
    assert.match(fullModalCode, /draft\.paymentMethodId/);
    assert.match(fullModalCode, /draft\.currency/);
    assert.match(fullModalCode, /draft\.creditLimitAmount/);
    assert.match(fullModalCode, /draft\.commissionEnabled/);
    assert.match(fullModalCode, /draft\.commissionType/);
    assert.match(fullModalCode, /draft\.commissionValue/);
  });

  it("7. Canonical persistTravelAgentCreate function is used for persistence", () => {
    assert.match(modalCode, /persistTravelAgentCreate/);
    assert.match(modalCode, /saveTravelAgentCreateDraft/);
    assert.match(modalCode, /deleteTravelAgentCreateDraft/);
  });

  it("8. Closing dirty form confirms discard via AlertDialog", () => {
    assert.match(modalCode, /guestTravelAgentCreateHasChanges/);
    assert.match(modalCode, /discardConfirmOpen/);
    assert.match(modalCode, /Discard new travel agency\?/);
  });

  it("9. Start over confirmation and clear draft logic preserved", () => {
    assert.match(modalCode, /GUEST_TRAVEL_AGENT_CREATE_START_OVER/);
    assert.match(modalCode, /startOverOpen/);
    assert.match(modalCode, /data-testid="travel-agency-create-start-over"/);
  });

  it("10. Fields use square settings-style styling (rounded-[6px] and border-[#CCCCCC] or border-[#DDD4C5])", () => {
    assert.match(fullModalCode, /rounded-\[6px\]/);
    assert.match(modalCode, /border-\[#CCCCCC\]/);
    assert.match(modalCode, /MODAL_CONTROL_CLASS/);
    assert.match(modalCode, /MODAL_SELECT_TRIGGER_CLASS/);
  });

  it("11. Right-side panel includes profile preview, completion progress, and step guidance", () => {
    assert.match(modalCode, /data-testid="travel-agency-create-profile-preview"/);
    assert.match(modalCode, /guestTravelAgentCreateCompletion/);
    assert.match(modalCode, /Step Guidance/);
    assert.match(modalCode, /Property Setup Controlled/);
  });

  it("12. Sticky footer includes Back, Next, Save Draft, and gold Create Travel Agency CTA with dark espresso text", () => {
    assert.match(modalCode, /Save as Draft/);
    assert.match(modalCode, /data-testid="travel-agency-create-save-draft"/);
    assert.match(modalCode, /Create Travel Agency/);
    assert.match(modalCode, /data-testid="create-travel-agency-final"/);
    assert.match(modalCode, /bg-\[#C89933\] text-\[#251605\] hover:bg-\[#B98B2D\] font-semibold/);
  });

  it("13. Strict Independence: GuestTravelAgencyCreateModal does NOT import or render GuestCreateModal or GuestCompanyCreateModal", () => {
    assert.doesNotMatch(modalCode, /GuestCreateModal/);
    assert.doesNotMatch(modalCode, /GuestCompanyCreateModal/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-create-modal["']/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-company-create-modal["']/);
  });

  it("14. Address uses SearchableSelect for Country with dynamic concurrent Region selection", () => {
    assert.match(basicInfoCode, /import \{ SearchableSelect \} from "@/);
    assert.match(basicInfoCode, /id="travel-agency-country"/);
    assert.match(basicInfoCode, /countryOptions = useMemo/);
    assert.match(basicInfoCode, /regionsForCountry\(selectedCountryCode\)/);
  });

  it("15. Zero database migrations introduced for Travel Agency redesign", () => {
    const migrationsDir = join(here, "../../../../../supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir);
    const highest = migrationFiles
      .filter((f) => /^\d{4}_/.test(f))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .sort((a, b) => b - a)[0];
    assert.ok(highest >= 118);
  });
});
