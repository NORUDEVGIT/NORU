import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export function MoreFiltersMenu({
  open,
  onOpenChange,
  activeCount,
  title,
  onApply,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  title: string;
  onApply: () => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-full border-[#e9dfd0] bg-white px-4 font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]"
        >
          <SlidersHorizontal className="size-4 text-[#c9a24a]" />
          More filters
          {activeCount > 0 ? (
            <span className="inline-flex min-w-5 justify-center rounded-full bg-[#C89933] px-1.5 text-[11px] font-semibold text-[#251605]">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 rounded-2xl border-[#e9dfd0] bg-white p-0 shadow-[0_8px_24px_rgba(74,44,26,0.15)]"
      >
        <p className="border-b border-[#e9dfd0] px-4 py-3 text-sm font-bold text-[#4a2c1a]">
          {title}
        </p>
        <div className="max-h-96 overflow-y-auto p-2">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-[#e9dfd0] px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full font-semibold text-[#4a2c1a] hover:bg-[#f5ead0]"
            onClick={onClear}
          >
            Clear all
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full bg-[#C89933] font-bold text-[#251605] hover:bg-[#B98B2D]"
            onClick={onApply}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterGroup({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-semibold text-[#4a2c1a] hover:bg-[#faf7f1]"
        onClick={() => onToggle(id)}
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 ? (
            <span className="inline-flex min-w-5 justify-center rounded-full bg-[#f5ead0] px-1.5 text-[11px] font-semibold text-[#8C6D23]">
              {count}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("size-4 text-[#c9a24a] transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="grid gap-0.5 px-2 pb-2">{children}</div> : null}
    </div>
  );
}

export function FilterOption({
  type,
  name,
  label,
  checked,
  onChange,
}: {
  type: "radio" | "checkbox";
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#4a2c1a] hover:bg-[#faf7f1]">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[#C89933]"
      />
      {label}
    </label>
  );
}
