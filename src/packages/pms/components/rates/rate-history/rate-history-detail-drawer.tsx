import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RateChangeHistoryRow, RateChangeOperationDetail } from "@/packages/pms/lib/revenue/rate-change";
import {
  copySourceDateFromMetadata,
  formatHistoryMoney,
  rateHistoryActionLabel,
  rateHistoryActorLabel,
  rateHistoryReasonLabel,
  rateHistorySourceLabel,
} from "@/packages/pms/lib/revenue/rate-history";

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-[#251605]">{value}</span>
    </div>
  );
}

function AffectedTable({ events }: { events: RateChangeHistoryRow[] }) {
  return (
    <div className="overflow-auto rounded-md border border-[#E8E1D7] bg-white">
      <table className="min-w-max w-full border-collapse">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {["Date", "Room Type", "Rate Plan", "Before", "After", "Delta"].map((label) => (
              <th
                key={label}
                className="px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-[#E8E1D7]">
              <td className="px-2 py-1 text-[10px] text-[#251605]">{formatStayDate(event.stayDate)}</td>
              <td className="px-2 py-1 text-[10px] text-[#251605]">{event.roomTypeName ?? "Room type"}</td>
              <td className="px-2 py-1 text-[10px] text-[#251605]">{event.ratePlanCode ?? event.ratePlanName ?? "Plan"}</td>
              <td className="px-2 py-1 text-[10px] text-[#251605]">
                {formatHistoryMoney(event.previousEffectiveRate, event.currency)}
              </td>
              <td className="px-2 py-1 text-[10px] text-[#251605]">
                {formatHistoryMoney(event.newEffectiveRate, event.currency)}
              </td>
              <td className="px-2 py-1 text-[10px] text-[#251605]">
                {formatHistoryMoney(event.absoluteDelta, event.currency)}
                {event.percentageDelta == null ? "" : ` · ${event.percentageDelta}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrawerBody({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: RateChangeOperationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const first = detail?.events[0];
  const copyDate = first ? copySourceDateFromMetadata(first.metadata) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Rate Change Details
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            {detail ? rateHistoryActionLabel(detail.actionType) : "Rate change"}
          </h3>
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? <p className="text-[11px] text-muted-foreground">Loading operation…</p> : null}
        {error ? <p className="text-[11px] text-[#6B4A0A]">{error}</p> : null}
        {!loading && !detail && !error ? (
          <p className="text-[11px] text-muted-foreground">This operation was not found for this property.</p>
        ) : null}
        {detail ? (
          <>
            {detail.actionType === "bulk_rate_change" ? (
              <p className="text-[11px] text-[#251605]">
                {detail.events.length} affected rate/date cells · {detail.affectedRatePlanIds.length} plans ·{" "}
                {detail.affectedDates.length} dates
              </p>
            ) : null}
            <div className="space-y-1.5 rounded-md border border-[#E8E1D7] bg-white p-3">
              <Row label="Action Type" value={rateHistoryActionLabel(detail.actionType)} />
              <Row label="Changed At" value={formatChangedAt(detail.createdAt)} />
              <Row label="Changed By" value={rateHistoryActorLabel(detail)} />
              <Row label="Source" value={rateHistorySourceLabel(detail.source)} />
              <Row label="Reason" value={rateHistoryReasonLabel(detail.reason)} />
              {first ? (
                <>
                  <Row label="Rate Plan" value={first.ratePlanCode ?? first.ratePlanName ?? "Plan"} />
                  <Row label="Room Type" value={first.roomTypeName ?? "Room type"} />
                  <Row label="Currency" value={first.currency || "—"} />
                </>
              ) : null}
              <Row label="Affected Date(s)" value={detail.affectedDates.map(formatStayDate).join(", ")} />
              {detail.actionType === "reset_override" && first ? (
                <>
                  <Row
                    label="Previous Effective Rate"
                    value={formatHistoryMoney(first.previousEffectiveRate, first.currency)}
                  />
                  <Row
                    label="New Effective Rate / Base Rate"
                    value={formatHistoryMoney(first.newEffectiveRate, first.currency)}
                  />
                </>
              ) : first ? (
                <>
                  <Row label="Before" value={formatHistoryMoney(first.previousEffectiveRate, first.currency)} />
                  <Row label="After" value={formatHistoryMoney(first.newEffectiveRate, first.currency)} />
                  <Row
                    label="Delta"
                    value={`${formatHistoryMoney(first.absoluteDelta, first.currency)}${first.percentageDelta == null ? "" : ` · ${first.percentageDelta}%`}`}
                  />
                </>
              ) : null}
              {detail.actionType === "copy_rate" && copyDate ? (
                <Row label="Copy" value={`Copied effective rate from ${copyDate}`} />
              ) : null}
              <Row label="Operation" value={detail.operationId} />
            </div>
            <AffectedTable events={detail.events} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function RateHistoryDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  detail: RateChangeOperationDetail | null;
  loading: boolean;
  error: string | null;
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

  const body = <DrawerBody detail={detail} loading={loading} error={error} onClose={onClose} />;

  return (
    <>
      <aside className="hidden h-full min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {open ? (
          body
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            Select a history row to review the operation.
          </div>
        )}
      </aside>
      <Sheet open={!desktop && open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
