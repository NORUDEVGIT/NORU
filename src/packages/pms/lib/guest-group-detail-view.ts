/**
 * Canonical Group Detail view registry and navigation helpers.
 * NORU PMS — Guest Profile Phase 7: Group Operational Workspace
 */

export const GROUP_DETAIL_CANONICAL_VIEWS = [
  // Primary Tabs
  { id: "overview", label: "Overview", group: "primary" },
  { id: "master", label: "Group Master", group: "primary" },
  { id: "members", label: "Members", group: "primary" },
  { id: "reservations", label: "Reservations", group: "primary" },
  { id: "rooming", label: "Rooming List", group: "primary" },
  // More Dropdown Items
  { id: "communication", label: "Communication", group: "more" },
  { id: "financial", label: "Derived Financial Summary", group: "more" },
  { id: "itinerary", label: "Itinerary", group: "more" },
  { id: "documents", label: "Documents", group: "more" },
  { id: "activity", label: "Activity / History", group: "more" },
] as const;

export type CanonicalGroupViewId = (typeof GROUP_DETAIL_CANONICAL_VIEWS)[number]["id"];

export const GROUP_DETAIL_PRIMARY_TABS = GROUP_DETAIL_CANONICAL_VIEWS.filter(
  (v) => v.group === "primary",
);

export const GROUP_DETAIL_MORE_ITEMS = GROUP_DETAIL_CANONICAL_VIEWS.filter(
  (v) => v.group === "more",
);

export function isPrimaryGroupView(id: string | null | undefined): boolean {
  return GROUP_DETAIL_PRIMARY_TABS.some((tab) => tab.id === id);
}

export function isMoreGroupView(id: string | null | undefined): boolean {
  return GROUP_DETAIL_MORE_ITEMS.some((item) => item.id === id);
}

/**
 * Resolves any raw nav parameter (including legacy bookmarked URLs) to a canonical view ID.
 * Maps:
 * - "overview" -> "overview"
 * - "master" / "details" / "group-master" -> "master"
 * - "members" -> "members"
 * - "reservations" / "bookings" -> "reservations"
 * - "rooming" / "rooming-list" -> "rooming"
 * - "communication" / "comms" / "notes" -> "communication"
 * - "financial" / "financials" / "financial-summary" -> "financial"
 * - "itinerary" -> "itinerary"
 * - "documents" -> "documents"
 * - "activity" / "history" / "activity-log" -> "activity"
 * - unknown -> "overview"
 */
export function resolveCanonicalGroupNavId(
  raw: string | null | undefined,
): CanonicalGroupViewId {
  if (!raw) return "overview";
  const normalized = raw.trim().toLowerCase();

  switch (normalized) {
    case "overview":
      return "overview";
    case "master":
    case "details":
    case "group-master":
      return "master";
    case "members":
      return "members";
    case "reservations":
    case "bookings":
      return "reservations";
    case "rooming":
    case "rooming-list":
      return "rooming";
    case "communication":
    case "comms":
    case "notes":
      return "communication";
    case "financial":
    case "financials":
    case "financial-summary":
      return "financial";
    case "itinerary":
      return "itinerary";
    case "documents":
      return "documents";
    case "activity":
    case "history":
    case "activity-log":
      return "activity";
    default:
      return "overview";
  }
}
