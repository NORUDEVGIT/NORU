import { DEMAND_PICKUP_WINDOWS } from "@/packages/pms/lib/revenue/demand";
import type { PickupWindowDays } from "@/packages/pms/lib/revenue/pickup-pace";

export function PickupWindowSelector({
  value,
  onChange,
}: {
  value: PickupWindowDays;
  onChange: (windowDays: PickupWindowDays) => void;
}) {
  return (
    <div className="flex rounded-md border border-[#DED7CD] bg-white p-0.5">
      {DEMAND_PICKUP_WINDOWS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(days)}
          className={`h-7 rounded px-2 text-[10px] ${
            value === days ? "bg-[#F8F1E5] font-medium text-[#251605]" : "text-muted-foreground"
          }`}
        >
          {days}D
        </button>
      ))}
    </div>
  );
}
