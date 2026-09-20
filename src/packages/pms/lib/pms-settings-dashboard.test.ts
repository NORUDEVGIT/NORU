import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  card1PmsNavIsUnchanged,
  evaluateSettingsDashboardProgress,
  settingsDashboardStatusLabel,
  settingsDashboardStatusWeight,
} from "./pms-settings-dashboard.ts";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/settings/pms-settings-dashboard.tsx", import.meta.url),
  "utf8",
);
const chrome = readFileSync(
  new URL("../components/pms-command-chrome.tsx", import.meta.url),
  "utf8",
);
const foChrome = readFileSync(
  new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url),
  "utf8",
);

describe("Settings dashboard presentation", () => {
  it("weights complete 1.0, in progress 0.5, not started 0 and rounds the eight-card average", () => {
    assert.equal(settingsDashboardStatusWeight("complete"), 1);
    assert.equal(settingsDashboardStatusWeight("in_progress"), 0.5);
    assert.equal(settingsDashboardStatusWeight("not_started"), 0);
    assert.equal(PROPERTY_SETUP_CARDS.length, 8);
    const mixed = evaluateSettingsDashboardProgress([
      "complete",
      "complete",
      "in_progress",
      "in_progress",
      "not_started",
      "not_started",
      "not_started",
      "not_started",
    ]);
    assert.equal(mixed.overallPercent, 38);
    assert.equal(mixed.complete, 2);
    assert.equal(mixed.inProgress, 2);
    assert.equal(mixed.notStarted, 4);
    assert.equal(mixed.blocked, 0);
  });

  it("maps complete to Ready without changing stored status vocabulary", () => {
    assert.equal(settingsDashboardStatusLabel("complete"), "Ready");
    assert.equal(settingsDashboardStatusLabel("in_progress"), "In Progress");
    assert.equal(settingsDashboardStatusLabel("not_started"), "Not Started");
  });

  it("renders a donut, eight lucide symbols, Manage CTAs and no recent changes", () => {
    assert.match(dashboard, /conic-gradient/);
    assert.match(dashboard, /settings-setup-donut/);
    assert.match(dashboard, /Building2/);
    assert.match(dashboard, /BedDouble/);
    assert.match(dashboard, /ChartColumn/);
    assert.match(dashboard, /Users/);
    assert.match(dashboard, /Network/);
    assert.match(dashboard, /Share2/);
    assert.match(dashboard, /Shield/);
    assert.match(dashboard, /Rocket/);
    assert.match(dashboard, /Manage/);
    assert.match(hub, /SettingsDashboardChrome/);
    assert.match(hub, /SET1_FOUNDATION_CHIP/);
    assert.doesNotMatch(hub, /Recent changes/);
    assert.doesNotMatch(hub, /listPmsSet1Audit/);
    assert.match(hub, /SET1_COMING_SOON.map/);
  });

  it("reuses command chrome instead of duplicating FO navbar JSX", () => {
    assert.match(foChrome, /PmsCommandChrome/);
    assert.match(foChrome, /FO_NAV_ITEMS/);
    assert.match(chrome, /fo-top-command/);
    assert.match(dashboard, /PmsCommandChrome/);
    assert.match(dashboard, /SETTINGS_DASHBOARD_NAV/);
    assert.doesNotMatch(dashboard, /FO_NAV_ITEMS/);
  });

  it("points global display type at Manrope", () => {
    assert.match(styles, /--font-display: "Manrope"/);
    assert.match(styles, /--font-sans: "Manrope"/);
    assert.match(styles, /h1,\s*h2,\s*h3 \{[\s\S]*font-family: var\(--font-sans\)/);
  });

  it("keeps CARD1 PMS nav hrefs unchanged", () => {
    assert.equal(card1PmsNavIsUnchanged(), true);
  });
});
