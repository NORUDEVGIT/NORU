import type { RoomInventoryEvent } from "@/packages/pms/lib/room-inventory.functions";

import { dateLabel } from "./room-inventory-utils";
import { statusPhrase } from "./room-board-utils";

export interface RoomHistoryEntry {
  id: string;
  title: string;
  /** Short plain-language lines: reason, status change, linked work. */
  details: string[];
  /** e.g. "Effective Nov 11, 2026" */
  effective: string | null;
  expectedReturn: string | null;
  staff: string;
  when: string;
  tone: "danger" | "warning" | "success" | "info" | "neutral";
}

function parseBag(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(bag: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function formatRoomEventWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function eventDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const TITLES: Record<string, { title: string; tone: RoomHistoryEntry["tone"] }> = {
  room_ooo: { title: "Set Out of Order", tone: "danger" },
  room_oos: { title: "Set Out of Service", tone: "warning" },
  room_released: { title: "Returned to Service", tone: "success" },
  block_created: { title: "Room block created", tone: "info" },
  block_approved: { title: "Room block approved", tone: "info" },
  block_activated: { title: "Room block activated", tone: "info" },
  block_released: { title: "Room block released", tone: "success" },
  block_cancelled: { title: "Room block cancelled", tone: "neutral" },
  sellability_override: { title: "Sellability changed", tone: "info" },
  bulk_operational_action: { title: "Bulk operational action", tone: "neutral" },
};

/**
 * Turns a canonical Room & Inventory event into a staff-readable history entry.
 * Raw JSON and actor / record identifiers never reach the screen.
 */
export function describeRoomEvent(event: RoomInventoryEvent): RoomHistoryEntry {
  const before = parseBag(event.previousValues);
  const after = parseBag(event.newValues);
  const meta = TITLES[event.eventType] ?? {
    title: statusPhrase(event.eventType),
    tone: "neutral" as const,
  };
  const details: string[] = [];
  const reason = text(after, "reason") ?? event.notes?.trim() ?? null;
  const expected = text(after, "expectedReturn", "expected_return");
  const previousStatus = text(before, "status");
  const nextStatus = text(after, "status");

  if (event.eventType === "room_ooo" || event.eventType === "room_oos") {
    if (reason) details.push(`Reason: ${reason}`);
    if (previousStatus) details.push(`Previous status: ${statusPhrase(previousStatus)}`);
    if (typeof after["maintenanceRequestId"] === "string" && after["maintenanceRequestId"]) {
      details.push("Linked to a maintenance request");
    }
    return {
      id: event.id,
      title: meta.title,
      details,
      effective: `Effective ${eventDay(event.createdAt)}`,
      expectedReturn: expected ? dateLabel(expected) : null,
      staff: event.actorName?.trim() || "Staff",
      when: formatRoomEventWhen(event.createdAt),
      tone: meta.tone,
    };
  }

  if (event.eventType === "room_released") {
    if (previousStatus) details.push(`Previous status: ${statusPhrase(previousStatus)}`);
    const previousReason = text(before, "reason");
    if (previousReason) details.push(`Restriction reason: ${previousReason}`);
    if (reason && reason !== previousReason) details.push(`Note: ${reason}`);
    return {
      id: event.id,
      title: meta.title,
      details,
      effective: `Effective ${eventDay(event.createdAt)}`,
      expectedReturn: null,
      staff: event.actorName?.trim() || "Staff",
      when: formatRoomEventWhen(event.createdAt),
      tone: meta.tone,
    };
  }

  if (event.eventType.startsWith("block_")) {
    if (previousStatus && nextStatus && previousStatus !== nextStatus) {
      details.push(`Status: ${statusPhrase(previousStatus)} → ${statusPhrase(nextStatus)}`);
    } else if (nextStatus) {
      details.push(`Status: ${statusPhrase(nextStatus)}`);
    }
    if (reason) details.push(`Reason: ${reason}`);
    const start = text(after, "startDate", "start_date");
    const end = text(after, "endDate", "end_date");
    return {
      id: event.id,
      title: meta.title,
      details,
      effective: start ? `Effective ${dateLabel(start)}${end ? ` – ${dateLabel(end)}` : ""}` : null,
      expectedReturn: null,
      staff: event.actorName?.trim() || "Staff",
      when: formatRoomEventWhen(event.createdAt),
      tone: meta.tone,
    };
  }

  if (reason) details.push(reason);
  if (nextStatus) details.push(`Status: ${statusPhrase(nextStatus)}`);
  return {
    id: event.id,
    title: meta.title,
    details,
    effective: null,
    expectedReturn: expected ? dateLabel(expected) : null,
    staff: event.actorName?.trim() || "Staff",
    when: formatRoomEventWhen(event.createdAt),
    tone: meta.tone,
  };
}

/** Splits the single room note field into separate entries (blank-line separated). */
export function splitRoomNotes(notes: string | null | undefined): string[] {
  return (notes ?? "")
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const ROOM_NOTES_MAX = 1000;

/** Appends a dated entry without touching earlier notes. */
export function appendRoomNote(
  existing: string | null | undefined,
  entry: string,
  today: string,
): string {
  const stamped = `[${dateLabel(today)}] ${entry.trim()}`;
  const current = (existing ?? "").trim();
  return current ? `${current}\n\n${stamped}` : stamped;
}

export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
