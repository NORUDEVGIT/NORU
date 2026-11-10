/**
 * End of Day (Night Audit) step model — pure and client-safe.
 *
 * The one adapter between source-module findings and the nine-step workflow.
 * Every finding is either a BLOCKER or INFORMATION. There is no warning tier,
 * no review, and no acknowledgement. Nothing here reads, writes, or recalculates
 * source data; it only classifies issues the reconcilers already produced.
 */
import { exceptionSyncKey } from "./night-audit-exceptions.ts";
import { financialWarningIdentity } from "./night-audit-financial.ts";
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions.ts";

/* ------------------------------------------------------------------ steps */

export const END_OF_DAY_STEPS = [
  {
    id: "prepare",
    number: 1,
    title: "Prepare End of Day",
    summary: "Business date, window, and what still needs attention.",
  },
  {
    id: "arrivals",
    number: 2,
    title: "Arrival not checked in",
    summary: "Every arrival due today or earlier is checked in, cancelled, or marked no-show.",
  },
  {
    id: "departures",
    number: 3,
    title: "Departures",
    summary: "No guest is still checked in after their departure date.",
  },
  {
    id: "in_house",
    number: 4,
    title: "In-House Guests",
    summary: "Every in-house stay has a valid room and consistent room state.",
  },
  {
    id: "folios",
    number: 5,
    title: "Open Folios",
    summary: "Folio ledgers are consistent. Open balances are informational.",
  },
  {
    id: "cashier",
    number: 6,
    title: "Cashier Closure",
    summary: "Hotel cashier shifts and drawer figures for the day.",
  },
  {
    id: "reconcile",
    number: 7,
    title: "Reconcile Transactions & Revenue",
    summary: "The day's postings, settlement integrity, and fiscal status.",
  },
  {
    id: "business_date",
    number: 8,
    title: "Update Business Date",
    summary: "Close the business date once every blocker is resolved.",
  },
  {
    id: "finalize",
    number: 9,
    title: "Finalize & Reports",
    summary: "End of Day summary and reports for the closed date.",
  },
] as const;

export type EndOfDayStepId = (typeof END_OF_DAY_STEPS)[number]["id"];
export const END_OF_DAY_STEP_IDS = END_OF_DAY_STEPS.map((step) => step.id) as EndOfDayStepId[];

export function isEndOfDayStepId(value: unknown): value is EndOfDayStepId {
  return typeof value === "string" && (END_OF_DAY_STEP_IDS as string[]).includes(value);
}

export function endOfDayStep(id: EndOfDayStepId) {
  return END_OF_DAY_STEPS.find((step) => step.id === id)!;
}

/* -------------------------------------------------------------- statuses */

export type EndOfDayAuditStatus =
  "not_started" | "in_progress" | "blocked" | "ready_to_close" | "completed" | "failed";
export type EndOfDayStepStatus = "not_started" | "in_progress" | "blocked" | "completed";
export type EndOfDayCheckStatus = "passed" | "blocked";

export const AUDIT_STATUS_LABEL: Record<EndOfDayAuditStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  ready_to_close: "Ready to Close",
  completed: "Completed",
  failed: "Failed",
};

export const STEP_STATUS_LABEL: Record<EndOfDayStepStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
};

export const CHECK_STATUS_LABEL: Record<EndOfDayCheckStatus, string> = {
  passed: "Passed",
  blocked: "Blocked",
};

/* ------------------------------------------------------------- catalogue */

export type ConditionKind = "blocker" | "information";
/** System integrity can never be disabled. Property policy follows Card 1 settings. */
export type ConditionScope = "system" | "policy";

type CatalogEntry = {
  step: EndOfDayStepId;
  title: string;
  /** "source" keeps the reconciler's own blocking/non-blocking split for this code. */
  kind: ConditionKind | "source" | "policy";
  sourceModule: string;
  /** Any one of these lets the actor fix the source record. Empty: view only. */
  resolve: readonly PmsPermissionCode[];
};

const P = PMS_PERMISSIONS;
const FO_ARRIVAL = [
  P.FRONT_OFFICE_CHECK_IN,
  P.FRONT_OFFICE_NO_SHOW,
  P.FRONT_OFFICE_CANCEL,
  P.RESERVATION_CANCEL,
];
const FO_STAY = [P.FRONT_OFFICE_STAY_EDIT, P.RESERVATION_ASSIGNMENT_EDIT];
const ROOM_STATE = [P.FRONT_OFFICE_STAY_EDIT, P.ROOM_RESTRICTION_EDIT, P.MAINTENANCE_EDIT];
const FOLIO_FIX = [
  P.CASHIERING_ADJUSTMENT_POST,
  P.CASHIERING_TRANSFER_POST,
  P.CASHIERING_REFUND,
  P.CASHIERING_FOLIO_CLOSE,
];
const ALLOCATION_FIX = [P.CASHIERING_ALLOCATION_EDIT, P.CASHIERING_INVOICE_EDIT];
const FISCAL_FIX = [P.FISCAL_DOCUMENT_AUTHORIZE, P.CASHIERING_INVOICE_AUTHORIZE];

const CATALOG: Readonly<Record<string, CatalogEntry>> = {
  // Step 2 — arrivals
  arrival_not_processed: {
    step: "arrivals",
    title: "Arrival not processed",
    kind: "blocker",
    sourceModule: "Front Office",
    resolve: FO_ARRIVAL,
  },
  overbooking_unapproved: {
    step: "arrivals",
    title: "Tonight is over the overbooking limit",
    kind: "information",
    sourceModule: "Room & Inventory",
    resolve: [P.RESERVATION_OVERBOOKING_AUTHORIZE, P.RESERVATION_ASSIGNMENT_EDIT],
  },
  overbooking_within_allowance: {
    step: "arrivals",
    title: "Overbooked within the allowance",
    kind: "information",
    sourceModule: "Room & Inventory",
    resolve: [P.RESERVATION_OVERBOOKING_AUTHORIZE],
  },
  overbooking_next_date: {
    step: "arrivals",
    title: "Tomorrow is overbooked",
    kind: "information",
    sourceModule: "Room & Inventory",
    resolve: [P.RESERVATION_OVERBOOKING_AUTHORIZE],
  },
  overbooking_approved: {
    step: "arrivals",
    title: "Approved overbooking",
    kind: "information",
    sourceModule: "Room & Inventory",
    resolve: [],
  },
  waitlist_pending: {
    step: "arrivals",
    title: "Waitlist requests pending",
    kind: "information",
    sourceModule: "Reservations",
    resolve: [P.RESERVATION_WAITLIST_EDIT],
  },
  waitlist_conversion_missing_reservation: {
    step: "arrivals",
    title: "Waitlist conversion has no reservation",
    kind: "information",
    sourceModule: "Reservations",
    resolve: [P.RESERVATION_WAITLIST_EDIT],
  },

  // Step 3 — departures
  overstay: {
    step: "departures",
    title: "Guest past departure date",
    kind: "blocker",
    sourceModule: "Front Office",
    resolve: [P.FRONT_OFFICE_CHECK_OUT, P.FRONT_OFFICE_STAY_EDIT],
  },
  departure_due_today: {
    step: "departures",
    title: "Departing today, still in house",
    kind: "information",
    sourceModule: "Front Office",
    resolve: [P.FRONT_OFFICE_CHECK_OUT, P.FRONT_OFFICE_STAY_EDIT],
  },

  // Step 4 — in-house
  checked_in_without_room: {
    step: "in_house",
    title: "Checked in without a room",
    kind: "blocker",
    sourceModule: "Front Office",
    resolve: FO_STAY,
  },
  room_double_occupancy: {
    step: "in_house",
    title: "Two stays in one room",
    kind: "blocker",
    sourceModule: "Front Office",
    resolve: FO_STAY,
  },
  occupied_restricted_room: {
    step: "in_house",
    title: "Guest in an out-of-order room",
    kind: "blocker",
    sourceModule: "Front Office / Room & Inventory",
    resolve: ROOM_STATE,
  },
  occupied_maintenance_unavailable: {
    step: "in_house",
    title: "Guest in a room closed for maintenance",
    kind: "blocker",
    sourceModule: "Maintenance",
    resolve: ROOM_STATE,
  },
  hk_conflict: {
    step: "in_house",
    title: "Occupied room has a housekeeping discrepancy",
    kind: "blocker",
    sourceModule: "Housekeeping",
    resolve: [P.HOUSEKEEPING_INSPECTION_EDIT, P.HOUSEKEEPING_TASK_EDIT, P.FRONT_OFFICE_STAY_EDIT],
  },
  inconsistent_room_state: {
    step: "in_house",
    title: "Guest in an inactive room",
    kind: "blocker",
    sourceModule: "Room & Inventory",
    resolve: [P.ROOM_RESTRICTION_EDIT, P.CONFIG_ROOMS_OPS_CONFIGURE, P.FRONT_OFFICE_STAY_EDIT],
  },
  invalid_stay_dates: {
    step: "in_house",
    title: "Stay has invalid dates",
    kind: "blocker",
    sourceModule: "Reservations",
    resolve: [P.RESERVATION_EDIT, P.FRONT_OFFICE_STAY_EDIT],
  },
  occupied_maintenance_attention: {
    step: "in_house",
    title: "Maintenance open in an occupied room",
    kind: "information",
    sourceModule: "Maintenance",
    resolve: [P.MAINTENANCE_EDIT],
  },
  maintenance_request_urgent: {
    step: "in_house",
    title: "Urgent maintenance in an occupied room",
    kind: "information",
    sourceModule: "Maintenance",
    resolve: [P.MAINTENANCE_EDIT],
  },
  maintenance_request_open: {
    step: "in_house",
    title: "Maintenance request in an occupied room",
    kind: "information",
    sourceModule: "Maintenance",
    resolve: [P.MAINTENANCE_EDIT],
  },
  maintenance_unavailable: {
    step: "in_house",
    title: "Maintenance requests could not be read",
    kind: "information",
    sourceModule: "Maintenance",
    resolve: [],
  },
  dirty_room_without_task: {
    step: "in_house",
    title: "Vacant dirty room without a task",
    kind: "information",
    sourceModule: "Housekeeping",
    resolve: [P.HOUSEKEEPING_TASK_CREATE],
  },
  restriction_without_reason: {
    step: "in_house",
    title: "Room restriction without a reason",
    kind: "information",
    sourceModule: "Room & Inventory",
    resolve: [P.ROOM_RESTRICTION_EDIT],
  },
  cancelled_holding_room: {
    step: "in_house",
    title: "Cancelled stay still has a room assigned",
    kind: "information",
    sourceModule: "Reservations",
    resolve: [P.RESERVATION_ASSIGNMENT_EDIT],
  },
  room_moved_today: {
    step: "in_house",
    title: "Room moves today",
    kind: "information",
    sourceModule: "Front Office",
    resolve: [],
  },
  service_entitlement_pending: {
    step: "in_house",
    title: "Service entitlements still pending",
    kind: "information",
    sourceModule: "Guest Services",
    resolve: [],
  },

  // Step 5 — folios
  closed_folio_nonzero_balance: {
    step: "folios",
    title: "Closed folio has a balance",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: FOLIO_FIX,
  },
  closed_folio_post_activity: {
    step: "folios",
    title: "Posting on a closed folio",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: FOLIO_FIX,
  },
  duplicate_room_charge: {
    step: "folios",
    title: "Room charge posted twice",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: FOLIO_FIX,
  },
  folio_invoice_contradiction: {
    step: "folios",
    title: "Invoice and folio disagree",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  missing_folio: {
    step: "folios",
    title: "Stay has no folio",
    kind: "source",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_CHARGE_POST],
  },
  open_folio_balance: {
    step: "folios",
    title: "Open folio balance",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_PAYMENT_POST],
  },

  // Step 6 — cashier
  open_cashier_shift: {
    step: "cashier",
    title: "Cashier shift still open",
    kind: "policy",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_SHIFT_EDIT, P.CASHIERING_SHIFT_AUTHORIZE],
  },
  closed_shift_variance: {
    step: "cashier",
    title: "Closed shift has a cash variance",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_SHIFT_AUTHORIZE],
  },

  // Step 7 — reconcile
  allocation_exceeds_source: {
    step: "reconcile",
    title: "Allocation exceeds its payment",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  orphan_allocation: {
    step: "reconcile",
    title: "Allocation without an invoice",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  allocation_missing_invoice: {
    step: "reconcile",
    title: "Account allocation without an invoice",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  allocation_invalid_document: {
    step: "reconcile",
    title: "Account allocation to an invalid document",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  withholding_mismatch: {
    step: "reconcile",
    title: "Withholding does not match the invoice",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: ALLOCATION_FIX,
  },
  transfer_unbalanced: {
    step: "reconcile",
    title: "Transfer is not balanced",
    kind: "blocker",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_TRANSFER_POST],
  },
  fiscal_failed: {
    step: "reconcile",
    title: "Fiscal registration failed",
    kind: "blocker",
    sourceModule: "Cashiering / Fiscal",
    resolve: FISCAL_FIX,
  },
  fiscal_cancel_pending: {
    step: "reconcile",
    title: "Fiscal cancellation pending",
    kind: "blocker",
    sourceModule: "Cashiering / Fiscal",
    resolve: FISCAL_FIX,
  },
  fiscal_not_registered: {
    step: "reconcile",
    title: "Fiscal document not registered",
    kind: "blocker",
    sourceModule: "Cashiering / Fiscal",
    resolve: FISCAL_FIX,
  },
  fiscal_blocked: {
    step: "reconcile",
    title: "Fiscal registration blocked",
    kind: "blocker",
    sourceModule: "Cashiering / Fiscal",
    resolve: FISCAL_FIX,
  },
  fiscal_unrecognized: {
    step: "reconcile",
    title: "Unknown fiscal status",
    kind: "blocker",
    sourceModule: "Cashiering / Fiscal",
    resolve: FISCAL_FIX,
  },
  fiscal_pending: {
    step: "reconcile",
    title: "Fiscal registration pending",
    kind: "information",
    sourceModule: "Cashiering / Fiscal",
    resolve: [],
  },
  unallocated_guest_payment: {
    step: "reconcile",
    title: "Unallocated guest payment",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_ALLOCATION_EDIT],
  },
  unallocated_guest_deposit: {
    step: "reconcile",
    title: "Unallocated guest deposit",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_ALLOCATION_EDIT],
  },
  unallocated_account_payment: {
    step: "reconcile",
    title: "Unallocated account payment",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [P.CASHIERING_ALLOCATION_EDIT],
  },
  valid_account_receivable: {
    step: "reconcile",
    title: "Account receivable outstanding",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [],
  },
  tax_snapshot_mismatch: {
    step: "reconcile",
    title: "Tax differs from issued invoices",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [],
  },
  service_snapshot_mismatch: {
    step: "reconcile",
    title: "Service charge differs from issued invoices",
    kind: "information",
    sourceModule: "Cashiering",
    resolve: [],
  },

  // Step 1 — prepare (optional sources)
  channel_connection_error: {
    step: "prepare",
    title: "Channel connection error",
    kind: "information",
    sourceModule: "Distribution",
    resolve: [],
  },
  channel_sync_failed: {
    step: "prepare",
    title: "Channel sync failed",
    kind: "information",
    sourceModule: "Distribution",
    resolve: [],
  },
  distribution_unavailable: {
    step: "prepare",
    title: "Distribution status could not be read",
    kind: "information",
    sourceModule: "Distribution",
    resolve: [],
  },
  revenue_approval_pending: {
    step: "prepare",
    title: "Revenue approval pending",
    kind: "information",
    sourceModule: "Rate & Revenue",
    resolve: [],
  },
  next_date_restriction: {
    step: "prepare",
    title: "Restriction on the next date",
    kind: "information",
    sourceModule: "Rate & Revenue",
    resolve: [],
  },
  missing_nightly_snapshot: {
    step: "prepare",
    title: "Nightly rate snapshot missing",
    kind: "information",
    sourceModule: "Rate & Revenue",
    resolve: [],
  },
  revenue_unavailable: {
    step: "prepare",
    title: "Revenue readiness could not be read",
    kind: "information",
    sourceModule: "Rate & Revenue",
    resolve: [],
  },
};

/** Positive findings that are not worth a card. */
const HIDDEN_CODES = new Set(["distribution_no_known_failures"]);

/** Codes no longer derived anywhere. A stored row with one is legacy history. */
export const RETIRED_CONDITION_CODES = [
  "unpaid_folio",
  "pending_arrival",
  "cancel_noshow_pending",
] as const;

export function conditionCode(exceptionType: string): string {
  return exceptionType.split(":")[0] ?? exceptionType;
}

function humanize(code: string): string {
  const text = code.replaceAll("_", " ").trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : "End of Day finding";
}

/** Human title for a code. Never the raw code. */
export function conditionTitle(exceptionType: string): string {
  const code = conditionCode(exceptionType);
  return CATALOG[code]?.title ?? humanize(code);
}

export function conditionSourceModule(exceptionType: string): string {
  return CATALOG[conditionCode(exceptionType)]?.sourceModule ?? "Night Audit";
}

const CATEGORY_STEP: Readonly<Record<string, EndOfDayStepId>> = {
  arrivals: "arrivals",
  overbooking: "arrivals",
  departures: "departures",
  rooms: "in_house",
  housekeeping: "in_house",
  services: "in_house",
  guest_folios: "folios",
  invoices: "folios",
  drawers: "cashier",
  payments_deposits: "reconcile",
  accounts: "reconcile",
  fiscal: "reconcile",
  tax: "reconcile",
  distribution: "prepare",
  revenue: "prepare",
};

export function conditionStep(exceptionType: string, category?: string | null): EndOfDayStepId {
  const code = conditionCode(exceptionType);
  const known = CATALOG[code]?.step;
  if (known) return known;
  if (code.startsWith("fiscal_")) return "reconcile";
  return (category && CATEGORY_STEP[category]) || "prepare";
}

/* ---------------------------------------------------------------- policy */

export type OpenShiftPolicy = "block" | "do_not_block";

export type EndOfDayPolicy = {
  /** Card 1 "Open cashier shifts before End of Day". */
  openCashierShifts: OpenShiftPolicy;
};

export const DEFAULT_END_OF_DAY_POLICY: EndOfDayPolicy = { openCashierShifts: "block" };

export const OPEN_SHIFT_POLICY_LABEL: Record<OpenShiftPolicy, string> = {
  block: "Must be closed",
  do_not_block: "Do not block",
};

/** The Card 1 blocker key that controls the open-shift policy. */
export const OPEN_CASHIER_SHIFTS_POLICY_KEY = "open_cashier_shifts";

/**
 * Card 1 restaurants.business_date_blockers, already normalized by
 * parseBusinessDateBlockers (an empty or missing list means the defaults).
 */
export function endOfDayPolicyFromBlockers(blockers: readonly string[]): EndOfDayPolicy {
  return {
    openCashierShifts: blockers.includes(OPEN_CASHIER_SHIFTS_POLICY_KEY) ? "block" : "do_not_block",
  };
}

/**
 * Card 1 blocker list with the open-shift policy applied. An empty stored list
 * means "defaults" (which block), so the other defaults are kept explicitly.
 */
export function withOpenShiftPolicy(
  blockers: readonly string[],
  policy: OpenShiftPolicy,
): string[] {
  const rest = blockers.filter((row) => row !== OPEN_CASHIER_SHIFTS_POLICY_KEY);
  if (policy === "block") return [...rest, OPEN_CASHIER_SHIFTS_POLICY_KEY];
  return rest.length > 0 ? rest : [...CARD1_OTHER_DEFAULT_BLOCKERS];
}

/** Card 1 defaults other than the open-shift key. Mirrors CARD1_DEFAULT_BLOCKERS. */
const CARD1_OTHER_DEFAULT_BLOCKERS = [
  "incomplete_night_audit",
  "unsettled_folios",
  "pending_offline_sync",
  "critical_system_errors",
] as const;

/**
 * BLOCKER or INFORMATION for one finding. "source" honours the reconciler's
 * own split (missing_folio blocks only for in-house stays). Unknown codes keep
 * the reconciler's severity so a new integrity finding can never silently pass.
 */
export function classifyCondition(
  exceptionType: string,
  sourceSeverity: string,
  policy: EndOfDayPolicy = DEFAULT_END_OF_DAY_POLICY,
): { kind: ConditionKind; scope: ConditionScope } {
  const code = conditionCode(exceptionType);
  const entry = CATALOG[code];
  if (entry?.kind === "policy") {
    if (code === "open_cashier_shift") {
      return {
        kind: policy.openCashierShifts === "block" ? "blocker" : "information",
        scope: "policy",
      };
    }
  }
  if (entry && (entry.kind === "blocker" || entry.kind === "information")) {
    return { kind: entry.kind, scope: "system" };
  }
  return { kind: sourceSeverity === "blocking" ? "blocker" : "information", scope: "system" };
}

/* ------------------------------------------------------------ conditions */

export type ConditionAction = {
  label: string;
  route: string;
  search?: Record<string, string>;
  /** Any one of these shows the action. Empty: anyone who can view the page. */
  permissions: readonly PmsPermissionCode[];
};

export type EndOfDayCondition = {
  /** Stable identity; equals the night_audit_exceptions sync key for blockers. */
  key: string;
  code: string;
  step: EndOfDayStepId;
  kind: ConditionKind;
  scope: ConditionScope;
  title: string;
  explanation: string;
  /** Guest, stay, room, folio, or shift the finding is about. */
  entity: string | null;
  sourceModule: string;
  actions: ConditionAction[];
  /** Fix permissions for the source record. Empty: nobody resolves it here. */
  resolvePermissions: readonly PmsPermissionCode[];
  exceptionType: string;
  referenceType: string | null;
  referenceId: string | null;
  /** Persisted exception row for this blocker on the current run. */
  exceptionId: string | null;
  fiscalOverrideable: boolean;
  /** Active fiscal-only close exemption. The source stays open. */
  fiscalOverride: {
    reason: string;
    reasonCategory: string | null;
    overriddenBy: string | null;
    overriddenAt: string;
  } | null;
  currency?: string | null;
  amount?: number | null;
  /** fiscal_registrations.id when this fiscal document was already sent. */
  fiscalRegistrationId?: string;
};

/** One issue as the financial and operational reconcilers emit it. */
export type SourceIssue = {
  code: string;
  category?: string | null;
  severity: "blocking" | "warning" | "info";
  title: string;
  description: string;
  referenceType: string;
  referenceId: string;
  route: string;
  search?: Record<string, string> | undefined;
  ownerModule?: string | null;
  currency?: string | null;
  amount?: number | null;
  reservationId?: string | null;
  confirmationNumber?: string | null;
  guestName?: string | null;
  roomNumber?: string | null;
  reservationRoomId?: string | null;
  fiscalRegistrationId?: string | null;
};

export const NIGHT_AUDIT_RETURN = {
  returnTo: "/restaurant/pms/night-audit",
  returnToLabel: "End of Day",
} as const;

const FRONT_OFFICE = "/restaurant/pms/front-office";

function reservationAction(reservationId: string): ConditionAction {
  return {
    label: "Open Reservation",
    route: `/restaurant/pms/reservations/${reservationId}`,
    search: { ...NIGHT_AUDIT_RETURN },
    permissions: [P.RESERVATION_VIEW],
  };
}

function withReturn(
  route: string,
  search?: Record<string, string>,
): Record<string, string> | undefined {
  if (route === FRONT_OFFICE || route.startsWith("/restaurant/pms/reservations/")) {
    return { ...(search ?? {}), ...NIGHT_AUDIT_RETURN };
  }
  return search;
}

function primaryLabel(code: string, route: string): string {
  if (code === "arrival_not_processed") return "Check In";
  if (code === "overstay" || code === "departure_due_today") return "Check Out";
  if (code === "open_cashier_shift") return "Close Shift";
  if (code === "closed_shift_variance") return "Open Shift";
  if (route.includes("/cashiering/folios/")) return "Open Folio";
  if (route.includes("/cashiering/accounts/")) return "Open Account";
  if (route.startsWith("/restaurant/pms/reservations/")) return "Open Reservation";
  if (route.startsWith(FRONT_OFFICE)) return "Open Front Office";
  if (route.includes("housekeeping")) return "Open Housekeeping";
  if (route.includes("room-inventory")) return "Open Room & Inventory";
  if (route.includes("rates-revenue")) return "Open Rate & Revenue";
  if (route.includes("distribution")) return "Open Distribution";
  if (route.includes("guest-services")) return "Open Guest Services";
  if (route.includes("cashiering")) return "Open Cashiering";
  return "Open";
}

function viewPermissionFor(route: string): PmsPermissionCode[] {
  if (route.startsWith(FRONT_OFFICE)) return [P.FRONT_OFFICE_VIEW];
  if (route.startsWith("/restaurant/pms/reservations")) return [P.RESERVATION_VIEW];
  if (route.includes("cashiering")) return [P.CASHIERING_VIEW, P.CASHIERING_SHIFT_VIEW];
  if (route.includes("housekeeping")) return [P.HOUSEKEEPING_VIEW, P.MAINTENANCE_VIEW];
  if (route.includes("room-inventory")) return [P.ROOM_INVENTORY_VIEW];
  if (route.includes("rates-revenue")) return [P.RATES_VIEW];
  return [];
}

function issueEntity(issue: SourceIssue): string | null {
  const parts = [
    issue.confirmationNumber || null,
    issue.guestName || null,
    issue.roomNumber ? `Room ${issue.roomNumber}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Fiscal hard statuses an authorized user may exempt for one close. Unknown status is never overrideable. */
export const FISCAL_OVERRIDEABLE_CODES = [
  "fiscal_failed",
  "fiscal_cancel_pending",
  "fiscal_not_registered",
  "fiscal_blocked",
] as const;

export function conditionFromIssue(
  issue: SourceIssue,
  policy: EndOfDayPolicy,
): EndOfDayCondition | null {
  if (HIDDEN_CODES.has(issue.code)) return null;
  const identity = financialWarningIdentity(issue.code, issue.referenceId);
  const { kind, scope } = classifyCondition(issue.code, issue.severity, policy);
  const entry = CATALOG[issue.code];
  const actions: ConditionAction[] = [];
  if (issue.route) {
    const search = withReturn(issue.route, issue.search);
    actions.push({
      label: primaryLabel(issue.code, issue.route),
      route: issue.route,
      ...(search ? { search } : {}),
      permissions: viewPermissionFor(issue.route),
    });
  }
  if (issue.reservationId && !issue.route.startsWith("/restaurant/pms/reservations/")) {
    actions.unshift(reservationAction(issue.reservationId));
  }
  if (issue.code === "arrival_not_processed" && actions[1]) {
    actions[1] = {
      ...actions[1],
      search: {
        ...(actions[1].search ?? {}),
        ...(issue.reservationId ? { reservationId: issue.reservationId } : {}),
        ...(issue.reservationRoomId ? { reservationRoomId: issue.reservationRoomId } : {}),
      },
      permissions: [P.FRONT_OFFICE_CHECK_IN],
    };
  }
  if ((issue.code === "overstay" || issue.code === "departure_due_today") && actions[1]) {
    actions[1] = {
      ...actions[1],
      search: {
        ...(actions[1].search ?? {}),
        ...(issue.reservationId ? { reservationId: issue.reservationId } : {}),
        ...(issue.reservationRoomId ? { reservationRoomId: issue.reservationRoomId } : {}),
      },
      permissions: [P.FRONT_OFFICE_CHECK_OUT],
    };
  }
  return {
    key: exceptionSyncKey(identity.exceptionType, identity.referenceId),
    code: issue.code,
    step: conditionStep(issue.code, issue.category),
    kind,
    scope,
    title: entry?.title ?? (issue.title || humanize(issue.code)),
    explanation: issue.description,
    entity: issueEntity(issue),
    sourceModule: entry?.sourceModule ?? issue.ownerModule ?? "Night Audit",
    actions,
    resolvePermissions: entry?.resolve ?? [],
    exceptionType: identity.exceptionType,
    referenceType: issue.referenceType || null,
    referenceId: identity.referenceId,
    exceptionId: null,
    fiscalOverrideable: (FISCAL_OVERRIDEABLE_CODES as readonly string[]).includes(issue.code),
    fiscalOverride: null,
    currency: issue.currency ?? null,
    amount: issue.amount ?? null,
    ...(issue.fiscalRegistrationId ? { fiscalRegistrationId: issue.fiscalRegistrationId } : {}),
  };
}

/** Mandatory sources. When one cannot be read, its steps are blocked — never silently passed. */
export type EndOfDaySource = "operational" | "financial";

const UNAVAILABLE_COPY: Record<EndOfDaySource, Array<{ step: EndOfDayStepId; title: string }>> = {
  operational: [
    { step: "arrivals", title: "We couldn't verify arrivals." },
    { step: "departures", title: "We couldn't verify departures." },
    { step: "in_house", title: "We couldn't verify in-house rooms." },
  ],
  financial: [
    { step: "folios", title: "We couldn't verify folios." },
    { step: "cashier", title: "We couldn't verify cashier status." },
    { step: "reconcile", title: "We couldn't verify transactions and revenue." },
  ],
};

export function unavailableSourceConditions(
  sources: readonly EndOfDaySource[],
): EndOfDayCondition[] {
  return sources.flatMap((source) =>
    UNAVAILABLE_COPY[source].map((row): EndOfDayCondition => ({
      key: `source_unavailable:${source}:${row.step}`,
      code: "source_unavailable",
      step: row.step,
      kind: "blocker",
      scope: "system",
      title: row.title,
      explanation:
        "The source module did not respond. Recheck to try again. End of Day cannot close until this check runs.",
      entity: null,
      sourceModule: source === "financial" ? "Cashiering" : "Front Office",
      actions: [],
      resolvePermissions: [],
      exceptionType: "source_unavailable",
      referenceType: null,
      referenceId: null,
      exceptionId: null,
      fiscalOverrideable: false,
      fiscalOverride: null,
    })),
  );
}

/** Blockers still holding close: a fiscal blocker with an active override no longer counts. */
export function openBlockers(conditions: readonly EndOfDayCondition[]): EndOfDayCondition[] {
  return conditions.filter((row) => row.kind === "blocker" && row.fiscalOverride == null);
}

export function informationItems(conditions: readonly EndOfDayCondition[]): EndOfDayCondition[] {
  return conditions.filter((row) => row.kind === "information");
}

/** Blockers first, then by step order, then title. */
export function sortConditions(conditions: readonly EndOfDayCondition[]): EndOfDayCondition[] {
  const rank = (row: EndOfDayCondition) =>
    row.kind === "blocker" ? (row.fiscalOverride ? 1 : 0) : 2;
  return [...conditions].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      END_OF_DAY_STEP_IDS.indexOf(a.step) - END_OF_DAY_STEP_IDS.indexOf(b.step) ||
      a.title.localeCompare(b.title) ||
      a.key.localeCompare(b.key),
  );
}

/** Rows the run persists: blockers only. Information is never stored. */
export function persistedBlockerRows(conditions: readonly EndOfDayCondition[]): Array<{
  exceptionType: string;
  severity: "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
}> {
  return conditions
    .filter((row) => row.kind === "blocker" && row.code !== "source_unavailable")
    .map((row) => ({
      exceptionType: row.exceptionType,
      severity: "blocking" as const,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      message: row.explanation,
    }));
}

/* ----------------------------------------------------------------- checks */

type CheckDefinition = { id: string; label: string; codes: readonly string[] };

const STEP_CHECKS: Partial<Record<EndOfDayStepId, readonly CheckDefinition[]>> = {
  arrivals: [
    {
      id: "arrivals_processed",
      label: "Every arrival due today or earlier is checked in, cancelled, or marked no-show",
      codes: ["arrival_not_processed"],
    },
  ],
  departures: [
    {
      id: "no_overstays",
      label: "No guest is still checked in after their departure date",
      codes: ["overstay"],
    },
  ],
  in_house: [
    {
      id: "room_assignment",
      label: "Every in-house stay has its own room",
      codes: ["checked_in_without_room", "room_double_occupancy"],
    },
    {
      id: "room_state",
      label: "No guest is in an out-of-order, closed, or inactive room",
      codes: [
        "occupied_restricted_room",
        "occupied_maintenance_unavailable",
        "inconsistent_room_state",
      ],
    },
    {
      id: "housekeeping",
      label: "No occupied room has an open housekeeping discrepancy",
      codes: ["hk_conflict"],
    },
    {
      id: "stay_dates",
      label: "Every active stay has valid dates",
      codes: ["invalid_stay_dates"],
    },
  ],
  folios: [
    {
      id: "folio_ledger",
      label: "Closed folios are settled and unchanged; no duplicate room charge",
      codes: [
        "closed_folio_nonzero_balance",
        "closed_folio_post_activity",
        "duplicate_room_charge",
      ],
    },
    {
      id: "folio_invoice",
      label: "Invoices agree with their folios",
      codes: ["folio_invoice_contradiction"],
    },
    {
      id: "folio_present",
      label: "Every in-house priced stay has a folio",
      codes: ["missing_folio"],
    },
  ],
  cashier: [
    {
      id: "open_shifts",
      label: "Hotel cashier shifts are closed",
      codes: ["open_cashier_shift"],
    },
  ],
  reconcile: [
    {
      id: "allocations",
      label: "Payment and deposit allocations are consistent",
      codes: [
        "allocation_exceeds_source",
        "orphan_allocation",
        "allocation_missing_invoice",
        "allocation_invalid_document",
      ],
    },
    {
      id: "accounts",
      label: "Account withholding and transfers balance",
      codes: ["withholding_mismatch", "transfer_unbalanced"],
    },
    {
      id: "fiscal",
      label: "Fiscal documents are registered",
      codes: [
        "fiscal_failed",
        "fiscal_cancel_pending",
        "fiscal_not_registered",
        "fiscal_blocked",
        "fiscal_unrecognized",
      ],
    },
  ],
};

export type EndOfDayCheck = {
  id: string;
  label: string;
  status: EndOfDayCheckStatus;
  blockerCount: number;
};

/** Checks for one step. A blocker with no named check still blocks under "Other checks". */
export function stepChecks(
  step: EndOfDayStepId,
  conditions: readonly EndOfDayCondition[],
): EndOfDayCheck[] {
  const blockers = openBlockers(conditions).filter((row) => row.step === step);
  const definitions = STEP_CHECKS[step] ?? [];
  const named = new Set(definitions.flatMap((row) => row.codes));
  const unavailable = blockers.filter((row) => row.code === "source_unavailable");
  const checks: EndOfDayCheck[] = [];
  if (unavailable.length > 0) {
    checks.push({
      id: "source_available",
      label: "Source data could be read",
      status: "blocked",
      blockerCount: unavailable.length,
    });
  }
  for (const definition of definitions) {
    const count = blockers.filter((row) => definition.codes.includes(row.code)).length;
    checks.push({
      id: definition.id,
      label: definition.label,
      // Nothing was verified when the source did not load.
      status: count > 0 || unavailable.length > 0 ? "blocked" : "passed",
      blockerCount: count,
    });
  }
  const other = blockers.filter((row) => row.code !== "source_unavailable" && !named.has(row.code));
  if (other.length > 0) {
    checks.push({
      id: "other",
      label: "Other integrity checks",
      status: "blocked",
      blockerCount: other.length,
    });
  }
  return checks;
}

/* ------------------------------------------------------- status derivation */

export type EndOfDayRunStatus = "open" | "ready" | "closed" | "failed" | "superseded";

export function endOfDayAuditStatus(input: {
  runStatus: EndOfDayRunStatus | null;
  evaluationFailed: boolean;
  blockerCount: number;
  evaluating?: boolean;
}): EndOfDayAuditStatus {
  if (input.runStatus === "closed") return "completed";
  if (!input.runStatus || input.runStatus === "superseded") return "not_started";
  if (input.runStatus === "failed" || input.evaluationFailed) return "failed";
  if (input.evaluating) return "in_progress";
  return input.blockerCount > 0 ? "blocked" : "ready_to_close";
}

export type EndOfDayStepView = {
  id: EndOfDayStepId;
  number: number;
  title: string;
  status: EndOfDayStepStatus;
  blockerCount: number;
  informationCount: number;
  checks: EndOfDayCheck[];
};

/**
 * Derived step state. A step is Completed only when its checks pass on this
 * evaluation; nothing is remembered as "done". Step 9 stays Not Started until
 * the business date is closed.
 */
export function endOfDaySteps(input: {
  runStatus: EndOfDayRunStatus | null;
  conditions: readonly EndOfDayCondition[];
}): EndOfDayStepView[] {
  const started = input.runStatus === "open" || input.runStatus === "ready";
  const closed = input.runStatus === "closed";
  const totalBlockers = openBlockers(input.conditions).length;
  return END_OF_DAY_STEPS.map((step) => {
    const inStep = input.conditions.filter((row) => row.step === step.id);
    const blockerCount = step.id === "business_date" ? totalBlockers : openBlockers(inStep).length;
    const informationCount = informationItems(inStep).length;
    let status: EndOfDayStepStatus;
    if (closed) status = "completed";
    else if (!started) status = "not_started";
    else if (step.id === "finalize") status = "not_started";
    else if (step.id === "business_date") status = totalBlockers > 0 ? "blocked" : "in_progress";
    else status = blockerCount > 0 ? "blocked" : "completed";
    return {
      id: step.id,
      number: step.number,
      title: step.title,
      status,
      blockerCount: step.id === "finalize" ? 0 : blockerCount,
      informationCount,
      checks:
        step.id === "business_date" || step.id === "finalize" ? [] : stepChecks(step.id, inStep),
    };
  });
}

/** First step still holding close, for "Resume" and the Step 1 summary. */
export function firstBlockedStep(steps: readonly EndOfDayStepView[]): EndOfDayStepId | null {
  return steps.find((step) => step.status === "blocked" && step.id !== "business_date")?.id ?? null;
}

export function blockerCountCopy(count: number): string {
  if (count === 0) return "No blockers";
  return count === 1 ? "1 blocker" : `${count} blockers`;
}

export function closeBlockedCopy(count: number): string {
  return count === 1
    ? "Resolve 1 blocker before closing the business date."
    : `Resolve ${count} blockers before closing the business date.`;
}

export const UNAUTHORIZED_RESOLVE_COPY =
  "This issue must be resolved by an authorized staff member.";

/* --------------------------------------------------------------- domains */

export const END_OF_DAY_DOMAINS = [
  { id: "reservations", label: "Reservations" },
  { id: "front_office", label: "Front Office" },
  { id: "housekeeping", label: "Housekeeping" },
  { id: "cashiering", label: "Cashiering" },
  { id: "fiscal", label: "Fiscal" },
  { id: "financial_integrity", label: "Financial Integrity" },
] as const;

export type EndOfDayDomainId = (typeof END_OF_DAY_DOMAINS)[number]["id"];

const HOUSEKEEPING_CODES = new Set([
  "hk_conflict",
  "dirty_room_without_task",
  "restriction_without_reason",
  "occupied_maintenance_unavailable",
  "occupied_maintenance_attention",
  "maintenance_request_urgent",
  "maintenance_request_open",
  "maintenance_unavailable",
]);
const RESERVATION_CODES = new Set(["invalid_stay_dates", "cancelled_holding_room"]);

export function conditionDomain(
  row: Pick<EndOfDayCondition, "code" | "step">,
): EndOfDayDomainId | null {
  if (row.code.startsWith("fiscal_")) return "fiscal";
  if (HOUSEKEEPING_CODES.has(row.code)) return "housekeeping";
  if (RESERVATION_CODES.has(row.code)) return "reservations";
  switch (row.step) {
    case "arrivals":
    case "departures":
      return "reservations";
    case "in_house":
      return "front_office";
    case "folios":
    case "cashier":
      return "cashiering";
    case "reconcile":
      return "financial_integrity";
    default:
      return null;
  }
}

export type EndOfDayDomainView = {
  id: EndOfDayDomainId;
  label: string;
  status: EndOfDayCheckStatus;
  blockerCount: number;
  informationCount: number;
};

/** Step 1 summary. A source-unavailable blocker counts against its domain. */
export function endOfDayDomains(conditions: readonly EndOfDayCondition[]): EndOfDayDomainView[] {
  return END_OF_DAY_DOMAINS.map((domain) => {
    const rows = conditions.filter((row) => conditionDomain(row) === domain.id);
    const blockerCount = openBlockers(rows).length;
    return {
      id: domain.id,
      label: domain.label,
      status: blockerCount > 0 ? "blocked" : "passed",
      blockerCount,
      informationCount: informationItems(rows).length,
    };
  });
}

/* ---------------------------------------------------------------- history */

/** Stored exception severity as History shows it. Legacy warnings are not re-labelled as blockers. */
export function historySeverityLabel(severity: string): "Blocker" | "Legacy information" {
  return severity === "blocking" ? "Blocker" : "Legacy information";
}
