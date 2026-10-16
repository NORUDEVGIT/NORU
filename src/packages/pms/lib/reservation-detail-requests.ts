import { REVIEW_ROOM_PREFERENCE_FLAGS } from "@/packages/pms/lib/create-reservation-review";
import {
  GUEST_SERVICE_STATUS_LABELS,
  isGuestServiceStatus,
  type GuestServiceStatus,
} from "@/packages/pms/lib/guest-services-workspace";
import type {
  GuestPreferences,
  GuestServiceHistoryItem,
  GuestServiceTypeOption,
} from "@/packages/pms/lib/guests.functions";
import {
  guestPreferenceChips,
  stayRequestPreferenceChips,
  type PreferenceChip,
} from "@/packages/pms/lib/reservation-detail-guest";
import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import { ROOM_ASSIGNMENT_PREFS } from "@/packages/pms/lib/reservation-detail-rooms";
import type { ReservationHistoryEntry } from "@/packages/pms/lib/reservations.functions";

export const REQUEST_NOTES_MAX = 500;

export const REQUEST_SECTION_TABS = [
  { id: "all", label: "All" },
  { id: "guest", label: "Guest Preferences" },
  { id: "service", label: "Service Requests" },
  { id: "room", label: "Room Preferences" },
  { id: "vip", label: "VIP & Special" },
  { id: "history", label: "History" },
] as const;

export type RequestSectionTab = (typeof REQUEST_SECTION_TABS)[number]["id"];

export type RequestHistoryEvent = {
  id: string;
  at: string;
  text: string;
  actor: string | null;
};

function extraRequestLines(specialRequests: string | null | undefined): string[] {
  return String(specialRequests ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      const flagged =
        REVIEW_ROOM_PREFERENCE_FLAGS.some(
          (flag) => lower === flag.label.toLowerCase() || lower.includes(flag.label.toLowerCase()),
        ) ||
        ROOM_ASSIGNMENT_PREFS.some((pref) =>
          pref.aliases.some((alias) => lower === alias || lower === pref.label.toLowerCase()),
        );
      return !flagged;
    });
}

export function guestProfilePreferenceChips(
  preferences: GuestPreferences | null | undefined,
): PreferenceChip[] {
  const chips = guestPreferenceChips(preferences);
  for (const line of extraRequestLines(preferences?.specialRequests)) {
    const key = line.toLowerCase();
    if (chips.some((chip) => chip.label.toLowerCase() === key)) continue;
    chips.push({ id: `profile-${key}`, label: line });
  }
  return chips;
}

export function reservationPreferenceChips(
  specialRequests: string | null | undefined,
): PreferenceChip[] {
  const chips = stayRequestPreferenceChips(specialRequests);
  for (const pref of ROOM_ASSIGNMENT_PREFS) {
    const hay = String(specialRequests ?? "").toLowerCase();
    if (!hay.trim()) continue;
    if (!pref.aliases.some((alias) => hay.includes(alias.toLowerCase()))) continue;
    if (
      chips.some(
        (chip) => chip.id === pref.id || chip.label.toLowerCase() === pref.label.toLowerCase(),
      )
    ) {
      continue;
    }
    chips.push({ id: pref.id, label: pref.label });
  }
  for (const line of extraRequestLines(specialRequests)) {
    if (chips.some((chip) => chip.label.toLowerCase() === line.toLowerCase())) continue;
    chips.push({ id: `stay-${line.toLowerCase()}`, label: line });
  }
  return chips;
}

export function roomPreferenceChips(specialRequests: string | null | undefined): PreferenceChip[] {
  const roomIds = new Set(ROOM_ASSIGNMENT_PREFS.map((pref) => pref.id));
  roomIds.add("high_floor");
  roomIds.add("quiet_room");
  roomIds.add("connecting_rooms");
  roomIds.add("non_smoking");
  return reservationPreferenceChips(specialRequests).filter(
    (chip) =>
      roomIds.has(chip.id) ||
      ROOM_ASSIGNMENT_PREFS.some((pref) => pref.label.toLowerCase() === chip.label.toLowerCase()),
  );
}

export function vipSpecialChips(input: {
  guestVip: boolean;
  specialRequests: string | null | undefined;
}): PreferenceChip[] {
  const chips: PreferenceChip[] = [];
  if (input.guestVip) chips.push({ id: "vip", label: "VIP" });
  for (const chip of stayRequestPreferenceChips(input.specialRequests)) {
    if (chip.id === "late_check_in" || chip.id === "early_check_in") chips.push(chip);
  }
  return chips;
}

export function reservationServiceRequests(
  items: GuestServiceHistoryItem[],
  reservationId: string,
): GuestServiceHistoryItem[] {
  return items.filter((item) => item.reservationId === reservationId);
}

export function filterServiceRequests(
  items: GuestServiceHistoryItem[],
  input: { status: GuestServiceStatus | "all"; search: string },
): GuestServiceHistoryItem[] {
  const search = input.search.trim().toLowerCase();
  return items.filter((item) => {
    if (input.status !== "all" && item.status !== input.status) return false;
    if (!search) return true;
    const hay = [item.requestNumber, item.serviceName, item.notes, item.assignedName, item.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(search);
  });
}

export function serviceCategoryLabel(
  item: GuestServiceHistoryItem,
  types: GuestServiceTypeOption[],
): string {
  return types.find((type) => type.id === item.serviceTypeId)?.categoryName?.trim() || "Service";
}

export function requestHistoryEvents(
  items: GuestServiceHistoryItem[],
  reservationHistory: ReservationHistoryEntry[],
): RequestHistoryEvent[] {
  const events: RequestHistoryEvent[] = [];
  for (const item of items) {
    events.push({
      id: `${item.id}-created`,
      at: item.requestedAt,
      text: `${item.serviceName} request created${item.notes ? `: ${item.notes}` : ""}`,
      actor: item.requestedByName,
    });
    if (item.completedAt) {
      events.push({
        id: `${item.id}-completed`,
        at: item.completedAt,
        text: `${item.serviceName} completed`,
        actor: item.assignedName ?? item.requestedByName,
      });
    }
    if (item.cancelledAt) {
      events.push({
        id: `${item.id}-cancelled`,
        at: item.cancelledAt,
        text: `${item.serviceName} cancelled`,
        actor: item.assignedName ?? item.requestedByName,
      });
    }
  }
  for (const entry of reservationHistory) {
    const changes = reservationHistoryChanges(entry.previousValues, entry.newValues).filter(
      (change) => ["special_requests", "notes"].includes(change.key),
    );
    if (changes.length === 0 && !/request|preference|note/i.test(entry.notes ?? "")) continue;
    if (changes.length === 0 && entry.eventType !== "amended") continue;
    const text =
      changes.length > 0
        ? changes.map((change) => `${change.key.replace(/_/g, " ")} updated`).join(" · ")
        : entry.notes?.trim() || entry.eventType.replace(/_/g, " ");
    events.push({
      id: entry.id,
      at: entry.createdAt,
      text,
      actor: entry.actorName,
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export function serviceStatusLabel(status: string): string {
  if (isGuestServiceStatus(status)) return GUEST_SERVICE_STATUS_LABELS[status];
  return status.replace(/_/g, " ");
}
