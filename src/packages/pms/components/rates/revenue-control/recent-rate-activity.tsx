import { HISTORY_EMPTY_COPY, type RevenueControlActivity } from "@/packages/pms/lib/revenue/revenue-control";

function actionLabel(actionType: string): string {
  if (actionType === "bulk_rate_change") return "Bulk change";
  if (actionType === "reset_override") return "Reset override";
  if (actionType === "copy_rate") return "Copy rate";
  return "Rate change";
}

export function RecentRateActivity({ activity, error }: { activity: RevenueControlActivity; error: string | null }) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#251605]">Recent Rate Activity</h2>
      <p className="text-[10px] text-muted-foreground">From hotel_rate_change_events. History starts at migration 0101.</p>
      {error ? (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      ) : !activity.available || activity.empty ? (
        <p className="mt-4 text-xs text-muted-foreground">{HISTORY_EMPTY_COPY}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activity.rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-[#EAE4DB] bg-white px-3 py-2">
              <p className="text-[11px] font-medium text-[#251605]">
                {actionLabel(row.actionType)} · {row.ratePlanCode ?? "Plan"} · {row.stayDate}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {row.roomTypeName ?? "Room type"} · {new Date(row.createdAt).toLocaleString()}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
