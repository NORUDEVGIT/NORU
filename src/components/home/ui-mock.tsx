import { cn } from "@/lib/utils";

/**
 * Presentational-only mock panels used on the marketing homepage.
 * They mirror real NORU UI patterns (order cards, status chips, KPI tiles)
 * and intentionally carry no live data.
 */

export function MockChip({
  label,
  tone = "gold",
}: {
  label: string;
  tone?: "gold" | "green" | "muted";
}) {
  const tones = {
    gold: "bg-accent/20 text-accent-foreground",
    green: "bg-success/15 text-success",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[tone])}>
      {label}
    </span>
  );
}

export function MockOrderCard({
  order,
  table,
  status,
  tone = "gold",
  lines,
}: {
  order: string;
  table: string;
  status: string;
  tone?: "gold" | "green" | "muted";
  lines: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{order}</p>
          <p className="truncate text-xs text-muted-foreground">{table}</p>
        </div>
        <MockChip label={status} tone={tone} />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="truncate">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MockKpi({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-3 h-2 w-2/3 rounded-full bg-accent/40" />
      <div className="mt-2 h-2 w-1/3 rounded-full bg-muted" />
      <p className="mt-3 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function MockBars() {
  const bars = [40, 62, 48, 78, 56, 88, 70];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">Orders overview</p>
      <div className="mt-4 flex h-24 items-end gap-2">
        {bars.map((height, index) => (
          <div
            key={index}
            style={{ height: `${height}%` }}
            className={cn(
              "flex-1 rounded-t-md",
              index % 3 === 0 ? "bg-success/60" : "bg-accent/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}
