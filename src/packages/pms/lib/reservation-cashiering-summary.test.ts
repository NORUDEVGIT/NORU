import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { projectReservationCashieringSummary } from "@/packages/pms/lib/reservation-cashiering-summary";

const server = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
  "utf8",
);

const snapshot = { computed_amount: 500, required: true };

describe("projectReservationCashieringSummary", () => {
  it("keeps the room total and deposit requirement when no folio exists", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 4500,
      depositRequirementSnapshot: snapshot,
      folio: null,
    });
    expect(summary.reservationRoomTotal).toBe(4500);
    expect(summary.depositRequired).toBe(500);
    expect(summary.postedRoomCharges).toBeNull();
    expect(summary.paymentReceived).toBeNull();
    expect(summary.depositReceived).toBeNull();
    expect(summary.refunded).toBeNull();
    expect(summary.netPaid).toBeNull();
    expect(summary.folioBalance).toBeNull();
  });

  it("returns zero payment buckets for an open folio with no money lines", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 4500,
      depositRequirementSnapshot: { computed_amount: 0 },
      folio: { balance: 0, transactions: [] },
    });
    expect(summary.depositRequired).toBe(0);
    expect(summary.paymentReceived).toBe(0);
    expect(summary.depositReceived).toBe(0);
    expect(summary.postedRoomCharges).toBe(0);
    expect(summary.refunded).toBe(0);
    expect(summary.netPaid).toBe(0);
    expect(summary.folioBalance).toBe(0);
    expect(summary.postedTax).toBe(0);
    expect(summary.postedTotalCharges).toBe(0);
  });

  it("exposes tax and total charges from the same authoritative ledger summary", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 1800,
      depositRequirementSnapshot: { computed_amount: 1500 },
      folio: {
        balance: 300,
        transactions: [
          { id: "room", type: "charge", category: "room", amount: 1500 },
          { id: "tax", type: "charge", category: "tax", amount: 300 },
          { id: "dep", type: "deposit", category: "deposit", amount: -1500 },
        ],
      },
    });
    expect(summary.postedRoomCharges).toBe(1500);
    expect(summary.postedTax).toBe(300);
    expect(summary.postedTotalCharges).toBe(1800);
    expect(summary.depositReceived).toBe(1500);
    expect(summary.folioBalance).toBe(300);
  });

  it("returns null tax and total charges when there is no folio", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 1800,
      depositRequirementSnapshot: null,
      folio: null,
    });
    expect(summary.postedTax).toBeNull();
    expect(summary.postedTotalCharges).toBeNull();
  });

  it("counts payment lines and leaves deposits out of payment received", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 5000,
      depositRequirementSnapshot: snapshot,
      folio: {
        balance: 3500,
        transactions: [
          { id: "room", type: "charge", category: "room", amount: 4500 },
          { id: "pay", type: "payment", category: "payment", amount: -1000 },
        ],
      },
    });
    expect(summary.postedRoomCharges).toBe(4500);
    expect(summary.reservationRoomTotal).toBe(5000);
    expect(summary.paymentReceived).toBe(1000);
    expect(summary.depositReceived).toBe(0);
    expect(summary.folioBalance).toBe(3500);
  });

  it("nets deposit refunds into deposit received and keeps payment refunds separate", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: 2000,
      depositRequirementSnapshot: snapshot,
      folio: {
        balance: 1500,
        transactions: [
          { id: "room", type: "charge", category: "room", amount: 2000 },
          { id: "dep", type: "deposit", category: "deposit", amount: -800 },
          {
            id: "dep-refund",
            type: "refund",
            category: "refund",
            amount: 300,
            originalTransactionId: "dep",
          },
          { id: "pay", type: "payment", category: "payment", amount: -400 },
          {
            id: "pay-refund",
            type: "refund",
            category: "refund",
            amount: 100,
            originalTransactionId: "pay",
          },
        ],
      },
    });
    expect(summary.depositReceived).toBe(500);
    expect(summary.paymentReceived).toBe(400);
    expect(summary.refunded).toBe(400);
    expect(summary.netPaid).toBe(0);
    expect(summary.postedRoomCharges).toBe(2000);
  });

  it("does not let a payment refund reduce deposit received", () => {
    const summary = projectReservationCashieringSummary({
      reservationRoomTotal: null,
      depositRequirementSnapshot: null,
      folio: {
        balance: -200,
        transactions: [
          { id: "dep", type: "deposit", category: "deposit", amount: -500 },
          {
            id: "pay-refund",
            type: "refund",
            category: "refund",
            amount: 100,
            originalTransactionId: "pay",
          },
        ],
      },
    });
    expect(summary.depositRequired).toBeNull();
    expect(summary.depositReceived).toBe(500);
    expect(summary.paymentReceived).toBe(0);
    expect(summary.refunded).toBe(100);
  });
});

describe("getReservationCashieringSummary auth", () => {
  it("uses the reservation manager gate", () => {
    const start = server.indexOf("export const getReservationCashieringSummary");
    expect(start).toBeGreaterThan(-1);
    const body = server.slice(start, start + 1800);
    expect(body).toContain("requireReservationManager");
    expect(body).not.toContain("requireCashieringAccess");
    expect(body).not.toContain("requireCashierOperator");
  });
});
