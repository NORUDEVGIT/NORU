import { Link } from "@tanstack/react-router";

import {
  BULK_RESTRICTION_SUCCESS_COPY,
  type RestrictionPreviewSummary,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import {
  APPROVE_APPLY_LABEL,
  RESTRICTION_SUBMITTED_TOAST,
  SUBMIT_FOR_APPROVAL_LABEL,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueSearchParams } from "@/packages/pms/lib/revenue/revenue-context";

export function RestrictionConfirmApply({
  summary,
  reason,
  canApply,
  applying,
  error,
  success,
  appliedCount,
  restrictionsSearch,
  historySearch,
  requestSearch,
  submitted,
  submitForApproval,
  onApply,
  onApproveImmediate,
}: {
  summary: RestrictionPreviewSummary | null;
  reason: string | null;
  canApply: boolean;
  applying: boolean;
  error: string | null;
  success: boolean;
  appliedCount: number | null;
  restrictionsSearch: RevenueSearchParams;
  historySearch: RevenueSearchParams;
  requestSearch?: RevenueSearchParams;
  submitted?: boolean;
  submitForApproval?: boolean;
  onApply: () => void;
  onApproveImmediate?: () => void;
}) {
  if (submitted) {
    return (
      <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4">
        <p className="text-sm font-semibold text-[#251605]">{RESTRICTION_SUBMITTED_TOAST}</p>
        {requestSearch ? (
          <Link
            to="/restaurant/pms/rates-revenue"
            search={requestSearch}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
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
        <p className="text-sm font-semibold text-[#251605]">{BULK_RESTRICTION_SUCCESS_COPY}</p>
        <p className="text-xs text-[#5A4833]">
          {appliedCount ?? summary?.targetCount ?? 0} restriction change
          {(appliedCount ?? summary?.targetCount ?? 0) === 1 ? "" : "s"} applied
          {summary
            ? ` across ${summary.affectedDates} dates and ${summary.affectedRatePlans} rate plans.`
            : "."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/restaurant/pms/rates-revenue"
            search={restrictionsSearch}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
          >
            Return to Restrictions
          </Link>
          <Link
            to="/restaurant/pms/rates-revenue"
            search={historySearch}
            className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF6F0]"
          >
            View Restriction History
          </Link>
        </div>
      </div>
    );
  }

  const disabled =
    !canApply || applying || !summary || summary.invalidTargets > 0 || summary.validTargets === 0;

  return (
    <div className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4">
      <p className="text-xs font-semibold text-[#251605]">
        {summary?.affectedDates ?? 0} dates · {summary?.affectedRatePlans ?? 0} rate plans ·{" "}
        {summary?.targetCount ?? 0} restriction changes
      </p>
      {reason ? <p className="text-xs text-[#5A4833]">Reason: {reason}</p> : null}
      <p className="text-xs text-[#251605]">
        {summary && summary.invalidTargets === 0
          ? "All targets are valid."
          : `${summary?.invalidTargets ?? 0} target(s) are invalid. Nothing will be applied until every target is valid.`}
      </p>
      {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}
      {!canApply ? (
        <p className="text-xs text-[#6B4A0A]">
          You can review this change, but applying restrictions is disabled.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {submitForApproval ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={onApply}
              className="inline-flex h-9 items-center rounded-lg border border-[#C89933] bg-[#FAF6F0] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#F1E6D2] disabled:opacity-50"
            >
              {applying ? "Submitting…" : SUBMIT_FOR_APPROVAL_LABEL}
            </button>
            {onApproveImmediate ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onApproveImmediate}
                className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
              >
                {applying ? "Applying…" : APPROVE_APPLY_LABEL}
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={onApproveImmediate ?? onApply}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
          >
            {applying ? "Applying…" : "Confirm & Apply"}
          </button>
        )}
      </div>
    </div>
  );
}
