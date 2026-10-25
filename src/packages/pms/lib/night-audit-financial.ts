/**
 * Night Audit financial reconciliation.
 *
 * Reads frozen Cashiering facts and classifies them. It does not post, allocate,
 * invoice, register, retry, or close a drawer.
 *
 * Guest invoice outstanding comes from classifyIssuedGuestInvoice.
 * Account outstanding comes from invoiceOutstanding.
 * Occupancy fee has no canonical category, so it stays inside tax.
 */
import {
  ALLOCATION_TOLERANCE,
  displayOutstanding,
  invoiceEffectiveNet,
  invoiceOutstanding,
  paymentAvailable,
} from "./cashiering-account-allocation.ts";
import {
  GUEST_ALLOCATION_TOLERANCE,
  classifyIssuedGuestInvoice,
  guestPaymentAvailable,
} from "./cashiering-guest-allocation.ts";
import { folioLedgerExceptions, settlementIntegrityExceptions } from "./night-audit-settlement.ts";

export const NIGHT_AUDIT_FINANCIAL_DETAIL_ROLES = [
  "owner",
  "manager",
  "cashier",
  "accountant",
] as const;

export const OCCUPANCY_FEE_NOTE =
  "Included in tax. No canonical occupancy-fee category is stored on frozen lines.";

export const FINANCIAL_UNAVAILABLE_MESSAGE =
  "Financial reconciliation is unavailable. Close stays blocked.";

/** Implemented fiscal handler pairs. Enabled only when the property fiscal integration is on. */
export const NIGHT_AUDIT_FISCAL_HANDLERS = [
  { documentType: "INV", sourceType: "guest_invoice" },
  { documentType: "INV", sourceType: "account_invoice" },
  { documentType: "CRE", sourceType: "credit_note" },
  { documentType: "DEB", sourceType: "debit_note" },
  { documentType: "SALES_RECEIPT", sourceType: "guest_allocation" },
  { documentType: "SALES_RECEIPT", sourceType: "account_allocation" },
  { documentType: "WITHHOLDING", sourceType: "withholding" },
] as const;

export const NIGHT_AUDIT_FINANCIAL_CATEGORIES = [
  "guest_folios",
  "invoices",
  "payments_deposits",
  "accounts",
  "drawers",
  "fiscal",
  "tax",
] as const;

export type NightAuditFinancialCategory = (typeof NIGHT_AUDIT_FINANCIAL_CATEGORIES)[number];
export type NightAuditFinancialStatus = "ready" | "warning" | "blocked" | "unavailable";
export type NightAuditRowStatus = "pass" | "warning" | "blocker" | "info";

export type NightAuditFinancialIssue = {
  id: string;
  code: string;
  module: "night_audit";
  category: NightAuditFinancialCategory;
  severity: "blocking" | "warning" | "info";
  title: string;
  description: string;
  referenceType: string;
  referenceId: string;
  route: string;
  search?: Record<string, string>;
  currency?: string;
  amount?: number;
  createdAt?: string;
};

export type NightAuditFinancialException = {
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
};

const CASHIERING = "/restaurant/pms/cashiering";
const FISCAL_QUEUE = "/restaurant/pms/cashiering";

export type GuestFolioFact = {
  id: string;
  number: string;
  status: string;
  closedAt: string | null;
  guestName: string;
  reservationId: string | null;
  confirmationNumber: string;
  room: string;
  currency: string;
};

export type FinancialTransactionFact = {
  folioId: string;
  amount: number;
  postedAt: string;
  referenceType: string | null;
  referenceId: string | null;
};

export type MissingFolioFact = {
  id: string;
  confirmationNumber: string;
  status: string;
  guestName: string;
  room: string;
};

export type GuestInvoiceFact = {
  id: string;
  folioId: string;
  number: string;
  issuedAt: string | null;
  guestName: string;
  currency: string;
  eligible: boolean;
  invoiceTotal: number | null;
  noteDeltas: readonly number[];
  paymentAllocated: number;
  depositApplied: number;
  cashDebitCovered: number;
  snapshotTax: number | null;
  snapshotServiceCharge: number | null;
  /** Tax comparison uses invoices issued on the audit date. Settlement still sees every invoice. */
  issuedOnAuditDate?: boolean;
};

export type GuestSourceFact = {
  id: string;
  folioId?: string | null;
  kind: "payment" | "deposit";
  reference: string;
  guestName: string;
  currency: string;
  face: number;
  refunded: number;
  allocated: number;
  targetInvoice: string | null;
};

export type GuestAllocationFact = {
  id: string;
  invoiceId: string;
  amount: number;
  sourceId: string;
  kind: "payment" | "deposit";
  folioId?: string | null;
};

export type AccountInvoiceFact = {
  id: string;
  number: string;
  voided: boolean;
  issued: boolean;
  invoiceTotal: number;
  noteDeltas: readonly number[];
  allocated: number;
  withholdingNet: number;
  snapshotWithholding: number | null;
  currency: string;
};

export type AccountPaymentFact = {
  id: string;
  face: number;
  refunded: number;
  allocated: number;
  currency: string;
};

export type AccountAllocationFact = {
  id: string;
  invoiceId: string;
  paymentId: string;
  amount: number;
};

export type AccountFact = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  invoices: readonly AccountInvoiceFact[];
  payments: readonly AccountPaymentFact[];
  allocations: readonly AccountAllocationFact[];
};

export type TransferFact = {
  id: string;
  transferId: string | null;
  direction: string;
  amount: number;
  accountId: string | null;
};

export type DrawerFact = {
  id: string;
  cashier: string;
  shift: string;
  openedAt: string;
  expectedCash: number;
  closingCount: number | null;
  variance: number | null;
  state: "open" | "closed";
  scope: "hotel" | "restaurant";
  currency: string;
};

export type FiscalDocumentFact = {
  id: string;
  number: string;
  documentType: string;
  sourceType: string;
  issuedAt: string | null;
  status: string;
  externalReference: string | null;
  mode: string | null;
  folioId?: string | null;
  accountId?: string | null;
  invoiceId?: string | null;
};

export type TaxLineFact = {
  currency: string;
  category: "tax" | "service_charge";
  amount: number;
};

export type NightAuditFinancialFacts = {
  businessDate: string;
  timezone: string;
  checkedAt: string;
  folios: readonly GuestFolioFact[];
  transactions: readonly FinancialTransactionFact[];
  missingFolios: readonly MissingFolioFact[];
  invoices: readonly GuestInvoiceFact[];
  sources: readonly GuestSourceFact[];
  allocations: readonly GuestAllocationFact[];
  accounts: readonly AccountFact[];
  transfers: readonly TransferFact[];
  drawers: readonly DrawerFact[];
  integrationEnabled: boolean;
  fiscalDocuments: readonly FiscalDocumentFact[];
  taxLines: readonly TaxLineFact[];
};

export type GuestFolioRow = {
  id: string;
  guest: string;
  reservation: string;
  room: string;
  folio: string;
  balance: number | null;
  currency: string | null;
  invoiceState: string;
  status: NightAuditRowStatus;
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
};

export type InvoiceSettlementRow = {
  id: string;
  invoice: string;
  guest: string;
  issuedAt: string | null;
  currency: string | null;
  invoiceTotal: number | null;
  paidAllocation: number | null;
  depositApplied: number | null;
  creditDebitAdjustment: number | null;
  cashDebitCovered: number | null;
  outstanding: number | null;
  status: NightAuditRowStatus;
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
};

export type AllocationRow = {
  id: string;
  type: string;
  reference: string;
  guest: string;
  currency: string | null;
  amount: number | null;
  allocated: number | null;
  available: number | null;
  targetInvoice: string | null;
  status: NightAuditRowStatus;
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
};

export type AccountRow = {
  id: string;
  account: string;
  type: string;
  invoices: number;
  currency: string | null;
  outstandingAr: number | null;
  unallocatedPayment: number | null;
  status: NightAuditRowStatus;
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
};

export type DrawerRow = {
  id: string;
  cashier: string;
  shift: string;
  openedAt: string;
  currency: string | null;
  expectedCash: number | null;
  closingCount: number | null;
  variance: number | null;
  status: NightAuditRowStatus;
  state: "open" | "closed";
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
};

export type FiscalRow = {
  id: string;
  document: string;
  type: string;
  issuedAt: string | null;
  fiscalStatus: string;
  externalReference: string | null;
  mode: string | null;
  status: NightAuditRowStatus;
  issue: string;
  action: string;
  route: string;
  search?: Record<string, string>;
  /** Night Audit close authorization only; it never changes fiscalStatus. */
  nightAuditOverride?: {
    reason: string;
    reasonCategory: string | null;
    overriddenBy: string | null;
    overriddenAt: string;
  } | null;
};

export type TaxCurrencyRow = {
  currency: string;
  tax: number;
  serviceCharge: number;
  occupancyFee: null;
};

export type NightAuditFinancialReconciliation = {
  status: Exclude<NightAuditFinancialStatus, "unavailable">;
  access: "detail" | "summary";
  businessDate: string;
  timezone: string;
  checkedAt: string;
  summary: {
    blockerCount: number;
    warningCount: number;
    openDrawerCount: number;
    fiscalProblemCount: number;
    fiscalOverrideCount?: number;
    infoCount: number;
  };
  guestFolios: GuestFolioRow[];
  invoiceSettlement: InvoiceSettlementRow[];
  allocations: AllocationRow[];
  accounts: AccountRow[];
  drawers: DrawerRow[];
  drawerState: "clear" | "blocked" | "na";
  fiscal: FiscalRow[];
  fiscalConfigured: boolean;
  taxSummary: TaxCurrencyRow[];
  occupancyFeeSeparated: false;
  occupancyFeeNote: string;
  issues: NightAuditFinancialIssue[];
};

export function canViewNightAuditFinancialDetail(role: string): boolean {
  return (NIGHT_AUDIT_FINANCIAL_DETAIL_ROLES as readonly string[]).includes(role);
}

export function fiscalHandlerEnabled(
  integrationEnabled: boolean,
  documentType: string,
  sourceType: string,
): boolean {
  if (!integrationEnabled) return false;
  return NIGHT_AUDIT_FISCAL_HANDLERS.some(
    (handler) => handler.documentType === documentType && handler.sourceType === sourceType,
  );
}

export function financialAllowsClose(status: NightAuditFinancialStatus): boolean {
  return status === "ready" || status === "warning";
}

const REFERENCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function financialIssuesToExceptions(
  issues: readonly Pick<
    NightAuditFinancialIssue,
    "code" | "severity" | "referenceType" | "referenceId" | "description"
  >[],
): NightAuditFinancialException[] {
  return issues.flatMap((issue): NightAuditFinancialException[] => {
      if (issue.severity !== "blocking" && issue.severity !== "warning") return [];
      const referenceIsUuid = REFERENCE_UUID.test(issue.referenceId);
      return [{
        exceptionType: referenceIsUuid ? issue.code : `${issue.code}:${issue.referenceId}`,
        severity: issue.severity,
        referenceType: issue.referenceType,
        referenceId: referenceIsUuid ? issue.referenceId : null,
        message: issue.description,
      }];
    });
}

export function mergeAuditExceptions<T extends NightAuditFinancialException>(
  existing: readonly T[],
  extra: readonly T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of [...existing, ...extra]) {
    const key = `${row.exceptionType}::${row.referenceId ?? ""}`;
    const current = map.get(key);
    if (!current || (current.severity !== "blocking" && row.severity === "blocking")) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

export function financialEmptyCopy(
  kind: "issues" | "fiscal" | "drawers" | "accounts" | "access" | "failed" | "loading" | "redacted",
): string {
  if (kind === "issues") return "No financial issues for this business date.";
  if (kind === "fiscal") return "No fiscal handler configured.";
  if (kind === "drawers") return "No hotel drawers.";
  if (kind === "accounts") return "No company, group, or master accounts.";
  if (kind === "access") return "You don't have access to Night Audit for this property.";
  if (kind === "loading") return "Checking financial reconciliation…";
  if (kind === "redacted")
    return "Financial amounts are limited to owner, manager, cashier, and accountant.";
  return FINANCIAL_UNAVAILABLE_MESSAGE;
}

function cashieringSearch(): Record<string, string> {
  return { tab: "folios" };
}

function issue(input: Omit<NightAuditFinancialIssue, "module" | "id">): NightAuditFinancialIssue {
  return {
    ...input,
    id: `${input.code}:${input.referenceId}`,
    module: "night_audit",
  };
}

function rowStatus(severity: "blocking" | "warning" | "info" | null): NightAuditRowStatus {
  if (severity === "blocking") return "blocker";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return "pass";
}

function worst(issues: readonly NightAuditFinancialIssue[]): NightAuditFinancialIssue | null {
  return (
    issues.find((row) => row.severity === "blocking") ??
    issues.find((row) => row.severity === "warning") ??
    issues.find((row) => row.severity === "info") ??
    null
  );
}

function signed(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function fiscalSeverity(status: string): "blocking" | "warning" | "info" | null {
  if (status === "FAILED" || status === "CANCEL_PENDING" || status === "NOT_REGISTERED" || status === "BLOCKED") {
    return "blocking";
  }
  if (status === "PENDING") return "warning";
  if (status === "REGISTERED" || status === "CANCELLED") return "info";
  return "blocking";
}

function fiscalCode(status: string): string {
  if (status === "FAILED") return "fiscal_failed";
  if (status === "CANCEL_PENDING") return "fiscal_cancel_pending";
  if (status === "NOT_REGISTERED") return "fiscal_not_registered";
  if (status === "BLOCKED") return "fiscal_blocked";
  if (status === "PENDING") return "fiscal_pending";
  if (status === "CANCELLED") return "fiscal_cancelled";
  if (status === "REGISTERED") return "fiscal_registered";
  return "fiscal_unrecognized";
}

function transferDirection(value: string): "out" | "in" | null {
  if (value === "out" || value === "transfer_out") return "out";
  if (value === "in" || value === "transfer_in") return "in";
  return null;
}

export function reconcileNightAuditFinancials(
  facts: NightAuditFinancialFacts,
): NightAuditFinancialReconciliation {
  const issues: NightAuditFinancialIssue[] = [];
  const ledger = folioLedgerExceptions({
    folios: facts.folios.map((folio) => ({
      id: folio.id,
      number: folio.number,
      status: folio.status,
      closedAt: folio.closedAt,
    })),
    transactions: facts.transactions,
    missingFolios: facts.missingFolios,
  });
  const classified = facts.invoices.map((invoice) => ({
    invoice,
    result: classifyIssuedGuestInvoice({
      eligible: invoice.eligible,
      invoiceTotal: invoice.invoiceTotal,
      noteDeltas: invoice.noteDeltas,
      paymentAllocated: invoice.paymentAllocated,
      depositApplied: invoice.depositApplied,
      cashDebitCovered: invoice.cashDebitCovered,
    }),
  }));
  const settlement = settlementIntegrityExceptions({
    folios: facts.folios.map((folio) => ({
      id: folio.id,
      number: folio.number,
      balance: ledger.balances.get(folio.id) ?? 0,
    })),
    invoices: classified.map((row) => ({
      id: row.invoice.id,
      folioId: row.invoice.folioId,
      number: row.invoice.number,
      eligible: row.invoice.eligible,
      invoiceTotal: row.invoice.invoiceTotal,
      noteDeltas: row.invoice.noteDeltas,
      paymentAllocated: row.invoice.paymentAllocated,
      depositApplied: row.invoice.depositApplied,
      cashDebitCovered: row.invoice.cashDebitCovered,
    })),
    payments: facts.sources.map((source) => ({
      id: source.id,
      face: source.face,
      refunded: source.refunded,
      allocated: source.allocated,
    })),
    allocations: facts.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount,
    })),
  });

  for (const row of ledger.exceptions) {
    const isStay = row.referenceType === "reservation";
    const targetRoute = isStay && row.referenceId
      ? `/restaurant/pms/reservations/${row.referenceId}`
      : row.referenceId
        ? `/restaurant/pms/cashiering/folios/${row.referenceId}`
        : CASHIERING;
    const targetSearch = isStay
      ? {}
      : row.exceptionType === "closed_folio_nonzero_balance"
        ? { tab: "settlement" }
        : row.exceptionType === "closed_folio_post_activity"
          ? { tab: "history" }
          : row.referenceId
            ? { tab: "charges" }
            : cashieringSearch();
    issues.push(
      issue({
        code: row.exceptionType,
        category: "guest_folios",
        severity: row.severity,
        title: row.exceptionType === "missing_folio" ? "Missing folio" : "Guest folio",
        description: row.message,
        referenceType: row.referenceType ?? "folio",
        referenceId: row.referenceId ?? "",
        route: targetRoute,
        search: targetSearch,
        createdAt: facts.checkedAt,
      }),
    );
  }
  for (const row of settlement) {
    const category = row.exceptionType === "folio_invoice_contradiction" ? "invoices" : "payments_deposits";
    const targetRoute = row.referenceId ? `/restaurant/pms/cashiering/folios/${row.referenceId}` : CASHIERING;
    issues.push(
      issue({
        code: row.exceptionType,
        category,
        severity: row.severity,
        title:
          row.exceptionType === "folio_invoice_contradiction"
            ? "Invoice and folio disagree"
            : "Allocation integrity",
        description: row.message,
        referenceType: row.referenceType ?? "allocation",
        referenceId: row.referenceId ?? "",
        route: targetRoute,
        search: category === "invoices" ? { tab: "invoices" } : { tab: "payments" },
        createdAt: facts.checkedAt,
      }),
    );
  }

  for (const source of facts.sources) {
    const available = guestPaymentAvailable(source.face, source.refunded, source.allocated);
    if (available > GUEST_ALLOCATION_TOLERANCE) {
      const targetRoute = source.folioId
        ? `/restaurant/pms/cashiering/folios/${source.folioId}`
        : CASHIERING;
      const targetSearch = source.folioId
        ? { tab: "payments", action: "allocate", payment: source.id }
        : { tab: "folios", q: source.reference || source.guestName };
      issues.push(
        issue({
          code: source.kind === "deposit" ? "unallocated_guest_deposit" : "unallocated_guest_payment",
          category: "payments_deposits",
          severity: "warning",
          title: source.kind === "deposit" ? "Unallocated deposit" : "Unallocated payment",
          description: `${source.reference} still has ${available.toFixed(2)} ${source.currency} available. Unallocated cash is not corruption.`,
          referenceType: "folio_transaction",
          referenceId: source.id,
          route: targetRoute,
          search: targetSearch,
          currency: source.currency,
          amount: available,
          createdAt: facts.checkedAt,
        }),
      );
    }
  }

  const accountIssues = reconcileAccounts(facts);
  issues.push(...accountIssues.issues);
  const drawerIssues = reconcileDrawers(facts);
  issues.push(...drawerIssues.issues);
  const fiscalIssues = reconcileFiscal(facts);
  issues.push(...fiscalIssues.issues);
  const tax = reconcileTax(facts, classified);
  issues.push(...tax.issues);

  const guestFolios = guestFolioRows(facts, ledger.balances, classified, issues);
  const invoiceSettlement = invoiceRows(classified, issues);
  const allocations = allocationRows(facts, issues);
  const summary = {
    blockerCount: issues.filter((row) => row.severity === "blocking").length,
    warningCount: issues.filter((row) => row.severity === "warning").length,
    openDrawerCount: drawerIssues.rows.filter((row) => row.state === "open").length,
    fiscalProblemCount: fiscalIssues.issues.filter((row) => row.severity !== "info").length,
    infoCount: issues.filter((row) => row.severity === "info").length,
  };
  const status: NightAuditFinancialReconciliation["status"] =
    summary.blockerCount > 0 ? "blocked" : summary.warningCount > 0 ? "warning" : "ready";

  return {
    status,
    access: "detail",
    businessDate: facts.businessDate,
    timezone: facts.timezone,
    checkedAt: facts.checkedAt,
    summary,
    guestFolios,
    invoiceSettlement,
    allocations,
    accounts: accountIssues.rows,
    drawers: drawerIssues.rows,
    drawerState: drawerIssues.state,
    fiscal: fiscalIssues.rows,
    fiscalConfigured: facts.integrationEnabled,
    taxSummary: tax.rows,
    occupancyFeeSeparated: false,
    occupancyFeeNote: OCCUPANCY_FEE_NOTE,
    issues,
  };
}

function guestFolioRows(
  facts: NightAuditFinancialFacts,
  balances: ReadonlyMap<string, number>,
  classified: readonly { invoice: GuestInvoiceFact; result: { outstanding: number | null } }[],
  issues: readonly NightAuditFinancialIssue[],
): GuestFolioRow[] {
  const rows: GuestFolioRow[] = facts.folios.map((folio) => {
    const related = issues.filter(
      (row) => row.category === "guest_folios" && row.referenceId === folio.id,
    );
    const top = worst(related);
    const outstanding = classified.some(
      (row) => row.invoice.folioId === folio.id && (row.result.outstanding ?? 0) > GUEST_ALLOCATION_TOLERANCE,
    );
    const anyInvoice = classified.some((row) => row.invoice.folioId === folio.id);
    const isClosedWithBalance =
      folio.status === "closed" && Math.abs(balances.get(folio.id) ?? 0) > 0.009;
    const targetTab = isClosedWithBalance ? "settlement" : outstanding ? "invoices" : "charges";
    const actionLabel = isClosedWithBalance ? "Settle Folio" : outstanding ? "Review Invoices" : "Open Folio";
    return {
      id: folio.id,
      guest: folio.guestName,
      reservation: folio.confirmationNumber,
      room: folio.room,
      folio: folio.number,
      balance: balances.get(folio.id) ?? 0,
      currency: folio.currency,
      invoiceState: !anyInvoice ? "No invoice" : outstanding ? "Outstanding" : "Settled",
      status: rowStatus(top?.severity ?? null),
      issue: top?.description ?? "",
      action: actionLabel,
      route: `/restaurant/pms/cashiering/folios/${folio.id}`,
      search: { tab: targetTab },
    };
  });
  for (const stay of facts.missingFolios) {
    const top = issues.find((row) => row.code === "missing_folio" && row.referenceId === stay.id);
    rows.push({
      id: stay.id,
      guest: stay.guestName,
      reservation: stay.confirmationNumber,
      room: stay.room,
      folio: "—",
      balance: null,
      currency: null,
      invoiceState: "No folio",
      status: "warning",
      issue: top?.description ?? "Priced stay has no folio.",
      action: "Open Reservation",
      route: `/restaurant/pms/reservations/${stay.id}`,
      search: {},
    });
  }
  for (const row of issues) {
    if (row.code !== "duplicate_room_charge") continue;
    rows.push({
      id: row.referenceId,
      guest: "—",
      reservation: row.referenceId,
      room: "—",
      folio: "—",
      balance: null,
      currency: null,
      invoiceState: "—",
      status: "blocker",
      issue: row.description,
      action: "Search Folios",
      route: CASHIERING,
      search: { tab: "folios", q: row.referenceId },
    });
  }
  return rows;
}

function invoiceRows(
  classified: readonly {
    invoice: GuestInvoiceFact;
    result: { outstanding: number | null; settled: number };
  }[],
  issues: readonly NightAuditFinancialIssue[],
): InvoiceSettlementRow[] {
  return classified.map(({ invoice, result }) => {
    const contradiction = issues.some(
      (row) => row.code === "folio_invoice_contradiction" && row.referenceId === invoice.folioId,
    );
    const outstanding = result.outstanding ?? 0;
    const blocked = contradiction && outstanding > GUEST_ALLOCATION_TOLERANCE;
    return {
      id: invoice.id,
      invoice: invoice.number,
      guest: invoice.guestName,
      issuedAt: invoice.issuedAt,
      currency: invoice.currency,
      invoiceTotal: invoice.invoiceTotal,
      paidAllocation: invoice.paymentAllocated,
      depositApplied: invoice.depositApplied,
      creditDebitAdjustment: signed(invoice.noteDeltas),
      cashDebitCovered: invoice.cashDebitCovered,
      outstanding: result.outstanding,
      status: blocked ? "blocker" : "pass",
      issue: blocked
        ? "Issued invoice still has an outstanding balance while the folio is settled."
        : outstanding > GUEST_ALLOCATION_TOLERANCE
          ? "Outstanding remains on an open stay. This does not block close."
          : "",
      action: invoice.folioId ? "Open Invoice Settlement" : "Open Cashiering",
      route: invoice.folioId ? `/restaurant/pms/cashiering/folios/${invoice.folioId}` : CASHIERING,
      search: invoice.folioId
        ? { tab: "invoices", invoice: invoice.id, modalTab: "settlement", action: "view-invoice" }
        : { tab: "folios", q: invoice.number },
    };
  });
}

function allocationRows(
  facts: NightAuditFinancialFacts,
  issues: readonly NightAuditFinancialIssue[],
): AllocationRow[] {
  const rows: AllocationRow[] = facts.sources.map((source) => {
    const available = guestPaymentAvailable(source.face, source.refunded, source.allocated);
    const related = issues.filter((row) => row.referenceId === source.id);
    const top = worst(related);
    const hasFolio = Boolean(source.folioId);
    return {
      id: source.id,
      type: source.kind === "deposit" ? "Deposit" : "Payment",
      reference: source.reference,
      guest: source.guestName,
      currency: source.currency,
      amount: source.face,
      allocated: source.allocated,
      available,
      targetInvoice: source.targetInvoice,
      status: rowStatus(top?.severity ?? null),
      issue: top?.description ?? "",
      action: hasFolio ? "Allocate in Folio" : "Search Cashiering",
      route: hasFolio ? `/restaurant/pms/cashiering/folios/${source.folioId}` : CASHIERING,
      search: hasFolio
        ? { tab: "payments", action: "allocate", payment: source.id }
        : { tab: "folios", q: source.reference || source.guestName },
    };
  });
  for (const allocation of facts.allocations) {
    const orphan = issues.find(
      (row) => row.code === "orphan_allocation" && row.referenceId === allocation.id,
    );
    if (!orphan) continue;
    rows.push({
      id: allocation.id,
      type: allocation.kind === "deposit" ? "Deposit allocation" : "Payment allocation",
      reference: allocation.id,
      guest: "—",
      currency: null,
      amount: allocation.amount,
      allocated: allocation.amount,
      available: null,
      targetInvoice: allocation.invoiceId,
      status: "blocker",
      issue: orphan.description,
      action: allocation.folioId ? "Allocate in Folio" : "Search Cashiering",
      route: allocation.folioId ? `/restaurant/pms/cashiering/folios/${allocation.folioId}` : CASHIERING,
      search: allocation.folioId
        ? { tab: "payments", action: "allocate", payment: allocation.sourceId }
        : { tab: "folios", q: allocation.invoiceId },
    });
  }
  return rows;
}

function reconcileAccounts(facts: NightAuditFinancialFacts): {
  issues: NightAuditFinancialIssue[];
  rows: AccountRow[];
} {
  const issues: NightAuditFinancialIssue[] = [];
  const transfers = transferProblems(facts.transfers, facts.checkedAt);
  issues.push(...transfers.issues);
  const rows = facts.accounts.map((account) => {
    const local: NightAuditFinancialIssue[] = [];
    let outstanding = 0;
    let unallocated = 0;
    const invoiceIds = new Set(account.invoices.map((invoice) => invoice.id));
    for (const invoice of account.invoices) {
      if (!invoice.issued || invoice.voided) continue;
      const net = invoiceEffectiveNet(invoice.invoiceTotal, invoice.noteDeltas);
      outstanding += displayOutstanding(
        invoiceOutstanding(net, invoice.allocated, invoice.withholdingNet),
      );
      if (
        invoice.snapshotWithholding != null &&
        Math.abs(invoice.snapshotWithholding - invoice.withholdingNet) > ALLOCATION_TOLERANCE
      ) {
        local.push(
          issue({
            code: "withholding_mismatch",
            category: "accounts",
            severity: "blocking",
            title: "Withholding does not match the invoice",
            description: `${account.name} invoice ${invoice.number} stores withholding that does not match the active certificates.`,
            referenceType: "account_invoice",
            referenceId: invoice.id,
            route: `/restaurant/pms/cashiering/accounts/${account.id}`,
            search: { tab: "invoices", invoice: invoice.id, modalTab: "withholding", action: "view-invoice" },
            currency: invoice.currency,
            amount: invoice.withholdingNet,
            createdAt: facts.checkedAt,
          }),
        );
      }
    }
    outstanding = Math.round(outstanding * 100) / 100;
    for (const payment of account.payments) {
      const available = paymentAvailable(payment.face, payment.refunded, payment.allocated);
      if (available < -ALLOCATION_TOLERANCE) {
        local.push(
          issue({
            code: "allocation_exceeds_source",
            category: "accounts",
            severity: "blocking",
            title: "Account allocation exceeds the payment",
            description: `${account.name} has an allocation above the payment still available.`,
            referenceType: "folio_transaction",
            referenceId: payment.id,
            route: `/restaurant/pms/cashiering/accounts/${account.id}`,
            search: { tab: "payments", payment: payment.id },
            currency: payment.currency,
            amount: available,
            createdAt: facts.checkedAt,
          }),
        );
      } else if (available > ALLOCATION_TOLERANCE) {
        unallocated += available;
      }
    }
    unallocated = Math.round(unallocated * 100) / 100;
    for (const allocation of account.allocations) {
      const target = account.invoices.find((invoice) => invoice.id === allocation.invoiceId);
      if (!invoiceIds.has(allocation.invoiceId) || !target) {
        local.push(
          issue({
            code: "allocation_missing_invoice",
            category: "accounts",
            severity: "blocking",
            title: "Allocation points at a missing invoice",
            description: `${account.name} has an allocation whose invoice is not on this property.`,
            referenceType: "account_allocation",
            referenceId: allocation.id,
            route: `/restaurant/pms/cashiering/accounts/${account.id}`,
            search: { tab: "invoices" },
            createdAt: facts.checkedAt,
          }),
        );
      } else if (target.voided || !target.issued) {
        local.push(
          issue({
            code: "allocation_invalid_document",
            category: "accounts",
            severity: "blocking",
            title: "Allocation points at an invalid document",
            description: `${account.name} has an allocation on a void or unissued invoice.`,
            referenceType: "account_allocation",
            referenceId: allocation.id,
            route: `/restaurant/pms/cashiering/accounts/${account.id}`,
            search: { tab: "invoices" },
            createdAt: facts.checkedAt,
          }),
        );
      }
    }
    if (unallocated > ALLOCATION_TOLERANCE && outstanding > ALLOCATION_TOLERANCE) {
      local.push(
        issue({
          code: "unallocated_account_payment",
          category: "accounts",
          severity: "warning",
          title: "Unallocated account payment",
          description: `${account.name} still has payment available while an invoice is outstanding.`,
          referenceType: "financial_account",
          referenceId: account.id,
          route: `/restaurant/pms/cashiering/accounts/${account.id}`,
          search: { tab: "payments" },
          currency: account.currency,
          amount: unallocated,
          createdAt: facts.checkedAt,
        }),
      );
    }
    if (outstanding > ALLOCATION_TOLERANCE && !local.some((row) => row.severity === "blocking")) {
      local.push(
        issue({
          code: "valid_account_receivable",
          category: "accounts",
          severity: "info",
          title: "Valid outstanding balance",
          description: `${account.name} has a valid outstanding balance. Receivables do not block close.`,
          referenceType: "financial_account",
          referenceId: account.id,
          route: `/restaurant/pms/cashiering/accounts/${account.id}`,
          search: { tab: "invoices" },
          currency: account.currency,
          amount: outstanding,
          createdAt: facts.checkedAt,
        }),
      );
    }
    const top = worst(local);
    const transferBlocked = transfers.accountIds.has(account.id);
    issues.push(...local);
    const targetTab = unallocated > 0 ? "payments" : outstanding > 0 ? "invoices" : "overview";
    const actionLabel = unallocated > 0 ? "Allocate Payment" : outstanding > 0 ? "Review Invoices" : "Open Account";
    return {
      id: account.id,
      account: account.name,
      type: account.kind,
      invoices: account.invoices.length,
      currency: account.currency,
      outstandingAr: outstanding,
      unallocatedPayment: unallocated,
      status: transferBlocked ? "blocker" : rowStatus(top?.severity ?? null),
      issue: transferBlocked
        ? "A cross-ledger movement does not match its transfer pair."
        : (top?.description ?? ""),
      action: actionLabel,
      route: `/restaurant/pms/cashiering/accounts/${account.id}`,
      search: { tab: targetTab },
    };
  });
  return { issues, rows };
}

function transferProblems(
  transfers: readonly TransferFact[],
  checkedAt: string,
): { issues: NightAuditFinancialIssue[]; accountIds: Set<string> } {
  const relevant = transfers.filter((row) => row.accountId);
  const groups = new Map<string, TransferFact[]>();
  const issues: NightAuditFinancialIssue[] = [];
  const accountIds = new Set<string>();
  for (const row of relevant) {
    if (!row.transferId || !transferDirection(row.direction)) {
      issues.push(
        issue({
          code: "transfer_unbalanced",
          category: "accounts",
          severity: "blocking",
          title: "Cross-ledger transfer is incomplete",
          description: "A cross-ledger movement does not have a matching transfer record.",
          referenceType: "folio_transaction",
          referenceId: row.id,
          route: row.accountId
            ? `/restaurant/pms/cashiering/accounts/${row.accountId}`
            : CASHIERING,
          search: row.accountId ? { tab: "charges" } : { tab: "accounts" },
          createdAt: checkedAt,
        }),
      );
      if (row.accountId) accountIds.add(row.accountId);
      continue;
    }
    const list = groups.get(row.transferId) ?? [];
    list.push(row);
    groups.set(row.transferId, list);
  }
  for (const [transferId, rows] of groups) {
    const directions = new Set(rows.map((row) => transferDirection(row.direction)));
    const sum = signed(rows.map((row) => row.amount));
    if (directions.size < 2 || Math.abs(sum) > ALLOCATION_TOLERANCE) {
      const targetAccountId = rows.find((r) => r.accountId)?.accountId;
      issues.push(
        issue({
          code: "transfer_unbalanced",
          category: "accounts",
          severity: "blocking",
          title: "Cross-ledger transfer is incomplete",
          description: "A cross-ledger movement does not match its transfer pair.",
          referenceType: "transfer",
          referenceId: transferId,
          route: targetAccountId
            ? `/restaurant/pms/cashiering/accounts/${targetAccountId}`
            : CASHIERING,
          search: targetAccountId ? { tab: "charges" } : { tab: "accounts" },
          createdAt: checkedAt,
        }),
      );
      for (const row of rows) if (row.accountId) accountIds.add(row.accountId);
    }
  }
  return { issues, accountIds };
}

function reconcileDrawers(facts: NightAuditFinancialFacts): {
  issues: NightAuditFinancialIssue[];
  rows: DrawerRow[];
  state: "clear" | "blocked" | "na";
} {
  const hotel = facts.drawers.filter((row) => row.scope === "hotel");
  const issues: NightAuditFinancialIssue[] = [];
  const rows = hotel.map((drawer) => {
    let status: NightAuditRowStatus = "pass";
    let text = "";
    if (drawer.state === "open") {
      status = "blocker";
      text = `${drawer.cashier} still has an open hotel drawer.`;
      issues.push(
        issue({
          code: "open_cashier_shift",
          category: "drawers",
          severity: "blocking",
          title: "Open hotel drawer",
          description: text,
          referenceType: "cashier_shift",
          referenceId: drawer.id,
          route: CASHIERING,
          search: { tab: "cashier-shift", shift: drawer.id, action: "close" },
          createdAt: facts.checkedAt,
        }),
      );
    } else if (drawer.variance != null && Math.abs(drawer.variance) >= 0.01) {
      status = "warning";
      text = `${drawer.cashier} closed a drawer with a cash variance.`;
      issues.push(
        issue({
          code: "closed_shift_variance",
          category: "drawers",
          severity: "warning",
          title: "Closed drawer variance",
          description: text,
          referenceType: "cashier_shift",
          referenceId: drawer.id,
          route: CASHIERING,
          search: { tab: "cashier-shift", shift: drawer.id },
          currency: drawer.currency,
          amount: drawer.variance,
          createdAt: facts.checkedAt,
        }),
      );
    }
    return {
      id: drawer.id,
      cashier: drawer.cashier,
      shift: drawer.shift,
      openedAt: drawer.openedAt,
      currency: drawer.currency,
      expectedCash: drawer.expectedCash,
      closingCount: drawer.closingCount,
      variance: drawer.variance,
      status,
      state: drawer.state,
      issue: text,
      action:
        drawer.state === "open"
          ? "Close Cashier Shift"
          : drawer.variance != null && Math.abs(drawer.variance) >= 0.01
            ? "Inspect Shift"
            : "",
      route: CASHIERING,
      search:
        drawer.state === "open"
          ? { tab: "cashier-shift", shift: drawer.id, action: "close" }
          : { tab: "cashier-shift", shift: drawer.id },
    };
  });
  const state = hotel.length === 0 ? "na" : rows.some((row) => row.state === "open") ? "blocked" : "clear";
  return { issues, rows, state };
}

function reconcileFiscal(facts: NightAuditFinancialFacts): {
  issues: NightAuditFinancialIssue[];
  rows: FiscalRow[];
} {
  if (!facts.integrationEnabled) return { issues: [], rows: [] };
  const issues: NightAuditFinancialIssue[] = [];
  const rows: FiscalRow[] = [];
  for (const document of facts.fiscalDocuments) {
    if (!fiscalHandlerEnabled(true, document.documentType, document.sourceType)) continue;
    const severity = fiscalSeverity(document.status);
    const code = fiscalCode(document.status);
    const problem = severity === "blocking" || severity === "warning";
    if (problem || severity === "info") {
      let targetRoute: string;
      let targetSearch: Record<string, string>;
      let modalTab = "fiscal";
      let actionLabel = "Inspect Fiscal Registration";

      if (document.documentType === "WITHHOLDING" || document.sourceType.includes("withholding")) {
        modalTab = "withholding";
        actionLabel = "Review Withholding Tax";
      } else if (
        document.documentType === "SALES_RECEIPT" ||
        document.sourceType.includes("allocation") ||
        document.sourceType === "sales_receipt"
      ) {
        modalTab = "settlement";
        actionLabel = "Review Settlement & Receipts";
      } else if (document.documentType === "CRE" || document.sourceType === "credit_note") {
        modalTab = "credit-notes";
        actionLabel = "Inspect Credit Note";
      } else if (document.documentType === "DEB" || document.sourceType === "debit_note") {
        modalTab = "debit-notes";
        actionLabel = "Inspect Debit Note";
      }

      let resolvedFolioId = document.folioId ?? null;
      let resolvedAccountId = document.accountId ?? null;
      let resolvedInvoiceId = document.invoiceId ?? null;

      if (!resolvedFolioId && !resolvedAccountId) {
        const gInv = facts.invoices.find((inv) => inv.id === resolvedInvoiceId || inv.id === document.id);
        if (gInv) {
          resolvedFolioId = gInv.folioId;
          resolvedInvoiceId = gInv.id;
        } else {
          const accMatch = facts.accounts.find((acc) =>
            acc.invoices.some((inv) => inv.id === resolvedInvoiceId || inv.id === document.id),
          );
          if (accMatch) {
            resolvedAccountId = accMatch.id;
            const inv = accMatch.invoices.find((i) => i.id === resolvedInvoiceId || i.id === document.id);
            if (inv) resolvedInvoiceId = inv.id;
          } else {
            const gAlloc = facts.allocations.find((a) => a.id === document.id || a.sourceId === document.id);
            if (gAlloc) {
              resolvedInvoiceId = gAlloc.invoiceId;
              resolvedFolioId = gAlloc.folioId ?? facts.invoices.find((i) => i.id === gAlloc.invoiceId)?.folioId ?? null;
            } else {
              for (const acc of facts.accounts) {
                const aAlloc = acc.allocations.find((a) => a.id === document.id || a.paymentId === document.id);
                if (aAlloc) {
                  resolvedAccountId = acc.id;
                  resolvedInvoiceId = aAlloc.invoiceId;
                  break;
                }
              }
            }
          }
        }
      }

      if (resolvedFolioId) {
        targetRoute = `/restaurant/pms/cashiering/folios/${resolvedFolioId}`;
        targetSearch = {
          tab: "invoices",
          invoice: resolvedInvoiceId || document.id,
          modalTab,
          action: "view-invoice",
        };
      } else if (resolvedAccountId) {
        targetRoute = `/restaurant/pms/cashiering/accounts/${resolvedAccountId}`;
        targetSearch = {
          tab: "invoices",
          invoice: resolvedInvoiceId || document.id,
          modalTab,
          action: "view-invoice",
        };
      } else {
        targetRoute = FISCAL_QUEUE;
        targetSearch = { tab: "folios" };
        actionLabel = "Open Folios";
      }

      const created = issue({
        code,
        category: "fiscal",
        severity: severity ?? "blocking",
        title: problem ? "Fiscal document needs attention" : "Fiscal document",
        description: problem
          ? `${document.documentType} ${document.number} is ${document.status}.`
          : `${document.documentType} ${document.number} is ${document.status}.`,
        referenceType: document.sourceType,
        referenceId: document.id,
        route: targetRoute,
        search: targetSearch,
        createdAt: facts.checkedAt,
      });
      if (problem) issues.push(created);
      rows.push({
        id: document.id,
        document: document.number,
        type: document.documentType,
        issuedAt: document.issuedAt,
        fiscalStatus: document.status,
        externalReference: document.externalReference,
        mode: document.mode,
        status: rowStatus(problem ? severity : null),
        issue: problem ? created.description : "",
        action: actionLabel,
        route: targetRoute,
        search: targetSearch,
      });
    }
  }
  return { issues, rows };
}

function reconcileTax(
  facts: NightAuditFinancialFacts,
  classified: readonly { invoice: GuestInvoiceFact }[],
): { issues: NightAuditFinancialIssue[]; rows: TaxCurrencyRow[] } {
  const currencies = new Set<string>();
  for (const line of facts.taxLines) currencies.add(line.currency);
  for (const row of classified) {
    if (row.invoice.snapshotTax != null || row.invoice.snapshotServiceCharge != null) {
      currencies.add(row.invoice.currency);
    }
  }
  const issues: NightAuditFinancialIssue[] = [];
  const rows: TaxCurrencyRow[] = [...currencies].sort().map((currency) => {
    const tax = signed(
      facts.taxLines.filter((line) => line.currency === currency && line.category === "tax").map((line) => line.amount),
    );
    const serviceCharge = signed(
      facts.taxLines
        .filter((line) => line.currency === currency && line.category === "service_charge")
        .map((line) => line.amount),
    );
    const snapshots = classified.filter(
      (row) => row.invoice.currency === currency && row.invoice.issuedOnAuditDate !== false,
    );
    const snapshotTaxValues = snapshots
      .map((row) => row.invoice.snapshotTax)
      .filter((value): value is number => value != null);
    const snapshotServiceValues = snapshots
      .map((row) => row.invoice.snapshotServiceCharge)
      .filter((value): value is number => value != null);
    if (snapshotTaxValues.length > 0 && Math.abs(signed(snapshotTaxValues) - tax) > 0.01) {
      issues.push(
        issue({
          code: "tax_snapshot_mismatch",
          category: "tax",
          severity: "warning",
          title: "Frozen tax does not match the invoice snapshot",
          description: `Issued invoice tax for ${currency} differs from the frozen tax lines. Current tax settings are not reapplied.`,
          referenceType: "business_date",
          referenceId: `${facts.businessDate}:${currency}:tax`,
          route: CASHIERING,
          search: cashieringSearch(),
          currency,
          amount: tax,
          createdAt: facts.checkedAt,
        }),
      );
    }
    if (snapshotServiceValues.length > 0 && Math.abs(signed(snapshotServiceValues) - serviceCharge) > 0.01) {
      issues.push(
        issue({
          code: "service_snapshot_mismatch",
          category: "tax",
          severity: "warning",
          title: "Frozen service charge does not match the invoice snapshot",
          description: `Issued invoice service charge for ${currency} differs from the frozen service lines.`,
          referenceType: "business_date",
          referenceId: `${facts.businessDate}:${currency}:service`,
          route: CASHIERING,
          search: cashieringSearch(),
          currency,
          amount: serviceCharge,
          createdAt: facts.checkedAt,
        }),
      );
    }
    return { currency, tax, serviceCharge, occupancyFee: null };
  });
  return { issues, rows };
}

export type NightAuditFinancialFilter = {
  severity?: "all" | "blocker" | "warning" | "info" | "pass";
  category?: "all" | NightAuditFinancialCategory;
  search?: string;
  currency?: string;
  documentType?: string;
};

export function matchesFinancialFilter(
  input: {
    status: NightAuditRowStatus;
    category: NightAuditFinancialCategory;
    text: string;
    currency?: string | null;
    documentType?: string | null;
  },
  filter: NightAuditFinancialFilter,
): boolean {
  if (filter.severity && filter.severity !== "all" && input.status !== filter.severity) return false;
  if (filter.category && filter.category !== "all" && input.category !== filter.category) return false;
  if (filter.currency && input.currency && input.currency !== filter.currency) return false;
  if (filter.documentType && input.documentType && input.documentType !== filter.documentType) return false;
  const needle = (filter.search ?? "").trim().toLowerCase();
  if (!needle) return true;
  return input.text.toLowerCase().includes(needle);
}

export function presentNightAuditFinancials(
  result: NightAuditFinancialReconciliation,
  role: string,
): NightAuditFinancialReconciliation {
  if (canViewNightAuditFinancialDetail(role)) return { ...result, access: "detail" };
  return {
    ...result,
    access: "summary",
    taxSummary: [],
    guestFolios: result.guestFolios.map((row) => ({ ...row, balance: null, currency: null })),
    invoiceSettlement: result.invoiceSettlement.map((row) => ({
      ...row,
      currency: null,
      invoiceTotal: null,
      paidAllocation: null,
      depositApplied: null,
      creditDebitAdjustment: null,
      cashDebitCovered: null,
      outstanding: null,
    })),
    allocations: result.allocations.map((row) => ({
      ...row,
      currency: null,
      amount: null,
      allocated: null,
      available: null,
    })),
    accounts: result.accounts.map((row) => ({
      ...row,
      currency: null,
      outstandingAr: null,
      unallocatedPayment: null,
    })),
    drawers: result.drawers.map((row) => ({
      ...row,
      currency: null,
      expectedCash: null,
      closingCount: null,
      variance: null,
    })),
    issues: result.issues.map(({ currency: _currency, amount: _amount, ...row }) => ({ ...row, description: row.title })),
  };
}
