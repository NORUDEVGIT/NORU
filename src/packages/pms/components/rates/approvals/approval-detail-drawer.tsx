import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import type { RevenueApprovalDetail } from "@/packages/pms/lib/revenue/revenue-approval.server";
import type { RevenueAccessResolution } from "@/packages/pms/lib/revenue/revenue-access";
import {
  APPROVAL_CURRENT_STATE_CHANGED,
  APPROVAL_STALE_COPY,
  APPROVAL_STALE_HELP,
  APPROVE_APPLY_LABEL,
  SELF_APPROVAL_BLOCKED_COPY,
  historyViewForApprovalDomain,
  revenueApprovalDomainLabel,
  revenueApprovalReasonLabel,
  revenueApprovalRequesterLabel,
  revenueApprovalStatusLabel,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";
import { ApprovalStatusChip } from "./approval-status-chip";
import { PackageApprovalProposal } from "./approval-proposal-package";
import { PromotionApprovalProposal } from "./approval-proposal-promotion";
import { RateApprovalProposal } from "./approval-proposal-rate";
import { RestrictionApprovalProposal } from "./approval-proposal-restriction";

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function isReactivate(detail: RevenueApprovalDetail) {
  const active = detail.proposal["active"];
  const previous = detail.proposal["previouslyActive"] ?? detail.proposal["currentActive"];
  return detail.actionType === "EDIT" && active === true && previous === false;
}

function ProposalBody({ detail }: { detail: RevenueApprovalDetail }) {
  if (detail.domain === "rate") {
    return <RateApprovalProposal proposal={detail.proposal} snapshot={detail.displaySnapshot} />;
  }
  if (detail.domain === "restriction") {
    return (
      <RestrictionApprovalProposal proposal={detail.proposal} snapshot={detail.displaySnapshot} />
    );
  }
  if (detail.domain === "package_activation") {
    return (
      <PackageApprovalProposal
        proposal={detail.proposal}
        snapshot={detail.displaySnapshot}
        reactivate={isReactivate(detail)}
      />
    );
  }
  return (
    <PromotionApprovalProposal
      proposal={detail.proposal}
      snapshot={detail.displaySnapshot}
      reactivate={isReactivate(detail)}
    />
  );
}

function DrawerBody({
  detail,
  loading,
  error,
  applyError,
  staleCopy,
  access,
  busy,
  onClose,
  onRetry,
  onApprove,
  onReject,
  onCancel,
  onViewApplied,
}: {
  detail: RevenueApprovalDetail | null;
  loading: boolean;
  error: string | null;
  applyError: string | null;
  staleCopy: boolean;
  access: RevenueAccessResolution;
  busy?: boolean | undefined;
  onClose: () => void;
  onRetry: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onViewApplied: (view: "rate-history" | "restriction-history" | "commercial-history") => void;
}) {
  const pending = detail?.status === "pending";
  const canApprove = access.canApprove === true && detail?.canReview === true && pending;
  const ownRequest = Boolean(
    detail && access.membershipId && detail.requestedBy === access.membershipId,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Approval request
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-[#251605]">
            {detail?.summary ?? "Request"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#E8E1D7] hover:text-[#251605] transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {loading ? <p className="text-sm text-muted-foreground">Loading request…</p> : null}
        {error ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#6B4A0A]">{error}</p>
            <button type="button" className={commercialOutlineButton()} onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}
        {detail ? (
          <>
            <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                Request
              </p>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-muted-foreground">Status</span>
                <ApprovalStatusChip status={detail.status} />
              </div>
              <Row label="Domain" value={revenueApprovalDomainLabel(detail.domain)} />
              <Row label="Action" value={detail.actionType} />
              <Row label="Submitted" value={formatWhen(detail.requestedAt)} />
              <Row
                label="Requested By"
                value={revenueApprovalRequesterLabel(detail.requestedByLabel)}
              />
              <Row
                label="Request Reason"
                value={revenueApprovalReasonLabel(detail.requestReason)}
              />
              {detail.reviewedBy || detail.reviewedAt || detail.reviewReason ? (
                <>
                  <Row
                    label="Reviewed By"
                    value={revenueApprovalRequesterLabel(detail.reviewedByLabel)}
                  />
                  <Row label="Reviewed At" value={formatWhen(detail.reviewedAt)} />
                  <Row
                    label="Review Reason"
                    value={revenueApprovalReasonLabel(detail.reviewReason)}
                  />
                </>
              ) : null}
            </section>

            <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                Proposed Change
              </p>
              <ProposalBody detail={detail} />
            </section>

            <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                Current State / Warnings
              </p>
              {detail.currentStateHint?.changed ? (
                <p className="text-sm text-[#6B4A0A]">{APPROVAL_CURRENT_STATE_CHANGED}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No current-state warning.</p>
              )}
              {staleCopy || detail.status === "stale" ? (
                <>
                  <p className="text-sm font-medium text-[#6B4A0A]">{APPROVAL_STALE_COPY}</p>
                  <p className="text-sm text-muted-foreground">{APPROVAL_STALE_HELP}</p>
                </>
              ) : null}
            </section>

            <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                Events
              </p>
              <ul className="space-y-2">
                {detail.events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-[#EAE4DB] bg-[#FAF8F4]/80 p-3 space-y-1"
                  >
                    <p className="text-sm font-semibold text-[#251605]">
                      {revenueApprovalStatusLabel(event.eventType)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {revenueApprovalRequesterLabel(event.actorLabel)} ·{" "}
                      {formatWhen(event.createdAt)}
                    </p>
                    {event.reason ? (
                      <p className="text-sm text-[#251605]">
                        {revenueApprovalReasonLabel(event.reason)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            {applyError ? (
              <p className="text-sm font-medium text-destructive">{applyError}</p>
            ) : null}

            {pending ? (
              <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                  Actions
                </p>
                {detail.selfApprovalBlocked ? (
                  <p className="text-sm text-[#6B4A0A]">{SELF_APPROVAL_BLOCKED_COPY}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {canApprove ? (
                    <button
                      type="button"
                      className={commercialGoldButton(busy)}
                      disabled={busy}
                      onClick={onApprove}
                    >
                      {APPROVE_APPLY_LABEL}
                    </button>
                  ) : null}
                  {detail.canReview ? (
                    <button
                      type="button"
                      className={commercialOutlineButton()}
                      disabled={busy}
                      onClick={onReject}
                    >
                      Reject
                    </button>
                  ) : null}
                  {ownRequest ? (
                    <button
                      type="button"
                      className={commercialOutlineButton()}
                      disabled={busy}
                      onClick={onCancel}
                    >
                      Cancel Request
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-2xs">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
                  Actions
                </p>
                {detail.status === "approved" && detail.appliedOperationId ? (
                  <button
                    type="button"
                    className={commercialOutlineButton()}
                    onClick={() => onViewApplied(historyViewForApprovalDomain(detail.domain))}
                  >
                    View Applied Change
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">This request is closed.</p>
                )}
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ApprovalDetailDrawer({
  open,
  detail,
  loading,
  error,
  applyError,
  staleCopy,
  access,
  busy,
  onClose,
  onRetry,
  onApprove,
  onReject,
  onCancel,
  onViewApplied,
}: {
  open: boolean;
  detail: RevenueApprovalDetail | null;
  loading: boolean;
  error: string | null;
  applyError: string | null;
  staleCopy: boolean;
  access: RevenueAccessResolution;
  busy?: boolean | undefined;
  onClose: () => void;
  onRetry: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onViewApplied: (view: "rate-history" | "restriction-history" | "commercial-history") => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-[92vw] sm:max-w-[540px] p-0 [&>button]:hidden border-l border-[#E8E1D7] shadow-xl"
      >
        <DrawerBody
          detail={detail}
          loading={loading}
          error={error}
          applyError={applyError}
          staleCopy={staleCopy}
          access={access}
          busy={busy}
          onClose={onClose}
          onRetry={onRetry}
          onApprove={onApprove}
          onReject={onReject}
          onCancel={onCancel}
          onViewApplied={onViewApplied}
        />
      </SheetContent>
    </Sheet>
  );
}
