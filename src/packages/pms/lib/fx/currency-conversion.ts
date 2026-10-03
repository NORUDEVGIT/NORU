/**
 * Decimal-Safe Financial Currency Conversion.
 *
 * Implements exact fixed-point financial arithmetic to avoid IEEE 754
 * floating-point drift (e.g. 0.1 + 0.2 !== 0.3).
 *
 * Rate convention in NORU PMS:
 * 1 BASE (ETB) = rate QUOTE
 */

import type { CurrencyRounding } from "../currency-card3.server";

export interface MoneyConversionParams {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rates: Record<string, number>; // 1 ETB = rate Quote
  baseCurrency?: string; // defaults to "ETB"
  decimals?: number; // target decimal places, defaults to 2
  rounding?: CurrencyRounding; // defaults to "half_up"
}

export interface MoneyConversionResult {
  convertedAmount: number;
  rateUsed: number;
  rateDirection: string;
}

const SCALE = 10_000_000_000n; // 10^10 internal calculation precision

function toScaled(value: number): bigint {
  const parts = value.toString().split(".");
  const intPart = BigInt(parts[0] || "0");
  const fracPart = parts[1] || "";
  const paddedFrac = fracPart.padEnd(10, "0").slice(0, 10);
  const fracBig = BigInt(paddedFrac);
  return intPart * SCALE + (intPart >= 0n ? fracBig : -fracBig);
}

function roundScaled(scaled: bigint, decimals: number, rounding: CurrencyRounding): number {
  const divisor = 10n ** BigInt(10 - decimals);
  const remainder = scaled % divisor;
  let quotient = scaled / divisor;

  const half = divisor / 2n;
  const isNegative = scaled < 0n;
  const absRemainder = remainder < 0n ? -remainder : remainder;

  switch (rounding) {
    case "down":
      // Truncate towards zero
      break;
    case "up":
      // Away from zero if there's any remainder
      if (absRemainder > 0n) {
        quotient += isNegative ? -1n : 1n;
      }
      break;
    case "half_even": {
      // Banker's rounding
      if (absRemainder > half) {
        quotient += isNegative ? -1n : 1n;
      } else if (absRemainder === half) {
        const isOdd = quotient % 2n !== 0n;
        if (isOdd) {
          quotient += isNegative ? -1n : 1n;
        }
      }
      break;
    }
    case "half_up":
    default: {
      // Standard commercial rounding (>= half rounds away from zero)
      if (absRemainder >= half) {
        quotient += isNegative ? -1n : 1n;
      }
      break;
    }
  }

  return Number(quotient) / 10 ** decimals;
}

export function convertMoney(params: MoneyConversionParams): MoneyConversionResult {
  const {
    amount,
    fromCurrency,
    toCurrency,
    rates,
    baseCurrency = "ETB",
    decimals = 2,
    rounding = "half_up",
  } = params;

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid conversion amount: ${amount}`);
  }

  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  const base = baseCurrency.trim().toUpperCase();

  // Same currency: 1:1, no conversion
  if (from === to) {
    return {
      convertedAmount: roundScaled(toScaled(amount), decimals, rounding),
      rateUsed: 1,
      rateDirection: `1 ${from} = 1.0000 ${to}`,
    };
  }

  // Zero amount
  if (amount === 0) {
    return {
      convertedAmount: 0,
      rateUsed: from === base ? (rates[to] ?? 1) : (rates[from] ?? 1),
      rateDirection: `1 ${from} = ... ${to}`,
    };
  }

  const scaledAmount = toScaled(amount);

  // Case 1: From Base (ETB) -> Quote
  if (from === base) {
    const rate = rates[to];
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Missing or invalid exchange rate for quote currency ${to}.`);
    }

    const scaledRate = toScaled(rate);
    const convertedScaled = (scaledAmount * scaledRate) / SCALE;

    return {
      convertedAmount: roundScaled(convertedScaled, decimals, rounding),
      rateUsed: rate,
      rateDirection: `1 ${base} = ${rate} ${to}`,
    };
  }

  // Case 2: From Quote -> Base (ETB)
  if (to === base) {
    const rate = rates[from];
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Missing or invalid exchange rate for currency ${from}.`);
    }

    const scaledRate = toScaled(rate);
    const convertedScaled = (scaledAmount * SCALE) / scaledRate;

    return {
      convertedAmount: roundScaled(convertedScaled, decimals, rounding),
      rateUsed: rate,
      rateDirection: `1 ${base} = ${rate} ${from}`,
    };
  }

  // Case 3: Foreign -> Foreign (through Base ETB)
  const fromRate = rates[from];
  const toRate = rates[to];

  if (!fromRate || !Number.isFinite(fromRate) || fromRate <= 0) {
    throw new Error(`Missing or invalid exchange rate for source currency ${from}.`);
  }
  if (!toRate || !Number.isFinite(toRate) || toRate <= 0) {
    throw new Error(`Missing or invalid exchange rate for target currency ${to}.`);
  }

  const scaledFromRate = toScaled(fromRate);
  const scaledToRate = toScaled(toRate);

  // amount_in_etb = amount / fromRate
  // amount_in_to = amount_in_etb * toRate = (amount * toRate) / fromRate
  const convertedScaled = (scaledAmount * scaledToRate) / scaledFromRate;
  const effectiveCrossRate = toRate / fromRate;

  return {
    convertedAmount: roundScaled(convertedScaled, decimals, rounding),
    rateUsed: effectiveCrossRate,
    rateDirection: `1 ${from} = ${effectiveCrossRate.toFixed(6)} ${to} (via ${base})`,
  };
}
