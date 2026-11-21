import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  History,
  Lock,
  Menu,
  Receipt,
  SlidersHorizontal,
} from "lucide-react";

import {
  FOLIO_WORKSPACE_TABS,
  type FolioWorkspaceTabId,
} from "@/packages/pms/lib/folio-workspace";
import { addDays } from "@/packages/pms/lib/reservation-dates";
import { formatInclusiveRangeLabel } from "@/packages/pms/lib/reservation-workspace/section-week";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export type FolioChromeSlots = {
  dates: HTMLElement | null;
  search: HTMLElement | null;
  filter: HTMLElement | null;
  cta: HTMLElement | null;
};

const FolioChromeContext = createContext<FolioChromeSlots | null>(null);

export const FolioChromeProvider = FolioChromeContext.Provider;

export const FOLIO_TABS_WITH_SEARCH = new Set<FolioWorkspaceTabId>(["payments", "history"]);

export function FolioChromeSlot({
  name,
  children,
}: {
  name: keyof FolioChromeSlots;
  children: ReactNode;
}) {
  const slots = useContext(FolioChromeContext);
  if (!slots) return null;
  const node = slots[name];
  return node ? createPortal(children, node) : null;
}

function rangeLabel(from: string, to: string): string {
  if (from && to) return formatInclusiveRangeLabel(from <= to ? from : to, from <= to ? to : from);
  if (from) return formatInclusiveRangeLabel(from, from);
  if (to) return formatInclusiveRangeLabel(to, to);
  return "All dates";
}

function shiftRange(from: string, to: string, direction: -1 | 1): { from: string; to: string } | null {
  if (!from && !to) return null;
  if (from && to) {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const startMs = new Date(`${start}T00:00:00Z`).getTime();
    const endMs = new Date(`${end}T00:00:00Z`).getTime();
    const span = Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
    return { from: addDays(start, direction * span), to: addDays(end, direction * span) };
  }
  if (from) return { from: addDays(from, direction), to };
  return { from, to: addDays(to, direction) };
}

export function FolioDateRange({
  from,
  to,
  onFrom,
  onTo,
  fromTestId,
  toTestId,
  allowClear = true,
  onRange,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  fromTestId: string;
  toTestId: string;
  allowClear?: boolean;
  onRange?: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const canShift = Boolean(from || to);

  function applyRange(nextFrom: string, nextTo: string) {
    if (onRange) {
      onRange(nextFrom, nextTo);
      return;
    }
    onFrom(nextFrom);
    onTo(nextTo);
  }

  function shift(direction: -1 | 1) {
    const next = shiftRange(from, to, direction);
    if (!next) return;
    applyRange(next.from, next.to);
  }

  return (
    <div
      className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#DDD4C5] bg-white"
      data-testid="folio-date-range"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-r-none"
        aria-label="Previous period"
        disabled={!canShift}
        onClick={() => shift(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 min-w-[8.75rem] px-1.5 text-xs font-semibold tabular-nums text-[#251605]"
            aria-label="Date range"
          >
            {rangeLabel(from, to)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto space-y-2 p-3">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            From
            <Input
              type="date"
              aria-label="From"
              data-testid={fromTestId}
              className="h-9 w-40"
              value={from}
              onChange={(event) => onFrom(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            To
            <Input
              type="date"
              aria-label="To"
              data-testid={toTestId}
              className="h-9 w-40"
              value={to}
              onChange={(event) => onTo(event.target.value)}
            />
          </label>
          {allowClear && (from || to) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full"
              onClick={() => applyRange("", "")}
            >
              All dates
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-l-none"
        aria-label="Next period"
        disabled={!canShift}
        onClick={() => shift(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function FolioDetailsSearch({
  folioNumber,
  guestName,
  room,
  onOpen,
}: {
  folioNumber: string;
  guestName: string;
  room: string | null;
  onOpen: () => void;
}) {
  const detail = [guestName, room ? `Room ${room}` : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="folio-details"
      className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#DDD4C5] bg-white px-2.5 text-left hover:bg-[#F7F4EE]"
    >
      <BedDouble className="size-3.5 shrink-0 text-[#8A6A24]" />
      <span className="shrink-0 truncate text-xs font-semibold text-[#251605]">{folioNumber}</span>
      <span className="min-w-0 truncate text-xs text-[#756A5B]">{detail}</span>
    </button>
  );
}

const SECTION_ICONS = {
  charges: Receipt,
  payments: CreditCard,
  adjustments: SlidersHorizontal,
  transfers: ArrowLeftRight,
  invoices: FileText,
  history: History,
  settlement: Lock,
} as const;

export function FolioSectionBurger({
  active,
  onSelect,
}: {
  active: FolioWorkspaceTabId;
  onSelect: (id: FolioWorkspaceTabId) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Folio sections"
          title="Folio sections"
          data-testid="folio-nav-trigger"
          className="size-8 text-[#251605] opacity-70 hover:bg-[#F3EEE4] hover:opacity-100 data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100"
        >
          <Menu className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-1.5"
        data-testid="folio-workspace-nav"
        aria-label="Folio sections"
      >
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Folio
        </p>
        <div className="flex flex-col gap-0.5">
          {FOLIO_WORKSPACE_TABS.map((item) => {
            const Icon = SECTION_ICONS[item.id];
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`folio-tab-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-foreground hover:bg-[#F7F4EE]",
                )}
              >
                <Icon className="size-4 shrink-0 text-[#8A6A24]" />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
