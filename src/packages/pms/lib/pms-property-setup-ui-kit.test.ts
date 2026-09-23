import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import { ISO_COUNTRIES } from "./pms-geography.ts";
import {
  propertySetupCardByNumber,
  propertySetupCardIdentities,
  propertySetupCardStatusPillLabel,
} from "./pms-property-setup-card-identity.ts";
import { PROPERTY_SETUP_FIELD_ICONS } from "./pms-property-setup-field-icons.ts";
import {
  ISO_CALLING_CODES,
  composeSetupPhone,
  decomposeSetupPhone,
  filterPhoneDigits,
  PROPERTY_SETUP_CALLING_COUNTRIES,
  setupPhoneDisplayIso,
} from "./pms-property-setup-phone.ts";
import { PROPERTY_SETUP_SOCIAL_PLATFORMS } from "./pms-property-setup-social.ts";
import {
  acceptShortDescriptionInput,
  isShortDescriptionOverLimit,
  propertySetupStatusesPercent,
  PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX,
} from "./pms-property-setup-ui.ts";

const identity = readFileSync(
  new URL("./pms-property-setup-card-identity.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/settings/pms-settings-dashboard.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("../components/settings/setup-kit/workspace-shell.tsx", import.meta.url),
  "utf8",
);
const header = readFileSync(
  new URL("../components/settings/setup-kit/card-workspace-header.tsx", import.meta.url),
  "utf8",
);
const section = readFileSync(
  new URL("../components/settings/setup-kit/section-header.tsx", import.meta.url),
  "utf8",
);
const rail = readFileSync(
  new URL("../components/settings/setup-kit/status-rail.tsx", import.meta.url),
  "utf8",
);
const footer = readFileSync(
  new URL("../components/settings/setup-kit/action-footer.tsx", import.meta.url),
  "utf8",
);
const form = readFileSync(
  new URL("../components/settings/setup-kit/form-grid.tsx", import.meta.url),
  "utf8",
);
const phoneUi = readFileSync(
  new URL("../components/settings/setup-kit/phone-field.tsx", import.meta.url),
  "utf8",
);
const socialUi = readFileSync(
  new URL("../components/settings/setup-kit/social-platform-select.tsx", import.meta.url),
  "utf8",
);
const remove = readFileSync(
  new URL("../components/settings/setup-kit/remove-button.tsx", import.meta.url),
  "utf8",
);
const hub = readFileSync(
  new URL("../components/settings/pms-set1-hub.tsx", import.meta.url),
  "utf8",
);
const card1 = readFileSync(
  new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url),
  "utf8",
);
const card1Steps = readFileSync(
  new URL("../components/settings/pms-property-setup-card1-steps.tsx", import.meta.url),
  "utf8",
);

describe("Property Setup Phase A UI kit", () => {
  it("registers eight unique card identities and dashboard consumes the same icons", () => {
    const rows = propertySetupCardIdentities();
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map((row) => row.id)).size, 8);
    assert.equal(propertySetupCardByNumber(1).title, "Property & Business");
    assert.match(identity, /Building2/);
    assert.match(identity, /BedDouble/);
    assert.match(identity, /ChartColumn/);
    assert.match(identity, /Users/);
    assert.match(identity, /Network/);
    assert.match(identity, /Share2/);
    assert.match(identity, /Shield/);
    assert.match(identity, /Rocket/);
    assert.match(dashboard, /propertySetupCardIcon/);
    assert.doesNotMatch(dashboard, /const CARD_ICONS/);
    assert.deepEqual(
      PROPERTY_SETUP_CARDS.map((card) => card.number),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(propertySetupCardStatusPillLabel("complete"), "Ready");
  });

  it("covers the semantic field icon keys", () => {
    for (const key of [
      "property",
      "property_type",
      "room",
      "room_type",
      "bed",
      "guest",
      "person",
      "phone",
      "email",
      "website",
      "country",
      "address",
      "currency",
      "money",
      "tax",
      "document",
      "date",
      "time",
      "timezone",
      "security",
      "password",
      "report",
      "integration",
      "network",
      "facility",
      "department",
      "notification",
      "payment",
      "hash",
      "briefcase",
      "star",
      "language",
      "tag",
      "badge",
      "image",
      "palette",
      "landmark",
      "contact",
      "amenity",
      "housekeeping",
      "inventory",
      "maintenance",
      "meal",
      "revenue",
      "service",
      "role",
      "audit",
      "import",
      "offline",
      "sync",
      "validation",
      "activation",
      "mapping",
      "event",
    ] as const) {
      assert.equal(Boolean(PROPERTY_SETUP_FIELD_ICONS[key]), true, key);
    }
  });

  it("keeps the workspace shell content-only without command chrome", () => {
    assert.match(shell, /PropertySetupWorkspaceShell/);
    assert.match(shell, /@min-\[56rem\]:flex-row/);
    assert.match(shell, /overflow-x-hidden/);
    assert.doesNotMatch(shell, /percent = 0/);
    assert.doesNotMatch(shell, /PmsCommandChrome/);
    assert.doesNotMatch(shell, /fo-top-command/);
    assert.doesNotMatch(shell, /SettingsDashboardChrome/);
    assert.match(header, /CardWorkspaceHeader/);
    assert.match(section, /PropertySetupSectionHeader/);
    assert.match(rail, /percent\?:/);
    assert.doesNotMatch(shell, /percent = 0/);
    assert.match(rail, /property-setup-card-donut/);
    assert.match(rail, /typeof percent === "number"/);
    assert.match(rail, /17\.5rem/);
    assert.doesNotMatch(rail, /evaluateSettingsDashboardProgress/);
    assert.match(footer, /ArrowLeft/);
    assert.match(footer, /Save Draft/);
    assert.match(footer, /Save & Continue/);
    assert.doesNotMatch(hub, /setup-kit/);
    assert.match(card1, /setup-kit/);
    assert.doesNotMatch(card1, /pms-card1-top-nav/);
    assert.doesNotMatch(card1, /CARD1_PMS_NAV/);
  });

  it("defines a 1/2/3 column grid, boxy field shell, and compact remove control", () => {
    assert.match(form, /xl:grid-cols-3/);
    assert.match(form, /md:grid-cols-2/);
    assert.match(form, /grid-cols-1/);
    assert.match(form, /span\?: 1 \| 2 \| 3/);
    assert.match(remove, /Trash2/);
    assert.match(remove, /aria-label/);
    assert.doesNotMatch(remove, />Remove</);
  });

  it("migrates Cards 2–8 onto setup-kit chrome without duplicating CARD1_PMS_NAV or inventing donuts", () => {
    const cards = [2, 3, 4, 5, 6, 7, 8].map((number) => ({
      number,
      source: readFileSync(
        new URL(
          `../components/settings/pms-property-setup-card${number}-section.tsx`,
          import.meta.url,
        ),
        "utf8",
      ),
    }));
    for (const card of cards) {
      assert.match(card.source, /PropertySetupWorkspaceShell/, `card ${card.number} shell`);
      assert.match(card.source, /PropertySetupStatusRail/, `card ${card.number} rail`);
      assert.doesNotMatch(card.source, /CARD1_PMS_NAV/, `card ${card.number} nav`);
      assert.doesNotMatch(card.source, /PmsPropertySetupWorkspace/, `card ${card.number} legacy`);
    }
    assert.doesNotMatch(cards[0].source, /card2ProgressPct/);
    assert.doesNotMatch(cards[2].source, /card4ProgressPct/);
    assert.doesNotMatch(cards[4].source, /percent=\{/);
    assert.match(
      cards[4].source,
      /<PropertySetupStatusRail complete=\{0\} inProgress=\{0\} notStarted=\{0\} \/>/,
    );
    assert.match(hub, /contentClassName=\{workspaceOpen \? "p-0" : undefined\}/);
  });

  it("covers ISO calling codes and composes a single phone string", () => {
    for (const country of ISO_COUNTRIES) {
      assert.equal(Boolean(ISO_CALLING_CODES[country.code]), true, country.code);
    }
    assert.ok(PROPERTY_SETUP_CALLING_COUNTRIES.length >= ISO_COUNTRIES.length);
    assert.equal(filterPhoneDigits("09a1b23"), "09123");
    assert.equal(composeSetupPhone("ET", "0911234567"), "+2510911234567");
    assert.equal(decomposeSetupPhone("+2510911234567").localNumber, "0911234567");
    assert.equal(decomposeSetupPhone("+2510911234567").iso, "ET");
    const loose = decomposeSetupPhone("0911234567");
    assert.equal(loose.localNumber, "0911234567");
    assert.equal(loose.iso, null);
    assert.equal(loose.ambiguous, true);
    assert.equal(composeSetupPhone(null, "0911234567"), "0911234567");
    assert.equal(setupPhoneDisplayIso("", "ET"), "ET");
    assert.equal(setupPhoneDisplayIso("+12025550123", "ET"), "US");
    assert.equal(setupPhoneDisplayIso("0911234567", "ET"), null);
  });

  it("filters letters in the local number control and never uses type=number", () => {
    assert.match(phoneUi, /inputMode="numeric"/);
    assert.match(phoneUi, /filterPhoneDigits/);
    assert.match(phoneUi, /type="text"/);
    assert.match(phoneUi, /defaultIso/);
    assert.match(phoneUi, /setupPhoneDisplayIso/);
  });

  it("uses simple-icons for the eight social brands", () => {
    assert.deepEqual(
      PROPERTY_SETUP_SOCIAL_PLATFORMS.map((row) => row.id),
      ["facebook", "whatsapp", "instagram", "x", "linkedin", "youtube", "tiktok", "telegram"],
    );
    assert.match(socialUi, /from "simple-icons"/);
    assert.match(socialUi, /siFacebook/);
    assert.match(socialUi, /siWhatsapp/);
    assert.match(socialUi, /Link2/);
    assert.doesNotMatch(socialUi, /siLinkedin/);
  });

  it("does not import servers, migrations, or types.ts", () => {
    const kit = [
      identity,
      shell,
      header,
      section,
      rail,
      footer,
      form,
      phoneUi,
      socialUi,
      remove,
    ].join("\n");
    assert.doesNotMatch(kit, /\.functions/);
    assert.doesNotMatch(kit, /types\.ts/);
    assert.doesNotMatch(kit, /drizzle\/migrations/);
    assert.doesNotMatch(kit, /activatePmsSet1/);
  });

  it("gates short description on 80 characters without truncating legacy values and keeps rail percent on step statuses", () => {
    const eighty = "a".repeat(PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX);
    const legacy = "a".repeat(120);
    assert.equal(isShortDescriptionOverLimit(eighty), false);
    assert.equal(isShortDescriptionOverLimit(legacy), true);
    assert.equal(acceptShortDescriptionInput(legacy, legacy), legacy);
    assert.equal(acceptShortDescriptionInput(legacy, `${legacy}x`), legacy);
    assert.equal(acceptShortDescriptionInput(legacy, legacy.slice(0, 90)), legacy.slice(0, 90));
    assert.equal(acceptShortDescriptionInput(eighty, `${eighty}x`), eighty);
    const chars = "a".repeat(500);
    assert.equal(acceptShortDescriptionInput(chars, `${chars}b`), chars);
    assert.equal(acceptShortDescriptionInput("hello world", "hello"), "hello");
    assert.match(card1Steps, /acceptShortDescriptionInput/);
    assert.match(card1Steps, /PROPERTY_SETUP_SHORT_DESCRIPTION_UI_MAX/);
    assert.match(card1Steps, /card1-short-description-counter/);
    assert.match(card1Steps, /SocialPlatformSelect/);
    assert.match(card1Steps, /CARD1_SOCIAL_PLATFORMS/);
    assert.match(card1Steps, /card1-independent/);
    assert.match(card1Steps, /card1-public/);
    assert.match(card1Steps, /PropertySetupFormItem span=\{3\}/);
    assert.doesNotMatch(card1Steps, /span=\{2\}/);
    assert.doesNotMatch(card1Steps, /Current Settings Summary/);
    assert.doesNotMatch(card1Steps, /18rem/);
    assert.doesNotMatch(card1Steps, /16rem/);
    assert.match(card1Steps, /xl:grid-cols-\[20rem_minmax\(0,1fr\)\]/);
    assert.match(card1Steps, /Recommended Defaults/);
    assert.equal((card1.match(/data-testid="pms-card1-status-rail"/g) ?? []).length, 1);
    assert.match(card1, /<PropertySetupStatusRail/);
    assert.match(card1, /isShortDescriptionOverLimit/);
    assert.match(card1, /propertySetupStatusesPercent/);
    assert.match(card1, /evaluateCard1StepStatus/);
    assert.match(card1, /blockers=\{blockers\}/);
    assert.equal(
      propertySetupStatusesPercent([
        "complete",
        "complete",
        "in_progress",
        "not_started",
        "not_started",
        "not_started",
        "not_started",
        "not_started",
      ]),
      31,
    );
  });
});
