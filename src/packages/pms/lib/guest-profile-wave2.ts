/**
 * Guest Profile Module — Wave 2 helpers (identity mask, preference encoding, consent).
 *
 * Presentation + encoding only. Persistence stays on guest_profiles /
 * guest_preferences / guest_documents via guests.functions — no second store.
 *
 * HONESTY: catalogue-backed preference values are stored in the existing
 * eight text columns as `id:<uuid>` or `other:<text>`. That is a documented
 * prefix convention, not a Setup foreign key. Legacy free-text is treated as
 * Other unless it matches a current option id or label.
 */

export const GUEST_DOCUMENT_KINDS = [
  "passport",
  "national_id",
  "driving_licence",
  "visa",
  "supporting",
  "other",
] as const;
export type GuestDocumentKind = (typeof GUEST_DOCUMENT_KINDS)[number];

export const GUEST_DOCUMENT_KIND_LABELS: Record<GuestDocumentKind, string> = {
  passport: "Passport",
  national_id: "National ID",
  driving_licence: "Driving licence",
  visa: "Visa",
  supporting: "Supporting document",
  other: "Other",
};

export const GUEST_DOCUMENT_STATUSES = ["unverified", "verified", "rejected"] as const;
export type GuestDocumentStatus = (typeof GUEST_DOCUMENT_STATUSES)[number];

export const GUEST_DOCUMENT_STATUS_LABELS: Record<GuestDocumentStatus, string> = {
  unverified: "Unverified",
  verified: "Staff verified",
  rejected: "Rejected",
};

export const GUEST_CONSENT_STATES = ["granted", "refused", "not_asked"] as const;
export type GuestConsentState = (typeof GUEST_CONSENT_STATES)[number];

export const GUEST_CONSENT_LABELS: Record<GuestConsentState, string> = {
  granted: "Granted",
  refused: "Refused",
  not_asked: "Not asked",
};

export const PREFERENCE_OPTION_CATEGORIES = ["bed", "view", "food", "communication"] as const;
export type PreferenceOptionCategory = (typeof PREFERENCE_OPTION_CATEGORIES)[number];

export const PREFERENCE_OPTION_CATEGORY_LABELS: Record<PreferenceOptionCategory, string> = {
  bed: "Bed",
  view: "View",
  food: "Food",
  communication: "Communication",
};

export const PREFERENCE_SETUP_HREF = "/restaurant/settings#guest-profile";
export const PREFERENCE_ROOMS_HREF = "/restaurant/settings#rooms";
export const PREFERENCE_FLOORS_HREF = "/restaurant/settings#structure";

export const WAVE2_MIGRATION_UNAVAILABLE =
  "Unavailable until Guest Profile Wave 2 migration 0051 is applied.";

export const STAFF_VERIFY_COPY =
  "Staff confirmation only. This is not government verification or KYC.";

export type PreferenceSelection =
  { kind: "empty" } | { kind: "id"; id: string } | { kind: "other"; otherText: string };

export type PreferenceOption = {
  id: string;
  label: string;
};

/** Mask an ID number for ordinary Directory / Information views. */
export function maskIdNumber(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "••••";
  return `•••• ${trimmed.slice(-4)}`;
}

export function encodePreferenceValue(selection: PreferenceSelection): string | null {
  if (selection.kind === "empty") return null;
  if (selection.kind === "id") {
    const id = selection.id.trim();
    return id ? `id:${id}` : null;
  }
  const text = selection.otherText.trim();
  return text ? `other:${text}` : null;
}

export function decodePreferenceValue(
  stored: string | null | undefined,
): PreferenceSelection | { kind: "legacy"; text: string } {
  const value = (stored ?? "").trim();
  if (!value) return { kind: "empty" };
  if (value.startsWith("id:")) {
    const id = value.slice(3).trim();
    return id ? { kind: "id", id } : { kind: "empty" };
  }
  if (value.startsWith("other:")) {
    return { kind: "other", otherText: value.slice(6) };
  }
  return { kind: "legacy", text: value };
}

/**
 * Map a stored preference string onto the current Setup list.
 * Unmatched legacy free-text becomes Other (AC-W2-11 / Wave 2 honesty).
 */
export function resolvePreferenceSelection(
  stored: string | null | undefined,
  options: PreferenceOption[],
): PreferenceSelection {
  const decoded = decodePreferenceValue(stored);
  if (decoded.kind === "empty") return { kind: "empty" };
  if (decoded.kind === "id") {
    if (options.some((option) => option.id === decoded.id)) return decoded;
    return { kind: "other", otherText: stored ?? "" };
  }
  if (decoded.kind === "other") return decoded;
  const needle = decoded.text.toLowerCase();
  const match = options.find(
    (option) => option.id === decoded.text || option.label.toLowerCase() === needle,
  );
  if (match) return { kind: "id", id: match.id };
  return { kind: "other", otherText: decoded.text };
}

export function preferenceDisplayLabel(
  stored: string | null | undefined,
  options: PreferenceOption[],
): string | null {
  const selection = resolvePreferenceSelection(stored, options);
  if (selection.kind === "empty") return null;
  if (selection.kind === "id") {
    return options.find((option) => option.id === selection.id)?.label ?? stored ?? null;
  }
  return selection.otherText.trim() || null;
}

export function emptyConsent(state: GuestConsentState = "not_asked"): {
  state: GuestConsentState;
  recordedAt: string | null;
  recordedByName: string | null;
} {
  return { state, recordedAt: null, recordedByName: null };
}

export function consentGuidanceFromDefault(defaultGranted: boolean): GuestConsentState {
  return defaultGranted ? "granted" : "refused";
}
