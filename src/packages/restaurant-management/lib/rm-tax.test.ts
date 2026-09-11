import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SAMPLE_BILL_MERCHANDISE,
  billFromOrderSnapshot,
  computeRmBill,
  normalizeRate,
  parseRmTaxSettings,
  taxLabel,
} from "./rm-tax.ts";

const MERCH = SAMPLE_BILL_MERCHANDISE;

describe("RM tax calculator", () => {
  it("adds exclusive 15% on top of merchandise (no extract)", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 15,
      taxInclusive: false,
      serviceEnabled: false,
      serviceRate: 0,
    });
    assert.equal(bill.merchandiseSubtotal, 100);
    assert.equal(bill.merchandiseNet, 100);
    assert.equal(bill.taxAmount, 15);
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 115);
    assert.equal(bill.taxLabel, "Tax (added)");
    assert.equal(taxLabel(false), "Tax (added)");
  });

  it("extracts inclusive 15% and does not double-add tax to payable", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 15,
      taxInclusive: true,
      serviceEnabled: false,
      serviceRate: 0,
    });
    assert.equal(bill.merchandiseSubtotal, 100);
    assert.equal(bill.taxAmount, 13.04);
    assert.equal(bill.merchandiseNet, 86.96);
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 100);
    assert.equal(bill.taxLabel, "Tax (included)");
    assert.notEqual(bill.payable, bill.merchandiseSubtotal + bill.taxAmount);
  });

  it("charges service 10% of exclusive merchandise net plus exclusive tax", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 15,
      taxInclusive: false,
      serviceEnabled: true,
      serviceRate: 10,
    });
    assert.equal(bill.taxAmount, 15);
    assert.equal(bill.serviceAmount, 10);
    assert.equal(bill.payable, 125);
  });

  it("leaves service at 0 when service is off even if a rate is stored", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 15,
      taxInclusive: false,
      serviceEnabled: false,
      serviceRate: 10,
    });
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 115);
  });

  it("keeps 0% tax as today's price × quantity payable", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 0,
      taxInclusive: false,
      serviceEnabled: false,
      serviceRate: 0,
    });
    assert.equal(bill.taxAmount, 0);
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 100);
  });

  it("applies service to inclusive merchandise net, not the tax-inclusive price", () => {
    const bill = computeRmBill(MERCH, {
      taxRate: 15,
      taxInclusive: true,
      serviceEnabled: true,
      serviceRate: 10,
    });
    assert.equal(bill.taxAmount, 13.04);
    assert.equal(bill.merchandiseNet, 86.96);
    assert.equal(bill.serviceAmount, 8.7);
    assert.equal(bill.payable, 108.7);
  });
});

describe("RM tax helpers", () => {
  it("clamps rates to 0–100", () => {
    assert.equal(normalizeRate(-4), 0);
    assert.equal(normalizeRate(150), 100);
    assert.equal(normalizeRate(12.345), 12.35);
  });

  it("parses restaurant rows with defaults when columns are empty", () => {
    assert.deepEqual(parseRmTaxSettings(null), {
      taxRate: 0,
      taxInclusive: false,
      serviceEnabled: false,
      serviceRate: 0,
    });
    assert.deepEqual(
      parseRmTaxSettings({
        tax_rate: "15.00",
        tax_inclusive: true,
        service_enabled: true,
        service_rate: "10",
      }),
      { taxRate: 15, taxInclusive: true, serviceEnabled: true, serviceRate: 10 },
    );
  });

  it("treats a null historical snapshot as legacy price × qty", () => {
    const bill = billFromOrderSnapshot({
      merchandiseSubtotal: null,
      taxAmount: null,
      serviceAmount: null,
      taxRate: null,
      taxInclusive: null,
      serviceEnabled: null,
      serviceRate: null,
      payable: 42.5,
    });
    assert.equal(bill.merchandiseSubtotal, 42.5);
    assert.equal(bill.taxAmount, 0);
    assert.equal(bill.serviceAmount, 0);
    assert.equal(bill.payable, 42.5);
  });
});
