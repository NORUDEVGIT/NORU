import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_CREATE_HOLD_KEY_PREFIX,
  GUEST_CREATE_MIGRATION_FILE,
  GUEST_CREATE_START_OVER,
  GUEST_CREATE_STEPS,
  applyCreateDefaults,
  card4CreateGaps,
  createFieldRules,
  emptyGuestCreateDraft,
  guestCreateCompletion,
  guestCreateHoldKey,
  guestCreateFieldIssues,
  guestCreateStepErrors,
  guestDisplayName,
  inferGuestCreateStep,
  parseGuestCreateHold,
} from "./guest-create-workspace.ts";
import { formatCreateIssuesByStep, issuesBeforeStep } from "./guest-create-step-issues.ts";
import type { GuestFieldRecord } from "./required-fields-card4.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function field(
  partial: Partial<GuestFieldRecord> & { code: string; required: boolean },
): GuestFieldRecord {
  return {
    id: partial.id ?? "00000000-0000-4000-8000-000000000001",
    name: partial.name ?? partial.code,
    code: partial.code,
    fieldType: "text",
    description: null,
    options: [],
    required: partial.required,
    checkIn: false,
    reservation: false,
    active: partial.active ?? true,
    displayOrder: 1,
    lookupSource: null,
    documentTypeIds: [],
    minValue: null,
    maxValue: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Guest create workflow helpers", () => {
  it("keeps exactly six steps and does not treat contact or address as steps", () => {
    assert.deepEqual(
      GUEST_CREATE_STEPS.map((step) => step.id),
      ["basic", "identity", "preferences", "business", "additional", "review"],
    );
    assert.equal(GUEST_CREATE_STEPS.length, 6);
  });

  it("applies profile defaults only when the user has not typed", () => {
    const draft = emptyGuestCreateDraft();
    const next = applyCreateDefaults(
      draft,
      {
        countryId: "ET",
        languageId: "am",
        currencyId: null,
        communicationChannelId: "email",
        guestTypeId: null,
      },
      new Set(),
    );
    assert.equal(next.country, "ET");
    assert.equal(next.language, "am");
    const touched = applyCreateDefaults(
      { ...draft, country: "KE" },
      {
        countryId: "ET",
        languageId: "am",
        currencyId: null,
        communicationChannelId: null,
        guestTypeId: null,
      },
      new Set(["country"]),
    );
    assert.equal(touched.country, "KE");
  });

  it("keeps First Name visible even when the Card 4 row is inactive", () => {
    const rules = createFieldRules(
      [field({ code: "FIRST_NAME", required: false, active: false, name: "First Name" })],
      null,
    );
    const firstName = rules.find((rule) => rule.code === "FIRST_NAME");
    assert.equal(firstName?.visible, true);
    assert.equal(firstName?.required, true);
  });

  it("computes Card 4 required gaps from real field flags", () => {
    const rules = createFieldRules(
      [
        field({ code: "FIRST_NAME", required: true }),
        field({ code: "PHONE", required: true }),
        field({ code: "COMPANY", required: true }),
      ],
      null,
    );
    const draft = emptyGuestCreateDraft();
    draft.firstName = "Abebe";
    const gaps = card4CreateGaps(draft, rules);
    assert.equal(
      gaps.some((gap) => gap.code === "PHONE"),
      true,
    );
    assert.equal(
      gaps.some((gap) => gap.code === "COMPANY"),
      true,
    );
    assert.equal(
      gaps.some((gap) => gap.code === "FIRST_NAME"),
      false,
    );
  });

  it("enforces additional fields when marked required in Card 4", () => {
    const rules = createFieldRules(
      [
        field({ code: "MIDDLE_NAME", required: true }),
        field({ code: "TITLE", required: true }),
        field({ code: "GENDER", required: true }),
        field({ code: "LANGUAGE", required: true }),
        field({ code: "PHONE_ALT", required: true }),
        field({ code: "ADDRESS_LINE1", required: true }),
      ],
      null,
    );
    const draft = emptyGuestCreateDraft();
    draft.firstName = "Abebe";
    const gaps = card4CreateGaps(draft, rules);
    assert.equal(gaps.some((gap) => gap.code === "MIDDLE_NAME"), true);
    assert.equal(gaps.some((gap) => gap.code === "TITLE"), true);
    assert.equal(gaps.some((gap) => gap.code === "GENDER"), true);
    assert.equal(gaps.some((gap) => gap.code === "LANGUAGE"), true);
    assert.equal(gaps.some((gap) => gap.code === "PHONE_ALT"), true);
    assert.equal(gaps.some((gap) => gap.code === "ADDRESS_LINE1"), true);

    draft.middleName = "Tadesse";
    draft.title = "mr";
    draft.gender = "male";
    draft.language = "am";
    draft.phoneAlt = "+251911223344";
    draft.addressLine1 = "Bole Road 123";
    const resolvedGaps = card4CreateGaps(draft, rules);
    assert.equal(resolvedGaps.some((gap) => gap.code === "MIDDLE_NAME"), false);
    assert.equal(resolvedGaps.some((gap) => gap.code === "TITLE"), false);
    assert.equal(resolvedGaps.some((gap) => gap.code === "GENDER"), false);
    assert.equal(resolvedGaps.some((gap) => gap.code === "LANGUAGE"), false);
    assert.equal(resolvedGaps.some((gap) => gap.code === "PHONE_ALT"), false);
    assert.equal(resolvedGaps.some((gap) => gap.code === "ADDRESS_LINE1"), false);
  });

  it("does not hardcode completion at 30 percent", () => {
    const rules = createFieldRules([field({ code: "FIRST_NAME", required: true })], null);
    const empty = guestCreateCompletion(emptyGuestCreateDraft(), rules);
    assert.notEqual(empty.percent, 30);
    const filled = emptyGuestCreateDraft();
    filled.firstName = "Abebe";
    const next = guestCreateCompletion(filled, rules);
    assert.ok(next.percent > empty.percent);
    assert.equal(guestDisplayName(filled), "Abebe");
  });

  it("restores the held step and draft without requiring a refresh wipe", () => {
    const draft = emptyGuestCreateDraft();
    draft.firstName = "Abebe";
    draft.links = [
      { key: "c1:employer", masterId: "c1", masterName: "Noru Hotels", role: "employer" },
    ];
    const held = parseGuestCreateHold({ step: "business", draft });
    assert.equal(held?.step, "business");
    assert.equal(held?.draft.firstName, "Abebe");
    assert.equal(held?.draft.links[0]?.masterName, "Noru Hotels");
    const legacy = parseGuestCreateHold(draft);
    assert.equal(legacy?.draft.firstName, "Abebe");
    assert.equal(inferGuestCreateStep(draft), "business");
    assert.equal(guestCreateHoldKey("rest-1"), `${GUEST_CREATE_HOLD_KEY_PREFIX}:rest-1`);
  });

  it("blocks review when required preferences are unanswered", () => {
    const errors = guestCreateStepErrors("preferences", emptyGuestCreateDraft(), {
      rules: [],
      set3: null,
      requiredPreferenceTypeIds: ["00000000-0000-4000-8000-000000000099"],
      dataProcessingRequired: false,
    });
    assert.ok(errors.length > 0);
  });

  it("names the missing field and the step that holds it", () => {
    const issues = guestCreateFieldIssues(emptyGuestCreateDraft(), {
      rules: createFieldRules([field({ code: "FIRST_NAME", required: true })], null),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
    });
    assert.ok(issues.some((issue) => issue.key === "FIRST_NAME" && issue.step === "basic"));
    assert.match(
      formatCreateIssuesByStep(issues, GUEST_CREATE_STEPS),
      /Basic Information — First name is required/,
    );
    assert.equal(issuesBeforeStep(issues, GUEST_CREATE_STEPS, "basic").length, 0);
    assert.ok(
      issuesBeforeStep(issues, GUEST_CREATE_STEPS, "identity").some(
        (issue) => issue.key === "FIRST_NAME",
      ),
    );
  });

  it("enforces required fields in Identity Documents step before allowing Step 3 Preferences navigation", () => {
    const draft = emptyGuestCreateDraft();
    draft.firstName = "John";
    draft.lastName = "Doe";
    draft.documents = [
      {
        key: "doc-1",
        idTypeId: "passport-type-id",
        documentNumber: "",
        issuingCountry: "",
        issueDate: "",
        expiryDate: "",
        issuingAuthority: "",
        notes: "",
        hasFront: false,
        hasBack: false,
      },
    ];

    const documentTypes = [
      {
        id: "passport-type-id",
        name: "Passport",
        active: true,
        documentNumberActive: true,
        documentNumberRequired: true,
        issuingCountryActive: true,
        issuingCountryRequired: true,
        issueDateActive: true,
        issueDateRequired: true,
        expiryDateActive: true,
        expiryDateRequired: true,
        issuingAuthorityActive: true,
        issuingAuthorityRequired: true,
        scanImageAllowed: true,
        scanImageRequired: true,
      },
    ];

    const issues = guestCreateFieldIssues(draft, {
      rules: createFieldRules([field({ code: "FIRST_NAME", required: true })], null),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
      documentTypes,
      identityActive: true,
    });

    // Verify all missing required document fields generate issues for step "identity"
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_documentNumber" && i.step === "identity"));
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_issuingCountry" && i.step === "identity"));
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_issueDate" && i.step === "identity"));
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_expiryDate" && i.step === "identity"));
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_issuingAuthority" && i.step === "identity"));
    assert.ok(issues.some((i) => i.key === "DOC_doc-1_scan" && i.step === "identity"));

    // Crucial check: Navigation before Step 3 (Preferences) MUST be blocked by these issues
    const blockersBeforePreferences = issuesBeforeStep(issues, GUEST_CREATE_STEPS, "preferences");
    assert.ok(blockersBeforePreferences.length >= 6);
    assert.ok(blockersBeforePreferences.every((b) => b.step === "identity"));

    // Once the user fills the required document fields, blockers are cleared
    draft.documents[0].documentNumber = "AB1234567";
    draft.documents[0].issuingCountry = "Ethiopia";
    draft.documents[0].issueDate = "2025-01-01";
    draft.documents[0].expiryDate = "2030-01-01";
    draft.documents[0].issuingAuthority = "Immigration";
    draft.documents[0].hasFront = true;

    const clearedIssues = guestCreateFieldIssues(draft, {
      rules: createFieldRules([field({ code: "FIRST_NAME", required: true })], null),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
      documentTypes,
      identityActive: true,
    });

    assert.equal(issuesBeforeStep(clearedIssues, GUEST_CREATE_STEPS, "preferences").length, 0);
  });

  it("enforces mandatory identity document when Card 4 marks IDENTITY_DOCUMENT required", () => {
    const draft = emptyGuestCreateDraft();
    draft.firstName = "John";
    draft.documents = [];

    const issues = guestCreateFieldIssues(draft, {
      rules: createFieldRules(
        [
          field({ code: "FIRST_NAME", required: true }),
          field({ code: "IDENTITY_DOCUMENT", required: true, active: true }),
        ],
        null,
      ),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
      identityActive: true,
    });

    const identityIssues = issues.filter((i) => i.step === "identity");
    assert.ok(identityIssues.length > 0);
    assert.ok(identityIssues.some((i) => i.key === "IDENTITY_DOCUMENT"));

    // Blockers before Step 3 must contain IDENTITY_DOCUMENT
    const blockers = issuesBeforeStep(issues, GUEST_CREATE_STEPS, "preferences");
    assert.ok(blockers.some((b) => b.key === "IDENTITY_DOCUMENT"));
  });

  it("overrides and does not hold when document type or identity switch is inactive", () => {
    const draft = emptyGuestCreateDraft();
    draft.firstName = "John";
    draft.documents = [
      {
        key: "doc-1",
        idTypeId: "inactive-type-id",
        documentNumber: "",
        issuingCountry: "",
        issueDate: "",
        expiryDate: "",
        issuingAuthority: "",
        notes: "",
        hasFront: false,
        hasBack: false,
      },
    ];

    // Document type is inactive: requiredness is overridden and ignored
    const inactiveDocTypes = [
      {
        id: "inactive-type-id",
        name: "Passport",
        active: false,
        documentNumberRequired: true,
      },
    ];

    const issues = guestCreateFieldIssues(draft, {
      rules: createFieldRules([field({ code: "FIRST_NAME", required: true })], null),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
      documentTypes: inactiveDocTypes,
      identityActive: true,
    });

    assert.equal(issuesBeforeStep(issues, GUEST_CREATE_STEPS, "preferences").length, 0);

    // Global switch identityActive: false also overrides and yields 0 blockers
    const issuesGloballyInactive = guestCreateFieldIssues(draft, {
      rules: createFieldRules(
        [
          field({ code: "FIRST_NAME", required: true }),
          field({ code: "IDENTITY_DOCUMENT", required: true, active: false }),
        ],
        null,
      ),
      set3: null,
      requiredPreferenceTypeIds: [],
      dataProcessingRequired: false,
      identityActive: false,
    });

    assert.equal(issuesBeforeStep(issuesGloballyInactive, GUEST_CREATE_STEPS, "preferences").length, 0);
  });
});

describe("Guest create honesty", () => {
  it("reuses canonical guest APIs and Card 4 catalogues", () => {
    const workspace = readRel("../components/workspaces/guest-create-workspace.tsx");
    const functions = readRel("./guest-create.functions.ts");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const reservation = readRel("../components/bookings/create-reservation-guest.tsx");
    const dialog = readRel("../components/guests/guest-form-dialog.tsx");
    assert.match(workspace, /findGuestDuplicates/);
    assert.match(workspace, /createGuest/);
    assert.match(workspace, /saveGuestDocument/);
    assert.match(workspace, /saveGuestPreferenceWorkspace/);
    assert.match(workspace, /linkGuestAccount/);
    assert.match(workspace, /saveGuestConsent/);
    assert.match(workspace, /GuestFormStagedLinks/);
    assert.match(workspace, /writeGuestCreateHold/);
    assert.match(workspace, /readGuestCreateHold/);
    assert.match(workspace, /onClick=\{\(\) => go\(item\.id\)\}/);
    assert.match(workspace, /issuesBeforeStep/);
    assert.match(workspace, /formatCreateIssuesByStep/);
    assert.match(workspace, /Go to step/);
    assert.match(workspace, /border-destructive/);
    assert.doesNotMatch(workspace, /disabled=\{!reachable\}/);
    assert.doesNotMatch(workspace, /done \|\| current \|\| index <= stepIndex/);
    assert.match(workspace, /GUEST_CREATE_START_OVER/);
    assert.match(workspace, /guest-create-start-over/);
    assert.doesNotMatch(workspace, /Discard unsaved changes/);
    assert.equal(GUEST_CREATE_START_OVER, "Start Over");
    assert.match(functions, /pms_guest_fields/);
    assert.match(functions, /pms_guest_profile_types/);
    assert.match(functions, /pms_guest_preference_types/);
    assert.match(functions, /pms_guest_id_types/);
    assert.match(shell, /create: "individual"/);
    assert.match(reservation, /GuestFormDialog/);
    assert.match(dialog, /createGuest/);
    assert.doesNotMatch(workspace, /Airport Pickup|Laundry|Wake-up Call/);
  });

  it("keeps dual-lane 0093 drafts off guest_profiles", () => {
    const supabase = readRel("../../../../supabase/migrations/0093_pms_guest_create_drafts.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0093_pms_guest_create_drafts.sql");
    assert.equal(GUEST_CREATE_MIGRATION_FILE, "0093_pms_guest_create_drafts.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_guest_create_drafts/);
    assert.doesNotMatch(supabase, /CREATE TABLE.*guest_profiles/i);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });
});
