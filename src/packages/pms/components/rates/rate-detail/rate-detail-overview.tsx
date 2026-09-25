import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RateCalendarCell, RateCalendarPlan, RateCalendarRoomType } from "@/packages/pms/lib/revenue/rate-calendar";
import { RATE_CALENDAR_HISTORY_EMPTY, inventoryBandLabel } from "@/packages/pms/lib/revenue/rate-calendar";
import type { RateChangeHistoryRow } from "@/packages/pms/lib/revenue/rate-change";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

export function RateDetailOverview({
  cell,
  plan,
  roomType,
  money,
  lastChange,
}: {
  cell: RateCalendarCell;
  plan: RateCalendarPlan;
  roomType: RateCalendarRoomType;
  money: (value: number) => string;
  lastChange: RateChangeHistoryRow | null;
}) {
  return (
    <dl>
      <Row label="Room type" value={roomType.name} />
      <Row label="Rate plan" value={`${plan.code} — ${plan.name}`} />
      <Row label="Stay date" value={formatStayDate(cell.date)} />
      <Row label="Currency" value={cell.currency} />
      <Row label="Base rate" value={money(cell.baseRate)} />
      <Row label="Override rate" value={cell.overrideRate == null ? "None" : money(cell.overrideRate)} />
      <Row label="Effective rate" value={money(cell.effectiveRate)} />
      <Row label="Occupancy" value={`${cell.inventory.occupancyPercent}%`} />
      <Row label="Rooms sold" value={String(cell.inventory.roomsSold)} />
      <Row label="Rooms available" value={String(cell.inventory.roomsAvailable)} />
      <Row
        label="Inventory"
        value={`${inventoryBandLabel(cell.inventory.band)} · ${cell.inventory.remainingRooms} remaining`}
      />
      <Row label="Restrictions" value={cell.restrictionLabel ?? "None"} />
      {lastChange ? (
        <>
          <Row label="Last changed" value={new Date(lastChange.createdAt).toLocaleString()} />
          <Row label="Changed by" value={lastChange.actorMembershipId ?? "Staff"} />
          <Row label="Reason" value={lastChange.reason ?? "—"} />
        </>
      ) : (
        <p className="pt-3 text-xs text-muted-foreground">{RATE_CALENDAR_HISTORY_EMPTY}</p>
      )}
    </dl>
  );
}
