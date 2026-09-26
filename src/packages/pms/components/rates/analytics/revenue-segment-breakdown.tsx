import { useState } from "react";
import type {
  RevenuePerformanceOverview,
  SegmentBreakdownRow,
} from "@/packages/pms/lib/revenue/revenue-analytics";
import { AlertCircle, ChevronRight, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";

export function RevenueSegmentBreakdown({
  overview,
  formatCurrency,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
}) {
  const { marketSegments } = overview.breakdowns;
  const [selectedSegment, setSelectedSegment] = useState<SegmentBreakdownRow | null>(null);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="flex flex-col gap-1 border-b border-[#E8E1D7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Revenue by Market Segment (UI-33)
            </h3>
            <p className="text-xs text-muted-foreground">
              Commercial segmentation attribution. Occupancy and RevPAR are omitted as physical
              inventory cannot be partitioned by segment.
            </p>
          </div>
        </div>

        {marketSegments.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No segment-attributed reservations match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Market Segment</th>
                  <th className="px-3 py-2.5 text-right">Reservations</th>
                  <th className="px-3 py-2.5 text-right">Sold Room Nights</th>
                  <th className="px-3 py-2.5 text-right">Booked Revenue</th>
                  <th className="px-3 py-2.5 text-right">ADR</th>
                  <th className="px-3 py-2.5 text-right">Revenue Share</th>
                  <th className="px-3 py-2.5 text-right">Priced Nights</th>
                  <th className="py-2.5 pl-2 pr-4 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {marketSegments.map((row) => {
                  const isLegacy = row.marketSegmentId === "unassigned";
                  return (
                    <tr
                      key={row.marketSegmentId}
                      onClick={() => setSelectedSegment(row)}
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <span>{row.marketSegmentName}</span>
                          {isLegacy && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Unassigned / Legacy
                            </span>
                          )}
                        </div>
                        {isLegacy && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Older reservations may not contain Market Segment attribution.
                          </p>
                        )}
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
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        {row.pricedSoldNights}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-center">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contextual Detail Sheet */}
      <Sheet
        open={Boolean(selectedSegment)}
        onOpenChange={(open) => !open && setSelectedSegment(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md bg-[#F7F4EE]">
          <SheetHeader className="border-b border-[#E8E1D7] pb-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-lg font-semibold text-foreground">
                {selectedSegment?.marketSegmentName}
              </SheetTitle>
              <button
                type="button"
                onClick={() => setSelectedSegment(null)}
                className="rounded-sm opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Market Segment Operational Detail</p>
          </SheetHeader>

          {selectedSegment && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Booked Revenue
                  </span>
                  <p className="mt-1 font-display text-base font-semibold text-foreground">
                    {formatCurrency(selectedSegment.bookedRoomRevenue)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Revenue Share
                  </span>
                  <p className="mt-1 font-display text-base font-semibold text-foreground">
                    {selectedSegment.revenueSharePct}%
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Sold Room Nights
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-foreground">
                    {selectedSegment.soldRoomNights.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    ADR
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-foreground">
                    {formatCurrency(selectedSegment.adr)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Reservations
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-foreground">
                    {selectedSegment.reservationCount}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-card p-3">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Priced Nights
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-foreground">
                    {selectedSegment.pricedSoldNights}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#E8E1D7] bg-card p-3.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Operational Note:</span> Occupancy
                and RevPAR are not applicable at the segment level because hotel rooms are shared
                across all market segments without dedicated physical allocation.
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
