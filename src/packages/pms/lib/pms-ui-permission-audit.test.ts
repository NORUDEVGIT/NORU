import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("current PMS action visibility", () => {
  it("hides folio menu actions unless that specific permission is granted", () => {
    const desk = read("../components/cashiering/cashiering-desk.tsx");
    const workspace = read("../components/workspaces/cashiering-workspace.tsx");
    assert.match(workspace, /charge: accessQuery\.data\.canCharge/);
    assert.match(workspace, /refund: accessQuery\.data\.canRefund/);
    assert.match(workspace, /close: accessQuery\.data\.canClose/);
    assert.match(desk, /function FolioActionMenu/);
    const menu = desk.slice(desk.indexOf("function FolioActionMenu"), desk.indexOf("function FolioPageItem"));
    assert.match(menu, /useCashieringGrants/);
    assert.doesNotMatch(menu, /disabled=\{!canManage/);
    assert.match(menu, /disabled=\{!open\}/);
    assert.doesNotMatch(desk, /Owner or Manager authorization required/);
  });

  it("does not show overbooking controls from an Owner or Manager label", () => {
    const page = read("../components/bookings/create-reservation-room-type.tsx");
    const decision = page.slice(page.indexOf("export function OverbookingDecision"));
    assert.match(decision, /canAuthorizeOverbooking/);
    assert.doesNotMatch(decision, /Owner or Manager/);
    assert.match(read("../components/bookings/create-reservation-page.tsx"), /RESERVATION_OVERBOOKING_AUTHORIZE/);
  });

  it("hides room restriction actions when the permission is absent", () => {
    const panel = read("../components/rooms/room-detail-panel.tsx");
    const helper = panel.slice(panel.indexOf("function ActionWithPermission"));
    assert.match(helper, /if \(!allowed\) return null/);
    assert.doesNotMatch(helper, /disabled/);
    assert.doesNotMatch(panel, /requires manager access/);
  });

  it("does not use a role to flash account write-off before permissions load", () => {
    const panel = read("../components/cashiering/financial-account-payments-panel.tsx");
    assert.match(panel, /writeOff: false/);
    assert.match(panel, /caps\.canWriteOff \?/);
  });
});
