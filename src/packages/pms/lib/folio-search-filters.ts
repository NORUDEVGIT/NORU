import { RESERVATION_STATUSES } from "./reservations.server";

export const FOLIO_SEARCH_DEBOUNCE_MS = 300;
export const FOLIO_SEARCH_FILTER_ALL = "all";

export const FOLIO_SEARCH_PAGE_SIZES = [10, 25, 50] as const;
export const FOLIO_SEARCH_DEFAULT_PAGE_SIZE = 10;

export const FOLIO_ACCOUNT_TYPES = ["all", "guest", "company", "group"] as const;
export type FolioAccountType = (typeof FOLIO_ACCOUNT_TYPES)[number];

/** @deprecated use FolioAccountType */
export const FOLIO_ACCOUNT_MODES = ["guest", "company", "group"] as const;
export type FolioAccountMode = (typeof FOLIO_ACCOUNT_MODES)[number];

export function resolveFolioAccountType(value: string | undefined): FolioAccountType {
  if (value === "guest" || value === "company" || value === "group") return value;
  return "all";
}

export function accountTypeLabel(type: FolioAccountType): string {
  switch (type) {
    case "all":
      return "All Accounts";
    case "guest":
      return "Guest";
    case "company":
      return "Company";
    case "group":
      return "Group";
  }
}

export function resultsTitle(type: FolioAccountType): string {
  switch (type) {
    case "all":
      return "All Accounts";
    case "guest":
      return "Guest Folios";
    case "company":
      return "Company Accounts";
    case "group":
      return "Group Accounts";
  }
}

export const FOLIO_STATUS_FILTERS = ["all", "open", "closed"] as const;
export type FolioStatusFilter = (typeof FOLIO_STATUS_FILTERS)[number];

export const FOLIO_STAY_STATUS_FILTERS = [
  "all",
  "checked_in",
  "checked_out",
  "confirmed",
  "pending",
  "cancelled",
  "no_show",
] as const;
export type FolioStayStatusFilter = (typeof FOLIO_STAY_STATUS_FILTERS)[number];

export const FOLIO_PAYMENT_STATE_FILTERS = [
  "all",
  "settled",
  "outstanding",
  "partially_paid",
  "credit_balance",
] as const;
export type FolioPaymentStateFilter = (typeof FOLIO_PAYMENT_STATE_FILTERS)[number];

export const FOLIO_SEARCH_SORT_OPTIONS = [
  { id: "arrival_date_desc", sortBy: "arrival_date", sortDirection: "desc", label: "Arrival — Newest" },
  { id: "arrival_date_asc", sortBy: "arrival_date", sortDirection: "asc", label: "Arrival — Oldest" },
  { id: "departure_date_desc", sortBy: "departure_date", sortDirection: "desc", label: "Departure — Newest" },
  { id: "balance_desc", sortBy: "balance", sortDirection: "desc", label: "Balance — High to Low" },
  { id: "balance_asc", sortBy: "balance", sortDirection: "asc", label: "Balance — Low to High" },
  { id: "opened_at_desc", sortBy: "opened_at", sortDirection: "desc", label: "Opened — Newest" },
] as const;

export type FolioSearchSortId = (typeof FOLIO_SEARCH_SORT_OPTIONS)[number]["id"];
export type FolioSearchSortField = (typeof FOLIO_SEARCH_SORT_OPTIONS)[number]["sortBy"];

export type FolioSearchMoreFilters = {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  marketSegment: string;
  marketSegmentLabel: string;
  bookingSource: string;
  bookingSourceLabel: string;
  salesChannel: string;
  salesChannelLabel: string;
  currency: string;
  unsettledCheckout: boolean;
};

export type FolioSearchBarFilters = {
  search: string;
  folioStatus: FolioStatusFilter;
  stayStatus: FolioStayStatusFilter;
  stayFrom: string;
  stayTo: string;
  paymentState: FolioPaymentStateFilter;
};

export const EMPTY_FOLIO_SEARCH_MORE_FILTERS: FolioSearchMoreFilters = {
  roomTypeId: FOLIO_SEARCH_FILTER_ALL,
  roomTypeName: "",
  ratePlanId: FOLIO_SEARCH_FILTER_ALL,
  ratePlanName: "",
  marketSegment: FOLIO_SEARCH_FILTER_ALL,
  marketSegmentLabel: "",
  bookingSource: FOLIO_SEARCH_FILTER_ALL,
  bookingSourceLabel: "",
  salesChannel: FOLIO_SEARCH_FILTER_ALL,
  salesChannelLabel: "",
  currency: FOLIO_SEARCH_FILTER_ALL,
  unsettledCheckout: false,
};

export const EMPTY_FOLIO_SEARCH_BAR_FILTERS: FolioSearchBarFilters = {
  search: "",
  folioStatus: "all",
  stayStatus: "all",
  stayFrom: "",
  stayTo: "",
  paymentState: "all",
};

export function countActiveFolioMoreFilters(filters: FolioSearchMoreFilters): number {
  let count = 0;
  if (filters.roomTypeId !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.ratePlanId !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.marketSegment !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.bookingSource !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.salesChannel !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.currency !== FOLIO_SEARCH_FILTER_ALL) count += 1;
  if (filters.unsettledCheckout) count += 1;
  return count;
}

export function hasActiveFolioSearchConstraints(
  bar: FolioSearchBarFilters,
  more: FolioSearchMoreFilters,
): boolean {
  return (
    bar.search.trim() !== "" ||
    bar.folioStatus !== "all" ||
    bar.stayStatus !== "all" ||
    bar.stayFrom !== "" ||
    bar.stayTo !== "" ||
    bar.paymentState !== "all" ||
    countActiveFolioMoreFilters(more) > 0
  );
}

export function folioSearchSortOption(id: FolioSearchSortId) {
  return FOLIO_SEARCH_SORT_OPTIONS.find((option) => option.id === id) ?? FOLIO_SEARCH_SORT_OPTIONS[0];
}

export function isFolioStayStatusSupported(value: string): value is FolioStayStatusFilter {
  return (FOLIO_STAY_STATUS_FILTERS as readonly string[]).includes(value);
}

export function reservationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "checked_in":
      return "In-House";
    case "checked_out":
      return "Checked-Out";
    case "confirmed":
      return "Confirmed";
    case "pending":
      return "Pending";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No-Show";
    default:
      return "—";
  }
}

export function paymentStateLabel(state: string): string {
  switch (state) {
    case "settled":
      return "Settled";
    case "outstanding":
      return "Outstanding";
    case "partially_paid":
      return "Partially Paid";
    case "credit_balance":
      return "Credit Balance";
    default:
      return state;
  }
}

export function validateFolioStayDateRange(from: string, to: string): string | null {
  if (!from && !to) return null;
  if (!!from !== !!to) return "Stay dates require both a start and end.";
  if (to < from) return "Stay end must be on or after stay start.";
  return null;
}

/** Stay statuses sent to the server (must be reservation statuses). */
export function resolveStayStatusesForQuery(
  stayStatus: FolioStayStatusFilter,
): string[] | null {
  if (stayStatus === "all") return null;
  if ((RESERVATION_STATUSES as readonly string[]).includes(stayStatus)) {
    return [stayStatus];
  }
  return null;
}
