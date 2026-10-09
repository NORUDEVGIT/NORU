export const REVIEW_DASH = "—";

export const REVIEW_ROOM_PREFERENCE_FLAGS = [
  { id: "high_floor", label: "High Floor" },
  { id: "non_smoking", label: "Non-Smoking" },
  { id: "quiet_room", label: "Quiet Room" },
  { id: "connecting_rooms", label: "Connecting Rooms" },
  { id: "late_check_in", label: "Late Check-In" },
  { id: "early_check_in", label: "Early Check-In" },
] as const;

export function reviewDash(value: string | number | null | undefined): string {
  if (value == null) return REVIEW_DASH;
  const text = String(value).trim();
  return text ? text : REVIEW_DASH;
}

export function guestInitials(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "—";
}

/** Display-only PAN mask. Never returns the raw number or a CVV. */
export function maskGuaranteePan(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return REVIEW_DASH;
  const last4 = digits.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

export function isCardGuaranteeMethod(method: string | null | undefined): boolean {
  return /card/i.test(String(method ?? ""));
}

export function preferenceFlagFromRequests(
  specialRequests: string | null | undefined,
  label: string,
): string {
  const hay = String(specialRequests ?? "").toLowerCase();
  if (!hay.trim()) return REVIEW_DASH;
  return hay.includes(label.toLowerCase()) ? "Yes" : REVIEW_DASH;
}

export function yesNoFromBoolean(value: boolean | null | undefined): string {
  if (value == null) return REVIEW_DASH;
  return value ? "Yes" : "No";
}

export const CREATE_REVIEW_STEPS = {
  guestStayAvailability: 0,
  bookingDetails: 1,
  policies: 2,
  review: 3,
} as const;
