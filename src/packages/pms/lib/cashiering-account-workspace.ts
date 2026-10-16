/** Phase 1 financial-account workspace rules. Ledger balance is authoritative. */

import { groupAccountLedger } from "./cashiering-account-history.ts";

export type AccountBalanceState = "due" | "settled" | "credit";

export type AccountWorkspaceKind = "company" | "group" | "master";

export type CompanyCreditSummary = {
  limit: number;
  used: number;
  available: number;
  utilization: number;
  exceeded: boolean;
};

export type AccountWorkspaceCapabilities = {
  canReceivePayment: boolean;
  canRefund: boolean;
  canCreateInvoice: boolean;
  canWriteOff: boolean;
  canClose: boolean;
  canViewProfile: boolean;
};

export function roundAccountMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function accountBalanceState(balance: number): AccountBalanceState {
  if (Math.abs(balance) < 0.01) return "settled";
  if (balance > 0) return "due";
  return "credit";
}

export function accountBalanceLabel(balance: number): string {
  const state = accountBalanceState(balance);
  if (state === "due") return "Amount Due";
  if (state === "credit") return "Credit Balance";
  return "Settled";
}

/** Company credit is profile-owned. Null limit means the widgets stay hidden. */
export function companyCreditSummary(
  creditLimit: number | null,
  currentBalance: number,
): CompanyCreditSummary | null {
  if (creditLimit == null || !Number.isFinite(creditLimit) || creditLimit <= 0) return null;
  const used = roundAccountMoney(Math.max(currentBalance, 0));
  const available = roundAccountMoney(creditLimit - used);
  return {
    limit: creditLimit,
    used,
    available,
    utilization: used / creditLimit,
    exceeded: currentBalance > creditLimit + 0.001,
  };
}

export function accountWorkspaceCapabilities(input: {
  role: string;
  status: "open" | "closed";
  balance: number;
  accountKind: AccountWorkspaceKind;
}): AccountWorkspaceCapabilities {
  const manage = input.role === "owner" || input.role === "manager";
  const operate = manage || input.role === "cashier";
  const open = input.status === "open";
  const profile = input.accountKind === "company" || input.accountKind === "group";
  return {
    canReceivePayment: open && operate,
    canRefund: open && manage,
    canCreateInvoice: open && manage,
    canWriteOff: open && manage && input.balance > 0.009,
    canClose: open && manage && Math.abs(input.balance) < 0.01,
    canViewProfile: profile,
  };
}

export type SourceFolioCandidate = {
  transferId: string | null;
  folioId: string | null;
  financialAccountId: string | null;
  type: string;
  category: string;
  originalTransactionId: string | null;
};

/**
 * Guest folios that sent a transfer_in onto this account.
 * Reservation company or group membership with no transfer does not count.
 */
export function sourceFolioIds(accountId: string, rows: SourceFolioCandidate[]): string[] {
  const incoming = new Set<string>();
  for (const row of rows) {
    if (row.financialAccountId !== accountId) continue;
    if (row.type !== "transfer_in" || !row.transferId) continue;
    incoming.add(row.transferId);
  }
  const folios = new Set<string>();
  for (const row of rows) {
    if (!row.transferId || !incoming.has(row.transferId)) continue;
    if (row.folioId) folios.add(row.folioId);
  }
  return [...folios];
}

export function workspaceCreditSummary(
  kind: AccountWorkspaceKind,
  creditLimit: number | null,
  currentBalance: number,
): CompanyCreditSummary | null {
  if (kind !== "company") return null;
  return companyCreditSummary(creditLimit, currentBalance);
}

export function countIssuedInvoices(rows: Array<{ issuedNumber: string | null }>): number {
  return rows.filter((row) => Boolean(row.issuedNumber && row.issuedNumber.trim())).length;
}

export type ActivityLine = {
  id: string;
  postedAt: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  actorName: string | null;
  transferId: string | null;
  originalTransactionId: string | null;
  referenceType: string | null;
  sourceFolioId: string | null;
  sourceFolioNumber: string | null;
};

function isTaxChildCharge(
  line: Pick<ActivityLine, "type" | "category" | "originalTransactionId">,
): boolean {
  return (
    line.type === "charge" &&
    (line.category === "tax" || line.category === "service_charge") &&
    Boolean(line.originalTransactionId)
  );
}

/** Latest business events. Uses the same ledger grouping as History and Statement. */
export function recentAccountActivity(lines: ActivityLine[], limit = 8): ActivityLine[] {
  const ids = new Set(lines.map((line) => line.id));
  return groupAccountLedger(
    lines.map((line) => ({
      id: line.id,
      type: line.type,
      category: line.category,
      description: line.description,
      amount: line.amount,
      postedAt: line.postedAt,
      actorName: line.actorName,
      originalTransactionId: line.originalTransactionId,
      referenceType: line.referenceType,
      transferId: line.transferId,
    })),
  )
    .filter((group) => {
      if (group.eventType !== "charge" || group.componentIds.length !== 1) return true;
      const only = lines.find((line) => line.id === group.componentIds[0]);
      return !(
        only &&
        isTaxChildCharge(only) &&
        only.originalTransactionId &&
        !ids.has(only.originalTransactionId)
      );
    })
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, limit)
    .map((group) => {
      const members = lines.filter((line) => group.componentIds.includes(line.id));
      const folio = members.find((line) => line.sourceFolioId);
      return {
        id: group.componentIds[0] ?? group.eventId,
        postedAt: group.occurredAt,
        type:
          group.eventType === "write_off" || group.eventType === "credit_note"
            ? "adjustment"
            : group.eventType,
        category: group.category,
        description: group.description,
        amount: group.amount,
        actorName: group.actorName,
        transferId: group.transferId,
        originalTransactionId: group.originalTransactionId,
        referenceType:
          group.eventType === "write_off" ? "settlement_write_off" : group.referenceType,
        sourceFolioId: folio?.sourceFolioId ?? null,
        sourceFolioNumber: folio?.sourceFolioNumber ?? null,
      };
    });
}

export function activityTypeLabel(
  line: Pick<ActivityLine, "type" | "description" | "transferId" | "referenceType">,
): string {
  if (line.referenceType === "withholding_certificate") {
    return line.description.toLowerCase().includes("reversal")
      ? "Withholding Reversal"
      : "Withholding Certificate";
  }
  if (
    line.referenceType === "settlement_write_off" ||
    line.description.toLowerCase().includes("write-off")
  ) {
    return "Write-off";
  }
  if (line.type === "transfer_in" || (line.type === "charge" && line.transferId))
    return "Transfer in";
  if (line.type === "transfer_out") return "Transfer out";
  if (line.type === "charge") return "Charge";
  if (line.type === "payment") return "Payment";
  if (line.type === "deposit") return "Deposit";
  if (line.type === "refund") return "Refund";
  if (line.type === "discount") return "Discount";
  if (line.type === "adjustment") return "Adjustment";
  return line.type;
}

export type AccountDocumentRow = {
  id: string;
  number: string;
  documentType: "invoice" | "credit_note" | "debit_note";
  issuedAt: string;
  amount: number;
};

export function recentAccountDocuments(
  rows: AccountDocumentRow[],
  limit = 6,
): AccountDocumentRow[] {
  return [...rows]
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0))
    .slice(0, limit);
}

function isoCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Company creation stores billing currency on the master, with the older operations JSON as fallback. */
export function masterBillingCurrency(
  row: {
    billing_currency_code?: string | null;
    account_operations?: unknown;
  } | null,
): string | null {
  const saved = isoCurrency(row?.billing_currency_code);
  if (saved) return saved;
  const operations = row?.account_operations;
  if (!operations || typeof operations !== "object") return null;
  const billing = (operations as { billing?: unknown }).billing;
  if (!billing || typeof billing !== "object") return null;
  return isoCurrency((billing as { currency?: unknown }).currency);
}
