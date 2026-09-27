/**
 * Revenue & Audit CSV Export Server Models (P8-STEP-02 & P8-STEP-02B).
 *
 * Implements RFC-4180 compliant CSV exports with spreadsheet formula injection protection.
 * Enforces strict 10,000 row safety bounds for audit logs using dedicated full-result reader.
 */

import type { RevenuePerformanceQuery } from "./revenue-analytics.ts";
import {
  loadCommercialPerformance,
  loadRevenuePerformanceOverview,
} from "./revenue-analytics.server.ts";
import type { UnifiedRevenueAuditFilter } from "./revenue-audit.ts";
import { loadUnifiedRevenueAuditForExport } from "./revenue-audit.server.ts";
import {
  buildCommercialPerformanceCsv,
  buildRevenuePerformanceCsv,
  buildUnifiedAuditCsv,
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
    roomTypeId?: string | null | undefined;
    ratePlanId?: string | null | undefined;
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
  const entries = await loadUnifiedRevenueAuditForExport(db, filter);
  const csv = buildUnifiedAuditCsv(entries);
  const timestampStr = new Date().toISOString().slice(0, 10);
  const filename = `revenue-audit-export-${timestampStr}.csv`;
  return { filename, csv, rowCount: entries.length };
}
