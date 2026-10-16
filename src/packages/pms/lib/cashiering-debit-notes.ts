import {
  mapCashieringDocumentProperty,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";

export type DebitSourceGroup = {
  sourceGroupId: string;
  postedAt: string | null;
  description: string;
  departmentName: string | null;
  quantity: number | null;
  unitAmount: number | null;
  subtotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grossTotal: number;
  sourceGuest: string | null;
  sourceFolioNumber: string | null;
};

export type DebitNoteSnapshot = {
  noteNumber: string;
  originalInvoiceNumber: string | null;
  currency: string;
  reason: string;
  issuedByName: string | null;
  billToName: string;
  property: CashieringDocumentProperty | null;
  groups: Array<{
    description: string;
    postedAt: string | null;
    departmentName: string | null;
    quantity: number | null;
    unitAmount: number | null;
    sourceGuest: string | null;
    sourceFolioNumber: string | null;
    subtotal: number;
    tax: number;
    serviceCharge: number;
    gross: number;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    serviceCharge: number;
    debitTotal: number;
    originalInvoice: number;
    previousCredits: number;
    previousDebits: number;
    netInvoice: number;
  };
};

export type IssuedDebitNote = {
  id: string;
  noteNumber: string;
  issuedAt: string;
  reason: string;
  total: number;
  issuedByName: string | null;
  reprintCount: number;
  snapshot: DebitNoteSnapshot;
};

export type DebitNoteBoard = {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  billToName: string;
  originalTotal: number;
  previousCredits: number;
  previousDebits: number;
  netInvoice: number;
  balance: number;
  eligibleGroups: DebitSourceGroup[];
  draft: { id: string; reason: string; updatedAt: string; sourceIds: string[] } | null;
  notes: IssuedDebitNote[];
  property: CashieringDocumentProperty | null;
};

export type DebitPreview = {
  ok: boolean;
  code?: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  originalInvoice: number;
  previousCredits: number;
  previousDebits: number;
  netAfter: number;
  balance: number;
  groups: DebitNoteSnapshot["groups"];
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function roundDebit(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Documented invoice amount. The stored invoice total is never rewritten. */
export function invoiceDocumentNet(original: number, credits: number, debits: number): number {
  return roundDebit(original - credits + debits);
}

/** Full posted charge group. Tax and service stay with the parent; nothing is recalculated. */
export function debitChargeTotal(subtotal: number, tax: number, serviceCharge: number): number {
  return roundDebit(subtotal + tax + serviceCharge);
}

export function mapDebitSnapshot(value: unknown): DebitNoteSnapshot {
  const row = (value ?? {}) as Record<string, unknown>;
  const document = (row.document ?? {}) as Record<string, unknown>;
  const billTo = (row.billTo ?? {}) as Record<string, unknown>;
  const totals = (row.totals ?? {}) as Record<string, unknown>;
  const groups = Array.isArray(row.groups) ? row.groups : [];
  return {
    noteNumber: text(document.noteNumber) ?? "",
    originalInvoiceNumber: text(document.originalInvoiceNumber),
    currency: text(document.currency) ?? "ETB",
    reason: text(document.reason) ?? "",
    issuedByName: text(document.issuedByName),
    billToName: text(billTo.name) ?? "Account",
    property: mapCashieringDocumentProperty(row.property),
    groups: groups.map((group) => {
      const item = group as Record<string, unknown>;
      return {
        description: text(item.description) ?? "Charge",
        postedAt: text(item.postedAt),
        departmentName: text(item.departmentName),
        quantity: item.quantity == null ? null : num(item.quantity),
        unitAmount: item.unitAmount == null ? null : num(item.unitAmount),
        sourceGuest: text(item.sourceGuest),
        sourceFolioNumber: text(item.sourceFolioNumber),
        subtotal: num(item.subtotal),
        tax: num(item.tax),
        serviceCharge: num(item.serviceCharge),
        gross: num(item.gross),
      };
    }),
    totals: {
      subtotal: num(totals.subtotal),
      tax: num(totals.tax),
      serviceCharge: num(totals.serviceCharge),
      debitTotal: num(totals.debitTotal),
      originalInvoice: num(totals.originalInvoice),
      previousCredits: num(totals.previousCredits),
      previousDebits: num(totals.previousDebits),
      netInvoice: num(totals.netInvoice),
    },
  };
}

function mapSourceGroup(value: unknown): DebitSourceGroup {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    sourceGroupId: String(item.sourceGroupId ?? item.parentTransactionId ?? ""),
    postedAt: text(item.postedAt),
    description: text(item.description) ?? "Charge",
    departmentName: text(item.departmentName),
    quantity: item.quantity == null ? null : num(item.quantity),
    unitAmount: item.unitAmount == null ? null : num(item.unitAmount),
    subtotal: num(item.subtotal),
    taxTotal: num(item.taxTotal),
    serviceChargeTotal: num(item.serviceChargeTotal),
    grossTotal: num(item.grossTotal ?? item.gross),
    sourceGuest: text(item.sourceGuest),
    sourceFolioNumber: text(item.sourceFolioNumber),
  };
}

function mapIssuedNote(value: unknown): IssuedDebitNote {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    noteNumber: String(item.noteNumber ?? ""),
    issuedAt: String(item.issuedAt ?? ""),
    reason: text(item.reason) ?? "",
    total: num(item.total),
    issuedByName: text(item.issuedByName),
    reprintCount: num(item.reprintCount),
    snapshot: mapDebitSnapshot(item.snapshot),
  };
}

export function mapDebitBoard(value: unknown): DebitNoteBoard {
  const row = (value ?? {}) as Record<string, unknown>;
  const draft = (row.draft ?? null) as Record<string, unknown> | null;
  const groups = Array.isArray(row.eligibleGroups) ? row.eligibleGroups : [];
  const notes = Array.isArray(row.notes) ? row.notes : [];
  return {
    invoiceId: String(row.invoiceId ?? ""),
    invoiceNumber: String(row.invoiceNumber ?? ""),
    issuedAt: String(row.issuedAt ?? ""),
    currency: String(row.currency ?? "ETB"),
    billToName: String(row.billToName ?? ""),
    originalTotal: num(row.originalTotal),
    previousCredits: num(row.previousCredits),
    previousDebits: num(row.previousDebits),
    netInvoice: num(row.netInvoice),
    balance: num(row.balance),
    property: mapCashieringDocumentProperty(row.property),
    eligibleGroups: groups.map(mapSourceGroup),
    draft: draft
      ? {
          id: String(draft.id ?? ""),
          reason: text(draft.reason) ?? "",
          updatedAt: String(draft.updatedAt ?? ""),
          sourceIds: Array.isArray(draft.sourceIds) ? draft.sourceIds.map(String) : [],
        }
      : null,
    notes: notes.map(mapIssuedNote),
  };
}

export function mapDebitPreview(value: unknown): DebitPreview {
  const row = (value ?? {}) as Record<string, unknown>;
  const groups = Array.isArray(row.groups) ? row.groups : [];
  return {
    ok: row.ok === true,
    code: text(row.code) ?? undefined,
    subtotal: num(row.subtotal),
    tax: num(row.tax),
    serviceCharge: num(row.serviceCharge),
    total: num(row.total),
    originalInvoice: num(row.originalInvoice),
    previousCredits: num(row.previousCredits),
    previousDebits: num(row.previousDebits),
    netAfter: num(row.netAfter),
    balance: num(row.balance),
    groups: mapDebitSnapshot({ groups, document: {}, billTo: {}, totals: {} }).groups,
  };
}
