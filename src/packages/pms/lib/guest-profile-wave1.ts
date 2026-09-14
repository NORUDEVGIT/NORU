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
  { id: "company", title: "Company", live: false, wave: 4 },
  { id: "group", title: "Group", live: false, wave: 4 },
  { id: "travel-agent", title: "Travel Agent", live: false, wave: 4 },
] as const;

export type GuestProfileTypeId = (typeof GUEST_PROFILE_TYPES)[number]["id"];

export const GUEST_PROFILE_CARDS = [
  {
    id: "dashboard",
    title: "Dashboard Overview",
    live: false,
    wave: 3,
    copy: "Coming in Wave 3. Real stay figures will appear here only when they can be derived from reservations. Nothing is shown yet.",
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
    live: false,
    wave: 3,
    copy: "Coming in Wave 3. Stay history will list real reservations for this guest. This card does not invent stays.",
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
    live: false,
    wave: 4,
    copy: "Coming in Wave 4. Loyalty and value will use real-derived stay and folio figures only. No points balance is shown.",
  },
  {
    id: "relationships",
    title: "Relationships",
    live: false,
    wave: 4,
    copy: "Coming in Wave 4. Company, group and travel-agent links are not LIVE. No master accounts can be created here.",
  },
  {
    id: "notes-comms",
    title: "Notes / Comms / Activity",
    live: false,
    wave: 5,
    copy: "Coming in Wave 5. A communications hub is not LIVE. Profile notes and history remain on Information.",
  },
  {
    id: "admin-privacy",
    title: "Admin & Privacy",
    live: false,
    wave: 5,
    copy: "Coming in Wave 5. Consent, export, anonymise and unmerge are not available. VIP and status remain on Information.",
  },
] as const;

export type GuestProfileCardId = (typeof GUEST_PROFILE_CARDS)[number]["id"];

export function guestProfileCard(id: GuestProfileCardId) {
  return GUEST_PROFILE_CARDS.find((card) => card.id === id) ?? GUEST_PROFILE_CARDS[1];
}

export function defaultGuestProfileCard(hasGuest: boolean): GuestProfileCardId {
  return hasGuest ? "information" : "directory";
}

export function comingInWaveLabel(wave: number): string {
  return `Coming in Wave ${wave}`;
}
