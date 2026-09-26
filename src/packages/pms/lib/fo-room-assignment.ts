/**
 * Front Office room-assignment presentation helpers.
 * Eligibility itself remains Room Inventory (`pms_evaluate_room_assignment`).
 */

export const UNABLE_TO_LOAD_ELIGIBLE_ROOMS = "Unable to load eligible rooms.";

export function formatRoomTypeLabel(name: string, code?: string | null): string {
  const trimmedCode = (code ?? "").trim();
  const trimmedName = name.trim() || "Room type";
  if (!trimmedCode) return trimmedName;
  if (trimmedName.includes(`(${trimmedCode})`)) return trimmedName;
  return `${trimmedName} (${trimmedCode})`;
}

export function noEligibleRoomsCopy(roomTypeLabel: string): string {
  return `No eligible ${roomTypeLabel} rooms are free for these dates.`;
}

export type AssignableListUiStatus = "loading" | "error" | "empty" | "ready";

export function assignableListUi(input: {
  isPending: boolean;
  isError: boolean;
  rooms: unknown[] | undefined;
}): { status: AssignableListUiStatus } {
  if (input.isPending) return { status: "loading" };
  if (input.isError) return { status: "error" };
  if ((input.rooms ?? []).length === 0) return { status: "empty" };
  return { status: "ready" };
}
