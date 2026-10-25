/**
 * PMS Reports catalogue and URL state.
 *
 * Analytics dashboards and row-level reports are separate catalogue kinds.
 * This module does not query guests, invoices, or service entitlements,
 * and it does not export files.
 *
 * Card 7 stores report policy flags and permission codes. The live shell does
 * not enforce them. Server read functions in later phases remain the
 * security boundary. UI capability flags are hints only.
 *
 * Stored and currently unused policy columns on pms_report_policies:
 * export_allowed, export_csv, export_pdf, mask_guest_names,
 * owner_manager_export_only, default_date_range_days, schedule_intent_enabled,
 * schedule_cadence, period_basis.
 *
 * Stored permission codes that are not consulted by this shell:
 * reports.pms.view, reports.pms.export, reports.pms.print.
 *
 * External submission codes (including government) stay unresolved. They are
 * not aliases for the internal Police / Guest Stay register.
 */

export const REPORT_STATUSES = ["LIVE", "PLACEHOLDER", "COMING_SOON", "DISABLED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_GROUPS = [
  {
    id: "analytics",
    label: "Analytics",
    description: "Live dashboards from existing PMS readers.",
  },
  {
    id: "guest-stay",
    label: "Guest & Stay",
    description: "Stay registers for property staff.",
  },
  {
    id: "financial-reports",
    label: "Financial Reports",
    description: "Issued financial documents.",
  },
  {
    id: "operations",
    label: "Operations",
    description: "Meal lists and operational service handoff.",
  },
] as const;

export type ReportGroupId = (typeof REPORT_GROUPS)[number]["id"];

/** Analytics topics. These are not row-level report groups. */
export const REPORT_CATEGORIES = [
  { id: "operational", label: "Operational" },
  { id: "financial", label: "Financial" },
  { id: "rooms", label: "Rooms" },
  { id: "revenue", label: "Revenue" },
  { id: "management", label: "Management" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["id"];

export const REPORT_ICONS = [
  "calendar",
  "wallet",
  "bed",
  "trend",
  "clipboard",
  "stay",
  "receipt",
] as const;
export type ReportIcon = (typeof REPORT_ICONS)[number];

export const REPORT_PAGE_SIZES = [10, 25, 50] as const;
export type ReportPageSize = (typeof REPORT_PAGE_SIZES)[number];
export const DEFAULT_REPORT_PAGE_SIZE: ReportPageSize = 25;

/**
 * Columns on pms_report_policies and permission codes that are stored only.
 * Police print and Excel do not read them. Access is requireReservationManager.
 */
export const STORED_UNUSED_REPORT_POLICY_FLAGS = [
  "export_allowed",
  "export_csv",
  "export_pdf",
  "mask_guest_names",
  "owner_manager_export_only",
  "default_date_range_days",
  "schedule_intent_enabled",
  "schedule_cadence",
  "period_basis",
] as const;

export const STORED_REPORT_PERMISSION_CODES = [
  "reports.pms.view",
  "reports.pms.export",
  "reports.pms.print",
] as const;

export type ReportPermissionSlot = {
  /** Permission code to consult later. Null means this report has no code wired yet. */
  view: string | null;
  print: string | null;
  export: string | null;
};

export type ReportCapability = {
  canView: boolean;
  canPrint: boolean;
  canExport: boolean;
};

type ReportBase = {
  id: string;
  code: string;
  title: string;
  name: string;
  description: string;
  caption: string;
  group: ReportGroupId;
  status: ReportStatus;
  icon: ReportIcon;
  supportsPrint: boolean;
  supportsPdf: boolean;
  supportsExcel: boolean;
  permissions: ReportPermissionSlot;
  placeholderNote: string | null;
};

export type AnalyticsReportId = "operational" | "financial" | "rooms" | "revenue" | "management";

export type RowReportId =
  "police" | "cashier-invoice" | "fiscal-registration" | "meal-service" | "service-fulfillment";
export type ReportId = AnalyticsReportId | RowReportId;

export type AnalyticsReportDefinition = ReportBase & {
  kind: "analytics";
  id: AnalyticsReportId;
  code: AnalyticsReportId;
  category: ReportCategory;
  reader: string;
  ownerLabel: string;
  ownerTo:
    | "/restaurant/pms/front-office"
    | "/restaurant/pms/cashiering"
    | "/restaurant/pms/housekeeping"
    | "/restaurant/pms/rates-revenue"
    | "/restaurant/pms/night-audit";
};

export type RowReportDefinition = ReportBase & {
  kind: "row";
  id: RowReportId;
  code: RowReportId;
};

export type ReportDefinition = AnalyticsReportDefinition | RowReportDefinition;

const analyticsPermissions: ReportPermissionSlot = {
  view: null,
  print: null,
  export: null,
};

export const REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "analytics",
    id: "operational",
    code: "operational",
    group: "analytics",
    category: "operational",
    status: "LIVE",
    icon: "calendar",
    title: "Operational",
    name: "Operational",
    description: "Arrivals, departures, and in-house counts for the house date.",
    caption:
      "Stay dates on the house date; includes pending and confirmed. The occupancy percent is that staying count divided by rooms with status available. It is not booked occupancy.",
    reader: "getBookingsDashboard",
    ownerLabel: "Open Front Office",
    ownerTo: "/restaurant/pms/front-office",
    supportsPrint: false,
    supportsPdf: false,
    supportsExcel: false,
    permissions: analyticsPermissions,
    placeholderNote: null,
  },
  {
    kind: "analytics",
    id: "financial",
    code: "financial",
    group: "analytics",
    category: "financial",
    status: "LIVE",
    icon: "wallet",
    title: "Financial",
    name: "Financial",
    description: "Cashiering activity for the hotel business date.",
    caption:
      "Outstanding balance is the sum of open folio amounts, all dates. Charges, payments, deposits, and refunds are the property-timezone day of the hotel business date. Payments do not include deposits.",
    reader: "getCashieringDashboard",
    ownerLabel: "Open Cashiering",
    ownerTo: "/restaurant/pms/cashiering",
    supportsPrint: false,
    supportsPdf: false,
    supportsExcel: false,
    permissions: analyticsPermissions,
    placeholderNote: null,
  },
  {
    kind: "analytics",
    id: "rooms",
    code: "rooms",
    group: "analytics",
    category: "rooms",
    status: "LIVE",
    icon: "bed",
    title: "Rooms",
    name: "Rooms",
    description: "Point-in-time room and housekeeping status.",
    caption: "Point-in-time room status.",
    reader: "getHousekeepingDashboard",
    ownerLabel: "Open Housekeeping",
    ownerTo: "/restaurant/pms/housekeeping",
    supportsPrint: false,
    supportsPdf: false,
    supportsExcel: false,
    permissions: analyticsPermissions,
    placeholderNote: null,
  },
  {
    kind: "analytics",
    id: "revenue",
    code: "revenue",
    group: "analytics",
    category: "revenue",
    status: "LIVE",
    icon: "trend",
    title: "Revenue",
    name: "Revenue",
    description: "Booked occupancy, ADR, and RevPAR.",
    caption:
      "Booked stay overlap. Figures come from getRevenueOverview through computeBookedRevenueOverview. Not posted folio revenue.",
    reader: "getRevenueOverview",
    ownerLabel: "Open Rate & Revenue",
    ownerTo: "/restaurant/pms/rates-revenue",
    supportsPrint: false,
    supportsPdf: false,
    supportsExcel: false,
    permissions: analyticsPermissions,
    placeholderNote: null,
  },
  {
    kind: "analytics",
    id: "management",
    code: "management",
    group: "analytics",
    category: "management",
    status: "LIVE",
    icon: "clipboard",
    title: "Management",
    name: "Management",
    description: "Recent night audit runs.",
    caption:
      "Rows are night_audit_runs.business_date. This list shows at most 10 of the 60 runs the server returns.",
    reader: "listNightAuditRuns",
    ownerLabel: "Open Night Audit",
    ownerTo: "/restaurant/pms/night-audit",
    supportsPrint: false,
    supportsPdf: false,
    supportsExcel: false,
    permissions: analyticsPermissions,
    placeholderNote: null,
  },
  {
    kind: "row",
    id: "police",
    code: "police",
    group: "guest-stay",
    status: "LIVE",
    icon: "stay",
    title: "Police / Guest Stay Report",
    name: "Police / Guest Stay Report",
    description: "Named guests staying at the property for the selected business date.",
    caption: "Named guests staying at the property for the selected business date.",
    supportsPrint: true,
    supportsPdf: true,
    supportsExcel: true,
    permissions: { view: null, print: null, export: null },
    placeholderNote: null,
  },
  {
    kind: "row",
    id: "cashier-invoice",
    code: "cashier-invoice",
    group: "financial-reports",
    status: "LIVE",
    icon: "receipt",
    title: "Cashier Invoice Report",
    name: "Cashier Invoice Report",
    description: "Issued guest and account invoice register.",
    caption: "Issued guest and account invoice register.",
    supportsPrint: true,
    supportsPdf: true,
    supportsExcel: true,
    permissions: { view: null, print: null, export: null },
    placeholderNote: null,
  },
  {
    kind: "row",
    id: "fiscal-registration",
    code: "fiscal-registration",
    group: "financial-reports",
    status: "LIVE",
    icon: "clipboard",
    title: "Fiscal Registration Report",
    name: "Fiscal Registration Report",
    description: "Provider fiscal registrations for invoices, notes, and sales receipts.",
    caption: "Provider fiscal registrations for invoices, notes, and sales receipts.",
    supportsPrint: true,
    supportsPdf: true,
    supportsExcel: true,
    permissions: { view: null, print: null, export: null },
    placeholderNote: null,
  },
  {
    kind: "row",
    id: "meal-service",
    code: "meal-service",
    group: "operations",
    status: "LIVE",
    icon: "bed",
    title: "Meal Service",
    name: "Meal Service",
    description: "Operational meal entitlements by service date.",
    caption: "Operational meal entitlements by service date.",
    supportsPrint: true,
    supportsPdf: true,
    supportsExcel: true,
    permissions: { view: null, print: null, export: null },
    placeholderNote: null,
  },
  {
    kind: "row",
    id: "service-fulfillment",
    code: "service-fulfillment",
    group: "operations",
    status: "LIVE",
    icon: "clipboard",
    title: "Service Fulfillment",
    name: "Service Fulfillment",
    description: "Reservation services due for operational delivery.",
    caption: "Reservation services due for operational delivery.",
    supportsPrint: true,
    supportsPdf: true,
    supportsExcel: true,
    permissions: { view: null, print: null, export: null },
    placeholderNote: null,
  },
];

export type ReportCode = ReportId;

/** Codes that must not open a report. Legacy tab=occupancy still opens Operational. */
const HELD_CODES = new Set([
  "government",
  "invoices",
  "invoice",
  "city-ledger",
  "city_ledger",
  "custom",
  "scheduled",
  "schedule",
  "occupancy",
  "meal-plan",
  "packages",
]);

const REPORT_ALIASES: Record<string, ReportId> = {
  cashier: "cashier-invoice",
  fiscal: "fiscal-registration",
  breakfast: "meal-service",
  meal: "meal-service",
};

export const REPORTS_DESK_EYEBROW = "Reports";
export const REPORTS_DESK_TITLE = "Reports";
export const REPORTS_NIGHT_AUDIT_DISPLAY_LIMIT = 10;
export const REPORTS_NIGHT_AUDIT_SERVER_LIMIT = 60;

export const REPORT_SURFACE_COPY = {
  loading: "Loading report…",
  emptyTitle: "No matching records",
  emptyBody: "Try changing the report filters.",
  errorTitle: "The report could not be loaded.",
  errorBody:
    "This is not an empty report. Try again, or return to the catalogue if the problem continues.",
  noAccessTitle: "You do not have permission to view this report.",
  missingTitle: "This report is not available.",
  missingBody: "Choose a report from the catalogue.",
} as const;

export type ReportsRouteSearch = {
  tab?: string;
  report?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  stayDate?: string;
  from?: string;
  to?: string;
  documentType?: string;
  grain?: string;
  query?: string;
  issuer?: string;
  mode?: string;
  status?: string;
  serviceDate?: string;
  meal?: string;
  department?: string;
  stay?: string;
  presence?: "IN_HOUSE" | "HISTORICAL";
  name?: string;
  nationality?: string;
  room?: string;
};

export type ReportsView =
  | { kind: "center"; group: ReportGroupId | null; topic: ReportCategory | null }
  | { kind: "analytics"; report: AnalyticsReportId }
  | { kind: "row"; report: RowReportId; page: number; pageSize: ReportPageSize }
  | { kind: "missing"; requested: string };

export type ReportExportKind = "print" | "pdf" | "excel";

export type ReportExportAudit = {
  reportId: string;
  kind: ReportExportKind;
};

const SEARCH_KEYS = [
  "tab",
  "report",
  "category",
  "page",
  "pageSize",
  "stayDate",
  "from",
  "to",
  "documentType",
  "grain",
  "query",
  "issuer",
  "mode",
  "status",
  "serviceDate",
  "meal",
  "department",
  "stay",
  "presence",
  "name",
  "nationality",
  "room",
] as const;

export function reportByCode(code: string | null | undefined): ReportDefinition | null {
  if (!code || HELD_CODES.has(code)) return null;
  const id = REPORT_ALIASES[code] ?? code;
  return REPORT_CATALOGUE.find((row) => row.id === id) ?? null;
}

export function isAnalyticsReport(report: ReportDefinition): report is AnalyticsReportDefinition {
  return report.kind === "analytics";
}

export function reportsForCategory(category: ReportCategory): AnalyticsReportDefinition[] {
  return REPORT_CATALOGUE.filter(
    (row): row is AnalyticsReportDefinition =>
      row.kind === "analytics" && row.category === category,
  );
}

export function reportGroup(id: string | null | undefined): (typeof REPORT_GROUPS)[number] | null {
  if (!id) return null;
  return REPORT_GROUPS.find((group) => group.id === id) ?? null;
}

export function reportStatusLabel(status: ReportStatus): string | null {
  if (status === "LIVE") return null;
  if (status === "PLACEHOLDER") return "Placeholder";
  if (status === "COMING_SOON") return "Coming soon";
  return "Unavailable";
}

/**
 * UI hint for a row report. Placeholders expose no print or export action
 * because no handler exists yet. Passing canView false shows the no-access
 * state. This function does not read Card 7 policies.
 */
export function rowReportCapability(
  definition: ReportDefinition,
  override?: Partial<ReportCapability>,
): ReportCapability {
  const exportReady =
    definition.kind === "row" &&
    definition.status === "LIVE" &&
    (definition.supportsExcel || definition.supportsPdf);
  const printReady =
    definition.kind === "row" && definition.status === "LIVE" && definition.supportsPrint;
  return {
    canView: override?.canView ?? true,
    canPrint: printReady && (override?.canPrint ?? false),
    canExport: exportReady && (override?.canExport ?? false),
  };
}

/**
 * Returns a runner only when the action is enabled and a real handler exists.
 * Later phases can pass audit before run. A null result must not download anything.
 */
export function bindReportExport(input: {
  reportId: string;
  kind: ReportExportKind;
  enabled: boolean;
  run?: (() => void) | undefined;
  audit?: ((event: ReportExportAudit) => void) | undefined;
}): (() => void) | null {
  if (!input.enabled || !input.run) return null;
  const run = input.run;
  const audit = input.audit;
  return () => {
    audit?.({ reportId: input.reportId, kind: input.kind });
    run();
  };
}

export function filterReports(query: string, scope: string | null): ReportDefinition[] {
  const needle = query.trim().toLowerCase();
  return REPORT_CATALOGUE.filter((row) => {
    if (row.status === "DISABLED") return false;
    if (scope && !reportMatchesScope(row, scope)) return false;
    if (!needle) return true;
    const reader = row.kind === "analytics" ? row.reader : "";
    return (
      row.title.toLowerCase().includes(needle) ||
      row.id.includes(needle) ||
      row.description.toLowerCase().includes(needle) ||
      reader.toLowerCase().includes(needle)
    );
  });
}

function reportMatchesScope(row: ReportDefinition, scope: string): boolean {
  if (scope === row.group) return true;
  return row.kind === "analytics" && row.category === scope;
}

/** Calendar-date check. UTC is used only to reject impossible dates such as month 13. */
export function parseReportDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

export function parseReportPage(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) return 1;
  return parsed;
}

export function parseReportPageSize(value: unknown): ReportPageSize {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (parsed === 10 || parsed === 25 || parsed === 50) return parsed;
  return DEFAULT_REPORT_PAGE_SIZE;
}

function parseToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(token)) return undefined;
  return token;
}

export function parseReportsRouteSearch(search: Record<string, unknown>): ReportsRouteSearch {
  const next: ReportsRouteSearch = {};
  if (typeof search.tab === "string" && search.tab.trim()) next.tab = search.tab.trim();
  if (typeof search.report === "string" && search.report.trim()) next.report = search.report.trim();
  if (typeof search.category === "string" && search.category.trim())
    next.category = search.category.trim();
  if (search.page != null && search.page !== "") next.page = parseReportPage(search.page);
  if (search.pageSize != null && search.pageSize !== "")
    next.pageSize = parseReportPageSize(search.pageSize);
  const stayDate = parseReportDate(search.stayDate);
  const from = parseReportDate(search.from);
  const to = parseReportDate(search.to);
  const documentType = parseToken(search.documentType);
  const grain = parseToken(search.grain);
  if (stayDate) next.stayDate = stayDate;
  if (from) next.from = from;
  if (to) next.to = to;
  if (documentType) next.documentType = documentType;
  if (grain === "summary" || grain === "detail") next.grain = grain;
  const presence = parsePolicePresence(search.presence);
  const name = parseReportText(search.name, 120);
  const nationality = parseReportText(search.nationality, 80);
  const room = parseReportText(search.room, 80);
  const query = parseReportText(search.query, 120);
  const issuer = parseIssuer(search.issuer);
  const mode = parseToken(search.mode);
  const status = parseToken(search.status);
  const serviceDate = parseReportDate(search.serviceDate);
  const meal = parseToken(search.meal);
  const department = parseIssuer(search.department);
  const stay = parseToken(search.stay);
  if (presence) next.presence = presence;
  if (name) next.name = name;
  if (nationality) next.nationality = nationality;
  if (room) next.room = room;
  if (query) next.query = query;
  if (issuer) next.issuer = issuer;
  if (mode === "CASH" || mode === "CREDIT" || mode === "ALL") next.mode = mode;
  if (status) next.status = status.toUpperCase();
  if (serviceDate) next.serviceDate = serviceDate;
  if (meal === "BREAKFAST" || meal === "LUNCH" || meal === "DINNER" || meal === "ALL") {
    next.meal = meal;
  }
  if (department) next.department = department;
  if (stay === "in-house" || stay === "confirmed") next.stay = stay;
  return next;
}

function parseIssuer(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return undefined;
  return token;
}

function parsePolicePresence(value: unknown): "IN_HOUSE" | "HISTORICAL" | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toUpperCase();
  if (token === "IN_HOUSE" || token === "HISTORICAL") return token;
  return undefined;
}

function parseReportText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text.length > 0 ? text : undefined;
}

export function resolveReportsView(search: ReportsRouteSearch): ReportsView {
  const requested = search.report?.trim() || "";
  if (requested) {
    if (HELD_CODES.has(requested)) return { kind: "missing", requested };
    const resolved = reportByCode(requested);
    if (!resolved) return { kind: "missing", requested };
    if (resolved.kind === "analytics") return { kind: "analytics", report: resolved.id };
    return {
      kind: "row",
      report: resolved.id,
      page: parseReportPage(search.page ?? 1),
      pageSize: parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE),
    };
  }

  const tab = search.tab?.trim() || "";
  if (tab === "occupancy") return { kind: "analytics", report: "operational" };
  if (tab && tab !== "center" && tab !== "report") {
    const fromTab = reportByCode(tab);
    if (fromTab?.kind === "analytics") return { kind: "analytics", report: fromTab.id };
    if (fromTab?.kind === "row") {
      return {
        kind: "row",
        report: fromTab.id,
        page: parseReportPage(search.page ?? 1),
        pageSize: parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE),
      };
    }
    if (HELD_CODES.has(tab)) return { kind: "missing", requested: tab };
  }

  const category = search.category?.trim() || "";
  const group = reportGroup(category);
  const topic = REPORT_CATEGORIES.some((row) => row.id === category)
    ? (category as ReportCategory)
    : null;
  return { kind: "center", group: group?.id ?? null, topic: group ? null : topic };
}

export function reportsSearch(
  view: ReportsView,
  preserved?: Partial<
    Pick<
      ReportsRouteSearch,
      | "stayDate"
      | "from"
      | "to"
      | "documentType"
      | "grain"
      | "query"
      | "issuer"
      | "mode"
      | "status"
      | "serviceDate"
      | "meal"
      | "department"
      | "stay"
      | "page"
      | "pageSize"
      | "presence"
      | "name"
      | "nationality"
      | "room"
    >
  >,
): ReportsRouteSearch {
  if (view.kind === "missing") return { report: view.requested };
  if (view.kind === "analytics") return { report: view.report };
  if (view.kind === "row") {
    const search: ReportsRouteSearch = { report: view.report };
    if (preserved?.stayDate) search.stayDate = preserved.stayDate;
    if (preserved?.from) search.from = preserved.from;
    if (preserved?.to) search.to = preserved.to;
    if (preserved?.documentType) search.documentType = preserved.documentType;
    if (preserved?.grain === "detail") search.grain = "detail";
    if (preserved?.query) search.query = preserved.query;
    if (preserved?.issuer) search.issuer = preserved.issuer;
    if (preserved?.mode && preserved.mode !== "ALL") search.mode = preserved.mode;
    if (preserved?.status && preserved.status !== "ALL" && preserved.status !== "OPEN") {
      search.status = preserved.status;
    }
    if (preserved?.serviceDate) search.serviceDate = preserved.serviceDate;
    if (preserved?.meal) search.meal = preserved.meal;
    if (preserved?.department) search.department = preserved.department;
    if (preserved?.stay === "in-house" || preserved?.stay === "confirmed")
      search.stay = preserved.stay;
    if (preserved?.presence === "HISTORICAL") search.presence = "HISTORICAL";
    if (preserved?.name) search.name = preserved.name;
    if (preserved?.nationality) search.nationality = preserved.nationality;
    if (preserved?.room) search.room = preserved.room;
    const page = preserved?.page ?? view.page;
    const pageSize = preserved?.pageSize ?? view.pageSize;
    if (page && page !== 1) search.page = page;
    if (pageSize && pageSize !== DEFAULT_REPORT_PAGE_SIZE) search.pageSize = pageSize;
    return search;
  }
  if (view.group) return { category: view.group };
  if (view.topic) return { category: view.topic };
  return {};
}

export function sameReportsSearch(left: ReportsRouteSearch, right: ReportsRouteSearch): boolean {
  return SEARCH_KEYS.every((key) => (left[key] ?? undefined) === (right[key] ?? undefined));
}

/** Date string passed to existing readers. Callers must supply the resolved house date. */
export function reportsReaderDate(businessDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("Reports requires a house business date.");
  }
  return businessDate;
}
