import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RateChangeHistoryRow,
  RateChangeOperationDetail,
} from "@/packages/pms/lib/revenue/rate-change";
import {
  serializeRevenueSearch,
  type RevenueContext,
} from "@/packages/pms/lib/revenue/revenue-context";
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
    <div className="flex justify-between gap-3 border-b border-[#EFE9DF] py-2 text-xs last:border-b-0">
      <span className="font-medium text-[#756A5B]">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function AffectedTable({ events }: { events: RateChangeHistoryRow[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white">
      <table className="min-w-max w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {["Date", "Room Type", "Rate Plan", "Before", "After", "Delta"].map((label) => (
              <th
                key={label}
                className="px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {events.map((event) => (
            <tr key={event.id} className="border-t border-[#E8E1D7]">
              <td className="px-2.5 py-2 text-xs font-medium text-[#251605]">
                {formatStayDate(event.stayDate)}
              </td>
              <td className="px-2.5 py-2 text-xs text-[#251605]">
                {event.roomTypeName ?? "Room type"}
              </td>
              <td className="px-2.5 py-2 text-xs font-medium text-[#251605]">
                {event.ratePlanCode ?? event.ratePlanName ?? "Plan"}
              </td>
              <td className="px-2.5 py-2 text-xs tabular-nums text-[#5A4833]">
                {formatHistoryMoney(event.previousEffectiveRate, event.currency)}
              </td>
              <td className="px-2.5 py-2 text-xs font-semibold tabular-nums text-[#251605]">
                {formatHistoryMoney(event.newEffectiveRate, event.currency)}
              </td>
              <td className="px-2.5 py-2 text-xs font-medium tabular-nums text-[#251605]">
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
  context,
  onClose,
}: {
  detail: RateChangeOperationDetail | null;
  loading: boolean;
  error: string | null;
  context?: RevenueContext | undefined;
  onClose: () => void;
}) {
  const first = detail?.events[0];
  const copyDate = first ? copySourceDateFromMetadata(first.metadata) : null;
  const calendarSearch = context
    ? serializeRevenueSearch("rate-calendar", {
        ...context,
        fromDate: detail?.affectedDates[0] ?? context.fromDate,
        toDate: detail?.affectedDates[detail.affectedDates.length - 1] ?? context.toDate,
        roomTypeId: first?.roomTypeId ?? context.roomTypeId,
        ratePlanId: first?.ratePlanId ?? context.ratePlanId,
      })
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Rate Change Details
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            {detail ? rateHistoryActionLabel(detail.actionType) : "Rate change"}
          </h3>
          {detail ? (
            <p className="mt-0.5 text-xs font-medium text-[#5A4833]">
              {formatChangedAt(detail.createdAt)}
            </p>
          ) : null}
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {loading ? <p className="text-xs text-[#756A5B]">Loading operation…</p> : null}
        {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}
        {!loading && !detail && !error ? (
          <p className="text-xs text-[#756A5B]">This operation was not found for this property.</p>
        ) : null}
        {detail ? (
          <>
            {detail.actionType === "bulk_rate_change" ? (
              <p className="rounded-lg border border-[#DDD4C5] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#251605]">
                {detail.events.length} affected rate/date cells ·{" "}
                {detail.affectedRatePlanIds.length} plans · {detail.affectedDates.length} dates
              </p>
            ) : null}
            <div className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-2">
              <Row label="Action Type" value={rateHistoryActionLabel(detail.actionType)} />
              <Row label="Changed At" value={formatChangedAt(detail.createdAt)} />
              <Row label="Changed By" value={rateHistoryActorLabel(detail)} />
              <Row label="Source" value={rateHistorySourceLabel(detail.source)} />
              <Row label="Reason" value={rateHistoryReasonLabel(detail.reason)} />
              {first ? (
                <>
                  <Row
                    label="Rate Plan"
                    value={first.ratePlanCode ?? first.ratePlanName ?? "Plan"}
                  />
                  <Row label="Room Type" value={first.roomTypeName ?? "Room type"} />
                  <Row label="Currency" value={first.currency || "—"} />
                </>
              ) : null}
              <Row
                label="Affected Date(s)"
                value={detail.affectedDates.map(formatStayDate).join(", ")}
              />
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
                  <Row
                    label="Before"
                    value={formatHistoryMoney(first.previousEffectiveRate, first.currency)}
                  />
                  <Row
                    label="After"
                    value={formatHistoryMoney(first.newEffectiveRate, first.currency)}
                  />
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

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E1D7] bg-white px-5 py-3.5">
        {calendarSearch ? (
          <Link
            to="/restaurant/pms/rates-revenue"
            search={calendarSearch}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#B5882D]"
          >
            Open Related Rate Calendar
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function RateHistoryDetailDrawer({
  open,
  detail,
  loading,
  error,
  context,
  onClose,
}: {
  open: boolean;
  detail: RateChangeOperationDetail | null;
  loading: boolean;
  error: string | null;
  context?: RevenueContext | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-[92vw] sm:max-w-[480px] p-0 [&>button]:hidden">
        <DrawerBody
          detail={detail}
          loading={loading}
          error={error}
          context={context}
          onClose={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
