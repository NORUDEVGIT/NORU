import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  GUEST_WORKSPACE_SECTIONS,
  domainFromSection,
  sectionFromDomain,
} from "./guest-profile-domains";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_DETAIL_PATH,
  parseGuestProfileSearch,
  guestProfileSearch,
} from "./guest-profile-wave1";
import { GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED } from "./guest-profile-listing";

function readRel(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Phase 2D — Align Guest Profile with Shared PMS Command Chrome", () => {
  const roomChromeCode = readRel("../components/rooms/room-inventory-chrome.tsx");
  const rateChromeCode = readRel("../components/rates/rate-revenue-chrome.tsx");
  const guestChromeCode = readRel("../components/guests/guest-profile-chrome.tsx");
  const guestWorkspaceCode = readRel("../components/workspaces/guest-profile-workspace.tsx");
  const directoryRouteCode = readRel("../../../routes/restaurant/pms/guests.index.tsx");
  const detailRouteCode = readRel("../../../routes/restaurant/pms/guests.$guestId.tsx");

  it("1. Guest Profiles appears in PMS module nav", () => {
    assert.match(roomChromeCode, /PMS_MODULE_NAV_ITEMS/);
    assert.match(
      roomChromeCode,
      /\{\s*label:\s*"Guest Profiles",\s*to:\s*"\/restaurant\/pms\/guests"\s*\}/,
    );

    // Also verify rate-revenue-chrome includes Guest Profiles
    assert.match(rateChromeCode, /"Guest Profiles"/);
    assert.match(rateChromeCode, /\/restaurant\/pms\/guests/);
  });

  it("2. Guest Profiles active state on directory route", () => {
    assert.match(guestChromeCode, /activeModule="Guest Profiles"/);
    assert.match(guestWorkspaceCode, /directorySearch=\{directorySearch\}/);
    assert.match(guestChromeCode, /shellTestId="guest-profile-command-shell"/);
  });

  it("3. Guest Profiles active state on detail route", () => {
    // Detail route mounts GuestProfileWorkspace with directorySearch
    assert.match(detailRouteCode, /directorySearch=\{search\}/);
    // Detail paths in workspace pass membership and directorySearch to GuestProfileChrome
    assert.match(guestWorkspaceCode, /membership=\{membership\}/);
    // GuestProfileChrome maintains activeModule="Guest Profiles"
    assert.match(guestChromeCode, /activeModule="Guest Profiles"/);
  });

  it("4. Shared PMS chrome renders exactly once", () => {
    // RoomInventoryChrome is mounted at GuestProfileChrome root only
    assert.doesNotMatch(guestWorkspaceCode, /<RoomInventoryChrome/);
    assert.match(guestChromeCode, /<RoomInventoryChrome/);
    assert.doesNotMatch(guestChromeCode, /<RoomInventoryChrome[^>]*>[^]*<RoomInventoryChrome/);
  });

  it("5. Generic top header is hidden when shared chrome is used", () => {
    // Both directory and detail routes must hide generic top header and package rail
    assert.match(directoryRouteCode, /hidePackageRail/);
    assert.match(directoryRouteCode, /hideTopHeader/);
    assert.match(detailRouteCode, /hidePackageRail/);
    assert.match(detailRouteCode, /hideTopHeader/);
  });

  it("6. Guests/Companies/Travel Agencies/Groups internal nav remains", () => {
    assert.equal(GUEST_WORKSPACE_SECTIONS.length, 4);
    const sectionIds = GUEST_WORKSPACE_SECTIONS.map((s) => s.id);
    assert.deepEqual(sectionIds, ["guests", "companies", "travel-agencies", "groups"]);

    // Rendered inside GuestProfileChrome
    assert.match(guestChromeCode, /GUEST_WORKSPACE_SECTIONS\.map/);
    assert.match(guestChromeCode, /role="tablist"/);
    assert.match(guestChromeCode, /guest-nav-section-/);
  });

  it("7. Room & Inventory navigation still works", () => {
    assert.match(
      roomChromeCode,
      /\{\s*label:\s*"Rooms & Inventory",\s*to:\s*"\/restaurant\/pms\/room-inventory"\s*\}/,
    );
  });

  it("8. Reservations navigation still works", () => {
    assert.match(
      roomChromeCode,
      /\{\s*label:\s*"Reservations",\s*to:\s*"\/restaurant\/pms\/reservations"\s*\}/,
    );
  });

  it("9. Mobile module navigation includes Guest Profiles", () => {
    // mobile dropdown selects from NAV_ITEMS which includes Guest Profiles
    assert.match(roomChromeCode, /mobile=\{/);
    assert.match(roomChromeCode, /<select/);
    assert.match(roomChromeCode, /NAV_ITEMS\.map/);
  });

  it("10. Guest Profile command search routes into q search state", () => {
    assert.match(guestChromeCode, /searchPlaceholder="Search guest profile…"/);
    assert.match(guestChromeCode, /searchTestId="guest-command-search"/);
    assert.match(guestChromeCode, /GUEST_PROFILE_DIRECTORY_PATH/);
    assert.match(guestChromeCode, /q: value\.trim\(\) \|\| undefined/);
    assert.match(guestChromeCode, /initialSearch=\{directorySearch\?\.q \?\? ""\}/);
  });

  it("11. Create flow preserves PMS chrome", () => {
    // Individual, Group, Company, Travel Agent create routes render inside GuestProfileChrome
    // with membership and directorySearch passed
    assert.match(
      guestWorkspaceCode,
      /create === "individual"[\s\S]*?<GuestProfileChrome[^>]*membership=\{membership\}/,
    );
    assert.match(
      guestWorkspaceCode,
      /create === "group"[\s\S]*?<GuestProfileChrome[^>]*membership=\{membership\}/,
    );
    assert.match(
      guestWorkspaceCode,
      /create === "company"[\s\S]*?<GuestProfileChrome[^>]*membership=\{membership\}/,
    );
    assert.match(
      guestWorkspaceCode,
      /create === "travel-agent"[\s\S]*?<GuestProfileChrome[^>]*membership=\{membership\}/,
    );
  });

  it("12. Legacy Guest Profile URLs remain compatible", () => {
    assert.equal(GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED, true);
    assert.equal(domainFromSection("guests"), "individual");
    assert.equal(sectionFromDomain("individual"), "guests");
    assert.equal(sectionFromDomain("company"), "companies");
    assert.equal(sectionFromDomain("travel-agent"), "travel-agencies");
    assert.equal(sectionFromDomain("group"), "groups");

    const parsed = parseGuestProfileSearch({ q: "Smith", section: "companies" });
    assert.equal(parsed.q, "Smith");
    assert.equal(parsed.section, "companies");

    const serialized = guestProfileSearch({ q: "Smith", section: "companies" });
    assert.equal(serialized.q, "Smith");
    assert.equal(serialized.section, "companies");
  });
});
