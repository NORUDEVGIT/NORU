import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DIRECTORY_BACK_ACCEPTANCE_CRITERIA,
  EMPTY_GUEST_ACCEPTANCE_CRITERIA,
  GUEST_PROFILE_CARDS,
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_LEGACY_DETAIL,
  GUEST_PROFILE_LEGACY_DIRECTORY,
  GUEST_PROFILE_MODULE_KEY,
  GUEST_PROFILE_OPEN_DIRECTORY_LABEL,
  GUEST_PROFILE_TITLE,
  GUEST_PROFILE_TYPES,
  comingInWaveLabel,
  defaultGuestProfileCard,
  guestProfileCardSearch,
  initialGuestProfileCard,
  isGuestProfileNavCard,
  isGuestRequiredProfileCard,
  parseGuestProfileCardSearch,
  showEmptyDirectoryCta,
} from "./guest-profile-wave1.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest Profile Wave 1 catalogue", () => {
  it("registers guest-profile on the PMS commercial nav and keeps guest-services as requests", () => {
    const modules = readRel("./pms-modules.ts");
    assert.match(modules, /key: "guest-profile"/);
    assert.match(modules, /title: "Guest Profile"/);
    assert.match(modules, /canonicalRoute: "\/restaurant\/pms\/guests"/);
    assert.match(modules, /implementationStatus: "partial"/);
    assert.match(modules, /moduleKey: "front_office"/);
    assert.match(modules, /group: "commercial"/);
    assert.match(modules, /key: "guest-services"/);
    assert.match(modules, /title: "Guest Services"/);
    assert.match(modules, /Guest requests and concierge tracking/);
    assert.doesNotMatch(
      modules,
      /Guest profiles today; requests and concierge tracking are planned/,
    );
    assert.equal(GUEST_PROFILE_MODULE_KEY, "guest-profile");
    assert.equal(GUEST_PROFILE_TITLE, "Guest Profiles");
    assert.equal(GUEST_PROFILE_DIRECTORY_PATH, "/restaurant/pms/guests");
    assert.equal(GUEST_PROFILE_DETAIL_PATH, "/restaurant/pms/guests/$guestId");
  });

  it("exposes ten individual cards with Directory, Information, Identity, Preferences, Stay History and Dashboard LIVE", () => {
    assert.equal(GUEST_PROFILE_CARDS.length, 10);
    const live = GUEST_PROFILE_CARDS.filter((card) => card.live).map((card) => card.id);
    assert.deepEqual(live, [
      "dashboard",
      "directory",
      "information",
      "identity",
      "stay-history",
      "preferences",
      "loyalty",
      "relationships",
      "notes-comms",
      "admin-privacy",
    ]);
    for (const card of GUEST_PROFILE_CARDS) {
      if (card.live) continue;
      assert.match(card.copy ?? "", /Coming in Wave \d/);
      assert.doesNotMatch(card.copy ?? "", /\d[\d,]{2,}/);
      assert.doesNotMatch(card.copy ?? "", /12,500|occupancy %|8[05]% occupied/i);
      assert.equal(comingInWaveLabel(card.wave), `Coming in Wave ${card.wave}`);
    }
    assert.equal(defaultGuestProfileCard(false), "directory");
    assert.equal(defaultGuestProfileCard(true), "information");
  });

  it("keeps Company, Group and TA LIVE with Guest-owned master CRUD", () => {
    assert.deepEqual(
      GUEST_PROFILE_TYPES.map((t) => [t.id, t.live, t.wave]),
      [
        ["individual", true, 1],
        ["company", true, 4],
        ["group", true, 4],
        ["travel-agent", true, 4],
      ],
    );
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(shell, /selectType/);
    assert.match(shell, /GuestAccountDirectory/);
    assert.match(shell, /createGuestAccount|GuestAccountFormDialog|GuestAccountDirectory/);
  });
});

describe("Guest Profile Wave 1 reuse and honesty", () => {
  it("reuses listGuests / createGuest / updateGuest and does not add a second guest table", () => {
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const form = readRel("../components/guests/guest-form-dialog.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const functions = readRel("./guests.functions.ts");

    assert.match(directory, /listGuests/);
    assert.match(directory, /GuestFormDialog/);
    assert.match(form, /createGuest/);
    assert.match(form, /updateGuest/);
    assert.match(form, /idDocumentType/);
    assert.match(form, /idDocumentNumber/);
    assert.match(form, /idDocumentExpiry/);
    assert.match(form, /Open existing guest/);
    assert.match(form, /Create anyway/);
    assert.match(form, /Nothing is merged/);
    assert.match(form, /Merge is optional and always asks for an explicit confirm/);
    assert.doesNotMatch(form, /automatically merge|one-click merge|silent merge/i);
    assert.match(detail, /idDocumentType/);
    assert.match(functions, /from\("guest_profiles"\)/);
    assert.doesNotMatch(functions, /guest_profiles_wave|guest_profile_v2/);
  });

  it("uses a directory-first landing with compact global KPIs and compact profile sections", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const functions = readRel("./guests.functions.ts");
    assert.match(directory, /Guest Profiles/);
    assert.match(directory, /Search, manage and open guest profiles/);
    assert.match(directory, /guest-directory-kpis/);
    assert.match(directory, /Total guests/);
    assert.match(directory, /Returning guests/);
    assert.match(functions, /export const getGuestDirectoryStats/);
    assert.match(functions, /requireGuestManager/);
    assert.match(functions, /count > 1/);
    assert.match(shell, /guest-profile-section-nav/);
    assert.match(shell, /isGuestProfileNavCard/);
    assert.match(shell, /overflow-x-auto/);
    assert.doesNotMatch(shell, /sm:grid-cols-2 xl:grid-cols-5/);
    assert.deepEqual(
      GUEST_PROFILE_CARDS.filter((card) => isGuestProfileNavCard(card.id)).map((card) => card.id),
      ["dashboard", "information", "identity", "stay-history", "preferences", "relationships"],
    );
    assert.equal(isGuestProfileNavCard("loyalty"), false);
    assert.equal(isGuestProfileNavCard("notes-comms"), false);
    assert.equal(isGuestProfileNavCard("admin-privacy"), false);
    assert.equal(isGuestProfileNavCard("directory"), false);
    assert.equal(isGuestRequiredProfileCard("loyalty"), true);
    assert.equal(isGuestRequiredProfileCard("notes-comms"), true);
    assert.equal(isGuestRequiredProfileCard("admin-privacy"), true);
  });

  it("keeps compatibility paths pointing at the new canonical guest profile", () => {
    const guestsIndex = readRel("../../../routes/restaurant/guests/index.tsx");
    const guestsDetail = readRel("../../../routes/restaurant/guests/$guestId.tsx");
    const reservationGuest = readRel(
      "../../../routes/restaurant/pms/reservations.guests.$guestId.tsx",
    );
    const directoryRoute = readRel("../../../routes/restaurant/pms/guests.index.tsx");
    const profileRoute = readRel("../../../routes/restaurant/pms/guests.$guestId.tsx");
    const guestServices = readRel("../../../routes/restaurant/pms/guest-services.tsx");

    assert.match(directoryRoute, /requireRoutePackage\("pms"\)/);
    assert.match(directoryRoute, /pmsModule="guest-profile"/);
    assert.match(profileRoute, /requireRoutePackage\("pms"\)/);
    assert.match(profileRoute, /pmsModule="guest-profile"/);
    assert.match(guestsIndex, /to: "\/restaurant\/pms\/guests"/);
    assert.match(guestsDetail, /to: "\/restaurant\/pms\/guests\/\$guestId"/);
    assert.match(reservationGuest, /to: "\/restaurant\/pms\/guests\/\$guestId"/);
    assert.match(guestServices, /to="\/restaurant\/pms\/guests"/);
    assert.match(guestServices, /Guest Services/);
    assert.doesNotMatch(guestServices, /finished Guest Profile/);
    assert.equal(GUEST_PROFILE_LEGACY_DIRECTORY, "/restaurant/guests");
    assert.equal(GUEST_PROFILE_LEGACY_DETAIL, "/restaurant/pms/reservations/guests/$guestId");
  });
});

describe("Guest Profile Directory-back — AC-DIR-1…7 (Spec §5.15)", () => {
  it("locks AC-DIR-1…7", () => {
    assert.deepEqual(
      [...DIRECTORY_BACK_ACCEPTANCE_CRITERIA],
      ["AC-DIR-1", "AC-DIR-2", "AC-DIR-3", "AC-DIR-4", "AC-DIR-5", "AC-DIR-6", "AC-DIR-7"],
    );
  });

  it("treats every LIVE card except Directory as guest-required", () => {
    assert.equal(isGuestRequiredProfileCard("directory"), false);
    assert.equal(isGuestRequiredProfileCard("information"), true);
    assert.equal(isGuestRequiredProfileCard("dashboard"), true);
    assert.equal(isGuestRequiredProfileCard("stay-history"), true);
    assert.equal(isGuestRequiredProfileCard("identity"), true);
    assert.equal(isGuestRequiredProfileCard("preferences"), true);
    assert.equal(isGuestRequiredProfileCard("loyalty"), true);
    assert.equal(isGuestRequiredProfileCard("relationships"), true);
    assert.equal(isGuestRequiredProfileCard("notes-comms"), true);
    assert.equal(isGuestRequiredProfileCard("admin-privacy"), true);
  });

  it("AC-DIR-1…5 selected profile header links back while preserving the active card", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const header = readRel("../components/guests/guest-profile-header.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(shell, /GuestProfileHeader/);
    assert.match(shell, /returnCard=\{card\}/);
    assert.match(header, /ArrowLeft/);
    assert.match(header, /Guest Profiles/);
    assert.match(header, /GUEST_PROFILE_DIRECTORY_PATH/);
    assert.match(header, /guestProfileSearch\(\{ card: returnCard, type: profileType \}\)/);
    assert.match(detail, /hideHeader \|\| backTo === "guest-profile"/);
  });

  it("AC-DIR-6 Directory-back returns to Directory and reopens the same card", () => {
    assert.deepEqual(parseGuestProfileCardSearch({ card: "dashboard" }), { card: "dashboard" });
    assert.deepEqual(parseGuestProfileCardSearch({ card: "stay-history" }), {
      card: "stay-history",
    });
    assert.deepEqual(parseGuestProfileCardSearch({ card: "directory" }), {});
    assert.deepEqual(parseGuestProfileCardSearch({ card: "loyalty" }), { card: "loyalty" });
    assert.deepEqual(guestProfileCardSearch("dashboard"), { card: "dashboard" });
    assert.deepEqual(guestProfileCardSearch("directory"), {});
    assert.equal(initialGuestProfileCard(true, "identity"), "identity");
    assert.equal(initialGuestProfileCard(true), "information");
    assert.equal(initialGuestProfileCard(false, "dashboard"), "directory");

    const header = readRel("../components/guests/guest-profile-header.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const indexRoute = readRel("../../../routes/restaurant/pms/guests.index.tsx");
    const detailRoute = readRel("../../../routes/restaurant/pms/guests.$guestId.tsx");
    assert.match(header, /guestProfileSearch\(\{ card: returnCard, type: profileType \}\)/);
    assert.match(directory, /guestProfileCardSearch\(returnCard\)/);
    assert.match(shell, /initialGuestProfileCard/);
    assert.match(indexRoute, /parseGuestProfileSearch/);
    assert.match(detailRoute, /parseGuestProfileSearch/);
    assert.match(indexRoute, /returnCard=\{card\}/);
    assert.match(detailRoute, /returnCard=\{card\}/);
  });

  it("AC-DIR-7 Directory itself does not render a back-to-Directory control", () => {
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.doesNotMatch(directory, /GuestProfileHeader/);
    assert.match(shell, /card === "directory"/);
    assert.match(shell, /GuestProfileHeader/);
  });
});

describe("Guest Profile empty guest — AC-EMPTY-1…6 (Spec §5.16)", () => {
  it("locks AC-EMPTY-1…6", () => {
    assert.deepEqual(
      [...EMPTY_GUEST_ACCEPTANCE_CRITERIA],
      ["AC-EMPTY-1", "AC-EMPTY-2", "AC-EMPTY-3", "AC-EMPTY-4", "AC-EMPTY-5", "AC-EMPTY-6"],
    );
  });

  it("shows the empty-state CTA on every guest-required card and not on Directory or Coming cards", () => {
    assert.equal(showEmptyDirectoryCta(false, "dashboard"), true);
    assert.equal(showEmptyDirectoryCta(false, "stay-history"), true);
    assert.equal(showEmptyDirectoryCta(false, "identity"), true);
    assert.equal(showEmptyDirectoryCta(false, "preferences"), true);
    assert.equal(showEmptyDirectoryCta(false, "information"), true);
    assert.equal(showEmptyDirectoryCta(true, "dashboard"), false);
    assert.equal(showEmptyDirectoryCta(false, "directory"), false);
    assert.equal(showEmptyDirectoryCta(false, "loyalty"), true);
    assert.equal(showEmptyDirectoryCta(false, "notes-comms"), true);
    assert.equal(showEmptyDirectoryCta(false, "admin-privacy"), true);
  });

  it("AC-EMPTY-1…5 guest-required empty states render a primary Open Directory button", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const open = readRel("../components/guests/guest-directory-open-button.tsx");
    assert.match(shell, /GuestDirectoryOpenButton/);
    assert.match(shell, /showEmptyDirectoryCta/);
    assert.match(shell, /emptyDirectoryFrom/);
    assert.match(shell, /card === "dashboard"/);
    assert.match(shell, /card === "stay-history"/);
    assert.match(shell, /card === "identity"/);
    assert.match(shell, /card === "information" \|\| card === "preferences"/);
    assert.match(shell, /directoryFromCard=\{emptyDirectoryFrom\}/);
    assert.match(open, /from "@\/shared\/components\/ui\/button"/);
    assert.match(open, /GUEST_PROFILE_OPEN_DIRECTORY_LABEL/);
    assert.match(open, /guest-profile-open-directory/);
    assert.match(open, /GUEST_PROFILE_DIRECTORY_PATH/);
    assert.match(open, /Spec §5\.16/);
    assert.match(open, /not Waves 4–5/);
    assert.equal(GUEST_PROFILE_OPEN_DIRECTORY_LABEL, "Open Directory");
    assert.doesNotMatch(open, /variant=/);
  });

  it("AC-EMPTY-6 button opens Directory and reopens the same card after a guest is picked", () => {
    const open = readRel("../components/guests/guest-directory-open-button.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(open, /guestProfileSearch\(\{ card: fromCard, type: profileType \}\)/);
    assert.match(shell, /setCard\("directory"\)/);
    assert.match(shell, /returnCard \?\? emptyReturnCard/);
    assert.match(directory, /guestProfileCardSearch\(returnCard\)/);
    assert.deepEqual(guestProfileCardSearch("dashboard"), { card: "dashboard" });
    assert.deepEqual(guestProfileCardSearch("stay-history"), { card: "stay-history" });
    assert.equal(initialGuestProfileCard(true, "identity"), "identity");
    assert.equal(initialGuestProfileCard(false, "dashboard"), "directory");
  });

  it("Directory itself does not render the empty-state Open Directory CTA", () => {
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.doesNotMatch(directory, /GuestDirectoryOpenButton|guest-profile-open-directory/);
    assert.match(shell, /card === "directory"/);
    assert.match(shell, /GuestProfileHeader/);
  });
});
