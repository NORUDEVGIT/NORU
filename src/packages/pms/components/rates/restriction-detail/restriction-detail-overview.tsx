import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RateCalendarPlan, RateCalendarRoomType } from "@/packages/pms/lib/revenue/rate-calendar";
import type { RestrictionHistoryRow } from "@/packages/pms/lib/revenue/restriction-change";
import type { RestrictionCalendarCell } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  RESTRICTION_CALENDAR_HISTORY_EMPTY,
  restrictionActorLabel,
} from "@/packages/pms/lib/revenue/restriction-calendar";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

export function RestrictionDetailOverview({
  cell,
  plan,
  roomType,
  lastChange,
}: {
  cell: RestrictionCalendarCell;
  plan: RateCalendarPlan;
  roomType: RateCalendarRoomType;
  lastChange: RestrictionHistoryRow | null;
}) {
  return (
    <dl>
      <Row label="Room type" value={roomType.name} />
      <Row label="Rate plan" value={`${plan.code} — ${plan.name}`} />
      <Row label="Stay date" value={formatStayDate(cell.date)} />
      <Row label="Min stay" value={cell.restriction.minStay == null ? "—" : `${cell.restriction.minStay} nights`} />
      <Row label="Max stay" value={cell.restriction.maxStay == null ? "—" : `${cell.restriction.maxStay} nights`} />
      <Row label="Closed to arrival" value={cell.restriction.closedToArrival ? "Closed" : "Open"} />
      <Row label="Closed to departure" value={cell.restriction.closedToDeparture ? "Closed" : "Open"} />
      <Row label="Stop sell" value={cell.restriction.stopSell ? "On" : "Off"} />
      {!cell.hasRestriction ? (
        <p className="pt-3 text-xs text-muted-foreground">No restrictions applied</p>
      ) : null}
      <Row label="Occupancy" value={`${cell.inventory.occupancyPercent}%`} />
      <Row label="Rooms sold" value={String(cell.inventory.roomsSold)} />
      <Row label="Rooms available" value={String(cell.inventory.roomsAvailable)} />
      {lastChange ? (
        <>
          <Row label="Last changed" value={new Date(lastChange.createdAt).toLocaleString()} />
          <Row label="Changed by" value={restrictionActorLabel(lastChange)} />
          <Row label="Reason" value={lastChange.reason ?? "—"} />
        </>
      ) : (
        <p className="pt-3 text-xs text-muted-foreground">{RESTRICTION_CALENDAR_HISTORY_EMPTY}</p>
      )}
      {!plan.active ? (
        <p className="pt-3 text-[10px] text-[#6B4A0A]">This rate plan is inactive. Restriction edits are still allowed.</p>
      ) : null}
      {cell.outsideValidity ? (
        <p className="pt-3 text-[10px] text-[#6B4A0A]">This date is outside the rate plan validity window.</p>
      ) : null}
    </dl>
  );
}
