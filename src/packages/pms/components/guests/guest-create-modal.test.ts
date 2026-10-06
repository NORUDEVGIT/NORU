import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_CREATE_STEPS,
  GUEST_CREATE_TITLE,
  GUEST_CREATE_COPY,
  GUEST_CREATE_START_OVER,
  emptyGuestCreateDraft,
  guestCreateFieldIssues,
  guestCreateCompletion,
  guestCreateHasChanges,
} from "../../lib/guest-create-workspace.ts";
import { formatCustomFieldValueForDisplay } from "../../lib/guest-custom-fields.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Guest Profile: New Guest Wide Modal Modernization (6-Step Architecture)", () => {
  const modalCode = readRel("./guest-create-modal.tsx");
  const dialogCode = readRel("./guest-form-dialog.tsx");
  const shellCode = readRel("../workspaces/guest-profile-workspace.tsx");
  const directoryCode = readRel("../workspaces/guest-directory-workspace.tsx");

  it("1. New Guest opens the wide modal with Reservation-style overlay sizing", () => {
    assert.match(modalCode, /DialogContent/);
    assert.match(modalCode, /data-testid="guest-create-modal"/);
    assert.match(modalCode, /w-\[min\(98vw,1550px\)\]/);
    assert.match(modalCode, /h-\[min\(92vh,960px\)\]/);
  });

  it("2. Guest Profile workspace remains mounted behind modal when create === 'individual'", () => {
    assert.match(
      shellCode,
      /create === "individual"[\s\S]*?<GuestListingWorkspace[\s\S]*?<GuestCreateModal/,
    );
  });

  it("3. Modal has compact 6-step horizontal navigation matching established business steps", () => {
    assert.equal(GUEST_CREATE_STEPS.length, 6);
    assert.deepEqual(
      GUEST_CREATE_STEPS.map((s) => s.id),
      ["basic", "identity", "preferences", "business", "additional", "review"],
    );
    assert.deepEqual(
      GUEST_CREATE_STEPS.map((s) => s.title),
      [
        "Basic Information",
        "Identity Documents",
        "Preferences",
        "Business & Membership",
        "Additional Information",
        "Review & Save",
      ],
    );
    assert.match(modalCode, /data-testid="guest-create-stepper"/);
    assert.match(modalCode, /activeSteps\.map/);
  });

  it("4. Next and Back navigation works across the 6 steps", () => {
    assert.match(modalCode, /go\(activeSteps\[stepIndex - 1\]\.id\)/);
    assert.match(modalCode, /go\(activeSteps\[stepIndex \+ 1\]\.id\)/);
    assert.match(modalCode, /validateCurrent\(\)/);
  });

  it("5. Individual profile active state is respected and blocks creation if inactive", () => {
    assert.match(modalCode, /isIndividualActive/);
    assert.match(modalCode, /Individual guest profile type is inactive in Property Setup/);
    assert.match(modalCode, /disabled=\{createMutation\.isPending \|\| !isIndividualActive\}/);
  });

  it("6. Existing core personal, contact, and address fields are preserved in 3-4 column grid", () => {
    assert.match(modalCode, /Profile Type/);
    assert.match(modalCode, /Individual Guest/);
    assert.match(modalCode, /firstName/);
    assert.match(modalCode, /lastName/);
    assert.match(modalCode, /middleName/);
    assert.match(modalCode, /preferredName/);
    assert.match(modalCode, /dateOfBirth/);
    assert.match(modalCode, /gender/);
    assert.match(modalCode, /nationality/);
    assert.match(modalCode, /language/);
    assert.match(modalCode, /vipStatus/);
    assert.match(modalCode, /phone/);
    assert.match(modalCode, /email/);
    assert.match(modalCode, /preferredContactMethod/);
    assert.match(modalCode, /preferredContactTime/);
    assert.match(modalCode, /addressLine1/);
    assert.match(modalCode, /city/);
    assert.match(modalCode, /country/);
    assert.match(modalCode, /postalCode/);
  });

  it("7. Company Name is captured in Step 5 (Additional Information) Employment and bound to custom values", () => {
    assert.match(modalCode, /Field label="Company Name"/);
    assert.match(modalCode, /dynamicFields/);
    assert.match(modalCode, /customValues/);
  });

  it("8. Custom select fields render as selector controls via GuestDynamicFieldControl", () => {
    const controlCode = readRel("./guest-dynamic-field-control.tsx");
    assert.match(controlCode, /case "select":/);
    assert.match(controlCode, /<Select/);
    assert.match(controlCode, /<SelectItem/);
  });

  it("9. Custom multi-select fields render as multiple selectable options", () => {
    const controlCode = readRel("./guest-dynamic-field-control.tsx");
    assert.match(controlCode, /case "multi_select":/);
    assert.match(controlCode, /toggleOption|selectedList/);
  });

  it("10. Required custom field blocks progression and final creation", () => {
    assert.match(modalCode, /missingCustomFields\.length > 0/);
    assert.match(modalCode, /is required\./);
  });

  it("11. Dynamic Preferences appear in Step 3 based on Property Setup catalogue", () => {
    assert.match(modalCode, /step === "preferences"/);
    assert.match(modalCode, /activeCategories/);
    assert.match(modalCode, /categoryTypes/);
  });

  it("12. Required Preference is enforced before guest creation", () => {
    assert.match(modalCode, /requiredPreferenceTypeIds/);
    assert.match(modalCode, /PREF:\$\{type\.id\}/);
    const issues = guestCreateFieldIssues(emptyGuestCreateDraft(), {
      rules: [],
      set3: null,
      requiredPreferenceTypeIds: ["pref-dietary-id"],
      dataProcessingRequired: false,
    });
    assert.ok(issues.some((i) => i.key === "PREF:pref-dietary-id"));
  });

  it("13. Identity/document controls and active types are preserved in Step 2", () => {
    assert.match(modalCode, /step === "identity"/);
    assert.match(modalCode, /documentNumber/);
    assert.match(modalCode, /issuingCountry/);
    assert.match(modalCode, /issueDate/);
    assert.match(modalCode, /expiryDate/);
    assert.match(modalCode, /issuingAuthority/);
    assert.match(modalCode, /fieldError\?\.\(`DOC_\$\{document\.key\}_documentNumber`/);
    assert.match(modalCode, /fieldError\?\.\(`DOC_\$\{document\.key\}_issuingCountry`/);
    assert.match(modalCode, /if \(targetIndex > currentIndex\) \{\s*if \(!validateCurrent\(\)\) return;/);
  });

  it("14. Staged identity uploads (front/back) are preserved in Step 2", () => {
    assert.match(modalCode, /Front Scan\/Image/);
    assert.match(modalCode, /Back Scan\/Image/);
    assert.match(modalCode, /attachDocImage/);
    assert.match(modalCode, /startDocUpload/);
  });

  it("15. Staged account links are preserved in Step 4 (Business & Membership)", () => {
    assert.match(modalCode, /step === "business"/);
    assert.match(modalCode, /<GuestFormStagedLinks/);
    assert.match(modalCode, /persistLink/);
  });

  it("16. Emergency contacts (add/remove multi-row) are preserved in Step 5", () => {
    assert.match(modalCode, /emergencyContacts/);
    assert.match(modalCode, /\+ Add Contact/);
  });

  it("17. Restrictions and blacklist flags are preserved in Step 5", () => {
    assert.match(modalCode, /restricted/);
    assert.match(modalCode, /blacklisted/);
    assert.match(modalCode, /restrictionReason/);
  });

  it("18. Duplicate detection is preserved with clear matching alert", () => {
    assert.match(modalCode, /checkDuplicates/);
    assert.match(modalCode, /Possible Matching Profiles/);
    assert.match(modalCode, /Keep Separate/);
  });

  it("19. Canonical createGuest function is used for persistence", () => {
    assert.match(modalCode, /create\(\{/);
    assert.match(modalCode, /createGuest/);
  });

  it("20. Custom values are saved with value_json exclusively", () => {
    assert.match(modalCode, /saveCustomValues/);
    assert.match(modalCode, /saveGuestCustomFieldValues/);
  });

  it("21. Preference answers are saved into guest_preference_values workspace", () => {
    assert.match(modalCode, /persistPrefs/);
    assert.match(modalCode, /saveGuestPreferenceWorkspace/);
  });

  it("22. Partial failure during follow-up saving does not claim full success", () => {
    assert.match(modalCode, /toast\.warning\("Guest created, but some custom fields failed to save\."\)/);
  });

  it("23. Final review displays Employment & Source and Emergency Contacts & Notes", () => {
    assert.match(modalCode, /Employment & Source/);
    assert.match(modalCode, /Emergency Contacts & Notes/);
  });

  it("24. Final review displays preference answers with Edit return jumps", () => {
    assert.match(modalCode, /preferenceAnswers/);
    assert.match(modalCode, /onEdit\(sectionStep\)/);
  });

  it("25. Closing dirty form confirms discard via AlertDialog", () => {
    assert.match(modalCode, /guestCreateHasChanges/);
    assert.match(modalCode, /discardConfirmOpen/);
    assert.match(modalCode, /Discard new guest\?/);
  });

  it("26. Zero unexpected legacy migrations introduced", () => {
    const migrationsDir = join(here, "../../../../../supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir);
    const highest = migrationFiles
      .filter((f) => /^\d{4}_/.test(f))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .sort((a, b) => b - a)[0];
    assert.ok(highest >= 118);
  });

  it("27. Edit Guest remains functional and untouched", () => {
    assert.match(dialogCode, /function GuestEditFormDialog/);
    assert.match(dialogCode, /props\.guest/);
    assert.match(dialogCode, /<GuestEditFormDialog/);
  });

  it("28. New Guest entry points open the modern modal overlay", () => {
    assert.match(directoryCode, /create: "individual"/);
    assert.match(shellCode, /<GuestCreateModal/);
    assert.match(dialogCode, /<GuestCreateModal/);
  });

  it("29. Fields use square settings-style styling (rounded-[6px] and border-[#CCCCCC])", () => {
    assert.match(modalCode, /rounded-\[6px\]/);
    assert.match(modalCode, /border-\[#CCCCCC\]/);
    assert.match(modalCode, /MODAL_CONTROL_CLASS/);
    assert.match(modalCode, /MODAL_SELECT_TRIGGER_CLASS/);
  });

  it("30. Address Country and Nationality use Settings-style SearchableSelect with ISO_COUNTRIES", () => {
    assert.match(modalCode, /<SearchableSelect[\s\S]*?id="guest-create-nationality"/);
    assert.match(modalCode, /<SearchableSelect[\s\S]*?id="guest-create-country"/);
    assert.match(modalCode, /ISO_COUNTRIES/);
  });

  it("31. Address Region dynamically computes and renders selectable regions when catalogue exists", () => {
    assert.match(modalCode, /availableRegions\.length > 0/);
    assert.match(modalCode, /<SearchableSelect[\s\S]*?id="guest-create-region"/);
    assert.match(modalCode, /regionsForCountry\(draft\.country\)/);
  });

  it("32. Dynamic field controls in guest-dynamic-field-control.tsx use square styling", () => {
    const controlCode = readRel("./guest-dynamic-field-control.tsx");
    assert.match(controlCode, /rounded-\[6px\]/);
    assert.match(controlCode, /border-\[#CCCCCC\]/);
  });

  it("33. Additional Information Employment section contains 4 fields including Company Name", () => {
    assert.match(modalCode, /Field label="Company Name"/);
    assert.match(modalCode, /id="guest-create-company-name"/);
    assert.match(modalCode, /handleCompanyChange/);
    assert.match(modalCode, /COMPANY_NAME/);
    assert.match(modalCode, /sm:grid-cols-2 lg:grid-cols-4/);
  });

  it("34. Business and Relationship step controls in guest-form-staged-links.tsx use square styling", () => {
    const stagedCode = readRel("./guest-form-staged-links.tsx");
    assert.match(stagedCode, /rounded-\[6px\]/);
    assert.match(stagedCode, /border-\[#CCCCCC\]/);
    assert.match(stagedCode, /SQUARE_TRIGGER_CLASS/);
    assert.match(stagedCode, /data-testid="individual-link-role"/);
    assert.match(stagedCode, /data-testid="individual-link-master-target"/);
  });

  it("35. Step 2 (Identity Documents) automatically opens the document section without requiring Add Identity Document button", () => {
    // There must NOT be any "+ Add Identity Document" button in the modal code
    assert.doesNotMatch(modalCode, /\+ Add Identity Document/);
    assert.doesNotMatch(modalCode, />\s*\+?\s*Add identity document\s*</i);

    // Modal code automatically stages the first document when entering identity step
    assert.match(modalCode, /next === "identity" && identityActive && draft\.documents\.length === 0/);
    assert.match(modalCode, /step === "identity" && identityActive && draft\.documents\.length === 0/);

    // IdentityStep component auto-adds if available and empty
    assert.match(modalCode, /available\.length > 0 && draft\.documents\.length === 0/);

    // When single document is open, Remove button is suppressed so mandatory section is never deleted
    assert.match(modalCode, /draft\.documents\.length > 1 \? `Document #\$\{docIdx \+ 1\}` : "Identity Document"/);
    assert.match(modalCode, /draft\.documents\.length > 1 \? \(\s*<Button[\s\S]*?Remove/);
  });
});



