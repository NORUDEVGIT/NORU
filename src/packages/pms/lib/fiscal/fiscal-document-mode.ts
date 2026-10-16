/**
 * Fiscal document Mode is settlement timing, not a tender type.
 *
 * CASH means eligible settlement already covers the original fiscal invoice
 * total. CREDIT means it does not. Eligible settlement is payment allocations
 * plus deposit amounts applied to that invoice. Write-offs, transfers,
 * withholding, and credit or debit notes do not count. A deposit on a CASH
 * invoice stays inside that invoice. A deposit applied after a CREDIT invoice
 * is a sales receipt.
 */
export const FISCAL_DOCUMENT_MODES = ["CASH", "CREDIT"] as const;
export type FiscalDocumentMode = (typeof FISCAL_DOCUMENT_MODES)[number];

export const SALES_RECEIPT_CASH_BLOCK =
  "Sales Receipt is not applicable because the original fiscal invoice was registered as CASH.";

export const FISCAL_CASH_REASON =
  "Invoice was fully settled by payments and applied deposits before fiscal registration.";

export const FISCAL_CREDIT_REASON =
  "Invoice is not fully covered by payments and applied deposits.";

export type EligibleAllocationKind = "payment" | "deposit" | "other";

export type EligibleAllocationRow = {
  id: string;
  amount: number;
  reversesAllocationId: string | null;
  sourceKind: EligibleAllocationKind;
};

export type FiscalSettlementSummary = {
  mode: FiscalDocumentMode;
  eligiblePayments: number;
  invoiceTotal: number;
  unpaid: number;
  reason: string;
};

export function isFiscalDocumentMode(value: unknown): value is FiscalDocumentMode {
  return value === "CASH" || value === "CREDIT";
}

export function frozenFiscalMode(snapshot: unknown): FiscalDocumentMode | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const mode = (snapshot as { Mode?: unknown }).Mode;
  return isFiscalDocumentMode(mode) ? mode : null;
}

/** Positive, non-reversed allocations whose source transaction is a payment. */
export function eligiblePaymentTotal(rows: readonly EligibleAllocationRow[]): number {
  return coveredTotal(rows, new Set(["payment"]));
}

/** Payments plus deposits applied to the invoice. This is the fiscal CASH base. */
export function eligibleSettlementTotal(rows: readonly EligibleAllocationRow[]): number {
  return coveredTotal(rows, new Set(["payment", "deposit"]));
}

function coveredTotal(
  rows: readonly EligibleAllocationRow[],
  kinds: ReadonlySet<EligibleAllocationKind>,
): number {
  const reversed = new Set(
    rows
      .map((row) => row.reversesAllocationId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const total = rows.reduce((sum, row) => {
    if (!kinds.has(row.sourceKind)) return sum;
    if (row.reversesAllocationId) return sum;
    if (reversed.has(row.id)) return sum;
    if (!(row.amount > 0.009)) return sum;
    return sum + row.amount;
  }, 0);
  return money(total);
}

export function deriveFiscalDocumentMode(
  originalTotal: number,
  eligiblePayments: number,
): FiscalDocumentMode {
  const unpaid = money(originalTotal - eligiblePayments);
  return unpaid <= 0.01 ? "CASH" : "CREDIT";
}

export function fiscalSettlementSummary(
  originalTotal: number,
  eligiblePayments: number,
): FiscalSettlementSummary {
  const total = money(originalTotal);
  const eligible = money(eligiblePayments);
  const mode = deriveFiscalDocumentMode(total, eligible);
  const unpaid = money(Math.max(0, total - eligible));
  return {
    mode,
    eligiblePayments: eligible,
    invoiceTotal: total,
    unpaid,
    reason: mode === "CASH" ? FISCAL_CASH_REASON : FISCAL_CREDIT_REASON,
  };
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Issued invoice total from a frozen guest or company invoice snapshot. */
export function snapshotInvoiceTotal(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const totals = (snapshot as { totals?: Record<string, unknown> }).totals;
  if (!totals) return 0;
  if (totals.invoiceTotal != null && Number.isFinite(Number(totals.invoiceTotal))) {
    return money(Number(totals.invoiceTotal));
  }
  const subtotal = Number(totals.subtotal ?? 0);
  const tax = Number(totals.tax ?? 0);
  const service = Number(totals.serviceCharge ?? 0);
  return money(subtotal + tax + service);
}
