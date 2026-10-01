import { ShieldCheck } from "lucide-react";
import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { RevenueControlAlert } from "@/packages/pms/lib/revenue/revenue-control";

export function RevenueAttention({
  alerts,
  embedded = false,
}: {
  alerts: RevenueControlAlert[];
  embedded?: boolean;
}) {
  const visibleAlerts = alerts.slice(0, 5);

  const content =
    visibleAlerts.length === 0 ? (
      <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F5] px-3.5 py-3 text-sm font-medium text-[#5A4833]">
        <ShieldCheck className="size-4.5 shrink-0 text-emerald-600" />
        <span>All revenue operations normal for this period.</span>
      </div>
    ) : (
      <ul className="divide-y divide-[#EFECE6] rounded-lg border border-[#EFECE6] bg-[#FAF8F5]/50">
        {visibleAlerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-col gap-1.5 px-3.5 py-2.5 transition-colors hover:bg-[#FAF8F5] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <InventoryStatusBadge
                tone={
                  alert.tone === "danger" ? "danger" : alert.tone === "warning" ? "warning" : "info"
                }
              >
                {alert.title}
              </InventoryStatusBadge>
              <span className="text-sm text-[#251605]">{alert.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    );

  if (embedded) {
    return <div className="mt-3">{content}</div>;
  }

  return (
    <section className="flex flex-col rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-[#251605]">Today’s Focus</h2>
        {visibleAlerts.length > 0 ? (
          <span className="rounded-full bg-[#FAF6F0] px-2.5 py-0.5 text-xs font-bold text-[#5A4833]">
            {alerts.length} {alerts.length === 1 ? "signal" : "signals"}
          </span>
        ) : null}
      </div>
      {content}
    </section>
  );
}
