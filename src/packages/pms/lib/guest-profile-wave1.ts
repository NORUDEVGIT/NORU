/**
 * Guest Profile Module — Wave 1 catalogue (shell + Directory + Information).
 *
 * Presentation constants only. Individual create/find/edit stays on the
 * existing guests functions — this file does not introduce a second store.
 */

export const GUEST_PROFILE_MODULE_KEY = "guest-profile";
export const GUEST_PROFILE_TITLE = "Guest Profile";

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
    title: "Stay History",
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
] as const;

export type GuestProfileCardId = (typeof GUEST_PROFILE_CARDS)[number]["id"];

export function guestProfileCard(id: GuestProfileCardId) {
  return GUEST_PROFILE_CARDS.find((card) => card.id === id) ?? GUEST_PROFILE_CARDS[1];
}

export function defaultGuestProfileCard(hasGuest: boolean): GuestProfileCardId {
  return hasGuest ? "information" : "directory";
}

/**
 * LIVE cards that require a selected guest first (Spec §5.15 / guests.md §7.7).
 * Directory is LIVE but is the picker — it is not guest-required.
 */
export function isGuestRequiredProfileCard(id: GuestProfileCardId): boolean {
  return id !== "directory" && guestProfileCard(id).live;
}

/** Empty / no-guest-selected CTA (Spec §5.16). Later LIVE cards inherit this. */
export function showEmptyDirectoryCta(hasGuest: boolean, card: GuestProfileCardId): boolean {
  return !hasGuest && isGuestRequiredProfileCard(card);
}

/** Optional `?card=` so Directory-back can reopen the same guest-required card. */
export type GuestProfileCardSearch = {
  card?: GuestProfileCardId;
};

/** Optional `?type=` for the LIVE Individual | Company | Group | TA switcher. */
export type GuestProfileSearch = GuestProfileCardSearch & {
  type?: GuestProfileTypeId;
};

export function parseGuestProfileCardSearch(
  search: Record<string, unknown>,
): GuestProfileCardSearch {
  const raw = typeof search["card"] === "string" ? search["card"] : undefined;
  if (!raw) return {};
  const match = GUEST_PROFILE_CARDS.find((item) => item.id === raw);
  if (!match || !isGuestRequiredProfileCard(match.id)) return {};
  return { card: match.id };
}

export function parseGuestProfileTypeSearch(
  search: Record<string, unknown>,
): GuestProfileTypeId {
  const raw = typeof search["type"] === "string" ? search["type"] : undefined;
  const match = GUEST_PROFILE_TYPES.find((item) => item.id === raw && item.live);
  return match?.id ?? "individual";
}

export function parseGuestProfileSearch(
  search: Record<string, unknown>,
): GuestProfileSearch {
  const card = parseGuestProfileCardSearch(search);
  const type = parseGuestProfileTypeSearch(search);
  return type === "individual" ? card : { ...card, type };
}

export function guestProfileCardSearch(
  card: GuestProfileCardId | undefined,
): GuestProfileCardSearch {
  if (card && isGuestRequiredProfileCard(card)) return { card };
  return {};
}

export function guestProfileSearch(opts: {
  card?: GuestProfileCardId | undefined;
  type?: GuestProfileTypeId | undefined;
}): GuestProfileSearch {
  const card = guestProfileCardSearch(opts.card);
  const type = opts.type && opts.type !== "individual" ? opts.type : undefined;
  return type ? { ...card, type } : card;
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
