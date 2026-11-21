import { useEffect, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { PmsFilterNoteRow } from "@/packages/pms/components/pms-filter-menu";
import { PMS_FILTER_DATE } from "@/packages/pms/components/pms-filter-popover";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

/**
 * Toolbar search used by every report, matching the other module toolbars.
 */
export function ReportToolbarSearch({
  value,
  onCommit,
  placeholder,
  testId,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = window.setTimeout(() => onCommit(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value]);

  return (
    <div
      className="relative flex min-w-0 w-full flex-1 flex-wrap items-center"
      data-testid="reports-filter-bar"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-9 min-w-0 pl-8 pr-8 text-xs"
        placeholder={placeholder}
        aria-label="Search"
        data-testid={testId}
      />
      {draft ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onCommit("");
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Date field inside the shared filter menu. */
export function ReportFilterDate({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <PmsFilterNoteRow label={label}>
      <Input
        type="date"
        value={value}
        data-testid={testId}
        className={PMS_FILTER_DATE}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />
    </PmsFilterNoteRow>
  );
}

export function ReportFilterBar({
  children,
  onClear,
}: {
  children?: ReactNode;
  onClear?: () => void;
  onApply?: () => void;
}) {
  return (
    <div className="report-print-hide flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {children}
      {onClear ? (
        <button type="button" onClick={onClear} className="text-xs font-semibold">
          Clear
        </button>
      ) : null}
    </div>
  );
}

/** Compact segmented choice for report toolbars (not a native select). */
export function ReportToolbarSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#DDD4C5] bg-[#F7F4EE] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-[5px] px-2.5 text-[11px] font-semibold transition-colors",
            value === option.value
              ? "bg-white text-[#251605] shadow-xs"
              : "text-[#756A5B] hover:text-[#251605]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
