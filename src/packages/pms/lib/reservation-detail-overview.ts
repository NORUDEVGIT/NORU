import {
  isCardGuaranteeMethod,
  maskGuaranteePan,
  preferenceFlagFromRequests,
  reviewDash,
} from "@/packages/pms/lib/create-reservation-review";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import type { ReservationStatus } from "@/packages/pms/lib/reservations.server";

export const DETAIL_DASH = "—";
export const FOLIO_DEFERRED_COPY = "Folio is not available in this workspace yet.";
export const PACKAGES_DEFERRED_COPY = "Packages are not available in this workspace yet.";
export const COMMUNICATION_DEFERRED_COPY = "Communication is not available in this workspace yet.";
export const LINKED_DEFERRED_COPY = "Linked reservations are not available in this workspace yet.";

export type DetailWorkspaceTab =
  | "overview"
  | "stay"
  | "guest"
  | "rooms"
  | "rates"
  | "packages"
  | "folio"
  | "requests"
  | "notes"
  | "communication"
  | "linked"
  | "history";

export const DETAIL_SIDEBAR_ITEMS: Array<{
  id: DetailWorkspaceTab;
  label: string;
  deferred?: boolean;
}> = [
  { id: "overview", label: "Overview" },
  { id: "stay", label: "Stay" },
  { id: "guest", label: "Guest" },
  { id: "rooms", label: "Rooms" },
  { id: "rates", label: "Rates" },
  { id: "packages", label: "Packages" },
  { id: "folio", label: "Folio & Payments" },
  { id: "requests", label: "Requests & Preferences" },
  { id: "notes", label: "Notes & Traces" },
  { id: "communication", label: "Communication", deferred: true },
  { id: "linked", label: "Linked Reservations", deferred: true },
  { id: "history", label: "History" },
];

export type DetailDepositView = {
  required: boolean | null;
  amount: number | null;
  currency: string | null;
  name: string | null;
  tenderCode: string | null;
  type: string | null;
};

export function parseDepositRequirementSnapshot(raw: unknown): DetailDepositView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const amountRaw = row.computed_amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : amountRaw != null && amountRaw !== ""
        ? Number(amountRaw)
        : null;
  return {
    required: typeof row.required === "boolean" ? row.required : null,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency : null,
    name: typeof row.name === "string" && row.name.trim() ? row.name : null,
    tenderCode:
      typeof row.intended_tender_code === "string" && row.intended_tender_code.trim()
        ? row.intended_tender_code
        : null,
    type: typeof row.deposit_type === "string" && row.deposit_type.trim() ? row.deposit_type : null,
  };
}

export function snapshotDisplayName(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  for (const key of ["name", "label", "policy_name", "code", "title"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function snapshotField(raw: unknown, keys: string[]): string | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "boolean") return value ? "Yes" : "No";
  }
  return null;
}

export function arriveInLabel(arrivalDate: string, businessDate: string): string {
  if (!arrivalDate || !businessDate) return DETAIL_DASH;
  const arrival = Date.parse(`${arrivalDate}T00:00:00`);
  const business = Date.parse(`${businessDate}T00:00:00`);
  if (!Number.isFinite(arrival) || !Number.isFinite(business)) return DETAIL_DASH;
  const days = Math.round((arrival - business) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1 Day";
  if (days > 1) return `${days} Days`;
  return DETAIL_DASH;
}

export function stayStatusLabel(input: {
  status: ReservationStatus | string;
  arrivalDate: string;
  departureDate: string;
  businessDate: string;
}): string {
  const status = String(input.status);
  if (status === "cancelled") return "Cancelled";
  if (status === "checked_out") return "Departed";
  if (status === "no_show") return "No Show";
  if (status === "checked_in") {
    return input.departureDate <= input.businessDate ? "Due Out" : "In House";
  }
  if (status === "pending") return "Pending";
  if (status === "confirmed") {
    if (input.arrivalDate > input.businessDate) return "Due In";
    if (input.arrivalDate === input.businessDate) return "Arriving";
    if (input.departureDate <= input.businessDate) return "Due Out";
    return "Due In";
  }
  return status.replaceAll("_", " ") || DETAIL_DASH;
}

export function storedRatePerNight(
  nightlyRates: Array<{ rate: number }> | null | undefined,
  roomSubtotal: number | null | undefined,
  nights: number,
): number | null {
  const first = nightlyRates?.[0]?.rate;
  if (typeof first === "number" && Number.isFinite(first)) return first;
  if (roomSubtotal == null || nights <= 0) return null;
  const derived = roomSubtotal / nights;
  return Number.isFinite(derived) ? derived : null;
}

export function bookedByLabel(bookerGuestId: string | null | undefined, guestId: string): string {
  if (!bookerGuestId || bookerGuestId === guestId) return "Same as guest";
  return DETAIL_DASH;
}

export function channelLabel(
  source: string | null | undefined,
  salesChannel: string | null | undefined,
): string {
  const channel = reviewDash(salesChannel);
  if (channel !== DETAIL_DASH) return channel;
  if (source === "walk_in") return "Walk-in";
  return DETAIL_DASH;
}

export function sourceLabel(
  source: string | null | undefined,
  commercialBookingSource: string | null | undefined,
): string {
  const commercial = reviewDash(commercialBookingSource);
  if (commercial !== DETAIL_DASH) return commercial;
  if (source === "staff") return "Staff";
  if (source === "walk_in") return "Walk-in";
  return reviewDash(source);
}

export function depositStatusLabel(deposit: DetailDepositView | null): string {
  if (!deposit) return DETAIL_DASH;
  if (deposit.required === false) return "Not required";
  if (deposit.required === true) return "Required";
  return DETAIL_DASH;
}

export function detailGuaranteeCardNumber(method: string | null | undefined): string {
  if (!isCardGuaranteeMethod(method)) return DETAIL_DASH;
  return maskGuaranteePan(null);
}

export function preferenceFromStay(
  specialRequests: string | null | undefined,
  label: string,
): string {
  return preferenceFlagFromRequests(specialRequests, label);
}

export function reservationTags(input: {
  guestVip: boolean;
  marketSegment: string | null | undefined;
  source: string | null | undefined;
}): string[] {
  const tags: string[] = [];
  if (input.guestVip) tags.push("VIP");
  const segment = input.marketSegment?.trim();
  if (segment) tags.push(segment);
  if (input.source === "walk_in") tags.push("Walk-in");
  return tags;
}

export type ReservationDetailOverviewInput = ReservationDetail & {
  infants?: number | null;
  roomsRequested?: number | null;
  purposeOfStay?: string | null;
  salesChannel?: string | null;
  depositRequirementSnapshot?: unknown;
  cancellationPolicySnapshot?: unknown;
  refundabilitySnapshot?: unknown;
  bookerGuestId?: string | null;
  lateCheckoutGranted?: boolean | null;
  createdByName?: string | null;
};
