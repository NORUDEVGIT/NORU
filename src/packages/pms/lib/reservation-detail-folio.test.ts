import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FolioDetail, FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import {
  depositPaidFromLedger,
  folioActiveLabel,
  folioActorLabel,
  folioDepositStatus,
  folioKpiCards,
  folioLedgerSummary,
  guestDepositCreditFromLedger,
  netPaidFromLedger,
  paymentRows,
  paymentTenderStatus,
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
  issuedInvoices: [],
  legacyFolioInvoice: false,
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
    expect(workspace).not.toContain("onBackToPackages");
    expect(workspace).not.toContain("% of total");
    expect(overview).toContain('{ id: "folio", label: "Folio & Payments" }');
    expect(overview).not.toMatch(/id: "folio".*deferred: true/);
    expect(folioUi).toContain("getReservationFolio");
    expect(folioUi).toContain("getFolio");
    expect(folioUi).toContain("issueGuestFolioInvoice");
    expect(folioUi).toContain("FolioEntryDialog");
    expect(folioUi).toContain("CloseFolioDialog");
    expect(folioUi).not.toContain("Back to Packages");
    expect(folioUi).not.toContain("Add Folio");
    expect(folioUi).not.toContain("Save Changes");
  });

  it("uses stored ledger totals and keeps refunds out of total charges", () => {
    expect(folioActiveLabel("open")).toBe("Open");
    expect(folioActiveLabel("closed")).toBe("Closed");
    const summary = folioLedgerSummary(folio);
    expect(summary?.totalCharges).toBe(5700);
    expect(summary?.payments).toBe(4500);
    expect(summary?.refunds).toBe(0);
    expect(summary?.balance).toBe(1200);
    expect(summary?.roomCharges).toBe(4500);
    expect(summary?.otherCharges).toBe(1200);
    expect(summary?.packageCharges).toBe(0);
    expect(summary?.tax).toBe(0);
    expect(summary?.serviceCharge).toBe(0);
    const taxed = folioLedgerSummary({
      ...folio,
      transactions: [
        ...folio.transactions,
        txn({
          id: "5",
          type: "charge",
          category: "tax",
          amount: 675,
          originalTransactionId: "1",
        }),
        txn({
          id: "6",
          type: "charge",
          category: "service_charge",
          amount: 50,
        }),
      ],
    });
    expect(taxed?.tax).toBe(675);
    expect(taxed?.serviceCharge).toBe(50);
    expect(taxed?.totalCharges).toBe(6425);
    expect(taxed?.otherCharges).toBe(1200);
    expect(summary?.depositCredits).toBe(4500);
    expect(depositPaidFromLedger(summary)).toBe(4500);
    expect(guestDepositCreditFromLedger(summary)).toBe(4500);
    expect(folioUi).toContain("Guest deposit credit");
    expect(folioUi).toContain("Service Charge");
    expect(folioUi).toContain("Refunds");
    const cards = folioKpiCards(folio);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.realFolio).toBe(true);
    expect(cards[0]?.amountLabel).toBe("Balance");
    expect(cards[0]?.amount).toBe(1200);
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
          reference: null,
        },
        4500,
      ),
    ).toBe("Received");
  });

  it("keeps a refund out of total charges and ordinary payments out of deposit paid", () => {
    const example = folioLedgerSummary({
      ...folio,
      charges: 1480,
      credits: 1380,
      balance: 100,
      transactions: [
        txn({ id: "room", type: "charge", category: "room", amount: 1150 }),
        txn({ id: "svc", type: "charge", category: "service_charge", amount: 57.5 }),
        txn({ id: "vat", type: "charge", category: "tax", amount: 172.5 }),
        txn({ id: "pay", type: "payment", category: "payment", amount: -1380 }),
        txn({
          id: "ref",
          type: "refund",
          category: "refund",
          amount: 100,
          originalTransactionId: "pay",
        }),
      ],
    });
    expect(example?.roomCharges).toBe(1150);
    expect(example?.serviceCharge).toBe(57.5);
    expect(example?.tax).toBe(172.5);
    expect(example?.totalCharges).toBe(1380);
    expect(example?.payments).toBe(1380);
    expect(example?.refunds).toBe(100);
    expect(example?.balance).toBe(100);
    expect(netPaidFromLedger(example)).toBe(1280);
    expect(depositPaidFromLedger(example)).toBe(0);
    expect(folioDepositStatus(null, depositPaidFromLedger(example))).toBe(DETAIL_DASH);
    expect(
      paymentTenderStatus(
        example
          ? { ...txn({ id: "pay", type: "payment", amount: -1380 }), originalTransactionId: null }
          : txn({ id: "pay", type: "payment", amount: -1380 }),
        [
          txn({ id: "pay", type: "payment", amount: -1380 }),
          txn({ id: "ref", type: "refund", amount: 100, originalTransactionId: "pay" }),
        ],
      ),
    ).toBe("Partially refunded");
    expect(folioActorLabel({ postedBy: null, actorState: "system" })).toBe("System");
    expect(folioActorLabel({ postedBy: null, actorState: "unavailable" })).toBe("Unavailable");
    expect(folioActorLabel({ postedBy: "Abel Abraha", actorState: "staff" })).toBe("Abel Abraha");
  });

  it("treats Paid Amount as deposit credit and keeps ordinary payments separate", () => {
    const split = folioLedgerSummary({
      ...folio,
      transactions: [
        txn({ id: "room", type: "charge", category: "room", amount: 1500 }),
        txn({ id: "pay", type: "payment", category: "payment", amount: -1500 }),
        txn({ id: "dep", type: "deposit", category: "deposit", amount: -500 }),
      ],
    });
    const requirement = {
      required: true,
      amount: 1500,
      currency: "ETB",
      name: null,
      tenderCode: null,
      type: "fixed" as const,
      reference: null,
    };
    expect(depositPaidFromLedger(split)).toBe(500);
    expect(split?.payments).toBe(1500);
    expect(guestDepositCreditFromLedger(split)).toBe(500);
    expect(folioDepositStatus(requirement, depositPaidFromLedger(split))).toBe("Partial");
    expect(
      folioDepositStatus(
        requirement,
        depositPaidFromLedger(
          folioLedgerSummary({
            ...folio,
            transactions: [
              txn({ id: "room", type: "charge", category: "room", amount: 1500 }),
              txn({ id: "pay", type: "payment", category: "payment", amount: -1000 }),
              txn({ id: "dep", type: "deposit", category: "deposit", amount: -500 }),
            ],
          }),
        ),
      ),
    ).toBe("Partial");
    expect(
      folioDepositStatus(
        requirement,
        depositPaidFromLedger(
          folioLedgerSummary({
            ...folio,
            transactions: [txn({ id: "dep", type: "deposit", category: "deposit", amount: -500 })],
          }),
        ),
      ),
    ).toBe("Partial");
    expect(
      folioDepositStatus(
        requirement,
        depositPaidFromLedger(
          folioLedgerSummary({
            ...folio,
            transactions: [txn({ id: "pay", type: "payment", category: "payment", amount: -1500 })],
          }),
        ),
      ),
    ).toBe("Pending");
    expect(folioDepositStatus({ ...requirement, required: false, amount: null }, 0)).toBe(
      "Not required",
    );
  });

  it("hands invoice to Cashiering and does not persist folio notes in this tab", () => {
    expect(folioUi).toContain("issueGuestFolioInvoice");
    expect(folioUi).not.toContain("FOLIO_INVOICE_GAP_COPY");
    expect(folioUi).not.toContain("FOLIO_BILLING_EDIT_GAP_COPY");
    expect(folioUi).not.toContain("FOLIO_NOTES_GAP_COPY");
    expect(folioUi).toContain("folioLineQuantity");
    expect(folioUi).toContain("folioRunningBalances");
    expect(folioUi).toContain("roomUnitLabel");
    expect(folioUi).toContain("getReservationDepositRemainder");
    expect(folioUi).toContain("Refundable");
    expect(folioUi).toContain("folioActorLabel");
    expect(folioUi).not.toContain("initializeFolio");
    expect(folioUi).not.toContain("amendReservation");
  });

  it("counts a posted package charge without touching room, tax, payment, or deposit totals", () => {
    const posted = folioLedgerSummary({
      ...folio,
      balance: 3200,
      transactions: [
        ...folio.transactions,
        txn({
          id: "pkg",
          type: "charge",
          category: "package",
          amount: 2000,
          description: "Breakfast package",
          referenceType: "reservation_package_charge",
        }),
      ],
    });
    expect(posted?.packageCharges).toBe(2000);
    expect(posted?.roomCharges).toBe(4500);
    expect(posted?.otherCharges).toBe(1200);
    expect(posted?.tax).toBe(0);
    expect(posted?.serviceCharge).toBe(0);
    expect(posted?.payments).toBe(4500);
    expect(posted?.depositCredits).toBe(4500);
    expect(posted?.refunds).toBe(0);
    expect(posted?.totalCharges).toBe(7700);
    expect(posted?.balance).toBe(3200);

    const reversed = folioLedgerSummary({
      ...folio,
      balance: 1200,
      transactions: [
        ...folio.transactions,
        txn({
          id: "pkg",
          type: "charge",
          category: "package",
          amount: 2000,
          referenceType: "reservation_package_charge",
        }),
        txn({
          id: "rev",
          type: "adjustment",
          category: "adjustment",
          amount: -2000,
          referenceType: "charge_reversal",
          originalTransactionId: "pkg",
        }),
      ],
    });
    expect(reversed?.packageCharges).toBe(2000);
    expect(reversed?.adjustments).toBe(-2000);
    expect(reversed?.packageCharges + (reversed?.adjustments ?? 0)).toBe(0);
    expect(reversed?.roomCharges).toBe(4500);
    expect(reversed?.payments).toBe(4500);
    expect(reversed?.depositCredits).toBe(4500);
    expect(reversed?.refunds).toBe(0);
    expect(reversed?.tax).toBe(0);
    expect(reversed?.serviceCharge).toBe(0);
    expect(reversed?.balance).toBe(1200);
  });
});
