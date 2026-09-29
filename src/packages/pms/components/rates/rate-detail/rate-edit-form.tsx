import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useRevenueApprovalPolicy } from "@/packages/pms/components/rates/approvals/use-revenue-approval-policy";
import type { RateCalendarCell, RateCalendarPlan } from "@/packages/pms/lib/revenue/rate-calendar";
import { RATE_CALENDAR_STALE_COPY } from "@/packages/pms/lib/revenue/rate-calendar";
import {
  applyRateChanges,
  previewRateChanges,
} from "@/packages/pms/lib/revenue/rate-change.functions";
import type { RateChangePreview, RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";
import {
  RATE_SUBMITTED_TOAST,
  SUBMIT_FOR_APPROVAL_LABEL,
  approvalRequestSearch,
  handleRevenueMutationResult,
  invalidateRevenueApprovals,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";

type EditAction = RateChangeRule["type"];

function staleMessage(message: string) {
  if (/RATE_CHANGE_STALE|changed by someone else|changed after this preview/i.test(message)) {
    return RATE_CALENDAR_STALE_COPY;
  }
  return message;
}

export function RateEditForm({
  restaurantId,
  cell,
  plan,
  canEdit,
  money,
}: {
  restaurantId: string;
  cell: RateCalendarCell;
  plan: RateCalendarPlan;
  canEdit: boolean;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const previewFn = useServerFn(previewRateChanges);
  const applyFn = useServerFn(applyRateChanges);
  const [action, setAction] = useState<EditAction>("SET_RATE");
  const [value, setValue] = useState(String(cell.effectiveRate));
  const [sourceDate, setSourceDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RateChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readOnly = !canEdit || !plan.active || cell.outsideValidity;
  const readOnlyReason = !canEdit
    ? "You do not have permission to edit daily rates."
    : !plan.active
      ? "This rate plan is inactive. Rate editing is read-only."
      : cell.outsideValidity
        ? "This date is outside the rate plan validity window."
        : null;

  function buildRule(): RateChangeRule {
    if (action === "RESET_OVERRIDE") return { type: "RESET_OVERRIDE" };
    if (action === "COPY_FROM_DATE") return { type: "COPY_FROM_DATE", sourceDate };
    const numeric = Number(value);
    if (action === "PERCENT_INCREASE") return { type: "PERCENT_INCREASE", value: numeric };
    if (action === "PERCENT_DECREASE") return { type: "PERCENT_DECREASE", value: numeric };
    return { type: "SET_RATE", value: numeric };
  }

  function requestPayload() {
    return {
      restaurantId,
      targets: [{ ratePlanId: cell.ratePlanId, date: cell.date }],
      rule: buildRule(),
      reason: reason.trim() || null,
      expectedVersions: [
        { ratePlanId: cell.ratePlanId, date: cell.date, expectedVersion: cell.expectedVersion },
      ],
      source: "rate_calendar" as const,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: requestPayload() }),
    onSuccess: (data) => {
      setPreview(data);
      setError(
        data.valid
          ? null
          : staleMessage(data.items[0]?.validationMessages[0] ?? "Preview is not valid."),
      );
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(staleMessage(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: requestPayload() }),
    onSuccess: (result) => {
      setError(null);
      const handled = handleRevenueMutationResult(result);
      if (handled.submitted) {
        invalidateRevenueApprovals(queryClient, restaurantId);
        toast.success(RATE_SUBMITTED_TOAST, {
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
      void queryClient.invalidateQueries({ queryKey: ["rate-change-history"] });
    },
    onError: (err: Error) => setError(staleMessage(err.message)),
  });

  const item = preview?.items[0];

  return (
    <div className="space-y-3">
      {readOnly ? <p className="text-xs text-[#6B4A0A]">{readOnlyReason}</p> : null}

      <div>
        <Label htmlFor="rate-edit-action">Change</Label>
        <select
          id="rate-edit-action"
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={action}
          disabled={readOnly}
          onChange={(event) => {
            setAction(event.target.value as EditAction);
            setPreview(null);
          }}
        >
          <option value="SET_RATE">Set Rate</option>
          <option value="RESET_OVERRIDE">Reset to Base Rate</option>
          <option value="PERCENT_INCREASE">Percent increase</option>
          <option value="PERCENT_DECREASE">Percent decrease</option>
          <option value="COPY_FROM_DATE">Copy from date</option>
        </select>
      </div>

      {action === "SET_RATE" || action === "PERCENT_INCREASE" || action === "PERCENT_DECREASE" ? (
        <div>
          <Label htmlFor="rate-edit-value">
            {action === "SET_RATE" ? "Nightly rate" : "Percent"}
          </Label>
          <Input
            id="rate-edit-value"
            type="number"
            value={value}
            disabled={readOnly}
            onChange={(event) => {
              setValue(event.target.value);
              setPreview(null);
            }}
          />
        </div>
      ) : null}

      {action === "COPY_FROM_DATE" ? (
        <div>
          <Label htmlFor="rate-edit-source">Source date</Label>
          <Input
            id="rate-edit-source"
            type="date"
            value={sourceDate}
            disabled={readOnly}
            onChange={(event) => {
              setSourceDate(event.target.value);
              setPreview(null);
            }}
          />
        </div>
      ) : null}

      {action === "RESET_OVERRIDE" ? (
        <p className="text-xs text-[#756A5B]">
          Reset to Base Rate deletes the override. It does not write the base rate into the
          calendar.
        </p>
      ) : null}

      <div>
        <Label htmlFor="rate-edit-reason">Reason for change</Label>
        <Input
          id="rate-edit-reason"
          value={reason}
          disabled={readOnly}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional"
        />
      </div>

      {item ? (
        <div className="space-y-1.5 rounded-xl border border-[#DDD4C5] bg-white p-3.5 text-xs text-[#251605]">
          <p className="flex justify-between">
            <span className="text-[#756A5B]">Current effective:</span>
            <span className="font-semibold">
              {item.currentEffectiveRate == null ? "—" : money(item.currentEffectiveRate)}
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-[#756A5B]">Proposed effective:</span>
            <span className="font-semibold">
              {item.proposedEffectiveRate == null ? "—" : money(item.proposedEffectiveRate)}
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-[#756A5B]">Delta:</span>
            <span className="font-semibold">
              {item.absoluteDelta == null ? "—" : money(item.absoluteDelta)}
            </span>
          </p>
          <p className="flex justify-between">
            <span className="text-[#756A5B]">Percent delta:</span>
            <span className="font-semibold">
              {item.percentageDelta == null ? "—" : `${item.percentageDelta}%`}
            </span>
          </p>
          <p className="pt-1 text-xs text-[#756A5B]">
            Restrictions remain as currently applied. No revenue-impact forecast.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={readOnly || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
          className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0] disabled:opacity-50"
        >
          Preview Rate Change
        </button>
        <button
          type="button"
          disabled={readOnly || !preview?.valid || applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
          className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#B5882D] disabled:opacity-50"
        >
          {policyQuery.data?.enabled ? SUBMIT_FOR_APPROVAL_LABEL : "Apply Rate Change"}
        </button>
      </div>
    </div>
  );
}
