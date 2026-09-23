import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  isSet1SectionHash,
  propertySetupRedirectHref,
  SET1_HUB_HREF,
} from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD8_ACTIVATION_HONESTY,
  CARD8_HASH,
  CARD8_HREF,
  CARD8_OFFLINE_HONESTY,
  CARD8_PROGRAMME_CARD_ID,
  CARD8_PURPOSE,
  CARD8_TABS,
  CARD8_TITLE,
  card8FinishActivatesProperty,
  isCard8WorkspaceHash,
  resolveCard8Hash,
} from "./pms-property-setup-card8.ts";

const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-section.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/settings/pms-property-setup-card8-workspace.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../../routes/restaurant/settings.tsx", import.meta.url),
  "utf8",
);
const lib = readFileSync(new URL("./pms-property-setup-card8.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 8 Phase 0 shell", () => {
  it("promotes System & Go-Live with exactly four launch workspaces", () => {
    const card = PROPERTY_SETUP_CARDS.find((row) => row.number === 8);
    assert.equal(CARD8_TITLE, "System & Go-Live");
    assert.equal(CARD8_PURPOSE, "Offline & Sync, System Validation, Go-Live, Property Activation.");
    assert.equal(CARD8_HASH, "system-go-live");
    assert.equal(CARD8_HREF, `${SET1_HUB_HREF}#system-go-live`);
    assert.equal(CARD8_PROGRAMME_CARD_ID, "payments-administration");
    assert.equal(card?.id, CARD8_PROGRAMME_CARD_ID);
    assert.equal(card?.specced, true);
    assert.equal(card?.hash, CARD8_HASH);
    assert.deepEqual(
      CARD8_TABS.map((tab) => tab.label),
      ["Offline & Sync", "System Validation", "Go-Live", "Property Activation"],
    );
    assert.equal(CARD8_TABS.length, 4);
    assert.equal(card8FinishActivatesProperty(), false);
  });

  it("uses a canonical hash without colliding with legacy Settings sections", () => {
    assert.equal(isCard8WorkspaceHash("#system-go-live"), true);
    assert.equal(isCard8WorkspaceHash("#card-8"), true);
    assert.equal(isCard8WorkspaceHash("#card8"), true);
    assert.equal(isCard8WorkspaceHash("#golive"), false);
    assert.equal(isCard8WorkspaceHash("#offline-sync"), false);
    assert.equal(resolveCard8Hash("#card8"), CARD8_HASH);
    assert.equal(isSet1SectionHash("#system-go-live"), false);
    assert.equal(isSet1SectionHash("#golive"), true);
    assert.equal(isSet1SectionHash("#offline-sync"), true);
    assert.equal(propertySetupRedirectHref("#card-8"), `${SET1_HUB_HREF}#system-go-live`);
  });

  it("wires the full-screen workspace and all launch-governance slots", () => {
    assert.match(hub, /PmsPropertySetupCard8Section/);
    assert.match(hub, /card8Open/);
    assert.match(hub, /isCard8WorkspaceHash/);
    assert.match(settings, /isCard8WorkspaceHash/);
    assert.match(settings, /hidePackageRail/);
    assert.match(section, /pms-card8-fullscreen/);
    assert.match(section, /PropertySetupWorkspaceShell/);
    assert.doesNotMatch(section, /pms-card8-top-nav/);
    assert.doesNotMatch(section, /CARD1_PMS_NAV/);
    assert.match(section, /pms-card8-tabs-slot/);
    assert.match(lib, /CARD8_PHASE0_PLACEHOLDER/);
    assert.match(section, /focus-visible:ring-\[#C89933\]/);
    assert.match(section, /overflow-x-auto/);
    for (const slot of [
      "lifecycle",
      "content",
      "validation",
      "checklist",
      "summary",
      "status",
      "actions",
    ]) {
      assert.match(workspace, new RegExp(`pms-card8-${slot}-slot`));
    }
  });

  it("keeps remaining launch tabs as honest placeholders", () => {
    assert.match(CARD8_OFFLINE_HONESTY, /offline runtime/i);
    assert.match(CARD8_ACTIVATION_HONESTY, /activatePmsSet1 \/ pms_set1_live/);
    assert.match(section, /Card8ValidationTab/);
    assert.match(section, /Card8GoliveTab/);
    assert.match(section, /Card8ActivationTab/);
    assert.doesNotMatch(section, /126 Passed|Healthy ✓|Pending:\s*0|PROPERTY ACTIVE/);
  });

  it("does not start System Validation, activation or an offline runtime", () => {
    assert.doesNotMatch(workspace, /serviceWorker|indexedDB|offlineQueue|activatePmsSet1\(/);
    assert.doesNotMatch(section, /getCard[1-7]Validation|evaluateSet1Checklist|activatePmsSet1\(/);
    assert.doesNotMatch(lib, /createServerFn|activatePmsSet1\(/);
    assert.match(section, /Card8OfflineTab/);
    assert.doesNotMatch(
      section,
      /getCard8Validation|saveCard8Golive|getCard8Golive|activateCard8Property/,
    );
  });
});
