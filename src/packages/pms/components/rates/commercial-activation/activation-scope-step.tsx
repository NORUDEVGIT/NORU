import { ACTIVATION_SCOPE_NARROW_NOTE } from "@/packages/pms/lib/revenue/commercial-activation-workflow";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";

export function ActivationScopeStep({
  roomTypes,
  ratePlans,
  roomTypeIds,
  ratePlanIds,
  eligibleRoomTypeIds,
  eligibleRatePlanIds,
  onToggleRoom,
  onTogglePlan,
}: {
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  roomTypeIds: string[];
  ratePlanIds: string[];
  eligibleRoomTypeIds?: string[];
  eligibleRatePlanIds?: string[];
  onToggleRoom: (id: string) => void;
  onTogglePlan: (id: string) => void;
}) {
  const rooms = eligibleRoomTypeIds && eligibleRoomTypeIds.length > 0
    ? roomTypes.filter((row) => eligibleRoomTypeIds.includes(row.id))
    : roomTypes;
  const plans = eligibleRatePlanIds && eligibleRatePlanIds.length > 0
    ? ratePlans.filter((row) => eligibleRatePlanIds.includes(row.id))
    : ratePlans;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-[#251605]">Scope</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">{ACTIVATION_SCOPE_NARROW_NOTE}</p>
      </div>
      <fieldset>
        <legend className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Room Types
        </legend>
        <p className="mb-1 text-[10px] text-muted-foreground">
          {roomTypeIds.length === 0 ? "All eligible room types" : `${roomTypeIds.length} selected`}
        </p>
        <ScopeList
          items={rooms.map((row) => ({ id: row.id, label: row.name }))}
          selected={roomTypeIds}
          onToggle={onToggleRoom}
          emptyLabel="No eligible room types."
        />
        {roomTypeIds.length > 0 ? (
          <p className="mt-1 text-[10px] text-[#251605]">
            {rooms.filter((row) => roomTypeIds.includes(row.id)).map((row) => row.name).join(", ")}
          </p>
        ) : null}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Rate Plans
        </legend>
        <p className="mb-1 text-[10px] text-muted-foreground">
          {ratePlanIds.length === 0 ? "All eligible rate plans" : `${ratePlanIds.length} selected`}
        </p>
        <ScopeList
          items={plans.map((row) => ({ id: row.id, label: row.code }))}
          selected={ratePlanIds}
          onToggle={onTogglePlan}
          emptyLabel="No eligible rate plans."
        />
        {ratePlanIds.length > 0 ? (
          <p className="mt-1 text-[10px] text-[#251605]">
            {plans.filter((row) => ratePlanIds.includes(row.id)).map((row) => row.code).join(", ")}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}

function ScopeList({
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-[#E8E1D7] bg-white p-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-[11px] text-[#251605]">
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
          {item.label}
        </label>
      ))}
    </div>
  );
}
