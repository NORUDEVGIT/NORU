import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  RestrictionHistoryRow,
  RestrictionOperationDetail,
} from "@/packages/pms/lib/revenue/restriction-change";
import {
  restrictionHistoryActionLabel,
  restrictionHistoryActorLabel,
  restrictionHistoryAfterLabel,
  restrictionHistoryBeforeAfter,
  restrictionHistoryBeforeLabel,
  restrictionHistoryChangedFields,
  restrictionHistoryFieldLabel,
  restrictionHistoryReasonLabel,
  restrictionHistorySourceLabel,
  summarizeRestrictionOperation,
} from "@/packages/pms/lib/revenue/restriction-history";

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#EFE9DF] py-2 text-xs last:border-b-0">
      <span className="font-medium text-[#756A5B]">{label}</span>
      <span className="text-right font-semibold text-[#251605]">{value}</span>
    </div>
  );
}

function AffectedTable({ events }: { events: RestrictionHistoryRow[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-[#DDD4C5] bg-white">
      <table className="min-w-max w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE]">
            {["Date", "Room Type", "Rate Plan", "Changed Fields", "Before", "After"].map(
              (label) => (
                <th
                  key={label}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#5A4833]"
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFE9DF]">
          {events.map((event) => (
            <tr key={event.id} className="border-t border-[#E8E1D7]">
              <td className="px-3 py-2 text-xs font-medium text-[#251605]">
                {formatStayDate(event.stayDate)}
              </td>
              <td className="px-3 py-2 text-xs text-[#251605]">
                {event.roomTypeName ?? "Room type"}
              </td>
              <td className="px-3 py-2 text-xs font-semibold text-[#251605]">
                {event.ratePlanCode ?? event.ratePlanName ?? "Plan"}
              </td>
              <td className="px-3 py-2 text-xs text-[#251605]">
                {restrictionHistoryChangedFields(event).map(restrictionHistoryFieldLabel).join(", ") ||
                  "—"}
              </td>
              <td className="px-3 py-2 text-xs text-[#5A4833]">
                {restrictionHistoryBeforeLabel(event)}
              </td>
              <td className="px-3 py-2 text-xs font-semibold text-[#251605]">
                {restrictionHistoryAfterLabel(event)}
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
  detail: RestrictionOperationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const first = detail?.events[0];
  const summary = detail ? summarizeRestrictionOperation(detail) : null;
  const changed = first ? restrictionHistoryChangedFields(first) : [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Restriction Change Details
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            {detail ? restrictionHistoryActionLabel(detail.actionType) : "Restriction change"}
          </h3>
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
        {loading ? (
          <div
            className="h-40 animate-pulse rounded-xl border border-[#DDD4C5] bg-white"
            aria-busy="true"
          />
        ) : null}
        {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}
        {!loading && !detail && !error ? (
          <p className="text-xs text-[#756A5B]">
            This operation was not found for this property.
          </p>
        ) : null}
        {detail ? (
          <>
            {detail.actionType === "bulk_restriction_change" && summary ? (
              <p className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 text-xs font-semibold text-[#251605]">
                Bulk Restriction Change · {summary.targetCount} affected targets ·{" "}
                {summary.ratePlanCount} rate plans · {summary.dateCount} dates
              </p>
            ) : null}
            <div className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-2">
              <Row label="Action Type" value={restrictionHistoryActionLabel(detail.actionType)} />
              <Row label="Changed At" value={formatChangedAt(detail.createdAt)} />
              <Row label="Changed By" value={restrictionHistoryActorLabel(detail)} />
              <Row label="Source" value={restrictionHistorySourceLabel(detail.source)} />
              <Row label="Reason" value={restrictionHistoryReasonLabel(detail.reason)} />
              {first ? (
                <>
                  <Row label="Room Type" value={first.roomTypeName ?? "Room type"} />
                  <Row label="Rate Plan" value={first.ratePlanCode ?? first.ratePlanName ?? "Plan"} />
                  <Row label="Stay Date" value={formatStayDate(first.stayDate)} />
                  <Row
                    label="Changed Fields"
                    value={changed.map(restrictionHistoryFieldLabel).join(", ") || "—"}
                  />
                  <Row label="Before" value={restrictionHistoryBeforeLabel(first)} />
                  <Row label="After" value={restrictionHistoryAfterLabel(first)} />
                  <Row label="Before → After" value={restrictionHistoryBeforeAfter(first)} />
                </>
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

export function RestrictionHistoryDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
}: {
  open: boolean;
  detail: RestrictionOperationDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-[95vw] sm:max-w-[520px] p-0 [&>button]:hidden">
        <DrawerBody detail={detail} loading={loading} error={error} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}
