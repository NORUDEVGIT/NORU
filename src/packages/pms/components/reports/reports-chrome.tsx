import type { ReactNode } from "react";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Utensils,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  REPORTS_DESK_EYEBROW,
  REPORTS_DESK_TITLE,
  reportByCode,
  type ReportGroupId,
  type ReportId,
  type ReportsView,
} from "@/packages/pms/lib/reports-shell";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/shared/components/ui/select";

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
  onOpenCenter,
  onOpenCategory,
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
  const activeCode: ReportId =
    currentReportId ??
    (view.kind === "analytics" || view.kind === "row" ? view.report : "police");
  const openReportMeta = REPORT_OPTIONS_CATALOGUE.find((r) => r.id === activeCode);
  const openReport = reportByCode(activeCode);
  const CurrentIcon = openReportMeta?.icon ?? FileSpreadsheet;

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
      <div className="min-w-0 bg-[#FAF8F4]" data-testid="reports-desk">
        <header
          className="border-b border-[#DDD4C5] bg-white shadow-2xs"
          data-testid="reports-desk-header"
        >
          <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A6A24]">
                  {openReportMeta?.group ?? REPORTS_DESK_EYEBROW}
                </span>
                {openReportMeta?.badge ? (
                  <span className="rounded-full border border-[#E5D7B7] bg-[#FAF3E3] px-2 py-0.5 text-[10px] font-semibold text-[#8A6A24]">
                    {openReportMeta.badge}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#251605]">
                {openReport?.name ?? openReportMeta?.name ?? REPORTS_DESK_TITLE}
              </h1>
              <p className="max-w-2xl text-xs text-[#7A7167]">
                {openReport?.description ?? openReportMeta?.description ?? `Operational registers, statutory compliance documents, and service delivery handoff for ${membership.restaurant.name}.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {hasPrevious && onReturn ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReturn}
                  data-testid="reports-return-to-previous"
                  className="h-10 gap-1.5 rounded-xl border-[#DDD4C5] bg-[#FAF8F4] px-3.5 text-xs font-semibold text-[#5C5346] shadow-xs hover:border-[#C89933] hover:bg-[#FAF3E3] transition-all"
                >
                  <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                  <span>{returnLabel || "Return"}</span>
                </Button>
              ) : null}

              {/* Single Window Report Type Switcher Dropdown */}
              <div className="flex items-center gap-2">
                <Select
                  value={activeCode}
                  onValueChange={(val) => onSelectReport?.(val as ReportId)}
                >
                  <SelectTrigger
                    className="h-10 min-w-[260px] sm:min-w-[320px] gap-2 rounded-xl border border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#251605] shadow-xs hover:border-[#C89933] transition-all focus:ring-1 focus:ring-[#8A6A24]"
                    data-testid="reports-type-select-trigger"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <CurrentIcon className="size-4 text-[#8A6A24] shrink-0" />
                      <span className="truncate text-foreground font-semibold">
                        {openReport?.name ?? openReportMeta?.name ?? "Select Report Type"}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent
                    className="z-50 max-h-[420px] w-[320px] sm:w-[400px] rounded-xl border border-[#DDD4C5] bg-white p-1.5 shadow-xl"
                    data-testid="reports-type-select-content"
                  >
                    {REPORT_GROUPS_STRUCTURE.map((groupName) => {
                      const itemsInGroup = REPORT_OPTIONS_CATALOGUE.filter((r) => r.group === groupName);
                      if (itemsInGroup.length === 0) return null;

                      return (
                        <SelectGroup key={groupName}>
                          <SelectLabel className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8A6A24]">
                            {groupName}
                          </SelectLabel>
                          {itemsInGroup.map((item) => {
                            const ItemIcon = item.icon;
                            return (
                              <SelectItem
                                key={item.id}
                                value={item.id}
                                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-[#FAF6F0] focus:bg-[#FAF6F0]"
                              >
                                <div className="flex items-start gap-2.5 w-full">
                                  <div className="mt-0.5 flex size-6 items-center justify-center rounded-md bg-[#FAF3E3] text-[#8A6A24] shrink-0">
                                    <ItemIcon className="size-3.5" />
                                  </div>
                                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="font-semibold text-[#251605] truncate">{item.name}</span>
                                      {item.badge ? (
                                        <span className="rounded-md border border-[#E5D7B7] bg-[#FAF3E3] px-1.5 py-0.2 text-[9px] font-semibold text-[#8A6A24] uppercase">
                                          {item.badge}
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="text-[11px] text-[#7A7167] line-clamp-1">{item.description}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </header>

        <main className="p-5 sm:p-6">{children}</main>
      </div>
    </RoomInventoryChrome>
  );
}
