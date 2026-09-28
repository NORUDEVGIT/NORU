import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  REPORTS_DESK_EYEBROW,
  REPORTS_DESK_TITLE,
  REPORT_CATEGORIES,
  reportByCode,
  type ReportCategory,
  type ReportsView,
} from "@/packages/pms/lib/reports-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

export function ReportsChrome({
  membership,
  view,
  onOpenCenter,
  onOpenCategory,
  onSearch,
  children,
}: {
  membership: RestaurantMembership;
  view: ReportsView;
  onOpenCenter: () => void;
  onOpenCategory: (category: ReportCategory) => void;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const openReport = view.tab === "report" ? reportByCode(view.report) : null;

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Reports"
      searchPlaceholder="Search reports…"
      searchTestId="reports-module-search"
      helpLabel="Reports operational workspace"
      shellTestId="reports-command-shell"
      onRoomSearch={onSearch}
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="reports-desk">
        <header className="border-b border-border bg-background" data-testid="reports-desk-header">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {REPORTS_DESK_EYEBROW}
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
                {REPORTS_DESK_TITLE}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Hotel reads for {membership.restaurant.name}. Counts appear only when a reader returns them.
              </p>
            </div>
            <CategoryMenu
              testId="reports-category-menu"
              itemPrefix="reports-category"
              label="Categories"
              onOpenCategory={onOpenCategory}
            />
          </div>
          <nav
            data-testid="reports-workspace-nav"
            className="mt-3 flex items-end gap-1 overflow-x-auto px-5 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Reports"
          >
            <TabButton
              testId="reports-nav-center"
              active={view.tab === "center"}
              onClick={onOpenCenter}
            >
              Report Center
            </TabButton>
            {openReport ? (
              <TabButton testId={`reports-nav-${openReport.code}`} active>
                {openReport.name}
              </TabButton>
            ) : null}
            <CategoryMenu
              testId="reports-open-catalogue"
              itemPrefix="reports-catalogue"
              label="+"
              onOpenCategory={onOpenCategory}
            />
          </nav>
        </header>
        <div className="space-y-4 p-4 sm:p-5 lg:p-6">{children}</div>
      </div>
    </RoomInventoryChrome>
  );
}

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 min-h-11 shrink-0 items-center px-3 text-xs font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{children}</span>
      {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" /> : null}
    </button>
  );
}

function CategoryMenu({
  label,
  testId,
  itemPrefix,
  onOpenCategory,
}: {
  label: string;
  testId: string;
  itemPrefix: string;
  onOpenCategory: (category: ReportCategory) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid={testId}
        className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground"
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {REPORT_CATEGORIES.map((category) => (
          <DropdownMenuItem
            key={category.id}
            data-testid={`${itemPrefix}-${category.id}`}
            onSelect={() => onOpenCategory(category.id)}
          >
            {category.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
