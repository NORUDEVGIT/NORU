import { REPORT_SURFACE_COPY } from "@/packages/pms/lib/reports-shell";

export function ReportLoadingState() {
  return (
    <div
      className="rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
      data-testid="reports-state-loading"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-[#7A7167]">{REPORT_SURFACE_COPY.loading}</p>
    </div>
  );
}

export function ReportEmptyState() {
  return (
    <div
      className="rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
      data-testid="reports-state-empty"
      role="status"
    >
      <h2 className="text-sm font-semibold text-[#251605]">{REPORT_SURFACE_COPY.emptyTitle}</h2>
      <p className="mt-1 text-sm text-[#7A7167]">{REPORT_SURFACE_COPY.emptyBody}</p>
    </div>
  );
}

export function ReportErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      className="rounded-xl border border-[#E4C7C2] bg-white px-5 py-8 shadow-sm"
      data-testid="reports-state-error"
      role="alert"
    >
      <h2 className="text-sm font-semibold text-[#251605]">{REPORT_SURFACE_COPY.errorTitle}</h2>
      <p className="mt-1 text-sm text-[#7A7167]">{message ?? REPORT_SURFACE_COPY.errorBody}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid="reports-state-retry"
          className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-[#251605] hover:border-[#C89933]/60"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function ReportNoAccessState() {
  return (
    <div
      className="rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
      data-testid="reports-state-no-access"
      role="status"
    >
      <h2 className="text-sm font-semibold text-[#251605]">{REPORT_SURFACE_COPY.noAccessTitle}</h2>
    </div>
  );
}

export function ReportMissingState({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
      data-testid="reports-missing"
      role="status"
    >
      <h2 className="text-sm font-semibold text-[#251605]">{REPORT_SURFACE_COPY.missingTitle}</h2>
      <p className="mt-1 text-sm text-[#7A7167]">{REPORT_SURFACE_COPY.missingBody}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium text-[#251605] hover:border-[#C89933]/60"
      >
        Back to reports
      </button>
    </div>
  );
}
