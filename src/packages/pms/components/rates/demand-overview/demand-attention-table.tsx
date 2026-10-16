import { Link } from "@tanstack/react-router";

import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { DemandAttentionItem } from "@/packages/pms/lib/revenue/demand-overview";
import { demandHasRestrictionAttention } from "@/packages/pms/lib/revenue/demand-overview";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { serializeRevenueSearch } from "@/packages/pms/lib/revenue/revenue-context";

function toneForKind(kind: DemandAttentionItem["kinds"][number]) {
  if (kind === "Low Remaining Inventory") return "danger" as const;
  if (kind === "High Occupancy" || kind === "Restriction Active") return "warning" as const;
  return "info" as const;
}

export function DemandAttentionTable({
  items,
  context,
}: {
  items: DemandAttentionItem[];
  context: RevenueContext;
}) {
  const restrictionSearch = serializeRevenueSearch("restrictions", context);
  const showRestrictionLink = demandHasRestrictionAttention(items);

  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">Attention</h2>
          <p className="text-[10px] text-muted-foreground">
            Deterministic flags from occupancy, remaining inventory, restrictions and rate overrides.
          </p>
        </div>
        {showRestrictionLink ? (
          <Link
            to="/restaurant/pms/rates-revenue"
            search={restrictionSearch}
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
          >
            View Restrictions
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No occupancy, inventory, restriction or override flags in this range.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[10px]">
            <thead className="border-b border-[#E8E1D7] bg-[#F8F5F0] text-[9px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-semibold">Stay date</th>
                <th className="px-2 py-2 font-semibold">Flags</th>
                <th className="px-2 py-2 font-semibold">Occupancy</th>
                <th className="px-2 py-2 font-semibold">Remaining nights</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.date} className="border-b border-[#E8E1D7]/80">
                  <td className="px-2 py-2 font-medium text-[#251605]">{item.date}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.kinds.map((kind) => (
                        <InventoryStatusBadge key={kind} tone={toneForKind(kind)}>
                          {kind}
                        </InventoryStatusBadge>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2">{item.occupancyPercent}%</td>
                  <td className="px-2 py-2">{item.roomsRemaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
