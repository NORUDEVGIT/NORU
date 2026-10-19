import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import { Calendar, Clock, DollarSign, Layers, Percent, TrendingUp } from "lucide-react";

export function RevenueKpiStrip({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const isInventoryMeaningful = overview.summary.inventoryMetricSupport === "SUPPORTED";
  const { summary, distribution, warnings } = overview;

  return (
    <div className="space-y-2.5">
      {/* Primary Hero KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Booked Room Revenue */}
        <div className="relative overflow-hidden rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs transition-all hover:border-[#C89933]/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              Booked Room Revenue
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#C89933]">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-[#251605] sm:text-3xl">
              {formatCurrency(summary.bookedRoomRevenue)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-[#756A5B]">
            <span className="inline-flex items-center rounded-md bg-[#FAF8F4] px-1.5 py-0.5 text-[11px] font-medium text-[#251605] border border-[#E8E1D7]">
              {summary.reservationCount} reservations
            </span>
            <span className="text-[11px]">in selected stay window</span>
          </div>
        </div>

        {/* 2. Occupancy Rate */}
        <div
          className={`relative overflow-hidden rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs transition-all hover:border-[#C89933]/50 ${
            !isInventoryMeaningful ? "bg-[#FAF8F4]/40" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              Occupancy Rate
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#C89933]">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-[#251605] sm:text-3xl">
              {isInventoryMeaningful && summary.occupancyPct !== null
                ? `${summary.occupancyPct}%`
                : "N/A"}
            </span>
          </div>
          {isInventoryMeaningful && summary.occupancyPct !== null ? (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E8E1D7]/60">
                <div
                  className="h-full rounded-full bg-[#C89933] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, summary.occupancyPct))}%` }}
                />
              </div>
              <p className="text-[11px] text-[#756A5B]">
                {summary.soldRoomNights.toLocaleString()} of{" "}
                {summary.availableRoomNights?.toLocaleString() ?? "0"} nights sold
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#756A5B]">Non-inventory filter applied</p>
          )}
        </div>

        {/* 3. Average Daily Rate (ADR) */}
        <div className="relative overflow-hidden rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs transition-all hover:border-[#C89933]/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              Average Daily Rate (ADR)
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#C89933]">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-[#251605] sm:text-3xl">
              {formatCurrency(summary.adr)}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[#756A5B]">Realization per occupied room night</p>
        </div>

        {/* 4. RevPAR */}
        <div
          className={`relative overflow-hidden rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs transition-all hover:border-[#C89933]/50 ${
            !isInventoryMeaningful ? "bg-[#FAF8F4]/40" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
              RevPAR
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF8F4] text-[#C89933]">
              <Layers className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-[#251605] sm:text-3xl">
              {isInventoryMeaningful && summary.revpar !== null
                ? formatCurrency(summary.revpar)
                : "N/A"}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[#756A5B]">
            {isInventoryMeaningful
              ? "Yield per total available inventory"
              : "Non-inventory filter applied"}
          </p>
        </div>
      </div>

      {/* Secondary Operational Metrics Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Sold Nights */}
        <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-[#FAF8F4]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#756A5B]" />
            <span className="text-xs font-medium text-[#756A5B]">Sold Nights</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-semibold text-[#251605]">
              {summary.soldRoomNights.toLocaleString()}
            </span>
            {warnings.unpricedSoldNights > 0 && (
              <span className="rounded bg-amber-100 px-1 py-0.2 text-[10px] font-medium text-amber-800">
                {warnings.unpricedSoldNights} unpriced
              </span>
            )}
          </div>
        </div>

        {/* Available Capacity */}
        <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-[#FAF8F4]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#756A5B]" />
            <span className="text-xs font-medium text-[#756A5B]">Capacity</span>
          </div>
          <span className="font-mono text-sm font-semibold text-[#251605]">
            {isInventoryMeaningful && summary.availableRoomNights !== null
              ? `${summary.availableRoomNights.toLocaleString()} nights`
              : "N/A"}
          </span>
        </div>

        {/* Priced Share */}
        <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-[#FAF8F4]/60 px-3.5 py-2.5">
          <span className="text-xs font-medium text-[#756A5B]">Priced Share</span>
          <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-[#251605]">
            {summary.pricedShare}%
            {summary.pricedShare === 100 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </span>
        </div>

        {/* Stay & Lead Dynamics */}
        <div className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-[#FAF8F4]/60 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#756A5B]" />
            <span className="text-xs font-medium text-[#756A5B]">Avg Stay / Lead</span>
          </div>
          <span className="font-mono text-xs font-semibold text-[#251605]">
            {distribution.averageLengthOfStayNights.toFixed(1)}n /{" "}
            {distribution.averageLeadTimeDays !== null
              ? `${distribution.averageLeadTimeDays}d`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
