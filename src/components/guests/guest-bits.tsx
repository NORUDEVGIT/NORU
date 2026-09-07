import { Star } from "lucide-react";

export function VipBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
      <Star className="size-3" /> VIP
    </span>
  );
}

export function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={
        status === "active"
          ? "inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success"
          : "inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}
