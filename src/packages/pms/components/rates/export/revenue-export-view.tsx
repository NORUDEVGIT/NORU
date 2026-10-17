import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8E1D7] pb-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#251605]">
            Revenue Export
          </h2>
          <p className="text-xs text-[#756A5B] mt-0.5">
            Generate RFC-4180 compliant CSV exports for operational revenue analysis, commercial performance, and audit records.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-1.5 text-xs text-[#756A5B] shrink-0">
          <Calendar className="h-3.5 w-3.5 text-[#C89933]" />
          <span className="font-medium text-[#251605]">Stay Scope:</span>
          <span className="font-mono font-semibold text-[#251605]">{context.fromDate}</span>
          <span className="text-[#A59A8B]">→</span>
          <span className="font-mono font-semibold text-[#251605]">{context.toDate}</span>
        </div>
      </div>

      {/* Scope Disclaimer / Helper */}
      <div className="flex items-center gap-2 rounded-xl border border-[#E8E1D7] bg-white p-3 shadow-2xs text-xs text-[#756A5B]">
        <Info className="h-4 w-4 shrink-0 text-[#C89933]" />
        <span>
          Exports strictly reflect currently active workspace date ranges, filters, and authorization. All files are generated in standard RFC-4180 CSV format with UTF-8 encoding.
        </span>
      </div>

      {/* Export Cards Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 1. Revenue Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FAF8F4] border border-[#E8E1D7] text-[#C89933]">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-[#251605]">
                    Revenue Performance
                  </h3>
                  <span className="text-[11px] text-[#756A5B]">Operational Analytics</span>
                </div>
              </div>
              <span className="rounded-md bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-semibold text-[#756A5B] border border-[#E8E1D7]">
                CSV
              </span>
            </div>

            <p className="text-xs text-[#756A5B] leading-relaxed">
              Complete stay-date KPIs, daily trend series, and multidimensional breakdowns across Room Types, Rate Plans, Market Segments, Commercial Sources, and Technical Origins.
            </p>

            <div className="rounded-lg bg-[#FAF8F4] p-3 text-xs border border-[#E8E1D7]/70 space-y-1.5 font-mono text-[#756A5B]">
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Stay Range:</span>
                <span className="text-[#251605] font-semibold">{context.fromDate} → {context.toDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Breakdowns:</span>
                <span className="text-[#251605]">5 Dimensional Axes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Format:</span>
                <span className="text-[#251605]">CSV (RFC-4180)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8E1D7]/60 mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportPerformance}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#C89933] px-4 text-xs font-semibold text-[#251605] hover:bg-[#b88928] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            >
              {pendingExport === "performance" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#251605]" />
                  <span>Generating CSV…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 text-[#251605]" />
                  <span>Export Performance CSV</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Commercial Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-[#251605]">
                    Commercial Performance
                  </h3>
                  <span className="text-[11px] text-[#756A5B]">Campaigns & Packages</span>
                </div>
              </div>
              <span className="rounded-md bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-semibold text-[#756A5B] border border-[#E8E1D7]">
                CSV
              </span>
            </div>

            <p className="text-xs text-[#756A5B] leading-relaxed">
              Operational promotion discounts, code redemptions, and package component selections attributed to stay dates within the selected range.
            </p>

            <div className="rounded-lg bg-[#FAF8F4] p-3 text-xs border border-[#E8E1D7]/70 space-y-1.5 font-mono text-[#756A5B]">
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Stay Range:</span>
                <span className="text-[#251605] font-semibold">{context.fromDate} → {context.toDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Entities:</span>
                <span className="text-[#251605]">Promos & Packages</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-sans font-medium text-[#756A5B]">Format:</span>
                <span className="text-[#251605]">CSV (RFC-4180)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8E1D7]/60 mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportCommercial}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-4 text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            >
              {pendingExport === "commercial" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C89933]" />
                  <span>Generating CSV…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 text-[#C89933]" />
                  <span>Export Commercial CSV</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Unified Revenue Audit */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 border border-amber-100 text-[#8B651D]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-[#251605]">
                    Unified Revenue Audit
                  </h3>
                  <span className="text-[11px] text-[#756A5B]">Control Stream</span>
                </div>
              </div>
              <span className="rounded-md bg-[#FAF8F4] px-2 py-0.5 text-[10px] font-semibold text-[#756A5B] border border-[#E8E1D7]">
                12 Cols
              </span>
            </div>

            <p className="text-xs text-[#756A5B] leading-relaxed">
              Complete, unpaginated operational audit stream across Rates, Restrictions, Commercial changes, and Approvals (up to 10,000 rows).
            </p>

            {/* UI-40 Truthful Scope Display */}
            <div className="rounded-lg bg-[#FAF8F4] p-3 text-[11px] border border-[#E8E1D7]/70 space-y-1 font-mono text-[#756A5B]">
              <div>
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
              <div>Format: CSV (12 Columns)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8E1D7]/60 mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportAudit}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#E8E1D7] bg-white px-4 text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            >
              {pendingExport === "audit" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C89933]" />
                  <span>Generating CSV…</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 text-[#C89933]" />
                  <span>Export Audit CSV</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Active Export Scope Summary */}
      <div className="rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-[#E8E1D7]/60 pb-2.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#C89933]" />
            <h4 className="font-display text-sm font-semibold text-[#251605]">
              Active Export Scope & Filtering
            </h4>
          </div>
          <span className="text-[11px] text-[#756A5B]">
            Applied automatically across downloads
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-[#FAF8F4] p-2.5 border border-[#E8E1D7]/50">
            <span className="text-[11px] text-[#756A5B] block font-medium">Date Range</span>
            <span className="font-mono text-[#251605] font-semibold text-xs mt-0.5 block truncate">
              {context.fromDate} to {context.toDate}
            </span>
          </div>

          <div className="rounded-lg bg-[#FAF8F4] p-2.5 border border-[#E8E1D7]/50">
            <span className="text-[11px] text-[#756A5B] block font-medium">Room Type Scope</span>
            <span className="text-[#251605] font-semibold text-xs mt-0.5 block truncate">
              {context.roomTypeId || "All Room Types"}
            </span>
          </div>

          <div className="rounded-lg bg-[#FAF8F4] p-2.5 border border-[#E8E1D7]/50">
            <span className="text-[11px] text-[#756A5B] block font-medium">Rate Plan Scope</span>
            <span className="text-[#251605] font-semibold text-xs mt-0.5 block truncate">
              {context.ratePlanId || "All Rate Plans"}
            </span>
          </div>

          <div className="rounded-lg bg-[#FAF8F4] p-2.5 border border-[#E8E1D7]/50">
            <span className="text-[11px] text-[#756A5B] block font-medium">Audit Domain Scope</span>
            <span className="text-[#251605] font-semibold text-xs mt-0.5 block truncate capitalize">
              {auditDomain === "all" ? "All Domains" : auditDomain}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
