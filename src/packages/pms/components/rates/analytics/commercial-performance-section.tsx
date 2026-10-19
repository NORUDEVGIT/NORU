import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommercialPerformance } from "@/packages/pms/lib/revenue/revenue-analytics.functions";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";

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
      {/* Promotions Table */}
      <div className="rounded-xl border border-[#E8E1D7] bg-card shadow-xs">
        <div className="border-b border-[#E8E1D7] px-4 py-3.5">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Promotion Attribution
          </h3>
        </div>

        {data.promotions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#756A5B]">
            No promotion attributions recorded for this stay period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Promotion</th>
                  <th className="px-3 py-3 text-right">Reservations</th>
                  <th className="px-3 py-3 text-right">Sold Room Nights</th>
                  <th className="px-3 py-3 text-right">Pre-Promo Amount</th>
                  <th className="px-3 py-3 text-right">Discount</th>
                  <th className="py-3 pl-3 pr-4 text-right">Post-Promo Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {data.promotions.map((row) => (
                  <tr key={row.promotionActivationId} className="hover:bg-[#FAF8F4]/80 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-medium text-sm text-[#251605]">
                      {row.promotionName}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {row.reservationCount}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {formatCurrency(row.preCommercialRoomAmount)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-emerald-700 font-medium">
                      -{formatCurrency(row.discountAmount)}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] font-medium text-[#251605]">
                      {formatCurrency(row.postPromotionRoomAmount)}
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
        <div className="border-b border-[#E8E1D7] px-4 py-3.5">
          <h3 className="font-display text-base font-semibold text-[#251605]">
            Package Performance
          </h3>
        </div>

        {data.packages.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#756A5B]">
            No package selections recorded for this stay period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8E1D7] bg-[#FAF8F4] text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
                <tr>
                  <th className="py-3 pl-4 pr-3">Package</th>
                  <th className="px-3 py-3 text-right">Reservations</th>
                  <th className="px-3 py-3 text-right">Selections</th>
                  <th className="px-3 py-3 text-right">Sold Room Nights</th>
                  <th className="py-3 pl-3 pr-4 text-right">Booked Package Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/60">
                {data.packages.map((row) => (
                  <tr key={row.packageActivationId} className="hover:bg-[#FAF8F4]/80 transition-colors">
                    <td className="py-3 pl-4 pr-3 font-medium text-sm text-[#251605]">
                      {row.packageName}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {row.reservationCount}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#756A5B]">
                      {row.selectionCount}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-[#251605]">
                      {row.soldRoomNights.toLocaleString()}
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right font-mono text-[13px] font-medium text-[#251605]">
                      {formatCurrency(row.bookedPackageAmount)}
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
