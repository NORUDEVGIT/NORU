/**
 * Pure tax-on-post helpers mirroring SQL rounding in 0135_cashiering_phase4_tax_on_post.sql.
 */

export type TaxComponentInput = {
  chargeType: "percentage" | "fixed";
  rate: number;
  calculation: "inclusive" | "exclusive";
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeTaxComponentAmount(
  base: number,
  { chargeType, rate, calculation }: TaxComponentInput,
): number {
  if (!(base > 0)) return 0;
  let line: number;
  if (chargeType === "fixed") {
    line = calculation === "inclusive" ? Math.min(rate, base) : rate;
  } else if (calculation === "inclusive") {
    line = (base * rate) / (100 + rate);
  } else {
    line = (base * rate) / 100;
  }
  return roundMoney(line);
}

/** Exclusive percentage taxes on a net base; each line rounded to 2dp. */
export function computeExclusiveTaxLines(
  netBase: number,
  taxes: Array<{ code: string; rate: number }>,
): { netBase: number; lines: Array<{ code: string; amount: number }> } {
  const lines = taxes.map((tax) => ({
    code: tax.code,
    amount: computeTaxComponentAmount(netBase, {
      chargeType: "percentage",
      rate: tax.rate,
      calculation: "exclusive",
    }),
  }));
  return { netBase, lines };
}

/** Inclusive gross split: fixed first, then percentage on remaining (single pass). */
export function splitInclusiveGross(
  gross: number,
  taxes: TaxComponentInput[],
): { netBase: number; lines: number[] } {
  let remaining = roundMoney(gross);
  const lines: number[] = [];
  for (const tax of taxes) {
    const line = computeTaxComponentAmount(remaining, tax);
    if (line > 0) {
      lines.push(line);
      remaining = roundMoney(remaining - line);
    }
  }
  return { netBase: remaining, lines };
}
