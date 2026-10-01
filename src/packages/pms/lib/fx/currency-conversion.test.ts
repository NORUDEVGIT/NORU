import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertMoney } from "./currency-conversion";

describe("Decimal-safe currency conversion", () => {
  // Rates: 1 ETB = 0.00782 USD, 1 ETB = 0.00715 EUR
  const mockRates = {
    USD: 0.00782,
    EUR: 0.00715,
    GBP: 0.00612,
  };

  it("converts ETB -> USD using exact rate", () => {
    // 10,000 ETB * 0.00782 = 78.20 USD
    const res = convertMoney({
      amount: 10_000,
      fromCurrency: "ETB",
      toCurrency: "USD",
      rates: mockRates,
      decimals: 2,
    });
    assert.equal(res.convertedAmount, 78.2);
    assert.equal(res.rateUsed, 0.00782);
    assert.equal(res.rateDirection, "1 ETB = 0.00782 USD");
  });

  it("converts USD -> ETB using exact division", () => {
    // 100 USD / 0.00782 = 12787.72378... -> 12787.72 ETB
    const res = convertMoney({
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "ETB",
      rates: mockRates,
      decimals: 2,
    });
    assert.equal(res.convertedAmount, 12787.72);
    assert.equal(res.rateUsed, 0.00782);
  });

  it("converts Foreign -> Foreign through ETB without floating point drift", () => {
    // 100 EUR in ETB: 100 / 0.00715 = 13986.013986...
    // In USD: 13986.013986... * 0.00782 = 109.3706... -> 109.37 USD
    const res = convertMoney({
      amount: 100,
      fromCurrency: "EUR",
      toCurrency: "USD",
      rates: mockRates,
      decimals: 2,
    });
    assert.equal(res.convertedAmount, 109.37);
  });

  it("returns unchanged amount for same currency", () => {
    const res = convertMoney({
      amount: 250.5,
      fromCurrency: "USD",
      toCurrency: "USD",
      rates: mockRates,
    });
    assert.equal(res.convertedAmount, 250.5);
    assert.equal(res.rateUsed, 1);
  });

  it("handles zero amount safely", () => {
    const res = convertMoney({
      amount: 0,
      fromCurrency: "ETB",
      toCurrency: "USD",
      rates: mockRates,
    });
    assert.equal(res.convertedAmount, 0);
  });

  it("respects rounding modes", () => {
    // 1000 ETB * 0.0078255 = 7.8255
    const rates = { TEST: 0.0078255 };

    const halfUp = convertMoney({
      amount: 1000,
      fromCurrency: "ETB",
      toCurrency: "TEST",
      rates,
      decimals: 2,
      rounding: "half_up",
    });
    assert.equal(halfUp.convertedAmount, 7.83);

    const down = convertMoney({
      amount: 1000,
      fromCurrency: "ETB",
      toCurrency: "TEST",
      rates,
      decimals: 2,
      rounding: "down",
    });
    assert.equal(down.convertedAmount, 7.82);

    const up = convertMoney({
      amount: 1000,
      fromCurrency: "ETB",
      toCurrency: "TEST",
      rates,
      decimals: 2,
      rounding: "up",
    });
    assert.equal(up.convertedAmount, 7.83);
  });

  it("rejects missing or zero exchange rates", () => {
    assert.throws(
      () =>
        convertMoney({
          amount: 100,
          fromCurrency: "ETB",
          toCurrency: "JPY",
          rates: mockRates,
        }),
      /Missing or invalid exchange rate for quote currency JPY/,
    );

    assert.throws(
      () =>
        convertMoney({
          amount: 100,
          fromCurrency: "USD",
          toCurrency: "ETB",
          rates: { USD: 0 },
        }),
      /Missing or invalid exchange rate for currency USD/,
    );
  });
});
