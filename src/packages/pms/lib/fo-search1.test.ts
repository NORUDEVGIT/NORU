import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FO_NAV_ITEMS, FO_PRIMARY_TITLE, shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  FO_SEARCH_ACTION_LABELS,
  FO_SEARCH_MATCH_LABELS,
  NO_STAYS_FOUND,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SEARCH_RESULT_CAP,
  capSearchResults,
  companyGroupSoftLine,
  contributingMatchChips,
  isCompanyGroupColumnMissing,
  isSearchCancelEligible,
  isSearchCheckInEligible,
  isSearchCheckOutEligible,
  isSearchRackEligible,
  isSearchReady,
  searchActionsForStay,
  searchEmpty,
  showingFirstResultsFooter,
  trimCompanyGroupName,
  type FoSearchStayInput,
} from "./fo-search1.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function stay(overrides: Partial<FoSearchStayInput> = {}): FoSearchStayInput {
  return {
    guestName: "Ada Lovelace",
    confirmationNumber: "NORU-1001",
    roomNumber: "101",
    guestPhone: "+44 7700 900123",
    guestEmail: "ada@example.com",
    companyName: null,
    groupName: null,
    source: "staff",
    status: "confirmed",
    roomId: "room-1",
    ...overrides,
  };
}

describe("FO-SEARCH1 match chips", () => {
  it("emits Company/Group chips only when the column has matching data", () => {
    assert.deepEqual(contributingMatchChips(stay({ companyName: "Acme Hotels" }), "acme"), ["company"]);
    assert.deepEqual(contributingMatchChips(stay({ groupName: "Wedding party" }), "wedding"), ["group"]);
    assert.deepEqual(contributingMatchChips(stay({ companyName: "  " }), "acme"), []);
    assert.deepEqual(contributingMatchChips(stay({ groupName: "" }), "wedding"), []);
    assert.deepEqual(contributingMatchChips(stay({ companyName: "Acme Hotels" }), "acme", false), []);
    assert.equal(FO_SEARCH_MATCH_LABELS.company, "Company");
    assert.equal(FO_SEARCH_MATCH_LABELS.group, "Group");
  });

  it("never invents Company/Group chips from source group/corporate", () => {
    assert.deepEqual(
      contributingMatchChips(stay({ source: "group", companyName: null, groupName: null }), "group"),
      [],
    );
    assert.deepEqual(
      contributingMatchChips(stay({ source: "corporate", companyName: null, groupName: null }), "corporate"),
      [],
    );
    assert.deepEqual(
      contributingMatchChips(stay({ source: "CORPORATE", companyName: null, groupName: null }), "corp"),
      [],
    );
    const src = readRel("./fo-search1.ts");
    assert.match(src, /source is ignored|Never invents Company\/Group from/i);
    assert.doesNotMatch(src, /sourceIsGroup|sourceIsCorporate/);
    const fns = readRel("./fo-search1.functions.ts");
    assert.doesNotMatch(fns, /sourceIsGroup|sourceIsCorporate/);
    assert.match(fns, /company_name|group_name/);
  });

  it("labels only the fields that contributed and never empty company/group chips", () => {
    assert.deepEqual(contributingMatchChips(stay({ guestEmail: "pat@hotel.test" }), "ada"), ["guest"]);
    assert.deepEqual(contributingMatchChips(stay(), "noru-1001"), ["confirmation"]);
    assert.deepEqual(contributingMatchChips(stay({ confirmationNumber: "NORU-AB12" }), "101"), ["room"]);
    assert.deepEqual(contributingMatchChips(stay(), "7700"), ["phone"]);
    assert.deepEqual(contributingMatchChips(stay({ guestName: "Pat Lee" }), "ada@example"), ["email"]);
    const both = contributingMatchChips(
      stay({ companyName: "Acme", groupName: "Acme group" }),
      "acme",
    );
    assert.deepEqual(both, ["company", "group"]);
    assert.deepEqual(companyGroupSoftLine(stay({ companyName: "Acme", groupName: "Wedding" }), ["company"]), {
      company: "Acme",
      group: null,
    });
    assert.deepEqual(companyGroupSoftLine(stay({ companyName: "  ", groupName: "Wedding" }), ["company", "group"]), {
      company: null,
      group: "Wedding",
    });
    assert.equal(trimCompanyGroupName("  Acme  "), "Acme");
    assert.equal(trimCompanyGroupName("   "), null);
  });
});

describe("FO-SEARCH1 Live action gates", () => {
  it("hides Check-in / Checkout / Cancel when the stay status is invalid", () => {
    assert.equal(isSearchCheckInEligible("pending"), true);
    assert.equal(isSearchCheckInEligible("confirmed"), true);
    assert.equal(isSearchCheckInEligible("checked_in"), false);
    assert.equal(isSearchCheckInEligible("checked_out"), false);
    assert.equal(isSearchCheckInEligible("cancelled"), false);
    assert.equal(isSearchCheckInEligible("no_show"), false);

    assert.equal(isSearchCheckOutEligible("checked_in"), true);
    assert.equal(isSearchCheckOutEligible("confirmed"), false);
    assert.equal(isSearchCheckOutEligible("pending"), false);

    assert.equal(isSearchCancelEligible("pending"), true);
    assert.equal(isSearchCancelEligible("confirmed"), true);
    assert.equal(isSearchCancelEligible("checked_in"), false);
    assert.equal(isSearchCancelEligible("cancelled"), false);

    assert.deepEqual(searchActionsForStay({ status: "checked_out", roomId: null }), ["open_stay"]);
    assert.deepEqual(searchActionsForStay({ status: "no_show", roomId: null }), ["open_stay"]);
    assert.ok(!searchActionsForStay({ status: "checked_in", roomId: "r1" }).includes("check_in"));
    assert.ok(!searchActionsForStay({ status: "checked_in", roomId: "r1" }).includes("cancel"));
    assert.ok(searchActionsForStay({ status: "checked_in", roomId: "r1" }).includes("check_out"));
    assert.ok(searchActionsForStay({ status: "pending", roomId: null }).includes("check_in"));
    assert.ok(searchActionsForStay({ status: "pending", roomId: null }).includes("cancel"));
    assert.ok(!searchActionsForStay({ status: "pending", roomId: null }).includes("check_out"));
    assert.ok(!searchActionsForStay({ status: "pending", roomId: null }).includes("show_on_rack"));
    assert.equal(isSearchRackEligible({ status: "confirmed", roomId: "r1" }), true);
    assert.equal(isSearchRackEligible({ status: "confirmed", roomId: null }), false);
    assert.equal(isSearchRackEligible({ status: "checked_in", roomId: null }), true);
    assert.equal(FO_SEARCH_ACTION_LABELS.check_out, "Checkout");
    assert.equal(FO_SEARCH_ACTION_LABELS.show_on_rack, "Show on Room Rack");
  });
});

describe("FO-SEARCH1 empty, cap and chrome", () => {
  it("empty ready search is No stays found", () => {
    assert.equal(NO_STAYS_FOUND, "No stays found");
    assert.equal(searchEmpty({ term: "zz", results: [] }), true);
    assert.equal(searchEmpty({ term: "zz", results: [{ id: "1" }] }), false);
    assert.equal(searchEmpty({ term: "z", results: [] }), false);
    assert.equal(isSearchReady("a"), false);
    assert.equal(isSearchReady("ab"), true);
    assert.equal(SEARCH_MIN_CHARS, 2);
    assert.equal(SEARCH_DEBOUNCE_MS, 300);
  });

  it("caps at 25 and shows Showing first N results", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => i);
    const capped = capSearchResults(thirty);
    assert.equal(SEARCH_RESULT_CAP, 25);
    assert.equal(capped.rows.length, 25);
    assert.equal(capped.truncated, true);
    assert.equal(capped.footer, "Showing first 25 results");
    assert.equal(showingFirstResultsFooter(25), "Showing first 25 results");
    const ten = capSearchResults(Array.from({ length: 10 }, (_, i) => i));
    assert.equal(ten.truncated, false);
    assert.equal(ten.footer, null);
  });

  it("keeps FO-FS0 Room Rack + Calendar and does not add a Search nav item", () => {
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    assert.equal(FO_NAV_ITEMS.length, 9);
    assert.equal(
      FO_NAV_ITEMS.some((item) => /search/i.test(item.id) || /search/i.test(item.label)),
      false,
    );

    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.match(chrome, /onGuestSearch/);
    assert.match(chrome, /Guest search/);
    assert.doesNotMatch(chrome, /fo-nav-search/);

    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /GuestSearchDialog/);
    assert.match(workspace, /FoCancelStepper/);
    assert.match(workspace, /onOpenStay/);
    assert.doesNotMatch(workspace, /void stays|FO Void/i);
  });
});

describe("FO-SEARCH1 surfaces, 0046 lock and missing columns", () => {
  it("upgrades the existing Guest search dialog to typed stay search", () => {
    const frames = readRel("../components/frontoffice/front-office-frames.tsx");
    assert.match(frames, /searchFrontOfficeStays/);
    assert.match(frames, /NO_STAYS_FOUND/);
    assert.match(frames, /SEARCH_DEBOUNCE_MS/);
    assert.match(frames, /fo-global-search/);
    assert.match(frames, /PermissionDeniedPanel/);
    assert.match(frames, /Open stay/);
    assert.match(frames, /Show on Room Rack/);
    assert.match(frames, /FoCancelStepper|onCancel/);
    assert.doesNotMatch(frames, /ComingSoonPanel/);
    assert.doesNotMatch(frames, /listGuests/);
    assert.doesNotMatch(frames, /sourceIsGroup|sourceIsCorporate/);
    assert.match(frames, /en-GB|formatStayDate/);
  });

  it("treats missing 0046 columns as omit-chips, not Coming soon", () => {
    assert.equal(
      isCompanyGroupColumnMissing({
        message: "Could not find the 'company_name' column of 'hotel_reservations' in the schema cache",
      }),
      true,
    );
    assert.equal(
      isCompanyGroupColumnMissing({
        message: "column hotel_reservations.group_name does not exist",
      }),
      true,
    );
    assert.equal(isCompanyGroupColumnMissing({ message: "permission denied for table hotel_reservations" }), false);
    const fns = readRel("./fo-search1.functions.ts");
    assert.match(fns, /isCompanyGroupColumnMissing/);
    assert.match(fns, /companyGroupAvailable/);
    assert.doesNotMatch(fns, /Coming soon/);
    assert.doesNotMatch(fns, /SECURITY DEFINER/);
    assert.doesNotMatch(fns, /apply_migration/);
  });

  it("adds 0046 in supabase only — thin columns, no seed, no live apply", () => {
    const migration = join(repoRoot, "supabase/migrations/0046_fo_search1_company_group.sql");
    assert.equal(existsSync(migration), true);
    const sql = readFileSync(migration, "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS company_name text/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS group_name text/);
    assert.match(sql, /do not apply to live/i);
    assert.doesNotMatch(sql, /INSERT INTO/);
    assert.doesNotMatch(sql, /CHECK[\s\S]*source/);
    assert.doesNotMatch(sql, /CREATE TABLE/);
    assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION/);
    assert.doesNotMatch(sql, /SECURITY DEFINER/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /yield|reprice|void/i);
    assert.equal(existsSync(join(repoRoot, "drizzle/migrations/0046_fo_search1_company_group.sql")), false);
  });
});
