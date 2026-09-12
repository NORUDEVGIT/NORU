/**
 * FO-SEARCH1 — typed global stay search (pure).
 *
 * Matches confirmation · guest · phone · email · room, plus company_name /
 * group_name when those columns have stored data. Never invents Company/Group
 * from hotel_reservations.source. Missing 0046 columns omit those chips only.
 */
import { isStayCancellable } from "./fo-cancel-noshow.ts";
import { isMissingSchemaError } from "./fo-amendments.ts";

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_CAP = 25;
export const NO_STAYS_FOUND = "No stays found";
export const SEARCH_HINT = "Type at least 2 characters";

export function showingFirstResultsFooter(shown: number): string {
  return `Showing first ${shown} results`;
}

export const FO_SEARCH_MATCH_FIELDS = [
  "guest",
  "confirmation",
  "room",
  "phone",
  "email",
  "company",
  "group",
] as const;
export type FoSearchMatchField = (typeof FO_SEARCH_MATCH_FIELDS)[number];

export const FO_SEARCH_MATCH_LABELS: Record<FoSearchMatchField, string> = {
  guest: "Guest",
  confirmation: "Confirmation",
  room: "Room",
  phone: "Phone",
  email: "Email",
  company: "Company",
  group: "Group",
};

export const FO_SEARCH_ACTIONS = ["open_stay", "show_on_rack", "check_in", "check_out", "cancel"] as const;
export type FoSearchActionId = (typeof FO_SEARCH_ACTIONS)[number];

export const FO_SEARCH_ACTION_LABELS: Record<FoSearchActionId, string> = {
  open_stay: "Open stay",
  show_on_rack: "Show on Room Rack",
  check_in: "Check-in",
  check_out: "Checkout",
  cancel: "Cancel",
};

export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function isSearchReady(value: string): boolean {
  return normalizeSearchTerm(value).length >= SEARCH_MIN_CHARS;
}

export function searchLikePattern(value: string): string {
  return `%${value.trim().replace(/[%,]/g, "")}%`;
}

export function fieldContains(value: string | null | undefined, term: string): boolean {
  const needle = normalizeSearchTerm(term);
  if (!needle) return false;
  return (value ?? "").toLowerCase().includes(needle);
}

/** Trim-on-write / trim-on-read. Empty or whitespace becomes null — never stored as "". */
export function trimCompanyGroupName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export type FoSearchStayInput = {
  guestName: string;
  confirmationNumber: string;
  roomNumber: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  companyName: string | null;
  groupName: string | null;
  source?: string | null;
  status: string;
  roomId: string | null;
};

/**
 * Chips only for fields that contributed to the match.
 * `source` is ignored even when it is group/corporate.
 */
export function contributingMatchChips(
  stay: FoSearchStayInput,
  term: string,
  companyGroupAvailable = true,
): FoSearchMatchField[] {
  const chips: FoSearchMatchField[] = [];
  if (fieldContains(stay.guestName, term)) chips.push("guest");
  if (fieldContains(stay.confirmationNumber, term)) chips.push("confirmation");
  if (fieldContains(stay.roomNumber, term)) chips.push("room");
  if (fieldContains(stay.guestPhone, term)) chips.push("phone");
  if (fieldContains(stay.guestEmail, term)) chips.push("email");
  if (companyGroupAvailable) {
    const company = trimCompanyGroupName(stay.companyName);
    const group = trimCompanyGroupName(stay.groupName);
    if (company && fieldContains(company, term)) chips.push("company");
    if (group && fieldContains(group, term)) chips.push("group");
  }
  void stay.source;
  return chips;
}

export function companyGroupSoftLine(
  stay: Pick<FoSearchStayInput, "companyName" | "groupName">,
  matches: readonly FoSearchMatchField[],
): { company: string | null; group: string | null } {
  return {
    company: matches.includes("company") ? trimCompanyGroupName(stay.companyName) : null,
    group: matches.includes("group") ? trimCompanyGroupName(stay.groupName) : null,
  };
}

/** Arrivals-list statuses: pending / confirmed may check in. */
export function isSearchCheckInEligible(status: string): boolean {
  return status === "pending" || status === "confirmed";
}

/** Departures-list Check out: checked_in only. */
export function isSearchCheckOutEligible(status: string): boolean {
  return status === "checked_in";
}

/** Side Sheet / Bookings: pending or confirmed → FoCancelStepper. */
export function isSearchCancelEligible(status: string): boolean {
  return isStayCancellable(status);
}

/** Assigned (pending/confirmed with a room) or in-house. */
export function isSearchRackEligible(stay: { status: string; roomId: string | null }): boolean {
  if (stay.status === "checked_in") return true;
  return stay.roomId != null && (stay.status === "pending" || stay.status === "confirmed");
}

export function searchActionsForStay(stay: { status: string; roomId: string | null }): FoSearchActionId[] {
  const actions: FoSearchActionId[] = ["open_stay"];
  if (isSearchRackEligible(stay)) actions.push("show_on_rack");
  if (isSearchCheckInEligible(stay.status)) actions.push("check_in");
  if (isSearchCheckOutEligible(stay.status)) actions.push("check_out");
  if (isSearchCancelEligible(stay.status)) actions.push("cancel");
  return actions;
}

export function capSearchResults<T>(
  rows: readonly T[],
  cap = SEARCH_RESULT_CAP,
): { rows: T[]; truncated: boolean; footer: string | null } {
  const truncated = rows.length > cap;
  const sliced = truncated ? rows.slice(0, cap) : [...rows];
  return {
    rows: sliced,
    truncated,
    footer: truncated ? showingFirstResultsFooter(sliced.length) : null,
  };
}

export function isCompanyGroupColumnMissing(error: unknown): boolean {
  return isMissingSchemaError(error, "company_name") || isMissingSchemaError(error, "group_name");
}

export function searchEmpty(input: { term: string; results: readonly unknown[]; loading?: boolean }): boolean {
  return isSearchReady(input.term) && !input.loading && input.results.length === 0;
}

export function guestNameSearchTokens(term: string): string[] {
  const full = term.trim().replace(/[%,]/g, "");
  const parts = full.split(/\s+/).filter((part) => part.length > 0);
  return [...new Set([full, ...parts].filter((part) => part.length >= 1))];
}
