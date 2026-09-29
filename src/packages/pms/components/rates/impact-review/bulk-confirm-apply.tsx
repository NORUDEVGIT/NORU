import { Link } from "@tanstack/react-router";

import {
  BULK_RATE_CHANGE_SUCCESS_COPY,
  type BulkPreviewSummary,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import {
  BULK_RATE_SUBMITTED_TOAST,
  SUBMIT_FOR_APPROVAL_LABEL,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueSearchParams } from "@/packages/pms/lib/revenue/revenue-context";

export function BulkConfirmApply({
  summary,
  reason,
  canEdit,
  applying,
  error,
  success,
  appliedCount,
  calendarSearch,
  historySearch,
  requestSearch,
  submitted,
  submitForApproval,
  onApply,
}: {
  summary: BulkPreviewSummary | null;
  reason: string | null;
  canEdit: boolean;
  applying: boolean;
  error: string | null;
  success: boolean;
  appliedCount: number | null;
  calendarSearch: RevenueSearchParams;
  historySearch: RevenueSearchParams;
  requestSearch?: RevenueSearchParams;
  submitted?: boolean;
  submitForApproval?: boolean;
  onApply: () => void;
}) {
  if (submitted) {
    return (
      <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4">
        <p className="text-sm font-semibold text-[#251605]">{BULK_RATE_SUBMITTED_TOAST}</p>
        {requestSearch ? (
          <Link
            to="/restaurant/pms/rates-revenue"
            search={requestSearch}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605]"
          >
            View Request
          </Link>
        ) : null}
      </div>
    );
  }
  if (success) {
    return (
      <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4">
        <p className="text-sm font-semibold text-[#251605]">{BULK_RATE_CHANGE_SUCCESS_COPY}</p>
        <p className="text-xs text-[#5A4833]">
          {appliedCount ?? summary?.targetCount ?? 0} rate change
          {(appliedCount ?? summary?.targetCount ?? 0) === 1 ? "" : "s"} applied
          {summary
            ? ` across ${summary.affectedDates} dates and ${summary.affectedRatePlans} rate plans.`
            : "."}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/restaurant/pms/rates-revenue"
            search={calendarSearch}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
          >
            Return to Rate Calendar
          </Link>
          <Link
            to="/restaurant/pms/rates-revenue"
            search={historySearch}
            className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF6F0]"
          >
            View Rate History
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4">
      <p className="text-sm font-semibold text-[#251605]">
        {summary?.affectedDates ?? 0} dates · {summary?.affectedRatePlans ?? 0} rate plans ·{" "}
        {summary?.targetCount ?? 0} rate changes
      </p>
      {reason ? <p className="text-xs text-[#5A4833]">Reason: {reason}</p> : null}
      <p className="text-xs font-medium text-[#251605]">
        {summary && summary.invalidTargets === 0
          ? "All targets are valid."
          : `${summary?.invalidTargets ?? 0} target(s) are invalid. Nothing will be applied until every target is valid.`}
      </p>
      {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}
      {!canEdit ? (
        <p className="text-xs text-[#6B4A0A]">
          You can review this change, but applying daily rates is disabled.
        </p>
      ) : null}
      <button
        type="button"
        disabled={
          !canEdit ||
          applying ||
          !summary ||
          summary.invalidTargets > 0 ||
          summary.validTargets === 0
        }
        onClick={onApply}
        className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-4 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
      >
        {applying ? "Applying…" : submitForApproval ? SUBMIT_FOR_APPROVAL_LABEL : "Confirm & Apply"}
      </button>
    </div>
  );
}
