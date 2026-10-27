import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { folioCapabilities } from "./folio-workspace";
import {
  foFolioActionState,
  foFolioEntryType,
  foFolioMatchesReservation,
  foFolioSectionRows,
  foFolioSummaryCards,
  foOpenFolioTarget,
} from "./fo-folio-tab";
import type { FolioTransactionRow } from "./cashiering.functions";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const panel = readRel("../components/frontoffice/fo-folio-charges-panel.tsx");
const workspace = readRel("../components/workspaces/front-office-workspace.tsx");
const checkIn = readRel("../components/frontoffice/fo-check-in-workspace-sheet.tsx");
const inHouse = readRel("../components/frontoffice/in-house-quick-view.tsx");

function line(
  partial: Partial<FolioTransactionRow> & Pick<FolioTransactionRow, "id" | "type">,
): FolioTransactionRow {
  return {
    category: "room",
    description: partial.id,
    amount: 10,
    postedAt: "2026-10-26T08:00:00.000Z",
    referenceType: null,
    paymentMethod: null,
    postedBy: null,
    originalTransactionId: null,
    sourceDescription: null,
    ...partial,
  };
}

const closed = folioCapabilities({
  open: false,
  balance: 300,
  canManage: true,
  canOperate: true,
  hasInvoice: true,
  hasLines: true,
  invoiceSettingsAvailable: true,
  legacyFolioInvoice: false,
});

describe("FO folio tab — Open Folio stays on the selected stay", () => {
  it("opens the Front Office workspace on Folio & Charges for the rack stay", () => {
    const checkedIn = foOpenFolioTarget({
      id: "res-a",
      status: "checked_in",
      reservationRoomId: "unit-502",
    });
    assert.deepEqual(checkedIn, {
      surface: "in_house",
      reservationId: "res-a",
      reservationRoomId: "unit-502",
      tab: "folio",
    });
    const departed = foOpenFolioTarget({
      id: "res-b",
      status: "checked_out",
      reservationRoomId: "unit-9",
    });
    assert.equal(departed.surface, "stay");
    assert.equal(departed.tab, "folio");
    assert.match(workspace, /function openFolioWorkspace\(stay: FrontOfficeStay\)/);
    assert.match(workspace, /const target = foOpenFolioTarget\(stay\)/);
    assert.match(workspace, /if \(action === "open_folio"\) \{\s*openFolioWorkspace\(stay\);/s);
    assert.match(checkIn, /setTab\("folio"\)/);
    assert.match(inHouse, /setTab\("folio"\)/);
    assert.match(checkIn, /canReadFolio: canOpenCashiering/);
    assert.match(inHouse, /foGuestWorkspaceTabs\(qv\.stay\.status, \{ canReadFolio \}\)/);
    assert.doesNotMatch(checkIn, /cashieringRefundHref/);
  });

  it("keeps the selected reservation and does not take a sibling unit", () => {
    const room502 = foOpenFolioTarget({
      id: "res-multi",
      status: "checked_in",
      reservationRoomId: "unit-502",
    });
    const room501 = foOpenFolioTarget({
      id: "res-multi",
      status: "checked_in",
      reservationRoomId: "unit-501",
    });
    assert.equal(room502.reservationId, "res-multi");
    assert.equal(room502.reservationRoomId, "unit-502");
    assert.notEqual(room502.reservationRoomId, room501.reservationRoomId);
    assert.equal(foFolioMatchesReservation("res-multi", room502.reservationId), true);
    assert.equal(foFolioMatchesReservation("res-other", room502.reservationId), false);
    assert.equal(foFolioMatchesReservation(null, room502.reservationId), false);
    assert.match(panel, /data-reservation-id=\{reservationId\}/);
    assert.match(panel, /data-reservation-room-id=\{reservationRoomId \?\? ""\}/);
    assert.match(panel, /fetchReservationFolio\(\{ data: \{ restaurantId, reservationId \} \}\)/);
    assert.doesNotMatch(panel, /reservationRoomId: reservationRoomId/);
  });
});

describe("FO folio tab — Cashiering figures and writers", () => {
  it("shows the Cashiering summary buckets without a second ledger", () => {
    assert.deepEqual(
      foFolioSummaryCards({ charges: 1800, payments: 1500, balance: 300, deposits: 0 }).map(
        (card) => [card.id, card.amount],
      ),
      [
        ["charges", 1800],
        ["payments", 1500],
        ["balance", 300],
        ["deposits", 0],
      ],
    );
    const rows = [
      line({ id: "c1", type: "charge", amount: 600 }),
      line({ id: "p1", type: "payment", amount: -500, paymentMethod: "card" }),
      line({ id: "a1", type: "adjustment", amount: -20 }),
    ];
    assert.deepEqual(
      foFolioSectionRows(rows, "charges").map((row) => row.id),
      ["c1"],
    );
    assert.deepEqual(
      foFolioSectionRows(rows, "payments").map((row) => row.id),
      ["p1"],
    );
    assert.match(panel, /getFolioWorkspace/);
    assert.match(panel, /getReservationFolio/);
    assert.match(panel, /charges: folio\.charges/);
    assert.match(panel, /payments: workspace!\.financialSummary\.payments/);
    assert.match(panel, /balance: workspace!\.financialSummary\.currentBalance/);
    assert.match(panel, /deposits: workspace!\.financialSummary\.deposits/);
    assert.doesNotMatch(panel, /folioLedgerSummary|summarizeFolioLedger|createServerFn|\.reduce\(/);
  });

  it("sends permitted actions through the existing folio dialogs and invoice writer", () => {
    const open = folioCapabilities({
      open: true,
      balance: 300,
      canManage: true,
      canOperate: true,
      hasInvoice: false,
      hasLines: true,
      invoiceSettingsAvailable: true,
      legacyFolioInvoice: false,
    });
    assert.equal(
      foFolioActionState({
        action: "post_charge",
        canManage: true,
        canOperate: true,
        capabilities: open,
        hasFolio: true,
      }),
      "enabled",
    );
    assert.equal(foFolioEntryType("post_charge"), "charge");
    assert.equal(foFolioEntryType("record_payment"), "payment");
    assert.equal(foFolioEntryType("post_deposit"), "deposit");
    assert.equal(foFolioEntryType("refund"), "refund");
    assert.match(panel, /<FolioEntryDialog/);
    assert.match(panel, /<CloseFolioDialog/);
    assert.match(panel, /issueGuestFolioInvoice/);
    assert.doesNotMatch(panel, /post_folio_transaction|open_folio_for_reservation/);
  });

  it("hides actions the role cannot perform", () => {
    const open = folioCapabilities({
      open: true,
      balance: 0,
      canManage: true,
      canOperate: true,
      hasInvoice: false,
      hasLines: false,
      invoiceSettingsAvailable: false,
      legacyFolioInvoice: false,
    });
    for (const action of ["post_charge", "record_payment", "post_deposit", "refund"] as const) {
      assert.equal(
        foFolioActionState({
          action,
          canManage: false,
          canOperate: false,
          capabilities: open,
          hasFolio: true,
        }),
        "hidden",
        action,
      );
    }
    assert.equal(
      foFolioActionState({
        action: "print_folio",
        canManage: false,
        canOperate: false,
        capabilities: open,
        hasFolio: true,
      }),
      "enabled",
    );
  });

  it("keeps a closed invoiced folio locked by the Cashiering capabilities", () => {
    assert.equal(closed.canPostCharge, false);
    assert.equal(closed.canPostPayment, false);
    assert.equal(closed.canPostDeposit, false);
    assert.equal(closed.canRefund, false);
    assert.equal(closed.canClose, false);
    for (const action of [
      "post_charge",
      "record_payment",
      "post_deposit",
      "close_folio",
    ] as const) {
      assert.equal(
        foFolioActionState({
          action,
          canManage: true,
          canOperate: true,
          capabilities: closed,
          hasFolio: true,
        }),
        "disabled",
        action,
      );
    }
    assert.match(panel, /disabled=\{state === "disabled"\}/);
    assert.match(panel, /data-testid="fo-folio-status"/);
    assert.match(panel, /data-testid="fo-folio-invoice"/);
  });

  it("opens the full Cashiering folio workspace from the tab", () => {
    assert.match(
      panel,
      /to: "\/restaurant\/pms\/cashiering\/folios\/\$folioId",\s*params: \{ folioId: folio\.id \}/,
    );
    assert.match(panel, /data-testid="fo-folio-open-cashiering"/);
    assert.match(panel, /openCashiering\("history"\)/);
  });
});
