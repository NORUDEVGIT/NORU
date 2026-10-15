/**
 * TEST-only sales receipt totals after a registered credit or debit note.
 *
 * Production keeps the phase block. An unadjusted invoice never reaches this
 * helper. The effective total is only the remaining-amount base: the registered
 * INV TotalValue minus registered CRE totals plus registered DEB totals.
 * invoice_total_amount stays the original registered INV total.
 */
import { fiscalMoney } from "./fiscal-guest-invoice.ts";

export const ADJUSTED_RECEIPT_BLOCKED =
  "Sales Receipt for invoices adjusted by Credit/Debit Notes is not supported in the current fiscal phase.";

export const TEST_ADJUSTED_RECEIPT_WARNING =
  "TEST ONLY — Sales Receipt after Credit/Debit adjustment is experimental.";

export type FiscalReceiptEnvironment = "TEST" | "PRODUCTION";

export type FiscalNoteAdjustment = {
  documentType: "CRE" | "DEB";
  status: string;
  total: number | null;
};

export function adjustedReceiptDecision(input: {
  hasAdjustingNotes: boolean;
  fiscalEnvironment?: FiscalReceiptEnvironment | null;
  notes?: FiscalNoteAdjustment[];
  originalTotal: number | null;
}): { blockReason: string | null; effectiveTotal: number | null } {
  if (!input.hasAdjustingNotes) return { blockReason: null, effectiveTotal: null };
  if (input.fiscalEnvironment !== "TEST") {
    return { blockReason: ADJUSTED_RECEIPT_BLOCKED, effectiveTotal: null };
  }
  const notes = input.notes ?? [];
  if (notes.length === 0 || notes.some((note) => note.status !== "REGISTERED")) {
    const pending = notes.some((note) => note.status === "PENDING" || note.status === "FAILED");
    return {
      blockReason: pending
        ? "A related Credit or Debit Note is pending or failed."
        : "Every issued Credit and Debit Note must be fiscally registered before a TEST sales receipt.",
      effectiveTotal: null,
    };
  }
  if (notes.some((note) => note.total == null || !Number.isFinite(note.total))) {
    return {
      blockReason: "A registered Credit or Debit Note is missing its fiscal total.",
      effectiveTotal: null,
    };
  }
  if (input.originalTotal == null) return { blockReason: null, effectiveTotal: null };
  const credit = fiscalMoney(
    notes
      .filter((note) => note.documentType === "CRE")
      .reduce((sum, note) => sum + fiscalMoney(note.total ?? 0), 0),
  );
  const debit = fiscalMoney(
    notes
      .filter((note) => note.documentType === "DEB")
      .reduce((sum, note) => sum + fiscalMoney(note.total ?? 0), 0),
  );
  const effective = fiscalMoney(input.originalTotal - credit + debit);
  if (effective < -0.01) {
    return {
      blockReason: "The adjusted fiscal invoice total is below zero.",
      effectiveTotal: null,
    };
  }
  return { blockReason: null, effectiveTotal: effective };
}
