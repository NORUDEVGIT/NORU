/**
 * Individual Guest Overview helpers — compose existing stores.
 * Revenue and outstanding stay labeled placeholders. No points, tags, or
 * recent-activity feed on this surface.
 */

import { decodePreferenceValue } from "./guest-profile-wave2.ts";
import { OCCUPIED_STAY_STATUSES, type GuestStay } from "./guest-profile-wave3.ts";

export type OverviewPreferenceSource = {
  roomPreference: string | null;
  bedPreference: string | null;
  floorPreference: string | null;
  viewPreference: string | null;
  foodPreference: string | null;
  communicationPreference: string | null;
  accessibilityRequirements: string | null;
  specialRequests: string | null;
};

export const OVERVIEW_MIGRATION_FILE = "0086_pms_guest_overview.sql";

export const OVERVIEW_REVENUE_PLACEHOLDER = "Placeholder until Revenue is implemented.";
export const OVERVIEW_BALANCE_PLACEHOLDER =
  "Placeholder until Financial functionality is implemented.";
export const OVERVIEW_SERVICE_EMPTY =
  "No guest service records yet. Service history is stored only when a real service is recorded.";
export const OVERVIEW_SERVICE_UNAVAILABLE =
  "Service history is not recorded yet for this property.";
export const OVERVIEW_UPCOMING_EMPTY = "No upcoming reservation for this guest.";
export const OVERVIEW_NOTES_EMPTY = "No notes recorded yet for this guest.";
export const OVERVIEW_PREFERENCES_EMPTY = "No preferences recorded yet for this guest.";
export const OVERVIEW_LOYALTY_COPY =
  "Stay counts, nights and stored folio amounts only. There is no points balance.";
export const OVERVIEW_FINANCIAL_COPY =
  "Financial summary is a placeholder until Revenue and outstanding balance are implemented.";
export const OVERVIEW_RATE_PLAN_UNAVAILABLE = "Not stored on this stay.";
export const OVERVIEW_TAGS_DEFERRED =
  "Guest tags are not part of this Overview. No tag catalogue is shown here.";

export function canStartReservationForRole(role: string): boolean {
  return role === "owner" || role === "manager" || role === "receptionist";
}

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "sms", "in_app"] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export const PREFERRED_CONTACT_METHOD_LABELS: Record<PreferredContactMethod, string> = {
  email: "Email",
  phone: "Phone",
  sms: "SMS",
  in_app: "In-app",
};

export const PREFERRED_CONTACT_TIMES = ["morning", "afternoon", "evening", "anytime"] as const;
export type PreferredContactTime = (typeof PREFERRED_CONTACT_TIMES)[number];

export const PREFERRED_CONTACT_TIME_LABELS: Record<PreferredContactTime, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

export const WAVE2_TO_CARD4_PREF_CODE: Record<keyof OverviewPreferenceSource, string | null> = {
  roomPreference: "ROOM_TYPE",
  bedPreference: "BED_TYPE",
  floorPreference: "FLOOR",
  viewPreference: "VIEW",
  foodPreference: "DIET_REST",
  communicationPreference: "LANG",
  accessibilityRequirements: null,
  specialRequests: null,
};

export type OverviewPreferenceChip = {
  code: string;
  label: string;
  value: string;
  active: boolean;
};

export function isPreferredContactMethod(value: string): value is PreferredContactMethod {
  return (PREFERRED_CONTACT_METHODS as readonly string[]).includes(value);
}

export function isPreferredContactTime(value: string): value is PreferredContactTime {
  return (PREFERRED_CONTACT_TIMES as readonly string[]).includes(value);
}

export function formatGuestAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
}): string | null {
  const lines = [
    parts.addressLine1,
    parts.addressLine2,
    [parts.city, parts.region, parts.postalCode].filter(Boolean).join(", ") || null,
    parts.country,
  ]
    .map((item) => (item ?? "").trim())
    .filter(Boolean);
  return lines.length ? lines.join(" · ") : null;
}

export function guestInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export function formatPreferenceStoredValue(
  stored: string | null | undefined,
  options: Array<{ id: string; label: string }>,
): string | null {
  const decoded = decodePreferenceValue(stored);
  if (decoded.kind === "empty") return null;
  if (decoded.kind === "id") {
    return options.find((option) => option.id === decoded.id)?.label ?? decoded.id;
  }
  if (decoded.kind === "other") return decoded.otherText || null;
  return decoded.text || null;
}

export function wave2PreferenceChips(
  preferences: OverviewPreferenceSource,
  labels: Partial<Record<keyof OverviewPreferenceSource, string>>,
  resolve: (key: keyof OverviewPreferenceSource, stored: string | null) => string | null,
): OverviewPreferenceChip[] {
  const keys: Array<keyof OverviewPreferenceSource> = [
    "roomPreference",
    "bedPreference",
    "floorPreference",
    "viewPreference",
    "foodPreference",
    "communicationPreference",
  ];
  const chips: OverviewPreferenceChip[] = [];
  for (const key of keys) {
    const value = resolve(key, preferences[key]);
    if (!value) continue;
    chips.push({
      code: WAVE2_TO_CARD4_PREF_CODE[key] ?? key,
      label: labels[key] ?? key,
      value,
      active: true,
    });
  }
  if (preferences.accessibilityRequirements?.trim()) {
    chips.push({
      code: "ACCESS",
      label: "Accessibility",
      value: preferences.accessibilityRequirements.trim(),
      active: true,
    });
  }
  if (preferences.specialRequests?.trim()) {
    chips.push({
      code: "SPECIAL",
      label: "Special requests",
      value: preferences.specialRequests.trim(),
      active: true,
    });
  }
  return chips;
}

export function occupiedStayHistory(stays: GuestStay[]): GuestStay[] {
  return stays.filter((stay) =>
    (OCCUPIED_STAY_STATUSES as readonly string[]).includes(stay.status),
  );
}
