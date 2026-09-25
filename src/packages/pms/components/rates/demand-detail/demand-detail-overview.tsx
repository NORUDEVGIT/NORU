import { InventoryMetric, InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  DEMAND_DETAIL_LIVE_COPY,
  demandCalendarBandLabel,
  demandDetailAttention,
  type DemandCalendarCell,
} from "@/packages/pms/lib/revenue/demand-calendar";
import { DEMAND_FORECAST_UNAVAILABLE_TITLE, DEMAND_RECENT_BOOKING_ACTIVITY_LABEL } from "@/packages/pms/lib/revenue/demand-overview";

function toneForFlag(flag: string) {
  if (flag === "Sold Out" || flag === "Stop Sell") return "danger" as const;
  if (flag === "High Occupancy" || flag === "Low Remaining Inventory" || flag === "Restriction Active") {
    return "warning" as const;
  }
  return "info" as const;
}

export function DemandDetailOverview({
  cell,
  asOfBusinessDate,
  money,
}: {
  cell: DemandCalendarCell;
  asOfBusinessDate: string;
  money: (value: number) => string;
}) {
  const flags = demandDetailAttention(cell);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#251605]">{DEMAND_DETAIL_LIVE_COPY}</p>
      <div className="rounded-lg border border-[#E8E1D7] bg-[#F8F1E5] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B651D]">Information</p>
        <p className="mt-0.5 text-[11px] font-medium text-[#251605]">{DEMAND_FORECAST_UNAVAILABLE_TITLE}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <p>
          <span className="text-muted-foreground">Stay date</span>
          <br />
          {formatStayDate(cell.date)}
        </p>
        <p>
          <span className="text-muted-foreground">Room type</span>
          <br />
          {cell.roomTypeName}
        </p>
        <p>
          <span className="text-muted-foreground">As of business date</span>
          <br />
          {asOfBusinessDate}
        </p>
        <p>
          <span className="text-muted-foreground">Days to arrival</span>
          <br />
          {cell.daysToArrival}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InventoryMetric label="On the books" value={cell.roomsOnBooks} detail="Booked room nights" />
        <InventoryMetric label="Available" value={cell.roomsAvailable} detail="Active rooms × night" />
        <InventoryMetric label="Remaining" value={cell.roomsRemaining} detail="Available minus booked" />
        <InventoryMetric
          label="Occupancy"
          value={`${cell.occupancyPercent}%`}
          detail={demandCalendarBandLabel(cell.band)}
        />
        <InventoryMetric label="Booked revenue" value={money(cell.bookedRoomRevenue)} detail="Reservation pricing snapshots" />
        <InventoryMetric label="ADR" value={money(cell.adr)} detail="Booked revenue ÷ priced nights" />
        <InventoryMetric label="RevPAR" value={money(cell.revpar)} detail="Booked revenue ÷ available nights" />
        <InventoryMetric label="Priced share" value={`${cell.pricedShare}%`} detail="Priced nights ÷ booked nights" />
      </div>

      <section>
        <h4 className="text-[11px] font-semibold text-[#251605]">{DEMAND_RECENT_BOOKING_ACTIVITY_LABEL}</h4>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {cell.recentBookings} recent bookings. This is not pickup.
        </p>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold text-[#251605]">Attention</h4>
        {flags.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">No occupancy, inventory, restriction or override flags.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {flags.map((flag) => (
              <InventoryStatusBadge key={flag} tone={toneForFlag(flag)}>
                {flag}
              </InventoryStatusBadge>
            ))}
          </div>
        )}
        {cell.band === "sold-out" && cell.stopSell ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Sold out means remaining inventory is 0. Stop sell is an operational restriction and can apply even when rooms remain.
          </p>
        ) : null}
      </section>
    </div>
  );
}
