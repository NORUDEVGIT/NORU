import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  SET1_HUB_HREF,
  isSet1SectionHash,
  propertySetupRedirectHref,
} from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD4_HASH,
  CARD4_HREF,
  CARD4_STEPS,
  CARD4_TITLE,
  evaluateCard4StepStatus,
  isCard4WorkspaceHash,
  nextCard4Step,
  resolveCard4Hash,
} from "./pms-property-setup-card4.ts";

const lib = readFileSync(new URL("./pms-property-setup-card4.ts", import.meta.url), "utf8");
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card4-section.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const wave1 = readFileSync(new URL("./guest-profile-wave1.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 4 Phase 1 shell", () => {
  it("promotes Guest & Services with guest-services hash and five Guest Profile Rules steps", () => {
    assert.equal(CARD4_TITLE, "Guest & Services");
    assert.equal(CARD4_HASH, "guest-services");
    assert.equal(CARD4_HREF, `${SET1_HUB_HREF}#guest-services`);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.id, "housekeeping-maintenance");
    assert.equal(PROPERTY_SETUP_CARDS[3]?.title, CARD4_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[3]?.hash, CARD4_HASH);
    assert.equal(CARD4_STEPS.length, 5);
    assert.deepEqual(
      CARD4_STEPS.map((row) => [row.number, row.id, row.title]),
      [
        [1, "profile-types", "Profile Types"],
        [2, "required-fields", "Required Fields"],
        [3, "identity-documents", "Identity Documents"],
        [4, "preferences", "Preferences"],
        [5, "company-business", "Company & Business"],
      ],
    );
    assert.equal(
      CARD4_STEPS.some(
        (row) =>
          /matching|privacy|defaults/i.test(row.id) ||
          /matching|privacy|^defaults$/i.test(row.title),
      ),
      false,
    );
    assert.equal(nextCard4Step("profile-types"), "required-fields");
    assert.equal(evaluateCard4StepStatus("profile-types", undefined, true), "complete");
    assert.equal(evaluateCard4StepStatus("required-fields", undefined, true), "not_started");
  });

  it("opens from hub Configure and hides the package rail", () => {
    assert.equal(isCard4WorkspaceHash("#guest-services"), true);
    assert.equal(isCard4WorkspaceHash("#card-4"), true);
    assert.equal(isCard4WorkspaceHash("#card4"), true);
    assert.equal(isCard4WorkspaceHash("#guest-profile"), false);
    assert.equal(isCard4WorkspaceHash("#guest-services-types"), false);
    assert.equal(resolveCard4Hash("#card-4"), CARD4_HASH);
    assert.equal(isSet1SectionHash("#guest-services"), false);
    assert.equal(propertySetupRedirectHref("#card-4"), `${SET1_HUB_HREF}#guest-services`);
    assert.match(hub, /PmsPropertySetupCard4Section/);
    assert.match(hub, /CARD4_HASH/);
    assert.match(settings, /isCard4WorkspaceHash/);
    assert.match(settings, /hidePackageRail=\{workspaceOpen\}/);
    assert.match(section, /Save & Next/);
    assert.match(lib, /later phase/);
    assert.match(section, /cardStatusLabel=\{propertySetupStatusLabel\(cardStatus\)\}/);
    assert.doesNotMatch(section, /cardStatus = "complete"/);
  });

  it("does not rewrite operational Guest Profile types", () => {
    assert.match(wave1, /id: "individual"/);
    assert.match(wave1, /id: "company"/);
    assert.match(wave1, /id: "group"/);
    assert.match(wave1, /id: "travel-agent"/);
    assert.doesNotMatch(wave1, /\bIND\b/);
    assert.doesNotMatch(wave1, /pms_guest_profile_types/);
  });
});

describe("Card 4 dual-lane 0077", () => {
  it("ships identical supabase and drizzle SQL with tenant RLS and no guest_profiles FK", () => {
    const drizzle = join(process.cwd(), "drizzle/migrations/0077_pms_card4_profile_types.sql");
    const supabase = join(process.cwd(), "supabase/migrations/0077_pms_card4_profile_types.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const sql = readFileSync(drizzle, "utf8");
    assert.equal(sql, readFileSync(supabase, "utf8"));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.pms_guest_profile_types/);
    assert.match(sql, /ALTER TABLE public\.pms_guest_profile_types ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /is_restaurant_member\(restaurant_id\)/);
    assert.match(sql, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.doesNotMatch(sql, /REFERENCES public\.guest_profiles/);
    assert.doesNotMatch(sql, /ON DELETE CASCADE REFERENCES public\.guest_/);
  });
});
