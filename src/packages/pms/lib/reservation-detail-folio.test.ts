import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FolioDetail, FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import {
  folioActiveLabel,
  folioDepositStatus,
  folioKpiCards,
  folioLedgerSummary,
  paymentRows,
} from "@/packages/pms/lib/reservation-detail-folio";

const folioUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-folio.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const overview = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservation-detail-overview.ts"),
  "utf8",
);

function txn(
  partial: Partial<FolioTransactionRow> & Pick<FolioTransactionRow, "id" | "type" | "amount">,
): FolioTransactionRow {
  return {
    category: "manual",
    description: "Line",
    postedAt: "2026-09-20T10:00:00Z",
    referenceType: null,
    paymentMethod: null,
    postedBy: "Abebaw",
    originalTransactionId: null,
    sourceDescription: null,
    ...partial,
  };
}

const folio: FolioDetail = {
  id: "folio-1",
  folioNumber: "GF-1",
  status: "open",
  currency: "ETB",
  guestName: "Maria Santos",
  reservationId: "res-1",
  confirmationNumber: "NR-000245",
  openedAt: "2026-09-20T10:00:00Z",
  closedAt: null,
  charges: 5700,
  credits: 4500,
  balance: 1200,
  unsettledCheckout: false,
  roomNumber: null,
  roomTypeName: "Deluxe King",
  reservationStatus: "confirmed",
  arrivalDate: "2026-09-22",
  departureDate: "2026-09-24",
  guestId: "guest-1",
  guestEmail: "maria@email.com",
  guestPhone: "+351",
  issuedInvoice: null,
  transactions: [
    txn({ id: "1", type: "charge", category: "room", amount: 4500, description: "Deluxe King" }),
    txn({
      id: "2",
      type: "charge",
      category: "manual",
      amount: 1200,
      description: "Airport Transfer",
    }),
    txn({
      id: "3",
      type: "payment",
      category: "payment",
      amount: -4500,
      paymentMethod: "card",
      referenceType: "PAY-00123",
    }),
    txn({ id: "4", type: "deposit", category: "deposit", amount: -4500 }),
  ],
};

describe("Reservation Detail Folio & Payments tab", () => {
  it("wires the Folio workspace into the existing overlay", () => {
    expect(workspace).toContain("<ReservationDetailFolioTab");
    expect(workspace).toContain('detailTab === "folio"');
    expect(workspace).toContain('onBackToPackages={() => setDetailTab("packages")}');
    expect(overview).toContain('{ id: "folio", label: "Folio & Payments" }');
    expect(overview).not.toMatch(/id: "folio".*deferred: true/);
    expect(folioUi).toContain("getReservationFolio");
    expect(folioUi).toContain("getFolio");
    expect(folioUi).toContain("FolioEntryDialog");
    expect(folioUi).toContain("CloseFolioDialog");
    expect(folioUi).toContain("Back to Packages");
  });

  it("uses stored ledger totals and does not invent extra folios or taxes", () => {
    expect(folioActiveLabel("open")).toBe("Active");
    const summary = folioLedgerSummary(folio);
    expect(summary?.totalCharges).toBe(5700);
    expect(summary?.totalPayments).toBe(4500);
    expect(summary?.balance).toBe(1200);
    expect(summary?.roomCharges).toBe(4500);
    expect(summary?.otherCharges).toBe(1200);
    expect(summary?.packageCharges).toBe(0);
    expect(summary?.taxes).toBeNull();
    expect(summary?.depositCredits).toBe(4500);
    const cards = folioKpiCards(folio, summary);
    expect(cards.find((card) => card.id === "room")?.realFolio).toBe(true);
    expect(cards.find((card) => card.id === "extras")?.amount).toBeNull();
    expect(cards.find((card) => card.id === "city_ledger")?.realFolio).toBe(false);
    expect(paymentRows(folio)).toHaveLength(2);
    expect(
      folioDepositStatus(
        {
          required: true,
          amount: 4500,
          currency: "ETB",
          name: null,
          tenderCode: null,
          type: "percent",
        },
        4500,
      ),
    ).toBe("Received");
  });

  it("keeps invoice, billing edit, notes, qty, and line balance honest", () => {
    expect(folioUi).toContain("FOLIO_INVOICE_GAP_COPY");
    expect(folioUi).toContain("FOLIO_BILLING_EDIT_GAP_COPY");
    expect(folioUi).toContain("FOLIO_NOTES_GAP_COPY");
    expect(folioUi).toContain("FOLIO_LINE_QTY_GAP");
    expect(folioUi).toContain("FOLIO_LINE_BALANCE_GAP");
    expect(folioUi).not.toContain("initializeFolio");
    expect(folioUi).not.toContain("amendReservation");
  });
});
