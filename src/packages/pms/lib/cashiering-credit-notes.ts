export type InvoiceCreditState = "None" | "Partially Credited" | "Fully Credited";

export type CreditComponent = {
  id: string;
  kind: string;
  description: string;
  original: number;
  credited: number;
  remaining: number;
};

export type CreditGroup = {
  sourceGroupId: string;
  description: string;
  sourceGuest: string | null;
  sourceFolioNumber: string | null;
  sourceRoomNumber: string | null;
  originalGross: number;
  previouslyCredited: number;
  remaining: number;
};

export type CreditDraftItem = {
  sourceGroupId: string;
  gross: number;
};

export type CreditNoteSnapshot = {
  noteNumber: string;
  originalInvoiceNumber: string | null;
  currency: string;
  reason: string;
  issuedByName: string | null;
  billToName: string;
  groups: Array<{
    description: string;
    sourceGuest: string | null;
    sourceFolioNumber: string | null;
    originalGross: number;
    subtotal: number;
    tax: number;
    serviceCharge: number;
    creditGross: number;
    components: Array<{ kind: string; description: string; credited: number }>;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    serviceCharge: number;
    totalCredit: number;
    originalInvoice: number;
    previousCredits: number;
    previousDebits: number;
    netInvoice: number;
  };
};

export type IssuedCreditNote = {
  id: string;
  noteNumber: string;
  issuedAt: string;
  reason: string;
  total: number;
  issuedByName: string | null;
  reprintCount: number;
  snapshot: CreditNoteSnapshot;
};

export type CreditNoteBoard = {
  targetType: "guest_folio_invoice" | "financial_account_invoice";
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  billToName: string;
  originalTotal: number;
  previousCredits: number;
  previousDebits: number;
  remaining: number;
  netInvoice: number;
  creditState: InvoiceCreditState;
  balance: number;
  groups: CreditGroup[];
  draft: { id: string; reason: string; updatedAt: string; items: CreditDraftItem[] } | null;
  notes: IssuedCreditNote[];
};

export type CreditPreview = {
  ok: boolean;
  code?: string;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  netAfter: number;
  projectedBalance: number;
  creditBalance: number | null;
  groups: CreditNoteSnapshot["groups"];
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

export function roundCredit(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Remaining creditable amount on a frozen invoice component or group. */
export function creditRemainder(original: number, credited: number): number {
  return roundCredit(Math.max(0, original - credited));
}

export function invoiceCreditState(original: number, credited: number): InvoiceCreditState {
  const used = roundCredit(credited);
  const remaining = creditRemainder(original, used);
  if (used <= 0.009) return "None";
  if (remaining <= 0.009) return "Fully Credited";
  return "Partially Credited";
}

/** Ledger balance after a credit posts. A negative result is a credit balance, not a refund. */
export function projectedLedgerBalance(balance: number, creditTotal: number): number {
  return roundCredit(balance - creditTotal);
}

export function mapCreditSnapshot(value: unknown): CreditNoteSnapshot {
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
    groups: groups.map((group) => {
      const item = group as Record<string, unknown>;
      const components = Array.isArray(item.components) ? item.components : [];
      return {
        description: text(item.description) ?? "Charge",
        sourceGuest: text(item.sourceGuest),
        sourceFolioNumber: text(item.sourceFolioNumber),
        originalGross: num(item.originalGross),
        subtotal: num(item.subtotal),
        tax: num(item.tax),
        serviceCharge: num(item.serviceCharge),
        creditGross: num(item.creditGross),
        components: components.map((component) => {
          const line = component as Record<string, unknown>;
          return {
            kind: text(line.kind) ?? "parent",
            description: text(line.description) ?? "Charge",
            credited: num(line.credited),
          };
        }),
      };
    }),
    totals: {
      subtotal: num(totals.subtotal),
      tax: num(totals.tax),
      serviceCharge: num(totals.serviceCharge),
      totalCredit: num(totals.totalCredit),
      originalInvoice: num(totals.originalInvoice),
      previousCredits: num(totals.previousCredits),
      previousDebits: num(totals.previousDebits),
      netInvoice: num(totals.netInvoice),
    },
  };
}

export function mapCreditBoard(value: unknown): CreditNoteBoard {
  const row = (value ?? {}) as Record<string, unknown>;
  const draft = (row.draft ?? null) as Record<string, unknown> | null;
  const groups = Array.isArray(row.groups) ? row.groups : [];
  const notes = Array.isArray(row.notes) ? row.notes : [];
  const state = text(row.creditState);
  return {
    targetType:
      row.targetType === "financial_account_invoice"
        ? "financial_account_invoice"
        : "guest_folio_invoice",
    invoiceId: String(row.invoiceId ?? ""),
    invoiceNumber: String(row.invoiceNumber ?? ""),
    issuedAt: String(row.issuedAt ?? ""),
    currency: String(row.currency ?? "ETB"),
    billToName: String(row.billToName ?? ""),
    originalTotal: num(row.originalTotal),
    previousCredits: num(row.previousCredits),
    previousDebits: num(row.previousDebits),
    remaining: num(row.remaining),
    netInvoice: num(row.netInvoice),
    creditState: state === "Partially Credited" || state === "Fully Credited" ? state : "None",
    balance: num(row.balance),
    groups: groups.map((group) => {
      const item = group as Record<string, unknown>;
      return {
        sourceGroupId: String(item.sourceGroupId ?? ""),
        description: text(item.description) ?? "Charge",
        sourceGuest: text(item.sourceGuest),
        sourceFolioNumber: text(item.sourceFolioNumber),
        sourceRoomNumber: text(item.sourceRoomNumber),
        originalGross: num(item.originalGross),
        previouslyCredited: num(item.previouslyCredited),
        remaining: num(item.remaining),
      };
    }),
    draft: draft
      ? {
          id: String(draft.id ?? ""),
          reason: text(draft.reason) ?? "",
          updatedAt: String(draft.updatedAt ?? ""),
          items: Array.isArray(draft.items)
            ? draft.items.map((item) => {
                const rowItem = item as Record<string, unknown>;
                return {
                  sourceGroupId: String(rowItem.sourceGroupId ?? ""),
                  gross: num(rowItem.gross),
                };
              })
            : [],
        }
      : null,
    notes: notes.map((note) => {
      const item = note as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        noteNumber: String(item.noteNumber ?? ""),
        issuedAt: String(item.issuedAt ?? ""),
        reason: text(item.reason) ?? "",
        total: num(item.total),
        issuedByName: text(item.issuedByName),
        reprintCount: num(item.reprintCount),
        snapshot: mapCreditSnapshot(item.snapshot),
      };
    }),
  };
}

export function mapCreditPreview(value: unknown): CreditPreview {
  const row = (value ?? {}) as Record<string, unknown>;
  const groups = Array.isArray(row.groups) ? row.groups : [];
  return {
    ok: row.ok === true,
    code: text(row.code) ?? undefined,
    subtotal: num(row.subtotal),
    tax: num(row.tax),
    serviceCharge: num(row.serviceCharge),
    total: num(row.total),
    netAfter: num(row.netAfter),
    projectedBalance: num(row.projectedBalance),
    creditBalance: row.creditBalance == null ? null : num(row.creditBalance),
    groups: mapCreditSnapshot({ groups, document: {}, billTo: {}, totals: {} }).groups,
  };
}
