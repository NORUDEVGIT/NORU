/**
 * Guest Folio Workspace v1 — ledger classification from posted lines.
 * Tax and service amounts come from sibling ledger rows, not live Settings.
 */

import type { FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  chargeGroupRemainder as groupRemainder,
  lineTransferRemainder,
  type ChargeGroupRemainder as GroupRemainder,
} from "./cashiering-transfer-allocate";

export type ChargeGroupRemainder = GroupRemainder;

export const FOLIO_WORKSPACE_TABS = [
  { id: "charges", label: "Charges" },
  { id: "payments", label: "Payments & Deposits" },
  { id: "adjustments", label: "Adjustments" },
  { id: "transfers", label: "Transfers" },
  { id: "invoices", label: "Invoices & Documents" },
  { id: "history", label: "History" },
  { id: "settlement", label: "Settlement" },
] as const;

export type FolioWorkspaceTabId = (typeof FOLIO_WORKSPACE_TABS)[number]["id"];

export type FolioTaxSnapshot = {
  code?: string;
  name?: string;
  chargeType?: string;
  amount?: number;
  calculation?: string;
  lineAmount?: number;
};

export type FolioFinancialSummary = {
  netCharges: number;
  tax: number;
  serviceCharge: number;
  payments: number;
  deposits: number;
  adjustments: number;
  discounts: number;
  refunds: number;
  transfersIn: number;
  transfersOut: number;
  currentBalance: number;
};

export type FolioChargeGroup = {
  parent: FolioTransactionRow;
  children: FolioTransactionRow[];
  net: number;
  taxService: number;
  total: number;
};

export type FolioDepositLine = {
  transaction: FolioTransactionRow;
  received: number;
  applied: number;
  available: number;
};

export type FolioAllocationInput = {
  depositTransactionId: string;
  amount: number;
};

export type FolioCapabilities = {
  canPostCharge: boolean;
  canPostPayment: boolean;
  canPostDeposit: boolean;
  canAdjust: boolean;
  canRefund: boolean;
  canDiscount: boolean;
  canTransfer: boolean;
  canIssueInvoice: boolean;
  canReprintInvoice: boolean;
  canClose: boolean;
  canWriteOff: boolean;
};

export function roundFolioMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isTaxOrServiceCategory(category: string): boolean {
  return category === "tax" || category === "service_charge";
}

export function stayNights(
  arrival: string | null | undefined,
  departure: string | null | undefined,
): number | null {
  if (!arrival || !departure) return null;
  const nights = nightsBetween(arrival.slice(0, 10), departure.slice(0, 10));
  return nights > 0 ? nights : null;
}

export function guestInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return (letters.join("") || "G").toUpperCase();
}

export function balanceTone(balance: number): "settled" | "due" | "credit" {
  if (Math.abs(balance) < 0.01) return "settled";
  if (balance > 0) return "due";
  return "credit";
}

export function summarizeFolioLedger(
  rows: Array<Pick<FolioTransactionRow, "type" | "category" | "amount">>,
): FolioFinancialSummary {
  let netCharges = 0;
  let tax = 0;
  let serviceCharge = 0;
  let payments = 0;
  let deposits = 0;
  let adjustments = 0;
  let discounts = 0;
  let refunds = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  let currentBalance = 0;

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    currentBalance += amount;
    if (row.type === "charge" && row.category === "tax") tax += amount;
    else if (row.type === "charge" && row.category === "service_charge") serviceCharge += amount;
    else if (row.type === "charge") netCharges += amount;
    else if (row.type === "payment") payments += Math.abs(amount);
    else if (row.type === "deposit") deposits += Math.abs(amount);
    else if (row.type === "adjustment") adjustments += amount;
    else if (row.type === "discount") discounts += Math.abs(amount);
    else if (row.type === "refund") refunds += amount;
    else if (row.type === "transfer_in") transfersIn += amount;
    else if (row.type === "transfer_out") transfersOut += Math.abs(amount);
  }

  return {
    netCharges: roundFolioMoney(netCharges),
    tax: roundFolioMoney(tax),
    serviceCharge: roundFolioMoney(serviceCharge),
    payments: roundFolioMoney(payments),
    deposits: roundFolioMoney(deposits),
    adjustments: roundFolioMoney(adjustments),
    discounts: roundFolioMoney(discounts),
    refunds: roundFolioMoney(refunds),
    transfersIn: roundFolioMoney(transfersIn),
    transfersOut: roundFolioMoney(transfersOut),
    currentBalance: roundFolioMoney(currentBalance),
  };
}

export function groupChargeRows(rows: FolioTransactionRow[]): FolioChargeGroup[] {
  const childrenByParent = new Map<string, FolioTransactionRow[]>();
  for (const row of rows) {
    if (!isTaxOrServiceCategory(row.category) || !row.originalTransactionId) continue;
    const bucket = childrenByParent.get(row.originalTransactionId) ?? [];
    bucket.push(row);
    childrenByParent.set(row.originalTransactionId, bucket);
  }

  const consumed = new Set<string>();
  const groups: FolioChargeGroup[] = [];
  for (const row of rows) {
    if (row.type !== "charge" || isTaxOrServiceCategory(row.category)) continue;
    const children = childrenByParent.get(row.id) ?? [];
    for (const child of children) consumed.add(child.id);
    const taxService = roundFolioMoney(children.reduce((sum, child) => sum + child.amount, 0));
    groups.push({
      parent: row,
      children,
      net: roundFolioMoney(row.amount),
      taxService,
      total: roundFolioMoney(row.amount + taxService),
    });
  }

  for (const row of rows) {
    if (!isTaxOrServiceCategory(row.category) || consumed.has(row.id)) continue;
    groups.push({
      parent: row,
      children: [],
      net: roundFolioMoney(row.amount),
      taxService: 0,
      total: roundFolioMoney(row.amount),
    });
  }
  return groups;
}

export function buildDepositLines(
  rows: FolioTransactionRow[],
  allocations: FolioAllocationInput[],
): FolioDepositLine[] {
  const applied = new Map<string, number>();
  for (const row of allocations) {
    applied.set(
      row.depositTransactionId,
      (applied.get(row.depositTransactionId) ?? 0) + Number(row.amount || 0),
    );
  }
  const refunded = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== "refund" || !row.originalTransactionId) continue;
    refunded.set(
      row.originalTransactionId,
      (refunded.get(row.originalTransactionId) ?? 0) + Number(row.amount || 0),
    );
  }
  return rows
    .filter((row) => row.type === "deposit")
    .map((transaction) => {
      const received = roundFolioMoney(Math.abs(transaction.amount));
      const used = roundFolioMoney(applied.get(transaction.id) ?? 0);
      const returned = roundFolioMoney(refunded.get(transaction.id) ?? 0);
      return {
        transaction,
        received,
        applied: used,
        available: roundFolioMoney(received - used - returned),
      };
    });
}

export function depositSummaryFromLines(lines: FolioDepositLine[]): {
  received: number;
  applied: number;
  available: number;
} {
  return {
    received: roundFolioMoney(lines.reduce((sum, line) => sum + line.received, 0)),
    applied: roundFolioMoney(lines.reduce((sum, line) => sum + line.applied, 0)),
    available: roundFolioMoney(lines.reduce((sum, line) => sum + line.available, 0)),
  };
}

export function transferableRemainder(chargeId: string, rows: FolioTransactionRow[]): number {
  return lineTransferRemainder(chargeId, rows);
}

export function isParentTransferCharge(
  row: Pick<FolioTransactionRow, "type" | "category">,
): boolean {
  return row.type === "charge" && !isTaxOrServiceCategory(row.category);
}

/** Gross still movable for a parent charge, using posted children only. */
export function chargeGroupRemainder(
  parentId: string,
  rows: FolioTransactionRow[],
): ChargeGroupRemainder {
  return groupRemainder(parentId, rows);
}

export function folioCapabilities(input: {
  open: boolean;
  balance: number;
  canManage: boolean;
  canOperate: boolean;
  hasInvoice: boolean;
  hasLines: boolean;
  invoiceSettingsAvailable: boolean;
  legacyFolioInvoice: boolean;
}): FolioCapabilities {
  const settled = Math.abs(input.balance) < 0.01;
  return {
    canPostCharge: input.canManage && input.open,
    canPostPayment: input.canOperate && input.open,
    canPostDeposit: input.canOperate && input.open,
    canAdjust: input.canManage && input.open,
    canRefund: input.canManage && input.open,
    canDiscount: input.canManage && input.open,
    canTransfer: input.canManage && input.open,
    canIssueInvoice: input.canManage && !input.legacyFolioInvoice && input.invoiceSettingsAvailable,
    canReprintInvoice: input.canManage && input.hasInvoice,
    canClose: input.canManage && input.open && settled,
    canWriteOff: input.canManage && input.open && input.balance > 0.009,
  };
}

export {
  filterTenderRows,
  projectedFolioBalance,
  refundedAgainst,
  tenderDisplayState,
  type TenderDisplayState,
  type TenderTypeFilter,
} from "./cashiering-tender-state";

export function recentPayments(rows: FolioTransactionRow[], limit = 3): FolioTransactionRow[] {
  return rows
    .filter((row) => row.type === "payment")
    .slice()
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
    .slice(0, limit);
}

export function referenceLabel(row: Pick<FolioTransactionRow, "referenceType" | "paymentMethod">): string {
  if (row.paymentMethod) return row.paymentMethod.replace(/_/g, " ");
  const raw = (row.referenceType ?? "").trim();
  if (!raw) return "—";
  return raw.replace(/_/g, " ");
}
