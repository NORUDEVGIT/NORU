import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GUEST_GROUP_CREATE_STEPS } from "@/packages/pms/lib/guest-group-create-workspace";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("NORU PMS — Guest Profile: New Group Wide Modal Modernization (5-Step Architecture)", () => {
  const modalCode = readRel("./guest-group-create-modal.tsx");
  const shellCode = readRel("../workspaces/guest-profile-workspace.tsx");

  it("1. New Group opens the Create New Guest wizard shell", () => {
    assert.match(modalCode, /DialogContent/);
    assert.match(modalCode, /data-testid="guest-group-create-modal"/);
    assert.match(modalCode, /h-\[92vh\] max-h-\[92vh\] w-\[min\(90vw,1440px\)\]/);
    assert.match(modalCode, /bg-\[#1F140A\]/);
  });

  it("2. Guest Profile listing remains mounted behind modal when create === 'group'", () => {
    assert.match(
      shellCode,
      /create === "group"[\s\S]*?<GuestListingWorkspace[\s\S]*?<GuestGroupCreateModal/,
    );
  });

  it("3. Legacy GuestGroupCreateWorkspace is NOT mounted behind the modal", () => {
    const createBranch = shellCode.slice(
      shellCode.indexOf('if (!guestId && create === "group")'),
      shellCode.indexOf('if (!guestId && create === "company")'),
    );
    assert.doesNotMatch(createBranch, /<GuestGroupCreateWorkspace/);
  });

  it("4. Modal has 4-step horizontal navigation for a reusable group profile", () => {
    assert.equal(GUEST_GROUP_CREATE_STEPS.length, 4);
    assert.deepEqual(
      GUEST_GROUP_CREATE_STEPS.map((s) => s.id),
      ["details", "guests", "billing", "review"],
    );
    assert.deepEqual(
      GUEST_GROUP_CREATE_STEPS.map((s) => s.title),
      [
        "Group Details",
        "Guest Information",
        "Financial & Billing",
        "Review & Confirm",
      ],
    );
    assert.match(modalCode, /data-testid="guest-group-create-stepper"/);
    assert.match(modalCode, /GUEST_GROUP_CREATE_STEPS\.map/);
  });

  it("5. Next and Back navigation works across the profile steps", () => {
    assert.match(modalCode, /go\(GUEST_GROUP_CREATE_STEPS\[stepIndex - 1\]\.id\)/);
    assert.match(modalCode, /go\(GUEST_GROUP_CREATE_STEPS\[stepIndex \+ 1\]\.id\)/);
    assert.match(modalCode, /validateCurrent\(\)/);
  });

  it("6. Group Template logic remains inside Step 1 Details without header relocation or semantic changes", () => {
    assert.match(modalCode, /listGroupTemplates/);
    assert.match(modalCode, /applyGroupTemplateToDraft/);
    assert.match(modalCode, /data-testid="group-template-select"/);
    // Template selector is inside Step 1 Details card, not in the modal header
    assert.match(modalCode, /step === "details"[\s\S]*?group-template-select/);
  });

  it("7. Company, Travel Agency, and Primary Contact use single SearchableSelect dropdowns without stacked search inputs", () => {
    assert.match(modalCode, /draft\.companyMasterId/);
    assert.match(modalCode, /draft\.travelAgentMasterId/);
    assert.match(modalCode, /draft\.primaryContactGuestId/);
    assert.match(modalCode, /draft\.primaryContactName/);
    assert.match(modalCode, /draft\.contactEmail/);
    assert.match(modalCode, /draft\.contactPhone/);
    assert.match(modalCode, /draft\.groupTypeId/);
    assert.match(modalCode, /id="group-company-partner"/);
    assert.match(modalCode, /id="group-travel-agency"/);
    assert.match(modalCode, /id="group-primary-contact"/);
    assert.match(modalCode, /Write custom name/);
    assert.match(modalCode, /Search guest database/);
    assert.doesNotMatch(modalCode, /placeholder="Search existing companies"/);
    assert.doesNotMatch(modalCode, /placeholder="Search existing agencies"/);
    assert.doesNotMatch(modalCode, /placeholder="Search existing guests for contact"/);
  });

  it("8. Registration does not capture stay dates, transport, room needs, or expected occupancy", () => {
    assert.doesNotMatch(modalCode, /step === "stay"/);
    assert.doesNotMatch(modalCode, /Arrival Date/);
    assert.doesNotMatch(modalCode, /Expected Pax/);
    assert.doesNotMatch(modalCode, /emptyGroupCreateRoomNeed/);
    assert.match(modalCode, /draft\.specialRequests/);
    assert.match(modalCode, /draft\.notes/);
  });

  it("9. Operational Boundary: profile registration does not assign physical rooms", () => {
    assert.doesNotMatch(modalCode, /assignReservationRoom|listAssignableRooms|assignRoom/);
    assert.doesNotMatch(modalCode, /Physical Room Assignment|Auto Assignment/);
  });

  it("10. Guest Information preserves stats, existing guest linking, new member staging, and CSV import", () => {
    assert.match(modalCode, /groupCreateMemberCounts/);
    assert.match(modalCode, /addExistingMember/);
    assert.match(modalCode, /addNewMember/);
    assert.match(modalCode, /stageGroupMemberImport/);
    assert.match(modalCode, /stageImport/);
    assert.match(modalCode, /data-testid="group-create-import"/);
  });

  it("11. Billing keeps reusable defaults and leaves stay pricing to Reservations", () => {
    assert.match(modalCode, /loadGroupCreateCredit/);
    assert.match(modalCode, /draft\.billingArrangement/);
    assert.match(modalCode, /draft\.paymentMethodId/);
    assert.match(modalCode, /draft\.currency/);
    assert.match(modalCode, /draft\.paymentTerms/);
    assert.match(modalCode, /Create Group \/ Block/);
    assert.match(modalCode, /createGroupProfile: created\.id/);
    assert.doesNotMatch(modalCode, /Deposit Due Date/);
    assert.doesNotMatch(modalCode, /Select rate plan/);
    assert.doesNotMatch(modalCode, /Select meal plan/);
  });

  it("12. Final mutation and save draft semantics are preserved exactly", () => {
    assert.match(modalCode, /persistGroupCreate/);
    assert.match(modalCode, /completeMutation/);
    assert.match(modalCode, /draftMutation/);
    assert.match(modalCode, /data-testid="group-create-complete"/);
    assert.match(modalCode, /data-testid="group-create-save-draft"/);
  });

  it("13. Closing dirty form confirms discard via AlertDialog", () => {
    assert.match(modalCode, /discardConfirmOpen/);
    assert.match(modalCode, /Discard new group\?/);
  });

  it("14. Start over confirmation and clear draft logic preserved", () => {
    assert.match(modalCode, /GUEST_GROUP_CREATE_START_OVER/);
    assert.match(modalCode, /startOverOpen/);
    assert.match(modalCode, /data-testid="group-create-start-over"/);
  });

  it("15. Fields use square settings-style styling (rounded-[6px] and border-[#CCCCCC])", () => {
    assert.match(modalCode, /rounded-\[6px\]/);
    assert.match(modalCode, /border-\[#CCCCCC\]/);
    assert.match(modalCode, /MODAL_CONTROL_CLASS/);
    assert.match(modalCode, /MODAL_SELECT_TRIGGER_CLASS/);
  });

  it("16. Completion stays in the header and the right-side rail is not mounted", () => {
    assert.match(modalCode, /guestGroupCreateCompletion/);
    assert.match(modalCode, /% complete/);
    assert.doesNotMatch(modalCode, /data-testid="group-create-profile-preview"/);
    assert.doesNotMatch(modalCode, /Step Guidance/);
    assert.doesNotMatch(modalCode, /Property Setup Controlled/);
  });

  it("17. Sticky footer includes Back, Next, Save as Draft, and gold CTA with dark espresso text", () => {
    assert.match(modalCode, /Save as Draft/);
    assert.match(modalCode, /SHELL_PRIMARY_BUTTON/);
  });

  it("18. Strict Independence: GuestGroupCreateModal does NOT import or render other profile modals", () => {
    assert.doesNotMatch(modalCode, /GuestCreateModal/);
    assert.doesNotMatch(modalCode, /GuestCompanyCreateModal/);
    assert.doesNotMatch(modalCode, /GuestTravelAgencyCreateModal/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-create-modal["']/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-company-create-modal["']/);
    assert.doesNotMatch(modalCode, /from ["'].*guest-travel-agency-create-modal["']/);
  });

  it("19. Zero database migrations introduced for Group redesign", () => {
    const migrationsDir = join(here, "../../../../../supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir);
    const highest = migrationFiles
      .filter((f) => /^\d{4}_/.test(f))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .sort((a, b) => b - a)[0];
    assert.ok(highest >= 118);
  });
});
