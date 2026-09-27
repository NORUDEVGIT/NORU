import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import type { DemandCalendarCell } from "@/packages/pms/lib/revenue/demand-calendar";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { DemandDetailOverview } from "./demand-detail-overview";
import { DemandDetailPickup } from "./demand-detail-pickup";
import { DemandDetailRates } from "./demand-detail-rates";
import { DemandDetailRelated } from "./demand-detail-related";

export type DemandDrawerTab = "overview" | "pickup" | "rates" | "related";

function DrawerBody({
  restaurantId,
  cell,
  asOfBusinessDate,
  tab,
  setTab,
  onClose,
}: {
  restaurantId: string;
  cell: DemandCalendarCell;
  asOfBusinessDate: string;
  tab: DemandDrawerTab;
  setTab: (tab: DemandDrawerTab) => void;
  onClose: () => void;
}) {
  const money = useMoney();
  const tabs: Array<{ id: DemandDrawerTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "pickup", label: "Pickup" },
    { id: "rates", label: "Rates & Restrictions" },
    { id: "related", label: "Related" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Demand Detail
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">{cell.roomTypeName}</h3>
          <p className="text-xs text-muted-foreground">{formatStayDate(cell.date)}</p>
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
          <DemandDetailOverview cell={cell} asOfBusinessDate={asOfBusinessDate} money={money} />
        ) : null}
        {tab === "pickup" ? (
          <DemandDetailPickup
            restaurantId={restaurantId}
            stayDate={cell.date}
            roomTypeId={cell.roomTypeId}
            money={money}
          />
        ) : null}
        {tab === "rates" ? <DemandDetailRates cell={cell} money={money} /> : null}
        {tab === "related" ? (
          <DemandDetailRelated stayDate={cell.date} roomTypeId={cell.roomTypeId} />
        ) : null}
      </div>
    </div>
  );
}

export function DemandDetailDrawer({
  restaurantId,
  cell,
  asOfBusinessDate,
  tab,
  setTab,
  onClose,
}: {
  restaurantId: string;
  cell: DemandCalendarCell | null;
  asOfBusinessDate: string;
  tab: DemandDrawerTab;
  setTab: (tab: DemandDrawerTab) => void;
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

  const body = cell ? (
    <DrawerBody
      restaurantId={restaurantId}
      cell={cell}
      asOfBusinessDate={asOfBusinessDate}
      tab={tab}
      setTab={setTab}
      onClose={onClose}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Select a stay date and room type to review live demand.
    </div>
  );

  return (
    <>
      <aside className="hidden h-full min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {body}
      </aside>
      <Sheet
        open={!desktop && Boolean(cell)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
