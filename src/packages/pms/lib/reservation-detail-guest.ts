import { REVIEW_ROOM_PREFERENCE_FLAGS } from "@/packages/pms/lib/create-reservation-review";
import { decodePreferenceValue } from "@/packages/pms/lib/guest-profile-wave2";
import {
  formatGuestAddress,
  isPreferredContactMethod,
  PREFERRED_CONTACT_METHODS,
  type PreferredContactMethod,
} from "@/packages/pms/lib/guest-profile-overview";
import { GUEST_GENDER_LABELS, isGuestGender } from "@/packages/pms/lib/guest-profile-individual";
import type { GuestPreferences, GuestProfile } from "@/packages/pms/lib/guests.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

export const GUEST_NOTES_MAX = 500;

export const GUEST_TYPE_OPTIONS = [
  { value: "individual", label: "Individual Guest" },
  { value: "company", label: "Company Guest" },
  { value: "travel_agent", label: "Travel Agent Guest" },
] as const;

export type ReservationGuestKind = (typeof GUEST_TYPE_OPTIONS)[number]["value"];

export const ACCOMPANYING_RELATIONSHIP_OPTIONS = [
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "colleague", label: "Colleague" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
] as const;

export type AccompanyingGuestDraft = {
  id: string;
  name: string;
  relationship: string;
  age: string;
  gender: string;
  nationality?: string;
  dateOfBirth?: string;
  idDocumentType?: string;
  idPassport: string;
  contact: string;
  phone?: string;
  email?: string;
  status: "local" | "stored";
  reservationRoomId?: string;
};

export type PreferenceChip = {
  id: string;
  label: string;
};

export type ReservationGuestDraft = {
  preferredContactMethod: PreferredContactMethod | "";
  sendConfirmation: boolean;
  sendMarketing: boolean;
  guestType: ReservationGuestKind;
  specialRequests: string;
  guestNotes: string;
  accompanying: AccompanyingGuestDraft[];
};

const PREFERENCE_FIELDS: Array<{
  key: keyof GuestPreferences;
  label: string;
}> = [
  { key: "floorPreference", label: "Floor" },
  { key: "roomPreference", label: "Room" },
  { key: "bedPreference", label: "Bed" },
  { key: "viewPreference", label: "View" },
  { key: "foodPreference", label: "Food" },
  { key: "communicationPreference", label: "Communication" },
  { key: "accessibilityRequirements", label: "Accessibility" },
];

export function reservationGuestKind(reservation: ReservationDetail): ReservationGuestKind {
  if (reservation.travelAgentMasterId) return "travel_agent";
  if (reservation.companyMasterId) return "company";
  return "individual";
}

export function preferenceStoredLabel(stored: string | null | undefined): string | null {
  const decoded = decodePreferenceValue(stored);
  if (decoded.kind === "empty") return null;
  if (decoded.kind === "other") return decoded.otherText.trim() || null;
  if (decoded.kind === "legacy") return decoded.text.trim() || null;
  return null;
}

export function guestPreferenceChips(
  preferences: GuestPreferences | null | undefined,
): PreferenceChip[] {
  if (!preferences) return [];
  const chips: PreferenceChip[] = [];
  for (const field of PREFERENCE_FIELDS) {
    const value = preferenceStoredLabel(preferences[field.key] as string | null);
    if (!value) continue;
    chips.push({ id: field.key, label: `${field.label}: ${value}` });
  }
  if (preferences.smokingAllowed === false) {
    chips.push({ id: "non_smoking", label: "Non-smoking Room" });
  } else if (preferences.smokingAllowed === true) {
    chips.push({ id: "smoking", label: "Smoking Room" });
  }
  return chips;
}

export function stayRequestPreferenceChips(
  specialRequests: string | null | undefined,
): PreferenceChip[] {
  const chips: PreferenceChip[] = [];
  for (const flag of REVIEW_ROOM_PREFERENCE_FLAGS) {
    const hay = String(specialRequests ?? "").toLowerCase();
    if (!hay.trim()) continue;
    if (hay.includes(flag.label.toLowerCase()) || hay.includes(flag.id.replace(/_/g, " "))) {
      chips.push({ id: flag.id, label: flag.label });
    }
  }
  return chips;
}

export function mergedPreferenceChips(
  preferences: GuestPreferences | null | undefined,
  specialRequests: string | null | undefined,
): PreferenceChip[] {
  const seen = new Set<string>();
  const chips: PreferenceChip[] = [];
  for (const chip of [
    ...guestPreferenceChips(preferences),
    ...stayRequestPreferenceChips(specialRequests),
  ]) {
    const key = chip.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(chip);
  }
  return chips;
}

export function guestLocationLabel(guest: GuestProfile | null | undefined): string | null {
  if (!guest) return null;
  const parts = [guest.city, guest.region, guest.country]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function guestAddressLabel(guest: GuestProfile | null | undefined): string | null {
  if (!guest) return null;
  return formatGuestAddress({
    addressLine1: guest.addressLine1,
    addressLine2: guest.addressLine2,
    city: guest.city,
    region: guest.region,
    country: guest.country,
    postalCode: guest.postalCode,
  });
}

export function guestGenderLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isGuestGender(value)) return GUEST_GENDER_LABELS[value];
  return value.trim() || null;
}

export function contactMethodLabel(value: string | null | undefined): string {
  if (value && isPreferredContactMethod(value)) {
    return value === "email"
      ? "Email"
      : value === "phone"
        ? "Phone"
        : value === "sms"
          ? "SMS"
          : "In-app";
  }
  return "";
}

export function marketingGranted(guest: GuestProfile | null | undefined): boolean {
  return guest?.consent.marketing.state === "granted";
}

export function buildGuestDraft(
  reservation: ReservationDetail,
  guest: GuestProfile | null | undefined,
): ReservationGuestDraft {
  const method = guest?.preferredContactMethod;
  return {
    preferredContactMethod: method && isPreferredContactMethod(method) ? method : "",
    sendConfirmation: false,
    sendMarketing: marketingGranted(guest),
    guestType: reservationGuestKind(reservation),
    specialRequests: reservation.specialRequests ?? "",
    guestNotes: reservation.notes ?? "",
    accompanying: accompanyingFromReservation(reservation),
  };
}

export function emptyAccompanyingGuest(): AccompanyingGuestDraft {
  return {
    id: `local-${Date.now()}`,
    name: "",
    relationship: "",
    age: "",
    gender: "",
    idPassport: "",
    contact: "",
    status: "local",
  };
}

export function accompanyingRelationshipLabel(value: string): string {
  return ACCOMPANYING_RELATIONSHIP_OPTIONS.find((row) => row.value === value)?.label ?? value;
}

export const CONTACT_METHOD_OPTIONS = PREFERRED_CONTACT_METHODS.map((value) => ({
  value,
  label: contactMethodLabel(value) || value,
}));

const COMPANION_MARKER = "[stay-companion]";

export function splitCompanionName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

export function companionGender(value: string): "female" | "male" | "other" | "unspecified" | null {
  const normalized = value.trim().toLowerCase();
  if (!isGuestGender(normalized)) return null;
  return normalized;
}

export function companionProfileNotes(
  relationship: string,
  age: string,
  existing: string | null | undefined,
): string | null {
  const base = (existing ?? "").replace(/\n?\[stay-companion\][^\n]*/g, "").trim();
  const line = `${COMPANION_MARKER} relationship=${relationship.trim()}; age=${age.trim()}`;
  const next = [base, line].filter(Boolean).join("\n");
  return next || null;
}

export function parseCompanionNote(notes: string | null | undefined): {
  relationship: string;
  age: string;
} {
  const match = notes?.match(/\[stay-companion\]\s*relationship=([^;]*);\s*age=([^\n]*)/);
  return {
    relationship: match?.[1]?.trim() ?? "",
    age: match?.[2]?.trim() ?? "",
  };
}

export function stayRoomUnitId(reservation: ReservationDetail): string | null {
  const units = reservation.rooms ?? [];
  const open = units.find(
    (unit) =>
      unit.status !== "cancelled" && unit.status !== "checked_out" && unit.status !== "no_show",
  );
  return (open ?? units[0])?.id ?? null;
}

export function accompanyingFromReservation(
  reservation: ReservationDetail,
): AccompanyingGuestDraft[] {
  const rows: AccompanyingGuestDraft[] = [];
  for (const unit of reservation.rooms ?? []) {
    for (const occupant of unit.occupants) {
      if (occupant.isPrimary || occupant.guestId === reservation.guestId) continue;
      const meta = parseCompanionNote(occupant.notes);
      rows.push({
        id: occupant.guestId,
        name: occupant.name,
        relationship: meta.relationship,
        age: meta.age,
        gender: occupant.gender ?? "",
        nationality: occupant.nationality ?? "",
        dateOfBirth: occupant.dateOfBirth ?? "",
        idDocumentType: occupant.idDocumentType ?? "",
        idPassport: occupant.idDocumentNumber ?? "",
        contact: occupant.phone ?? occupant.email ?? "",
        phone: occupant.phone ?? "",
        email: occupant.email ?? "",
        status: "stored",
        reservationRoomId: unit.id,
      });
    }
  }
  return rows;
}
