import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, RefreshCw } from "lucide-react";

import {
  SHELL_ICON_BUTTON,
  SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

/**
 * Places in the shared Rooms & Inventory toolbar. Each workspace fills them with its own
 * controls so the module keeps one toolbar instead of each workspace drawing its own.
 */
export type RoomInventoryShellSlots = {
  controls: HTMLElement | null;
  filter: HTMLElement | null;
  actions: HTMLElement | null;
  cta: HTMLElement | null;
};

const RoomInventoryShellContext = createContext<RoomInventoryShellSlots | null>(null);

export const RoomInventoryShellProvider = RoomInventoryShellContext.Provider;

export function RoomShellSlot({
  name,
  children,
}: {
  name: keyof RoomInventoryShellSlots;
  children: ReactNode;
}) {
  const slots = useContext(RoomInventoryShellContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

export { SHELL_ICON_BUTTON as ROOM_SHELL_ICON_BUTTON, SHELL_PRIMARY_BUTTON as ROOM_SHELL_PRIMARY_BUTTON };

export function RoomShellRefreshButton({
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

export function RoomShellExportButton({
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

/** Compact inline summary values that replace secondary KPI dashboards inside a workspace. */
export function RoomSummaryChips({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: "neutral" | "success" | "info" | "warning" | "danger" }>;
  className?: string;
}) {
  const tones = {
    neutral: "border-[#DDD4C5] bg-[#FAF8F4] text-[#4a2c1a]",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
            tones[item.tone ?? "neutral"],
          )}
        >
          <span className="text-[#756A5B]">{item.label}</span>
          <span className="font-semibold">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

export const ROOM_TABLE_WRAP = "min-w-0 overflow-hidden rounded-lg border border-[#DDD4C5] bg-white shadow-sm";
export const ROOM_TABLE_HEAD =
  "border-b border-[#DDD4C5] bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground";
export const ROOM_TABLE_TH = "px-2 py-2.5";
export const ROOM_TABLE_TD = "px-2 py-2.5";
export const ROOM_TABLE_ROW = "border-t border-border transition-colors hover:bg-[#FAF7EF]";
export const ROOM_TABLE_ROW_SELECTED = "bg-[#F4E9D0]/70";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Shared table footer: count on the left, rows-per-page and Previous/Next on the right. */
export function RoomTableFooter({
  page,
  pageCount,
  total,
  pageSize,
  noun,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize ? (
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="h-8 rounded-md border border-[#DDD4C5] bg-white px-2 text-xs text-[#251605]"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-[#DDD4C5] px-3 text-xs font-medium"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-[#DDD4C5] px-3 text-xs font-medium"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
