import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createMoneyNeedsFolio,
  createReceiptShapeError,
  emptyCreateMoneyResult,
  normalizeCreateReceipt,
  parseCreateReceiptInput,
} from "./reservation-create-money.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("create reservation money", () => {
  it("posts nothing and opens no folio when both amounts are absent or zero", () => {
    const payment = normalizeCreateReceipt({ amount: 0, tender: "CASH" });
    const guestDeposit = normalizeCreateReceipt({ amount: null });
    assert.equal(payment.amount, null);
    assert.equal(createMoneyNeedsFolio(payment, guestDeposit), false);
    assert.equal(createReceiptShapeError(payment), null);
    assert.deepEqual(emptyCreateMoneyResult(), {
      paymentPosted: false,
      paymentError: null,
      guestDepositPosted: false,
      guestDepositError: null,
      folioOpened: false,
    });
  });

  it("keeps a reservation payment and a guest deposit as separate posts", () => {
    const payment = normalizeCreateReceipt({
      amount: 1500,
      tender: " CASH ",
      reference: " R-1 ",
      idempotencyKey: "payment-key-1",
    });
    const guestDeposit = normalizeCreateReceipt({
      amount: 500,
      tender: "CARD",
      idempotencyKey: "deposit-key-1",
    });
    assert.equal(payment.amount, 1500);
    assert.equal(payment.tender, "CASH");
    assert.equal(payment.reference, "R-1");
    assert.equal(createReceiptShapeError(payment), null);
    assert.equal(createReceiptShapeError(guestDeposit), null);
    assert.equal(createMoneyNeedsFolio(payment, normalizeCreateReceipt({ amount: null })), true);
    assert.equal(createMoneyNeedsFolio(normalizeCreateReceipt({ amount: null }), guestDeposit), true);
    assert.equal(
      createReceiptShapeError(normalizeCreateReceipt({ amount: 1500, tender: null })),
      "Choose a tender for the amount received.",
    );
    assert.equal(
      parseCreateReceiptInput({
        amount: "",
        tender: "",
        reference: "",
        idempotencyKey: "unused-key",
      }).amount,
      null,
    );
    assert.throws(
      () =>
        parseCreateReceiptInput({
          amount: "1500",
          tender: "",
          reference: "",
          idempotencyKey: "payment-key-1",
        }),
      /Choose a tender/,
    );
  });

  it("opens the folio only inside the money post and does not store the received amount", () => {
    const functions = read("./reservations.functions.ts");
    const poster = functions.slice(
      functions.indexOf("async function postCreateReservationMoney"),
      functions.indexOf("export const createReservation"),
    );
    assert.match(poster, /if \(!createMoneyNeedsFolio/);
    assert.match(poster, /open_folio_for_reservation/);
    assert.match(poster, /type: "payment"/);
    assert.match(poster, /type: "deposit"/);
    assert.doesNotMatch(poster, /hotel_reservations/);
    assert.doesNotMatch(poster, /postCheckInDeposit|captureCard|cardNumber/);
    const createStart = functions.indexOf("export const createReservation");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendReservation"));
    assert.match(createFn, /postCreateReservationMoney/);
    assert.match(createFn, /persistDepositRequirementSnapshot/);
    const persistAt = createFn.indexOf("persistDepositRequirementSnapshot");
    const postAt = createFn.indexOf("postCreateReservationMoney");
    assert.ok(persistAt > 0 && postAt > persistAt);
  });
});
