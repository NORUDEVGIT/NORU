/**
 * Guest Profile Module — Wave 1 catalogue (shell + Directory + Information).
 *
 * Presentation constants only. Individual create/find/edit stays on the
 * existing guests functions — this file does not introduce a second store.
 */

export const GUEST_PROFILE_MODULE_KEY = "guest-profile";
export const GUEST_PROFILE_TITLE = "Guest Profiles";

export const GUEST_PROFILE_DIRECTORY_PATH = "/restaurant/pms/guests";
export const GUEST_PROFILE_DETAIL_PATH = "/restaurant/pms/guests/$guestId";

export const GUEST_PROFILE_LEGACY_DIRECTORY = "/restaurant/guests";
export const GUEST_PROFILE_LEGACY_DETAIL = "/restaurant/pms/reservations/guests/$guestId";

export const GUEST_PROFILE_TYPES = [
  { id: "individual", title: "Individual", live: true, wave: 1 },
  { id: "company", title: "Company", live: true, wave: 4 },
  { id: "group", title: "Group", live: true, wave: 4 },
  { id: "travel-agent", title: "Travel Agent", live: true, wave: 4 },
] as const;

export type GuestProfileTypeId = (typeof GUEST_PROFILE_TYPES)[number]["id"];

export const GUEST_PROFILE_CARDS = [
  {
    id: "dashboard",
    title: "Dashboard Overview",
    live: true,
    wave: 3,
    copy: "Stay and night counts come from this guest's real reservations. Revenue and folio amounts appear only when they are stored.",
  },
  {
    id: "directory",
    title: "Directory",
    live: true,
    wave: 1,
    copy: null,
  },
  {
    id: "information",
    title: "Information",
    live: true,
    wave: 1,
    copy: null,
  },
  {
    id: "identity",
    title: "Identity & Documents",
    live: true,
    wave: 2,
    copy: null,
  },
  {
    id: "stay-history",
    title: "Stays & Reservations",
    live: true,
    wave: 3,
    copy: "Real reservations for this guest. This card does not invent stays and is not profile-event history.",
  },
  {
    id: "preferences",
    title: "Preferences",
    live: true,
    wave: 2,
    copy: null,
  },
  {
    id: "loyalty",
    title: "Loyalty & Value",
    live: true,
    wave: 4,
    copy: "Stay counts, nights and stored folio amounts only. There is no points balance. VIP remains a staff flag on Information.",
  },
  {
    id: "relationships",
    title: "Relationships",
    live: true,
    wave: 4,
    copy: "Employer, bill-to, booker travel agent and group member links. Bill-to is an association only — not folio split routing.",
  },
  {
    id: "notes-comms",
    title: "Notes / Comms / Activity",
    live: true,
    wave: 5,
    copy: "Notes, profile history and recorded operational communications. Send is offered only when a real channel is configured.",
  },
  {
    id: "admin-privacy",
    title: "Admin & Privacy",
    live: true,
    wave: 5,
    copy: "Export, anonymise and unmerge (or a recorded exception). Wave 2 consent stays on Information. VIP and status remain there too.",
  },
  {
    id: "services",
    title: "Services",
    live: true,
    wave: 3,
    copy: "Operational guest service requests for this stay. Types come from Guest & Services Settings.",
  },
  {
    id: "financial",
    title: "Financial",
    live: true,
    wave: 3,
    copy: "Placeholder until Financial functionality is implemented.",
  },
] as const;

export type GuestProfileCardId = (typeof GUEST_PROFILE_CARDS)[number]["id"];

/** Individual workspace chrome. Personal and Contact share Information content. */
export const GUEST_PROFILE_WORKSPACE_NAV = [
  { id: "overview", card: "dashboard", title: "Overview" },
  { id: "personal", card: "information", title: "Personal" },
  { id: "contact", card: "information", title: "Contact" },
  { id: "identity", card: "identity", title: "Identity Documents" },
  { id: "preferences", card: "preferences", title: "Preferences" },
  { id: "business", card: "relationships", title: "Business" },
  { id: "bookings", card: "stay-history", title: "Stays & Reservations" },
  { id: "services", card: "services", title: "Services" },
  { id: "financial", card: "financial", title: "Financial" },
  { id: "notes", card: "notes-comms", title: "Notes" },
  { id: "history", card: "notes-comms", title: "History" },
] as const;

export type GuestProfileWorkspaceNavId = (typeof GUEST_PROFILE_WORKSPACE_NAV)[number]["id"];

export function guestProfileWorkspaceNav(id: GuestProfileWorkspaceNavId | CompanyDetailNavId | TravelAgentDetailNavId) {
  return (
    GUEST_PROFILE_WORKSPACE_NAV.find((item) => item.id === id) ?? GUEST_PROFILE_WORKSPACE_NAV[0]
  );
}

export function workspaceNavForCard(card: GuestProfileCardId): GuestProfileWorkspaceNavId {
  const match = GUEST_PROFILE_WORKSPACE_NAV.find((item) => item.card === card);
  return match?.id ?? "overview";
}

export function guestProfileCard(id: GuestProfileCardId) {
  return GUEST_PROFILE_CARDS.find((card) => card.id === id) ?? GUEST_PROFILE_CARDS[1];
}

export function defaultGuestProfileCard(hasGuest: boolean): GuestProfileCardId {
  return hasGuest ? "dashboard" : "directory";
}

/**
 * LIVE cards that require a selected guest first (Spec §5.15 / guests.md §7.7).
 * Directory is LIVE but is the picker — it is not guest-required.
 */
export function isGuestRequiredProfileCard(id: GuestProfileCardId): boolean {
  return id !== "directory" && guestProfileCard(id).live;
}

/** Cards shown in the selected-guest tab bar. Hidden ids stay LIVE for deep links. */
export function isGuestProfileNavCard(id: GuestProfileCardId): boolean {
  return id !== "directory" && id !== "loyalty" && id !== "notes-comms" && id !== "admin-privacy";
}

/** Empty / no-guest-selected CTA (Spec §5.16). Later LIVE cards inherit this. */
export function showEmptyDirectoryCta(hasGuest: boolean, card: GuestProfileCardId): boolean {
  return !hasGuest && isGuestRequiredProfileCard(card);
}

/** Optional `?card=` so Directory-back can reopen the same guest-required card. */
export const COMPANY_DETAIL_NAV_IDS = [
  "overview",
  "corporate",
  "contacts",
  "travelers",
  "contracts",
  "reservations",
  "notes",
  "history",
  "documents",
  "credit",
  "travel-agent-settings",
] as const;
export type CompanyDetailNavId = (typeof COMPANY_DETAIL_NAV_IDS)[number];

export const TRAVEL_AGENT_DETAIL_NAV_IDS = [
  "overview",
  "contacts",
  "bookings",
  "commission",
  "agreements",
  "payment",
  "documents",
  "notes",
  "history",
  "settings",
] as const;
export type TravelAgentDetailNavId = (typeof TRAVEL_AGENT_DETAIL_NAV_IDS)[number];

export type GuestProfileCardSearch = {
  card?: GuestProfileCardId;
  nav?: GuestProfileWorkspaceNavId | CompanyDetailNavId | TravelAgentDetailNavId;
};

/** Listing-only placeholders — not operational GUEST_PROFILE_TYPES. */
export const GUEST_LISTING_PLACEHOLDER_TYPES = ["tour-operator", "contact"] as const;
export type GuestListingPlaceholderType = (typeof GUEST_LISTING_PLACEHOLDER_TYPES)[number];

/** Optional `?type=` for operational types plus listing placeholders. */
export type GuestProfileSearch = GuestProfileCardSearch & {
  type?: GuestProfileTypeId | GuestListingPlaceholderType;
  create?: "individual";
};

const LEGACY_GUEST_PROFILE_NAV: Record<string, GuestProfileWorkspaceNavId> = {
  stays: "bookings",
  reservations: "bookings",
};

export function parseGuestProfileWorkspaceNav(
  search: Record<string, unknown>,
): GuestProfileWorkspaceNavId | CompanyDetailNavId | TravelAgentDetailNavId | undefined {
  const raw = typeof search["nav"] === "string" ? search["nav"] : undefined;
  if (!raw) return undefined;
  const type = typeof search["type"] === "string" ? search["type"] : undefined;
  if (type === "travel-agent" && (TRAVEL_AGENT_DETAIL_NAV_IDS as readonly string[]).includes(raw)) {
    return raw as TravelAgentDetailNavId;
  }
  if (type === "company" && (COMPANY_DETAIL_NAV_IDS as readonly string[]).includes(raw)) {
    return raw as CompanyDetailNavId;
  }
  if (raw in LEGACY_GUEST_PROFILE_NAV) return LEGACY_GUEST_PROFILE_NAV[raw];
  if ((COMPANY_DETAIL_NAV_IDS as readonly string[]).includes(raw) && raw !== "reservations") {
    return raw as CompanyDetailNavId;
  }
  return GUEST_PROFILE_WORKSPACE_NAV.find((item) => item.id === raw)?.id;
}

export function parseGuestProfileCardSearch(
  search: Record<string, unknown>,
): GuestProfileCardSearch {
  const nav = parseGuestProfileWorkspaceNav(search);
  const raw = typeof search["card"] === "string" ? search["card"] : undefined;
  const match = raw ? GUEST_PROFILE_CARDS.find((item) => item.id === raw) : undefined;
  const card =
    match && isGuestRequiredProfileCard(match.id)
      ? match.id
      : nav
        ? guestProfileWorkspaceNav(nav).card
        : undefined;
  if (!card && !nav) return {};
  return {
    ...(card ? { card } : {}),
    ...(nav ? { nav } : {}),
  };
}

export function parseGuestProfileTypeSearch(search: Record<string, unknown>): GuestProfileTypeId {
  const raw = typeof search["type"] === "string" ? search["type"] : undefined;
  const match = GUEST_PROFILE_TYPES.find((item) => item.id === raw && item.live);
  return match?.id ?? "individual";
}

export function parseGuestListingTypeSearch(
  search: Record<string, unknown>,
): GuestProfileTypeId | GuestListingPlaceholderType {
  const raw = typeof search["type"] === "string" ? search["type"] : undefined;
  if (raw && (GUEST_LISTING_PLACEHOLDER_TYPES as readonly string[]).includes(raw)) {
    return raw as GuestListingPlaceholderType;
  }
  return parseGuestProfileTypeSearch(search);
}

export function parseGuestProfileSearch(search: Record<string, unknown>): GuestProfileSearch {
  const card = parseGuestProfileCardSearch(search);
  const type = parseGuestListingTypeSearch(search);
  const create = search["create"] === "individual" ? "individual" : undefined;
  const next = type === "individual" ? { ...card } : { ...card, type };
  return create ? { ...next, create } : next;
}

export function guestProfileCardSearch(
  card: GuestProfileCardId | undefined,
  nav?: GuestProfileWorkspaceNavId | CompanyDetailNavId | TravelAgentDetailNavId | undefined,
): GuestProfileCardSearch {
  if (card && isGuestRequiredProfileCard(card)) {
    return nav ? { card, nav } : { card };
  }
  return nav ? { nav } : {};
}

export function guestProfileSearch(opts: {
  card?: GuestProfileCardId | undefined;
  nav?: GuestProfileWorkspaceNavId | CompanyDetailNavId | TravelAgentDetailNavId | undefined;
  type?: GuestProfileTypeId | GuestListingPlaceholderType | undefined;
  create?: "individual" | undefined;
}): GuestProfileSearch {
  const card = guestProfileCardSearch(opts.card, opts.nav);
  const type = opts.type && opts.type !== "individual" ? opts.type : undefined;
  const next = type ? { ...card, type } : card;
  return opts.create ? { ...next, create: opts.create } : next;
}

export function initialGuestProfileCard(
  hasGuest: boolean,
  returnCard?: GuestProfileCardId,
): GuestProfileCardId {
  if (hasGuest && returnCard && isGuestRequiredProfileCard(returnCard)) return returnCard;
  return defaultGuestProfileCard(hasGuest);
}

export const DIRECTORY_BACK_ACCEPTANCE_CRITERIA = [
  "AC-DIR-1",
  "AC-DIR-2",
  "AC-DIR-3",
  "AC-DIR-4",
  "AC-DIR-5",
  "AC-DIR-6",
  "AC-DIR-7",
] as const;

/** Empty / no-guest CTA on guest-required cards (Wave 3 residual / #91). */
export const GUEST_PROFILE_OPEN_DIRECTORY_LABEL = "Open Directory";

export const EMPTY_GUEST_ACCEPTANCE_CRITERIA = [
  "AC-EMPTY-1",
  "AC-EMPTY-2",
  "AC-EMPTY-3",
  "AC-EMPTY-4",
  "AC-EMPTY-5",
  "AC-EMPTY-6",
] as const;

export function comingInWaveLabel(wave: number): string {
  return `Coming in Wave ${wave}`;
}
