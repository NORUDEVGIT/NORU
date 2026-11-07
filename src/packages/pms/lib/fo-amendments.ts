/**
 * FO-FS4 — Amendments depth (pure).
 *
 * Shared Confirm / reason / Before→After honesty. Never invent package or
 * rate math. Never treat permission denied as Coming soon.
 */
import { formatStayDate, nightsBetween } from "@/shared/lib/property-dates";

export const REASON_MIN_CHARS = 3;
export const RATE_IMPACT_UNAVAILABLE = "Rate impact unavailable";
export const OCCUPANCY_EXCEEDED =
  "Adults and children together exceed this room type's maximum occupancy.";
export const GUEST_REQUESTS_UNAVAILABLE =
  "Guest requests are not available until migration 0043 is applied.";
export const SPECIAL_REQUEST_CATEGORY_UNAVAILABLE =
  "Special request category is not available until migration 0043 is applied.";
export const COMPANIONS_UNAVAILABLE =
  "Named companions are not available until migration 0045 is applied.";
export const CATALOGUE_EMPTY_HINT = "No catalogue items — enter a service manually.";
export const NO_GUESTS_FOUND = "No guests found";
export const NAMED_PARTY_EXCEEDED =
  "Primary guest plus named companions would exceed this room type's maximum occupancy.";
export const SERVICE_ZERO_NO_POST =
  "Amount 0 is recorded on the stay only — nothing is posted to the folio.";
export const CHILD_AGE_YEARS = 18;

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

export function occupancyBlockMessage(
  adults: number,
  children: number,
  maxOccupancy: number,
): string | null {
  if (!occupancyExceeded(adults, children, maxOccupancy)) return null;
  return `${OCCUPANCY_EXCEEDED} (${occupancyTotal(adults, children)} of ${maxOccupancy}).`;
}

export function namedPartyExceeded(companionCount: number, maxOccupancy: number): boolean {
  if (!Number.isFinite(maxOccupancy) || maxOccupancy <= 0) return false;
  return 1 + Math.max(0, companionCount) > maxOccupancy;
}

export function namedPartyBlockMessage(
  companionCount: number,
  maxOccupancy: number,
): string | null {
  if (!namedPartyExceeded(companionCount, maxOccupancy)) return null;
  return `${NAMED_PARTY_EXCEEDED} (${1 + Math.max(0, companionCount)} of ${maxOccupancy}).`;
}

export type CompanionKind = "Adult" | "Child";

export function companionTypeFromDob(
  dateOfBirth: string | null | undefined,
  asOfDate?: string | null,
): CompanionKind | null {
  const dob = (dateOfBirth ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const asOfRaw = (asOfDate ?? "").slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
    ? asOfRaw
    : new Date().toISOString().slice(0, 10);
  const [y, m, d] = dob.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  if (![y, m, d, ay, am, ad].every((n) => Number.isInteger(n))) return null;
  let age = (ay as number) - (y as number);
  if (
    (am as number) < (m as number) ||
    ((am as number) === (m as number) && (ad as number) < (d as number))
  ) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age < CHILD_AGE_YEARS ? "Child" : "Adult";
}

export function stayGuestLine(name: string, type: CompanionKind | null | undefined): string {
  const trimmed = name.trim();
  if (!trimmed) return "—";
  return type ? `${trimmed} · ${type}` : trimmed;
}

export function formatCompanionParty(names: Array<string | null | undefined>): string {
  const cleaned = names.map((n) => (n ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : "—";
}

export function guestSearchEmpty(input: {
  search: string;
  results: readonly unknown[];
  loading?: boolean;
}): boolean {
  return input.search.trim().length > 0 && !input.loading && input.results.length === 0;
}

export function nextCompanionCount(input: {
  currentCount: number;
  pendingAttach?: boolean;
  pendingDetach?: boolean;
}): number {
  const current = Math.max(0, input.currentCount);
  if (input.pendingDetach) return Math.max(0, current - 1);
  if (input.pendingAttach) return current + 1;
  return current;
}

export function hasPersistedRate(input: {
  roomSubtotal?: number | null | undefined;
  nightlyRates?: Array<{ date: string; rate: number }> | null | undefined;
}): boolean {
  const subtotal = input.roomSubtotal;
  if (subtotal != null && Number.isFinite(subtotal) && subtotal > 0) return true;
  return (input.nightlyRates ?? []).some((n) => Number.isFinite(n.rate) && n.rate > 0);
}

export type RateImpact =
  | { kind: "available"; previous: number; next: number | null }
  | { kind: "unavailable"; label: typeof RATE_IMPACT_UNAVAILABLE };

export function rateImpact(input: {
  roomSubtotal?: number | null | undefined;
  nightlyRates?: Array<{ date: string; rate: number }> | null | undefined;
  nextRoomSubtotal?: number | null | undefined;
}): RateImpact {
  if (!hasPersistedRate(input)) {
    return { kind: "unavailable", label: RATE_IMPACT_UNAVAILABLE };
  }
  const previous =
    input.roomSubtotal != null && Number.isFinite(input.roomSubtotal) ? input.roomSubtotal : null;
  const nightly = (input.nightlyRates ?? []).find((n) => Number.isFinite(n.rate) && n.rate > 0);
  const prev = previous ?? nightly?.rate ?? null;
  if (prev == null) return { kind: "unavailable", label: RATE_IMPACT_UNAVAILABLE };
  const next =
    input.nextRoomSubtotal != null && Number.isFinite(input.nextRoomSubtotal)
      ? input.nextRoomSubtotal
      : null;
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

export function upgradeRoomBlocked(
  room: {
    status: string | null;
    housekeepingStatus?: string | null;
  } | null,
): { blocked: boolean; reason: string | null } {
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
  return canConfirmAmend({
    formValid: typeOk && roomOk && !input.roomBlocked,
    reasonOk: isReasonComplete(input.reason),
  });
}

export function canConfirmGuests(input: {
  adults: number;
  children: number;
  maxOccupancy: number;
  reason: string;
  companionCount?: number;
  pendingAttach?: boolean;
  pendingDetach?: boolean;
  hasOccupancyChange?: boolean;
}): boolean {
  const countsOk =
    Number.isInteger(input.adults) &&
    input.adults >= 1 &&
    Number.isInteger(input.children) &&
    input.children >= 0;
  const occupancyOk = !occupancyExceeded(input.adults, input.children, input.maxOccupancy);
  const nextCount = nextCompanionCount({
    currentCount: input.companionCount ?? 0,
    ...(input.pendingAttach ? { pendingAttach: true } : {}),
    ...(input.pendingDetach ? { pendingDetach: true } : {}),
  });
  const namedOk = !input.pendingAttach || !namedPartyExceeded(nextCount, input.maxOccupancy);
  const hasChange = input.hasOccupancyChange ?? true;
  return canConfirmAmend({
    formValid: countsOk && occupancyOk && namedOk && hasChange,
    reasonOk: isReasonComplete(input.reason),
  });
}

export function canConfirmService(input: {
  name: string;
  amount: number;
  quantity: number;
  reason: string;
}): boolean {
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error ?? "");
}

export function isMissingSchemaError(error: unknown, token: string): boolean {
  const msg = errorMessage(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";
  if (code === "42P01" || code === "42703") return true;
  return (
    new RegExp(token, "i").test(msg) && /does not exist|schema cache|could not find/i.test(msg)
  );
}

export function guestRequestPersistError(error: unknown): Error {
  if (isMissingSchemaError(error, "fo_guest_requests")) {
    return new Error(GUEST_REQUESTS_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(errorMessage(error) || "Guest request failed.");
}

export function specialRequestCategoryError(error: unknown): Error {
  if (isMissingSchemaError(error, "special_request_category")) {
    return new Error(SPECIAL_REQUEST_CATEGORY_UNAVAILABLE);
  }
  return error instanceof Error
    ? error
    : new Error(errorMessage(error) || "Special request failed.");
}

export function companionsPersistError(error: unknown): Error {
  if (isMissingSchemaError(error, "fo_stay_companions")) {
    return new Error(COMPANIONS_UNAVAILABLE);
  }
  return error instanceof Error
    ? error
    : new Error(errorMessage(error) || "Companion update failed.");
}

export function isCatalogueUnreadable(error: unknown): boolean {
  return isMissingSchemaError(error, "fo_service_catalogue");
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
  stay_dates_changed: "Stay dates changed",
  priced: "Repriced",
  repriced: "Repriced",
  expected_arrival_updated: "Expected arrival updated",
  late_checkout_updated: "Late checkout updated",
  room_guest_added: "Room guest added",
  room_guest_removed: "Room guest removed",
  room_primary_guest_changed: "Primary occupant changed",
};

export function amendmentEventLabel(eventType: string): string {
  return AMENDMENT_EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

/** Canonical stay-date amendment history written by amend/change-stay RPCs. */
export const FO_STAY_AMENDMENT_EVENT_TYPES = [
  "stay_extended",
  "stay_shortened",
  "stay_dates_changed",
] as const;

export function isStayAmendmentHistoryEvent(eventType: string): boolean {
  return (FO_STAY_AMENDMENT_EVENT_TYPES as readonly string[]).includes(eventType);
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

/** Batched Front Office stay-date amendment history (read-model only). */
export type FoStayAmendmentHistoryRow = {
  reservationId: string;
  eventType: string;
  createdAt: string;
  actorName: string | null;
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

const STAY_AMENDMENT_FIELD_ORDER = [
  "arrival_date",
  "departure_date",
  "nights",
  "adults",
  "children",
  "infants",
  "room_subtotal",
  "special_requests",
  "notes",
] as const;

const STAY_AMENDMENT_FIELD_LABELS: Record<(typeof STAY_AMENDMENT_FIELD_ORDER)[number], string> = {
  arrival_date: "Arrival",
  departure_date: "Departure",
  nights: "Nights",
  adults: "Adults",
  children: "Children",
  infants: "Infants",
  room_subtotal: "Room Charge",
  special_requests: "Special Requests",
  notes: "Internal Notes",
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}/;

export function formatStayDateShort(value: string): string {
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

export function formatAmendmentOccurredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} · ${time}`;
}

function snapshotNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function snapshotNights(values: Record<string, unknown> | null | undefined): number | null {
  const fromKey = snapshotNumber(values?.nights);
  if (fromKey != null) return fromKey;
  const arrival = values?.arrival_date;
  const departure = values?.departure_date;
  if (typeof arrival === "string" && typeof departure === "string") {
    return nightsBetween(arrival.slice(0, 10), departure.slice(0, 10));
  }
  return null;
}

function formatStayAmendmentField(
  key: (typeof STAY_AMENDMENT_FIELD_ORDER)[number],
  value: unknown,
  opts: { dateStyle: "short" | "full"; money?: (n: number) => string },
): string | null {
  if (key === "room_subtotal") {
    const amount = snapshotNumber(value);
    if (amount == null || !opts.money) return null;
    return opts.money(amount);
  }
  if (value == null || value === "") return "—";
  if (key === "arrival_date" || key === "departure_date" || (typeof value === "string" && DATE_ONLY_RE.test(value))) {
    const iso = String(value).slice(0, 10);
    return opts.dateStyle === "short" ? formatStayDateShort(iso) : formatStayDate(iso);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return null;
}

export function stayAmendmentChangeLines(
  previousValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
  opts?: { dateStyle?: "short" | "full"; money?: (n: number) => string },
): SnapshotPair[] {
  const previous = previousValues ?? {};
  const next = newValues ?? {};
  const dateStyle = opts?.dateStyle ?? "full";
  const lines: SnapshotPair[] = [];
  for (const key of STAY_AMENDMENT_FIELD_ORDER) {
    if (key === "nights") {
      const fromNights = snapshotNights(previous);
      const toNights = snapshotNights(next);
      if (fromNights != null && toNights != null && fromNights !== toNights) {
        lines.push({ label: STAY_AMENDMENT_FIELD_LABELS.nights, previous: String(fromNights), next: String(toNights) });
      }
      continue;
    }
    if (!(key in previous) && !(key in next)) continue;
    const from = formatStayAmendmentField(key, previous[key], { dateStyle, money: opts?.money });
    const to = formatStayAmendmentField(key, next[key], { dateStyle, money: opts?.money });
    if (from == null || to == null || from === to) continue;
    lines.push({ label: STAY_AMENDMENT_FIELD_LABELS[key], previous: from, next: to });
  }
  return lines;
}

export function stayAmendmentTooltipLines(changes: SnapshotPair[], max = 3): string[] {
  const preferred = ["Departure", "Nights", "Arrival"];
  const ordered = [
    ...preferred.flatMap((label) => changes.filter((change) => change.label === label)),
    ...changes.filter((change) => !preferred.includes(change.label)),
  ];
  const seen = new Set<string>();
  const unique: SnapshotPair[] = [];
  for (const change of ordered) {
    if (seen.has(change.label)) continue;
    seen.add(change.label);
    unique.push(change);
  }
  return unique.slice(0, max).map((change) => `${change.label}: ${change.previous} → ${change.next}`);
}

export function stayAmendmentTableLine(changes: SnapshotPair[]): string | null {
  const line = stayAmendmentTooltipLines(changes, 1)[0];
  return line ? line.replace(": ", " ") : null;
}

export function latestStayAmendmentByReservation(
  rows: readonly FoStayAmendmentHistoryRow[],
): Map<string, FoStayAmendmentHistoryRow> {
  const latest = new Map<string, FoStayAmendmentHistoryRow>();
  for (const row of rows) {
    const current = latest.get(row.reservationId);
    if (!current || row.createdAt > current.createdAt) latest.set(row.reservationId, row);
  }
  return latest;
}

export function stayAmendmentsForReservation(
  rows: readonly FoStayAmendmentHistoryRow[],
  reservationId: string,
): FoStayAmendmentHistoryRow[] {
  return rows
    .filter((row) => row.reservationId === reservationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
