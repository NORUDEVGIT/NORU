import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, FileSpreadsheet, Sparkles } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  REPORTS_DESK_EYEBROW,
  REPORTS_DESK_TITLE,
  reportByCode,
  type ReportGroupId,
  type ReportsView,
} from "@/packages/pms/lib/reports-shell";

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
  onOpenCategory: (group: ReportGroupId) => void;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const openReport =
    view.kind === "analytics" || view.kind === "row" ? reportByCode(view.report) : null;

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
      <div className="min-w-0 bg-[#FAF8F4]" data-testid="reports-desk">
        <header className="border-b border-[#DDD4C5] bg-white shadow-2xs" data-testid="reports-desk-header">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {openReport ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={onOpenCenter}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8A6A24] transition-colors hover:text-[#5F4512] hover:underline"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>All Reports</span>
                    <ChevronRight className="size-3 text-[#A89F91]" />
                    <span className="text-[#5F554B]">{openReport.name}</span>
                  </button>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
                    {openReport.name}
                  </h1>
                  <p className="max-w-2xl text-xs text-[#7A7167]">
                    {openReport.description}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A6A24]">
                    {REPORTS_DESK_EYEBROW}
                  </p>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
                    {REPORTS_DESK_TITLE}
                  </h1>
                  <p className="text-xs text-[#7A7167]">
                    Operational registers, statutory compliance documents, and service delivery handoff for {membership.restaurant.name}.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {openReport ? (
                <button
                  type="button"
                  onClick={onOpenCenter}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] px-3 py-1.5 text-xs font-semibold text-[#8A6A24] transition-colors hover:border-[#C89933] hover:bg-[#FAF3E3]"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Return to Report Center</span>
                </button>
              ) : (
                <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#E5D7B7] bg-[#FAF3E3] px-3 py-1.5 text-xs font-semibold text-[#8A6A24]">
                  <Sparkles className="size-3.5" />
                  <span>5 Active Registers Available</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-5 sm:p-6">{children}</main>
      </div>
    </RoomInventoryChrome>
  );
}
