import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronDown, Filter } from "lucide-react";

import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_SELECT_TRIGGER,
} from "@/packages/pms/lib/pms-operational-surface";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

/** Shared NORU filter visual language (both cascading menus and compact panels). */
export const PMS_FILTER_TRIGGER =
  "relative size-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]";
export const PMS_FILTER_TRIGGER_ACTIVE = "border-[#C89933] bg-[#FBF4E4]";
export const PMS_FILTER_BADGE =
  "absolute -right-1.5 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-[#C89933] px-1 text-[10px] font-semibold leading-4 text-[#251605]";
export const PMS_FILTER_SURFACE =
  "border-[#e9dfd0] bg-white text-[#4a2c1a] shadow-[0_8px_24px_rgba(74,44,26,0.15)]";
export const PMS_FILTER_ROW =
  "rounded-md px-2 py-1.5 text-sm font-medium text-[#4a2c1a] outline-none hover:bg-[#F7F4EE] focus:bg-[#F7F4EE] focus:text-[#4a2c1a] data-[state=open]:bg-[#F7F4EE] focus-visible:ring-1 focus-visible:ring-[#C89933]";
export const PMS_FILTER_ITEM =
  "rounded-md text-sm text-[#4a2c1a] focus:bg-[#F7F4EE] focus:text-[#251605]";
export const PMS_FILTER_CASCADE_MENU = cn(PMS_FILTER_SURFACE, "w-[280px] rounded-md p-1.5");
export const PMS_FILTER_CASCADE_SUB = cn(
  PMS_FILTER_SURFACE,
  "max-h-80 min-w-52 w-[240px] overflow-y-auto rounded-md p-1",
);
export const PMS_FILTER_CASCADE_DATE = cn(
  PMS_FILTER_SURFACE,
  "w-[260px] overflow-visible rounded-md p-3",
);
export const PMS_FILTER_PANEL = cn(
  PMS_FILTER_SURFACE,
  "flex max-h-[75vh] w-[340px] flex-col overflow-hidden rounded-2xl p-0",
);

export const PMS_FILTER_SELECT_TRIGGER = cn(PMS_OP_SELECT_TRIGGER, "!h-9");
export const PMS_FILTER_DATE = cn(PMS_OP_INPUT, PMS_OP_DATE, "!h-9");

export const PmsFilterTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    activeCount: number;
    buttonTestId?: string;
    countTestId?: string;
  }
>(function PmsFilterTrigger(
  { activeCount, buttonTestId, countTestId, className, type = "button", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type={type}
      variant="outline"
      size="icon"
      aria-label="Filters"
      title="Filters"
      data-testid={buttonTestId}
      {...props}
      className={cn(
        PMS_FILTER_TRIGGER,
        "data-[state=open]:border-[#C89933] data-[state=open]:bg-[#FBF4E4]",
        activeCount > 0 && PMS_FILTER_TRIGGER_ACTIVE,
        className,
      )}
    >
      <Filter className="size-4" />
      {activeCount > 0 ? (
        <span data-testid={countTestId} className={PMS_FILTER_BADGE}>
          {activeCount}
        </span>
      ) : null}
    </Button>
  );
});

/**
 * Pattern B — compact single-panel filter (Waitlist, Arrivals, Exceptions).
 * Domain workspaces supply fields and callbacks.
 */
export function PmsFilterPopover({
  title,
  activeCount,
  open,
  onOpenChange,
  onClear,
  onApply,
  buttonTestId,
  countTestId,
  menuTestId,
  children,
}: {
  title: string;
  activeCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  onApply: () => void;
  buttonTestId?: string;
  countTestId?: string;
  menuTestId?: string;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <PmsFilterTrigger
          activeCount={activeCount}
          buttonTestId={buttonTestId}
          countTestId={countTestId}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className={PMS_FILTER_PANEL}
        data-testid={menuTestId}
      >
        <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-[#efe7d8] px-4 py-2.5">
          <p className="text-sm font-bold text-[#4a2c1a]">{title}</p>
          {activeCount > 0 ? (
            <p className="text-[11px] font-medium text-[#8A641A]">{activeCount} active</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#E8DFD0] bg-white px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs font-medium text-[#4a2c1a] hover:bg-[#F7F4EE]"
            onClick={onClear}
          >
            Clear all
          </Button>
          <Button
            type="button"
            className={cn(SHELL_PRIMARY_BUTTON, "h-8 px-3 text-xs")}
            onClick={onApply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PmsFilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[#efe7d8] px-4 py-3 last:border-b-0">
      <p className="text-xs font-bold text-[#4a2c1a]">{title}</p>
      {children}
    </div>
  );
}

export function PmsFilterGroup({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#efe7d8] last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="text-xs font-bold text-[#4a2c1a]">{title}</span>
        <span className="flex min-w-0 items-center gap-1">
          {!open && summary ? (
            <span className="max-w-32 truncate text-[11px] font-normal text-[#8A641A]">{summary}</span>
          ) : null}
          <ChevronDown className={cn("size-3.5 shrink-0 text-[#7A6B58]", open && "rotate-180")} />
        </span>
      </button>
      {open ? <div className="px-4 pb-3">{children}</div> : null}
    </div>
  );
}

export function PmsFilterSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={PMS_FILTER_SELECT_TRIGGER} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PmsFilterDateRange({
  from,
  to,
  onFrom,
  onTo,
  fromLabel = "From",
  toLabel = "To",
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1">
        <span className="text-[10px] font-medium text-[#7A6B58]">{fromLabel}</span>
        <Input
          type="date"
          className={PMS_FILTER_DATE}
          value={from}
          aria-label={fromLabel}
          onChange={(event) => onFrom(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-medium text-[#7A6B58]">{toLabel}</span>
        <Input
          type="date"
          className={PMS_FILTER_DATE}
          value={to}
          aria-label={toLabel}
          onChange={(event) => onTo(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </label>
    </div>
  );
}

export function PmsFilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md py-0.5 text-sm text-[#4a2c1a]">
      {label}
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
    </label>
  );
}
