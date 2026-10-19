import { useState } from "react";
import type {
  CommercialSourceBreakdownRow,
  RevenuePerformanceOverview,
} from "@/packages/pms/lib/revenue/revenue-analytics";
import { AlertCircle } from "lucide-react";

export function RevenueSourceBreakdown({
  overview,
  formatCurrency,
  bookingSources: catalogSources,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
  bookingSources?: Array<{ id: string; name: string; code?: string }>;
}) {
  const [sourceTab, setSourceTab] = useState<"commercial" | "technical">("commercial");
  const { commercialSources, technicalOrigins } = overview.breakdowns;

  const originLabels: Record<string, string> = {
    staff: "Staff Reservation",
    walk_in: "Walk-in Guest",
    direct_booking: "Direct Booking Engine",
  };

  const resolveSourceName = (row: CommercialSourceBreakdownRow) => {
    if (row.commercialSource === "unassigned") return "Unassigned";
    if (catalogSources && catalogSources.length > 0) {
      const match = catalogSources.find((s) => s.id === row.commercialSource);
      if (match?.name) return match.name;
    }
    return row.commercialSourceLabel || row.commercialSource;
  };

  return (
    <div className="space-y-3">
      {/* Sub-tab switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-1">
          <button
            type="button"
            onClick={() => setSourceTab("commercial")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              sourceTab === "commercial"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Commercial Booking Sources
          </button>
          <button
            type="button"
            onClick={() => setSourceTab("technical")}
            className={`h-8 rounded-lg px-3.5 text-xs font-semibold transition-all ${
              sourceTab === "technical"
                ? "bg-white text-[#251605] shadow-xs border border-[#E8E1D7]"
                : "text-[#756A5B] hover:text-[#251605] hover:bg-white/50"
            }`}
          >
            Technical Origin
          </button>
        </div>
      </div>

      {/* Commercial Source Table */}
      {sourceTab === "commercial" && (
        <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
          <div className="border-b border-[#E8E1D7] px-4 py-3.5">
            <h3 className="font-display text-base font-semibold text-[#251605]">
              Commercial Booking Source Attribution
            </h3>
          </div>

          {commercialSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#756A5B]">
              No commercial source-attributed reservations match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                  <tr>
                    <th className="py-3 pl-4 pr-3">Commercial Source</th>
                    <th className="px-3 py-3 text-right">Reservations</th>
                    <th className="px-3 py-3 text-right">Sold Room Nights</th>
                    <th className="px-3 py-3 text-right">Booked Revenue</th>
                    <th className="px-3 py-3 text-right">ADR</th>
                    <th className="px-3 py-3 text-right">Revenue Share</th>
                    <th className="py-3 pl-3 pr-4 text-right">Priced Nights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]/60">
                  {commercialSources.map((row) => {
                    const isLegacy = row.commercialSource === "unassigned";
                    const displayName = resolveSourceName(row);
                    return (
                      <tr key={row.commercialSource} className="hover:bg-[#FAF8F4]/80 transition-colors">
                        <td className="py-3 pl-4 pr-3 font-medium text-sm text-[#251605]">
                          <div className="flex items-center gap-1.5">
                            <span>{displayName}</span>
                            {isLegacy && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                <AlertCircle className="h-2.5 w-2.5" />
                                Unassigned
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                          {row.reservationCount}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                          {row.soldRoomNights.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-[#251605]">
                          {formatCurrency(row.bookedRoomRevenue)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                          {formatCurrency(row.adr)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">{row.shareOfRevenue}%</td>
                        <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] text-[#756A5B]">
                          {row.soldRoomNights}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Technical Origin Table */}
      {sourceTab === "technical" && (
        <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
          <div className="border-b border-[#E8E1D7] px-4 py-3.5">
            <h3 className="font-display text-base font-semibold text-[#251605]">
              Technical Origin Analysis
            </h3>
          </div>

          {technicalOrigins.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#756A5B]">
              No reservation data available for technical origin attribution.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                  <tr>
                    <th className="py-3 pl-4 pr-3">Technical Origin</th>
                    <th className="px-3 py-3 text-right">Reservations</th>
                    <th className="px-3 py-3 text-right">Sold Room Nights</th>
                    <th className="px-3 py-3 text-right">Booked Revenue</th>
                    <th className="px-3 py-3 text-right">ADR</th>
                    <th className="py-3 pl-3 pr-4 text-right">Revenue Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]/60">
                  {technicalOrigins.map((row) => (
                    <tr key={row.origin} className="hover:bg-[#FAF8F4]/80 transition-colors">
                      <td className="py-3 pl-4 pr-3 font-medium text-sm text-[#251605]">
                        {originLabels[row.origin] ?? row.originLabel}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                        {row.reservationCount}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                        {row.soldRoomNights.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] font-medium text-[#251605]">
                        {formatCurrency(row.bookedRoomRevenue)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                        {formatCurrency(row.adr)}
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] text-[#251605]">
                        {row.shareOfRevenue}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
