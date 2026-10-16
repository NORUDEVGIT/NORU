/**
 * Canonical Company Detail view registry and navigation helpers.
 * NORU PMS — Guest Profile Phase 5: Company Operational Workspace
 */

export const COMPANY_DETAIL_CANONICAL_VIEWS = [
  // Primary Tabs
  { id: "overview", label: "Overview", group: "primary" },
  { id: "details", label: "Company Details", group: "primary" },
  { id: "contacts", label: "Contact Persons", group: "primary" },
  { id: "travelers", label: "Linked Travelers", group: "primary" },
  { id: "reservations", label: "Reservations", group: "primary" },
  { id: "commercial-billing", label: "Commercial & Billing", group: "primary" },
  // More Dropdown Items
  { id: "contracts", label: "Contracts & Agreements", group: "more" },
  { id: "documents", label: "Documents", group: "more" },
  { id: "communication-notes", label: "Communication & Notes", group: "more" },
  { id: "activity", label: "Activity / History", group: "more" },
  { id: "administration", label: "Administration", group: "more" },
] as const;

export type CanonicalCompanyViewId =
  (typeof COMPANY_DETAIL_CANONICAL_VIEWS)[number]["id"];

export const COMPANY_DETAIL_PRIMARY_TABS = COMPANY_DETAIL_CANONICAL_VIEWS.filter(
  (v) => v.group === "primary",
);

export const COMPANY_DETAIL_MORE_ITEMS = COMPANY_DETAIL_CANONICAL_VIEWS.filter(
  (v) => v.group === "more",
);

export type CompanyContactsTravelersSubTab = "contacts" | "travelers";

/**
 * Resolves any raw nav parameter (including legacy bookmarked URLs) to a canonical view ID.
 * Maps:
 * - "corporate" -> "details"
 * - "contacts" -> "contacts-travelers"
 * - "travelers" -> "contacts-travelers"
 * - "credit" -> "commercial-billing"
 * - "notes" -> "communication-notes"
 * - "history" -> "activity"
 * - "travel-agent-settings" -> "details" (removed from visible nav, info shown in Details/Commercial)
 */
export function resolveCanonicalCompanyNavId(
  raw: string | null | undefined,
): CanonicalCompanyViewId {
  if (!raw) return "overview";
  const normalized = raw.trim().toLowerCase();

  switch (normalized) {
    case "overview":
      return "overview";
    case "details":
    case "corporate":
    case "travel-agent-settings":
      return "details";
    case "contacts":
      return "contacts";
    case "travelers":
    case "link-travelers":
      return "travelers";
    case "contacts-travelers":
      return "contacts";
    case "reservations":
      return "reservations";
    case "commercial-billing":
    case "credit":
      return "commercial-billing";
    case "contracts":
      return "contracts";
    case "documents":
      return "documents";
    case "communication-notes":
    case "notes":
      return "communication-notes";
    case "activity":
    case "history":
      return "activity";
    case "administration":
      return "administration";
    default:
      return "overview";
  }
}

/**
 * Determines the initial subtab inside "contacts-travelers" based on legacy nav parameter.
 */
export function resolveInitialContactsTravelersSubTab(
  raw: string | null | undefined,
): CompanyContactsTravelersSubTab {
  if (raw === "travelers") return "travelers";
  return "contacts";
}

/**
 * Checks whether a view ID belongs to the "More" dropdown group.
 */
export function isMoreCompanyView(id: CanonicalCompanyViewId): boolean {
  return COMPANY_DETAIL_MORE_ITEMS.some((item) => item.id === id);
}
