import { DEFAULT_TIMEZONE, isValidTimeZone } from "@/shared/lib/property-time";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function isInternalId(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}

export function displayName(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text || isInternalId(text)) return "—";
  return text;
}

/** Staff-entered notes. UUID-only values, including group-block ids, are omitted. */
export function staffNoteText(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const cleaned = notes.replace(UUID_PATTERN, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || isInternalId(cleaned)) return null;
  return cleaned;
}

export function groupReservationLabel(block: {
  groupId: string | null;
  groupName?: string | null;
  groupCode?: string | null;
}): string | null {
  if (!block.groupId) return null;
  const name = block.groupName?.trim();
  if (!name || isInternalId(name)) return "Linked to a group reservation.";
  const code = block.groupCode?.trim();
  if (code && !isInternalId(code)) return `Linked to group reservation ${name} (${code}).`;
  return `Linked to group reservation ${name}.`;
}

export function removedRoomCount(
  block: { inventoryImpact: string; targetKind: string; quantity: number | null },
  typeRoomCount: number,
): number | null {
  if (block.inventoryImpact !== "remove_from_inventory") return null;
  if (block.targetKind === "room") return 1;
  if (block.targetKind === "quantity") {
    return block.quantity && block.quantity > 0 ? block.quantity : null;
  }
  return typeRoomCount > 0 ? typeRoomCount : null;
}

function roomWord(count: number): string {
  return count === 1 ? "room" : "rooms";
}

export function inventoryImpactTable(count: number | null, impact: string): string {
  if (impact === "remove_from_inventory" && count != null && count > 0) {
    return `-${count} ${roomWord(count)}`;
  }
  if (impact === "assignment_only") return "Cannot assign";
  if (impact === "warning_only") return "Warning only";
  if (impact === "no_inventory_impact") return "No change";
  if (impact === "remove_from_inventory") return "Removed from inventory";
  return "—";
}

export function inventoryImpactSentence(count: number | null, impact: string): string {
  if (impact === "remove_from_inventory" && count != null && count > 0) {
    return `${count} ${roomWord(count)} removed from sellable inventory`;
  }
  if (impact === "assignment_only") return "Still sellable. These rooms cannot be assigned.";
  if (impact === "warning_only") return "Still sellable. Staff see a warning when assigning.";
  if (impact === "no_inventory_impact") return "Inventory is unchanged.";
  if (impact === "remove_from_inventory") return "Removed from sellable inventory.";
  return "—";
}

export function hotelDateTime(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return null;
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function lifecycleLine(
  action: string,
  name: string | null | undefined,
  when: string | null,
): string {
  const who = displayName(name);
  if (!when) return `${action} by ${who}`;
  return `${action} by ${who} · ${when}`;
}

export const BLOCK_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  active: "Active",
  released: "Released",
  cancelled: "Cancelled",
};

export function blockStatusLabel(status: string): string {
  return BLOCK_STATUS_LABEL[status] ?? "—";
}
