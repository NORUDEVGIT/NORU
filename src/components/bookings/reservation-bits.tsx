import { cn } from "@/shared/lib/utils";
import type { ReservationStatus } from "@/lib/reservation-dates";

export { formatStayDate, addDays, nightsBetween, propertyToday } from "@/lib/reservation-dates";

const STATUS_STYLES: Record<ReservationStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  confirmed: { label: "Confirmed", className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  checked_in: { label: "In-House", className: "bg-primary/15 text-primary" },
  checked_out: { label: "Checked Out", className: "bg-muted text-muted-foreground" },
  no_show: { label: "No-Show", className: "bg-destructive/10 text-destructive" },
};


export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const map = STATUS_STYLES[status];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", map.className)}>
      {map.label}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
