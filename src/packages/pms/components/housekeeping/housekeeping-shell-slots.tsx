import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, LayoutGrid, RefreshCw, Search, Table2, X } from "lucide-react";

import {
  SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type HousekeepingShellSlots = {
  date: HTMLElement | null;
  search: HTMLElement | null;
  filter: HTMLElement | null;
  export: HTMLElement | null;
  view: HTMLElement | null;
  cta: HTMLElement | null;
};

const HousekeepingShellContext = createContext<HousekeepingShellSlots | null>(null);

export const HousekeepingShellProvider = HousekeepingShellContext.Provider;

export function HkShellSlot({
  name,
  children,
}: {
  name: keyof HousekeepingShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(HousekeepingShellContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

export { SHELL_ICON_BUTTON as HK_SHELL_ICON_BUTTON, SHELL_PRIMARY_BUTTON as HK_SHELL_PRIMARY_BUTTON };

export function HkBusinessDate({ today }: { today: string }) {
  return (
    <Input
      value={today}
      readOnly
      className="h-9 w-[132px] shrink-0 bg-[#FAF8F4] text-xs"
      aria-label="Business date"
    />
  );
}

export function HkToolbarSearch({
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

export function HkViewSwitcher({
  value,
  onChange,
  testId = "hk-view-switcher",
}: {
  value: "board" | "table";
  onChange: (value: "board" | "table") => void;
  testId?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-[#DDD4C5] bg-white p-0.5"
      role="group"
      aria-label="Housekeeping view"
      data-testid={testId}
    >
      {(
        [
          ["board", "Board", LayoutGrid],
          ["table", "Table", Table2],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={value === id}
          title={label}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-sm transition-colors",
            value === id
              ? "bg-[#C89933] text-[#251605]"
              : "bg-transparent text-muted-foreground hover:bg-[#F3EEE4] hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function HkShellExportButton({
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

export function HkShellRefreshButton({
  onClick,
  spinning = false,
  testId,
}: {
  onClick: () => void;
  spinning?: boolean;
  testId?: string;
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
      data-testid={testId}
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
