import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FO_NAV_ITEMS, FO_LANDING_NAV, foSearchFromUnknown } from "./front-office-shell.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("FO workspace layout — shared PMS nav", () => {
  it("uses RoomInventoryChrome and keeps FO tabs under the desk title", () => {
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    const shared = readRel("../components/rooms/room-inventory-chrome.tsx");
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    const reservations = readRel("../components/workspaces/reservations-workspace.tsx");
    const route = readRel("../../../routes/restaurant/pms/front-office.tsx");

    assert.match(chrome, /RoomInventoryChrome/);
    assert.match(chrome, /activeModule="Front Office"/);
    assert.match(chrome, /fo-workspace-nav/);
    assert.match(chrome, /FO_DESK_TITLE/);
    assert.match(chrome, /data-testid={`fo-nav-\$\{item\.id\}`}/);
    assert.doesNotMatch(chrome, /fo-top-nav/);
    assert.doesNotMatch(chrome, /PmsCommandChrome/);
    assert.match(shared, /pms-module-nav/);
    assert.match(reservations, /activeModule="Reservations"/);
    assert.match(reservations, /Search reservation/);
    assert.doesNotMatch(reservations, /fo-module-search/);
    assert.match(workspace, /onGuestSearch=\{\(term\) =>/);
    assert.match(workspace, /GuestSearchDialog/);
    assert.match(workspace, /searchFrontOfficeStays|initialTerm=\{searchTerm\}/);
    assert.match(route, /hideTopHeader/);
    assert.equal(FO_LANDING_NAV, "rack");
    assert.equal(foSearchFromUnknown({ tab: "arrivals" }).tab, "arrivals");
    assert.equal(FO_NAV_ITEMS[0].id, "rack");
  });

  it("does not render Room Operations on the rack while keeping the read model", () => {
    const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
    const calendar = readRel("../components/frontoffice/room-rack-calendar.tsx");
    const qv = readRel("../components/frontoffice/room-quick-view.tsx");
    const ops = readRel("./front-office-room-operations.ts");
    const fns = readRel("./front-office-room-operations.functions.ts");
    assert.doesNotMatch(workspace, /RoomOperationsQueuePanel/);
    assert.doesNotMatch(workspace, /fo-room-ops-queue/);
    assert.doesNotMatch(calendar, /operationsSlot/);
    assert.doesNotMatch(calendar, /fo-room-ops-queue/);
    assert.match(qv, /export function RoomOperationsQueuePanel/);
    assert.match(ops, /queueFromExceptionRows|RoomOpsQueueItem/);
    assert.match(fns, /getFrontOfficeRoomOperationsQueue/);
    assert.match(calendar, /data-testid="fo-ops-strip"/);
    assert.match(calendar, /onClick=\{\(\) => onFilter\(item\.filter\)\}/);
    assert.match(calendar, /data-testid="fo-rack-toolbar"/);
    assert.match(calendar, /fo-rack-group-by/);
    assert.match(calendar, /fo-walk-in-cta/);
    assert.match(workspace, /RoomQuickViewSheet/);
    assert.match(workspace, /ReservationSideSheet/);
  });

  it("keeps Front Office search on searchFrontOfficeStays", () => {
    const frames = readRel("../components/frontoffice/front-office-frames.tsx");
    const chrome = readRel("../components/frontoffice/front-office-chrome.tsx");
    assert.match(frames, /searchFrontOfficeStays/);
    assert.match(frames, /initialTerm/);
    assert.match(chrome, /Search guest, reservation, room/);
    assert.match(chrome, /fo-module-search/);
  });
});
