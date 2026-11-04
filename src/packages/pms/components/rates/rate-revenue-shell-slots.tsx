import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Download, RefreshCw, Search, Table2, X } from "lucide-react";

import {
  SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type RateRevenueShellSlots = {
  date: HTMLElement | null;
  search: HTMLElement | null;
  filter: HTMLElement | null;
  export: HTMLElement | null;
  view: HTMLElement | null;
  cta: HTMLElement | null;
};

const RateRevenueShellContext = createContext<RateRevenueShellSlots | null>(null);

export const RateRevenueShellProvider = RateRevenueShellContext.Provider;

export function RateRevenueShellSlot({
  name,
  children,
}: {
  name: keyof RateRevenueShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(RateRevenueShellContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

export {
  SHELL_ICON_BUTTON as RATE_REVENUE_SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON as RATE_REVENUE_SHELL_PRIMARY_BUTTON,
};

export function RateRevenueDateRange({
  fromDate,
  toDate,
  onChange,
}: {
  fromDate: string;
  toDate: string;
  onChange: (fromDate: string, toDate: string) => void;
}) {
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-[#DDD4C5] bg-white px-1.5"
      data-testid="rate-revenue-date-range"
    >
      <Input
        type="date"
        aria-label="From date"
        value={fromDate}
        onChange={(event) => onChange(event.target.value, toDate)}
        className="h-7 w-[8.75rem] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
      <span className="text-[11px] text-[#756A5B]">–</span>
      <Input
        type="date"
        aria-label="To date"
        value={toDate}
        onChange={(event) => onChange(fromDate, event.target.value)}
        className="h-7 w-[8.75rem] border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

export function RateRevenueToolbarSearch({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId?: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 pl-8 pr-8 text-xs"
        placeholder={placeholder}
        aria-label="Search"
        data-testid={testId}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function RateRevenueExportButton({
  onClick,
  disabled = false,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={SHELL_ICON_BUTTON}
      onClick={onClick}
      disabled={disabled}
      aria-label="Export"
      title="Export"
      data-testid={testId}
    >
      <Download className="size-4" />
    </Button>
  );
}

export function RateRevenueViewSwitcher({
  value,
  onChange,
}: {
  value: "table" | "chart";
  onChange: (value: "table" | "chart") => void;
}) {
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#DDD4C5] bg-white p-0.5"
      data-testid="rate-revenue-view-switcher"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Table"
        title="Table"
        aria-pressed={value === "table"}
        className={cn(
          "size-8",
          value === "table" ? "bg-[#F4E9D0] text-[#251605]" : "text-[#756A5B]",
        )}
        onClick={() => onChange("table")}
      >
        <Table2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Chart"
        title="Chart"
        aria-pressed={value === "chart"}
        className={cn(
          "size-8",
          value === "chart" ? "bg-[#F4E9D0] text-[#251605]" : "text-[#756A5B]",
        )}
        onClick={() => onChange("chart")}
      >
        <BarChart3 className="size-4" />
      </Button>
    </div>
  );
}

export function RateRevenueRefreshButton({
  onClick,
  spinning = false,
}: {
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={SHELL_ICON_BUTTON}
      onClick={onClick}
      aria-label="Refresh"
      title="Refresh"
      data-testid="rate-revenue-refresh"
    >
      <RefreshCw className={cn("size-4", spinning && "animate-spin")} />
    </Button>
  );
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map((cell) => escape(cell)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
