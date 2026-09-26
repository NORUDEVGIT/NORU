import { Link } from "@tanstack/react-router";

import {
  BULK_RESTRICTION_SUCCESS_COPY,
  type RestrictionPreviewSummary,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import {
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
}) {
  if (submitted) {
    return (
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-[#251605]">{RESTRICTION_SUBMITTED_TOAST}</p>
        {requestSearch ? (
          <Link
            to="/restaurant/pms/rates-revenue"
            search={requestSearch}
            className="inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605]"
          >
            View Request
          </Link>
        ) : null}
      </div>
    );
  }
  if (success) {
    return (
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-[#251605]">{BULK_RESTRICTION_SUCCESS_COPY}</p>
        <p className="text-[11px] text-muted-foreground">
          {appliedCount ?? summary?.targetCount ?? 0} restriction change
          {(appliedCount ?? summary?.targetCount ?? 0) === 1 ? "" : "s"} applied
          {summary ? ` across ${summary.affectedDates} dates and ${summary.affectedRatePlans} rate plans.` : "."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/restaurant/pms/rates-revenue"
            search={restrictionsSearch}
            className="inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D]"
          >
            Return to Restrictions
          </Link>
          <Link
            to="/restaurant/pms/rates-revenue"
            search={historySearch}
            className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5]"
          >
            View Restriction History
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#251605]">
        {summary?.affectedDates ?? 0} dates · {summary?.affectedRatePlans ?? 0} rate plans ·{" "}
        {summary?.targetCount ?? 0} restriction changes
      </p>
      {reason ? <p className="text-[11px] text-muted-foreground">Reason: {reason}</p> : null}
      <p className="text-[11px] text-[#251605]">
        {summary && summary.invalidTargets === 0
          ? "All targets are valid."
          : `${summary?.invalidTargets ?? 0} target(s) are invalid. Nothing will be applied until every target is valid.`}
      </p>
      {error ? <p className="text-[11px] text-[#6B4A0A]">{error}</p> : null}
      {!canApply ? (
        <p className="text-[11px] text-[#6B4A0A]">
          You can review this change, but applying restrictions is disabled.
        </p>
      ) : null}
      <button
        type="button"
        disabled={!canApply || applying || !summary || summary.invalidTargets > 0 || summary.validTargets === 0}
        onClick={onApply}
        className="inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
      >
        {applying ? "Applying…" : submitForApproval ? SUBMIT_FOR_APPROVAL_LABEL : "Confirm & Apply"}
      </button>
    </div>
  );
}
