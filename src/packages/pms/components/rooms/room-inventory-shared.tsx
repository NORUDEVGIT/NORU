import { useMemo, type ReactNode } from "react";

import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

export function InventoryViewHeader({
  eyebrow,
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
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

export interface PmsSelectOption {
  value: string;
  label: string;
}

export function PmsSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
  triggerClassName,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]> | PmsSelectOption[] | string[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const normalized: PmsSelectOption[] = useMemo(() => {
    return options.map((opt) => {
      if (Array.isArray(opt)) {
        return { value: opt[0], label: opt[1] };
      }
      if (typeof opt === "string") {
        return {
          value: opt,
          label:
            opt === "all"
              ? "All"
              : opt.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        };
      }
      return opt;
    });
  }, [options]);

  const selectedItem = normalized.find((item) => item.value === value);
  const internalValue = value === "" ? "__empty__" : value;

  return (
    <div className={cn("grid gap-1.5 min-w-0", className)}>
      {label ? (
        <span className="text-xs font-semibold text-[#5F554B]">{label}</span>
      ) : null}
      <Select
        value={internalValue}
        disabled={disabled}
        onValueChange={(val) => onChange(val === "__empty__" ? "" : val)}
      >
        <SelectTrigger
          className={cn(
            "h-9 min-w-0 rounded-lg border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] shadow-2xs hover:bg-[#FAF8F5] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]/25 transition-colors cursor-pointer",
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder}>
            {selectedItem ? selectedItem.label : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="border border-[#E5DED4] bg-white text-xs font-medium text-[#251605] shadow-lg max-h-72">
          {normalized.map((item) => (
            <SelectItem
              key={`${item.value}-${item.label}`}
              value={item.value === "" ? "__empty__" : item.value}
              className="text-xs text-[#251605] hover:bg-[#FAF8F5] focus:bg-[#FAF8F5] focus:text-[#251605] cursor-pointer"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const CompactSelect = PmsSelect;
