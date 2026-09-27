import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseGuestProfileSearch,
  guestProfileSearch,
  type GuestProfileSearch,
} from "./guest-profile-wave1";
import { guestSearchOrFilter, type GuestListSort, type LastStayPreset } from "./guests.functions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(relPath: string) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

describe("Phase 2 — Access Hardening Verification", () => {
  it("A1: getGuestWorkspaceAccess accepts only restaurantId and derives role server-side", () => {
    const accessFunctions = readRel("guest-workspace-access.functions.ts");
    assert.doesNotMatch(
      accessFunctions,
      /role:\s*roleSchema/,
      "Client-supplied role override must be removed from getGuestWorkspaceAccess schema",
    );
    assert.match(
      accessFunctions,
      /callerMembership\(context(\s*as\s*never)?,\s*data\.restaurantId\)/,
      "Role must be derived server-side from caller membership",
    );
  });

  it("A2: GuestProfileWorkspace enforces fail-closed create permissions", () => {
    const workspace = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(
      workspace,
      /const canCreate = accessQuery\.data\?\.canCreate === true && !isTypeInactive;/,
      "canCreate must strictly require accessQuery.data?.canCreate === true and not inactive",
    );
  });

  it("A3: GuestListingWorkspace and GuestDirectoryWorkspace respect fail-closed canCreate", () => {
    const listingWorkspace = readRel("../components/workspaces/guest-listing-workspace.tsx");
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(listingWorkspace, /canCreate=\{canCreate\}/);
    assert.match(dirWorkspace, /disabled=\{!canCreate\}/);
  });
});

describe("Phase 2 — Search & Filter Backend Read Model", () => {
  it("B1: guestSearchOrFilter constructs multi-token full-name clauses", () => {
    const filter = guestSearchOrFilter("John Doe");
    assert.ok(filter, "Filter must not be null for non-empty search");
    assert.match(filter, /first_name\.ilike\.%John%/);
    assert.match(filter, /last_name\.ilike\.%Doe%/);
    assert.match(filter, /and\(first_name\.ilike\.%John%,last_name\.ilike\.%Doe%\)/);
    assert.match(filter, /and\(first_name\.ilike\.%Doe%,last_name\.ilike\.%John%\)/);
  });

  it("B2: guestSearchOrFilter includes extraGuestIds in OR clause when provided", () => {
    const extraIds = [
      "c18f1a45-6677-4b72-8ee4-2a6231d6837e",
      "d28f1a45-6677-4b72-8ee4-2a6231d6837f",
    ];
    const filter = guestSearchOrFilter("Res123", true, true, extraIds);
    assert.ok(filter);
    assert.match(
      filter,
      /id\.in\.\(c18f1a45-6677-4b72-8ee4-2a6231d6837e,d28f1a45-6677-4b72-8ee4-2a6231d6837f\)/,
    );
  });

  it("B3: guestSearchOrFilter returns null for whitespace-only search without extra IDs", () => {
    const filter = guestSearchOrFilter("   ");
    assert.equal(filter, null);
  });

  it("B4: listGuests caps confirmation_number and account intermediate lookups to 50", () => {
    const guestsCode = readRel("guests.functions.ts");
    assert.match(
      guestsCode,
      /\.limit\(50\)/,
      "Intermediate lookups must be capped to prevent oversized filters",
    );
    assert.match(guestsCode, /confirmation_number/);
    assert.match(guestsCode, /guest_account_masters/);
    assert.match(guestsCode, /guest_account_links/);
  });

  it("B5: listGuests loads upcomingStayAt alongside lastStayAt", () => {
    const guestsCode = readRel("guests.functions.ts");
    assert.match(guestsCode, /loadStayDatesMap/);
    assert.match(guestsCode, /upcomingStayMap/);
    assert.match(guestsCode, /upcomingStayAt/);
  });
});

describe("Phase 2 — URL State & Search Contract Expansion", () => {
  it("C1: parseGuestProfileSearch extracts all directory filter params", () => {
    const parsed = parseGuestProfileSearch({
      q: "Jane",
      status: "active",
      vip: "vip",
      lastStay: "30d",
      nationality: "Japanese",
      sort: "last_stay_desc",
      page: "2",
      pageSize: "50",
      preview: "c18f1a45-6677-4b72-8ee4-2a6231d6837e",
    });

    assert.equal(parsed.q, "Jane");
    assert.equal(parsed.status, "active");
    assert.equal(parsed.vip, "vip");
    assert.equal(parsed.lastStay, "30d");
    assert.equal(parsed.nationality, "Japanese");
    assert.equal(parsed.sort, "last_stay_desc");
    assert.equal(parsed.page, 2);
    assert.equal(parsed.pageSize, 50);
    assert.equal(parsed.preview, "c18f1a45-6677-4b72-8ee4-2a6231d6837e");
  });

  it("C2: parseGuestProfileSearch handles defaults and invalid values cleanly", () => {
    const parsed = parseGuestProfileSearch({
      page: "invalid",
      pageSize: "999",
      vip: "unknown",
      status: "unknown",
    });

    assert.equal(parsed.page, undefined);
    assert.equal(parsed.pageSize, undefined);
    assert.equal(parsed.vip, undefined);
    assert.equal(parsed.status, undefined);
  });

  it("C3: guestProfileSearch serializes filter and preview params while preserving canonical section", () => {
    const searchObj = guestProfileSearch({
      section: "companies",
      type: "company",
      q: "Alexander",
      status: "active",
      vip: "vip",
      page: 1,
      preview: "c18f1a45-6677-4b72-8ee4-2a6231d6837e",
    });

    assert.equal(searchObj.section, "companies");
    assert.equal(searchObj.type, "company");
    assert.equal(searchObj.q, "Alexander");
    assert.equal(searchObj.status, "active");
    assert.equal(searchObj.vip, "vip");
    assert.equal(searchObj.page, 1);
    assert.equal(searchObj.preview, "c18f1a45-6677-4b72-8ee4-2a6231d6837e");
  });

  it("C4: guestProfileSearch omits default page (0) and default pageSize (25) to keep URLs clean", () => {
    const searchObj = guestProfileSearch({
      page: 0,
      pageSize: 25,
    });

    assert.equal(searchObj.page, undefined);
    assert.equal(searchObj.pageSize, undefined);
  });
});

describe("Phase 2 — Truthful UI & Density Polish", () => {
  it("D1: Truthful search placeholder matches implemented server-side capabilities", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(
      dirWorkspace,
      /placeholder="Search name, phone, email, profile, document, reservation or company\.\.\."/,
      "Placeholder must reflect real search capabilities including reservation and company lookups",
    );
  });

  it("D2: Prohibits 'More Filters' button unless actual filters are behind it", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.doesNotMatch(
      dirWorkspace,
      /More Filters/i,
      "Phase 2 must not display an unbacked 'More Filters' button",
    );
  });

  it("D3: Renders 4-KPI directory summary as a compact band, not large cards", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(
      dirWorkspace,
      /data-testid="guest-directory-summary-band"/,
      "Must render compact summary band with testid",
    );
    assert.match(dirWorkspace, /Total Guests/);
    assert.match(dirWorkspace, /Active Guests/);
    assert.match(dirWorkspace, /VIP Guests/);
    assert.match(dirWorkspace, /Returning Guests/);
  });

  it("D4: Preserves all static invariants required by existing wave tests", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /data-testid="guest-listing-table"/);
    assert.match(dirWorkspace, /data-testid="guest-listing-search"/);
    assert.match(dirWorkspace, /displayProfileNumber/);
    assert.match(dirWorkspace, /GuestListingNewGuestMenu/);
    assert.match(dirWorkspace, /GuestFormDialog/);
    assert.match(dirWorkspace, /GuestMergeDialog/);
    assert.match(dirWorkspace, /onOpenExisting=\{openGuest\}/);
    assert.match(dirWorkspace, /guestProfileSearch\(\{ card: returnCard, type: "individual" \}\)/);
  });
});

describe("Phase 2 — Guest Quick View Drawer", () => {
  it("E1: Quick View drawer uses Sheet and contains required sections", () => {
    const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(drawer, /data-testid="guest-quick-view-drawer"/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Preferences/);
    assert.match(drawer, /Identity/);
    assert.match(drawer, /Relations/);
  });

  it("E2: Quick View drawer renders stay snapshot and VIP badge", () => {
    const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(drawer, /Last Stay/);
    assert.match(drawer, /Upcoming/);
    assert.match(drawer, /Total Stays/);
    assert.match(drawer, /Total Nights/);
    assert.match(drawer, /VIP/);
  });

  it("E3: Quick View drawer wires New Reservation to real route contract", () => {
    const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(
      drawer,
      /to:\s*"\/restaurant\/bookings\/new"/,
      "New Reservation must navigate to /restaurant/bookings/new",
    );
    assert.match(
      drawer,
      /search:\s*\{\s*guestId:\s*previewId\s*\}/,
      "New Reservation must supply guestId in search params",
    );
  });

  it("E4: Quick View drawer wires Open Full Profile to GUEST_PROFILE_DETAIL_PATH", () => {
    const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(drawer, /GUEST_PROFILE_DETAIL_PATH/);
    assert.match(drawer, /params:\s*\{\s*guestId:\s*previewId\s*\}/);
  });

  it("E5: Closing Quick View preserves search/filter/page state", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(
      dirWorkspace,
      /updateDirectoryUrl\(\{\s*preview:\s*undefined\s*\}\)/,
      "Closing drawer must remove only preview param without wiping q/status/vip/page",
    );
  });

  it("E6: Row click triggers Quick View preview, explicit action opens full profile", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /onClick=\{\(\) => handleOpenQuickView\(g\.id\)\}/);
    assert.match(dirWorkspace, /onSelect=\{\(\) => openGuest\(g\.id\)\}/);
  });
});

describe("Phase 2 — Filter, Sort & Interaction Mechanics", () => {
  it("F1: Sort options include last updated, name, status, and last stay", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /value="updated_at"/);
    assert.match(dirWorkspace, /value="name"/);
    assert.match(dirWorkspace, /value="status"/);
    assert.match(dirWorkspace, /value="last_stay"/);
  });

  it("F2: Last stay preset filters cover all, never, 30d, 90d, 1y", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /LAST_STAY_PRESETS/);
    assert.match(dirWorkspace, /LAST_STAY_PRESET_LABELS/);
  });

  it("F3: Active filter chips render with testid and dismiss handlers", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /data-testid="guest-filter-chips"/);
    assert.match(dirWorkspace, /activeChips\.map/);
    assert.match(dirWorkspace, /onRemove/);
  });

  it("F4: Clear all filters resets query and URL parameters", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /data-testid="guest-clear-all-filters"/);
    assert.match(dirWorkspace, /handleClearAllFilters/);
  });

  it("F5: Pagination supports 25 and 50 page sizes", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /LISTING_PAGE_SIZES/);
    assert.match(dirWorkspace, /per page/);
  });

  it("F6: Nationality dropdown dynamically populates from available guests", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /data-testid="guest-nationality-filter"/);
    assert.match(dirWorkspace, /nationalities\.map/);
  });

  it("F7: Search input has clear button when non-empty", () => {
    const dirWorkspace = readRel("../components/workspaces/guest-directory-workspace.tsx");
    assert.match(dirWorkspace, /aria-label="Clear search"/);
    assert.match(dirWorkspace, /onClick=\{\(\) => setSearch\(""\)\}/);
  });

  it("F8: Quick View tabs include Overview, Preferences, Identity, and Relations", () => {
    const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");
    assert.match(drawer, /id:\s*"overview",\s*label:\s*"Overview"/);
    assert.match(drawer, /id:\s*"preferences",\s*label:\s*"Preferences"/);
    assert.match(drawer, /id:\s*"identity",\s*label:\s*"Identity"/);
    assert.match(drawer, /id:\s*"relations",\s*label:\s*"Relations"/);
    assert.match(drawer, /guest-quick-view-tab-/);
  });
});
