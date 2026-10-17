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
  marketSegments: catalogSegments,
}: {
  overview: RevenuePerformanceOverview;
  formatCurrency: (value: number) => string;
  marketSegments?: Array<{ id: string; name: string; code?: string }>;
}) {
  const { marketSegments } = overview.breakdowns;
  const [selectedSegment, setSelectedSegment] = useState<SegmentBreakdownRow | null>(null);

  const resolveSegmentName = (row: SegmentBreakdownRow) => {
    if (row.marketSegment === "unassigned") return "Unassigned";
    if (catalogSegments && catalogSegments.length > 0) {
      const match = catalogSegments.find((s) => s.id === row.marketSegment);
      if (match?.name) return match.name;
    }
    return row.marketSegmentLabel || row.marketSegment;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="flex flex-col gap-1 border-b border-[#E8E1D7] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-[#251605]">
              Revenue by Market Segment
            </h3>
          </div>
        </div>

        {marketSegments.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#756A5B]">
            No segment-attributed reservations match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Market Segment</th>
                  <th className="px-3 py-3 text-right">Reservations</th>
                  <th className="px-3 py-3 text-right">Sold Room Nights</th>
                  <th className="px-3 py-3 text-right">Booked Revenue</th>
                  <th className="px-3 py-3 text-right">ADR</th>
                  <th className="px-3 py-3 text-right">Revenue Share</th>
                  <th className="px-3 py-3 text-right">Priced Nights</th>
                  <th className="py-3 pl-2 pr-4 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {marketSegments.map((row) => {
                  const isLegacy = row.marketSegment === "unassigned";
                  const displayName = resolveSegmentName(row);
                  return (
                    <tr
                      key={row.marketSegment}
                      onClick={() => setSelectedSegment(row)}
                      className="cursor-pointer hover:bg-[#FAF8F4]/80 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-1.5 font-medium text-sm text-[#251605]">
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
                      <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                        {row.shareOfRevenue}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                        {row.soldRoomNights}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-center">
                        <ChevronRight className="h-4 w-4 text-[#756A5B]/60 inline" />
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
        <SheetContent side="right" className="w-full sm:max-w-md bg-[#FAF8F4] border-l border-[#E8E1D7] p-6">
          <SheetHeader className="border-b border-[#E8E1D7] pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-display text-xl font-semibold text-[#251605]">
                {selectedSegment ? resolveSegmentName(selectedSegment) : ""}
              </SheetTitle>
              <button
                type="button"
                onClick={() => setSelectedSegment(null)}
                className="rounded-lg p-1 text-[#756A5B] hover:text-[#251605] hover:bg-black/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#756A5B]">Market Segment Performance Details</p>
          </SheetHeader>

          {selectedSegment && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    Booked Revenue
                  </span>
                  <p className="mt-1 font-display text-lg font-semibold text-[#251605]">
                    {formatCurrency(selectedSegment.bookedRoomRevenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    Revenue Share
                  </span>
                  <p className="mt-1 font-display text-lg font-semibold text-[#251605]">
                    {selectedSegment.shareOfRevenue}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    Sold Room Nights
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-[#251605]">
                    {selectedSegment.soldRoomNights.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    ADR
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-[#251605]">
                    {formatCurrency(selectedSegment.adr)}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    Reservations
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-[#251605]">
                    {selectedSegment.reservationCount}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-2xs">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#756A5B]">
                    Priced Nights
                  </span>
                  <p className="mt-1 font-mono text-base font-semibold text-[#251605]">
                    {selectedSegment.soldRoomNights}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
