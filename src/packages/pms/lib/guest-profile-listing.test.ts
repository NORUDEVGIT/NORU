import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseGuestProfileSearch } from "./guest-profile-wave1.ts";
import {
  CARD4_CODE_TO_SECTION,
  GUEST_LISTING_CHIPS,
  GUEST_LISTING_SECTIONS,
  GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED,
  chipForSection,
  displayProfileNumber,
  guestListingSection,
  isLiveListingSection,
  lastStayWindowStart,
  listingCreateAllowed,
  listingSectionFromCard4Code,
  listingTypeInactive,
  operationalProfileType,
  sectionToAccountType,
  uuidFirstSegment,
} from "./guest-profile-listing.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest listing mapping", () => {
  it("keeps six listing sections, live Group, and TO/Contact as placeholders", () => {
    assert.deepEqual(
      GUEST_LISTING_SECTIONS.map((section) => [section.id, section.live, section.placeholder]),
      [
        ["individual", true, false],
        ["company", true, false],
        ["travel-agent", true, false],
        ["tour-operator", false, true],
        ["contact", false, true],
        ["group", true, false],
      ],
    );
    assert.equal(GUEST_LISTING_SECTIONS.some((section) => section.id === "organization"), false);
    assert.equal(listingSectionFromCard4Code("ORG"), null);
    assert.equal(listingSectionFromCard4Code("IND"), "individual");
    assert.equal(listingSectionFromCard4Code("TOU"), "tour-operator");
    assert.equal(listingSectionFromCard4Code("GRP"), "group");
    assert.equal("ORG" in CARD4_CODE_TO_SECTION, false);
    assert.equal("GRP" in CARD4_CODE_TO_SECTION, true);
    assert.equal(isLiveListingSection("group"), true);
    assert.equal(isLiveListingSection("tour-operator"), false);
    assert.equal(operationalProfileType("contact"), "individual");
    assert.equal(sectionToAccountType("company"), "company");
    assert.equal(sectionToAccountType("tour-operator"), null);
    assert.equal(guestListingSection("tour-operator"), "tour-operator");
    assert.deepEqual(
      GUEST_LISTING_CHIPS.map((chip) => chip.id),
      ["all", "individual"],
    );
    assert.equal(chipForSection("group"), "all");
  });

  it("displays a stable short UUID or account code as the profile number", () => {
    assert.equal(displayProfileNumber("a1b2c3d4-e5f6-4711-8abc-def012345678"), "A1B2C3D4");
    assert.equal(displayProfileNumber("a1b2c3d4-e5f6-4711-8abc-def012345678", " ta-01 "), "TA-01");
    assert.equal(uuidFirstSegment("A1B2C3D4"), "a1b2c3d4");
    assert.equal(uuidFirstSegment("not-a-uuid"), null);
  });

  it("maps last-stay presets to a date window", () => {
    assert.equal(lastStayWindowStart("all", "2026-09-21"), null);
    assert.equal(lastStayWindowStart("never", "2026-09-21"), null);
    assert.equal(lastStayWindowStart("d30", "2026-09-21"), "2026-08-22");
    assert.equal(lastStayWindowStart("d90", "2026-09-21"), "2026-06-23");
    assert.equal(lastStayWindowStart("y1", "2026-09-21"), "2025-09-21");
  });

  it("accepts listing placeholder types on directory search without adding operational types", () => {
    assert.deepEqual(parseGuestProfileSearch({ type: "tour-operator" }), { type: "tour-operator" });
    assert.deepEqual(parseGuestProfileSearch({ type: "contact" }), { type: "contact" });
    assert.equal(parseGuestProfileSearch({}).type, undefined);
  });
});

describe("Guest listing honesty", () => {
  it("does not add a second guest store, import engine, or TO/Contact create type", () => {
    const functions = readRel("./guests.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const config = readRel("./guest-workspace-config.functions.ts");

    assert.match(functions, /from\("guest_profiles"\)/);
    assert.match(functions, /export const listGuests/);
    assert.match(functions, /id_document_number\.ilike/);
    assert.match(functions, /lastStayAvailable/);
    assert.match(functions, /contacts: null/);
    assert.match(functions, /tourOperators: null/);
    assert.doesNotMatch(functions, /guest_profiles_wave|guest_profile_v2/);
    assert.match(functions, /profile_number/);
    assert.match(accounts, /from\("guest_account_masters"\)/);
    assert.doesNotMatch(accounts, /tour_operator|contact_person/);
    assert.match(listing, /disabled title=\{GUEST_IMPORT_UNAVAILABLE\}/);
    assert.match(listing, /New Contact/);
    assert.match(listing, /disabled title=\{CONTACT_PROFILE_UNAVAILABLE\}/);
    assert.match(listing, /TOUR_OPERATOR_UNAVAILABLE/);
    assert.doesNotMatch(listing, /accountType="tour_operator"|accountType="contact"/);
    assert.match(directory, /setGuestStatus/);
    assert.match(directory, /GuestMergeDialog/);
    assert.match(directory, /GuestFormDialog/);
    assert.doesNotMatch(directory, /\bdeleteGuest\b|hard delete/i);
    assert.match(config, /requireGuestManager/);
    assert.doesNotMatch(config, /requireRoomManager/);
    assert.doesNotMatch(config, /\.insert\(|\.update\(|\.delete\(/);
  });

  it("wires listing chrome from the guest profile workspace directory path", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(shell, /GuestListingWorkspace/);
    assert.match(listing, /guest-listing-nav/);
    assert.match(listing, /guest-quick-actions/);
    assert.equal(GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED, true);
    assert.match(
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      /sidebarDefaultCollapsed=\{GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED\}/,
    );
    assert.match(
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
      /sidebarDefaultCollapsed=\{GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED\}/,
    );
    assert.match(listing, /GuestListingNewGuestMenu/);
    assert.match(listing, /import-guests/);
    assert.doesNotMatch(listing, /guest-listing-chips/);
    assert.doesNotMatch(listing, /guest-workspace-activity/);
    assert.doesNotMatch(listing, /Organization/);
    assert.match(directory, /guest-listing-search/);
    assert.doesNotMatch(directory, /guest-type-filter/);
  });
});

describe("Card 4 Active/Inactive workspace wiring", () => {
  it("blocks create when a mapped type is inactive and never hides existing data", () => {
    const inactiveCompany = {
      available: true,
      types: [
        { section: "individual" as const, active: true },
        { section: "company" as const, active: false },
        { section: "travel-agent" as const, active: true },
        { section: "group" as const, active: false },
        { section: "tour-operator" as const, active: true },
        { section: "contact" as const, active: false },
      ],
    };
    assert.equal(listingCreateAllowed("individual", inactiveCompany), true);
    assert.equal(listingCreateAllowed("company", inactiveCompany), false);
    assert.equal(listingCreateAllowed("travel-agent", inactiveCompany), true);
    assert.equal(listingCreateAllowed("group", inactiveCompany), false);
    assert.equal(listingCreateAllowed("tour-operator", inactiveCompany), false);
    assert.equal(listingCreateAllowed("contact", inactiveCompany), false);
    assert.equal(listingTypeInactive("company", inactiveCompany), true);
    assert.equal(listingTypeInactive("individual", inactiveCompany), false);
  });

  it("degrades to operational create when Card 4 catalogue is missing", () => {
    assert.equal(listingCreateAllowed("company", { available: false, types: [] }), true);
    assert.equal(listingCreateAllowed("individual", undefined), true);
    assert.equal(listingCreateAllowed("tour-operator", { available: false, types: [] }), false);
    assert.equal(listingCreateAllowed("company", { available: true, types: [] }), true);
    assert.equal(listingCreateAllowed("group", { available: true, types: [] }), true);
  });

  it("reads Card 4 from FO requireGuestManager and blocks create APIs when inactive", () => {
    const config = readRel("./guest-workspace-config.functions.ts");
    const guests = readRel("./guests.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const settings = readRel("../components/settings/pms-card4-profile-types.tsx");
    assert.match(config, /requireGuestManager/);
    assert.doesNotMatch(config, /requireRoomManager/);
    assert.match(config, /pms_guest_profile_types/);
    assert.match(config, /assertListingCreateAllowed/);
    assert.match(guests, /assertListingCreateAllowed/);
    assert.match(accounts, /assertListingCreateAllowed/);
    assert.doesNotMatch(accounts, /assertListingCreateAllowed\(data\.restaurantId, "group"\)/);
    assert.match(readRel("./guest-group-create.functions.ts"), /assertListingCreateAllowed/);
    assert.match(readRel("./guest-group-detail.functions.ts"), /assertListingCreateAllowed/);
    assert.match(listing, /listingCreateAllowed\("company"/);
    assert.match(listing, /PROFILE_TYPE_INACTIVE_SECTION_COPY/);
    assert.match(listing, /guest-listing-inactive-copy/);
    assert.match(settings, /guest-workspace-config/);
  });
});
