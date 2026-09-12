import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FO_PRIMARY_TITLE, shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  CATALOGUE_EMPTY_HINT,
  COMPANIONS_UNAVAILABLE,
  NO_GUESTS_FOUND,
  RATE_IMPACT_UNAVAILABLE,
  beforeAfterFromHistory,
  canConfirmGuests,
  companionTypeFromDob,
  guestSearchEmpty,
  namedPartyExceeded,
  occupancyExceeded,
  rateImpact,
  servicePostsToFolio,
  stayGuestLine,
} from "./fo-amendments.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO-AMD1 companions attach/detach", () => {
  it("writes the junction on Confirm and writes nothing on Cancel", () => {
    const fns = readRel("./fo-amendments.functions.ts");
    const attach = fns.slice(fns.indexOf("export const attachStayCompanion"), fns.indexOf("export const detachStayCompanion"));
    const detach = fns.slice(fns.indexOf("export const detachStayCompanion"), fns.indexOf("export const addStayService"));
    assert.match(attach, /\.from\("fo_stay_companions"\)/);
    assert.match(attach, /\.insert\(/);
    assert.match(attach, /recordReservationEvent/);
    assert.match(attach, /companions:/);
    assert.match(attach, /namedPartyBlockMessage/);
    assert.doesNotMatch(attach, /guest_profiles[\s\S]{0,120}\.delete/);
    assert.match(detach, /\.from\("fo_stay_companions"\)/);
    assert.match(detach, /\.delete\(\)/);
    assert.match(detach, /recordReservationEvent/);
    assert.match(detach, /The primary guest cannot be detached/);
    assert.doesNotMatch(detach, /\.from\("guest_profiles"\)[\s\S]{0,200}\.delete/);

    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(sheet, /attachStayCompanion/);
    assert.match(sheet, /detachStayCompanion/);
    assert.match(sheet, /pendingAttach/);
    assert.match(sheet, /pendingDetach/);
    const shared = sheet.slice(sheet.indexOf("function FoAmendSheet"), sheet.indexOf("function ReasonField"));
    assert.match(shared, /onClick=\{\(\) => onOpenChange\(false\)\}/);
    assert.doesNotMatch(shared, /attachStayCompanion|detachStayCompanion|amendStayGuests|mutation\.mutate/);
    assert.doesNotMatch(sheet, /COMPANIONS_DEFERRED/);
    assert.doesNotMatch(sheet, /Coming soon/);
    assert.doesNotMatch(sheet, /supervisor override|capacity override/i);
  });

  it("blocks Confirm when counts or 1+companions exceed max occupancy", () => {
    assert.equal(occupancyExceeded(3, 0, 2), true);
    assert.equal(namedPartyExceeded(2, 2), true);
    assert.equal(namedPartyExceeded(1, 2), false);
    assert.equal(
      canConfirmGuests({
        adults: 3,
        children: 0,
        maxOccupancy: 2,
        reason: "Party grew",
        hasOccupancyChange: true,
      }),
      false,
    );
    assert.equal(
      canConfirmGuests({
        adults: 1,
        children: 0,
        maxOccupancy: 2,
        reason: "Add companion",
        companionCount: 0,
        pendingAttach: true,
      }),
      true,
    );
    assert.equal(
      canConfirmGuests({
        adults: 1,
        children: 0,
        maxOccupancy: 2,
        reason: "Add companion",
        companionCount: 2,
        pendingAttach: true,
      }),
      false,
    );
  });

  it("keeps empty guest search honest and never invents a type or name", () => {
    assert.equal(NO_GUESTS_FOUND, "No guests found");
    assert.equal(guestSearchEmpty({ search: "zzz", results: [] }), true);
    assert.equal(guestSearchEmpty({ search: "Ann", results: [{ id: "1" }] }), false);
    assert.equal(guestSearchEmpty({ search: "", results: [] }), false);
    assert.equal(companionTypeFromDob(null, "2026-09-12"), null);
    assert.equal(companionTypeFromDob("", "2026-09-12"), null);
    assert.equal(companionTypeFromDob("not-a-date", "2026-09-12"), null);
    assert.equal(stayGuestLine("Pat Lee", null), "Pat Lee");
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(sheet, /NO_GUESTS_FOUND/);
    assert.match(sheet, /listGuests/);
    assert.doesNotMatch(sheet, /typed name|notes-only|companionName/);
    assert.match(sheet, /stayGuestLine/);
  });
});

describe("FO-AMD1 catalogue-first Add Service", () => {
  it("picks from catalogue when items exist and falls back to the exact free-text hint", () => {
    assert.equal(CATALOGUE_EMPTY_HINT, "No catalogue items — enter a service manually.");
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(sheet, /pickFirst/);
    assert.match(sheet, /fo-service-catalogue/);
    assert.match(sheet, /CATALOGUE_EMPTY_HINT/);
    assert.match(sheet, /defaultAmount/);
    assert.match(sheet, /setAmount\(String\(item\.defaultAmount\)\)/);
    assert.match(sheet, /id="fo-service-amount"/);
    assert.doesNotMatch(sheet, /menu_items/);
    assert.doesNotMatch(sheet, /pos_products/);
    assert.doesNotMatch(sheet, /\bVoid\b/);

    const fns = readRel("./fo-amendments.functions.ts");
    assert.match(fns, /fo_service_catalogue/);
    assert.doesNotMatch(fns, /menu_items/);
    assert.doesNotMatch(fns, /pos_products/);
  });

  it("posts via Cashiering when amount > 0 and skips the folio post when amount is 0", () => {
    assert.equal(servicePostsToFolio(15), true);
    assert.equal(servicePostsToFolio(0), false);
    const fns = readRel("./fo-amendments.functions.ts");
    const addService = fns.slice(fns.indexOf("export const addStayService"));
    assert.match(addService, /servicePostsToFolio/);
    assert.match(addService, /open_folio_for_reservation/);
    assert.match(addService, /post_folio_transaction/);
    assert.match(addService, /_type: "charge"/);
    assert.match(addService, /_category: "manual"/);
    assert.ok(addService.indexOf("servicePostsToFolio") < addService.indexOf("post_folio_transaction"));
    assert.doesNotMatch(addService, /_type: "refund"/);
    assert.doesNotMatch(addService, /yield|reprice/i);
  });
});

describe("FO-AMD1 rate honesty", () => {
  it("marks rateImpact unavailable when no snapshot exists", () => {
    assert.deepEqual(rateImpact({ roomSubtotal: null, nightlyRates: [] }), {
      kind: "unavailable",
      label: RATE_IMPACT_UNAVAILABLE,
    });
    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(sheet, /rateImpact\(/);
    assert.match(sheet, /RATE_IMPACT_UNAVAILABLE/);
    assert.doesNotMatch(sheet, /yield|reprice/i);
  });
});

describe("FO-AMD1 surfaces and 0045 lock", () => {
  it("surfaces named companions on the Side Sheet and Amendments history", () => {
    const side = readRel("../components/frontoffice/reservation-side-sheet.tsx");
    assert.match(side, /fo-side-named-guests/);
    assert.match(side, /stayGuestLine/);
    assert.match(side, /companions/);
    assert.match(side, /PermissionDeniedPanel/);

    const history = readRel("../components/bookings/reservation-amendments.tsx");
    assert.match(history, /beforeAfterFromHistory/);
    const pairs = beforeAfterFromHistory(
      { companions: "Ada Lovelace", companion_count: 0 },
      { companions: "Ada Lovelace, Alan Turing", companion_count: 1 },
    );
    assert.ok(pairs.some((p) => p.label === "companions" && p.next.includes("Alan Turing")));
  });

  it("keeps FO-FS0 Room Rack + Calendar unchanged", () => {
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
  });

  it("adds 0045 in supabase only, with no seed and no SECURITY DEFINER RPC", () => {
    const migration = join(repoRoot, "supabase/migrations/0045_fo_amd1_companions_catalogue.sql");
    assert.equal(existsSync(migration), true);
    const sql = readFileSync(migration, "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.fo_stay_companions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.fo_service_catalogue/);
    assert.match(sql, /fo_stay_companions_reservation_same_property/);
    assert.match(sql, /fo_stay_companions_guest_same_property/);
    assert.match(sql, /UNIQUE \(reservation_id, guest_id\)/);
    assert.match(sql, /lower\(name\)/);
    assert.match(sql, /do not apply to live/i);
    assert.doesNotMatch(sql, /INSERT INTO public\.fo_service_catalogue/);
    assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION[\s\S]*SECURITY DEFINER/);
    assert.doesNotMatch(sql, /yield|reprice/i);
    assert.doesNotMatch(sql, /menu_items|pos_products/);
    assert.equal(existsSync(join(repoRoot, "drizzle/migrations/0045_fo_amd1_companions_catalogue.sql")), false);
    assert.equal(COMPANIONS_UNAVAILABLE.includes("0045"), true);
  });
});
