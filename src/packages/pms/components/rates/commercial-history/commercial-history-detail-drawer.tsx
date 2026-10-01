import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import {
  CARD3_PACKAGES_HREF,
  CARD3_PROMOTIONS_HREF,
} from "@/packages/pms/lib/pms-property-setup-card3";
import type { RevenueWorkspaceView } from "@/packages/pms/lib/rate-revenue-workspace";
import {
  COMMERCIAL_HISTORY_IMMUTABLE_COPY,
  commercialHistoryActorLabel,
  commercialHistoryReasonLabel,
} from "@/packages/pms/lib/revenue/commercial-history";
import type { CommercialHistoryOperationDetailView } from "@/packages/pms/lib/revenue/commercial-history-ui";
import { commercialOutlineButton } from "../commercial/commercial-ui";

function formatChangedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function DrawerBody({
  detail,
  loading,
  error,
  onClose,
  onRetry,
  onNavigateView,
}: {
  detail: CommercialHistoryOperationDetailView | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onNavigateView: (view: RevenueWorkspaceView) => void;
}) {
  const masterHref =
    detail?.masterId && detail.entityType === "package_activation"
      ? CARD3_PACKAGES_HREF
      : detail?.masterId
        ? CARD3_PROMOTIONS_HREF
        : null;

  function navigateToEntity(target: CommercialHistoryOperationDetailView) {
    const detail = target;
    onNavigateView(detail.entityType === "package_activation" ? "packages" : "promotions");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Commercial Change Detail
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            {detail?.actionLabel ?? "Commercial change"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[#E8E1D7]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading operation…</p> : null}
        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-[#6B4A0A]">{error}</p>
            <button type="button" className={commercialOutlineButton()} onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !detail && !error ? (
          <p className="text-sm text-muted-foreground">
            This operation was not found for this property.
          </p>
        ) : null}
        {detail ? (
          <>
            <section className="space-y-2 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Operation
              </p>
              <Row label="Action" value={detail.actionLabel} />
              <Row label="Changed At" value={formatChangedAt(detail.createdAt)} />
              <Row label="Changed By" value={commercialHistoryActorLabel(detail)} />
              <Row label="Reason" value={commercialHistoryReasonLabel(detail.reason)} />
              <Row label="Entity" value={detail.entityName} />
              <Row label="Entity Type" value={detail.entityTypeLabel} />
              <p className="pt-1 text-xs text-muted-foreground">
                Operation ID {detail.operationId}
              </p>
            </section>
            <section className="space-y-2 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Changes
              </p>
              {detail.changes.map((change) => (
                <div key={change.key} className="rounded-md border border-[#EAE4DB] px-3 py-2">
                  <p className="text-xs font-semibold text-[#251605]">{change.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Before: {change.before}</p>
                  <p className="text-xs font-medium text-[#251605]">After: {change.after}</p>
                </div>
              ))}
            </section>
            <section className="space-y-2 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entity Snapshot
              </p>
              {detail.snapshot.map((field) => (
                <Row key={field.label} label={field.label} value={field.value} />
              ))}
            </section>
            <section className="space-y-2.5 rounded-lg border border-[#E8E1D7] bg-white p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context
              </p>
              <Row label="Source" value={detail.sourceLabel} />
              <p className="text-xs text-muted-foreground">{COMMERCIAL_HISTORY_IMMUTABLE_COPY}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className={commercialOutlineButton()}
                  onClick={() => navigateToEntity(detail)}
                >
                  {detail.entityType === "package_activation" ? "View Package" : "View Promotion"}
                </button>
                {masterHref ? (
                  <a href={masterHref} className={commercialOutlineButton()}>
                    Configure in Property Setup
                  </a>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function CommercialHistoryDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
  onRetry,
  onNavigateView,
}: {
  open: boolean;
  detail: CommercialHistoryOperationDetailView | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onNavigateView: (view: RevenueWorkspaceView) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-[92vw] sm:max-w-[520px] p-0">
        <DrawerBody
          detail={detail}
          loading={loading}
          error={error}
          onClose={onClose}
          onRetry={onRetry}
          onNavigateView={onNavigateView}
        />
      </SheetContent>
    </Sheet>
  );
}
