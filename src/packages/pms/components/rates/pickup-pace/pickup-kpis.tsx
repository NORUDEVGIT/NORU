import { InventoryMetric } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { PickupWorkspace } from "@/packages/pms/lib/revenue/pickup-pace";
import { formatPickupPoints, pickupCoverageCopy, PICKUP_UNPRICED_NOTE } from "@/packages/pms/lib/revenue/pickup-pace";

function toneClass(value: number | null): string {
  if (value == null || value === 0) return "";
  return value > 0 ? "text-emerald-700" : "text-amber-800";
}

function signedNumber(value: number | null): string {
  if (value == null) return "unavailable";
  if (value > 0) return `+${value}`;
  return String(value);
}

export function PickupKpis({
  data,
  money,
}: {
  data: PickupWorkspace;
  money: (value: number) => string;
}) {
  const { summary } = data;
  const coverage = pickupCoverageCopy(summary.comparableRows, summary.coverageTotal);

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <InventoryMetric
          label="Rooms Pickup"
          value={<span className={toneClass(summary.roomsPickup)}>{signedNumber(summary.roomsPickup)}</span>}
          detail="Current OTB nights minus prior OTB nights"
        />
        <InventoryMetric
          label="Revenue Pickup"
          value={
            <span className={toneClass(summary.revenuePickup)}>
              {summary.revenuePickup == null ? "unavailable" : `${summary.revenuePickup > 0 ? "+" : ""}${money(summary.revenuePickup)}`}
            </span>
          }
          detail="Current booked revenue minus prior booked revenue"
        />
        <InventoryMetric
          label="Occupancy Change"
          value={<span className={toneClass(summary.occupancyPointChange)}>{formatPickupPoints(summary.occupancyPointChange)}</span>}
          detail="Percentage points, not percent growth"
        />
        <InventoryMetric
          label="ADR Change"
          value={
            <span className={toneClass(summary.adrChange)}>
              {summary.adrChange == null ? "unavailable" : `${summary.adrChange > 0 ? "+" : ""}${money(summary.adrChange)}`}
            </span>
          }
          detail="Current snapshot ADR minus prior snapshot ADR"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <InventoryMetric
          label="Current OTB"
          value={summary.currentRoomsOnBooks ?? "unavailable"}
          detail="Room nights on the current snapshot"
        />
        <InventoryMetric
          label="Prior OTB"
          value={summary.priorRoomsOnBooks ?? "unavailable"}
          detail="Room nights on the compared snapshot"
        />
      </div>
      {coverage ? <p className="text-[10px] text-muted-foreground">{coverage}</p> : null}
      {data.limitations.unpricedReservationsPresent ? (
        <p className="text-[10px] text-muted-foreground">{PICKUP_UNPRICED_NOTE}</p>
      ) : null}
      <p className="text-[10px] text-muted-foreground">{data.limitations.availabilityNote}</p>
    </section>
  );
}
