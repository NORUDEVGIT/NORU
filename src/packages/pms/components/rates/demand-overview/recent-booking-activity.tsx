import { InventoryMetric } from "@/packages/pms/components/rooms/room-inventory-shared";
import { DEMAND_RECENT_BOOKING_ACTIVITY_LABEL } from "@/packages/pms/lib/revenue/demand-overview";

export function RecentBookingActivity({ count }: { count: number }) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">{DEMAND_RECENT_BOOKING_ACTIVITY_LABEL}</h2>
      <p className="text-[10px] text-muted-foreground">
        Reservations created in the last 7 property-local days. This is not pickup.
      </p>
      <div className="mt-3">
        <InventoryMetric
          label={DEMAND_RECENT_BOOKING_ACTIVITY_LABEL}
          value={count}
          detail="Aggregate count only — no daily time series is stored"
        />
      </div>
    </section>
  );
}
