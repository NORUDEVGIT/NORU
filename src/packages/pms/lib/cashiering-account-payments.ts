/**
 * Company and group account payments.
 * A payment reduces the financial-account ledger. It does not allocate to a
 * source folio, charge, or invoice. Refunds are linked to one payment or
 * historical deposit. Write-off is an adjustment, not cash.
 */

import {
  accountBalanceState,
  accountWorkspaceCapabilities,
  roundAccountMoney,
  type AccountBalanceState,
  type AccountWorkspaceKind,
} from "./cashiering-account-workspace.ts";

export const ACCOUNT_TENDER_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "mobile_money",
  "other",
] as const;

export type AccountTenderMethod = (typeof ACCOUNT_TENDER_METHODS)[number];

export type AccountTenderKind = "payment" | "deposit" | "refund" | "write_off";

export type AccountPaymentState = "posted" | "partially_refunded" | "refunded";

export type AccountLedgerTender = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  paymentMethod: string | null;
  postedByMembershipId: string | null;
  hotelCashierShiftId: string | null;
  originalTransactionId: string | null;
  referenceType: string | null;
};

export type AccountPaymentRow = {
  id: string;
  transactionType: AccountTenderKind;
  postedAt: string;
  amount: number;
  displayAmount: number;
  paymentMethod: string | null;
  description: string;
  actorId: string | null;
  actorName: string | null;
  hotelCashierShiftId: string | null;
  sourcePaymentId: string | null;
  sourcePostedAt: string | null;
  sourceMethod: string | null;
  refundedTotal: number;
  remainingRefundable: number;
  paymentState: AccountPaymentState | null;
  canView: boolean;
  canRefund: boolean;
  canViewSource: boolean;
};

export type AccountPaymentQuery = {
  search?: string;
  type?: "all" | "payment" | "refund" | "write_off";
  method?: "all" | AccountTenderMethod;
  postedBy?: string | null;
  from?: string | null;
  to?: string | null;
  sort?: "newest" | "oldest" | "amount";
  page?: number;
  pageSize?: number;
};

export type AccountTenderTotals = {
  payments: number;
  refunds: number;
  writeOffs: number;
  deposits: number;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};

export function accountMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return METHOD_LABEL[method] ?? method;
}

export function tenderTypeLabel(type: AccountTenderKind): string {
  if (type === "write_off") return "Write-Off";
  if (type === "refund") return "Refund";
  if (type === "deposit") return "Deposit";
  return "Payment";
}

export function tenderStateLabel(state: AccountPaymentState | null): string {
  if (state === "partially_refunded") return "Partially Refunded";
  if (state === "refunded") return "Refunded";
  if (state === "posted") return "Posted";
  return "—";
}

export function accountPaymentDescription(receivedFrom: string, notes: string): string {
  const who = receivedFrom.trim();
  const note = notes.trim();
  if (!who) return note;
  if (!note) return `Received from ${who}`;
  return `Received from ${who}. ${note}`;
}

export function parsePositiveAmount(value: string): number | null {
  const amount = Number(value.trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundAccountMoney(amount);
}

export function moneyInputValue(value: number): string {
  return roundAccountMoney(Math.max(value, 0)).toFixed(2);
}

/** Physical cash movement only. Deposits, cards, and write-offs do not stamp a shift. */
export function accountCashStampsShift(input: { type: string; method: string | null }): boolean {
  return input.method === "cash" && (input.type === "payment" || input.type === "refund");
}

export function projectedAccountBalance(
  current: number,
  movement: "payment" | "refund" | "write_off",
  amount: number,
): number {
  const signed = movement === "refund" ? amount : -amount;
  return roundAccountMoney(current + signed);
}

export function overpaymentCredit(current: number, paymentAmount: number): number | null {
  const projected = projectedAccountBalance(current, "payment", paymentAmount);
  if (projected < -0.009) return roundAccountMoney(-projected);
  return null;
}

export function writeOffAllowed(balance: number, amount: number): boolean {
  return balance > 0.009 && amount > 0.009 && amount <= balance + 0.001;
}

export function accountPaymentCapabilities(input: {
  role: string;
  status: "open" | "closed";
  balance: number;
  accountKind: AccountWorkspaceKind;
}) {
  return accountWorkspaceCapabilities(input);
}

function isWriteOff(row: AccountLedgerTender): boolean {
  return (
    row.referenceType === "settlement_write_off" ||
    (row.type === "adjustment" && row.description.toLowerCase().includes("settlement write-off"))
  );
}

function tenderKind(row: AccountLedgerTender): AccountTenderKind | null {
  if (row.type === "payment") return "payment";
  if (row.type === "deposit") return "deposit";
  if (row.type === "refund") return "refund";
  if (isWriteOff(row)) return "write_off";
  return null;
}

function remainingOnSource(
  source: { id: string; amount: number },
  lines: readonly AccountLedgerTender[],
): number {
  const paid = roundAccountMoney(-source.amount);
  const prior = lines
    .filter((line) => line.type === "refund" && line.originalTransactionId === source.id)
    .reduce((sum, line) => sum + line.amount, 0);
  return roundAccountMoney(paid - prior);
}

function paymentState(paid: number, refunded: number): AccountPaymentState {
  if (refunded <= 0.009) return "posted";
  if (refunded + 0.009 >= paid) return "refunded";
  return "partially_refunded";
}

export function buildAccountPayments(input: {
  rows: readonly AccountLedgerTender[];
  actorNames?: Readonly<Record<string, string>>;
  canRefund: boolean;
}): AccountPaymentRow[] {
  const names = input.actorNames ?? {};
  const kinds = input.rows.flatMap((row) => {
    const kind = tenderKind(row);
    return kind ? [{ row, kind }] : [];
  });
  const byId = new Map(kinds.map((item) => [item.row.id, item]));
  return kinds.map(({ row, kind }) => {
    const source = row.originalTransactionId ? byId.get(row.originalTransactionId) : undefined;
    const sourceIsTender = source?.kind === "payment" || source?.kind === "deposit";
    const paid = roundAccountMoney(Math.abs(row.amount));
    const remainingRaw =
      kind === "payment" || kind === "deposit" ? remainingOnSource(row, input.rows) : null;
    const remaining = remainingRaw == null ? 0 : Math.max(0, roundAccountMoney(remainingRaw));
    const refunded = remainingRaw == null ? 0 : Math.max(0, roundAccountMoney(paid - remainingRaw));
    const state = kind === "payment" || kind === "deposit" ? paymentState(paid, refunded) : null;
    return {
      id: row.id,
      transactionType: kind,
      postedAt: row.postedAt,
      amount: roundAccountMoney(row.amount),
      displayAmount: paid,
      paymentMethod: row.paymentMethod,
      description: row.description,
      actorId: row.postedByMembershipId,
      actorName: row.postedByMembershipId ? (names[row.postedByMembershipId] ?? null) : null,
      hotelCashierShiftId: row.hotelCashierShiftId,
      sourcePaymentId: kind === "refund" && sourceIsTender ? row.originalTransactionId : null,
      sourcePostedAt: kind === "refund" && sourceIsTender ? (source?.row.postedAt ?? null) : null,
      sourceMethod:
        kind === "refund" && sourceIsTender ? (source?.row.paymentMethod ?? null) : null,
      refundedTotal: refunded,
      remainingRefundable: remaining,
      paymentState: state,
      canView: true,
      canRefund:
        input.canRefund &&
        (kind === "payment" || kind === "deposit") &&
        remaining > 0.009 &&
        Boolean(row.paymentMethod),
      canViewSource: kind === "refund" && sourceIsTender,
    };
  });
}

export function accountPaymentActors(
  rows: readonly AccountPaymentRow[],
): Array<{ id: string; name: string }> {
  const names = new Map<string, string>();
  for (const row of rows) {
    if (!row.actorId) continue;
    names.set(row.actorId, row.actorName ?? "Staff member");
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function summarizeAccountTenders(rows: readonly AccountPaymentRow[]): AccountTenderTotals {
  let payments = 0;
  let refunds = 0;
  let writeOffs = 0;
  let deposits = 0;
  for (const row of rows) {
    if (row.transactionType === "payment") payments += row.displayAmount;
    else if (row.transactionType === "refund") refunds += row.displayAmount;
    else if (row.transactionType === "write_off") writeOffs += row.displayAmount;
    else deposits += row.displayAmount;
  }
  return {
    payments: roundAccountMoney(payments),
    refunds: roundAccountMoney(refunds),
    writeOffs: roundAccountMoney(writeOffs),
    deposits: roundAccountMoney(deposits),
  };
}

export function accountTenderScope(query: AccountPaymentQuery = {}): "lifetime" | "filtered" {
  if ((query.search ?? "").trim()) return "filtered";
  if (query.type && query.type !== "all") return "filtered";
  if (query.method && query.method !== "all") return "filtered";
  if (query.postedBy) return "filtered";
  if (query.from) return "filtered";
  if (query.to) return "filtered";
  return "lifetime";
}

export function accountTenderScopeLabel(scope: "lifetime" | "filtered"): string {
  return scope === "filtered" ? "Selected filters" : "Account lifetime";
}

export function accountBalancePresentation(balance: number): {
  state: AccountBalanceState;
  label: string;
} {
  const state = accountBalanceState(balance);
  const label = state === "due" ? "Amount Due" : state === "credit" ? "Credit Balance" : "Settled";
  return { state, label };
}

function pageSizeOf(value: number | undefined): number {
  if (value === 25 || value === 50) return value;
  return 10;
}

function includes(value: string | null | undefined, term: string): boolean {
  return (value ?? "").toLowerCase().includes(term);
}

export function queryAccountPayments(
  rows: readonly AccountPaymentRow[],
  query: AccountPaymentQuery = {},
): {
  rows: AccountPaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: AccountTenderTotals;
  scope: "lifetime" | "filtered";
} {
  const term = (query.search ?? "").trim().toLowerCase();
  const from = query.from?.trim() || null;
  const to = query.to?.trim() || null;
  const filtered = rows.filter((row) => {
    if (query.type === "payment" && row.transactionType !== "payment") return false;
    if (query.type === "refund" && row.transactionType !== "refund") return false;
    if (query.type === "write_off" && row.transactionType !== "write_off") return false;
    if (query.method && query.method !== "all" && row.paymentMethod !== query.method) return false;
    if (query.postedBy && row.actorId !== query.postedBy) return false;
    const day = row.postedAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!term) return true;
    return (
      includes(row.description, term) ||
      includes(row.actorName, term) ||
      includes(accountMethodLabel(row.paymentMethod), term) ||
      includes(row.paymentMethod, term) ||
      includes(row.displayAmount.toFixed(2), term)
    );
  });
  const sort = query.sort ?? "newest";
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "oldest") return a.postedAt < b.postedAt ? -1 : 1;
    if (sort === "amount")
      return b.displayAmount - a.displayAmount || (a.postedAt < b.postedAt ? 1 : -1);
    return a.postedAt < b.postedAt ? 1 : -1;
  });
  const pageSize = pageSizeOf(query.pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(query.page && query.page > 0 ? Math.floor(query.page) : 1, pageCount);
  const start = (page - 1) * pageSize;
  return {
    rows: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
    totals: summarizeAccountTenders(sorted),
    scope: accountTenderScope(query),
  };
}

export function findAccountPayment(
  rows: readonly AccountPaymentRow[],
  transactionId: string,
): {
  payment: AccountPaymentRow;
  linkedRefunds: AccountPaymentRow[];
  source: AccountPaymentRow | null;
} | null {
  const payment = rows.find((row) => row.id === transactionId);
  if (!payment) return null;
  const linkedRefunds = rows
    .filter((row) => row.transactionType === "refund" && row.sourcePaymentId === payment.id)
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  const source = payment.sourcePaymentId
    ? (rows.find((row) => row.id === payment.sourcePaymentId) ?? null)
    : null;
  return { payment, linkedRefunds, source };
}
