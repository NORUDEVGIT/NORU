import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FO_NAV_ITEMS } from "./front-office-shell.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO UI/UX polish — no page header, hover-activated burger nav", () => {
  it("removes the Operations / Front Office Desk page header", () => {
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.doesNotMatch(chrome, /data-testid="fo-desk-header"/);
    assert.doesNotMatch(chrome, /Operations/);
    // The desk title/description constants still exist, but only as the nav
    // menu's accessible label (sr-only) — never a visible page title.
    assert.match(chrome, /FO_DESK_TITLE/);
    assert.match(chrome, /FO_DESK_DESCRIPTION/);
  });

  it("replaces the permanent nine-tab row with a hover/focus-revealed burger trigger", () => {
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.match(chrome, /data-testid="fo-nav-trigger"/);
    assert.match(chrome, /aria-label="Front Office navigation"/);
    assert.match(chrome, /opacity-40/);
    assert.match(chrome, /hover:opacity-100/);
    assert.match(chrome, /focus-visible:opacity-100/);
    // Popover, not a permanent sidebar/footer/mobile duplicate nav.
    assert.match(chrome, /Popover/);
    assert.doesNotMatch(chrome, /<aside/);
    assert.doesNotMatch(chrome, /<footer/);
    assert.doesNotMatch(chrome, /fo-sidebar-nav/);
    assert.doesNotMatch(chrome, /fo-mobile-nav/);
  });

  it("the nav menu overlays — all nine destinations and the exceptions badge are preserved", () => {
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.match(chrome, /data-testid="fo-workspace-nav"/);
    assert.match(chrome, /FO_NAV_ITEMS\.map/);
    assert.match(chrome, /data-testid={`fo-nav-\$\{item\.id\}`}/);
    assert.match(chrome, /aria-current=\{isActive \? "page" : undefined\}/);
    assert.match(chrome, /data-testid="fo-exceptions-badge"/);
    assert.equal(FO_NAV_ITEMS.length, 9);
    // Active destination gets a gold highlight, not a redesigned underline tab.
    assert.match(chrome, /bg-\[#F4E9D0\]/);
  });

  it("keeps the Return-to-previous affordance and the module search/help controls", () => {
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.match(chrome, /fo-return-to-previous/);
    assert.match(chrome, /fo-module-search/);
    assert.match(chrome, /fo-help/);
  });
});

describe("FO UI/UX polish — icon-only Rack / Table / List view switcher", () => {
  it("adds one icon-only switcher that drives the existing rack data, not a new business logic path", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /data-testid="fo-rack-view-switcher"/);
    assert.match(calendar, /data-testid={`fo-rack-view-\$\{option\.id\}`}/);
    assert.match(calendar, /\{ id: "rack", label: "Rack view", icon: LayoutGrid \}/);
    assert.match(calendar, /\{ id: "table", label: "Table view", icon: Table2 \}/);
    assert.match(calendar, /\{ id: "list", label: "List view", icon: List \}/);
    assert.match(calendar, /aria-pressed=\{active\}/);
    assert.match(calendar, /aria-label=\{option\.label\}/);
    // Table/List render the same visibleRooms/visibleStays the rack already
    // computed — no second fetch, no second filter pipeline.
    assert.match(calendar, /<FoRackTableView[\s\S]{0,40}rooms=\{visibleRooms\}/);
    assert.match(calendar, /<FoRackListView[\s\S]{0,40}rooms=\{visibleRooms\}/);
    assert.doesNotMatch(calendar, /useQuery\(\{[\s\S]{0,80}FoRackTableView/);
  });

  it("Table and List views reuse the existing rack action menu/resolver, no duplicate writers", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /function RackViewMenu/);
    assert.match(calendar, /foRackBarMenuItems/);
    assert.match(calendar, /onAction=\{\(action\) => onRackAction\(action, actionStay\)\}/);
    assert.match(calendar, /function FoRackTableView/);
    assert.match(calendar, /function FoRackListView/);
    assert.match(calendar, /data-testid="fo-rack-view-empty"/);
  });
});

describe("FO UI/UX polish — transparent rack status bars", () => {
  it("rack bars use one shared low-opacity tone instead of a solid fill", () => {
    const shell = readRel("./front-office-shell.ts");
    assert.match(shell, /export function reservationBarSoftTone/);
    assert.match(shell, /RESERVATION_BAR_SOFT_BG_ALPHA/);
    assert.match(shell, /RESERVATION_BAR_SOFT_BORDER_ALPHA/);

    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(calendar, /reservationBarSoftTone/);
    assert.match(
      calendar,
      /backgroundColor: tone\.background, borderColor: tone\.border, color: tone\.color/,
    );
    // No more solid white-on-colour fill for the bar itself.
    assert.doesNotMatch(calendar, /text-left text-xs text-white"/);
  });
});

describe("FO UI/UX polish — rack stays actionable, not a second Room & Inventory board", () => {
  it("the rack (and Table/List) read Front Office occupancy, never a separate vacant-room feed", () => {
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    // Same occupancy/reservations source as before — RI-owned.
    assert.match(calendar, /listOccupancy/);
    assert.match(calendar, /listReservations/);
    assert.doesNotMatch(calendar, /listInventoryRooms|listVacantRooms/);
  });
});

describe("FO UI/UX polish — Quick View is hidden by default and overlays, never a permanent column", () => {
  it("Stay/In-house/Room quick views start closed and open only on an explicit click", () => {
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(
      workspace,
      /const \[sheetStay, setSheetStay\] = useState<FrontOfficeStay \| null>\(null\)/,
    );
    assert.match(workspace, /const \[roomQvId, setRoomQvId\] = useState<string \| null>\(null\)/);
    assert.match(
      workspace,
      /const \[inHouseQv, setInHouseQv\] = useState<FoRackInHouseTarget \| null>\(null\)/,
    );
    assert.match(workspace, /function openStayQuickView/);
    assert.match(workspace, /function openRoomQuickView/);
    assert.match(workspace, /function openInHouseFromRack/);
  });

  it("uses the shared overlay Sheet (not an inline column) and closes without navigating away", () => {
    const sheet = readRel("../components/frontoffice/reservation-side-sheet.tsx");
    assert.match(sheet, /<Sheet open=\{open\} onOpenChange=\{onOpenChange\}>/);
    assert.match(sheet, /side="right"/);
    const inHouse = readRel("../components/frontoffice/in-house-quick-view.tsx");
    assert.match(inHouse, /<Sheet /);
    const room = readRel("../components/frontoffice/room-quick-view.tsx");
    assert.match(room, /<Sheet /);
  });

  it("selects the exact reservationRoomId for multi-room units instead of reservation-level fallback", () => {
    const menu = readRel("./fo-rack-bar-menu.ts");
    assert.match(menu, /export function foRackUnitIdentity/);
    assert.match(menu, /kind: "unit"; reservationRoomId: string/);
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    assert.match(
      calendar,
      /onSelectInHouse\(\{ reservationId: stay\.id, reservationRoomId: identity\.reservationRoomId \}\)/,
    );
  });
});
