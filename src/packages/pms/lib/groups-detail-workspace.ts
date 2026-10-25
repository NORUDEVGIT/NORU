import type { GroupBlockRead, GroupRecord } from "./groups.functions";
import type { GroupOperationalUnit } from "./groups-operational-detail";
import { nightsBetween } from "./reservation-dates";
import { GROUP_CREATE_STATUS_LABELS, GROUP_TYPE_LABELS } from "./groups-create-wizard";
import { GROUP_STATUS_TRANSITIONS, type GroupStatus } from "./groups";

export const GROUP_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "allotment", label: "Allotment" },
  { id: "pickup", label: "Pickup" },
  { id: "rooming", label: "Rooming List" },
  { id: "linked", label: "Linked Reservations" },
  { id: "history", label: "History" },
] as const;

export type GroupDetailTabId = (typeof GROUP_DETAIL_TABS)[number]["id"];

export const GROUP_BLOCK_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  released: "Released",
  cancelled: "Cancelled",
};

export const GROUP_HISTORY_EVENT_LABELS: Record<string, string> = {
  group_created: "Group created",
  group_amended: "Group amended",
  block_created: "Block added",
  block_released: "Block released",
  block_amended: "Block updated",
  cutoff_auto_release: "Unused inventory released at cut-off",
  inventory_resync: "Inventory updated",
  reservation_linked: "Reservation linked",
  rooming_updated: "Rooming list updated",
  rooming_converted: "Rooming row converted",
};

const HISTORY_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  allotted: "Allotted",
  guestName: "Guest",
  arrival: "Arrival",
  departure: "Departure",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function groupStayNights(arrivalDate: string, departureDate: string): number {
  if (!arrivalDate || !departureDate) return 0;
  return Math.max(0, nightsBetween(arrivalDate, departureDate));
}

export function groupStatusLabel(status: string): string {
  return (
    GROUP_CREATE_STATUS_LABELS[status as keyof typeof GROUP_CREATE_STATUS_LABELS] ??
    status.replaceAll("_", " ")
  );
}

export function groupTypeLabel(type: string): string {
  return GROUP_TYPE_LABELS[type as keyof typeof GROUP_TYPE_LABELS] ?? type;
}

export function groupBlockStatusLabel(status: string): string {
  return GROUP_BLOCK_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function allowedGroupStatusTargets(from: string): GroupStatus[] {
  if (!(from in GROUP_STATUS_TRANSITIONS)) return [];
  return [...GROUP_STATUS_TRANSITIONS[from as GroupStatus]];
}

export function pickupPercent(pickedUp: number, allotted: number): number {
  if (allotted <= 0) return 0;
  return Math.round((pickedUp / allotted) * 100);
}

export function groupDetailSummary(
  blocks: GroupBlockRead[],
  reservationCount: number,
): {
  totalAllotment: number;
  pickedUp: number;
  remaining: number;
  linkedReservations: number;
} {
  const active = blocks.filter((block) => block.status === "active");
  const source = active.length > 0 ? active : [];
  return {
    totalAllotment: source.reduce((sum, block) => sum + block.totals.allotted, 0),
    pickedUp: source.reduce((sum, block) => sum + block.totals.pickedUp, 0),
    remaining: source.reduce((sum, block) => sum + block.totals.remaining, 0),
    linkedReservations: reservationCount,
  };
}

export function groupPickupRows(blocks: GroupBlockRead[], units: GroupOperationalUnit[] = []) {
  return blocks.map((block) => ({
    blockId: block.id,
    roomTypeName: block.roomTypeName ?? "Room type",
    blocked: block.totals.allotted,
    pickedUp: block.totals.pickedUp,
    remaining: block.totals.remaining,
    pickupPercent: pickupPercent(block.totals.pickedUp, block.totals.allotted),
    reservationUnits: units.filter((unit) => unit.blockId === block.id && unit.contributesToPickup)
      .length,
    status: block.status,
    units: units.filter((unit) => unit.blockId === block.id),
  }));
}

export type GroupLinkedReservationRow = {
  id: string;
  reservationId: string;
  confirmationNumber: string;
  guestName: string | null;
  roomLabel: string;
  stay: string;
  status: string;
  blockLabel: string;
  roomTypeName: string | null;
  pickupContribution: string;
};

export function groupLinkedUnitRows(units: GroupOperationalUnit[]): GroupLinkedReservationRow[] {
  return units.map((unit) => ({
    id: unit.reservationRoomId,
    reservationId: unit.reservationId,
    confirmationNumber: unit.confirmationNumber,
    guestName: unit.guestName,
    roomLabel: unit.roomNumber ?? "Unassigned",
    stay: `${unit.arrivalDate} → ${unit.departureDate}`,
    status: unit.unitStatus.replaceAll("_", " "),
    blockLabel: unit.blockLabel ?? "—",
    roomTypeName: unit.roomTypeName,
    pickupContribution: unit.contributesToPickup ? "Yes" : "No",
  }));
}

export function groupHistoryEventLabel(eventType: string, notes: string | null): string {
  if (notes && /cutoff_auto_release/i.test(notes)) {
    return GROUP_HISTORY_EVENT_LABELS.cutoff_auto_release!;
  }
  return GROUP_HISTORY_EVENT_LABELS[eventType] ?? "Group activity recorded";
}

export function groupHistoryDetails(
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  notes: string | null,
): string {
  const prev = previousValues ?? {};
  const next = newValues ?? {};
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])];
  const parts: string[] = [];
  for (const key of keys) {
    if (/id$/i.test(key) || key.toLowerCase().includes("id")) continue;
    const from = prev[key];
    const to = next[key];
    if (looksLikeUuid(from) || looksLikeUuid(to)) continue;
    if (typeof from === "object" || typeof to === "object") continue;
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    const label = HISTORY_FIELD_LABELS[key] ?? key.replaceAll("_", " ");
    if (from == null || from === "") {
      parts.push(`${label} ${String(to)}`);
    } else {
      parts.push(`${label} ${String(from)} → ${String(to)}`);
    }
  }
  if (
    notes &&
    !/cutoff_auto_release|syncBlockInventory|pms_/i.test(notes) &&
    !looksLikeUuid(notes)
  ) {
    parts.push(notes.replace(/cutoff_auto_release\s*/i, "").trim());
  } else if (notes && /Linked reservations were not cancelled/i.test(notes)) {
    parts.push("Linked reservations were not cancelled.");
  }
  return parts.filter(Boolean).join(" · ") || "Group activity recorded";
}

export function groupOverviewFields(group: GroupRecord): Array<{ label: string; value: string }> {
  const nights = groupStayNights(group.arrivalDate, group.departureDate);
  const fields: Array<{ label: string; value: string | null }> = [
    { label: "Group code", value: group.confirmationNumber },
    { label: "Group name", value: group.name },
    { label: "Group type", value: groupTypeLabel(group.groupType) },
    { label: "Status", value: groupStatusLabel(group.status) },
    { label: "Arrival", value: group.arrivalDate },
    { label: "Departure", value: group.departureDate },
    { label: "Nights", value: nights ? String(nights) : null },
    { label: "Cut-off date", value: group.cutoffDate },
    { label: "Source", value: group.source },
    { label: "Market segment", value: group.marketSegment },
    { label: "Internal notes", value: group.notes },
  ];
  return fields.filter((field): field is { label: string; value: string } =>
    Boolean(field.value && field.value.trim()),
  );
}

export const GROUP_DETAIL_EMPTY = {
  allotment: "No room allotments have been added.",
  pickup: "No reservations have picked up rooms from this group yet.",
  rooming: "No rooming-list entries yet.",
  linked: "No reservations are linked to this group.",
  history: "No group activity recorded yet.",
} as const;
