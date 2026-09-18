import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { SET1_HUB_HREF, isSet1SectionHash, propertySetupRedirectHref } from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD2_HASH,
  CARD2_HREF,
  CARD2_STEPS,
  CARD2_SUBTITLE,
  CARD2_TITLE,
  card2CompletedCount,
  card2ProgressPct,
  evaluateCard2StepStatus,
  isCard2WorkspaceHash,
  nextCard2Step,
  previousCard2Step,
  resolveCard2Hash,
} from "./pms-property-setup-card2.ts";

const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../components/settings/pms-property-setup-workspace.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../../routes/restaurant/settings.tsx", import.meta.url), "utf8");
const card1Ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");

describe("PMS Property Setup Card 2 Phase 0 shell", () => {
  it("keeps Rooms & Operations title, five steps, and rooms-inventory hash", () => {
    assert.equal(CARD2_TITLE, "Rooms & Operations");
    assert.equal(
      CARD2_SUBTITLE,
      "Configure room types, physical rooms, amenities, housekeeping, inventory and maintenance rules.",
    );
    assert.equal(CARD2_HASH, "rooms-inventory");
    assert.equal(CARD2_HREF, `${SET1_HUB_HREF}#rooms-inventory`);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.id, "rooms-inventory");
    assert.equal(PROPERTY_SETUP_CARDS[1]?.title, CARD2_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.hash, CARD2_HASH);
    assert.deepEqual(
      CARD2_STEPS.map((row) => row.title),
      ["Room Types & Rooms", "Amenities", "Housekeeping", "Inventory Rules", "Maintenance"],
    );
    assert.equal(CARD2_STEPS[0]?.id, "room-types");
    assert.equal(nextCard2Step("room-types"), "amenities");
    assert.equal(previousCard2Step("room-types"), null);
    assert.equal(nextCard2Step("maintenance"), null);
  });

  it("does not invent completion and does not collide with SET2 rooms", () => {
    assert.equal(evaluateCard2StepStatus("room-types", undefined), "not_started");
    assert.equal(card2CompletedCount({}), 0);
    assert.equal(card2ProgressPct({}), 0);
    assert.equal(isCard2WorkspaceHash("#rooms-inventory"), true);
    assert.equal(isCard2WorkspaceHash("#card-2"), true);
    assert.equal(isCard2WorkspaceHash("#rooms"), false);
    assert.equal(resolveCard2Hash("#rooms"), null);
    assert.equal(isSet1SectionHash("#rooms"), true);
    assert.equal(isSet1SectionHash("#rooms-inventory"), false);
    assert.equal(propertySetupRedirectHref("#card-2"), `${SET1_HUB_HREF}#rooms-inventory`);
    assert.equal(propertySetupRedirectHref("#rooms"), `${SET1_HUB_HREF}#rooms`);
  });

  it("opens from the hub with Card 1 chrome, a status rail, and a disabled draft save", () => {
    assert.match(hub, /PmsPropertySetupCard2Section/);
    assert.match(hub, /property-setup-card-\$\{card.number\}/);
    assert.match(section, /testIdPrefix="pms-card2"/);
    assert.match(chrome, /Setup Progress/);
    assert.match(chrome, /Save Draft/);
    assert.match(chrome, /Save & Continue/);
    assert.match(chrome, /sticky/);
    assert.match(settings, /isCard2WorkspaceHash/);
    assert.match(settings, /hidePackageRail=\{workspaceOpen\}/);
    assert.match(card1Ui, /pms-card1-fullscreen/);
    assert.doesNotMatch(card1Ui, /PmsPropertySetupWorkspace/);
  });
});
