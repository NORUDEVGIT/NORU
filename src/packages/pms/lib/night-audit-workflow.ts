/**
 * Night Audit workflow (pure, client-safe).
 *
 * Presentation and gating around truth that is already computed on the server:
 * overall readiness, exception rows stored in night_audit_exceptions, and run
 * summaries stored at close. Nothing here recalculates financial or
 * operational reconciliation, and nothing here writes.
 */
import { nextBusinessDate } from "./na1.ts";
import { canViewNightAuditFinancialDetail } from "./night-audit-financial.ts";
import {
  NIGHT_AUDIT_OPERATIONAL_DETAIL_ROLES,
  operationalCategoryForException,
  type NightAuditOverallStatus,
} from "./night-audit-operational.ts";

/* ------------------------------------------------------------ exceptions */

export type ExceptionDomain = "financial" | "operations";

export const FINANCIAL_EXCEPTION_CATEGORIES = [
  "folios",
  "invoices",
  "payments",
  "accounts",
  "drawers",
  "fiscal",
  "tax",
] as const;
export const OPERATIONS_EXCEPTION_CATEGORIES = [
  "arrivals",
  "departures",
  "rooms",
  "housekeeping",
  "overbooking",
  "distribution",
  "revenue",
  "services",
] as const;

export type ExceptionCategory =
  | (typeof FINANCIAL_EXCEPTION_CATEGORIES)[number]
  | (typeof OPERATIONS_EXCEPTION_CATEGORIES)[number];

export const EXCEPTION_CATEGORY_LABEL: Record<ExceptionCategory, string> = {
  folios: "Folios",
  invoices: "Invoices",
  payments: "Payments",
  accounts: "Accounts",
  drawers: "Drawers",
  fiscal: "Fiscal",
  tax: "Tax",
  arrivals: "Arrivals",
  departures: "Departures",
  rooms: "Rooms",
  housekeeping: "Housekeeping",
  overbooking: "Overbooking",
  distribution: "Distribution",
  revenue: "Revenue",
  services: "Services",
};

const FINANCIAL_CODE_CATEGORY: Readonly<Record<string, ExceptionCategory>> = {
  unpaid_folio: "folios",
  open_folio_balance: "folios",
  closed_folio_nonzero_balance: "folios",
  closed_folio_post_activity: "folios",
  duplicate_room_charge: "folios",
  missing_folio: "folios",
  folio_invoice_contradiction: "invoices",
  allocation_exceeds_source: "payments",
  orphan_allocation: "payments",
  unallocated_guest_deposit: "payments",
  unallocated_guest_payment: "payments",
  withholding_mismatch: "accounts",
  allocation_missing_invoice: "accounts",
  allocation_invalid_document: "accounts",
  unallocated_account_payment: "accounts",
  valid_account_receivable: "accounts",
  transfer_unbalanced: "accounts",
  open_cashier_shift: "drawers",
  closed_shift_variance: "drawers",
  tax_snapshot_mismatch: "tax",
  service_snapshot_mismatch: "tax",
};

/** Older evaluateAudit warnings that are stay facts, not money. */
const BOARD_OPERATIONS_CATEGORY: Readonly<Record<string, ExceptionCategory>> = {
  cancelled_holding_room: "rooms",
  invalid_stay_dates: "arrivals",
};

export type ExceptionSource = { route: string; search?: Record<string, string> };

export type ExceptionMeta = {
  code: string;
  domain: ExceptionDomain;
  category: ExceptionCategory | null;
  categoryLabel: string;
  title: string;
  ownerModule: string;
};

export function exceptionCode(exceptionType: string): string {
  return exceptionType.split(":")[0] ?? exceptionType;
}

function humanize(code: string): string {
  const text = code.replaceAll("_", " ").trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Night Audit finding";
}

function financialCategory(code: string): ExceptionCategory | null {
  const known = FINANCIAL_CODE_CATEGORY[code];
  if (known) return known;
  if (code.startsWith("fiscal_")) return "fiscal";
  return null;
}

const OWNER_MODULE: Record<ExceptionCategory, string> = {
  folios: "Cashiering",
  invoices: "Cashiering",
  payments: "Cashiering",
  accounts: "Cashiering",
  drawers: "Cashiering",
  tax: "Cashiering",
  fiscal: "Cashiering",
  arrivals: "Front Office",
  departures: "Front Office",
  rooms: "Housekeeping",
  housekeeping: "Housekeeping",
  overbooking: "Room & Inventory",
  distribution: "Distribution",
  revenue: "Rate & Revenue",
  services: "Guest Services",
};

/** Domain and category from the stored exception type. Works for closed runs too. */
export function exceptionMeta(exceptionType: string): ExceptionMeta {
  const code = exceptionCode(exceptionType);
  const finance = financialCategory(code);
  const operations =
    finance == null ? (operationalCategoryForException(exceptionType) ?? BOARD_OPERATIONS_CATEGORY[code] ?? null) : null;
  const category = finance ?? operations;
  return {
    code,
    domain: finance ? "financial" : "operations",
    category,
    categoryLabel: category ? EXCEPTION_CATEGORY_LABEL[category] : "Other",
    title: humanize(code),
    ownerModule: category ? OWNER_MODULE[category] : "Night Audit",
  };
}

/** Default owner-module link for a stored exception. Live issue routes override it when present. */
export function exceptionDefaultSource(exceptionType: string, businessDate: string): ExceptionSource | null {
  const { code, category } = exceptionMeta(exceptionType);
  if (code === "checked_in_without_room" || code === "room_double_occupancy") {
    return { route: "/restaurant/pms/front-office", search: { tab: "inhouse", date: businessDate } };
  }
  if (code === "next_date_restriction") {
    return { route: "/restaurant/pms/rates-revenue", search: { view: "restrictions" } };
  }
  switch (category) {
    case "folios":
    case "invoices":
    case "payments":
    case "accounts":
    case "tax":
    case "fiscal":
      return { route: "/restaurant/pms/cashiering", search: { tab: "folios" } };
    case "drawers":
      return { route: "/restaurant/pms/cashiering", search: { tab: "cashier-shift" } };
    case "arrivals":
      return { route: "/restaurant/pms/front-office", search: { tab: "arrivals", date: businessDate } };
    case "departures":
      return { route: "/restaurant/pms/front-office", search: { tab: "departures", date: businessDate } };
    case "rooms":
    case "housekeeping":
      return { route: "/restaurant/pms/housekeeping", search: { tab: "board" } };
    case "overbooking":
      return { route: "/restaurant/pms/room-inventory", search: { tab: "overbooking" } };
    case "distribution":
      return { route: "/restaurant/pms/distribution" };
    case "revenue":
      return { route: "/restaurant/pms/rates-revenue", search: { view: "approvals" } };
    case "services":
      return { route: "/restaurant/pms/guest-services" };
    default:
      return null;
  }
}

export type ExceptionStatus = "open" | "resolved" | "ignored";

export function exceptionStatusLabel(status: ExceptionStatus): string {
  if (status === "open") return "Open";
  if (status === "resolved") return "Resolved";
  return "Ignored (legacy)";
}

export type WorkflowException = {
  id: string;
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
  status: ExceptionStatus;
  createdAt?: string | null;
  resolvedAt: string | null;
};

export type ExceptionFilter = {
  status: "all" | ExceptionStatus;
  severity: "all" | "blocking" | "warning";
  domain: "all" | ExceptionDomain;
  category: "all" | ExceptionCategory;
  search: string;
};

export const DEFAULT_EXCEPTION_FILTER: ExceptionFilter = {
  status: "open",
  severity: "all",
  domain: "all",
  category: "all",
  search: "",
};

/** Entry filter for a Control Center or Run & Close link into Exceptions. */
export function exceptionFilterForFocus(focus: string | undefined): ExceptionFilter {
  if (focus === "blockers") return { ...DEFAULT_EXCEPTION_FILTER, severity: "blocking" };
  if (focus === "warnings") return { ...DEFAULT_EXCEPTION_FILTER, severity: "warning" };
  if (focus === "financial" || focus === "operations") return { ...DEFAULT_EXCEPTION_FILTER, domain: focus };
  return DEFAULT_EXCEPTION_FILTER;
}

export function filterExceptions<T extends WorkflowException>(rows: readonly T[], filter: ExceptionFilter): T[] {
  const needle = filter.search.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (filter.status !== "all" && row.status !== filter.status) return false;
      if (filter.severity !== "all" && row.severity !== filter.severity) return false;
      const meta = exceptionMeta(row.exceptionType);
      if (filter.domain !== "all" && meta.domain !== filter.domain) return false;
      if (filter.category !== "all" && meta.category !== filter.category) return false;
      if (!needle) return true;
      return `${meta.title} ${meta.categoryLabel} ${row.message} ${row.referenceId ?? ""}`.toLowerCase().includes(needle);
    })
    .sort(
      (a, b) =>
        Number(a.status !== "open") - Number(b.status !== "open") ||
        Number(a.severity !== "blocking") - Number(b.severity !== "blocking") ||
        a.exceptionType.localeCompare(b.exceptionType) ||
        a.id.localeCompare(b.id),
    );
}

export function exceptionCounts(rows: readonly WorkflowException[]): {
  blocking: number;
  warnings: number;
  open: number;
  resolved: number;
} {
  const open = rows.filter((row) => row.status === "open");
  return {
    blocking: open.filter((row) => row.severity === "blocking").length,
    warnings: open.filter((row) => row.severity === "warning").length,
    open: open.length,
    resolved: rows.filter((row) => row.status === "resolved").length,
  };
}

/** Hard blockers never take a manual status. Owner modules fix the source. */
export function exceptionAllowsManualStatus(row: Pick<WorkflowException, "severity">): boolean {
  return row.severity !== "blocking";
}

/** A closed run's exceptions are history. Only an open or ready run is synced. */
export function canSyncRunExceptions(runStatus: string): boolean {
  return runStatus === "open" || runStatus === "ready";
}

/* ------------------------------------------------------------- readiness */

export const OVERALL_STATUS_LABEL: Record<NightAuditOverallStatus, string> = {
  closed: "CLOSED",
  blocked: "BLOCKED",
  unavailable: "UNAVAILABLE",
  warning: "WARNING",
  ready: "READY",
};

export type DomainStatus = "ready" | "warning" | "blocked" | "unavailable" | "loading";

export function domainStatusLabel(status: DomainStatus): string {
  return status === "loading" ? "Checking…" : status.toUpperCase();
}

/** If the Financial or Operations read fails on this screen, Overall is Unavailable until a recheck succeeds. */
export function effectiveOverallStatus(input: {
  server: NightAuditOverallStatus | null;
  financial: DomainStatus;
  operational: DomainStatus;
}): NightAuditOverallStatus | null {
  if (input.server === "closed") return "closed";
  if (input.financial === "unavailable" || input.operational === "unavailable") return "unavailable";
  return input.server;
}

export type ControlPrimaryAction =
  | { kind: "review-blocker"; label: "Review First Blocker" }
  | { kind: "review-close"; label: "Review & Close" }
  | { kind: "run-close"; label: "Run & Close" }
  | { kind: "retry"; label: "Retry Checks" }
  | { kind: "view-run"; label: "View Run" };

export function controlPrimaryAction(status: NightAuditOverallStatus): ControlPrimaryAction {
  if (status === "closed") return { kind: "view-run", label: "View Run" };
  if (status === "blocked") return { kind: "review-blocker", label: "Review First Blocker" };
  if (status === "unavailable") return { kind: "retry", label: "Retry Checks" };
  if (status === "warning") return { kind: "review-close", label: "Review & Close" };
  return { kind: "run-close", label: "Run & Close" };
}

export type NightAuditRunState = "Not Started" | "In Progress" | "Ready" | "Blocked" | "Closed";

/** Stored run status plus the current server readiness. No step engine. */
export function nightAuditRunState(input: {
  runStatus: "open" | "ready" | "closed" | "failed" | null;
  overall: NightAuditOverallStatus | null;
}): NightAuditRunState {
  if (!input.runStatus) return "Not Started";
  if (input.runStatus === "closed") return "Closed";
  if (input.overall === "blocked") return "Blocked";
  if (input.overall === "ready" || input.overall === "warning") return "Ready";
  return "In Progress";
}

export type CloseGateInput = {
  overall: NightAuditOverallStatus | null;
  financial: DomainStatus;
  operational: DomainStatus;
  openBlockingExceptions: number;
  boardBlockers: number;
  canClose: boolean;
  busy: boolean;
  runStatus: "open" | "ready" | "closed" | "failed";
  rechecked: boolean;
  phone?: boolean;
};

export type CloseGate = { enabled: boolean; reason: string };

/**
 * The Close Business Date button. Warnings never hold it. The server repeats
 * every check before close_business_date, so this only avoids a doomed click.
 */
export function closeGate(input: CloseGateInput): CloseGate {
  const hold = (reason: string): CloseGate => ({ enabled: false, reason });
  if (input.runStatus === "closed" || input.overall === "closed") return hold("This business date is closed.");
  if (input.runStatus !== "open" && input.runStatus !== "ready") return hold("This run cannot be closed.");
  if (!input.canClose) return hold("Only an owner or manager can close the business date.");
  if (input.phone) return hold("Use desktop to close");
  if (input.busy) return hold("Closing…");
  if (input.financial === "loading" || input.operational === "loading" || input.overall == null) {
    return hold("Checks are still running.");
  }
  if (input.financial === "unavailable") return hold("Financial reconciliation is unavailable. Close stays blocked.");
  if (input.operational === "unavailable") return hold("Operational reconciliation is unavailable. Close stays blocked.");
  if (input.financial === "blocked") return hold("Financial blockers must be cleared in the owner module.");
  if (input.operational === "blocked") return hold("Operational blockers must be cleared in the owner module.");
  if (input.boardBlockers > 0) return hold("Live blockers are still open.");
  if (input.openBlockingExceptions > 0) return hold("Blocking exceptions are still open for this business date.");
  if (input.overall === "unavailable") return hold("A required Night Audit check is unavailable. Close stays blocked.");
  if (input.overall === "blocked") return hold("Blockers are still open.");
  if (!input.rechecked) return hold("Run Final Recheck before closing.");
  return { enabled: true, reason: input.overall === "warning" ? "Ready · warnings do not block close" : "Ready to close" };
}

export const CLOSE_CONFIRM_COPY =
  "Closing this business date will advance the hotel to the next business date. This action cannot be reversed from Night Audit.";

export function closeTargetDates(businessDate: string): { current: string; next: string } {
  return { current: businessDate, next: nextBusinessDate(businessDate) };
}

/* ------------------------------------------------------------ close result */

/** The run row as close_business_date stores and returns it. */
export type PersistedCloseRow = {
  business_date: string;
  status: string;
  closed_at: string | null;
  closed_by_membership_id: string | null;
  summary: { nextBusinessDate?: string; warnings?: number; closeRequestId?: string } | null;
};

/**
 * True only for the request whose summary close_business_date wrote. The RPC
 * returns an already-closed run unchanged, so a losing concurrent request gets
 * back the winner's request id, even when the same user sent both.
 */
export function closedByThisRequest(row: PersistedCloseRow | null, closeRequestId: string): boolean {
  return row?.status === "closed" && row.summary?.closeRequestId === closeRequestId;
}

/** Close facts from the persisted run only. Never from the current caller. */
export function persistedCloseFacts(row: PersistedCloseRow): {
  businessDate: string;
  nextBusinessDate: string;
  closedAt: string | null;
  closedByMembershipId: string | null;
  warningCount: number | null;
} {
  return {
    businessDate: row.business_date,
    nextBusinessDate: row.summary?.nextBusinessDate ?? nextBusinessDate(row.business_date.slice(0, 10)),
    closedAt: row.closed_at,
    closedByMembershipId: row.closed_by_membership_id,
    warningCount: typeof row.summary?.warnings === "number" ? row.summary.warnings : null,
  };
}

export const ALREADY_CLOSED_TITLE = "Business Date Already Closed";
export const ALREADY_CLOSED_COPY = "This business date was already closed.";

export type OtbStatus = "captured" | "already_present" | "failed";

export function otbStatusLabel(status: OtbStatus | null | undefined): string {
  if (status === "captured" || status === "already_present") return "Captured";
  if (status === "failed") return "Failed";
  return "Not captured";
}

export type CloseResultView = {
  title: "Night Audit Complete" | typeof ALREADY_CLOSED_TITLE;
  closedBusinessDate: string;
  newBusinessDate: string;
  alreadyClosed: boolean;
  otb: string;
  otbFailed: boolean;
  otbNotice: string | null;
};

export function closeResultView(result: {
  businessDate: string;
  nextBusinessDate: string;
  alreadyClosed: boolean;
  otbSnapshotStatus?: OtbStatus | null;
}): CloseResultView {
  const otbFailed = result.otbSnapshotStatus === "failed";
  return {
    title: result.alreadyClosed ? ALREADY_CLOSED_TITLE : "Night Audit Complete",
    closedBusinessDate: result.businessDate,
    newBusinessDate: result.nextBusinessDate,
    alreadyClosed: result.alreadyClosed,
    otb: otbStatusLabel(result.otbSnapshotStatus),
    otbFailed,
    otbNotice: otbFailed ? "Business date advanced successfully. OTB snapshot failed." : null,
  };
}

/** Retry only right after the close, before another date closes. Insert-once capture never duplicates. */
export function canRetryOtbSnapshot(input: {
  runStatus: string;
  runBusinessDate: string;
  persistedBusinessDate: string | null;
}): boolean {
  return (
    input.runStatus === "closed" &&
    input.persistedBusinessDate != null &&
    input.persistedBusinessDate === nextBusinessDate(input.runBusinessDate)
  );
}

/* ---------------------------------------------------------------- history */

export const HISTORY_STATUSES = ["open", "ready", "closed", "failed"] as const;
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];
export const HISTORY_PAGE_SIZES = [10, 25, 50] as const;
export type HistoryPageSize = (typeof HISTORY_PAGE_SIZES)[number];
export const DEFAULT_HISTORY_PAGE_SIZE: HistoryPageSize = 25;

export type HistoryFilter = {
  status: "all" | HistoryStatus;
  from: string;
  to: string;
  closedBy: string;
  search: string;
  page: number;
  pageSize: HistoryPageSize;
};

export const DEFAULT_HISTORY_FILTER: HistoryFilter = {
  status: "all",
  from: "",
  to: "",
  closedBy: "",
  search: "",
  page: 1,
  pageSize: DEFAULT_HISTORY_PAGE_SIZE,
};

/** "No runs match filters" only when a filter is set; otherwise an empty list is "No runs yet". */
export function historyFiltersActive(filter: HistoryFilter): boolean {
  return Boolean(filter.status !== "all" || filter.from || filter.to || filter.closedBy || filter.search.trim());
}

export function historyStatusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "ready") return "Ready";
  if (status === "closed") return "Closed";
  if (status === "failed") return "Failed";
  return status ? humanize(status) : "—";
}

export function parseHistoryPageSize(value: unknown): HistoryPageSize {
  const n = typeof value === "number" ? value : Number(value);
  return n === 10 || n === 25 || n === 50 ? n : DEFAULT_HISTORY_PAGE_SIZE;
}

export function historyRange(page: number, pageSize: HistoryPageSize): { from: number; to: number; page: number } {
  const current = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (current - 1) * pageSize;
  return { from, to: from + pageSize - 1, page: current };
}

/** Date-like search becomes a business-date range. Anything else matches staff names. */
export function historySearchDates(search: string): { from: string; to: string } | null {
  const text = search.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) return { from: text, to: text };
  const month = /^(\d{4})-(\d{2})$/.exec(text);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${text}-01`, to: `${text}-${String(last).padStart(2, "0")}` };
  }
  const year = /^(\d{4})$/.exec(text);
  if (year) return { from: `${text}-01-01`, to: `${text}-12-31` };
  return null;
}

/** Stored summary count, or null when the run was closed before that field existed. */
export function summaryCount(summary: object | null | undefined, key: string): number | null {
  if (!summary) return null;
  const value = (summary as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatSummaryCount(value: number | null): string {
  return value == null ? "Not captured" : String(value);
}

/* ---------------------------------------------------------------- reports */

export type NightAuditReportLink = {
  id: "police" | "cashier-invoice" | "meal-service" | "service-fulfillment";
  label: string;
  to: "/restaurant/pms/reports";
  search: Record<string, string>;
};

/** Report links for one closed business date. The date is the stored run date, never today. */
export function nightAuditReportLinks(closedBusinessDate: string): NightAuditReportLink[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closedBusinessDate)) return [];
  return [
    {
      id: "police",
      label: "Police / Guest Stay",
      to: "/restaurant/pms/reports",
      search: { report: "police", stayDate: closedBusinessDate },
    },
    {
      id: "cashier-invoice",
      label: "Cashier Invoice",
      to: "/restaurant/pms/reports",
      search: { report: "cashier-invoice", from: closedBusinessDate, to: closedBusinessDate },
    },
    {
      id: "meal-service",
      label: "Meal Service",
      to: "/restaurant/pms/reports",
      search: { report: "meal-service", serviceDate: closedBusinessDate },
    },
    {
      id: "service-fulfillment",
      label: "Service Fulfillment",
      to: "/restaurant/pms/reports",
      search: { report: "service-fulfillment", serviceDate: closedBusinessDate },
    },
  ];
}

/* -------------------------------------------------------------- redaction */

const FINANCIAL_CHECK_AREAS = new Set(["Folios", "Payments & Revenue", "Cashier Shifts"]);

export function canViewNightAuditOperationalDetail(role: string): boolean {
  return (NIGHT_AUDIT_OPERATIONAL_DETAIL_ROLES as readonly string[]).includes(role);
}

/**
 * Run summary as one role may see it. Counts stay. Money, tax totals, and
 * financial check text are removed for roles without NA-P2 financial detail.
 */
export function presentRunSummary<T extends object>(summary: T | null, role: string): T | null {
  if (!summary || canViewNightAuditFinancialDetail(role)) return summary;
  const copy = { ...(summary as Record<string, unknown>) };
  delete copy["finance"];
  delete copy["taxByCurrency"];
  const checks = copy["checks"];
  if (Array.isArray(checks)) {
    copy["checks"] = (checks as Array<{ area?: string }>).filter((check) => !FINANCIAL_CHECK_AREAS.has(check.area ?? ""));
  }
  return copy as T;
}

/** Stored exception text as one role may see it. Financial text can carry amounts; stay text carries guests. */
export function presentExceptionMessage(exceptionType: string, message: string, role: string): string {
  const meta = exceptionMeta(exceptionType);
  if (meta.domain === "financial" && !canViewNightAuditFinancialDetail(role)) return `${meta.title} · details hidden`;
  if (meta.domain === "operations" && !canViewNightAuditOperationalDetail(role)) return `${meta.title} · details hidden`;
  return message;
}
