import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CASHIERING_DESK_DESCRIPTION,
  CASHIERING_DESK_EYEBROW,
  CASHIERING_DESK_TITLE,
  CASHIERING_TABS,
  resolveCashieringTab,
} from "./cashiering-shell.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("cashiering desk shell", () => {
  it("keeps the six URL tabs and maps the old names", () => {
    assert.deepEqual(
      CASHIERING_TABS.map((tab) => tab.id),
      ["overview", "folios", "payments", "deposits", "refunds", "cashier-shift"],
    );
    assert.equal(CASHIERING_DESK_EYEBROW, "Operations");
    assert.equal(CASHIERING_DESK_TITLE, "Cashiering Desk");
    assert.equal(
      CASHIERING_DESK_DESCRIPTION,
      "Manage guest folios, recorded payments and settlement activity.",
    );
    assert.equal(resolveCashieringTab(undefined), "overview");
    assert.equal(resolveCashieringTab("dashboard"), "overview");
    assert.equal(resolveCashieringTab("shifts"), "cashier-shift");
    assert.equal(resolveCashieringTab("transfers"), "overview");
    assert.equal(resolveCashieringTab("folios"), "folios");
  });

  it("uses the shared PMS chrome and does not keep a cashiering sidebar", () => {
    const chrome = read("../components/cashiering/cashiering-chrome.tsx");
    const workspace = read("../components/workspaces/cashiering-workspace.tsx");
    const route = read("../../../routes/restaurant/pms/cashiering.tsx");
    const nav = read("./pms-module-nav.ts");
    assert.match(read("../components/rooms/room-inventory-chrome.tsx"), /PMS_MODULE_NAV/);
    assert.match(chrome, /RoomInventoryChrome/);
    assert.match(chrome, /activeModule="Cashiering"/);
    assert.match(chrome, /cashiering-workspace-nav/);
    assert.match(chrome, /\+ Post Payment/);
    assert.doesNotMatch(workspace, /FoundationPanel/);
    assert.doesNotMatch(workspace, /transfers/);
    assert.match(route, /hidePackageRail/);
    assert.match(route, /hideTopHeader/);
    assert.match(nav, /label: "Cashiering", to: "\/restaurant\/pms\/cashiering"/);
  });

  it("redirects the legacy desk and does not present restaurant expected cash as hotel reconciliation", () => {
    const legacy = read("../../../routes/restaurant/cashiering/index.tsx");
    const desk = read("../components/cashiering/cashiering-desk.tsx");
    assert.match(legacy, /to: "\/restaurant\/pms\/cashiering"/);
    assert.match(legacy, /resolveCashieringTab/);
    assert.match(desk, /folio-row-actions/);
    assert.match(desk, /Hotel drawer expected/);
    assert.match(desk, /Restaurant sales are not included/);
    assert.doesNotMatch(desk, /expected_cash|City Ledger|Company Folio|Unallocated|Allocated/);
    assert.doesNotMatch(desk, /PAN|CVV|provider/);
  });

  it("does not change the folio writer or add a migration", () => {
    const writer = read("./cashiering.functions.ts");
    const post = writer.slice(
      writer.indexOf("export const postFolioEntry"),
      writer.indexOf("export const closeFolio"),
    );
    assert.match(post, /callPostFolioTransaction/);
    assert.match(post, /folioTenderFromCatalogue/);
    assert.doesNotMatch(
      read("../../../../drizzle/migrations/0110_cashiering_phase0_ledger_safety.sql"),
      /guest_folios\.balance/,
    );
  });
});
