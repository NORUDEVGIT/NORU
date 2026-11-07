import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import {
  historyContextLine,
  resolveHistoryField,
  type GroupReservationSlice,
} from "@/packages/pms/lib/reservation-detail-group";
import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import type { ReservationHistoryEntry } from "@/packages/pms/lib/reservations.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLUSTER_MS = 2500;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  no_show: "No-Show",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  no_show: "No-Show",
  check_in: "Check In",
  check_out: "Check Out",
  room_assigned: "Room Assigned",
  room_changed: "Room Changed",
  room_moved: "Room Moved",
  stay_extended: "Stay Extended",
  stay_shortened: "Stay Shortened",
  stay_dates_changed: "Stay Dates Changed",
  repriced: "Repriced",
  status_changed: "Status Changed",
  amended: "Amended",
  expected_arrival_updated: "Expected Arrival Updated",
  late_checkout_updated: "Late Checkout Updated",
  room_guest_added: "Guest Added",
  room_guest_removed: "Guest Removed",
  room_primary_guest_changed: "Primary Guest Changed",
  package_applied: "Package Applied",
  package_removed: "Package Removed",
  promotion_applied: "Promotion Applied",
  promotion_removed: "Promotion Removed",
  note_pinned: "Note Pinned",
  trace_created: "Trace Created",
  trace_updated: "Trace Updated",
  assignment_notes_updated: "Assignment Notes Updated",
  rate_notes_updated: "Rate Notes Updated",
};

const AMEND_CLUSTER: ReadonlySet<string> = new Set([
  "stay_extended",
  "stay_shortened",
  "stay_dates_changed",
  "repriced",
  "amended",
]);

const MONEY_KEYS = new Set([
  "amount",
  "room_subtotal",
  "stay_total",
  "unit_amount",
  "balance",
  "deposit_amount",
]);

export type HistoryEventKind =
  | "check_in"
  | "check_out"
  | "payment"
  | "amendment"
  | "cancel"
  | "no_show"
  | "assign"
  | "other";

export type HistoryFact = {
  label: string;
  value: string;
};

export type HistoryRowExpand = {
  facts: HistoryFact[];
  relatedEvents: string[];
  nightlyRates: string[];
  technical: string[];
};

export type HistoryTableRow = {
  id: string;
  createdAt: string;
  eventLabel: string;
  eventKind: HistoryEventKind;
  summary: string;
  actor: string;
  entries: ReservationHistoryEntry[];
  expand: HistoryRowExpand;
};

function humanStatus(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return STATUS_LABELS[value] ?? null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function looksLikeNightlyRates(value: unknown): value is Array<{ date?: string; rate?: number }> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (row) =>
        row &&
        typeof row === "object" &&
        ("date" in row || "rate" in row),
    )
  );
}

export function formatNightlyRates(value: unknown, money: (amount: number) => string): string[] {
  if (!looksLikeNightlyRates(value)) return [];
  return value.map((row) => {
    const date = typeof row.date === "string" && ISO_DATE_RE.test(row.date)
      ? formatStayDate(row.date)
      : String(row.date ?? "—");
    const rate = typeof row.rate === "number" && Number.isFinite(row.rate) ? money(row.rate) : "—";
    return `${date} — ${rate}`;
  });
}

function formatScalar(
  key: string,
  value: unknown,
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): string {
  if (value === undefined || value === null || value === "") return "—";
  const resolved = resolveHistoryField(key, value, reservation);
  if (resolved) return resolved;
  const status = humanStatus(value);
  if (status && (/status/i.test(key) || STATUS_LABELS[String(value)])) return status;
  if (typeof value === "string" && ISO_DATE_RE.test(value)) return formatStayDate(value);
  if (typeof value === "number" && MONEY_KEYS.has(key)) return money(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (looksLikeNightlyRates(value)) return formatNightlyRates(value, money).join("; ");
  if (isUuid(value)) return value;
  if (typeof value === "string" || typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function valuesOf(entry: ReservationHistoryEntry): Record<string, unknown> {
  return { ...(entry.previousValues ?? {}), ...(entry.newValues ?? {}) };
}

function isPaymentEntry(entry: ReservationHistoryEntry): boolean {
  const values = valuesOf(entry);
  if (values.checkout_payment_id || values.deposit_transaction_id) return true;
  const notes = (entry.notes ?? "").toLowerCase();
  return notes.includes("payment posted") || notes.includes("deposit posted");
}

function isStayFinanceAmend(entry: ReservationHistoryEntry): boolean {
  if (entry.eventType !== "amended") return false;
  if (isPaymentEntry(entry)) return false;
  const values = valuesOf(entry);
  return (
    "room_subtotal" in values ||
    "room_charge_reconciled" in values ||
    "arrival_date" in values ||
    "departure_date" in values ||
    "nightly_rate_snapshot" in values ||
    "nightly_rates" in values
  );
}

function canCluster(entry: ReservationHistoryEntry): boolean {
  if (AMEND_CLUSTER.has(entry.eventType) === false) return false;
  if (entry.eventType === "amended") return isStayFinanceAmend(entry);
  return true;
}

function eventKind(entry: ReservationHistoryEntry): HistoryEventKind {
  if (entry.eventType === "check_in") return "check_in";
  if (entry.eventType === "check_out") return "check_out";
  if (entry.eventType === "cancelled") return "cancel";
  if (entry.eventType === "no_show") return "no_show";
  if (
    entry.eventType === "room_assigned" ||
    entry.eventType === "room_changed" ||
    entry.eventType === "room_moved"
  ) {
    return "assign";
  }
  if (isPaymentEntry(entry)) return "payment";
  if (
    entry.eventType === "stay_extended" ||
    entry.eventType === "stay_shortened" ||
    entry.eventType === "stay_dates_changed" ||
    entry.eventType === "repriced" ||
    isStayFinanceAmend(entry)
  ) {
    return "amendment";
  }
  return "other";
}

function eventLabelFor(entry: ReservationHistoryEntry): string {
  if (isPaymentEntry(entry)) {
    const notes = (entry.notes ?? "").toLowerCase();
    if (notes.includes("deposit")) return "Deposit";
    return "Payment";
  }
  if (entry.eventType === "amended" && "room_charge_reconciled" in valuesOf(entry)) {
    return "Room Charge Reconciled";
  }
  return EVENT_LABELS[entry.eventType] ?? entry.eventType.replaceAll("_", " ");
}

function changeLine(
  entry: ReservationHistoryEntry,
  key: string,
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): string | null {
  const from = entry.previousValues?.[key];
  const to = entry.newValues?.[key];
  if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) return null;
  const left = formatScalar(key, from, reservation, money);
  const right = formatScalar(key, to, reservation, money);
  if (left === right) return null;
  if (isUuid(from) && isUuid(to)) return null;
  return `${left} → ${right}`;
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    departure_date: "Departure",
    arrival_date: "Arrival",
    room_subtotal: "Room total",
    status: "Status",
    amount: "Amount",
    method: "Method",
    room_number: "Room",
  };
  if (labels[key]) return labels[key];
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summaryFor(
  entry: ReservationHistoryEntry,
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): string {
  const context = historyContextLine(entry.previousValues, entry.newValues, reservation);
  const roomFromContext = context?.split(" · ").find((part) => /room/i.test(part)) ?? null;
  const room =
    roomFromContext && roomFromContext !== "Room"
      ? roomFromContext
      : reservation.roomNumber
        ? `Room ${reservation.roomNumber}`
        : null;

  if (isPaymentEntry(entry)) {
    const amount = entry.newValues?.amount;
    const method = entry.newValues?.method;
    const methodLabel =
      typeof method === "string" && method.trim()
        ? method.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
        : null;
    const amountLabel = typeof amount === "number" && Number.isFinite(amount) ? money(amount) : null;
    const parts = [amountLabel ? `${amountLabel} posted` : "Posted", methodLabel ? `by ${methodLabel}` : null].filter(
      Boolean,
    );
    return parts.join(" ");
  }

  if (entry.eventType === "check_in" || entry.eventType === "check_out") {
    const status = changeLine(entry, "status", reservation, money);
    return [room, status].filter(Boolean).join(" · ");
  }

  if (
    entry.eventType === "stay_extended" ||
    entry.eventType === "stay_shortened" ||
    entry.eventType === "stay_dates_changed"
  ) {
    const departure = changeLine(entry, "departure_date", reservation, money);
    const arrival = changeLine(entry, "arrival_date", reservation, money);
    if (departure && arrival) return `${arrival.replace(" → ", " / ")} · ${departure}`;
    if (departure) return `Departure ${departure}`;
    if (arrival) return `Arrival ${arrival}`;
  }

  if (entry.eventType === "repriced" || (entry.eventType === "amended" && "room_subtotal" in (entry.newValues ?? {}))) {
    const total = changeLine(entry, "room_subtotal", reservation, money);
    if (total) return `Room total ${total}`;
  }

  if (entry.eventType === "room_assigned" || entry.eventType === "room_changed" || entry.eventType === "room_moved") {
    const number = entry.newValues?.room_number;
    if (typeof number === "string" && number.trim()) return `Room ${number}`;
    return context ?? "Room assignment updated";
  }

  const status = changeLine(entry, "status", reservation, money);
  if (status) return [room, status].filter(Boolean).join(" · ");

  const interesting = ["departure_date", "arrival_date", "room_subtotal", "room_number", "adults", "children"];
  for (const key of interesting) {
    const line = changeLine(entry, key, reservation, money);
    if (line) return `${fieldLabel(key)} ${line}`;
  }

  if (entry.notes?.trim()) return entry.notes.trim();
  return context ?? "Updated";
}

function isStayDateEvent(entry: ReservationHistoryEntry): boolean {
  return (
    entry.eventType === "stay_extended" ||
    entry.eventType === "stay_shortened" ||
    entry.eventType === "stay_dates_changed"
  );
}

function isReliableAmendCluster(entries: ReservationHistoryEntry[]): boolean {
  if (entries.length < 2) return false;
  const hasStay = entries.some(isStayDateEvent);
  const hasPrice = entries.some((entry) => entry.eventType === "repriced" || isStayFinanceAmend(entry));
  return hasStay && hasPrice;
}

function clusteredLabel(entries: ReservationHistoryEntry[]): string {
  if (isReliableAmendCluster(entries)) return "Stay Amended";
  return eventLabelFor(entries[0]!);
}

function clusteredSummary(
  entries: ReservationHistoryEntry[],
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): string {
  const parts: string[] = [];
  for (const entry of entries) {
    const piece = summaryFor(entry, reservation, money);
    if (piece && piece !== "Updated" && !parts.includes(piece)) parts.push(piece);
  }
  return parts.join(" · ");
}

function roomNumberValue(
  entry: ReservationHistoryEntry,
  reservation: GroupReservationSlice,
): string | null {
  const context = historyContextLine(entry.previousValues, entry.newValues, reservation);
  const fromContext = context?.split(" · ").find((part) => /room/i.test(part));
  const raw =
    fromContext && fromContext !== "Room"
      ? fromContext
      : reservation.roomNumber
        ? `Room ${reservation.roomNumber}`
        : null;
  if (!raw) return null;
  return raw.replace(/^Room\s+/i, "");
}

function methodLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function expandFor(
  entries: ReservationHistoryEntry[],
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): HistoryRowExpand {
  const facts: HistoryFact[] = [];
  const seen = new Set<string>();
  const addFact = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = `${label}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ label, value: trimmed });
  };

  const nightlyRates: string[] = [];
  const technical: string[] = [];
  const relatedEvents = entries.map((entry) => eventLabelFor(entry));

  for (const entry of entries) {
    addFact("Room", roomNumberValue(entry, reservation));
    addFact("Status", changeLine(entry, "status", reservation, money));
    addFact("Arrival", changeLine(entry, "arrival_date", reservation, money));
    addFact("Departure", changeLine(entry, "departure_date", reservation, money));
    addFact("Room total", changeLine(entry, "room_subtotal", reservation, money));

    if (isPaymentEntry(entry)) {
      addFact("Method", methodLabel(entry.newValues?.method));
      const amount = entry.newValues?.amount;
      if (typeof amount === "number" && Number.isFinite(amount)) addFact("Amount", money(amount));
      const notes = (entry.notes ?? "").toLowerCase();
      if (notes.includes("posted")) addFact("Folio posting", "Completed");
    }

    const changes = reservationHistoryChanges(entry.previousValues, entry.newValues);
    for (const change of changes) {
      const rawFrom = entry.previousValues?.[change.key];
      const rawTo = entry.newValues?.[change.key];
      const rates = formatNightlyRates(rawTo ?? rawFrom, money);
      if (rates.length > 0 && /nightly/i.test(change.key)) {
        for (const line of rates) if (!nightlyRates.includes(line)) nightlyRates.push(line);
        continue;
      }
      if (isUuid(rawFrom) || isUuid(rawTo) || /id$/i.test(change.key)) {
        const left = rawFrom == null || rawFrom === "" ? "—" : String(rawFrom);
        const right = rawTo == null || rawTo === "" ? "—" : String(rawTo);
        technical.push(`${fieldLabel(change.key)}: ${left === right ? right : `${left} → ${right}`}`);
      }
    }

    technical.push(`Event: ${entry.eventType}`);
    technical.push(`History ID: ${entry.id}`);
    const paymentId = entry.newValues?.checkout_payment_id ?? entry.previousValues?.checkout_payment_id;
    const depositId = entry.newValues?.deposit_transaction_id ?? entry.previousValues?.deposit_transaction_id;
    if (typeof paymentId === "string" && paymentId) technical.push(`Payment ID: ${paymentId}`);
    if (typeof depositId === "string" && depositId) technical.push(`Deposit ID: ${depositId}`);
  }

  if (entries.length > 1) addFact("Related events", String(entries.length));
  if (nightlyRates.length > 0) addFact("Nightly rates", `${nightlyRates.length} recorded`);

  return {
    facts,
    relatedEvents: entries.length > 1 ? relatedEvents : [],
    nightlyRates,
    technical: [...new Set(technical)],
  };
}

function toRow(
  entries: ReservationHistoryEntry[],
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): HistoryTableRow {
  const newest = entries[0]!;
  const kind = entries.length > 1 ? "amendment" : eventKind(newest);
  return {
    id: entries.map((entry) => entry.id).join(":"),
    createdAt: newest.createdAt,
    eventLabel: entries.length > 1 ? clusteredLabel(entries) : eventLabelFor(newest),
    eventKind: kind,
    summary: entries.length > 1 ? clusteredSummary(entries, reservation, money) : summaryFor(newest, reservation, money),
    actor: newest.actorName?.trim() || "—",
    entries,
    expand: expandFor(entries, reservation, money),
  };
}

export function presentReservationHistory(
  history: ReservationHistoryEntry[],
  reservation: GroupReservationSlice,
  money: (amount: number) => string,
): HistoryTableRow[] {
  const sorted = [...history].sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
  const used = new Set<string>();
  const rows: HistoryTableRow[] = [];

  for (const entry of sorted) {
    if (used.has(entry.id)) continue;
    if (!canCluster(entry)) {
      used.add(entry.id);
      rows.push(toRow([entry], reservation, money));
      continue;
    }
    const t0 = Date.parse(entry.createdAt);
    const cluster = [entry];
    for (const candidate of sorted) {
      if (candidate.id === entry.id || used.has(candidate.id)) continue;
      if (!canCluster(candidate)) continue;
      if ((candidate.actorName ?? "") !== (entry.actorName ?? "")) continue;
      const t1 = Date.parse(candidate.createdAt);
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || Math.abs(t0 - t1) > CLUSTER_MS) continue;
      cluster.push(candidate);
    }
    if (isReliableAmendCluster(cluster)) {
      cluster.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const member of cluster) used.add(member.id);
      rows.push(toRow(cluster, reservation, money));
      continue;
    }
    used.add(entry.id);
    rows.push(toRow([entry], reservation, money));
  }

  return rows;
}
