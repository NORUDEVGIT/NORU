/**
 * FO-FS4 — Amendments depth (pure).
 *
 * Shared Confirm / reason / Before→After honesty. Never invent package or
 * rate math. Never treat permission denied as Coming soon.
 */

export const REASON_MIN_CHARS = 3;
export const RATE_IMPACT_UNAVAILABLE = "Rate impact unavailable";
export const OCCUPANCY_EXCEEDED =
  "Adults and children together exceed this room type's maximum occupancy.";
export const GUEST_REQUESTS_UNAVAILABLE =
  "Guest requests are not available until migration 0043 is applied.";
export const SPECIAL_REQUEST_CATEGORY_UNAVAILABLE =
  "Special request category is not available until migration 0043 is applied.";
export const COMPANIONS_DEFERRED = "Named extra companions are not available in this wave.";
export const SERVICE_ZERO_NO_POST = "Amount 0 is recorded on the stay only — nothing is posted to the folio.";

export const SPECIAL_REQUEST_CATEGORIES = ["bed", "diet", "accessibility", "other"] as const;
export type SpecialRequestCategory = (typeof SPECIAL_REQUEST_CATEGORIES)[number];

export const SPECIAL_REQUEST_CATEGORY_LABELS: Record<SpecialRequestCategory, string> = {
  bed: "Bed",
  diet: "Diet",
  accessibility: "Accessibility",
  other: "Other",
};

export const GUEST_REQUEST_STATUSES = ["open", "done"] as const;
export type GuestRequestStatus = (typeof GUEST_REQUEST_STATUSES)[number];

export function isReasonComplete(reason: string): boolean {
  return reason.trim().length >= REASON_MIN_CHARS;
}

export function isRequestTextComplete(text: string): boolean {
  return text.trim().length >= REASON_MIN_CHARS;
}

export function canConfirmAmend(input: { formValid: boolean; reasonOk: boolean }): boolean {
  return input.formValid && input.reasonOk;
}

export function occupancyTotal(adults: number, children: number): number {
  return Math.max(0, adults) + Math.max(0, children);
}

export function occupancyExceeded(adults: number, children: number, maxOccupancy: number): boolean {
  if (!Number.isFinite(maxOccupancy) || maxOccupancy <= 0) return false;
  return occupancyTotal(adults, children) > maxOccupancy;
}

export function occupancyBlockMessage(adults: number, children: number, maxOccupancy: number): string | null {
  if (!occupancyExceeded(adults, children, maxOccupancy)) return null;
  return `${OCCUPANCY_EXCEEDED} (${occupancyTotal(adults, children)} of ${maxOccupancy}).`;
}

export function hasPersistedRate(input: {
  roomSubtotal?: number | null;
  nightlyRates?: Array<{ date: string; rate: number }> | null;
}): boolean {
  const subtotal = input.roomSubtotal;
  if (subtotal != null && Number.isFinite(subtotal) && subtotal > 0) return true;
  return (input.nightlyRates ?? []).some((n) => Number.isFinite(n.rate) && n.rate > 0);
}

export type RateImpact =
  | { kind: "available"; previous: number; next: number | null }
  | { kind: "unavailable"; label: typeof RATE_IMPACT_UNAVAILABLE };

export function rateImpact(input: {
  roomSubtotal?: number | null;
  nightlyRates?: Array<{ date: string; rate: number }> | null;
  nextRoomSubtotal?: number | null;
}): RateImpact {
  if (!hasPersistedRate(input)) {
    return { kind: "unavailable", label: RATE_IMPACT_UNAVAILABLE };
  }
  const previous = input.roomSubtotal != null && Number.isFinite(input.roomSubtotal) ? input.roomSubtotal : null;
  const nightly = (input.nightlyRates ?? []).find((n) => Number.isFinite(n.rate) && n.rate > 0);
  const prev = previous ?? nightly?.rate ?? null;
  if (prev == null) return { kind: "unavailable", label: RATE_IMPACT_UNAVAILABLE };
  const next =
    input.nextRoomSubtotal != null && Number.isFinite(input.nextRoomSubtotal) ? input.nextRoomSubtotal : null;
  return { kind: "available", previous: prev, next };
}

export function serviceAmountAllowed(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}

export function servicePostsToFolio(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

export function serviceLineTotal(amount: number, quantity: number): number {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  return Math.round(amount * qty * 100) / 100;
}

export function targetRoomRequired(input: { status: string; roomId: string | null }): boolean {
  return input.status === "checked_in" || !!input.roomId;
}

export function isRoomStatusAssignable(status: string | null | undefined): boolean {
  return status === "available";
}

export function upgradeRoomBlocked(room: {
  status: string | null;
  housekeepingStatus?: string | null;
} | null): { blocked: boolean; reason: string | null } {
  if (!room || !room.status) {
    return { blocked: true, reason: "Select an available room of the new type." };
  }
  if (room.status === "out_of_order") {
    return { blocked: true, reason: "This room is out of order and cannot be used." };
  }
  if (room.status === "out_of_service") {
    return { blocked: true, reason: "This room is out of service and cannot be used." };
  }
  if (!isRoomStatusAssignable(room.status)) {
    return { blocked: true, reason: "This room is not available." };
  }
  return { blocked: false, reason: null };
}

export function canConfirmUpgrade(input: {
  targetRoomTypeId: string;
  currentRoomTypeId: string;
  targetRoomId: string | null;
  roomRequired: boolean;
  roomBlocked: boolean;
  reason: string;
}): boolean {
  const typeOk = !!input.targetRoomTypeId && input.targetRoomTypeId !== input.currentRoomTypeId;
  const roomOk = !input.roomRequired || (!!input.targetRoomId && !input.roomBlocked);
  return canConfirmAmend({ formValid: typeOk && roomOk && !input.roomBlocked, reasonOk: isReasonComplete(input.reason) });
}

export function canConfirmGuests(input: {
  adults: number;
  children: number;
  maxOccupancy: number;
  reason: string;
}): boolean {
  const countsOk = Number.isInteger(input.adults) && input.adults >= 1 && Number.isInteger(input.children) && input.children >= 0;
  return canConfirmAmend({
    formValid: countsOk && !occupancyExceeded(input.adults, input.children, input.maxOccupancy),
    reasonOk: isReasonComplete(input.reason),
  });
}

export function canConfirmService(input: { name: string; amount: number; quantity: number; reason: string }): boolean {
  const qtyOk = Number.isInteger(input.quantity) && input.quantity >= 1;
  return canConfirmAmend({
    formValid: input.name.trim().length > 0 && serviceAmountAllowed(input.amount) && qtyOk,
    reasonOk: isReasonComplete(input.reason),
  });
}

export function canConfirmSpecialRequest(input: {
  category: SpecialRequestCategory | "";
  text: string;
  reason: string;
}): boolean {
  return canConfirmAmend({
    formValid: !!input.category && isRequestTextComplete(input.text),
    reasonOk: isReasonComplete(input.reason),
  });
}

export function canConfirmGuestRequest(input: { text: string }): boolean {
  return isRequestTextComplete(input.text);
}

export function isMissingSchemaError(error: unknown, token: string): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code ?? "") : "";
  if (code === "42P01" || code === "42703") return true;
  return new RegExp(token, "i").test(msg) && /does not exist|schema cache|could not find/i.test(msg);
}

export function guestRequestPersistError(error: unknown): Error {
  if (isMissingSchemaError(error, "fo_guest_requests")) {
    return new Error(GUEST_REQUESTS_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(String(error ?? "Guest request failed."));
}

export function specialRequestCategoryError(error: unknown): Error {
  if (isMissingSchemaError(error, "special_request_category")) {
    return new Error(SPECIAL_REQUEST_CATEGORY_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(String(error ?? "Special request failed."));
}

export type SnapshotPair = { label: string; previous: string; next: string };

export function snapshotLines(pairs: SnapshotPair[]): SnapshotPair[] {
  return pairs.filter((p) => p.previous !== p.next || p.previous !== "—");
}

export const AMENDMENT_EVENT_LABELS: Record<string, string> = {
  created: "Created",
  confirmed: "Confirmed",
  updated: "Modified",
  amended: "Amended",
  status_changed: "Status changed",
  cancelled: "Cancelled",
  room_assigned: "Room assigned",
  room_changed: "Room moved",
  room_moved: "Room moved",
  checked_in: "Checked in",
  checked_out: "Checked out",
  check_in: "Checked in",
  check_out: "Checked out",
  no_show: "No-show",
  dates_changed: "Dates changed",
  stay_extended: "Stay extended",
  stay_shortened: "Stay shortened",
  priced: "Repriced",
  repriced: "Repriced",
};

export function amendmentEventLabel(eventType: string): string {
  return AMENDMENT_EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

export function formatSnapshotValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return "—";
}

export function beforeAfterFromHistory(
  previousValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): SnapshotPair[] {
  const keys = new Set([...Object.keys(previousValues ?? {}), ...Object.keys(newValues ?? {})]);
  const pairs: SnapshotPair[] = [];
  for (const key of keys) {
    const previous = formatSnapshotValue(previousValues?.[key]);
    const next = formatSnapshotValue(newValues?.[key]);
    if (previous === next) continue;
    pairs.push({ label: key.replace(/_/g, " "), previous, next });
  }
  return pairs;
}

export const FO_AMEND_SHEET_IDS = [
  "upgrade_downgrade",
  "add_remove_guest",
  "add_service",
  "add_special_request",
  "guest_request",
] as const;

export type FoAmendSheetId = (typeof FO_AMEND_SHEET_IDS)[number];
