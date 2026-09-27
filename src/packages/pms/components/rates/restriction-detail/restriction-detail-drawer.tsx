import { useEffect, useState } from "react";
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
import { RestrictionEditForm } from "./restriction-edit-form";

export type RestrictionDrawerTab = "overview" | "edit" | "history";

function DrawerBody({
  restaurantId,
  cell,
  plan,
  roomType,
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
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Restriction Detail & Edit
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{plan.code}</h3>
          <p className="text-xs text-muted-foreground">
            {roomType.name} · {formatStayDate(cell.date)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-[#E8E1D7]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#E8E1D7] px-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "h-9 px-2 text-[11px] font-medium",
              tab === item.id
                ? "border-b-2 border-[#C89933] text-[#6B4A0A]"
                : "text-muted-foreground hover:text-[#251605]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
            canEdit={access.canApplyRestrictions}
          />
        ) : null}
        {tab === "history" ? (
          historyQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading history…</p>
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
  context: RevenueContext;
  access: RevenueAccess;
  tab: RestrictionDrawerTab;
  setTab: (tab: RestrictionDrawerTab) => void;
  onClose: () => void;
}) {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const ready = cell && plan && roomType;
  const body = ready ? (
    <DrawerBody
      restaurantId={restaurantId}
      cell={cell}
      plan={plan}
      roomType={roomType}
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
  );

  return (
    <>
      <aside className="hidden h-full min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {body}
      </aside>
      <Sheet open={!desktop && Boolean(ready)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
