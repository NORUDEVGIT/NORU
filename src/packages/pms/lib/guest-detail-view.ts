/**
 * Canonical Detail View Registry for Individual Guest Profile
 * Phase 3 — Individual Guest Detail Workspace Redesign
 */
import type {
  GuestProfileCardId,
  GuestProfileWorkspaceNavId,
} from "./guest-profile-wave1";

export const GUEST_DETAIL_VIEW_IDS = [
  "overview",
  "personal-contact",
  "identity",
  "preferences",
  "stays",
  "relationships",
  "services",
  "communication-notes",
  "privacy",
  "activity",
  "loyalty",
] as const;

export type GuestDetailViewId = (typeof GUEST_DETAIL_VIEW_IDS)[number];

export type GuestDetailViewGroup = "primary" | "more";

export interface GuestDetailViewDefinition {
  id: GuestDetailViewId;
  label: string;
  group: GuestDetailViewGroup;
  legacyCard: GuestProfileCardId;
  legacyNav?: GuestProfileWorkspaceNavId;
  description: string;
}

export const GUEST_DETAIL_VIEW_DEFINITIONS: readonly GuestDetailViewDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    group: "primary",
    legacyCard: "dashboard",
    legacyNav: "overview",
    description: "Operational summary, guest snapshot, upcoming reservation and key preferences.",
  },
  {
    id: "personal-contact",
    label: "Personal & Contact",
    group: "primary",
    legacyCard: "information",
    legacyNav: "personal",
    description: "Consolidated personal identity, contact channels, address and emergency contacts.",
  },
  {
    id: "identity",
    label: "Identity & Documents",
    group: "primary",
    legacyCard: "identity",
    legacyNav: "identity",
    description: "Masked identity documents, verification state and official document uploads.",
  },
  {
    id: "preferences",
    label: "Preferences",
    group: "primary",
    legacyCard: "preferences",
    legacyNav: "preferences",
    description: "Room, sleep, food, communication and service preferences from Property Setup.",
  },
  {
    id: "stays",
    label: "Stays & Reservations",
    group: "primary",
    legacyCard: "stay-history",
    legacyNav: "bookings",
    description: "Reservation history, in-house stays, room details and booking actions.",
  },
  {
    id: "relationships",
    label: "Relationships",
    group: "more",
    legacyCard: "relationships",
    legacyNav: "business",
    description: "Associated corporate, travel agency, and group master profiles.",
  },
  {
    id: "services",
    label: "Services",
    group: "more",
    legacyCard: "services",
    legacyNav: "services",
    description: "Operational guest service requests and history.",
  },
  {
    id: "communication-notes",
    label: "Communication & Notes",
    group: "more",
    legacyCard: "notes-comms",
    legacyNav: "notes",
    description: "Staff notes, communications and recorded interactions.",
  },
  {
    id: "privacy",
    label: "Privacy & Administration",
    group: "more",
    legacyCard: "admin-privacy",
    description: "Consent flags, profile export, anonymisation and profile administration.",
  },
  {
    id: "activity",
    label: "Activity / History",
    group: "more",
    legacyCard: "notes-comms",
    legacyNav: "history",
    description: "Chronological audit and event activity timeline.",
  },
  {
    id: "loyalty",
    label: "Loyalty & Value",
    group: "more",
    legacyCard: "loyalty",
    description: "Derived stay counts, nights, folio figures and VIP staff recognition.",
  },
] as const;

export const PRIMARY_GUEST_DETAIL_VIEWS: readonly GuestDetailViewDefinition[] =
  GUEST_DETAIL_VIEW_DEFINITIONS.filter((def) => def.group === "primary");

export const MORE_GUEST_DETAIL_VIEWS: readonly GuestDetailViewDefinition[] =
  GUEST_DETAIL_VIEW_DEFINITIONS.filter((def) => def.group === "more");

/**
 * Resolves raw search params (including legacy `card` and `nav` params) into the canonical GuestDetailViewId.
 */
export function resolveGuestDetailView(
  search: Record<string, unknown> | undefined,
): GuestDetailViewId {
  if (!search) return "overview";

  // Check direct view / tab params first
  const rawView = typeof search["view"] === "string" ? search["view"] : undefined;
  if (rawView && (GUEST_DETAIL_VIEW_IDS as readonly string[]).includes(rawView)) {
    return rawView as GuestDetailViewId;
  }

  const rawTab = typeof search["tab"] === "string" ? search["tab"] : undefined;
  if (rawTab && (GUEST_DETAIL_VIEW_IDS as readonly string[]).includes(rawTab)) {
    return rawTab as GuestDetailViewId;
  }

  const card = typeof search["card"] === "string" ? search["card"] : undefined;
  const nav = typeof search["nav"] === "string" ? search["nav"] : undefined;

  // Granular nav-based mapping
  if (nav === "personal" || nav === "contact") return "personal-contact";
  if (nav === "identity") return "identity";
  if (nav === "preferences") return "preferences";
  if (nav === "bookings" || nav === "stays" || nav === "reservations") return "stays";
  if (nav === "business") return "relationships";
  if (nav === "services") return "services";
  if (nav === "notes") return "communication-notes";
  if (nav === "history") return "activity";

  // Card-based mapping
  if (card === "information") return "personal-contact";
  if (card === "identity") return "identity";
  if (card === "preferences") return "preferences";
  if (card === "stay-history") return "stays";
  if (card === "relationships") return "relationships";
  if (card === "services") return "services";
  if (card === "admin-privacy") return "privacy";
  if (card === "loyalty") return "loyalty";
  if (card === "notes-comms") {
    return nav === "history" ? "activity" : "communication-notes";
  }

  return "overview";
}

/**
 * Maps a canonical view id back to its legacy card and nav pair for backward compatibility.
 */
export function legacyParamsForDetailView(view: GuestDetailViewId): {
  card: GuestProfileCardId;
  nav?: GuestProfileWorkspaceNavId;
} {
  const match = GUEST_DETAIL_VIEW_DEFINITIONS.find((def) => def.id === view);
  if (!match) {
    return { card: "dashboard", nav: "overview" };
  }
  return {
    card: match.legacyCard,
    ...(match.legacyNav ? { nav: match.legacyNav } : {}),
  };
}
