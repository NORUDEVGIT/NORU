import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Folio Search UI", () => {
  it("uses a compact toolbar with account type dropdown and overlay drawer", () => {
    const panel = readFileSync(
      new URL("../components/cashiering/folio-search-panel.tsx", import.meta.url),
      "utf8",
    );
    const desk = readFileSync(
      new URL("../components/cashiering/cashiering-desk.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /Folio Search/);
    assert.match(panel, /folio-account-type/);
    assert.match(panel, /All Accounts/);
    assert.match(panel, /FolioSearchStayDates/);
    assert.match(panel, /folio-details-drawer/);
    assert.match(panel, /Payment State/);
    assert.match(panel, /Folio Status/);
    assert.match(panel, /Stay Status/);
    assert.match(panel, /searchGuestFolios/);
    assert.match(panel, /searchAllAccounts/);
    assert.match(desk, /FolioSearchPanel/);
    assert.doesNotMatch(panel, /role="tablist"/);
    assert.doesNotMatch(panel, /Quick Actions/);
    assert.doesNotMatch(panel, /Create Invoice/);
    assert.doesNotMatch(panel, /SummaryTile/);
    assert.doesNotMatch(panel, /lg:grid-cols/);
    assert.match(panel, /AllAccountsTable/);
    assert.doesNotMatch(panel, /coming soon/i);
  });

  it("keeps row actions in the contextual menu including transfer", () => {
    const menu = readFileSync(
      new URL("../components/cashiering/folio-action-menu.tsx", import.meta.url),
      "utf8",
    );
    assert.match(menu, /Post Charge/);
    assert.match(menu, /Transfer/);
    assert.match(menu, /Close Folio/);
    assert.doesNotMatch(menu, /Create Invoice/);
  });

  it("uses separate folio and stay status badges in the table", () => {
    const panel = readFileSync(
      new URL("../components/cashiering/folio-search-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /FolioSearchFolioStatusBadge/);
    assert.match(panel, /FolioSearchStayStatusBadge/);
    assert.match(panel, /InventoryStatusBadge/);
    assert.match(panel, /InventoryViewHeader/);
    assert.match(panel, /InventoryState/);
    assert.match(panel, /Folio Status/);
    assert.match(panel, /Stay Status/);
  });
});
