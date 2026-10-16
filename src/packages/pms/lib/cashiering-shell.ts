/** Cashiering Desk tab contract. URL-driven. Unsupported modules are not tabs. */

export const CASHIERING_TABS = [
  { id: "overview", label: "Overview" },
  { id: "folios", label: "Folios" },
  { id: "payments", label: "Payments" },
  { id: "deposits", label: "Deposits" },
  { id: "refunds", label: "Refunds" },
  { id: "transfers", label: "Transfers" },
  { id: "accounts", label: "Accounts" },
  { id: "exceptions", label: "Exceptions" },
  { id: "reports", label: "Reports" },
  { id: "cashier-shift", label: "Cashier Shift" },
] as const;

export type CashieringTabId = (typeof CASHIERING_TABS)[number]["id"];

export const CASHIERING_DESK_EYEBROW = "Operations";
export const CASHIERING_DESK_TITLE = "Cashiering";
export const CASHIERING_DESK_DESCRIPTION =
  "Manage folios, financial activity, settlement and cashier operations across the property.";

const TAB_ALIASES: Record<string, CashieringTabId> = {
  dashboard: "overview",
  shifts: "cashier-shift",
  "cashier-shifts": "cashier-shift",
};

const FOLIO_ACTIONS = [
  "charge",
  "payment",
  "deposit",
  "refund",
  "discount",
  "adjustment",
  "close",
] as const;

export type FolioAction = (typeof FOLIO_ACTIONS)[number];

export function isFolioAction(value: string | undefined): value is FolioAction {
  return FOLIO_ACTIONS.some((action) => action === value);
}

export function resolveCashieringTab(value: string | undefined | null): CashieringTabId {
  if (!value) return "overview";
  if (CASHIERING_TABS.some((tab) => tab.id === value)) return value as CashieringTabId;
  return TAB_ALIASES[value] ?? "overview";
}

export type CashieringSearchParams = {
  tab?: CashieringTabId;
  folio?: string;
  account?: "all" | "guest" | "company" | "group";
  q?: string;
  page?: number;
  pageSize?: number;
  folioStatus?: string;
  stayStatus?: string;
  stayFrom?: string;
  stayTo?: string;
  paymentState?: string;
  sort?: string;
};

export function cashieringTabSearch(
  tab: CashieringTabId,
  folio?: string | null,
  extra?: Omit<CashieringSearchParams, "tab" | "folio">,
): CashieringSearchParams {
  const next: CashieringSearchParams = { ...(extra ?? {}), tab };
  if (folio) next.folio = folio;
  else if (folio === null) delete next.folio;
  return next;
}
