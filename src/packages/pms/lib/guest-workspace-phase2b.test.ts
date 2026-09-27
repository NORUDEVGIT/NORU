import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(relPath: string) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

describe("Phase 2B — Quick View Identity Fix & Query Isolation", () => {
  const drawer = readRel("../components/guests/guest-quick-view-drawer.tsx");

  it("1. Quick View Identity extracts documents array from listGuestDocuments response", () => {
    assert.match(
      drawer,
      /const docs = docsQuery\.data\?\.documents \?\? \[\];/,
      "Must correctly unwrap { available, documents } from listGuestDocuments",
    );
  });

  it("2. Identity renders truthful empty state without generic 'Try again'", () => {
    assert.match(drawer, /guest-quick-view-identity-empty/);
    assert.match(drawer, /No identity document recorded\./);
    assert.match(drawer, /Add Identity Document/);
  });

  it("3. Identity query failure is isolated and does not crash Overview or other tabs", () => {
    assert.match(drawer, /guest-quick-view-identity-error/);
    assert.match(drawer, /Identity information couldn't be loaded\./);
    assert.match(drawer, /Identity status unavailable/);
  });

  it("4. Identity retry state invokes docsQuery.refetch()", () => {
    assert.match(drawer, /guest-quick-view-identity-retry/);
    assert.match(drawer, /docsQuery\.refetch\(\)/);
  });

  it("5. Inactive document type still renders existing historical records with Inactive badge", () => {
    assert.match(drawer, /!doc\.typeActive/);
    assert.match(drawer, /Inactive/);
  });

  it("6. Sensitive document numbers remain masked and no raw scan image URLs are exposed", () => {
    assert.match(drawer, /doc\.documentNumberMasked/);
    assert.doesNotMatch(drawer, /doc\.documentNumber\b/);
    assert.doesNotMatch(drawer, /doc\.url/);
  });

  it("24. Secondary query errors (stays, links, docs) are independently isolated", () => {
    assert.match(drawer, /linksQuery\.isError/);
    assert.match(drawer, /Relationships unavailable/);
    assert.match(drawer, /Unable to load relationship links/);
  });

  it("23. Drawer footer preserves clear action hierarchy", () => {
    assert.match(drawer, /guest-quick-view-open-full/);
    assert.match(drawer, /guest-quick-view-new-res/);
    assert.match(drawer, /guest-quick-view-edit/);
    // Primary has solid dark background, secondary has outline
    assert.match(drawer, /bg-\[#251605\] font-semibold text-white/);
  });
});

describe("Phase 2B — Professional Action System & Legacy Cleanup", () => {
  const workspace = readRel("../components/workspaces/guest-profile-workspace.tsx");
  const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");

  it("7. Active section primary action is context-aware in header", () => {
    assert.match(workspace, /activeCreateTitle/);
    assert.match(workspace, /data-testid="guest-header-actions"/);
    assert.match(workspace, /data-testid="guest-create-action-btn"/);
  });

  it("8-11. Contextual creation labels: Guests → New Guest, Companies → New Company, Travel Agencies → New Agency, Groups → New Group", () => {
    assert.match(workspace, /sectionDef\.domain === "individual"\s*\?\s*"New Guest"/);
    assert.match(workspace, /sectionDef\.domain === "travel-agent"\s*\?\s*"New Agency"/);
  });

  it("12. Profile creation remains fail-closed based on GuestWorkspaceAccess and Setup config", () => {
    assert.match(workspace, /const canCreateDomain =/);
    assert.match(workspace, /accessQuery\.data\?\.canCreate !== true/);
    assert.match(workspace, /disabled=\{!canCreate\}/);
  });

  it("13. Unsupported domains (Tour Operator, Contact Person, Organization) are absent from create menu", () => {
    const dropdownIndex = workspace.indexOf('data-testid="guest-create-dropdown-trigger"');
    const dropdownSection = workspace.slice(dropdownIndex, dropdownIndex + 1500);
    assert.doesNotMatch(dropdownSection, /Tour Operator/i);
    assert.doesNotMatch(dropdownSection, /Contact Person/i);
    assert.doesNotMatch(dropdownSection, /Organization/i);
  });

  it("14. Legacy large Quick Actions card is removed from directory workspace", () => {
    assert.doesNotMatch(listing, /<h2[^>]*>Quick Actions<\/h2>/);
    assert.doesNotMatch(listing, /grid gap-4 md:grid-cols-2/);
  });

  it("15. Supported actions remain available through persistent header and menus", () => {
    assert.match(listing, /data-testid="guest-quick-actions"/);
    assert.match(workspace, /data-testid="guest-header-actions"/);
  });

  it("16. Group template actions only appear in Group context", () => {
    assert.match(listing, /section === "groups" && canCreateGroup/);
    assert.match(workspace, /activeSection === "groups"/);
    assert.match(workspace, /group-tools-menu/);
  });
});

describe("Phase 2B — Profile Portfolio & Directory KPI Distinct Separation", () => {
  const listing = readRel("../components/workspaces/guest-listing-workspace.tsx");
  const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");

  it("17. Profile Portfolio shows the four operational domains", () => {
    assert.match(listing, /data-testid="guest-workspace-stats"/);
    assert.match(listing, /Profile Portfolio/);
    assert.match(listing, />Guests<\/span>/);
    assert.match(listing, />Companies<\/span>/);
    assert.match(listing, />Travel Agencies<\/span>/);
    assert.match(listing, />Groups<\/span>/);
  });

  it("18. Portfolio counts come from real read model", () => {
    assert.match(listing, /stats\?\.individuals \?\? 0/);
    assert.match(listing, /stats\?\.companies \?\? 0/);
    assert.match(listing, /stats\?\.travelAgents \?\? 0/);
    assert.match(listing, /stats\?\.groups \?\? 0/);
  });

  it("19. Portfolio navigation uses canonical section URLs", () => {
    assert.match(listing, /selectSection\("guests"\)/);
    assert.match(listing, /selectSection\("companies"\)/);
    assert.match(listing, /selectSection\("travel-agencies"\)/);
    assert.match(listing, /selectSection\("groups"\)/);
  });

  it("20. Old Tour Operator and Contact counts are not promoted as primary portfolio domains", () => {
    const portfolioIndex = listing.indexOf('data-testid="guest-workspace-stats"');
    const portfolioEnd = listing.indexOf("</div>", portfolioIndex + 600);
    const portfolioSnippet = listing.slice(portfolioIndex, portfolioEnd);
    assert.doesNotMatch(portfolioSnippet, />Tour Operators<\/span>/);
    assert.doesNotMatch(portfolioSnippet, />Contacts<\/span>/);
  });

  it("21. Guest directory summary band remains intact with 4 operational KPIs", () => {
    assert.match(directory, /guest-directory-summary-band/);
    assert.match(directory, /Total Guests/);
    assert.match(directory, /Active Guests/);
    assert.match(directory, /VIP Guests/);
    assert.match(directory, /Returning Guests/);
  });

  it("22. No duplicate Total Guests KPI presentation in directory", () => {
    // Directory summary band tracks Individual Guest operational metrics
    // Profile Portfolio tracks cross-domain master counts
    assert.match(directory, /guest-directory-summary-band/);
    assert.match(listing, /data-testid="guest-workspace-stats"/);
    assert.doesNotMatch(listing, /<h2[^>]*>Guest Statistics<\/h2>/);
  });
});
