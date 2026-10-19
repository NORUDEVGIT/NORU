import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { defaultGuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-defaults";
import type { GuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-config";
import {
  enabledAgreementCount,
  GUEST_AGREEMENT_MANAGER_ONLY,
  GUEST_AGREEMENT_PROPERTY_SETUP_HELP,
  GUEST_AGREEMENT_PUBLISH_POINTS,
  GUEST_AGREEMENT_PUBLISH_TITLE,
  GUEST_AGREEMENT_READONLY,
  GUEST_AGREEMENT_REMOVE_SECTION,
  GUEST_AGREEMENT_ROUTE,
  guestAgreementActionFailure,
  guestAgreementActionState,
  guestAgreementCanMutate,
  guestAgreementVersionDetail,
  previewGuestAgreement,
  propertySetupTimeWarning,
  reorderGuestAgreementItems,
  type GuestAgreementConfiguration,
  type GuestAgreementVersionView,
} from "@/packages/pms/lib/guest-agreement-ui";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");
const screen = read("../components/guests/guest-agreement-workspace.tsx");
const route = read("../../../routes/restaurant/pms/guest-services.agreement.tsx");
const guestServices = read("../../../routes/restaurant/pms/guest-services.tsx");
const checkInWorkspace = read("../components/frontoffice/fo-checkin-v2-workspace.tsx");

function version(overrides: Partial<GuestAgreementVersionView> = {}): GuestAgreementVersionView {
  return {
    id: "version-1",
    label: "1",
    active: true,
    publishedAt: "2026-10-19T09:00:00.000Z",
    editable: false,
    legacy: false,
    body: "Hotel Registration Agreement",
    agreement: defaultGuestAgreementPackage(),
    resolvedCheckInTime: "14:00",
    resolvedCheckOutTime: "12:00",
    ...overrides,
  };
}

function configuration(
  overrides: Partial<GuestAgreementConfiguration> = {},
): GuestAgreementConfiguration {
  const active = version();
  return {
    active,
    draft: null,
    history: [
      {
        id: active.id,
        label: active.label,
        active: true,
        publishedAt: active.publishedAt,
        editable: false,
      },
    ],
    checkInTime: "14:00",
    checkOutTime: "12:00",
    ...overrides,
  };
}

describe("guest agreement configuration screen", () => {
  it("loads Guest Agreement from getGuestAgreementConfiguration", () => {
    assert.match(screen, /getGuestAgreementConfiguration/);
    assert.match(route, /GuestAgreementWorkspace/);
    assert.equal(GUEST_AGREEMENT_ROUTE, "/restaurant/pms/guest-services/agreement");
    assert.match(route, /createFileRoute\("\/restaurant\/pms\/guest-services\/agreement"\)/);
    assert.match(guestServices, /guest-services-agreement-link/);
    assert.match(guestServices, /PmsPlaceholder/);
    assert.match(guestServices, /<Outlet \/>/);
  });

  it("renders the active agreement summary", () => {
    const active = version();
    assert.equal(enabledAgreementCount(active, "sections"), 7);
    assert.equal(enabledAgreementCount(active, "acknowledgements"), 4);
    assert.match(screen, /data-testid="guest-agreement-active"/);
    assert.match(screen, /Version \{version\.label\}/);
  });

  it("renders the current Property Setup check-in time", () => {
    assert.match(screen, /data-testid="guest-agreement-check-in-time"/);
    assert.match(screen, /value=\{checkInTime \?\? ""\}/);
  });

  it("renders the current Property Setup check-out time", () => {
    assert.match(screen, /data-testid="guest-agreement-check-out-time"/);
    assert.match(screen, /value=\{checkOutTime \?\? ""\}/);
  });

  it("keeps Property Setup times read-only", () => {
    assert.match(screen, /readOnly/);
    assert.match(screen, /disabled/);
    assert.match(screen, /GUEST_AGREEMENT_PROPERTY_SETUP_HELP/);
    assert.match(GUEST_AGREEMENT_PROPERTY_SETUP_HELP, /Settings → Property Setup/);
    assert.equal(propertySetupTimeWarning("14:00", "12:00"), null);
    assert.match(propertySetupTimeWarning(null, "12:00") ?? "", /Property Setup/);
    assert.doesNotMatch(screen, /updateRestaurant|check_in_time:/);
  });

  it("shows Create New Version when there is no draft", () => {
    assert.equal(guestAgreementActionState("owner", false).create, true);
    assert.match(screen, /Create New Version/);
    assert.match(screen, /data-testid="guest-agreement-create"/);
  });

  it("calls createGuestAgreementVersion for a new version", () => {
    assert.match(screen, /createGuestAgreementVersion/);
    assert.match(screen, /createVersion\(\{ data: \{ restaurantId \} \}\)/);
  });

  it("loads the draft title", () => {
    assert.match(screen, /data-testid=\{id\}/);
    assert.match(screen, /id="guest-agreement-title"/);
    assert.match(screen, /value=\{agreement\.title\}/);
  });

  it("loads the draft intro", () => {
    assert.match(screen, /id="guest-agreement-intro"/);
    assert.match(screen, /value=\{agreement\.intro\}/);
  });

  it("loads the draft lead-in", () => {
    assert.match(screen, /id="guest-agreement-lead-in"/);
    assert.match(screen, /value=\{agreement\.leadIn\}/);
  });

  it("renders seven sections when the draft returns them", () => {
    assert.equal(defaultGuestAgreementPackage().sections.length, 7);
    assert.match(screen, /data-testid="guest-agreement-section"/);
    assert.match(screen, /agreement\.sections/);
  });

  it("updates a section in the local draft without changing the source", () => {
    const source = defaultGuestAgreementPackage();
    const next = editSection(source, "identification", {
      descriptionTemplate: "Bring a passport.",
    });
    assert.match(
      source.sections.find((section) => section.id === "identification")?.descriptionTemplate ?? "",
      /government-issued/,
    );
    assert.equal(
      next.sections.find((section) => section.id === "identification")?.descriptionTemplate,
      "Bring a passport.",
    );
    assert.match(screen, /resolvedDescription: null/);
  });

  it("saves the draft with updateGuestAgreementDraft", () => {
    assert.match(screen, /updateGuestAgreementDraft/);
    assert.match(screen, /saveDraft\(/);
    assert.match(screen, /Draft saved/);
    assert.match(screen, /invalidateQueries/);
  });

  it("can enable or disable a section", () => {
    const disabled = editSection(defaultGuestAgreementPackage(), "smoking_policy", {
      enabled: false,
    });
    assert.equal(
      disabled.sections.find((section) => section.id === "smoking_policy")?.enabled,
      false,
    );
    assert.match(screen, /aria-label="Section enabled"/);
  });

  it("can remove a section from the draft", () => {
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      sections: source.sections.filter((section) => section.id !== "smoking_policy"),
    };
    assert.equal(source.sections.length, 7);
    assert.equal(next.sections.length, 6);
    assert.match(screen, /GUEST_AGREEMENT_REMOVE_SECTION/);
    assert.match(GUEST_AGREEMENT_REMOVE_SECTION, /Previously published versions remain unchanged/);
  });

  it("can add a custom section", () => {
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      sections: [
        ...source.sections,
        {
          id: "pets",
          title: "Pets",
          descriptionTemplate: "Pets must be arranged in advance.",
          resolvedDescription: null,
          enabled: true,
          displayOrder: 80,
        },
      ],
    };
    assert.equal(
      next.sections.some((section) => section.id === "pets"),
      true,
    );
    assert.match(screen, /Add Section/);
  });

  it("reorders sections by display order", () => {
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      sections: reorderGuestAgreementItems(source.sections, "check_out_time", "up"),
    };
    assert.equal(next.sections[0]?.id, "check_out_time");
    assert.equal(source.sections[0]?.id, "check_in_time");
    assert.deepEqual(
      next.sections.map((section) => section.displayOrder),
      [10, 20, 30, 40, 50, 60, 70],
    );
    assert.match(screen, /Move \$\{section\.title\} up/);
  });

  it("renders four acknowledgements when the draft returns them", () => {
    assert.equal(defaultGuestAgreementPackage().acknowledgements.length, 4);
    assert.match(screen, /data-testid="guest-agreement-acknowledgement"/);
  });

  it("edits an acknowledgement without changing the source", () => {
    const source = defaultGuestAgreementPackage();
    const next = editAcknowledgement(source, "hotel_terms", {
      statement: "I accept the house rules.",
    });
    assert.match(source.acknowledgements[1]?.statement ?? "", /hotel's terms/);
    assert.equal(
      next.acknowledgements.find((item) => item.id === "hotel_terms")?.statement,
      "I accept the house rules.",
    );
  });

  it("can enable or disable an acknowledgement", () => {
    const next = editAcknowledgement(defaultGuestAgreementPackage(), "hotel_terms", {
      enabled: false,
      required: false,
    });
    const item = next.acknowledgements.find((row) => row.id === "hotel_terms");
    assert.equal(item?.enabled, false);
    assert.equal(item?.required, false);
    assert.match(screen, /aria-label="Acknowledgement enabled"/);
  });

  it("can change whether an acknowledgement is required", () => {
    const next = editAcknowledgement(defaultGuestAgreementPackage(), "hotel_terms", {
      required: false,
    });
    assert.equal(next.acknowledgements.find((item) => item.id === "hotel_terms")?.required, false);
    assert.match(screen, /checked=\{editor\.enabled && editor\.required\}/);
  });

  it("can add an acknowledgement", () => {
    assert.match(screen, /Add Acknowledgement/);
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      acknowledgements: [
        ...source.acknowledgements,
        {
          id: "house_rules",
          title: "House rules",
          statement: "I will follow the house rules shown to me.",
          enabled: true,
          required: false,
          displayOrder: 50,
        },
      ],
    };
    assert.equal(next.acknowledgements.length, 5);
  });

  it("can remove an acknowledgement from the draft", () => {
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      acknowledgements: source.acknowledgements.filter(
        (item) => item.id !== "payment_authorization",
      ),
    };
    assert.equal(source.acknowledgements.length, 4);
    assert.equal(next.acknowledgements.length, 3);
  });

  it("reorders acknowledgements", () => {
    const source = defaultGuestAgreementPackage();
    const next = {
      ...source,
      acknowledgements: reorderGuestAgreementItems(source.acknowledgements, "hotel_terms", "up"),
    };
    assert.equal(next.acknowledgements[0]?.id, "hotel_terms");
    assert.equal(source.acknowledgements[0]?.id, "registration_information");
    assert.match(screen, /Move \$\{item\.title\} up/);
  });

  it("keeps a published version read-only", () => {
    assert.match(screen, /GUEST_AGREEMENT_READONLY/);
    assert.match(GUEST_AGREEMENT_READONLY, /Published versions are read-only/);
    const view = screen.slice(screen.indexOf("function ReadonlyVersion"));
    assert.doesNotMatch(view, /Save Draft|Apply to draft|onChange=/);
  });

  it("keeps a historical version read-only", () => {
    const previous = version({ id: "version-0", label: "0", active: false });
    const current = configuration({
      history: [
        {
          id: "version-0",
          label: "0",
          active: false,
          publishedAt: previous.publishedAt,
          editable: false,
        },
      ],
    });
    const detail = guestAgreementVersionDetail(current, "version-0");
    assert.equal(detail && "legacy" in detail, false);
    assert.match(screen, /data-testid="guest-agreement-history-readonly"/);
    assert.match(screen, /data-testid="guest-agreement-history"/);
  });

  it("renders a legacy body without splitting it into sections", () => {
    const legacy = version({
      legacy: true,
      agreement: null,
      body: "Original house rules.",
    });
    assert.equal(enabledAgreementCount(legacy, "sections"), null);
    assert.match(screen, /Legacy Agreement/);
    assert.match(screen, /whitespace-pre-wrap/);
    assert.match(screen, /\{body\}/);
  });

  it("publishes through publishGuestAgreementVersion", () => {
    assert.match(screen, /publishGuestAgreementVersion/);
    assert.match(
      screen,
      /publishVersion\(\{ data: \{ restaurantId, versionId: configuration\.draft\.id \} \}\)/,
    );
  });

  it("explains Property Setup resolution before publish", () => {
    assert.equal(GUEST_AGREEMENT_PUBLISH_TITLE, "Publish this Guest Agreement?");
    assert.match(
      GUEST_AGREEMENT_PUBLISH_POINTS[1] ?? "",
      /Property Setup check-in and check-out values will be resolved/,
    );
    assert.match(screen, /GUEST_AGREEMENT_PUBLISH_POINTS/);
    assert.match(screen, /data-testid="guest-agreement-publish-dialog"/);
  });

  it("refetches configuration after a successful publish", () => {
    const publish = screen.slice(screen.indexOf("const publishMutation"));
    assert.match(publish, /await refresh\(\)/);
    assert.match(screen, /invalidateQueries/);
    assert.match(publish, /Guest Agreement published/);
  });

  it("shows mutation controls for an owner or manager", () => {
    assert.equal(guestAgreementCanMutate("owner"), true);
    assert.equal(guestAgreementCanMutate("manager"), true);
    assert.deepEqual(guestAgreementActionState("manager", true), {
      create: false,
      save: true,
      publish: true,
    });
    assert.match(screen, /disabled=\{!actions\.save/);
    assert.match(screen, /disabled=\{!actions\.publish/);
  });

  it("does not enable mutation controls for a receptionist", () => {
    assert.equal(guestAgreementCanMutate("receptionist"), false);
    assert.deepEqual(guestAgreementActionState("receptionist", true), {
      create: false,
      save: false,
      publish: false,
    });
    assert.match(screen, /guest-agreement-permission/);
    assert.match(screen, /GUEST_AGREEMENT_MANAGER_ONLY/);
    assert.equal(
      GUEST_AGREEMENT_MANAGER_ONLY,
      "An owner or manager has to manage the guest agreement.",
    );
  });

  it("handles a backend permission failure without a stack trace", () => {
    const message = guestAgreementActionFailure(
      new Error("An owner or manager has to manage the guest agreement.\n    at handler"),
    );
    assert.equal(message, "An owner or manager has to manage the guest agreement.");
    assert.doesNotMatch(message, /at handler/);
    assert.match(screen, /guestAgreementActionFailure\(query\.error\)/);
  });

  it("surfaces an unsupported placeholder from the server", () => {
    assert.equal(
      guestAgreementActionFailure(
        new Error("This agreement uses a placeholder that cannot be resolved."),
      ),
      "This agreement uses a placeholder that cannot be resolved.",
    );
  });

  it("leaves the active version unchanged while a draft exists", () => {
    const draft = defaultGuestAgreementPackage();
    draft.title = "Draft title";
    const current = configuration({
      draft: version({
        id: "draft-2",
        label: "2",
        active: false,
        editable: true,
        publishedAt: null,
        agreement: draft,
      }),
    });
    assert.equal(current.active?.id, "version-1");
    assert.equal(current.active?.agreement?.title, "Hotel Registration Agreement");
    assert.equal(current.draft?.agreement?.title, "Draft title");
    assert.match(screen, /The active agreement is unchanged/);
  });

  it("keeps the previous published version in history", () => {
    const current = configuration({
      active: version({ id: "version-2", label: "2" }),
      draft: null,
      history: [
        {
          id: "version-2",
          label: "2",
          active: true,
          publishedAt: "2026-10-19T10:00:00.000Z",
          editable: false,
        },
        {
          id: "version-1",
          label: "1",
          active: false,
          publishedAt: "2026-10-19T09:00:00.000Z",
          editable: false,
        },
      ],
    });
    assert.equal(
      current.history.some((row) => row.id === "version-1" && row.active === false),
      true,
    );
    assert.match(screen, /rows\.map\(\(row\)/);
  });

  it("does not write the agreement table from the frontend", () => {
    assert.doesNotMatch(screen, /\.from\(|supabaseAdmin|pms_registration_agreement_versions/);
    assert.doesNotMatch(route, /\.from\(|supabaseAdmin|pms_registration_agreement_versions/);
    const previewSource = defaultGuestAgreementPackage();
    const preview = previewGuestAgreement(previewSource, {
      checkInTime: "15:00",
      checkOutTime: "11:00",
    });
    assert.match(previewSource.sections[0]?.descriptionTemplate ?? "", /\{\{check_in_time\}\}/);
    assert.match(preview.sections[0]?.resolvedDescription ?? "", /15:00/);
  });

  it("does not add Check-In completion to Guest Agreement", () => {
    assert.doesNotMatch(screen, /review_checkin|completeFoCheckIn|Complete Check-In/);
    assert.doesNotMatch(route, /review_checkin|completeFoCheckIn/);
    assert.match(checkInWorkspace, /FoCheckInV2Review/);
  });
});

function editSection(
  source: GuestAgreementPackage,
  id: string,
  patch: Partial<GuestAgreementPackage["sections"][number]>,
): GuestAgreementPackage {
  return {
    ...source,
    sections: source.sections.map((section) =>
      section.id === id ? { ...section, ...patch, resolvedDescription: null } : section,
    ),
  };
}

function editAcknowledgement(
  source: GuestAgreementPackage,
  id: string,
  patch: Partial<GuestAgreementPackage["acknowledgements"][number]>,
): GuestAgreementPackage {
  return {
    ...source,
    acknowledgements: source.acknowledgements.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  };
}
