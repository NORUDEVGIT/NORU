import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useRevenueApprovalPolicy } from "@/packages/pms/components/rates/approvals/use-revenue-approval-policy";
import {
  APPROVE_APPLY_LABEL,
  RESTRICTION_SUBMITTED_TOAST,
  SUBMIT_FOR_APPROVAL_LABEL,
  approvalRequestSearch,
  handleRevenueMutationResult,
  invalidateRevenueApprovals,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  expandBulkTargets,
  expectedVersionsFromRestrictionPreview,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import type { RateCalendarPlan } from "@/packages/pms/lib/revenue/rate-calendar";
import {
  applyRestrictionChanges,
  previewRestrictionChanges,
} from "@/packages/pms/lib/revenue/restriction-change.functions";
import {
  ABSENT_RESTRICTION_VERSION,
  type RestrictionChangePreview,
  type RestrictionState,
} from "@/packages/pms/lib/revenue/restriction-change";
import type { RestrictionCalendarCell } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  RESTRICTION_CALENDAR_CLEAR_COPY,
  changedRestrictionFields,
  formatRestrictionFieldValue,
  humanizeRestrictionCalendarError,
  parseStayInput,
  restrictionStateFromCell,
} from "@/packages/pms/lib/revenue/restriction-calendar";

export type RestrictionEditScope = "single" | "row";

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
    <label
      htmlFor={id}
      className={[
        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-[#C89933]/40",
        checked
          ? "border-[#C89933] bg-[#FAF6F0] text-[#251605]"
          : "border-[#E8E1D7] bg-white text-[#251605] hover:bg-[#FAF6F0]/70",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{label}</span>
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
  plan,
  rowCells = [],
  initialScope = "single",
  defaultFromDate,
  defaultToDate,
  canEdit,
}: {
  restaurantId: string;
  cell: RestrictionCalendarCell;
  plan?: RateCalendarPlan | null;
  rowCells?: RestrictionCalendarCell[];
  initialScope?: RestrictionEditScope;
  defaultFromDate?: string;
  defaultToDate?: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const previewFn = useServerFn(previewRestrictionChanges);
  const applyFn = useServerFn(applyRestrictionChanges);
  const current = restrictionStateFromCell(cell.restriction);

  const [scope, setScope] = useState<RestrictionEditScope>(initialScope);
  const [rangeFrom, setRangeFrom] = useState(defaultFromDate ?? cell.date);
  const [rangeTo, setRangeTo] = useState(defaultToDate ?? cell.date);
  const [draft, setDraft] = useState<RestrictionState>(current);
  const [minInput, setMinInput] = useState(current.minStay == null ? "" : String(current.minStay));
  const [maxInput, setMaxInput] = useState(current.maxStay == null ? "" : String(current.maxStay));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RestrictionChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<"SET_FIELDS" | "CLEAR_ALL">("SET_FIELDS");

  useEffect(() => {
    const next = restrictionStateFromCell(cell.restriction);
    setScope(initialScope);
    setDraft(next);
    setMinInput(next.minStay == null ? "" : String(next.minStay));
    setMaxInput(next.maxStay == null ? "" : String(next.maxStay));
    setPreview(null);
    setError(null);
    setOperationType("SET_FIELDS");
  }, [initialScope, cell.ratePlanId, cell.date, cell.restrictionExpectedVersion]);

  useEffect(() => {
    if (defaultFromDate) setRangeFrom(defaultFromDate);
    if (defaultToDate) setRangeTo(defaultToDate);
  }, [defaultFromDate, defaultToDate]);

  const rowExpansion = useMemo(
    () => expandBulkTargets({ planIds: [cell.ratePlanId], fromDate: rangeFrom, toDate: rangeTo }),
    [cell.ratePlanId, rangeFrom, rangeTo],
  );

  const readOnly = !canEdit;
  const patch = changedRestrictionFields(current, draft);
  const changedCount = Object.keys(patch).length;

  function requestPayload(
    nextType: "SET_FIELDS" | "CLEAR_ALL" = operationType,
    applyImmediately?: boolean,
    forPreview = false,
  ) {
    const operation =
      nextType === "CLEAR_ALL"
        ? ({ type: "CLEAR_ALL" } as const)
        : ({ type: "SET_FIELDS", fields: patch } as const);

    if (scope === "row") {
      if (!rowExpansion.ok) {
        throw new Error("Select a valid date range for the row.");
      }
      const cellVersionMap = new Map(rowCells.map((c) => [c.date, c.restrictionExpectedVersion]));
      const expectedVersions = forPreview
        ? undefined
        : preview?.items.length
          ? expectedVersionsFromRestrictionPreview(preview.items)
          : rowExpansion.targets.map((target) => ({
              ratePlanId: target.ratePlanId,
              date: target.date,
              expectedVersion: cellVersionMap.get(target.date) ?? ABSENT_RESTRICTION_VERSION,
            }));
      return {
        restaurantId,
        targets: rowExpansion.targets,
        operation,
        reason: reason.trim() || null,
        expectedVersions,
        source: "restriction_calendar" as const,
        ...(applyImmediately ? { applyImmediately: true } : {}),
      };
    }

    return {
      restaurantId,
      targets: [{ ratePlanId: cell.ratePlanId, date: cell.date }],
      operation,
      reason: reason.trim() || null,
      expectedVersions: [
        {
          ratePlanId: cell.ratePlanId,
          date: cell.date,
          expectedVersion: cell.restrictionExpectedVersion,
        },
      ],
      source: "restriction_calendar" as const,
      ...(applyImmediately ? { applyImmediately: true } : {}),
    };
  }

  const previewMutation = useMutation({
    mutationFn: (nextType: "SET_FIELDS" | "CLEAR_ALL") =>
      previewFn({ data: requestPayload(nextType, false, true) }),
    onSuccess: (data) => {
      setPreview(data);
      setError(
        data.valid
          ? null
          : humanizeRestrictionCalendarError(
              data.items.find((i) => i.validationStatus === "invalid")?.validationMessages[0] ??
                data.items[0]?.validationMessages[0] ??
                "Preview is not valid.",
            ),
      );
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(humanizeRestrictionCalendarError(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: (applyImmediately: boolean = false) =>
      applyFn({ data: requestPayload(operationType, applyImmediately, false) }),
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
      toast.success(
        scope === "row"
          ? `Restriction change applied across ${preview?.items.length ?? 1} date(s).`
          : "Restriction change applied.",
      );
      void queryClient.invalidateQueries({ queryKey: ["revenue-rate-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["revenue-control"] });
      void queryClient.invalidateQueries({ queryKey: ["restriction-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-restrictions"] });
    },
    onError: (err: Error) => setError(humanizeRestrictionCalendarError(err.message)),
  });

  const item = preview?.items[0];
  const itemCount = preview?.items.length ?? 0;

  return (
    <div className="space-y-3.5">
      {/* Scope Toggle: Single Date vs Whole Row (Specified Date Range) */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-3">
        <p className="text-xs font-semibold text-[#5A4833]">Update Scope</p>
        <div
          role="group"
          aria-label="Restriction update scope"
          className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg border border-[#DDD4C5] bg-[#F7F4EE] p-1"
        >
          <button
            type="button"
            onClick={() => {
              setScope("single");
              setPreview(null);
              setError(null);
            }}
            className={[
              "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              scope === "single"
                ? "bg-white text-[#251605] shadow-sm"
                : "text-[#756A5B] hover:text-[#251605]",
            ].join(" ")}
          >
            Specific Date ({cell.date})
          </button>
          <button
            type="button"
            onClick={() => {
              setScope("row");
              setPreview(null);
              setError(null);
            }}
            className={[
              "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              scope === "row"
                ? "bg-white text-[#251605] shadow-sm"
                : "text-[#756A5B] hover:text-[#251605]",
            ].join(" ")}
          >
            Whole Row (Date Range)
          </button>
        </div>

        {scope === "row" ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 border-t border-[#EFE9DF] pt-2.5">
            <label className="grid gap-1 text-xs font-semibold text-[#5A4833]">
              From Date
              <Input
                type="date"
                value={rangeFrom}
                onChange={(event) => {
                  setRangeFrom(event.target.value);
                  setPreview(null);
                }}
                className="h-9 text-xs font-medium text-[#251605]"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#5A4833]">
              To Date
              <Input
                type="date"
                value={rangeTo}
                onChange={(event) => {
                  setRangeTo(event.target.value);
                  setPreview(null);
                }}
                className="h-9 text-xs font-medium text-[#251605]"
              />
            </label>
            <p className="col-span-2 text-xs text-[#756A5B]">
              {rowExpansion.ok
                ? `Applies to ${plan?.code ?? "rate plan"} across ${rowExpansion.targetCount} date(s) (${rangeFrom} – ${rangeTo}).`
                : "Select a valid From and To date range."}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[#756A5B]">
            Updates <span className="font-semibold text-[#251605]">{plan?.code ?? "rate plan"}</span>{" "}
            on <span className="font-semibold text-[#251605]">{cell.date}</span> only.
          </p>
        )}
      </div>

      {readOnly ? (
        <p className="text-xs text-[#6B4A0A]">You do not have permission to apply restrictions.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
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
      </div>

      <div className="space-y-2">
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
      </div>

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
        <div className="space-y-1 rounded-xl border border-[#DDD4C5] bg-white p-3.5 text-xs text-[#251605]">
          {scope === "row" && itemCount > 1 ? (
            <p className="border-b border-[#EFE9DF] pb-1.5 font-semibold text-[#251605]">
              Previewing {itemCount} dates ({rangeFrom} – {rangeTo})
            </p>
          ) : null}
          {item.noOp ? (
            <p>No restriction fields would change.</p>
          ) : (
            item.changedFields.map((field) => (
              <p key={field}>
                {field}: {formatRestrictionFieldValue(field, item.before[field])} →{" "}
                <span className="font-semibold">
                  {formatRestrictionFieldValue(field, item.after[field])}
                </span>
              </p>
            ))
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={
            readOnly ||
            previewMutation.isPending ||
            (operationType === "SET_FIELDS" && changedCount === 0) ||
            (scope === "row" && !rowExpansion.ok)
          }
          onClick={() => {
            setOperationType("SET_FIELDS");
            previewMutation.mutate("SET_FIELDS");
          }}
          className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#FAF6F0] disabled:opacity-50"
        >
          Preview
        </button>

        {policyQuery.data?.enabled ? (
          <>
            <button
              type="button"
              disabled={readOnly || !preview?.valid || applyMutation.isPending}
              onClick={() => applyMutation.mutate(false)}
              className="inline-flex h-9 items-center rounded-lg border border-[#C89933] bg-[#FAF6F0] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#F1E6D2] disabled:opacity-50"
            >
              {SUBMIT_FOR_APPROVAL_LABEL}
            </button>
            <button
              type="button"
              disabled={readOnly || !preview?.valid || applyMutation.isPending}
              onClick={() => applyMutation.mutate(true)}
              className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#B5882D] disabled:opacity-50"
            >
              {APPROVE_APPLY_LABEL}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={readOnly || !preview?.valid || applyMutation.isPending}
            onClick={() => applyMutation.mutate(true)}
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#B5882D] disabled:opacity-50"
          >
            {APPROVE_APPLY_LABEL}
          </button>
        )}

        <button
          type="button"
          disabled={readOnly || previewMutation.isPending || (scope === "row" && !rowExpansion.ok)}
          onClick={() => {
            setOperationType("CLEAR_ALL");
            setPreview(null);
            previewMutation.mutate("CLEAR_ALL");
          }}
          className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
        >
          Clear restrictions
        </button>
      </div>
      <p className="text-xs text-[#756A5B]">{RESTRICTION_CALENDAR_CLEAR_COPY}</p>
    </div>
  );
}
