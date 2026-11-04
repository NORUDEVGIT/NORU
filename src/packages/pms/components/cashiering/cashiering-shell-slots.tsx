import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, RefreshCw, Search, X } from "lucide-react";

import {
  SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

export type CashieringShellSlots = {
  search: HTMLElement | null;
  filter: HTMLElement | null;
  export: HTMLElement | null;
  cta: HTMLElement | null;
};

const CashieringShellContext = createContext<CashieringShellSlots | null>(null);

export const CashieringShellProvider = CashieringShellContext.Provider;

export function CashieringShellSlot({
  name,
  children,
}: {
  name: keyof CashieringShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(CashieringShellContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

export { SHELL_ICON_BUTTON as CASHIERING_SHELL_ICON_BUTTON, SHELL_PRIMARY_BUTTON as CASHIERING_SHELL_PRIMARY_BUTTON };

export function CashieringToolbarSearch({
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

export function CashieringShellExportButton({
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

export function CashieringShellRefreshButton({
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
