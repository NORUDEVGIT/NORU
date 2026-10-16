/**
 * Reports Phase 0 shell. Catalogue codes are the live readers only.
 * This module does not execute query_key and does not export or schedule.
 */

export const REPORT_CATEGORIES = [
  { id: "operational", label: "Operational" },
  { id: "financial", label: "Financial" },
  { id: "rooms", label: "Rooms" },
  { id: "revenue", label: "Revenue" },
  { id: "management", label: "Management" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["id"];

export const REPORT_CATALOGUE = [
  {
    code: "operational",
    category: "operational",
    name: "Operational",
    reader: "getBookingsDashboard",
    caption:
      "Stay dates on the house date; includes pending and confirmed. The occupancy percent is that staying count divided by rooms with status available. It is not booked occupancy.",
    ownerLabel: "Open Front Office",
    ownerTo: "/restaurant/pms/front-office",
  },
  {
    code: "financial",
    category: "financial",
    name: "Financial",
    reader: "getCashieringDashboard",
    caption:
      "Outstanding balance is the sum of open folio amounts, all dates. Charges, payments, deposits, and refunds are the posted_at UTC day of the date sent to the cashiering dashboard.",
    ownerLabel: "Open Cashiering",
    ownerTo: "/restaurant/pms/cashiering",
  },
  {
    code: "rooms",
    category: "rooms",
    name: "Rooms",
    reader: "getHousekeepingDashboard",
    caption: "Point-in-time room status.",
    ownerLabel: "Open Housekeeping",
    ownerTo: "/restaurant/pms/housekeeping",
  },
  {
    code: "revenue",
    category: "revenue",
    name: "Revenue",
    reader: "getRevenueOverview",
    caption:
      "Booked stay overlap. Figures come from getRevenueOverview through computeBookedRevenueOverview. Not posted folio revenue.",
    ownerLabel: "Open Rate & Revenue",
    ownerTo: "/restaurant/pms/rates-revenue",
  },
  {
    code: "management",
    category: "management",
    name: "Management",
    reader: "listNightAuditRuns",
    caption:
      "Rows are night_audit_runs.business_date. This list shows at most 10 of the 60 runs the server returns.",
    ownerLabel: "Open Night Audit",
    ownerTo: "/restaurant/pms/night-audit",
  },
] as const;

export type ReportCode = (typeof REPORT_CATALOGUE)[number]["code"];
export type ReportDefinition = (typeof REPORT_CATALOGUE)[number];

export const REPORTS_DESK_EYEBROW = "Analytics";
export const REPORTS_DESK_TITLE = "Reports";
export const REPORTS_NIGHT_AUDIT_DISPLAY_LIMIT = 10;
export const REPORTS_NIGHT_AUDIT_SERVER_LIMIT = 60;

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
]);

export function reportByCode(code: string | null | undefined): ReportDefinition | null {
  if (!code || HELD_CODES.has(code)) return null;
  return REPORT_CATALOGUE.find((row) => row.code === code) ?? null;
}

export function reportsForCategory(category: ReportCategory): ReportDefinition[] {
  return REPORT_CATALOGUE.filter((row) => row.category === category);
}

export function filterReports(query: string, category: ReportCategory | null): ReportDefinition[] {
  const needle = query.trim().toLowerCase();
  return REPORT_CATALOGUE.filter((row) => {
    if (category && row.category !== category) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.code.includes(needle) ||
      row.reader.toLowerCase().includes(needle)
    );
  });
}

export type ReportsView =
  | { tab: "center"; category: ReportCategory | null }
  | { tab: "report"; report: ReportCode };

function categoryOrNull(value: string | null | undefined): ReportCategory | null {
  if (!value) return null;
  return REPORT_CATEGORIES.some((row) => row.id === value) ? (value as ReportCategory) : null;
}

export function resolveReportsView(search: {
  tab?: string | null;
  report?: string | null;
  category?: string | null;
}): ReportsView {
  const tab = search.tab ?? "";
  if (tab === "occupancy") return { tab: "report", report: "operational" };
  const fromReport = reportByCode(search.report);
  if (tab === "report" && fromReport) return { tab: "report", report: fromReport.code };
  const tabAsReport = reportByCode(tab);
  if (tabAsReport) return { tab: "report", report: tabAsReport.code };
  return { tab: "center", category: categoryOrNull(search.category) };
}

export function reportsSearch(view: ReportsView): {
  tab: "center" | "report";
  report?: ReportCode;
  category?: ReportCategory;
} {
  if (view.tab === "report") return { tab: "report", report: view.report };
  if (view.category) return { tab: "center", category: view.category };
  return { tab: "center" };
}

/** Date string passed to existing readers. Callers must supply the resolved house date. */
export function reportsReaderDate(businessDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("Reports requires a house business date.");
  }
  return businessDate;
}
