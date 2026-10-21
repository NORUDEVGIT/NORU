import { AlertCircle, Inbox, RotateCcw, ShieldAlert } from "lucide-react";

import { REPORT_SURFACE_COPY } from "@/packages/pms/lib/reports-shell";

export function ReportLoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-[#DDD4C5] bg-white px-6 py-14 text-center shadow-2xs"
      data-testid="reports-state-loading"
      role="status"
      aria-live="polite"
    >
      <div className="grid size-10 place-items-center rounded-full bg-[#FAF3E3] text-[#8A6A24]">
        <div className="size-5 animate-spin rounded-full border-2 border-[#8A6A24] border-t-transparent" />
      </div>
      <p className="mt-3 font-display text-sm font-semibold text-[#251605]">
        {REPORT_SURFACE_COPY.loading}
      </p>
      <p className="mt-1 text-xs text-[#7A7167]">Querying active property transactions</p>
    </div>
  );
}

export function ReportEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DDD4C5] bg-white px-6 py-14 text-center shadow-2xs"
      data-testid="reports-state-empty"
      role="status"
    >
      <div className="grid size-12 place-items-center rounded-full bg-[#FAF8F4] text-[#8A6A24]">
        <Inbox className="size-6" />
      </div>
      <h2 className="mt-3 font-display text-base font-semibold text-[#251605]">
        {REPORT_SURFACE_COPY.emptyTitle}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[#7A7167]">{REPORT_SURFACE_COPY.emptyBody}</p>
    </div>
  );
}

export function ReportErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-white px-6 py-14 text-center shadow-2xs"
      data-testid="reports-state-error"
      role="alert"
    >
      <div className="grid size-12 place-items-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle className="size-6" />
      </div>
      <h2 className="mt-3 font-display text-base font-semibold text-[#251605]">
        {REPORT_SURFACE_COPY.errorTitle}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[#7A7167]">
        {message ?? REPORT_SURFACE_COPY.errorBody}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="reports-state-retry"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white px-3.5 text-xs font-semibold text-[#251605] shadow-2xs transition-colors hover:border-[#C89933] hover:bg-[#FAF8F4]"
        >
          <RotateCcw className="size-3" />
          <span>Retry</span>
        </button>
      ) : null}
    </div>
  );
}

export function ReportNoAccessState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-[#DDD4C5] bg-white px-6 py-14 text-center shadow-2xs"
      data-testid="reports-state-no-access"
      role="status"
    >
      <div className="grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700">
        <ShieldAlert className="size-6" />
      </div>
      <h2 className="mt-3 font-display text-base font-semibold text-[#251605]">
        {REPORT_SURFACE_COPY.noAccessTitle}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[#7A7167]">
        You don't have the required manager or accounting permission to view this report for this
        property.
      </p>
    </div>
  );
}

export function ReportMissingState({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-[#DDD4C5] bg-white px-6 py-14 text-center shadow-2xs"
      data-testid="reports-missing"
      role="status"
    >
      <div className="grid size-12 place-items-center rounded-full bg-[#FAF3E3] text-[#8A6A24]">
        <Inbox className="size-6" />
      </div>
      <h2 className="mt-3 font-display text-base font-semibold text-[#251605]">
        {REPORT_SURFACE_COPY.missingTitle}
      </h2>
      <p className="mt-1 max-w-md text-xs text-[#7A7167]">{REPORT_SURFACE_COPY.missingBody}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white px-3.5 text-xs font-semibold text-[#251605] shadow-2xs transition-colors hover:border-[#C89933] hover:bg-[#FAF8F4]"
      >
        <span>Back to reports</span>
      </button>
    </div>
  );
}
