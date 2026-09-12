/**
 * NA-1 — Night Audit close-of-day (pure).
 *
 * Own PMS module titled Night Audit. Confirm rolls restaurants.business_date
 * via the existing close_business_date RPC. Blocker rows are Live, N/A or
 * Unavailable — never a fake Pass. No waive, reverse close, or yield UI.
 */
import { FO_PRIMARY_TITLE } from "./front-office-shell.ts";

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export const NA1_TITLE = "Night Audit";
export const NA1_FO_TITLE_LOCK = FO_PRIMARY_TITLE;
export const NA1_CONFIRM_LABEL = "Confirm close";
export const NA1_PHONE_CLOSE_COPY = "Use desktop to close";
export const NA1_ALL_CLEAR = "All clear";
export const NA1_NOTE_HINT =
  "Optional note for the audit trail. This is not a waive.";

export const NA1_HAS_WAIVE = false;
export const NA1_HAS_IGNORE = false;
export const NA1_HAS_REVERSE = false;
export const NA1_HAS_MARK_NO_SHOW = false;

export const NA1_PASS_COLOR = "#436436";
export const NA1_CONFIRM_GOLD = "#C89933";
export const NA1_CHROME = "#251605";

export const NA1_CONFIRM_ROLES = ["owner", "manager"] as const;
export const NA1_VIEW_ROLES = [
  "owner",
  "manager",
  "receptionist",
  "cashier",
  "accountant",
] as const;

export const NA1_BLOCKER_IDS = [
  "arrivals_pending",
  "overstays",
  "unpaid_folios",
  "open_shift",
  "cancel_noshow_pending",
  "hk_conflict",
] as const;

export type NaBlockerId = (typeof NA1_BLOCKER_IDS)[number];
export type NaBlockerState = "pass" | "block" | "na" | "unavailable";
export type NaWorkspaceStatus = "open" | "blocked" | "in_progress" | "closed";
export type NaFolioLane = "live" | "unavailable";

export type NaClearLink = {
  label: string;
  to: string;
  search?: { tab: string };
};

export type NaBlockerRow = {
  id: NaBlockerId;
  label: string;
  state: NaBlockerState;
  /** Count only when the Live feed is trusted. */
  count: number | null;
  detail: string;
  clear: NaClearLink[];
};

export type NaLastClosed = {
  who: string | null;
  when: string | null;
  previousBusinessDate: string;
  nextBusinessDate: string;
};

export type Na1BlockerSnapshot = {
  id: NaBlockerId;
  state: NaBlockerState;
  count: number | null;
};

export const NA1_BLOCKER_META: Record<
  NaBlockerId,
  { label: string; lane: "live" | "unavailable"; clear: NaClearLink[] }
> = {
  arrivals_pending: {
    label: "Arrivals pending",
    lane: "live",
    clear: [
      {
        label: "FO Arrivals / Check-in",
        to: "/restaurant/pms/front-office",
        search: { tab: "arrivals" },
      },
    ],
  },
  overstays: {
    label: "Overstays",
    lane: "live",
    clear: [
      {
        label: "FO Checkout / Extend / Move",
        to: "/restaurant/pms/front-office",
        search: { tab: "departures" },
      },
    ],
  },
  unpaid_folios: {
    label: "Unpaid folios",
    lane: "live",
    clear: [
      {
        label: "FO Checkout settle",
        to: "/restaurant/pms/front-office",
        search: { tab: "departures" },
      },
      { label: "Cashiering", to: "/restaurant/pms/cashiering", search: { tab: "folios" } },
    ],
  },
  open_shift: {
    label: "Open shift",
    lane: "live",
    clear: [
      { label: "Cashiering", to: "/restaurant/pms/cashiering", search: { tab: "shifts" } },
      { label: "RM shift-close", to: "/restaurant/restaurant-management/payments" },
    ],
  },
  cancel_noshow_pending: {
    label: "Cancel / no-show pending",
    lane: "unavailable",
    clear: [],
  },
  hk_conflict: {
    label: "Housekeeping conflict",
    lane: "live",
    clear: [
      {
        label: "FO Exceptions / Move",
        to: "/restaurant/pms/front-office",
        search: { tab: "exceptions" },
      },
      { label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
    ],
  },
};

export function canConfirmNightAudit(role: string): boolean {
  return (NA1_CONFIRM_ROLES as readonly string[]).includes(role);
}

export function canViewNightAudit(role: string): boolean {
  return (NA1_VIEW_ROLES as readonly string[]).includes(role);
}

/** Next calendar day — the close_business_date roll contract. */
export function nextBusinessDate(businessDate: string): string {
  return addDays(businessDate, 1);
}

export function remainingBlockerCount(rows: readonly NaBlockerRow[]): number {
  return rows.filter((row) => row.state === "block").length;
}

/**
 * Confirm is enabled only when every applicable Live row is Pass or N/A.
 * Unavailable rows are not a fake Pass and do not count as remaining blockers.
 */
export function canEnableConfirm(rows: readonly NaBlockerRow[]): boolean {
  return rows.every((row) => row.state === "pass" || row.state === "na" || row.state === "unavailable");
}

export function workspaceStatus(input: {
  closed: boolean;
  inProgress?: boolean;
  rows: readonly NaBlockerRow[];
}): NaWorkspaceStatus {
  if (input.closed) return "closed";
  if (input.inProgress) return "in_progress";
  if (remainingBlockerCount(input.rows) > 0) return "blocked";
  return "open";
}

export function remainingBlockersCopy(count: number): string {
  if (count <= 0) return NA1_ALL_CLEAR;
  return count === 1 ? "1 blocker remaining" : `${count} blockers remaining`;
}

export function formatNa1Date(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function snapshotBlockers(rows: readonly NaBlockerRow[]): Na1BlockerSnapshot[] {
  return rows.map((row) => ({ id: row.id, state: row.state, count: row.count }));
}

export function liveCountFromSnapshot(
  snapshots: readonly Na1BlockerSnapshot[] | null | undefined,
  id: NaBlockerId,
): number | null {
  const row = snapshots?.find((item) => item.id === id);
  if (!row || row.state === "unavailable" || row.state === "na") return null;
  return row.count;
}

function liveRow(
  id: NaBlockerId,
  state: Exclude<NaBlockerState, "unavailable">,
  count: number,
  detail: string,
): NaBlockerRow {
  const meta = NA1_BLOCKER_META[id];
  return {
    id,
    label: meta.label,
    state,
    count: state === "na" ? null : count,
    detail,
    clear: state === "block" ? meta.clear : [],
  };
}

function unavailableRow(id: NaBlockerId, detail: string): NaBlockerRow {
  const meta = NA1_BLOCKER_META[id];
  return {
    id,
    label: meta.label,
    state: "unavailable",
    count: null,
    detail,
    clear: [],
  };
}

export function buildNa1Blockers(input: {
  arrivalsPendingCount: number;
  overstayCount: number;
  unpaidFolios: { lane: NaFolioLane; count: number };
  openShift: { tillUsed: boolean; openCount: number };
  hkConflict: {
    discrepancyLane: NaFolioLane;
    discrepancyCount: number;
    roomUnavailableCount: number;
  };
}): NaBlockerRow[] {
  const arrivals = liveRow(
    "arrivals_pending",
    input.arrivalsPendingCount > 0 ? "block" : "pass",
    input.arrivalsPendingCount,
    input.arrivalsPendingCount > 0
      ? `${input.arrivalsPendingCount} pending or confirmed arrival(s) on or before the business date.`
      : "No pending or confirmed arrivals left on this business date.",
  );

  const overstays = liveRow(
    "overstays",
    input.overstayCount > 0 ? "block" : "pass",
    input.overstayCount,
    input.overstayCount > 0
      ? `${input.overstayCount} in-house stay(s) past departure.`
      : "No overstays.",
  );

  const unpaid =
    input.unpaidFolios.lane === "unavailable"
      ? unavailableRow(
          "unpaid_folios",
          "Folio signals are unavailable for this role — not Coming soon, and not a Pass.",
        )
      : liveRow(
          "unpaid_folios",
          input.unpaidFolios.count > 0 ? "block" : "pass",
          input.unpaidFolios.count,
          input.unpaidFolios.count > 0
            ? `${input.unpaidFolios.count} FO payment issue(s) with an outstanding balance or unpaid deposit.`
            : "No unpaid folio or deposit issues on the Live feed.",
        );

  const openShift = input.openShift.tillUsed
    ? liveRow(
        "open_shift",
        input.openShift.openCount > 0 ? "block" : "pass",
        input.openShift.openCount,
        input.openShift.openCount > 0
          ? `${input.openShift.openCount} open cashier shift(s).`
          : "No open cashier shifts.",
      )
    : liveRow("open_shift", "na", 0, "This property has no cashier shifts — till close is N/A.");

  const cancelNoShow = unavailableRow(
    "cancel_noshow_pending",
    "No standing pending-fee worklist. Not invented from arrivals.",
  );

  const trustedHkCount =
    (input.hkConflict.discrepancyLane === "live" ? input.hkConflict.discrepancyCount : 0) +
    input.hkConflict.roomUnavailableCount;
  const hkDetailParts: string[] = [];
  if (input.hkConflict.roomUnavailableCount > 0) {
    hkDetailParts.push(
      `${input.hkConflict.roomUnavailableCount} assigned room(s) out of order or out of service`,
    );
  }
  if (input.hkConflict.discrepancyLane === "live") {
    hkDetailParts.push(
      input.hkConflict.discrepancyCount > 0
        ? `${input.hkConflict.discrepancyCount} open room discrepancy(ies)`
        : "no open room discrepancies",
    );
  } else {
    hkDetailParts.push("room discrepancy feed unavailable");
  }
  const hk = liveRow(
    "hk_conflict",
    trustedHkCount > 0 ? "block" : "pass",
    trustedHkCount,
    trustedHkCount > 0
      ? `${hkDetailParts.join(" · ")}.`
      : `No assigned-room OOO/OOS. ${
          input.hkConflict.discrepancyLane === "live"
            ? "No open room discrepancies."
            : "Room discrepancy feed unavailable — that part is not counted."
        }`,
  );

  return [arrivals, overstays, unpaid, openShift, cancelNoShow, hk];
}

export const PHASE_6I_EXTRAS_NOT_NA1 = [
  "dirty_room_without_task",
  "finance",
  "early_arrival",
  "late_arrival",
] as const;
