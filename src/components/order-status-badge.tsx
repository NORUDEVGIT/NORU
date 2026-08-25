import { cn } from "@/lib/utils";

/** Maps the database order statuses to operator-friendly labels + restrained colour. */
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-primary/10 text-primary" },
  placed: { label: "New", className: "bg-primary/10 text-primary" },
  accepted: { label: "Accepted", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  preparing: { label: "Preparing", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  ready: { label: "Ready", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  served: { label: "Served", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
