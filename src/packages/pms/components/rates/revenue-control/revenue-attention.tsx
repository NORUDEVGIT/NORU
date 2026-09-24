import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueControlAlert } from "@/packages/pms/lib/revenue/revenue-control";

export function RevenueAttention({ alerts }: { alerts: RevenueControlAlert[] }) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Today’s Focus</h2>
      <p className="text-[10px] text-muted-foreground">
        Operational attention from booked occupancy, inventory and applied restrictions.
      </p>
      {alerts.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No operational alerts in this range.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-[#EAE4DB] bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <InventoryStatusBadge
                  tone={alert.tone === "danger" ? "danger" : alert.tone === "warning" ? "warning" : "info"}
                >
                  {alert.title}
                </InventoryStatusBadge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{alert.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
