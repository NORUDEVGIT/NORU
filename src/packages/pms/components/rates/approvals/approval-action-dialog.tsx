import { useEffect, useRef, useState } from "react";

import {
  APPROVE_CONFIRM_COPY,
  CANCEL_CONFIRM_COPY,
  CANCEL_CONFIRM_HELP,
  REJECT_CONFIRM_COPY,
  REJECT_REASON_REQUIRED,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

export type ApprovalDialogKind =
  | "approve"
  | "reject"
  | "cancel"
  | "policy-enable"
  | "policy-disable";

export function ApprovalActionDialog({
  open,
  kind,
  title,
  confirmCopy,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  kind: ApprovalDialogKind;
  title: string;
  confirmCopy: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setReasonError(null);
      return;
    }
    if (kind === "reject") {
      window.setTimeout(() => reasonRef.current?.focus(), 0);
    }
  }, [open, kind]);

  if (!open) return null;

  const needsReason = kind === "reject";
  const help = kind === "cancel" ? CANCEL_CONFIRM_HELP : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#251605]/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-action-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#E8E1D7] bg-[#F7F4EE] p-5 shadow-2xl">
        <h3
          id="approval-action-title"
          className="font-display text-lg font-semibold text-[#251605]"
        >
          {title}
        </h3>
        <p className="mt-2 text-sm text-[#251605]">{confirmCopy}</p>
        {help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}
        {needsReason ? (
          <label className="mt-4 block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Review reason
            </span>
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
              rows={3}
              className="w-full rounded-lg border border-[#DED7CD] bg-white p-2.5 text-sm text-[#251605] focus:border-[#C89933] focus:outline-hidden"
              required
            />
            {reasonError ? (
              <span className="text-xs font-medium text-destructive">{reasonError}</span>
            ) : null}
          </label>
        ) : null}
        {error ? <p className="mt-2 text-xs font-medium text-destructive">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            className={commercialOutlineButton()}
            onClick={onClose}
            disabled={busy}
          >
            Back
          </button>
          <button
            type="button"
            className={commercialGoldButton(busy)}
            disabled={busy}
            onClick={() => {
              if (needsReason && !reason.trim()) {
                setReasonError(REJECT_REASON_REQUIRED);
                reasonRef.current?.focus();
                return;
              }
              onConfirm(needsReason ? reason.trim() : undefined);
            }}
          >
            {busy ? "Working…" : kind === "approve" ? "Approve & Apply" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function approvalDialogCopy(kind: ApprovalDialogKind, policyCopy?: string) {
  if (kind === "approve") return APPROVE_CONFIRM_COPY;
  if (kind === "reject") return REJECT_CONFIRM_COPY;
  if (kind === "cancel") return CANCEL_CONFIRM_COPY;
  return policyCopy ?? "";
}
