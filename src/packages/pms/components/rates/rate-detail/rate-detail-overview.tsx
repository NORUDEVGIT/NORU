import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RateCalendarCell,
  RateCalendarPlan,
  RateCalendarRoomType,
} from "@/packages/pms/lib/revenue/rate-calendar";
import {
  RATE_CALENDAR_HISTORY_EMPTY,
  inventoryBandLabel,
} from "@/packages/pms/lib/revenue/rate-calendar";
import type { RateChangeHistoryRow } from "@/packages/pms/lib/revenue/rate-change";
import type { DrawerTab } from "./rate-detail-drawer";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] py-2.5">
      <dt className="text-xs font-medium text-[#756A5B]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

export function RateDetailOverview({
  cell,
  plan,
  roomType,
  money,
  lastChange,
  onSelectTab,
}: {
  cell: RateCalendarCell;
  plan: RateCalendarPlan;
  roomType: RateCalendarRoomType;
  money: (value: number) => string;
  lastChange: RateChangeHistoryRow | null;
  onSelectTab?: (tab: DrawerTab) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3">
          <p className="text-xs font-medium text-[#756A5B]">Current Effective Rate</p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-[#251605]">
            {money(cell.effectiveRate)}
          </p>
          <p className="mt-0.5 text-xs text-[#8A641A]">
            {cell.overrideActive ? "Override active" : "Using base rate"}
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3">
          <p className="text-xs font-medium text-[#756A5B]">Base Rate</p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-[#251605]">
            {money(cell.baseRate)}
          </p>
          <p className="mt-0.5 text-xs text-[#756A5B]">{cell.currency}</p>
        </div>
      </div>

      <dl className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-1">
        <Row label="Room Type" value={roomType.name} />
        <Row label="Rate Plan" value={`${plan.code} — ${plan.name}`} />
        <Row label="Stay Date" value={formatStayDate(cell.date)} />
        <Row
          label="Override Rate"
          value={cell.overrideRate == null ? "None" : money(cell.overrideRate)}
        />
        <Row label="Occupancy" value={`${cell.inventory.occupancyPercent}%`} />
        <Row label="Rooms Sold" value={String(cell.inventory.roomsSold)} />
        <Row label="Available Inventory" value={String(cell.inventory.roomsAvailable)} />
        <Row
          label="Inventory Status"
          value={`${inventoryBandLabel(cell.inventory.band)} · ${cell.inventory.remainingRooms} remaining`}
        />
        <Row label="Restrictions" value={cell.restrictionLabel ?? "None"} />
        {lastChange ? (
          <>
            <Row label="Last Changed" value={new Date(lastChange.createdAt).toLocaleString()} />
            <Row label="Changed By" value={lastChange.actorMembershipId ?? "Staff"} />
            <Row label="Reason" value={lastChange.reason ?? "—"} />
          </>
        ) : (
          <p className="py-3 text-xs text-[#756A5B]">{RATE_CALENDAR_HISTORY_EMPTY}</p>
        )}
      </dl>

      {onSelectTab ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectTab("edit")}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#B5882D]"
          >
            Edit Rate
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("restrictions")}
            className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
          >
            View Restrictions
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("history")}
            className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
          >
            View Rate History
          </button>
        </div>
      ) : null}
    </div>
  );
}
