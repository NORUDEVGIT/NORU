import { InventoryMetric } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueControlWorkspace } from "@/packages/pms/lib/revenue/revenue-control";

export function RevenueControlKpis({
  data,
  money,
}: {
  data: RevenueControlWorkspace;
  money: (value: number) => string;
}) {
  const { summary, slotMetrics } = data;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">Booked performance</h2>
          <p className="text-[10px] text-muted-foreground">{data.filterCaption}</p>
        </div>
        {data.rangeClamped ? (
          <p className="text-[10px] text-amber-800">
            Range limited to 62 days ({data.fromDate} – {data.toDate}).
          </p>
        ) : null}
      </div>
      {data.commercialFilterNote ? (
        <p className="text-[10px] text-muted-foreground">{data.commercialFilterNote}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <InventoryMetric
          label="Occupancy"
          value={`${summary.occupancyPercent}%`}
          detail="Sold ÷ available room nights"
        />
        <InventoryMetric label="ADR" value={money(summary.adr)} detail="Booked room revenue ÷ sold nights" />
        <InventoryMetric
          label="RevPAR"
          value={money(summary.revPar)}
          detail="Booked room revenue ÷ available nights"
        />
        <InventoryMetric
          label="Booked Room Revenue"
          value={money(summary.roomRevenue)}
          detail="Reservation pricing snapshots"
        />
        <InventoryMetric
          label="Sold Room Nights"
          value={summary.soldRoomNights}
          detail={
            data.appliedFilters.revenueScope === "rate-plan"
              ? "Nights on the selected rate plan"
              : "Confirmed, in-house and checked-out"
          }
        />
        <InventoryMetric
          label="Available Room Nights"
          value={summary.availableRoomNights}
          detail="Active rooms × days"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <InventoryMetric
          label="Remaining Inventory"
          value={slotMetrics.remainingRoomNights}
          detail="Available minus sold room nights"
        />
        <InventoryMetric
          label="Active Restrictions"
          value={slotMetrics.activeRestrictionCount}
          detail="CTA, CTD, stay limits or stop sell"
        />
        <InventoryMetric
          label="Override Count"
          value={slotMetrics.overrideCount}
          detail="Nightly calendar overrides in range"
        />
      </div>
      {summary.pricedShare < 100 ? (
        <p className="text-[10px] text-muted-foreground">
          {summary.pricedShare}% of sold room nights carry a pricing snapshot — unpriced stays
          contribute occupancy but no booked revenue.
        </p>
      ) : null}
    </section>
  );
}
