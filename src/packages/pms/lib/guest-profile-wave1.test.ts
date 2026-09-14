import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_PROFILE_CARDS,
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_LEGACY_DETAIL,
  GUEST_PROFILE_LEGACY_DIRECTORY,
  GUEST_PROFILE_MODULE_KEY,
  GUEST_PROFILE_TITLE,
  GUEST_PROFILE_TYPES,
  comingInWaveLabel,
  defaultGuestProfileCard,
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
    assert.equal(GUEST_PROFILE_TITLE, "Guest Profile");
    assert.equal(GUEST_PROFILE_DIRECTORY_PATH, "/restaurant/pms/guests");
    assert.equal(GUEST_PROFILE_DETAIL_PATH, "/restaurant/pms/guests/$guestId");
  });

  it("exposes ten individual cards with Directory, Information, Identity and Preferences LIVE", () => {
    assert.equal(GUEST_PROFILE_CARDS.length, 10);
    const live = GUEST_PROFILE_CARDS.filter((card) => card.live).map((card) => card.id);
    assert.deepEqual(live, ["directory", "information", "identity", "preferences"]);
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

  it("keeps Company, Group and TA as not LIVE with no master CRUD hook", () => {
    assert.deepEqual(
      GUEST_PROFILE_TYPES.map((t) => [t.id, t.live, t.wave]),
      [
        ["individual", true, 1],
        ["company", false, 4],
        ["group", false, 4],
        ["travel-agent", false, 4],
      ],
    );
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(shell, /not LIVE/);
    assert.doesNotMatch(shell, /createCompany|createGroup|createTravelAgent/);
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
