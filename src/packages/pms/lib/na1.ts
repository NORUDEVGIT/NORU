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
export const NA1_NOTE_HINT = "Optional note for the audit trail. This is not a waive.";

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
  "checked_in_without_room",
  "room_double_occupancy",
  "closed_folio_nonzero_balance",
  "closed_folio_post_activity",
  "duplicate_room_charge",
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
      {
        label: "Hotel cashier drawer",
        to: "/restaurant/pms/cashiering",
        search: { tab: "cashier-shift" },
      },
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
  checked_in_without_room: {
    label: "Checked in without a room",
    lane: "live",
    clear: [
      {
        label: "FO Exceptions / Move",
        to: "/restaurant/pms/front-office",
        search: { tab: "exceptions" },
      },
    ],
  },
  room_double_occupancy: {
    label: "Double occupancy",
    lane: "live",
    clear: [
      {
        label: "FO Exceptions / Move",
        to: "/restaurant/pms/front-office",
        search: { tab: "exceptions" },
      },
    ],
  },
  closed_folio_nonzero_balance: {
    label: "Closed folio not zero",
    lane: "live",
    clear: [
      { label: "Cashiering", to: "/restaurant/pms/cashiering", search: { tab: "folios" } },
    ],
  },
  closed_folio_post_activity: {
    label: "Posting after folio close",
    lane: "live",
    clear: [
      { label: "Cashiering", to: "/restaurant/pms/cashiering", search: { tab: "folios" } },
    ],
  },
  duplicate_room_charge: {
    label: "Duplicate room charge",
    lane: "live",
    clear: [
      { label: "Cashiering", to: "/restaurant/pms/cashiering", search: { tab: "folios" } },
    ],
  },
};

export const NA1_STALE_BUSINESS_DATE =
  "This run is not the current business date. Refresh Night Audit and close the current date.";

/** Ledger and stay integrity counts taken from the existing audit evaluation. */
export type NaIntegrityCounts = {
  checkedInWithoutRoom: number;
  doubleOccupancy: number;
  closedFolioNonzero: number;
  closedFolioPostActivity: number;
  duplicateRoomCharge: number;
};

export function emptyIntegrityCounts(): NaIntegrityCounts {
  return {
    checkedInWithoutRoom: 0,
    doubleOccupancy: 0,
    closedFolioNonzero: 0,
    closedFolioPostActivity: 0,
    duplicateRoomCharge: 0,
  };
}

export function integrityBlockerCounts(
  exceptions: readonly { exceptionType: string }[],
): NaIntegrityCounts {
  const count = (type: string) => exceptions.filter((row) => row.exceptionType === type).length;
  return {
    checkedInWithoutRoom: count("checked_in_without_room"),
    doubleOccupancy: count("room_double_occupancy"),
    closedFolioNonzero: count("closed_folio_nonzero_balance"),
    closedFolioPostActivity: count("closed_folio_post_activity"),
    duplicateRoomCharge: count("duplicate_room_charge"),
  };
}

export type NaDerivedException = {
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
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
  return rows.every(
    (row) => row.state === "pass" || row.state === "na" || row.state === "unavailable",
  );
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
  integrity: NaIntegrityCounts;
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
          ? `${input.openShift.openCount} open hotel cashier drawer(s).`
          : "No open hotel cashier drawers.",
      )
    : liveRow(
        "open_shift",
        "na",
        0,
        "This property has no hotel cashier drawers — till close is N/A.",
      );

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

  const checkedInWithoutRoom = countRow(
    "checked_in_without_room",
    input.integrity.checkedInWithoutRoom,
    "checked-in stay(s) with no room assigned.",
    "No checked-in stay is missing a room.",
  );
  const doubleOccupancy = countRow(
    "room_double_occupancy",
    input.integrity.doubleOccupancy,
    "room(s) with more than one checked-in stay.",
    "No room has two checked-in stays.",
  );
  const closedNonzero = countRow(
    "closed_folio_nonzero_balance",
    input.integrity.closedFolioNonzero,
    "closed folio(s) with a non-zero balance.",
    "No closed folio has a non-zero balance.",
  );
  const postActivity = countRow(
    "closed_folio_post_activity",
    input.integrity.closedFolioPostActivity,
    "closed folio(s) with postings after close.",
    "No posting is dated after its folio was closed.",
  );
  const duplicateCharge = countRow(
    "duplicate_room_charge",
    input.integrity.duplicateRoomCharge,
    "stay(s) with more than one room charge.",
    "No stay has a duplicate room charge.",
  );

  return [
    arrivals,
    overstays,
    unpaid,
    openShift,
    cancelNoShow,
    hk,
    checkedInWithoutRoom,
    doubleOccupancy,
    closedNonzero,
    postActivity,
    duplicateCharge,
  ];
}

function countRow(id: NaBlockerId, count: number, blocked: string, clear: string): NaBlockerRow {
  return liveRow(
    id,
    count > 0 ? "block" : "pass",
    count,
    count > 0 ? `${count} ${blocked}` : clear,
  );
}

const ARRIVAL_EXCEPTION_TYPES = ["arrival_not_processed", "pending_arrival"] as const;

function rowById(rows: readonly NaBlockerRow[], id: NaBlockerId): NaBlockerRow | undefined {
  return rows.find((row) => row.id === id);
}

function forcedBlocking(
  source: readonly NaDerivedException[],
  types: readonly string[],
  fallback: NaDerivedException,
): NaDerivedException[] {
  const found = source.filter((row) => types.includes(row.exceptionType));
  if (found.length === 0) return [{ ...fallback, severity: "blocking" }];
  return found.map((row) => ({ ...row, severity: "blocking" }));
}

function synthetic(type: string, row: NaBlockerRow): NaDerivedException {
  return {
    exceptionType: type,
    severity: "blocking",
    referenceType: null,
    referenceId: null,
    message: row.detail,
  };
}

/** Blocking exception rows that must be stored so SQL close matches the board. */
export function closeBlockingExceptions(
  rows: readonly NaBlockerRow[],
  source: readonly NaDerivedException[],
): NaDerivedException[] {
  const blocking: NaDerivedException[] = [];
  const push = (id: NaBlockerId, types: readonly string[]) => {
    const row = rowById(rows, id);
    if (!row || row.state !== "block") return;
    blocking.push(...forcedBlocking(source, types, synthetic(types[0] ?? id, row)));
  };

  push("arrivals_pending", ARRIVAL_EXCEPTION_TYPES);
  push("overstays", ["overstay"]);
  push("unpaid_folios", ["unpaid_folio"]);
  push("open_shift", ["open_cashier_shift"]);
  push("hk_conflict", ["hk_conflict"]);
  push("checked_in_without_room", ["checked_in_without_room"]);
  push("room_double_occupancy", ["room_double_occupancy"]);
  push("closed_folio_nonzero_balance", ["closed_folio_nonzero_balance"]);
  push("closed_folio_post_activity", ["closed_folio_post_activity"]);
  push("duplicate_room_charge", ["duplicate_room_charge"]);
  return blocking;
}

/** Warnings stay warnings. Pending arrivals are not a second warning once the arrivals row owns them. */
export function warningExceptionsForRun(
  source: readonly NaDerivedException[],
): NaDerivedException[] {
  return source.filter(
    (row) => row.severity === "warning" && row.exceptionType !== "pending_arrival",
  );
}

export function persistedNightAuditExceptions(
  rows: readonly NaBlockerRow[],
  source: readonly NaDerivedException[],
): NaDerivedException[] {
  return [...warningExceptionsForRun(source), ...closeBlockingExceptions(rows, source)];
}

export const PHASE_6I_EXTRAS_NOT_NA1 = [
  "dirty_room_without_task",
  "finance",
  "early_arrival",
  "late_arrival",
] as const;
