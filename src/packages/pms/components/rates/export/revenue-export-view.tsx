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
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-[#E8E1D7] pb-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Revenue Export (UI-40)
        </h2>
        <p className="text-xs text-muted-foreground">
          Generate RFC-4180 compliant CSV exports for operational revenue analysis and audit
          records.
        </p>
      </div>

      <div className="flex items-center gap-1.5 rounded-lg border border-[#E8E1D7] bg-card px-3.5 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          Exports strictly reflect current active filters and authorization. Additional formats
          (Excel, PDF, JSON) and scheduled exports are not configured.
        </span>
      </div>

      {/* Export Cards Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 1. Revenue Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#8B651D]" />
              <h3 className="font-semibold text-sm text-foreground">Revenue Performance</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Complete stay-date KPIs, daily trend series, and breakdowns (Room Types, Rate Plans,
              Market Segments, Commercial Sources, Technical Origins).
            </p>
            <div className="pt-2 text-[11px] text-muted-foreground font-mono space-y-0.5">
              <div>
                Stay Range: {context.fromDate} → {context.toDate}
              </div>
              <div>Format: CSV (RFC-4180)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8E1D7]/60 mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportPerformance}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#D3A13B] px-3 text-xs font-medium text-[#251605] hover:bg-[#BE8D2D] disabled:opacity-50 transition-colors"
            >
              {pendingExport === "performance" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export Performance CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Commercial Performance */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              <h3 className="font-semibold text-sm text-foreground">Commercial Performance</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Operational promotion discounts and package selections attributed to stay dates within
              the selected range.
            </p>
            <div className="pt-2 text-[11px] text-muted-foreground font-mono space-y-0.5">
              <div>
                Stay Range: {context.fromDate} → {context.toDate}
              </div>
              <div>Format: CSV (RFC-4180)</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E8E1D7]/60 mt-4">
            <button
              type="button"
              disabled={Boolean(pendingExport)}
              onClick={handleExportCommercial}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-foreground hover:bg-[#F7F4EE] disabled:opacity-50 transition-colors"
            >
              {pendingExport === "commercial" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export Commercial CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Unified Revenue Audit */}
        <div className="flex flex-col justify-between rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#7A5418]" />
              <h3 className="font-semibold text-sm text-foreground">Unified Revenue Audit</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Complete, unpaginated operational audit stream across Rates, Restrictions, Commercial
              changes, and Approvals (up to 10,000 rows).
            </p>
            {/* UI-40 Truthful Scope Display */}
            <div className="pt-2 text-[11px] text-muted-foreground font-mono space-y-0.5">
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
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-foreground hover:bg-[#F7F4EE] disabled:opacity-50 transition-colors"
            >
              {pendingExport === "audit" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating CSV…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
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
