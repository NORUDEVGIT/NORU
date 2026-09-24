import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { RateCalendarCell, RateCalendarPlan } from "@/packages/pms/lib/revenue/rate-calendar";
import { RATE_CALENDAR_STALE_COPY } from "@/packages/pms/lib/revenue/rate-calendar";
import {
  applyRateChanges,
  previewRateChanges,
} from "@/packages/pms/lib/revenue/rate-change.functions";
import type { RateChangePreview, RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";

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
      expectedVersions: [{ ratePlanId: cell.ratePlanId, date: cell.date, expectedVersion: cell.expectedVersion }],
      source: "rate_calendar" as const,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: requestPayload() }),
    onSuccess: (data) => {
      setPreview(data);
      setError(data.valid ? null : staleMessage(data.items[0]?.validationMessages[0] ?? "Preview is not valid."));
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(staleMessage(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: requestPayload() }),
    onSuccess: () => {
      setError(null);
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
          <Label htmlFor="rate-edit-value">{action === "SET_RATE" ? "Nightly rate" : "Percent"}</Label>
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
        <p className="text-[10px] text-muted-foreground">
          Reset to Base Rate deletes the override. It does not write the base rate into the calendar.
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
        <div className="rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] p-3 text-xs">
          <p>Current effective: {item.currentEffectiveRate == null ? "—" : money(item.currentEffectiveRate)}</p>
          <p>Proposed effective: {item.proposedEffectiveRate == null ? "—" : money(item.proposedEffectiveRate)}</p>
          <p>Delta: {item.absoluteDelta == null ? "—" : money(item.absoluteDelta)}</p>
          <p>Percent delta: {item.percentageDelta == null ? "—" : `${item.percentageDelta}%`}</p>
          <p className="text-muted-foreground">
            Restrictions remain as currently applied. No revenue-impact forecast.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
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
          Apply
        </button>
      </div>
    </div>
  );
}
