import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  FileText,
  Menu,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Utensils,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  ReportsShellProvider,
  type ReportsShellSlots,
} from "@/packages/pms/components/reports/reports-shell-slots";
import { type ReportGroupId, type ReportId, type ReportsView } from "@/packages/pms/lib/reports-shell";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export interface ReportOptionMeta {
  id: ReportId;
  name: string;
  description: string;
  group: string;
  icon: typeof FileText;
  badge?: string;
}

export const REPORT_OPTIONS_CATALOGUE: ReportOptionMeta[] = [
  {
    id: "police",
    name: "Police / Guest Stay Report",
    description: "Named in-house guest register for law enforcement & statutory audits",
    group: "Guest & Stay Registers",
    icon: FileText,
    badge: "Official",
  },
  {
    id: "cashier-invoice",
    name: "Cashier Invoice Report",
    description: "Issued guest, company, and account invoices with tax & payment breakdown",
    group: "Financial Registers",
    icon: Receipt,
    badge: "Invoices",
  },
  {
    id: "fiscal-registration",
    name: "Fiscal Registration Report",
    description: "Fiscal device registrations, e-invoices, and sales receipts log",
    group: "Financial Registers",
    icon: ShieldCheck,
    badge: "Fiscal",
  },
  {
    id: "meal-service",
    name: "Meal Service",
    description: "Operational meal plans & dining entitlements by service date",
    group: "Operations & Entitlements",
    icon: Utensils,
    badge: "Dining",
  },
  {
    id: "service-fulfillment",
    name: "Service Fulfillment",
    description: "Reserved guest amenities, transfers, and service delivery roster",
    group: "Operations & Entitlements",
    icon: PackageCheck,
    badge: "Services",
  },
];

const REPORT_GROUPS_STRUCTURE = [
  "Guest & Stay Registers",
  "Financial Registers",
  "Operations & Entitlements",
] as const;

export function ReportsChrome({
  membership,
  view,
  currentReportId,
  onSelectReport,
  hasPrevious,
  returnLabel,
  onReturn,
  onSearch,
  children,
}: {
  membership: RestaurantMembership;
  view: ReportsView;
  currentReportId?: ReportId | null;
  onSelectReport?: (id: ReportId) => void;
  hasPrevious?: boolean;
  returnLabel?: string;
  onReturn?: () => void;
  onOpenCenter?: () => void;
  onOpenCategory?: (group: ReportGroupId) => void;
  onSearch?: (value: string) => void;
  children: ReactNode;
}) {
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [datesSlot, setDatesSlot] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const [exportSlot, setExportSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo<ReportsShellSlots>(
    () => ({ dates: datesSlot, search: searchSlot, filter: filterSlot, export: exportSlot }),
    [datesSlot, exportSlot, filterSlot, searchSlot],
  );
  const activeCode: ReportId =
    currentReportId ??
    (view.kind === "analytics" || view.kind === "row" ? view.report : "police");

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Reports"
      searchPlaceholder="Search reports…"
      searchTestId="reports-module-search"
      helpLabel="Reports operational workspace"
      shellTestId="reports-command-shell"
      onRoomSearch={onSearch ?? (() => {})}
    >
      <ReportsShellProvider value={slots}>
        <div
          className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4"
          data-testid="reports-desk"
        >
          <section
            ref={setToolbarSlot}
            className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm"
            data-testid="reports-toolbar"
          >
            <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
            <div className="relative size-8 shrink-0" />
            <ReportsBurger
              active={activeCode}
              toolbarSlot={toolbarSlot}
              onSelect={(id) => onSelectReport?.(id)}
            />
            <div ref={setDatesSlot} className="shrink-0 empty:hidden" />
            <div ref={setSearchSlot} className="min-w-0 flex-1 overflow-hidden" />
            <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5">
              <div ref={setFilterSlot} className="shrink-0 empty:hidden" />
              {hasPrevious && onReturn ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReturn}
                  data-testid="reports-return-to-previous"
                  className="h-9 shrink-0 gap-1.5 border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#5C5346] hover:bg-[#F7F4EE] hover:text-[#251605]"
                >
                  <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                  {returnLabel || "Return"}
                </Button>
              ) : null}
              <div ref={setExportSlot} className="shrink-0 empty:hidden" />
            </div>
            </div>
          </section>
          <main className="min-w-0">{children}</main>
        </div>
      </ReportsShellProvider>
    </RoomInventoryChrome>
  );
}

function ReportsBurger({
  active,
  toolbarSlot,
  onSelect,
}: {
  active: ReportId;
  toolbarSlot: HTMLElement | null;
  onSelect: (id: ReportId) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <div
      className={cn(
        "pointer-events-none z-30",
        toolbarSlot ? "absolute left-1 top-1/2 -translate-y-1/2" : "absolute top-3 left-3",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Report type"
            title="Report type"
            data-testid="reports-nav-trigger"
            className={cn(
              "pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
              "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
              "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
            )}
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="pointer-events-auto w-72 p-1.5"
          data-testid="reports-type-menu"
          aria-label="Report type"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reports
          </p>
          <div className="flex flex-col gap-0.5">
            {REPORT_GROUPS_STRUCTURE.map((groupName) => {
              const items = REPORT_OPTIONS_CATALOGUE.filter((row) => row.group === groupName);
              if (items.length === 0) return null;
              return (
                <div key={groupName} className="flex flex-col gap-0.5">
                  <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {groupName}
                  </p>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === active;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`reports-nav-${item.id}`}
                        onClick={() => {
                          setOpen(false);
                          onSelect(item.id);
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-[#F4E9D0] font-medium text-[#251605]"
                            : "text-foreground hover:bg-[#F7F4EE]",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                        <span className="flex-1">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  return toolbarSlot ? createPortal(trigger, toolbarSlot) : trigger;
}
