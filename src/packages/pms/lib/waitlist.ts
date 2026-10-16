export const WAITLIST_REQUEST_STATUSES = [
  "open",
  "offered",
  "accepted",
  "converted",
  "cancelled",
] as const;
export type WaitlistRequestStatus = (typeof WAITLIST_REQUEST_STATUSES)[number];

export const WAITLIST_DISPLAY_STATUSES = [
  ...WAITLIST_REQUEST_STATUSES,
  "expired",
] as const;
export type WaitlistDisplayStatus = (typeof WAITLIST_DISPLAY_STATUSES)[number];

export const WAITLIST_OFFER_STATUSES = ["pending", "accepted", "declined", "cancelled"] as const;
export type WaitlistOfferStatus = (typeof WAITLIST_OFFER_STATUSES)[number];

export type WaitlistOfferDisplayStatus = WaitlistOfferStatus | "expired";

export const WAITLIST_REQUEST_TRANSITIONS: Record<WaitlistRequestStatus, readonly WaitlistRequestStatus[]> = {
  open: ["offered", "cancelled"],
  offered: ["open", "accepted", "cancelled"],
  accepted: ["converted", "open", "cancelled"],
  converted: [],
  cancelled: ["open"],
};

export type WaitlistOfferSnapshot = {
  status: string;
  expiresAt: string;
};

export function isAllowedWaitlistRequestTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (!(WAITLIST_REQUEST_STATUSES as readonly string[]).includes(from)) return false;
  if (!(WAITLIST_REQUEST_STATUSES as readonly string[]).includes(to)) return false;
  return WAITLIST_REQUEST_TRANSITIONS[from as WaitlistRequestStatus].includes(to as WaitlistRequestStatus);
}

export function effectiveOfferStatus(
  offer: WaitlistOfferSnapshot,
  nowIso = new Date().toISOString(),
): WaitlistOfferDisplayStatus {
  if (offer.status === "pending" && offer.expiresAt <= nowIso) return "expired";
  if ((WAITLIST_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return offer.status as WaitlistOfferStatus;
  }
  return "cancelled";
}

export function deriveWaitlistRequestStatus(
  stored: string,
  offers: WaitlistOfferSnapshot[],
  reservationId: string | null,
  nowIso = new Date().toISOString(),
): WaitlistDisplayStatus {
  if (reservationId || stored === "converted") return "converted";
  if (stored === "cancelled") return "cancelled";
  const effective = offers.map((offer) => effectiveOfferStatus(offer, nowIso));
  if (effective.includes("accepted")) return "accepted";
  if (effective.includes("pending")) return "offered";
  if (effective.includes("expired")) return "expired";
  return "open";
}

export function waitlistWorkspaceSectionFromTab(tab: string | undefined): boolean {
  return tab === "waitlist";
}

export function waitlistWorkspaceKpis(
  rows: Array<{ displayStatus: string }>,
): {
  total: number;
  open: number;
  offered: number;
  expired: number;
  converted: number;
} {
  return {
    total: rows.length,
    open: rows.filter((row) => row.displayStatus === "open").length,
    offered: rows.filter((row) => row.displayStatus === "offered").length,
    expired: rows.filter((row) => row.displayStatus === "expired").length,
    converted: rows.filter((row) => row.displayStatus === "converted").length,
  };
}

export function defaultOfferExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function occupancyFits(adults: number, children: number, maxOccupancy: number | null): boolean {
  if (maxOccupancy == null) return true;
  return adults + children <= maxOccupancy;
}

export type WaitlistOfferRead = {
  id: string;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: string;
  roomTypeName: string | null;
  ratePlanId: string | null;
  quotedTotal: number | null;
  quotedCurrency: string | null;
  expiresAt: string;
  storedStatus: string;
  displayStatus: string;
  createdAt: string;
};

export type WaitlistRequestRead = {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  requestedRoomTypeId: string | null;
  requestedRoomTypeName: string | null;
  alternateRoomTypeIds: string[];
  flexibleDates: boolean;
  priority: number;
  storedStatus: string;
  displayStatus: WaitlistDisplayStatus;
  notes: string | null;
  reservationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WaitlistListRow = WaitlistRequestRead & {
  liveOfferExpiresAt: string | null;
};

export type WaitlistHistoryEvent = {
  id: string;
  event_type: string;
  previous_values: string | null;
  new_values: string | null;
  notes: string | null;
  created_at: string;
  actor_membership_id: string | null;
};

export type WaitlistDetail = {
  request: WaitlistRequestRead;
  offers: WaitlistOfferRead[];
  history: WaitlistHistoryEvent[];
};

export type WaitlistMatchQuote = {
  ratePlanId: string;
  code: string;
  name: string;
  subtotal: number;
  currency: string;
  unavailableReason: string | null;
};

export type WaitlistMatchCandidate = {
  roomTypeId: string;
  code: string;
  name: string;
  available: number;
  occupancyFits: boolean;
  requested: boolean;
  alternate: boolean;
  quotes: WaitlistMatchQuote[];
};

export type WaitlistRequestRow = {
  id: string;
  confirmation_number: string;
  guest_id: string;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  requested_room_type_id: string | null;
  alternate_room_type_ids: string[] | null;
  flexible_dates: boolean;
  priority: number;
  status: string;
  notes: string | null;
  reservation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WaitlistOfferRow = {
  id: string;
  waitlist_request_id: string;
  arrival_date: string;
  departure_date: string;
  room_type_id: string;
  rate_plan_id: string | null;
  quoted_total: number | string | null;
  quoted_currency: string | null;
  expires_at: string;
  status: string;
  created_at: string;
};
