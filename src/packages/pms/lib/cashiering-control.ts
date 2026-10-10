/**
 * Cashier Control read helpers.
 *
 * Drawer cash comes from hotel_drawer_figures (opening + cash in − cash out +
 * stamped guest cash). This module does not recompute that total for display.
 *
 * Property activity uses the canonical hotel business date. Ledger rows do not
 * store business_date, so a row belongs to a business date when its property-
 * timezone calendar day matches. That is not UTC midnight. A cashier shift is
 * never split on that boundary: shift rows stay on hotel_cashier_shift_id.
 *
 * Company and group cash posted through post_financial_account_transaction is
 * not stamped with hotel_cashier_shift_id and must not be treated as drawer cash.
 */

import {
  buildFinancialHistory,
  emptyHistoryCoverage,
  type HistoryLedgerRow,
} from "./cashiering-transaction-history.ts";

export const DRAWER_EXCLUDED =
  "Charges, tax, service, adjustments, discounts, write-offs, transfers, invoices, credit notes, debit notes, allocations, and non-cash tenders do not change expected drawer cash.";

const METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;
export type TenderMethod = (typeof METHODS)[number];

export type BusinessActivityRow = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  createdAt: string;
  paymentMethod: string | null;
  originalTransactionId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  transferId: string | null;
  postedBy: string | null;
  ownerLabel: string;
};

export type MethodActivity = {
  method: TenderMethod;
  paymentAmount: number;
  depositAmount: number;
  refundAmount: number;
  net: number;
  count: number;
};

export type BusinessDateEventView = {
  id: string;
  occurredAt: string;
  kind: string;
  label: string;
  guestOrAccount: string;
  description: string;
  amount: number;
  method: string | null;
  actor: string | null;
};

export type DepartureDue = {
  folioId: string;
  folioNumber: string;
  room: string | null;
  guest: string;
  departure: string;
  balance: number;
};

const MONEY_EPSILON = 0.01;

export function roundControlMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Property-local calendar date of an instant. Not the UTC date. */
export function propertyCalendarDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function nextCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, Number(bag.minute), Number(bag.second));
  return asUtc - instant.getTime();
}

/** UTC instant of property-local midnight on `isoDate`, and of the next local midnight. */
export function propertyDayBounds(
  isoDate: string,
  timezone: string,
): { startIso: string; endIso: string } {
  const start = zonedMidnightUtc(isoDate, timezone);
  const end = zonedMidnightUtc(nextCalendarDate(isoDate), timezone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function zonedMidnightUtc(isoDate: string, timezone: string): Date {
  const guess = new Date(`${isoDate}T00:00:00.000Z`);
  const first = guess.getTime() - timezoneOffsetMs(guess, timezone);
  const second = guess.getTime() - timezoneOffsetMs(new Date(first), timezone);
  return new Date(second);
}

export function belongsToBusinessDate(
  postedAt: string,
  businessDate: string,
  timezone: string,
): boolean {
  return propertyCalendarDate(postedAt, timezone) === businessDate;
}

export function selectOwnOpenShift<T extends { membershipId: string; status: string }>(
  shifts: T[],
  membershipId: string,
): T | null {
  return (
    shifts.find((shift) => shift.status === "open" && shift.membershipId === membershipId) ?? null
  );
}

export function previousClosedShift<
  T extends { membershipId: string; status: string; closedAt: string | null },
>(shifts: T[], membershipId: string): T | null {
  return (
    shifts
      .filter(
        (shift) =>
          shift.membershipId === membershipId && shift.status === "closed" && shift.closedAt,
      )
      .sort((a, b) => (a.closedAt! < b.closedAt! ? 1 : -1))[0] ?? null
  );
}

export function otherOpenShifts<T extends { membershipId: string; status: string }>(
  shifts: T[],
  membershipId: string,
): T[] {
  return shifts.filter((shift) => shift.status === "open" && shift.membershipId !== membershipId);
}

/** Cashiers see their own history. Accountant, manager, and owner see the property list. */
export function visibleShiftHistory<T extends { membershipId: string }>(
  shifts: T[],
  membershipId: string,
  role: string,
): T[] {
  if (role === "cashier") return shifts.filter((shift) => shift.membershipId === membershipId);
  return shifts;
}

export function formatShiftDuration(
  openedAt: string,
  closedAt: string | null,
  nowMs: number,
): string {
  const end = closedAt ? new Date(closedAt).getTime() : nowMs;
  const start = new Date(openedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${rest}m`;
}

export function variancePresentation(
  counted: number | null,
  expected: number,
): { difference: number | null; label: "Matched" | "Variance" | null } {
  if (counted === null || !Number.isFinite(counted)) return { difference: null, label: null };
  const difference = roundControlMoney(counted - expected);
  return {
    difference,
    label: Math.abs(difference) < MONEY_EPSILON ? "Matched" : "Variance",
  };
}

function signedReceipt(type: string, amount: number): number {
  if (type === "refund") return roundControlMoney(Math.abs(amount));
  return roundControlMoney(-amount);
}

function toHistoryRow(row: BusinessActivityRow): HistoryLedgerRow {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    description: row.description,
    amount: row.amount,
    postedAt: row.postedAt,
    createdAt: row.createdAt || row.postedAt,
    postedBy: row.postedBy,
    paymentMethod: row.paymentMethod,
    originalTransactionId: row.originalTransactionId,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    transferId: row.transferId,
    quantity: null,
    unitAmount: null,
    chargeSource: null,
    departmentName: null,
  };
}

export function summarizeBusinessDateActivity(input: {
  rows: BusinessActivityRow[];
  businessDate: string;
  timezone: string;
  recentLimit?: number;
}): {
  payments: { amount: number; count: number };
  deposits: { amount: number; count: number };
  refunds: { amount: number; count: number };
  transactions: number;
  paymentMethods: MethodActivity[];
  recent: BusinessDateEventView[];
} {
  const dayRows = input.rows.filter((row) =>
    belongsToBusinessDate(row.postedAt, input.businessDate, input.timezone),
  );
  let paymentAmount = 0;
  let paymentCount = 0;
  let depositAmount = 0;
  let depositCount = 0;
  let refundAmount = 0;
  let refundCount = 0;
  const methods = new Map<TenderMethod, MethodActivity>(
    METHODS.map((method) => [
      method,
      { method, paymentAmount: 0, depositAmount: 0, refundAmount: 0, net: 0, count: 0 },
    ]),
  );

  for (const row of dayRows) {
    const method = (METHODS as readonly string[]).includes(row.paymentMethod ?? "")
      ? (row.paymentMethod as TenderMethod)
      : null;
    if (row.type === "payment") {
      const amount = signedReceipt(row.type, row.amount);
      paymentAmount += amount;
      paymentCount += 1;
      if (method) {
        const bucket = methods.get(method)!;
        bucket.paymentAmount += amount;
        bucket.count += 1;
      }
    } else if (row.type === "deposit") {
      const amount = signedReceipt(row.type, row.amount);
      depositAmount += amount;
      depositCount += 1;
      if (method) {
        const bucket = methods.get(method)!;
        bucket.depositAmount += amount;
        bucket.count += 1;
      }
    } else if (row.type === "refund") {
      const amount = signedReceipt(row.type, row.amount);
      refundAmount += amount;
      refundCount += 1;
      if (method) {
        const bucket = methods.get(method)!;
        bucket.refundAmount += amount;
        bucket.count += 1;
      }
    }
  }

  const paymentMethods = METHODS.map((method) => {
    const bucket = methods.get(method)!;
    return {
      ...bucket,
      paymentAmount: roundControlMoney(bucket.paymentAmount),
      depositAmount: roundControlMoney(bucket.depositAmount),
      refundAmount: roundControlMoney(bucket.refundAmount),
      net: roundControlMoney(bucket.paymentAmount + bucket.depositAmount - bucket.refundAmount),
    };
  }).filter((bucket) => bucket.count > 0);

  const events = buildFinancialHistory({
    rows: dayRows.map(toHistoryRow),
    allocations: [],
    counterparts: {},
    coverage: emptyHistoryCoverage(),
    access: { canManage: false, open: false },
  });
  const owners = new Map(dayRows.map((row) => [row.id, row.ownerLabel]));
  const recent = events
    .slice()
    .reverse()
    .slice(0, input.recentLimit ?? 8)
    .map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      kind: event.kind,
      label: event.label,
      guestOrAccount: owners.get(event.id) ?? owners.get(event.rawIds[0] ?? "") ?? "Account",
      description: event.description,
      amount: event.amount,
      method: event.paymentMethod,
      actor: event.postedBy,
    }));

  return {
    payments: { amount: roundControlMoney(paymentAmount), count: paymentCount },
    deposits: { amount: roundControlMoney(depositAmount), count: depositCount },
    refunds: { amount: roundControlMoney(refundAmount), count: refundCount },
    transactions: events.length,
    paymentMethods,
    recent,
  };
}

export function departuresRequiringSettlement(
  rows: Array<{
    folioId: string;
    folioNumber: string;
    room: string | null;
    guest: string;
    departure: string | null;
    reservationStatus: string | null;
    folioStatus: string;
    balance: number;
  }>,
  businessDate: string,
): DepartureDue[] {
  return rows
    .filter(
      (row) =>
        row.folioStatus === "open" &&
        row.reservationStatus === "checked_in" &&
        row.departure === businessDate &&
        row.balance > MONEY_EPSILON,
    )
    .map((row) => ({
      folioId: row.folioId,
      folioNumber: row.folioNumber,
      room: row.room,
      guest: row.guest,
      departure: row.departure ?? businessDate,
      balance: roundControlMoney(row.balance),
    }));
}

/** Display splits for rows already known to carry this shift id. Not a drawer total. */
export function splitStampedCash(
  rows: Array<{ type: string; amount: number; paymentMethod: string | null }>,
): {
  cashPayments: number;
  cashDeposits: number;
  cashRefunds: number;
} {
  let cashPayments = 0;
  let cashDeposits = 0;
  let cashRefunds = 0;
  for (const row of rows) {
    if (row.paymentMethod !== "cash") continue;
    if (row.type === "payment") cashPayments += -row.amount;
    else if (row.type === "deposit") cashDeposits += -row.amount;
    else if (row.type === "refund") cashRefunds += Math.abs(row.amount);
  }
  return {
    cashPayments: roundControlMoney(cashPayments),
    cashDeposits: roundControlMoney(cashDeposits),
    cashRefunds: roundControlMoney(cashRefunds),
  };
}
