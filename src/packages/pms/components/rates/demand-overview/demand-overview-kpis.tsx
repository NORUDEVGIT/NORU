import { InventoryMetric } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { DemandWorkspace } from "@/packages/pms/lib/revenue/demand";
import {
  DEMAND_KPI_ADR,
  DEMAND_KPI_BOOKED_NIGHTS,
  DEMAND_KPI_BOOKED_REVENUE,
  DEMAND_KPI_OTB_OCCUPANCY,
  DEMAND_KPI_PRICED_SHARE,
  DEMAND_KPI_REMAINING_NIGHTS,
  DEMAND_KPI_REVPAR,
  DEMAND_RECENT_BOOKING_ACTIVITY_LABEL,
  demandLimitationNotes,
} from "@/packages/pms/lib/revenue/demand-overview";

export function DemandOverviewKpis({
  data,
  money,
}: {
  data: DemandWorkspace;
  money: (value: number) => string;
}) {
  const { summary } = data;
  const notes = demandLimitationNotes(data);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">On-the-books demand</h2>
          <p className="text-[10px] text-muted-foreground">As of {data.asOfBusinessDate}</p>
        </div>
        {data.rangeClamped ? (
          <p className="text-[10px] text-amber-800">
            Range limited to 90 days ({data.fromDate} – {data.toDate}).
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <InventoryMetric
          label={DEMAND_KPI_OTB_OCCUPANCY}
          value={`${summary.occupancyPercent}%`}
          detail="Booked room nights ÷ available room nights"
        />
        <InventoryMetric
          label={DEMAND_KPI_BOOKED_NIGHTS}
          value={summary.roomsOnBooks}
          detail="Confirmed, in-house and checked-out nights in range"
        />
        <InventoryMetric
          label={DEMAND_KPI_REMAINING_NIGHTS}
          value={summary.roomsRemaining}
          detail="Available minus booked room nights"
        />
        <InventoryMetric
          label={DEMAND_KPI_BOOKED_REVENUE}
          value={money(summary.bookedRoomRevenue)}
          detail="Reservation pricing snapshots"
        />
        <InventoryMetric
          label={DEMAND_KPI_ADR}
          value={money(summary.adr)}
          detail="Booked room revenue ÷ priced sold nights"
        />
        <InventoryMetric
          label={DEMAND_KPI_REVPAR}
          value={money(summary.revpar)}
          detail="Booked room revenue ÷ available room nights"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <InventoryMetric
          label={DEMAND_KPI_PRICED_SHARE}
          value={`${summary.pricedShare}%`}
          detail="Sold nights with a pricing snapshot"
        />
        <InventoryMetric
          label={DEMAND_RECENT_BOOKING_ACTIVITY_LABEL}
          value={summary.recentBookings}
          detail="Reservations created in the last 7 property-local days"
        />
      </div>
      {notes.map((note) => (
        <p key={note} className="text-[10px] text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
