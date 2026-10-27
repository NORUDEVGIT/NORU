/**
 * Front Office guest detail workspace — status-aware top tabs.
 * Tabs only choose which existing owner workflow the workspace shows.
 */
import type { ReservationStatus } from "./reservation-dates";

export type FoGuestWorkspaceTabId =
  | "overview"
  | "edit_details"
  | "assign_room"
  | "check_in"
  | "cancel_no_show"
  | "move_room"
  | "extend_stay"
  | "check_out"
  | "folio";

export type FoGuestWorkspaceTab = { id: FoGuestWorkspaceTabId; label: string };

const OVERVIEW: FoGuestWorkspaceTab = { id: "overview", label: "Stay Overview" };
const EDIT_DETAILS: FoGuestWorkspaceTab = { id: "edit_details", label: "Edit Details" };
const FOLIO: FoGuestWorkspaceTab = { id: "folio", label: "Folio & Charges" };

export function foGuestWorkspaceTabs(
  status: ReservationStatus,
  options?: { canReadFolio?: boolean },
): FoGuestWorkspaceTab[] {
  const tabs: FoGuestWorkspaceTab[] =
    status === "pending" || status === "confirmed"
      ? [
          OVERVIEW,
          EDIT_DETAILS,
          { id: "assign_room", label: "Assign / Change Room" },
          { id: "check_in", label: "Check-In" },
          { id: "cancel_no_show", label: "Cancel / No-Show" },
        ]
      : status === "checked_in"
        ? [
            OVERVIEW,
            EDIT_DETAILS,
            { id: "move_room", label: "Move / Change Room" },
            { id: "extend_stay", label: "Extend Stay" },
            { id: "check_out", label: "Check-Out / Folio Review" },
          ]
        : [OVERVIEW];
  return options?.canReadFolio ? [...tabs, FOLIO] : tabs;
}

/** Payment state label from the folio balance already computed by Cashiering. */
export function foFolioPaymentStatusLabel(balance: number | null | undefined): string {
  if (balance == null) return "—";
  if (balance > 0) return "Balance due";
  if (balance < 0) return "Credit balance";
  return "Settled";
}

/** Inventory status `available` only means bookable; an in-house room is occupied. */
export function foInHouseRoomInventoryNote(status: string | null | undefined): string | null {
  const value = status?.trim().toLowerCase();
  if (!value || value === "available" || value === "occupied") return null;
  return status!.replaceAll("_", " ");
}
