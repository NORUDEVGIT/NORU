import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useRevenueApprovalPolicy } from "@/packages/pms/components/rates/approvals/use-revenue-approval-policy";
import {
  RESTRICTION_SUBMITTED_TOAST,
  SUBMIT_FOR_APPROVAL_LABEL,
  approvalRequestSearch,
  handleRevenueMutationResult,
  invalidateRevenueApprovals,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  applyRestrictionChanges,
  previewRestrictionChanges,
} from "@/packages/pms/lib/revenue/restriction-change.functions";
import type { RestrictionChangePreview, RestrictionState } from "@/packages/pms/lib/revenue/restriction-change";
import type { RestrictionCalendarCell } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  RESTRICTION_CALENDAR_CLEAR_COPY,
  changedRestrictionFields,
  formatRestrictionFieldValue,
  humanizeRestrictionCalendarError,
  parseStayInput,
  restrictionStateFromCell,
} from "@/packages/pms/lib/revenue/restriction-calendar";

function Toggle({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 text-xs text-[#251605]">
      {label}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#C89933]"
      />
    </label>
  );
}

export function RestrictionEditForm({
  restaurantId,
  cell,
  canEdit,
}: {
  restaurantId: string;
  cell: RestrictionCalendarCell;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const previewFn = useServerFn(previewRestrictionChanges);
  const applyFn = useServerFn(applyRestrictionChanges);
  const current = restrictionStateFromCell(cell.restriction);
  const [draft, setDraft] = useState<RestrictionState>(current);
  const [minInput, setMinInput] = useState(current.minStay == null ? "" : String(current.minStay));
  const [maxInput, setMaxInput] = useState(current.maxStay == null ? "" : String(current.maxStay));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RestrictionChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<"SET_FIELDS" | "CLEAR_ALL">("SET_FIELDS");

  useEffect(() => {
    const next = restrictionStateFromCell(cell.restriction);
    setDraft(next);
    setMinInput(next.minStay == null ? "" : String(next.minStay));
    setMaxInput(next.maxStay == null ? "" : String(next.maxStay));
    setPreview(null);
    setError(null);
    setOperationType("SET_FIELDS");
  }, [cell.ratePlanId, cell.date, cell.restrictionExpectedVersion]);

  const readOnly = !canEdit;
  const patch = changedRestrictionFields(current, draft);
  const changedCount = Object.keys(patch).length;

  function requestPayload(nextType: "SET_FIELDS" | "CLEAR_ALL" = operationType) {
    return {
      restaurantId,
      targets: [{ ratePlanId: cell.ratePlanId, date: cell.date }],
      operation:
        nextType === "CLEAR_ALL"
          ? ({ type: "CLEAR_ALL" } as const)
          : ({ type: "SET_FIELDS", fields: patch } as const),
      reason: reason.trim() || null,
      expectedVersions: [
        {
          ratePlanId: cell.ratePlanId,
          date: cell.date,
          expectedVersion: cell.restrictionExpectedVersion,
        },
      ],
      source: "restriction_calendar" as const,
    };
  }

  const previewMutation = useMutation({
    mutationFn: (nextType: "SET_FIELDS" | "CLEAR_ALL") => previewFn({ data: requestPayload(nextType) }),
    onSuccess: (data) => {
      setPreview(data);
      setError(
        data.valid
          ? null
          : humanizeRestrictionCalendarError(data.items[0]?.validationMessages[0] ?? "Preview is not valid."),
      );
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(humanizeRestrictionCalendarError(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: requestPayload() }),
    onSuccess: (result) => {
      setError(null);
      const handled = handleRevenueMutationResult(result);
      if (handled.submitted) {
        invalidateRevenueApprovals(queryClient, restaurantId);
        toast.success(RESTRICTION_SUBMITTED_TOAST, {
          action: handled.approvalRequestId
            ? {
                label: "View Request",
                onClick: () =>
                  void navigate({
                    to: "/restaurant/pms/rates-revenue",
                    search: approvalRequestSearch(handled.approvalRequestId!),
                  }),
              }
            : undefined,
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["revenue-rate-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["revenue-control"] });
      void queryClient.invalidateQueries({ queryKey: ["restriction-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-restrictions"] });
    },
    onError: (err: Error) => setError(humanizeRestrictionCalendarError(err.message)),
  });

  const item = preview?.items[0];

  return (
    <div className="space-y-3">
      {readOnly ? (
        <p className="text-xs text-[#6B4A0A]">You do not have permission to apply restrictions.</p>
      ) : null}

      <div>
        <Label htmlFor="restriction-min">Min stay</Label>
        <Input
          id="restriction-min"
          type="number"
          min={1}
          max={365}
          value={minInput}
          disabled={readOnly}
          placeholder="None"
          onChange={(event) => {
            const value = event.target.value;
            setMinInput(value);
            setDraft((currentDraft) => ({ ...currentDraft, minStay: parseStayInput(value) }));
            setPreview(null);
            setOperationType("SET_FIELDS");
          }}
        />
      </div>

      <div>
        <Label htmlFor="restriction-max">Max stay</Label>
        <Input
          id="restriction-max"
          type="number"
          min={1}
          max={365}
          value={maxInput}
          disabled={readOnly}
          placeholder="None"
          onChange={(event) => {
            const value = event.target.value;
            setMaxInput(value);
            setDraft((currentDraft) => ({ ...currentDraft, maxStay: parseStayInput(value) }));
            setPreview(null);
            setOperationType("SET_FIELDS");
          }}
        />
      </div>

      <Toggle
        id="restriction-cta"
        label="Closed to arrival"
        checked={draft.closedToArrival}
        disabled={readOnly}
        onChange={(value) => {
          setDraft((currentDraft) => ({ ...currentDraft, closedToArrival: value }));
          setPreview(null);
          setOperationType("SET_FIELDS");
        }}
      />
      <Toggle
        id="restriction-ctd"
        label="Closed to departure"
        checked={draft.closedToDeparture}
        disabled={readOnly}
        onChange={(value) => {
          setDraft((currentDraft) => ({ ...currentDraft, closedToDeparture: value }));
          setPreview(null);
          setOperationType("SET_FIELDS");
        }}
      />
      <Toggle
        id="restriction-stop"
        label="Stop sell"
        checked={draft.stopSell}
        disabled={readOnly}
        onChange={(value) => {
          setDraft((currentDraft) => ({ ...currentDraft, stopSell: value }));
          setPreview(null);
          setOperationType("SET_FIELDS");
        }}
      />

      <div>
        <Label htmlFor="restriction-reason">Reason for change</Label>
        <Input
          id="restriction-reason"
          value={reason}
          disabled={readOnly}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional"
        />
      </div>

      {item ? (
        <div className="rounded-xl border border-[#E8E1D7] bg-white p-3 text-xs">
          {item.noOp ? (
            <p>No restriction fields would change.</p>
          ) : (
            item.changedFields.map((field) => (
              <p key={field}>
                {field}: {formatRestrictionFieldValue(field, item.before[field])} →{" "}
                {formatRestrictionFieldValue(field, item.after[field])}
              </p>
            ))
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly || previewMutation.isPending || (operationType === "SET_FIELDS" && changedCount === 0)}
          onClick={() => {
            setOperationType("SET_FIELDS");
            previewMutation.mutate("SET_FIELDS");
          }}
          className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={readOnly || !preview?.valid || applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
          className="inline-flex h-8 items-center rounded-md bg-[#D3A13B] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#BE8D2D] disabled:opacity-50"
        >
          {policyQuery.data?.enabled ? SUBMIT_FOR_APPROVAL_LABEL : "Apply"}
        </button>
        <button
          type="button"
          disabled={readOnly || previewMutation.isPending}
          onClick={() => {
            setOperationType("CLEAR_ALL");
            setPreview(null);
            previewMutation.mutate("CLEAR_ALL");
          }}
          className="inline-flex h-8 items-center rounded-md border border-rose-200 bg-white px-2.5 text-[10px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Clear restrictions
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">{RESTRICTION_CALENDAR_CLEAR_COPY}</p>
    </div>
  );
}
