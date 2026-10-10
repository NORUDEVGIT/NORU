/**
 * Business-level transaction history over the immutable folio ledger.
 * Grouping and the running-balance walk live here. The table does not re-sum rows.
 * Payment-to-invoice allocation is not part of this model.
 */

import { refundedAgainst, tenderDisplayState } from "./cashiering-tender-state.ts";
import { chargeGroupRemainder, correctableGroupRemainder } from "./cashiering-transfer-allocate.ts";

export type HistoryOwnerType = "guest_folio" | "financial_account";

export type HistoryKind =
  | "charge"
  | "payment"
  | "deposit"
  | "refund"
  | "adjustment"
  | "discount"
  | "transfer_in"
  | "transfer_out"
  | "write_off"
  | "credit_note";

export type HistoryQuickFilter =
  "all" | "charges" | "payments" | "deposits" | "refunds" | "adjustments" | "transfers";

export type HistoryLedgerRow = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  createdAt: string;
  postedBy: string | null;
  paymentMethod: string | null;
  originalTransactionId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  transferId: string | null;
  quantity: number | null;
  unitAmount: number | null;
  chargeSource: string | null;
  departmentName: string | null;
};

export type HistoryAllocation = {
  depositTransactionId: string;
  chargeTransactionId?: string | null;
  amount: number;
};

export type HistoryCounterparty = {
  label: string;
  folioId: string | null;
  accountId: string | null;
};

export type HistoryCoverageInput = {
  legacyInvoice: { id: string; number: string } | null;
  invoices: Array<{ id: string; number: string; parentIds: string[] }>;
  debitNotes: Array<{ id: string; number: string; parentIds: string[] }>;
  creditNotes: Array<{ id: string; number: string; invoiceNumber: string | null }>;
};

export type HistoryAccess = {
  canManage: boolean;
  open: boolean;
};

export type HistoryActions = {
  view: true;
  correct: boolean;
  transfer: boolean;
  refund: boolean;
  applyDeposit: boolean;
  viewInvoice: boolean;
  viewCreditNote: boolean;
  viewDebitNote: boolean;
  viewCounterparty: boolean;
};

export type HistoryEvent = {
  id: string;
  kind: HistoryKind;
  label: string;
  occurredAt: string;
  createdAt: string;
  sortId: string;
  description: string;
  context: string | null;
  amount: number;
  balanceAfter: number;
  postedBy: string | null;
  state: string;
  paymentMethod: string | null;
  rawIds: string[];
  actions: HistoryActions;
  invoiceId: string | null;
  invoiceNumber: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
  debitNoteId: string | null;
  debitNoteNumber: string | null;
  counterparty: HistoryCounterparty | null;
};

export type HistoryFilter = {
  quick: HistoryQuickFilter;
  from: string;
  to: string;
  method: string;
  actor: string;
  search: string;
};

export type HistoryBuildInput = {
  rows: HistoryLedgerRow[];
  allocations: HistoryAllocation[];
  counterparts: Record<string, HistoryCounterparty>;
  coverage: HistoryCoverageInput;
  access: HistoryAccess;
  searchExtras?: string[];
};

const EMPTY_COVERAGE: HistoryCoverageInput = {
  legacyInvoice: null,
  invoices: [],
  debitNotes: [],
  creditNotes: [],
};

const KIND_LABEL: Record<HistoryKind, string> = {
  charge: "Charge",
  payment: "Payment",
  deposit: "Deposit",
  refund: "Refund",
  adjustment: "Adjustment",
  discount: "Discount",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  write_off: "Write-off",
  credit_note: "Credit note",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isTax(category: string): boolean {
  return category === "tax" || category === "service_charge";
}

export function historyMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return METHOD_LABEL[method] ?? method.replaceAll("_", " ");
}

export function emptyHistoryCoverage(): HistoryCoverageInput {
  return EMPTY_COVERAGE;
}

function compareChrono(a: HistoryEvent, b: HistoryEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.sortId !== b.sortId) return a.sortId < b.sortId ? -1 : 1;
  return 0;
}

function earliest(values: string[]): string {
  return values.slice().sort()[0] ?? "";
}

function firstName(rows: HistoryLedgerRow[]): string | null {
  return rows.find((row) => row.postedBy)?.postedBy ?? null;
}

function invoiceFor(parentId: string, coverage: HistoryCoverageInput) {
  if (coverage.legacyInvoice) return coverage.legacyInvoice;
  return coverage.invoices.find((invoice) => invoice.parentIds.includes(parentId)) ?? null;
}

function debitFor(parentId: string, coverage: HistoryCoverageInput) {
  return coverage.debitNotes.find((note) => note.parentIds.includes(parentId)) ?? null;
}

function creditNoteMeta(id: string | null, coverage: HistoryCoverageInput) {
  if (!id) return null;
  return coverage.creditNotes.find((note) => note.id === id) ?? null;
}

function groupIds(parentId: string, rows: HistoryLedgerRow[]): Set<string> {
  const ids = new Set<string>([parentId]);
  for (const row of rows) {
    if (row.originalTransactionId === parentId && row.type === "charge" && isTax(row.category)) {
      ids.add(row.id);
    }
  }
  return ids;
}

function chargeState(
  parentId: string,
  rows: HistoryLedgerRow[],
  coverage: HistoryCoverageInput,
): string {
  if (invoiceFor(parentId, coverage)) return "Invoiced";
  const ids = groupIds(parentId, rows);
  const moved = rows.some(
    (row) =>
      row.type === "transfer_out" &&
      row.originalTransactionId &&
      ids.has(row.originalTransactionId),
  );
  const remainder = chargeGroupRemainder(parentId, rows);
  if (moved && remainder.grossRemaining <= 0.009) return "Transferred";
  if (moved && remainder.grossRemaining > 0.009) return "Partially transferred";
  const discounted = rows.some(
    (row) =>
      row.type === "discount" && row.originalTransactionId && ids.has(row.originalTransactionId),
  );
  if (discounted) return "Discounted";
  const corrected = rows.some(
    (row) =>
      row.type === "adjustment" &&
      row.amount < 0 &&
      row.referenceType !== "invoice_credit_note" &&
      row.referenceType !== "settlement_write_off" &&
      row.originalTransactionId &&
      ids.has(row.originalTransactionId),
  );
  if (corrected) return "Corrected";
  return "Posted";
}

function tenderState(
  row: HistoryLedgerRow,
  rows: HistoryLedgerRow[],
  allocations: HistoryAllocation[],
): string {
  const applied = roundMoney(
    allocations
      .filter((line) => line.depositTransactionId === row.id)
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
  const received = roundMoney(Math.abs(row.amount));
  const refunded = refundedAgainst(row.id, rows);
  const state = tenderDisplayState(row, rows, {
    received,
    applied,
    available: roundMoney(Math.max(0, received - applied - refunded)),
  });
  return state ?? "Posted";
}

function baseActions(blocked: boolean): HistoryActions {
  return {
    view: true,
    correct: false,
    transfer: false,
    refund: false,
    applyDeposit: false,
    viewInvoice: false,
    viewCreditNote: false,
    viewDebitNote: false,
    viewCounterparty: false,
    ...(blocked ? {} : {}),
  };
}

function blankEvent(
  partial: Omit<HistoryEvent, "balanceAfter" | "actions" | "label"> & { label?: string },
): HistoryEvent {
  return {
    ...partial,
    label: partial.label ?? KIND_LABEL[partial.kind],
    balanceAfter: 0,
    actions: baseActions(false),
  };
}

export function buildFinancialHistory(input: HistoryBuildInput): HistoryEvent[] {
  const rows = input.rows;
  const coverage = input.coverage;
  const consumed = new Set<string>();
  const drafts: HistoryEvent[] = [];

  const parents = rows.filter((row) => row.type === "charge" && !isTax(row.category));
  for (const parent of parents) {
    const children = rows.filter(
      (row) =>
        row.type === "charge" && isTax(row.category) && row.originalTransactionId === parent.id,
    );
    consumed.add(parent.id);
    for (const child of children) consumed.add(child.id);
    const amount = roundMoney(
      parent.amount + children.reduce((sum, child) => sum + child.amount, 0),
    );
    const invoice = invoiceFor(parent.id, coverage);
    const debit = debitFor(parent.id, coverage);
    const members = [parent, ...children];
    drafts.push(
      blankEvent({
        id: parent.id,
        kind: "charge",
        occurredAt: earliest(members.map((row) => row.postedAt)),
        createdAt: earliest(members.map((row) => row.createdAt || row.postedAt)),
        sortId: parent.id,
        description: parent.description,
        context: debit ? debit.number : invoice ? invoice.number : null,
        amount,
        postedBy: firstName(members),
        state: chargeState(parent.id, rows, coverage),
        paymentMethod: null,
        rawIds: members.map((row) => row.id),
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.number ?? null,
        creditNoteId: null,
        creditNoteNumber: null,
        debitNoteId: debit?.id ?? null,
        debitNoteNumber: debit?.number ?? null,
        counterparty: null,
      }),
    );
  }

  for (const row of rows) {
    if (consumed.has(row.id) || !isTax(row.category) || row.type !== "charge") continue;
    consumed.add(row.id);
    drafts.push(
      blankEvent({
        id: row.id,
        kind: "charge",
        occurredAt: row.postedAt,
        createdAt: row.createdAt || row.postedAt,
        sortId: row.id,
        description: row.description,
        context: null,
        amount: roundMoney(row.amount),
        postedBy: row.postedBy,
        state: "Posted",
        paymentMethod: null,
        rawIds: [row.id],
        invoiceId: null,
        invoiceNumber: null,
        creditNoteId: null,
        creditNoteNumber: null,
        debitNoteId: null,
        debitNoteNumber: null,
        counterparty: null,
      }),
    );
  }

  const notes = new Map<string, HistoryLedgerRow[]>();
  for (const row of rows) {
    if (
      row.type !== "adjustment" ||
      row.referenceType !== "invoice_credit_note" ||
      !row.referenceId
    )
      continue;
    const bucket = notes.get(row.referenceId) ?? [];
    bucket.push(row);
    notes.set(row.referenceId, bucket);
  }
  for (const [noteId, members] of notes) {
    for (const row of members) consumed.add(row.id);
    const meta = creditNoteMeta(noteId, coverage);
    const number = meta?.number ?? members[0]?.description ?? "Credit note";
    drafts.push(
      blankEvent({
        id: noteId,
        kind: "credit_note",
        occurredAt: earliest(members.map((row) => row.postedAt)),
        createdAt: earliest(members.map((row) => row.createdAt || row.postedAt)),
        sortId: noteId,
        description: number.startsWith("Credit note") ? number : `Credit note ${number}`,
        context: meta?.invoiceNumber ?? null,
        amount: roundMoney(members.reduce((sum, row) => sum + row.amount, 0)),
        postedBy: firstName(members),
        state: "Posted",
        paymentMethod: null,
        rawIds: members.map((row) => row.id),
        invoiceId: null,
        invoiceNumber: meta?.invoiceNumber ?? null,
        creditNoteId: noteId,
        creditNoteNumber: number.startsWith("Credit note")
          ? number.replace(/^Credit note\s*/, "")
          : number,
        debitNoteId: null,
        debitNoteNumber: null,
        counterparty: null,
      }),
    );
  }

  const transfers = new Map<string, HistoryLedgerRow[]>();
  for (const row of rows) {
    if (!row.transferId || (row.type !== "transfer_in" && row.type !== "transfer_out")) continue;
    const key = `${row.transferId}:${row.type}`;
    const bucket = transfers.get(key) ?? [];
    bucket.push(row);
    transfers.set(key, bucket);
  }
  for (const [key, members] of transfers) {
    for (const row of members) consumed.add(row.id);
    const kind = members[0]?.type === "transfer_in" ? "transfer_in" : "transfer_out";
    const transferId = members[0]?.transferId ?? key;
    const party = input.counterparts[transferId] ?? null;
    drafts.push(
      blankEvent({
        id: key,
        kind,
        occurredAt: earliest(members.map((row) => row.postedAt)),
        createdAt: earliest(members.map((row) => row.createdAt || row.postedAt)),
        sortId: key,
        description: members[0]?.description ?? KIND_LABEL[kind],
        context: party?.label ?? null,
        amount: roundMoney(members.reduce((sum, row) => sum + row.amount, 0)),
        postedBy: firstName(members),
        state: "Posted",
        paymentMethod: null,
        rawIds: members.map((row) => row.id),
        invoiceId: null,
        invoiceNumber: null,
        creditNoteId: null,
        creditNoteNumber: null,
        debitNoteId: null,
        debitNoteNumber: null,
        counterparty: party,
      }),
    );
  }

  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    const kind: HistoryKind =
      row.type === "adjustment" && row.referenceType === "settlement_write_off"
        ? "write_off"
        : row.type === "payment" ||
            row.type === "deposit" ||
            row.type === "refund" ||
            row.type === "discount" ||
            row.type === "adjustment" ||
            row.type === "transfer_in" ||
            row.type === "transfer_out"
          ? row.type
          : "adjustment";
    const state =
      kind === "payment" || kind === "deposit"
        ? tenderState(row, rows, input.allocations)
        : "Posted";
    drafts.push(
      blankEvent({
        id: row.id,
        kind,
        occurredAt: row.postedAt,
        createdAt: row.createdAt || row.postedAt,
        sortId: row.id,
        description: row.description,
        context: historyMethodLabel(row.paymentMethod),
        amount: roundMoney(row.amount),
        postedBy: row.postedBy,
        state,
        paymentMethod: row.paymentMethod,
        rawIds: [row.id],
        invoiceId: null,
        invoiceNumber: null,
        creditNoteId: null,
        creditNoteNumber: null,
        debitNoteId: null,
        debitNoteNumber: null,
        counterparty: null,
      }),
    );
  }

  drafts.sort(compareChrono);
  let running = 0;
  for (const event of drafts) {
    running = roundMoney(running + event.amount);
    event.balanceAfter = running;
    event.actions = actionsFor(event, rows, input);
  }
  return drafts;
}

function covered(event: HistoryEvent): boolean {
  return Boolean(event.invoiceId || event.debitNoteId);
}

function actionsFor(
  event: HistoryEvent,
  rows: HistoryLedgerRow[],
  input: HistoryBuildInput,
): HistoryActions {
  const manage = input.access.canManage && input.access.open;
  const actions = baseActions(false);
  if (event.kind === "charge" && manage && !covered(event)) {
    const remainder = correctableGroupRemainder(event.id, rows);
    const movable = chargeGroupRemainder(event.id, rows);
    actions.correct = remainder.grossRemaining > 0.009;
    actions.transfer = movable.grossRemaining > 0.009;
  }
  if ((event.kind === "payment" || event.kind === "deposit") && manage) {
    const received = roundMoney(Math.abs(event.amount));
    const refunded = refundedAgainst(event.id, rows);
    actions.refund = roundMoney(received - refunded) > 0.009;
  }
  if (event.kind === "deposit" && manage) {
    const applied = input.allocations
      .filter((line) => line.depositTransactionId === event.id)
      .reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const refunded = refundedAgainst(event.id, rows);
    actions.applyDeposit = roundMoney(Math.abs(event.amount) - applied - refunded) > 0.009;
  }
  actions.viewInvoice = Boolean(event.invoiceId || event.invoiceNumber);
  actions.viewCreditNote = event.kind === "credit_note" || Boolean(event.creditNoteId);
  actions.viewDebitNote = Boolean(event.debitNoteId);
  actions.viewCounterparty = Boolean(event.counterparty?.folioId || event.counterparty?.accountId);
  return actions;
}

function quickMatch(kind: HistoryKind, quick: HistoryQuickFilter): boolean {
  if (quick === "all") return true;
  if (quick === "charges") return kind === "charge";
  if (quick === "payments") return kind === "payment";
  if (quick === "deposits") return kind === "deposit";
  if (quick === "refunds") return kind === "refund";
  if (quick === "transfers") return kind === "transfer_in" || kind === "transfer_out";
  return (
    kind === "adjustment" || kind === "discount" || kind === "write_off" || kind === "credit_note"
  );
}

export function filterHistoryEvents(
  events: HistoryEvent[],
  filter: HistoryFilter,
  extras: string[] = [],
): HistoryEvent[] {
  const term = filter.search.trim().toLowerCase();
  return events.filter((event) => {
    if (!quickMatch(event.kind, filter.quick)) return false;
    const day = event.occurredAt.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.method && event.paymentMethod !== filter.method) return false;
    if (filter.actor && filter.actor !== "all" && (event.postedBy ?? "") !== filter.actor)
      return false;
    if (!term) return true;
    const haystack = [
      event.description,
      event.context ?? "",
      event.postedBy ?? "",
      event.label,
      ...extras,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function pageHistoryEvents(
  events: HistoryEvent[],
  input: { page: number; pageSize: number; sort: "newest" | "oldest" },
): { page: number; pageSize: number; total: number; rows: HistoryEvent[] } {
  const ordered = input.sort === "oldest" ? events.slice() : events.slice().reverse();
  const pageSize = input.pageSize > 0 ? input.pageSize : 25;
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(Math.max(1, input.page), pages);
  const start = (page - 1) * pageSize;
  return { page, pageSize, total: ordered.length, rows: ordered.slice(start, start + pageSize) };
}

export type HistoryDetail =
  | { kind: "charge"; lines: string[] }
  | { kind: "payment"; lines: string[] }
  | {
      kind: "deposit";
      lines: string[];
      allocations: Array<{ description: string; amount: number }>;
    }
  | { kind: "refund"; lines: string[] }
  | { kind: "adjustment"; lines: string[] }
  | { kind: "discount"; lines: string[] }
  | { kind: "transfer_in"; lines: string[] }
  | { kind: "transfer_out"; lines: string[] }
  | { kind: "write_off"; lines: string[] }
  | { kind: "credit_note"; lines: string[] };

function moneyLine(label: string, amount: number): string {
  return `${label}|${roundMoney(amount)}`;
}

export function historyEventDetail(event: HistoryEvent, input: HistoryBuildInput): HistoryDetail {
  const rows = input.rows.filter((row) => event.rawIds.includes(row.id));
  const previous = roundMoney(event.balanceAfter - event.amount);
  const balance = [
    moneyLine("Previous balance", previous),
    moneyLine("Impact", event.amount),
    moneyLine("New balance", event.balanceAfter),
  ];
  if (event.kind === "charge") {
    const parent = rows.find((row) => row.id === event.id) ?? rows[0];
    const tax = rows.filter((row) => row.category === "tax");
    const service = rows.filter((row) => row.category === "service_charge");
    const ids = new Set(rows.map((row) => row.id));
    const credits = input.rows
      .filter(
        (row) =>
          row.referenceType === "invoice_credit_note" &&
          row.originalTransactionId &&
          ids.has(row.originalTransactionId),
      )
      .reduce((sum, row) => sum + row.amount, 0);
    const lines = [
      parent?.description ?? event.description,
      parent?.chargeSource ? `Source: ${parent.chargeSource}` : "",
      parent?.departmentName ? `Department: ${parent.departmentName}` : "",
      parent?.quantity != null ? `Quantity: ${parent.quantity}` : "",
      parent?.unitAmount != null ? moneyLine("Unit amount", parent.unitAmount) : "",
      moneyLine("Subtotal", parent?.amount ?? event.amount),
      ...tax.map((row) => moneyLine(`Tax: ${row.description}`, row.amount)),
      ...service.map((row) => moneyLine(`Service: ${row.description}`, row.amount)),
      moneyLine("Gross", event.amount),
      credits < -0.009 ? moneyLine("Credits", credits) : "",
      credits < -0.009 ? moneyLine("Effective gross", roundMoney(event.amount + credits)) : "",
      event.invoiceNumber
        ? event.invoiceId && input.coverage.legacyInvoice?.id === event.invoiceId
          ? `Covered by legacy invoice ${event.invoiceNumber}`
          : `Invoiced in ${event.invoiceNumber}`
        : "",
      event.debitNoteNumber ? `Billed via ${event.debitNoteNumber}` : "",
      ...balance,
    ].filter(Boolean);
    return { kind: "charge", lines };
  }
  if (event.kind === "deposit") {
    const allocations = input.allocations
      .filter((line) => line.depositTransactionId === event.id)
      .map((line) => ({
        description:
          input.rows.find((row) => row.id === line.chargeTransactionId)?.description ?? "Charge",
        amount: roundMoney(line.amount),
      }));
    return {
      kind: "deposit",
      lines: [event.description, event.context ?? "", event.state, ...balance].filter(Boolean),
      allocations,
    };
  }
  if (event.kind === "refund") {
    const source = input.rows.find((row) => row.id === rows[0]?.originalTransactionId);
    return {
      kind: "refund",
      lines: [
        event.description,
        source ? `Source: ${source.description}` : "",
        source ? moneyLine("Source amount", source.amount) : "",
        event.context ?? "",
        ...balance,
      ].filter(Boolean),
    };
  }
  if (event.kind === "transfer_in" || event.kind === "transfer_out") {
    return {
      kind: event.kind,
      lines: [
        event.description,
        event.counterparty ? `Other party: ${event.counterparty.label}` : "",
        ...balance,
      ].filter(Boolean),
    };
  }
  return {
    kind: event.kind,
    lines: [event.description, event.context ?? "", ...balance].filter(Boolean),
  };
}

export type ActivityEvent = {
  id: string;
  kind: string;
  label: string;
  occurredAt: string;
  detail: string;
  actor: string | null;
};

const ACTIVITY_LABEL: Record<string, string> = {
  invoice_issued: "Invoice issued",
  invoice_reprinted: "Invoice reprinted",
  credit_note_issued: "Credit note issued",
  debit_note_issued: "Debit note issued",
  deposit_allocated: "Deposit allocated",
  folio_closed: "Folio closed",
  financial_account_closed: "Account closed",
  invoice_draft_created: "Invoice draft created",
  invoice_draft_updated: "Invoice draft updated",
  invoice_draft_deleted: "Invoice draft deleted",
  credit_note_draft_created: "Credit note draft created",
  credit_note_draft_updated: "Credit note draft updated",
  credit_note_draft_deleted: "Credit note draft deleted",
  debit_note_draft_created: "Debit note draft created",
  debit_note_draft_updated: "Debit note draft updated",
  debit_note_draft_deleted: "Debit note draft deleted",
};

export function activityLabel(kind: string): string {
  return ACTIVITY_LABEL[kind] ?? kind.replaceAll("_", " ");
}

export function historyRowsFromFolio(
  rows: Array<{
    id: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    postedAt: string;
    createdAt?: string | null;
    postedBy: string | null;
    paymentMethod: string | null;
    originalTransactionId: string | null;
    referenceType: string | null;
    referenceId?: string | null;
    transferId?: string | null;
    quantity?: number | null;
    unitAmount?: number | null;
    chargeSource?: string | null;
    departmentName?: string | null;
  }>,
): HistoryLedgerRow[] {
  return rows.map((row) => ({
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
    referenceId: row.referenceId ?? null,
    transferId: row.transferId ?? null,
    quantity: row.quantity ?? null,
    unitAmount: row.unitAmount ?? null,
    chargeSource: row.chargeSource ?? null,
    departmentName: row.departmentName ?? null,
  }));
}

export function mergeDocumentActivity(
  events: ActivityEvent[],
  extra: ActivityEvent[],
): ActivityEvent[] {
  const seen = new Set(events.map((event) => `${event.kind}:${event.detail}`));
  const merged = events.slice();
  for (const event of extra) {
    const key = `${event.kind}:${event.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged.sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );
}
