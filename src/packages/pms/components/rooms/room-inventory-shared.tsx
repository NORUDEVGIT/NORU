import type { ReactNode } from "react";

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export function InventoryViewHeader({
  eyebrow = "Room & Inventory",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function InventoryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8E1D7] bg-card px-3 py-3 shadow-sm">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function InventoryStatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "border-border bg-muted/40 text-muted-foreground",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
    info: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function InventoryState({
  state,
  title,
  description,
  onRetry,
}: {
  state: "loading" | "error" | "empty";
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const Icon = state === "loading" ? Loader2 : state === "error" ? AlertCircle : Inbox;
  return (
    <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
      <div className="max-w-md">
        <Icon
          className={`mx-auto size-6 text-muted-foreground ${state === "loading" ? "animate-spin" : ""}`}
        />
        <h3 className="mt-3 text-sm font-semibold">
          {title ?? (state === "loading" ? "Loading operational data…" : "Nothing to show")}
        </h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
