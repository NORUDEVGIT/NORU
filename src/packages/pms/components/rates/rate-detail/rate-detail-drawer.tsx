import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { listRateChangeHistory } from "@/packages/pms/lib/revenue/rate-change.functions";
import { RATE_CALENDAR_HISTORY_EMPTY } from "@/packages/pms/lib/revenue/rate-calendar";
import type {
  RateCalendarCell,
  RateCalendarPlan,
  RateCalendarRoomType,
} from "@/packages/pms/lib/revenue/rate-calendar";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import type { RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import { revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { RateDetailHistory } from "./rate-detail-history";
import { RateDetailOverview } from "./rate-detail-overview";
import { RateDetailRestrictions } from "./rate-detail-restrictions";
import { RateEditForm, type RateEditScope } from "./rate-edit-form";

type DrawerTab = "overview" | "edit" | "restrictions" | "history";

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
  money,
}: {
  restaurantId: string;
  cell: RateCalendarCell;
  plan: RateCalendarPlan;
  roomType: RateCalendarRoomType;
  rowCells: RateCalendarCell[];
  editScope: RateEditScope;
  context: RevenueContext;
  access: RevenueAccess;
  tab: DrawerTab;
  setTab: (tab: DrawerTab) => void;
  onClose: () => void;
  money: (value: number) => string;
}) {
  const fetchHistory = useServerFn(listRateChangeHistory);
  const historyQuery = useQuery({
    queryKey: ["rate-change-history", restaurantId, cell.ratePlanId, cell.date],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          ratePlanId: cell.ratePlanId,
          stayDate: cell.date,
          page: 1,
          pageSize: 8,
        },
      }),
    retry: false,
  });

  const tabs: Array<{ id: DrawerTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "edit", label: "Edit Rate" },
    { id: "restrictions", label: "Restrictions" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Rate Detail & Edit
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            {plan.code} — {plan.name}
          </h3>
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
          <RateDetailOverview
            cell={cell}
            plan={plan}
            roomType={roomType}
            money={money}
            lastChange={historyQuery.data?.rows[0] ?? null}
            onSelectTab={setTab}
          />
        ) : null}
        {tab === "edit" ? (
          <RateEditForm
            restaurantId={restaurantId}
            cell={cell}
            plan={plan}
            rowCells={rowCells}
            initialScope={editScope}
            defaultFromDate={context.fromDate}
            defaultToDate={context.toDate}
            canEdit={access.canEditDailyRates}
            money={money}
          />
        ) : null}
        {tab === "restrictions" ? <RateDetailRestrictions cell={cell} context={context} /> : null}
        {tab === "history" ? (
          historyQuery.isLoading ? (
            <p className="text-sm text-[#756A5B]">Loading history…</p>
          ) : (
            <RateDetailHistory
              rows={historyQuery.data?.rows ?? []}
              error={
                historyQuery.isError
                  ? revenueUiError(historyQuery.error, RATE_CALENDAR_HISTORY_EMPTY)
                  : null
              }
              context={context}
              money={money}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

export function RateDetailDrawer({
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
  money,
}: {
  restaurantId: string;
  cell: RateCalendarCell | null;
  plan: RateCalendarPlan | null;
  roomType: RateCalendarRoomType | null;
  rowCells?: RateCalendarCell[];
  editScope?: RateEditScope;
  context: RevenueContext;
  access: RevenueAccess;
  tab: DrawerTab;
  setTab: (tab: DrawerTab) => void;
  onClose: () => void;
  money: (value: number) => string;
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
            money={money}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export type { DrawerTab };
