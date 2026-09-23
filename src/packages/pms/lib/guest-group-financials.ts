/**
 * Group financial derivation. Values come from reservation folios.
 * The group master must not store editable copies of these numbers.
 * Group invoices are a placeholder until invoicing exists.
 */

import { companyBillingTotals } from "./guest-company-detail-workspace.ts";
import {
  GROUP_COMMS_TEMPLATES_UNAVAILABLE,
  GROUP_INVOICE_SERVICE_UNAVAILABLE,
  GROUP_INVOICE_UNAVAILABLE,
} from "./guest-group-detail-workspace.ts";

export type GroupFolioTxn = {
  amount: number;
  folioStatus: string;
  transactionType: string;
};

export type GroupFinancialSummary = {
  estimatedRevenue: number;
  totalCharges: number;
  totalPayments: number;
  outstandingBalance: number;
};

export function getGroupCharges(txns: GroupFolioTxn[]): number {
  return Math.round(txns.filter((row) => row.amount >= 0).reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
}

export function getGroupPayments(txns: GroupFolioTxn[]): number {
  return Math.round(txns.filter((row) => row.amount < 0).reduce((sum, row) => sum + -row.amount, 0) * 100) / 100;
}

export function getGroupBalance(txns: GroupFolioTxn[]): number {
  return companyBillingTotals(txns.map((row) => ({ amount: row.amount, folioStatus: row.folioStatus }))).outstanding;
}

export function summarizeGroupFinancials(
  txns: GroupFolioTxn[],
  roomSubtotals: number[],
): GroupFinancialSummary {
  const charges = getGroupCharges(txns);
  const payments = getGroupPayments(txns);
  const estimated =
    roomSubtotals.length > 0
      ? Math.round(roomSubtotals.reduce((sum, value) => sum + value, 0) * 100) / 100
      : charges;
  return {
    estimatedRevenue: estimated,
    totalCharges: charges,
    totalPayments: payments,
    outstandingBalance: getGroupBalance(txns),
  };
}

export function getGroupInvoices(): { invoices: []; reason: string } {
  return { invoices: [], reason: GROUP_INVOICE_UNAVAILABLE };
}

export type GroupInvoiceServiceResult = { available: false; reason: string };

export const groupInvoiceService = {
  create(): GroupInvoiceServiceResult {
    return { available: false, reason: GROUP_INVOICE_SERVICE_UNAVAILABLE };
  },
  draft(): GroupInvoiceServiceResult {
    return { available: false, reason: GROUP_INVOICE_SERVICE_UNAVAILABLE };
  },
  finalize(): GroupInvoiceServiceResult {
    return { available: false, reason: GROUP_INVOICE_SERVICE_UNAVAILABLE };
  },
  send(): GroupInvoiceServiceResult {
    return { available: false, reason: GROUP_INVOICE_SERVICE_UNAVAILABLE };
  },
};

export const groupCommunicationTemplateService = {
  list(): { templates: []; reason: string } {
    return { templates: [], reason: GROUP_COMMS_TEMPLATES_UNAVAILABLE };
  },
  render(): { body: null; reason: string } {
    return { body: null, reason: GROUP_COMMS_TEMPLATES_UNAVAILABLE };
  },
};

export function categorizeGroupTxn(type: string): "room" | "payment" | "other" {
  if (type === "payment" || type === "deposit" || type === "refund") return "payment";
  if (type === "charge") return "room";
  return "other";
}
