/**
 * Largest-remainder split of a gross transfer across frozen charge components.
 * The database function allocate_transfer_shares is the posting authority.
 * This copy exists so the rounding examples can be locked in unit tests.
 */

export type TransferShareInput = {
  id: string;
  remaining: number;
};

export type TransferShare = {
  id: string;
  share: number;
};

export type TransferLedgerRow = {
  id: string;
  type: string;
  category: string;
  amount: number;
  originalTransactionId?: string | null;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTransferRemainder(chargeId: string, rows: TransferLedgerRow[]): number {
  const charge = rows.find((row) => row.id === chargeId);
  if (!charge || charge.type !== "charge") return 0;
  const moved = rows
    .filter((row) => row.type === "transfer_out" && row.originalTransactionId === chargeId)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0);
  return roundMoney(Math.max(0, charge.amount - moved));
}

export type ChargeGroupRemainder = {
  parentRemaining: number;
  taxRemaining: number;
  serviceRemaining: number;
  grossRemaining: number;
};

/** Remainder after transfers and earlier negative adjustments or discounts. */
export function correctableLineRemainder(chargeId: string, rows: TransferLedgerRow[]): number {
  const charge = rows.find((row) => row.id === chargeId);
  if (!charge || charge.type !== "charge") return 0;
  const moved = rows
    .filter((row) => row.originalTransactionId === chargeId)
    .reduce((sum, row) => {
      if (row.type === "transfer_out" || row.type === "discount") return sum + Math.abs(row.amount);
      if (row.type === "adjustment" && row.amount < 0) return sum - row.amount;
      return sum;
    }, 0);
  return roundMoney(Math.max(0, charge.amount - moved));
}

export function correctableGroupRemainder(
  parentId: string,
  rows: TransferLedgerRow[],
): ChargeGroupRemainder {
  const empty = { parentRemaining: 0, taxRemaining: 0, serviceRemaining: 0, grossRemaining: 0 };
  const parent = rows.find((row) => row.id === parentId);
  if (
    !parent ||
    parent.type !== "charge" ||
    parent.category === "tax" ||
    parent.category === "service_charge"
  ) {
    return empty;
  }
  const parentRemaining = correctableLineRemainder(parent.id, rows);
  let taxRemaining = 0;
  let serviceRemaining = 0;
  for (const row of rows) {
    if (row.originalTransactionId !== parent.id || row.type !== "charge") continue;
    if (row.category === "tax") taxRemaining += correctableLineRemainder(row.id, rows);
    if (row.category === "service_charge") serviceRemaining += correctableLineRemainder(row.id, rows);
  }
  return {
    parentRemaining,
    taxRemaining: roundMoney(taxRemaining),
    serviceRemaining: roundMoney(serviceRemaining),
    grossRemaining: roundMoney(parentRemaining + taxRemaining + serviceRemaining),
  };
}

export function chargeGroupRemainder(
  parentId: string,
  rows: TransferLedgerRow[],
): ChargeGroupRemainder {
  const empty = { parentRemaining: 0, taxRemaining: 0, serviceRemaining: 0, grossRemaining: 0 };
  const parent = rows.find((row) => row.id === parentId);
  if (
    !parent ||
    parent.type !== "charge" ||
    parent.category === "tax" ||
    parent.category === "service_charge"
  ) {
    return empty;
  }
  const parentRemaining = lineTransferRemainder(parent.id, rows);
  let taxRemaining = 0;
  let serviceRemaining = 0;
  for (const row of rows) {
    if (row.originalTransactionId !== parent.id || row.type !== "charge") continue;
    if (row.category === "tax") taxRemaining += lineTransferRemainder(row.id, rows);
    if (row.category === "service_charge") serviceRemaining += lineTransferRemainder(row.id, rows);
  }
  return {
    parentRemaining,
    taxRemaining: roundMoney(taxRemaining),
    serviceRemaining: roundMoney(serviceRemaining),
    grossRemaining: roundMoney(parentRemaining + taxRemaining + serviceRemaining),
  };
}

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function allocateTransferShares(
  components: TransferShareInput[],
  amount: number,
): TransferShare[] {
  if (!(amount > 0)) throw new Error("INVALID_AMOUNT");
  if (components.length === 0) throw new Error("TRANSFER_EXCEEDS_REMAINDER");
  const remCents = components.map((component) => toCents(component.remaining));
  if (remCents.some((cents) => cents <= 0)) throw new Error("TRANSFER_EXCEEDS_REMAINDER");
  const grossCents = remCents.reduce((sum, cents) => sum + cents, 0);
  const amountCents = toCents(amount);
  if (amountCents > grossCents) throw new Error("TRANSFER_EXCEEDS_REMAINDER");
  if (amountCents === grossCents) {
    return components.map((component, index) => ({
      id: component.id,
      share: remCents[index] / 100,
    }));
  }

  const base = remCents.map((cents) => Math.floor((cents * amountCents) / grossCents));
  const frac = remCents.map((cents, index) => (cents * amountCents) / grossCents - base[index]);
  let leftover = amountCents - base.reduce((sum, cents) => sum + cents, 0);
  const used = base.map(() => false);
  while (leftover > 0) {
    let best = -1;
    let bestFrac = -1;
    for (let index = 0; index < base.length; index += 1) {
      if (!used[index] && base[index] < remCents[index] && frac[index] > bestFrac) {
        best = index;
        bestFrac = frac[index];
      }
    }
    if (best < 0) throw new Error("TRANSFER_ALLOCATION_MISMATCH");
    base[best] += 1;
    used[best] = true;
    leftover -= 1;
  }
  const total = base.reduce((sum, cents) => sum + cents, 0);
  if (total !== amountCents || base.some((cents, index) => cents > remCents[index])) {
    throw new Error("TRANSFER_ALLOCATION_MISMATCH");
  }
  return components
    .map((component, index) => ({ id: component.id, share: base[index] / 100 }))
    .filter((share) => share.share > 0);
}
