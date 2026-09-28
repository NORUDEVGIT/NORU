/**
 * Canonical Travel Agent Detail view registry and navigation helpers.
 * NORU PMS — Guest Profile Phase 6: Travel Agency Operational Workspace
 */

export const TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS = [
  // Primary Tabs
  { id: "overview", label: "Overview", group: "primary" },
  { id: "details", label: "Agency Details", group: "primary" },
  { id: "contacts-travelers", label: "Contacts & Travelers", group: "primary" },
  { id: "bookings", label: "Bookings", group: "primary" },
  { id: "commercial-commission", label: "Commercial & Commission", group: "primary" },
  // More Dropdown Items
  { id: "agreements", label: "Agreements", group: "more" },
  { id: "documents", label: "Documents", group: "more" },
  { id: "communication-notes", label: "Communication & Notes", group: "more" },
  { id: "activity", label: "Activity / History", group: "more" },
  { id: "settings", label: "Agency Settings", group: "more" },
] as const;

export type CanonicalTravelAgentViewId =
  (typeof TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS)[number]["id"];

export const TRAVEL_AGENT_DETAIL_PRIMARY_TABS =
  TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS.filter((v) => v.group === "primary");

export const TRAVEL_AGENT_DETAIL_MORE_ITEMS =
  TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS.filter((v) => v.group === "more");

export type TravelAgentContactsTravelersSubTab = "contacts" | "travelers";
export type TravelAgentCommercialSubTab = "commission" | "billing";
export type TravelAgentSettingsSubTab = "booking-rules" | "allotments" | "notifications";

/**
 * Resolves any raw nav parameter (including legacy bookmarked URLs) to a canonical view ID.
 * Maps:
 * - "contacts" -> "contacts-travelers"
 * - "travelers" -> "contacts-travelers"
 * - "commission" -> "commercial-commission"
 * - "payment" / "billing" / "payment-invoices" -> "commercial-commission"
 * - "bookings" / "reservations" -> "bookings"
 * - "agreements" -> "agreements"
 * - "documents" -> "documents"
 * - "notes" -> "communication-notes"
 * - "history" / "activity-log" -> "activity"
 * - "agency-settings" -> "settings"
 * - unknown -> "overview"
 */
export function resolveCanonicalTravelAgentNavId(
  raw: string | null | undefined,
): CanonicalTravelAgentViewId {
  if (!raw) return "overview";
  const normalized = raw.trim().toLowerCase();

  switch (normalized) {
    case "overview":
      return "overview";
    case "details":
    case "agency-details":
      return "details";
    case "contacts-travelers":
    case "contacts":
    case "travelers":
      return "contacts-travelers";
    case "bookings":
    case "reservations":
      return "bookings";
    case "commercial-commission":
    case "commission":
    case "payment":
    case "billing":
    case "payment-invoices":
      return "commercial-commission";
    case "agreements":
      return "agreements";
    case "documents":
      return "documents";
    case "communication-notes":
    case "notes":
      return "communication-notes";
    case "activity":
    case "history":
    case "activity-log":
      return "activity";
    case "settings":
    case "agency-settings":
      return "settings";
    default:
      return "overview";
  }
}

/**
 * Determines the initial subtab inside "contacts-travelers" based on legacy nav parameter.
 */
export function resolveInitialTravelAgentContactsTravelersSubTab(
  raw: string | null | undefined,
): TravelAgentContactsTravelersSubTab {
  if (raw === "travelers") return "travelers";
  return "contacts";
}

/**
 * Determines the initial subtab inside "commercial-commission" based on legacy nav parameter.
 */
export function resolveInitialTravelAgentCommercialSubTab(
  raw: string | null | undefined,
): TravelAgentCommercialSubTab {
  if (raw === "payment" || raw === "billing" || raw === "payment-invoices") return "billing";
  return "commission";
}

/**
 * Determines the initial subtab inside "settings" based on legacy nav parameter.
 */
export function resolveInitialTravelAgentSettingsSubTab(
  raw: string | null | undefined,
): TravelAgentSettingsSubTab {
  if (raw === "allotments" || raw === "allotment-inventory") return "allotments";
  if (raw === "notifications") return "notifications";
  return "booking-rules";
}

/**
 * Checks whether a view ID belongs to the "More" dropdown group.
 */
export function isMoreTravelAgentView(id: CanonicalTravelAgentViewId): boolean {
  return TRAVEL_AGENT_DETAIL_MORE_ITEMS.some((item) => item.id === id);
}

/**
 * Checks whether a view ID belongs to the primary tabs.
 */
export function isPrimaryTravelAgentView(id: CanonicalTravelAgentViewId): boolean {
  return TRAVEL_AGENT_DETAIL_PRIMARY_TABS.some((item) => item.id === id);
}
