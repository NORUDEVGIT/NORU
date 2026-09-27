import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommercialPerformance } from "@/packages/pms/lib/revenue/revenue-analytics.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { Info } from "lucide-react";

export function CommercialPerformanceSection({
  restaurantId,
  context,
  formatCurrency,
}: {
  restaurantId: string;
  context: RevenueContext;
  formatCurrency: (value: number) => string;
}) {
  const fetchCommercial = useServerFn(getCommercialPerformance);

  const query = useQuery({
    queryKey: [
      "commercial-performance",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
        },
      }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-40 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
        <div className="h-40 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-xs text-destructive">
        Unable to load commercial performance attribution.
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 rounded-lg border border-[#E8E1D7] bg-card px-3.5 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          Attribution is based strictly on snapshot selections. ROI, settlement, and profitability
          are not tracked.
        </span>
      </div>

      {/* Promotions Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Promotion Attribution</h3>
          <p className="text-xs text-muted-foreground">
            Promotions active and attributed to reservations staying in this period.
          </p>
        </div>

        {data.promotions.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No promotion attributions recorded for this stay period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Promotion</th>
                  <th className="px-3 py-2.5 text-right">Reservations</th>
                  <th className="px-3 py-2.5 text-right">Sold Room Nights</th>
                  <th className="px-3 py-2.5 text-right">Pre-Promo Amount</th>
                  <th className="px-3 py-2.5 text-right">Discount</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Post-Promo Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {data.promotions.map((row) => (
                  <tr key={row.promotionId} className="hover:bg-muted/20">
                    <td className="py-2.5 pl-4 pr-3 font-medium text-foreground">
                      {row.promotionName}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {row.reservationCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatCurrency(row.prePromotionAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-medium">
                      -{formatCurrency(row.discountAmount)}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono font-medium text-foreground">
                      {formatCurrency(row.postPromotionAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Packages Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Package Performance</h3>
          <p className="text-xs text-muted-foreground">
            Operational package add-ons booked on reservations staying in this period.
          </p>
        </div>

        {data.packages.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No package selections recorded for this stay period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE]/50 text-[11px] font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">Package</th>
                  <th className="px-3 py-2.5 text-right">Reservations</th>
                  <th className="px-3 py-2.5 text-right">Selections</th>
                  <th className="px-3 py-2.5 text-right">Sold Room Nights</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Booked Package Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {data.packages.map((row) => (
                  <tr key={row.packageId} className="hover:bg-muted/20">
                    <td className="py-2.5 pl-4 pr-3 font-medium text-foreground">
                      {row.packageName}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {row.reservationCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                      {row.selectionCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono font-medium text-foreground">
                      {formatCurrency(row.bookedPackageRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
