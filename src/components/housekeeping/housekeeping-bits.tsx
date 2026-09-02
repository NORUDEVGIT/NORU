import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function HkStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    dirty: "bg-destructive/15 text-destructive",
    clean: "bg-primary/15 text-primary",
    inspected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pickup: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", map[status])}>
      {status}
    </Badge>
  );
}

export function RestrictionBadge({ status }: { status: string }) {
  const label =
    status === "out_of_order" ? "Out of order" : status === "out_of_service" ? "Out of service" : "Available";
  const tone =
    status === "available"
      ? "bg-muted text-muted-foreground"
      : "bg-destructive/15 text-destructive";
  return (
    <Badge variant="outline" className={cn("border-transparent", tone)}>
      {label}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    assigned: "bg-primary/15 text-primary",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    cancelled: "bg-muted text-muted-foreground line-through",
  };
  return (
    <Badge variant="outline" className={cn("border-transparent", map[status])}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal") return <span className="text-sm text-muted-foreground">Normal</span>;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent capitalize",
        priority === "urgent"
          ? "bg-destructive/15 text-destructive"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      )}
    >
      {priority}
    </Badge>
  );
}

export function labelTaskType(type: string) {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
