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

/** Joins quote inclusion labels already loaded for the stay. Does not price anything. */
export function reviewIncludedItems(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of parts) {
    for (const piece of String(part ?? "").split("·")) {
      const text = piece.trim();
      if (!text || text === "—" || text === "Not included") continue;
      const label = text === "Included" ? "Breakfast included" : text;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(label);
    }
  }
  return items.length > 0 ? items.join(" · ") : null;
}

/** Mirrors the Step 3 refundability title. Partial kinds keep the catalogue name. */
export function reviewRefundabilityCopy(
  kind: string | null | undefined,
  label: string | null | undefined,
): string | null {
  const name = label?.trim() && label.trim() !== "—" ? label.trim() : "";
  const title =
    kind === "non_refundable" ? "Non-refundable" : kind === "refundable" ? "Refundable" : name;
  if (!title) return null;
  return name && name !== title ? `${title} · ${name}` : title;
}

export function reviewNoShowCopy(
  name: string | null | undefined,
  penalty: string | null | undefined,
): string | null {
  const policy = name?.trim() && name.trim() !== "—" ? name.trim() : "";
  const result = penalty?.trim() ?? "";
  if (!policy && !result) return null;
  if (policy && result) return `${policy} · ${result}`;
  return policy || result;
}

export const CREATE_REVIEW_STEPS = {
  guestStayAvailability: 0,
  bookingDetails: 1,
  policies: 2,
  review: 3,
} as const;
