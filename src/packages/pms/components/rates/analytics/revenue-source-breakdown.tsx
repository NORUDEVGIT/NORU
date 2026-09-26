import { useState } from "react";
import type { RevenuePerformanceOverview } from "@/packages/pms/lib/revenue/revenue-analytics";
import { AlertCircle, Info } from "lucide-react";

export function RevenueSourceBreakdown({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const [sourceTab, setSourceTab] = useState<"commercial" | "technical">("commercial");
  const { commercialSources, technicalOrigins } = overview.breakdowns;

  const originLabels: Record<string, string> = {
    staff: "Staff Reservation",
    walk_in: "Walk-in Guest",
    direct_booking: "Direct Booking Engine",
  };

  return (
    <div className="space-y-3">
      {/* Sub-tab switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-[#E8E1D7] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setSourceTab("commercial")}
            className={`h-7 rounded px-3 text-xs font-medium transition-colors ${
              sourceTab === "commercial"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Commercial Booking Sources
          </button>
          <button
            type="button"
            onClick={() => setSourceTab("technical")}
            className={`h-7 rounded px-3 text-xs font-medium transition-colors ${
              sourceTab === "technical"
                ? "bg-[#F7F4EE] text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Technical Origin
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>Commission and net revenue models are not configured.</span>
        </div>
      </div>

      {/* Commercial Source Table */}
      {sourceTab === "commercial" && (
        <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Commercial Booking Source Attribution
            </h3>
            <p className="text-xs text-muted-foreground">
              Direct commercial channel masters configured in Property Setup.
            </p>
          </div>

          {commercialSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No commercial source-attributed reservations match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3">Commercial Source</th>
                    <th className="px-3 py-2.5 text-right">Reservations</th>
                    <th className="px-3 py-2.5 text-right">Sold Room Nights</th>
                    <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                    <th className="px-3 py-2.5 text-right">ADR</th>
                    <th className="px-3 py-2.5 text-right">Revenue Share</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Priced Nights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]/60">
                  {commercialSources.map((row) => {
                    const isLegacy = row.commercialSourceId === "unassigned";
                    return (
                      <tr key={row.commercialSourceId} className="hover:bg-muted/20">
                        <td className="py-2.5 pl-4 pr-3 font-medium text-foreground">
                          <div className="flex items-center gap-1.5">
                            <span>{row.commercialSourceName}</span>
                            {isLegacy && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                <AlertCircle className="h-2.5 w-2.5" />
                                Unassigned / Legacy
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {row.reservationCount}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {row.soldRoomNights.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                          {formatCurrency(row.bookedRoomRevenue)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatCurrency(row.adr)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{row.revenueSharePct}%</td>
                        <td className="py-2.5 pl-3 pr-4 text-right font-mono text-muted-foreground">
                          {row.pricedSoldNights}
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
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Technical Origin Analysis</h3>
            <p className="text-xs text-muted-foreground">
              Operational booking creation origin. This is distinct from commercial source codes and
              sales channels.
            </p>
          </div>

          {technicalOrigins.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No reservation data available for technical origin attribution.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3">Technical Origin</th>
                    <th className="px-3 py-2.5 text-right">Reservations</th>
                    <th className="px-3 py-2.5 text-right">Sold Room Nights</th>
                    <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                    <th className="px-3 py-2.5 text-right">ADR</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Revenue Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D7]/60">
                  {technicalOrigins.map((row) => (
                    <tr key={row.technicalOrigin} className="hover:bg-muted/20">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-foreground">
                        {originLabels[row.technicalOrigin] ?? row.technicalOrigin}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {row.reservationCount}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {row.soldRoomNights.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                        {formatCurrency(row.bookedRoomRevenue)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatCurrency(row.adr)}
                      </td>
                      <td className="py-2.5 pl-3 pr-4 text-right font-mono">
                        {row.revenueSharePct}%
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
