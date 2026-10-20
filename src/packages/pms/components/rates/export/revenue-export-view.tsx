import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, Info, Loader2, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import {
  exportCommercialPerformanceCsv,
  exportRevenuePerformanceCsv,
  exportUnifiedRevenueAuditCsv,
} from "@/packages/pms/lib/revenue/revenue-export.functions";
import { listRevenueApprovalActorsFn } from "@/packages/pms/lib/revenue/revenue-approval.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";

function downloadCsvBlob(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function RevenueExportView({
  restaurantId,
  context,
  auditTab,
  auditAction,
  auditActor,
  auditSearch,
}: {
  restaurantId: string;
  context: RevenueContext;
  auditTab?: string | undefined;
  auditAction?: string | undefined;
  auditActor?: string | undefined;
  auditSearch?: string | undefined;
}) {
  const exportPerfFn = useServerFn(exportRevenuePerformanceCsv);
  const exportCommFn = useServerFn(exportCommercialPerformanceCsv);
  const exportAuditFn = useServerFn(exportUnifiedRevenueAuditCsv);
  const fetchActors = useServerFn(listRevenueApprovalActorsFn);

  const [pendingExport, setPendingExport] = useState<string | null>(null);

  // Load actors to display human-readable actor name on the scope card
  const actorsQuery = useQuery({
    queryKey: ["revenue-approval-actors", restaurantId],
    queryFn: () => fetchActors({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const actorLabel = actorsQuery.data?.find((a) => a.id === auditActor)?.label || auditActor;

  const auditDomain: "all" | "rates" | "restrictions" | "commercial" | "approvals" | "overrides" =
    auditTab === "rates"
      ? "rates"
      : auditTab === "restrictions"
        ? "restrictions"
        : auditTab === "overrides"
          ? "overrides"
          : "all";

  async function handleExportPerformance() {
    if (pendingExport) return;
    setPendingExport("performance");
    try {
      // P8-STEP-03 Review Amendment 2: explicitly set salesChannelId to null
      const res = await exportPerfFn({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
          marketSegmentId: context.marketSegmentId,
          commercialSourceId: context.commercialSourceId,
          salesChannelId: null,
        },
      });
      downloadCsvBlob(res.csv, res.filename);
      toast.success(`Exported ${res.filename} (${res.rowCount} rows)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      if (msg.includes("REVENUE_ANALYTICS_MIXED_CURRENCY")) {
        toast.error(
          "Cannot export: multiple currencies cannot be combined without exchange rates.",
        );
      } else {
        toast.error(`Export failed: ${msg}`);
      }
    } finally {
      setPendingExport(null);
    }
  }

  async function handleExportCommercial() {
    if (pendingExport) return;
    setPendingExport("commercial");
    try {
      const res = await exportCommFn({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
        },
      });
      downloadCsvBlob(res.csv, res.filename);
      toast.success(`Exported ${res.filename} (${res.rowCount} rows)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(`Commercial export failed: ${msg}`);
    } finally {
      setPendingExport(null);
    }
  }

  async function handleExportAudit() {
    if (pendingExport) return;
    setPendingExport("audit");
    try {
      const res = await exportAuditFn({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          domain: auditDomain,
          action: auditAction || null,
          actorMembershipId: auditActor || null,
          search: auditSearch?.trim() || null,
        },
      });
      downloadCsvBlob(res.csv, res.filename);
      toast.success(`Exported ${res.filename} (${res.rowCount} rows)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      if (msg.includes("AUDIT_EXPORT_TOO_LARGE")) {
        toast.error(
          "More than 10,000 audit records match these filters. Narrow the date range or filters before exporting.",
        );
      } else {
        toast.error(`Audit export failed: ${msg}`);
      }
    } finally {
      setPendingExport(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-[#DDD4C5] pb-3.5">
        <h2 className="font-display text-xl font-semibold tracking-tight text-[#251605]">
          Revenue Data Export
        </h2>
        <p className="mt-1 text-xs text-[#7A7167]">
          Generate official, RFC-4180 compliant CSV exports for operational revenue analysis, commercial performance, and audit compliance.
        </p>
      </div>

      {/* Guidance Banner */}
      <div className="flex items-start sm:items-center gap-2.5 rounded-xl border border-[#DDD4C5] bg-[#FAF8F4]/80 px-4 py-3 text-xs text-[#5F554B] shadow-2xs">
        <Info className="h-4 w-4 shrink-0 text-[#C89933] mt-0.5 sm:mt-0" />
        <span>
          Exports reflect your current property context, active filters, and stay date range in standard CSV format, compatible with Excel, Google Sheets, and financial reporting systems.
        </span>
      </div>

      {/* Export Cards Grid */}
      <div className="grid gap-4.5 md:grid-cols-3">
        {/* 1. Revenue Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-xs transition-all hover:border-[#C89933]/60 hover:shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-[#ECD9B5] bg-[#FAF4E8] text-[#9E721D]">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#251605]">Revenue Performance</h3>
                  <p className="text-[11px] text-[#7A7167]">KPIs & Multi-Dimensional Breakdowns</p>
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#5F554B]">
              Comprehensive stay-date KPIs, daily performance trend series, and complete breakdowns across Room Types, Rate Plans, Market Segments, Commercial Sources, and Technical Origins.
            </p>

            <div className="rounded-lg border border-[#EFE9DF] bg-[#FAF8F4]/90 p-3 text-[11px] text-[#5F554B] space-y-1">
              <div className="font-medium text-[#251605]">
                Stay Range: {context.fromDate} → {context.toDate}
              </div>
              <div>Room Type: {context.roomTypeId ? "Filtered" : "All Room Types"}</div>
              <div>Rate Plan: {context.ratePlanId ? "Filtered" : "All Rate Plans"}</div>
              <div>Includes: Summary KPIs, Daily Trends, 5 Breakdowns</div>
              <div className="text-[#8B651D] font-mono pt-0.5">Format: CSV (RFC-4180)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFE9DF] mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportPerformance}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933] shadow-xs transition-colors disabled:opacity-50"
            >
              {pendingExport === "performance" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export Performance CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Commercial Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-xs transition-all hover:border-[#C89933]/60 hover:shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#251605]">Commercial Performance</h3>
                  <p className="text-[11px] text-[#7A7167]">Promotions & Package Uptake</p>
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#5F554B]">
              Operational promotion discounts, base vs. post-discount room amounts, and package selections attributed to stay dates within the selected timeframe.
            </p>

            <div className="rounded-lg border border-[#EFE9DF] bg-[#FAF8F4]/90 p-3 text-[11px] text-[#5F554B] space-y-1">
              <div className="font-medium text-[#251605]">
                Stay Range: {context.fromDate} → {context.toDate}
              </div>
              <div>Room Type: {context.roomTypeId ? "Filtered" : "All Room Types"}</div>
              <div>Rate Plan: {context.ratePlanId ? "Filtered" : "All Rate Plans"}</div>
              <div>Includes: Promotions discounts & Package selections</div>
              <div className="text-[#8B651D] font-mono pt-0.5">Format: CSV (RFC-4180)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFE9DF] mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportCommercial}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933] shadow-xs transition-colors disabled:opacity-50"
            >
              {pendingExport === "commercial" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export Commercial CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Unified Revenue Audit */}
        <div className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-xs transition-all hover:border-[#C89933]/60 hover:shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#251605]">Unified Revenue Audit</h3>
                  <p className="text-[11px] text-[#7A7167]">Rates, Restrictions & Approvals</p>
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#5F554B]">
              Complete, unpaginated operational audit stream capturing rate modifications, restriction events, commercial updates, and manager approvals.
            </p>

            <div className="rounded-lg border border-[#EFE9DF] bg-[#FAF8F4]/90 p-3 text-[11px] text-[#5F554B] space-y-1">
              <div className="font-medium text-[#251605]">
                Date Range: {context.fromDate} → {context.toDate}
              </div>
              <div>
                Domain:{" "}
                {auditTab === "rates"
                  ? "Rates"
                  : auditTab === "restrictions"
                    ? "Restrictions"
                    : auditTab === "overrides"
                      ? "Overrides"
                      : "All"}
              </div>
              {auditActor && <div>Actor: {actorLabel}</div>}
              {auditAction && <div>Action: {auditAction}</div>}
              {auditSearch && <div>Search: {auditSearch}</div>}
              <div>Bound: Complete audit stream (up to 10,000 records)</div>
              <div className="text-[#8B651D] font-mono pt-0.5">Format: CSV (12 Columns)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFE9DF] mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportAudit}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933] shadow-xs transition-colors disabled:opacity-50"
            >
              {pendingExport === "audit" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export Audit CSV
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
