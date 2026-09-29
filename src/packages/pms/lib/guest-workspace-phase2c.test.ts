import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_WORKSPACE_SECTIONS,
  domainFromSection,
  sectionFromDomain,
} from "./guest-profile-domains";
import { guestProfileSearch, parseGuestProfileSearch } from "./guest-profile-wave1";
import { guestListingSection } from "./guest-profile-listing";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), "utf8");
}

describe("Phase 2C — Unified Navigation & Single-Shell Architecture", () => {
  const chrome = readRel("../components/guests/guest-profile-chrome.tsx");
  const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
  const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
  const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");

  it("1. Only one module heading is rendered", () => {
    // GuestProfileChrome owns the module title
    assert.match(chrome, /<h1[^>]*>\s*Guest Profiles\s*<\/h1>/);
    // GuestListingWorkspace must NOT render duplicate module heading
    assert.doesNotMatch(listing, /<h1[^>]*>\s*Guest Profile\s*<\/h1>/);
    assert.doesNotMatch(listing, /Search, manage and open guest profiles for/);
  });

  it("2. Only one primary domain nav exists", () => {
    // GuestProfileChrome renders the primary navigation row
    assert.match(chrome, /aria-label="Guest Profile domains"/);
    assert.match(chrome, /role="tablist"/);
    // GuestListingWorkspace does NOT render a primary navigation row
    assert.doesNotMatch(listing, /role="tablist"/);
    assert.doesNotMatch(listing, /aria-label="Profile section"/);
  });

  it("3. Legacy guest-listing-nav is not rendered on live workspace", () => {
    assert.doesNotMatch(listing, /data-testid="guest-listing-nav"/);
    assert.doesNotMatch(listing, /guest-listing-nav/);
  });

  it("4. Tour Operators not present in primary nav", () => {
    const primaryNavDomains = GUEST_WORKSPACE_SECTIONS.map((s) => s.id);
    assert.equal(primaryNavDomains.includes("tour-operators" as never), false);
    assert.equal(primaryNavDomains.includes("tour-operator" as never), false);

    const chromeNavIndex = chrome.indexOf('aria-label="Guest Profile domains"');
    const chromeNavSection = chrome.slice(chromeNavIndex, chromeNavIndex + 1500);
    assert.doesNotMatch(chromeNavSection, /Tour Operator/i);
  });

  it("5. Contacts not present in primary nav", () => {
    const primaryNavDomains = GUEST_WORKSPACE_SECTIONS.map((s) => s.id);
    assert.equal(primaryNavDomains.includes("contacts" as never), false);
    assert.equal(primaryNavDomains.includes("contact" as never), false);

    const chromeNavIndex = chrome.indexOf('aria-label="Guest Profile domains"');
    const chromeNavSection = chrome.slice(chromeNavIndex, chromeNavIndex + 1500);
    assert.doesNotMatch(chromeNavSection, /Contacts/i);
  });

  it("6. Guests section routes correctly", () => {
    const search = guestProfileSearch({ section: "guests", type: "individual" });
    assert.equal(search.section, undefined); // 'guests' is canonical default, omits redundant param
    assert.equal(search.type, undefined); // 'individual' is default

    const parsed = parseGuestProfileSearch({ section: "guests" });
    assert.equal(parsed.section, "guests");
    assert.equal(domainFromSection("guests"), "individual");
  });

  it("7. Companies section routes correctly", () => {
    const search = guestProfileSearch({ section: "companies", type: "company" });
    assert.equal(search.section, "companies");
    assert.equal(search.type, "company");

    const parsed = parseGuestProfileSearch({ section: "companies" });
    assert.equal(parsed.section, "companies");
    assert.equal(domainFromSection("companies"), "company");
  });

  it("8. Travel Agencies section routes correctly", () => {
    const search = guestProfileSearch({ section: "travel-agencies", type: "travel-agent" });
    assert.equal(search.section, "travel-agencies");
    assert.equal(search.type, "travel-agent");

    const parsed = parseGuestProfileSearch({ section: "travel-agencies" });
    assert.equal(parsed.section, "travel-agencies");
    assert.equal(domainFromSection("travel-agencies"), "travel-agent");
  });

  it("9. Groups section routes correctly", () => {
    const search = guestProfileSearch({ section: "groups", type: "group" });
    assert.equal(search.section, "groups");
    assert.equal(search.type, "group");

    const parsed = parseGuestProfileSearch({ section: "groups" });
    assert.equal(parsed.section, "groups");
    assert.equal(domainFromSection("groups"), "group");
  });

  it("10. Only one primary create action exists", () => {
    // Header in GuestProfileChrome has the primary create action
    assert.match(shell, /data-testid="guest-header-actions"/);
    assert.match(shell, /data-testid="guest-create-action-btn"/);
    assert.match(shell, /data-testid="guest-create-dropdown-trigger"/);

    // GuestListingWorkspace does NOT render duplicate create menus or actions
    assert.doesNotMatch(listing, /GuestListingNewGuestMenu/);
    assert.doesNotMatch(listing, /data-testid="guest-create-action-btn"/);
  });

  it("11. Active section changes primary create label", () => {
    assert.match(shell, /sectionDef\.domain === "individual"\s*\?\s*"New Guest"/);
    assert.match(shell, /sectionDef\.domain === "company"\s*\?\s*"New Company"/);
    assert.match(shell, /sectionDef\.domain === "travel-agent"\s*\?\s*"New Travel Agency"/);
    assert.match(shell, /"New Group"/);
  });

  it("12. Profile Portfolio remains visible", () => {
    assert.match(listing, /data-testid="guest-workspace-stats"/);
    assert.match(listing, /Profile Portfolio/);
    assert.match(listing, /Total Profiles/);
    assert.match(listing, /selectSection\("guests"\)/);
    assert.match(listing, /selectSection\("companies"\)/);
    assert.match(listing, /selectSection\("travel-agencies"\)/);
    assert.match(listing, /selectSection\("groups"\)/);
  });

  it("13. Guest directory KPI band remains visible", () => {
    assert.match(directory, /data-testid="guest-directory-summary-band"/);
    assert.match(directory, /Total Guests/);
    assert.match(directory, /Active Guests/);
    assert.match(directory, /VIP Guests/);
    assert.match(directory, /Returning Guests/);
  });

  it("14. Quick View behavior unchanged", () => {
    const quickView = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(directory, /GuestQuickViewDrawer/);
    assert.match(directory, /previewId=\{previewId\}/);
    assert.match(quickView, /guest-quick-view-drawer/);
    assert.match(quickView, /id:\s*"overview",\s*label:\s*"Overview"/);
    assert.match(quickView, /id:\s*"preferences",\s*label:\s*"Preferences"/);
    assert.match(quickView, /id:\s*"identity",\s*label:\s*"Identity"/);
    assert.match(quickView, /id:\s*"relations",\s*label:\s*"Relations"/);
  });

  it("15. Legacy URLs remain compatible", () => {
    // Legacy ?type= param compatibility via guestListingSection
    assert.equal(guestListingSection("individual"), "individual");
    assert.equal(guestListingSection("company"), "company");
    assert.equal(guestListingSection("travel-agent"), "travel-agent");
    assert.equal(guestListingSection("group"), "group");
    assert.equal(guestListingSection("tour-operator" as never), "tour-operator");
    assert.equal(guestListingSection("contact" as never), "contact");

    // Section mapping from domain
    assert.equal(sectionFromDomain("individual"), "guests");
    assert.equal(sectionFromDomain("company"), "companies");
    assert.equal(sectionFromDomain("travel-agent"), "travel-agencies");
    assert.equal(sectionFromDomain("group"), "groups");

    // PlaceholderCard in GuestListingWorkspace preserves degraded legacy view
    assert.match(listing, /section === "tour-operator"/);
    assert.match(listing, /section === "contact"/);
    assert.match(listing, /TOUR_OPERATOR_UNAVAILABLE/);
    assert.match(listing, /CONTACT_PROFILE_UNAVAILABLE/);
  });
});
