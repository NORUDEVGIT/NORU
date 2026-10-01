import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { listRestrictionChangeHistory } from "@/packages/pms/lib/revenue/restriction-change.functions";
import type { RateCalendarPlan, RateCalendarRoomType } from "@/packages/pms/lib/revenue/rate-calendar";
import type { RestrictionCalendarCell } from "@/packages/pms/lib/revenue/restriction-calendar";
import { RESTRICTION_CALENDAR_HISTORY_EMPTY } from "@/packages/pms/lib/revenue/restriction-calendar";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { RestrictionDetailHistory } from "./restriction-detail-history";
import { RestrictionDetailOverview } from "./restriction-detail-overview";
import { RestrictionEditForm, type RestrictionEditScope } from "./restriction-edit-form";

export type RestrictionDrawerTab = "overview" | "edit" | "history";

function DrawerBody({
  restaurantId,
  cell,
  plan,
  roomType,
  rowCells,
  editScope,
  context,
  access,
  tab,
  setTab,
  onClose,
}: {
  restaurantId: string;
  cell: RestrictionCalendarCell;
  plan: RateCalendarPlan;
  roomType: RateCalendarRoomType;
  rowCells: RestrictionCalendarCell[];
  editScope: RestrictionEditScope;
  context: RevenueContext;
  access: RevenueAccess;
  tab: RestrictionDrawerTab;
  setTab: (tab: RestrictionDrawerTab) => void;
  onClose: () => void;
}) {
  const fetchHistory = useServerFn(listRestrictionChangeHistory);
  const historyQuery = useQuery({
    queryKey: ["restriction-change-history", restaurantId, cell.ratePlanId, cell.date],
    queryFn: () =>
      fetchHistory({
        data: { restaurantId, ratePlanId: cell.ratePlanId, stayDate: cell.date, page: 1, pageSize: 8 },
      }),
    retry: false,
  });

  const tabs: Array<{ id: RestrictionDrawerTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "edit", label: "Edit Restriction" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Restriction Details
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{plan.code}</h3>
          <p className="mt-0.5 text-xs font-medium text-[#5A4833]">
            {roomType.name} ·{" "}
            {editScope === "row"
              ? `Whole Row (${context.fromDate} – ${context.toDate})`
              : formatStayDate(cell.date)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#E8E1D7] bg-white px-4">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "h-10 px-3 text-xs font-semibold transition-colors",
              tab === item.id
                ? "border-b-2 border-[#C89933] text-[#251605]"
                : "text-[#756A5B] hover:text-[#251605]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "overview" ? (
          <RestrictionDetailOverview
            cell={cell}
            plan={plan}
            roomType={roomType}
            lastChange={historyQuery.data?.rows[0] ?? null}
          />
        ) : null}
        {tab === "edit" ? (
          <RestrictionEditForm
            restaurantId={restaurantId}
            cell={cell}
            plan={plan}
            rowCells={rowCells}
            initialScope={editScope}
            defaultFromDate={context.fromDate}
            defaultToDate={context.toDate}
            canEdit={access.canApplyRestrictions}
          />
        ) : null}
        {tab === "history" ? (
          historyQuery.isLoading ? (
            <p className="text-sm text-[#756A5B]">Loading history…</p>
          ) : (
            <RestrictionDetailHistory
              rows={historyQuery.data?.rows ?? []}
              error={
                historyQuery.isError
                  ? revenueUiError(historyQuery.error, RESTRICTION_CALENDAR_HISTORY_EMPTY)
                  : null
              }
              context={context}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

export function RestrictionDetailDrawer({
  restaurantId,
  cell,
  plan,
  roomType,
  rowCells = [],
  editScope = "single",
  context,
  access,
  tab,
  setTab,
  onClose,
}: {
  restaurantId: string;
  cell: RestrictionCalendarCell | null;
  plan: RateCalendarPlan | null;
  roomType: RateCalendarRoomType | null;
  rowCells?: RestrictionCalendarCell[];
  editScope?: RestrictionEditScope;
  context: RevenueContext;
  access: RevenueAccess;
  tab: RestrictionDrawerTab;
  setTab: (tab: RestrictionDrawerTab) => void;
  onClose: () => void;
}) {
  const ready = Boolean(cell && plan && roomType);

  return (
    <Sheet
      open={ready}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-[92vw] sm:max-w-[480px] p-0 [&>button]:hidden">
        {cell && plan && roomType ? (
          <DrawerBody
            restaurantId={restaurantId}
            cell={cell}
            plan={plan}
            roomType={roomType}
            rowCells={rowCells}
            editScope={editScope}
            context={context}
            access={access}
            tab={tab}
            setTab={setTab}
            onClose={onClose}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            Select a restriction cell to review or edit.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
