/**
 * The day's postings as End of Day shows them (Step 7) — pure.
 *
 * Buckets come only from stored transaction_type, category, and reference_type.
 * Nothing is re-priced or inferred. A write-off is the existing
 * post_settlement_write_off posting (adjustment / settlement_write_off).
 */

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type DayFinanceTransaction = {
  transactionType: string;
  category: string | null;
  amount: number;
  paymentMethod: string | null;
  referenceType: string | null;
};

export type DayFinance = {
  currency: string;
  transactionCount: number;
  charges: {
    room: number;
    package: number;
    other: number;
    tax: number;
    serviceCharge: number;
    total: number;
  };
  payments: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  deposits: number;
  refunds: number;
  discounts: number;
  /** Adjustments other than write-offs, signed. */
  adjustments: number;
  writeOffs: number;
  transfersIn: number;
  transfersOut: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function emptyDayFinance(currency: string): DayFinance {
  return {
    currency,
    transactionCount: 0,
    charges: { room: 0, package: 0, other: 0, tax: 0, serviceCharge: 0, total: 0 },
    payments: 0,
    paymentsByMethod: { cash: 0, card: 0, bank_transfer: 0, mobile_money: 0, other: 0 },
    deposits: 0,
    refunds: 0,
    discounts: 0,
    adjustments: 0,
    writeOffs: 0,
    transfersIn: 0,
    transfersOut: 0,
  };
}

/** Transactions already filtered to the audit business date. */
export function summarizeDayFinance(
  transactions: readonly DayFinanceTransaction[],
  currency: string,
): DayFinance {
  const day = emptyDayFinance(currency);
  for (const txn of transactions) {
    day.transactionCount += 1;
    const amount = Number.isFinite(txn.amount) ? txn.amount : 0;
    switch (txn.transactionType) {
      case "charge": {
        if (txn.category === "room") day.charges.room += amount;
        else if (txn.category === "package") day.charges.package += amount;
        else if (txn.category === "tax") day.charges.tax += amount;
        else if (txn.category === "service_charge") day.charges.serviceCharge += amount;
        else day.charges.other += amount;
        day.charges.total += amount;
        break;
      }
      case "payment": {
        const value = Math.abs(amount);
        day.payments += value;
        const method = (PAYMENT_METHODS as readonly string[]).includes(txn.paymentMethod ?? "")
          ? (txn.paymentMethod as PaymentMethod)
          : "other";
        day.paymentsByMethod[method] += value;
        break;
      }
      case "deposit":
        day.deposits += Math.abs(amount);
        break;
      case "refund":
        day.refunds += Math.abs(amount);
        break;
      case "discount":
        day.discounts += Math.abs(amount);
        break;
      case "adjustment":
        if (txn.referenceType === "settlement_write_off") day.writeOffs += Math.abs(amount);
        else day.adjustments += amount;
        break;
      case "transfer_in":
        day.transfersIn += Math.abs(amount);
        break;
      case "transfer_out":
        day.transfersOut += Math.abs(amount);
        break;
      default:
        day.adjustments += amount;
    }
  }
  day.charges = {
    room: round2(day.charges.room),
    package: round2(day.charges.package),
    other: round2(day.charges.other),
    tax: round2(day.charges.tax),
    serviceCharge: round2(day.charges.serviceCharge),
    total: round2(day.charges.total),
  };
  day.payments = round2(day.payments);
  for (const method of PAYMENT_METHODS)
    day.paymentsByMethod[method] = round2(day.paymentsByMethod[method]);
  day.deposits = round2(day.deposits);
  day.refunds = round2(day.refunds);
  day.discounts = round2(day.discounts);
  day.adjustments = round2(day.adjustments);
  day.writeOffs = round2(day.writeOffs);
  day.transfersIn = round2(day.transfersIn);
  day.transfersOut = round2(day.transfersOut);
  return day;
}

/** The pre-redesign summary.finance shape, still written so older History readers keep working. */
export function legacyAuditFinance(day: DayFinance) {
  return {
    currency: day.currency,
    roomRevenue: day.charges.room,
    otherCharges: round2(day.charges.total - day.charges.room),
    charges: day.charges.total,
    payments: day.payments,
    deposits: day.deposits,
    refunds: day.refunds,
    discounts: day.discounts,
    adjustments: round2(day.adjustments - day.writeOffs),
    paymentsByMethod: { ...day.paymentsByMethod },
  };
}
