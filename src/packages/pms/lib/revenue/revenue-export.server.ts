/**
 * Revenue & Audit CSV Export Server Models (P8-STEP-02).
 *
 * Implements RFC-4180 compliant CSV exports with spreadsheet formula injection protection.
 * Enforces strict 10,000 row safety bounds for audit logs.
 */

import { rateError } from "../rates.server.ts";
import type { RevenuePerformanceQuery } from "./revenue-analytics.ts";
import {
  loadCommercialPerformance,
  loadRevenuePerformanceOverview,
} from "./revenue-analytics.server.ts";
import type { UnifiedRevenueAuditFilter } from "./revenue-audit.ts";
import { loadUnifiedRevenueAudit } from "./revenue-audit.server.ts";
import {
  buildCommercialPerformanceCsv,
  buildRevenuePerformanceCsv,
  buildUnifiedAuditCsv,
  MAX_AUDIT_EXPORT_ROWS,
} from "./revenue-export.ts";

export * from "./revenue-export.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type ExportCsvResult = {
  filename: string;
  csv: string;
  rowCount: number;
};

export async function exportRevenuePerformance(
  db: DbClient,
  query: RevenuePerformanceQuery,
): Promise<ExportCsvResult> {
  const overview = await loadRevenuePerformanceOverview(db, query);
  const csv = buildRevenuePerformanceCsv(overview);
  const filename = `revenue-performance-${overview.fromDate}-to-${overview.toDate}.csv`;
  const rowCount =
    overview.dailyTrend.length +
    overview.breakdowns.roomTypes.length +
    overview.breakdowns.ratePlans.length;
  return { filename, csv, rowCount };
}

export async function exportCommercialPerformance(
  db: DbClient,
  query: {
    restaurantId: string;
    fromDate: string;
    toDate: string;
    roomTypeId?: string | null;
    ratePlanId?: string | null;
  },
): Promise<ExportCsvResult> {
  const perf = await loadCommercialPerformance(db, query);
  const csv = buildCommercialPerformanceCsv(perf);
  const filename = `commercial-performance-${perf.fromDate}-to-${perf.toDate}.csv`;
  const rowCount = perf.promotions.length + perf.packages.length;
  return { filename, csv, rowCount };
}

export async function exportUnifiedRevenueAudit(
  db: DbClient,
  filter: UnifiedRevenueAuditFilter,
): Promise<ExportCsvResult> {
  // Query all matching entries with page=1, pageSize=MAX_AUDIT_EXPORT_ROWS + 1 to check limit
  const result = await loadUnifiedRevenueAudit(db, {
    ...filter,
    page: 1,
    pageSize: MAX_AUDIT_EXPORT_ROWS + 1,
  });

  if (result.total > MAX_AUDIT_EXPORT_ROWS) {
    throw rateError("AUDIT_EXPORT_TOO_LARGE");
  }

  const csv = buildUnifiedAuditCsv(result.entries);
  const timestampStr = new Date().toISOString().slice(0, 10);
  const filename = `revenue-audit-export-${timestampStr}.csv`;
  return { filename, csv, rowCount: result.entries.length };
}
