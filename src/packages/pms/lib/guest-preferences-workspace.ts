/**
 * Individual Guest Preferences workspace helpers.
 * Catalogue: Card 4 categories/types. Values: guest_preference_values.
 * Contact defaults stay on guest_profiles.
 */

import type { PreferenceOption, PreferenceValueType } from "./preferences-card4.server.ts";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_TIME_LABELS,
  isPreferredContactMethod,
  isPreferredContactTime,
  type PreferredContactMethod,
  type PreferredContactTime,
} from "./guest-profile-overview.ts";

export const PREFERENCES_WORKSPACE_MIGRATION_FILE = "0088_pms_guest_preferences_workspace.sql";
export const PREFERENCES_COPY =
  "Manage guest preferences to provide a personalized stay experience.";
export const PREFERENCES_EMPTY_TYPES =
  "No guest preference types are currently configured.";
export const PREFERENCES_IMPORTANT_NOTE =
  "Guest preferences are not guaranteed and are subject to availability.";
export const PREFERENCES_APPLY_COPY =
  "Automatically apply these preferences to new reservations for this guest.";
export const CONTACT_DEFAULTS_TITLE = "Contact Defaults";
export const CONTACT_DEFAULTS_COPY =
  "Language and preferred contact live on the guest profile, not the preference catalogue.";
export const PREFERENCE_TEXT_MAX = 2000;
export const COMMUNICATION_CATEGORY_CODE = "COMM";

export type PreferenceValueMap = Record<string, string[]>;

export type ContactDefaultsDraft = {
  language: string;
  preferredContactMethod: PreferredContactMethod | "";
  preferredContactTime: PreferredContactTime | "";
};

export type PreferenceSummaryChip = {
  source: "catalogue" | "contact";
  code: string;
  label: string;
  value: string;
};

export function preferenceNeedsOptions(valueType: PreferenceValueType): boolean {
  return valueType === "single" || valueType === "multi";
}

export function normalizePreferenceAnswers(
  valueType: PreferenceValueType,
  values: string[],
): string[] {
  const cleaned = values.map((item) => item.trim()).filter(Boolean);
  if (valueType === "multi") {
    return [...new Set(cleaned)];
  }
  if (valueType === "yes_no") {
    const first = cleaned[0]?.toLowerCase();
    if (first === "yes" || first === "true" || first === "1") return ["yes"];
    if (first === "no" || first === "false" || first === "0") return ["no"];
    return [];
  }
  if (valueType === "number") {
    const first = cleaned[0];
    if (!first) return [];
    const n = Number(first);
    if (!Number.isFinite(n)) return [];
    return [String(n)];
  }
  return cleaned.slice(0, 1);
}

export function validatePreferenceAnswer(
  type: {
    name: string;
    valueType: PreferenceValueType;
    required: boolean;
    active: boolean;
    options: PreferenceOption[];
  },
  values: string[],
): string | null {
  const normalized = normalizePreferenceAnswers(type.valueType, values);
  if (type.required && type.active && normalized.length === 0) {
    return `${type.name} is required.`;
  }
  if (normalized.length === 0) return null;
  if (type.valueType === "text" && (normalized[0]?.length ?? 0) > PREFERENCE_TEXT_MAX) {
    return `${type.name} must be ${PREFERENCE_TEXT_MAX} characters or fewer.`;
  }
  if (type.valueType === "number") {
    const n = Number(normalized[0]);
    if (!Number.isFinite(n)) return `${type.name} must be a number.`;
  }
  if (type.valueType === "yes_no" && normalized[0] !== "yes" && normalized[0] !== "no") {
    return `${type.name} must be yes or no.`;
  }
  if (preferenceNeedsOptions(type.valueType)) {
    const allowed = new Set(
      type.options.filter((option) => option.active || normalized.includes(option.value)).map((option) => option.value),
    );
    if (normalized.some((value) => !allowed.has(value))) {
      return `${type.name} has an option that is no longer available.`;
    }
  }
  return null;
}

export function labelForPreferenceValues(
  options: PreferenceOption[],
  values: string[],
  valueType: PreferenceValueType,
): string | null {
  if (values.length === 0) return null;
  if (valueType === "yes_no") return values[0] === "yes" ? "Yes" : values[0] === "no" ? "No" : values[0] ?? null;
  if (!preferenceNeedsOptions(valueType)) return values.join(", ");
  return values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(", ");
}

export function contactDefaultChips(defaults: ContactDefaultsDraft): PreferenceSummaryChip[] {
  const chips: PreferenceSummaryChip[] = [];
  if (defaults.language.trim()) {
    chips.push({
      source: "contact",
      code: "PROFILE_LANGUAGE",
      label: "Preferred Language",
      value: defaults.language.trim(),
    });
  }
  if (defaults.preferredContactMethod && isPreferredContactMethod(defaults.preferredContactMethod)) {
    chips.push({
      source: "contact",
      code: "PROFILE_CONTACT_METHOD",
      label: "Preferred Contact Method",
      value: PREFERRED_CONTACT_METHOD_LABELS[defaults.preferredContactMethod],
    });
  }
  if (defaults.preferredContactTime && isPreferredContactTime(defaults.preferredContactTime)) {
    chips.push({
      source: "contact",
      code: "PROFILE_CONTACT_TIME",
      label: "Preferred Contact Time",
      value: PREFERRED_CONTACT_TIME_LABELS[defaults.preferredContactTime],
    });
  }
  return chips;
}

export function reservationDefaultsFromWorkspace(input: {
  applyToFutureReservations: boolean;
  answers: Array<{ code: string; valueType: PreferenceValueType; values: string[] }>;
  specialRequests: string | null;
  roomTypes: Array<{ id: string; code?: string | null; label: string }>;
}): { specialRequests: string | null; roomTypeId: string | null } {
  if (!input.applyToFutureReservations) {
    return { specialRequests: null, roomTypeId: null };
  }
  const texts = input.answers
    .filter((row) => row.valueType === "text")
    .flatMap((row) => row.values);
  const fromWave2 = (input.specialRequests ?? "").trim();
  const specialRequests = [...texts, fromWave2].filter(Boolean).join("\n") || null;
  const roomAnswer =
    input.answers.find((row) => row.code === "ROOM_TYPE" || row.code === "ROOM")?.values[0] ??
    input.answers.find((row) => row.code === "BED_TYPE")?.values[0] ??
    null;
  let roomTypeId: string | null = null;
  if (roomAnswer) {
    const match = input.roomTypes.find(
      (row) =>
        row.id === roomAnswer ||
        (row.code ?? "").toLowerCase() === roomAnswer.toLowerCase() ||
        row.label.toLowerCase() === roomAnswer.toLowerCase(),
    );
    roomTypeId = match?.id ?? null;
  }
  return { specialRequests, roomTypeId };
}
