import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EMPTY_RACK_FILTERS,
  FO_BRAND,
  FO_LEGEND_DEFAULT_OPEN,
  FO_NAV_ITEMS,
  FO_PRIMARY_TITLE,
  HK_DIRTY_COLOR,
  HK_LEGEND,
  HK_LEGEND_SHAPE,
  RESERVATION_LEGEND,
  RESERVATION_LEGEND_SHAPE,
  ROOM_LEGEND,
  ROOM_LEGEND_SHAPE,
  actionsForMenu,
  countActiveRackFilters,
  foRoomLegendColourCollisions,
  hkStatusAriaLabel,
  liveHkStatus,
  shouldSuppressRestaurantPmsRail,
} from "./front-office-shell.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function readChrome(): string {
  return (
    readRel("../components/frontoffice/front-office-chrome.tsx") +
    readRel("../components/rooms/room-inventory-chrome.tsx")
  );
}

describe("FO large-screen chrome — command surface", () => {
  it("reuses shared PMS module nav and keeps workspace tabs out of the dark strip", () => {
    const chrome = readChrome();
    assert.match(chrome, /RoomInventoryChrome/);
    assert.match(chrome, /activeModule="Front Office"/);
    assert.match(chrome, /pms-module-nav/);
    assert.match(chrome, /Front Office/);
    assert.match(chrome, /Reservations/);
    assert.match(chrome, /Rooms & Inventory/);
    assert.match(chrome, /fo-workspace-nav/);
    assert.match(chrome, /fo-nav-\$\{item\.id\}/);
    assert.doesNotMatch(chrome, /fo-top-nav/);
    assert.doesNotMatch(chrome, /fo-pms-modules-escape/);
    assert.doesNotMatch(chrome, /fo-mobile-nav/);
    assert.doesNotMatch(chrome, /fo-sidebar-nav/);
    assert.doesNotMatch(chrome, /<aside/);
    assert.doesNotMatch(chrome, /<footer/);
    assert.doesNotMatch(chrome, /Guest request queue/);
    assert.doesNotMatch(chrome, /ComingSoonChip/);
  });

  it("does not repeat hotel · date · Active · user · Log out identity chrome", () => {
    const chrome = readChrome();
    assert.doesNotMatch(chrome, /fo-user-menu/);
    assert.doesNotMatch(chrome, /Log out/);
    assert.match(chrome, /fo-activity/);
    assert.match(chrome, /FO activity/);
    assert.match(chrome, /fo-module-search/);
    assert.match(chrome, /fo-help/);
    assert.match(chrome, /NoruLogo/);

    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    const chromeOpen = workspace.slice(
      workspace.indexOf("<FrontOfficeChrome"),
      workspace.indexOf(">", workspace.indexOf("<FrontOfficeChrome")) + 1,
    );
    assert.doesNotMatch(chromeOpen, /propertyName=/);
    assert.doesNotMatch(chromeOpen, /userLabel=/);
    assert.doesNotMatch(chromeOpen, /roleLabel=/);
    assert.doesNotMatch(chromeOpen, /businessDate=/);
  });

  it("exposes nine workspace destinations below the desk title", () => {
    assert.equal(FO_NAV_ITEMS.length, 9);
    assert.equal(FO_PRIMARY_TITLE, "Room Rack + Calendar");
    const chrome = readChrome();
    assert.match(chrome, /fo-workspace-nav/);
    assert.match(chrome, /FO_DESK_TITLE/);
    assert.match(chrome, /FO_NAV_ITEMS\.map/);
    assert.doesNotMatch(chrome, /force nine desktop tabs/);
  });
});

describe("FO large-screen chrome — RestaurantShell gutters and FO-FS0", () => {
  it("hides PMS breadcrumbs and beige inset gutters only while Front Office is mounted", () => {
    const shell = readRel("../../../core/components/restaurant-shell.tsx");
    assert.match(shell, /shouldSuppressRestaurantPmsRail/);
    assert.match(shell, /hidePackageRail/);
    assert.match(shell, /hidePackageRail \? null/);
    assert.match(shell, /pmsMod && !hidePackageRail/);
    assert.match(shell, /flex flex-col p-0/);
    assert.match(shell, /max-w-none/);
    assert.match(shell, /en-GB/);
    assert.doesNotMatch(shell, /Option A/);
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    assert.equal(shouldSuppressRestaurantPmsRail("reservations"), false);
  });
});

describe("FO large-screen chrome — Legend, HK glyph, Filters", () => {
  it("defaults Legend collapsed and keeps Room · Housekeeping · Reservation colours distinct", () => {
    assert.equal(FO_LEGEND_DEFAULT_OPEN, false);
    assert.equal(ROOM_LEGEND_SHAPE, "swatch");
    assert.equal(HK_LEGEND_SHAPE, "glyph");
    assert.equal(RESERVATION_LEGEND_SHAPE, "bar");
    assert.notEqual(ROOM_LEGEND_SHAPE, HK_LEGEND_SHAPE);
    assert.notEqual(HK_LEGEND_SHAPE, RESERVATION_LEGEND_SHAPE);
    assert.deepEqual(
      ROOM_LEGEND.map((item) => item.key),
      ["vacant", "occupied", "available", "out_of_order", "out_of_service"],
    );
    assert.equal(
      ROOM_LEGEND.some((item) => item.key.startsWith("hk_")),
      false,
    );
    assert.deepEqual(
      HK_LEGEND.map((item) => [item.key, item.color]),
      [
        ["clean", FO_BRAND.green],
        ["dirty", HK_DIRTY_COLOR],
        ["inspected", "#2F5D8A"],
        ["pickup", "#D97706"],
      ],
    );
    assert.notEqual(HK_DIRTY_COLOR, FO_BRAND.gold);
    assert.notEqual(ROOM_LEGEND.find((item) => item.key === "available")?.color, FO_BRAND.green);
    assert.deepEqual(foRoomLegendColourCollisions(), []);
    assert.ok(RESERVATION_LEGEND.some((item) => item.key === "confirmed" && item.color === FO_BRAND.gold));

    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /fo-rack-legend/);
    assert.match(calendar, /fo-legend-toggle/);
    assert.match(calendar, /FO_LEGEND_DEFAULT_OPEN/);
    assert.match(calendar, /Room · Housekeeping · Reservation/);
    assert.match(calendar, /title="Room"/);
    assert.match(calendar, /title="Housekeeping"/);
    assert.match(calendar, /title="Reservation"/);
  });

  it("places a Live HK glyph beside the room number and never invents Clean", () => {
    assert.equal(liveHkStatus(null), null);
    assert.equal(liveHkStatus(undefined), null);
    assert.equal(liveHkStatus("clean"), "clean");
    assert.equal(liveHkStatus("dirty"), "dirty");
    assert.equal(liveHkStatus("inspected"), "inspected");
    assert.equal(liveHkStatus("pickup"), "pickup");
    assert.equal(liveHkStatus("in_progress"), null);
    assert.equal(liveHkStatus("in progress"), null);
    assert.equal(hkStatusAriaLabel(null), null);
    assert.equal(hkStatusAriaLabel("clean"), "Clean");
    assert.equal(hkStatusAriaLabel("in_progress"), null);

    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /FoHkStatusGlyph/);
    assert.match(calendar, /fo-hk-glyph/);
    assert.match(calendar, /size-3\.5/);
    assert.doesNotMatch(calendar, /invent Clean/);
    assert.doesNotMatch(calendar, /in_progress|In progress/);
    assert.doesNotMatch(calendar, /HK \$\{hk\.housekeepingStatus\}/);
  });

  it("uses one Filters button and live-applies inside a single popover", () => {
    assert.equal(countActiveRackFilters(EMPTY_RACK_FILTERS), 0);
    assert.equal(countActiveRackFilters({ ...EMPTY_RACK_FILTERS, floor: "1", vip: "vip" }), 2);

    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /fo-filters-button/);
    assert.match(calendar, /fo-filters-popover/);
    assert.match(calendar, /fo-filters-count/);
    assert.match(calendar, /Popover/);
    assert.match(calendar, /countActiveRackFilters/);
    assert.doesNotMatch(calendar, /always-on FilterRow/);
    const buttonIdx = calendar.indexOf("fo-filters-button");
    const rowIdx = calendar.indexOf('data-testid="fo-rack-filters"');
    assert.ok(buttonIdx > 0);
    assert.ok(rowIdx > buttonIdx);
  });
});

describe("FO large-screen chrome — Guest Request sheet and no new backend", () => {
  it("keeps FoGuestRequestSheet reachable from Quick Action, Amendments and Side Sheet", () => {
    assert.ok(actionsForMenu("quick").some((action) => action.id === "guest_request" && action.lane === "live"));

    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(workspace, /guest_request/);
    assert.match(workspace, /FoAmendKindSheet/);
    assert.doesNotMatch(workspace, /Guest request queue/);

    const frames = readRel("../components/frontoffice/front-office-frames.tsx");
    assert.match(frames, /FoGuestRequestSheet/);
    assert.match(frames, /Guest Request/);

    const sheet = readRel("../components/frontoffice/fo-amend-sheet.tsx");
    assert.match(sheet, /FoGuestRequestSheet/);

    const chrome = readChrome();
    assert.doesNotMatch(chrome, /Guest request queue/);
  });

  it("adds no migration, API or backend surface", () => {
    const drizzle = join(here, "../../../../drizzle/migrations");
    const supabase = join(here, "../../../../supabase/migrations");
    if (existsSync(drizzle)) {
      assert.equal(
        readdirSync(drizzle).some((name) => /chrome1|fo-chrome/i.test(name)),
        false,
      );
    }
    if (existsSync(supabase)) {
      assert.equal(
        readdirSync(supabase).some((name) => /chrome1|fo-chrome/i.test(name)),
        false,
      );
    }
    const chrome = readChrome();
    assert.doesNotMatch(chrome, /create table|apply_migration|useServerFn/i);
  });
});
