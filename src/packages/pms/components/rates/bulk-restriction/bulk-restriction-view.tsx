import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { RestrictionCalendarGrid } from "@/packages/pms/components/rates/restrictions/restriction-calendar-grid";
import { RestrictionCalendarLegend } from "@/packages/pms/components/rates/restrictions/restriction-calendar-legend";
import {
  BULK_RESTRICTION_STALE_COPY,
  buildInventoryLookup,
  buildRestrictionOperation,
  emptyTriStatePatch,
  expandBulkTargets,
  expectedVersionsFromRestrictionPreview,
  humanizeRestrictionValidation,
  isRestrictionBulkStaleMessage,
  joinRestrictionPreviewInventory,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  reviewTurnsOnCtaOrCtd,
  reviewTurnsOnStopSell,
  summarizeRestrictionPreview,
  triStateChangedCount,
  withOccupiedStopSell,
  type RestrictionTriStatePatch,
} from "@/packages/pms/lib/revenue/bulk-restriction-change";
import { getRevenueRateCalendar } from "@/packages/pms/lib/revenue/rate-calendar.functions";
import { toRestrictionCalendar } from "@/packages/pms/lib/revenue/restriction-calendar";
import {
  applyRestrictionChanges,
  previewRestrictionChanges,
} from "@/packages/pms/lib/revenue/restriction-change.functions";
import type { RestrictionChangePreview } from "@/packages/pms/lib/revenue/restriction-change";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import { serializeRevenueSearch, type RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { RATE_CALENDAR_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { BulkRestrictionDefineStep } from "./bulk-restriction-define-step";
import { BulkRestrictionPanel } from "./bulk-restriction-panel";
import { BulkRestrictionScopeStep } from "./bulk-restriction-scope-step";
import type { BulkRestrictionStep } from "./bulk-restriction-progress";
import { RestrictionConfirmApply } from "../restriction-impact/restriction-confirm-apply";
import { RestrictionReviewPanel } from "../restriction-impact/restriction-review-panel";

function goldButton() {
  return "inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D] disabled:opacity-50";
}

function secondaryButton() {
  return "inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50";
}

export function BulkRestrictionView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
  canApplyRestrictions,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  canApplyRestrictions?: boolean;
}) {
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewRestrictionChanges);
  const applyFn = useServerFn(applyRestrictionChanges);
  const fetchCalendar = useServerFn(getRevenueRateCalendar);

  const [step, setStep] = useState<BulkRestrictionStep>(1);
  const [fromDate, setFromDate] = useState(context.fromDate);
  const [toDate, setToDate] = useState(context.toDate);
  const [roomTypeIds, setRoomTypeIds] = useState<string[]>(context.roomTypeId ? [context.roomTypeId] : []);
  const [planIds, setPlanIds] = useState<string[]>(context.ratePlanId ? [context.ratePlanId] : []);
  const [operationType, setOperationType] = useState<"SET_FIELDS" | "CLEAR_ALL">("SET_FIELDS");
  const [patch, setPatch] = useState<RestrictionTriStatePatch>(emptyTriStatePatch);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RestrictionChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const selectedPlans = useMemo(
    () => ratePlans.filter((plan) => planIds.includes(plan.id)),
    [ratePlans, planIds],
  );
  const expansion = useMemo(
    () => expandBulkTargets({ planIds, fromDate, toDate }),
    [planIds, fromDate, toDate],
  );
  const calendarFilter = roomTypeIds.length === 1 ? roomTypeIds[0] : null;
  const planFilter = planIds.length === 1 ? planIds[0] : null;

  const calendarQuery = useQuery({
    queryKey: ["revenue-rate-calendar", restaurantId, fromDate, toDate, calendarFilter, planFilter],
    queryFn: () =>
      fetchCalendar({
        data: {
          restaurantId,
          fromDate,
          toDate,
          roomTypeId: calendarFilter,
          ratePlanId: planFilter,
        },
      }),
    retry: false,
  });

  const reviewRows = useMemo(
    () => joinRestrictionPreviewInventory(preview?.items ?? [], buildInventoryLookup(calendarQuery.data)),
    [preview, calendarQuery.data],
  );
  const summary = useMemo(() => {
    if (!preview) return null;
    return withOccupiedStopSell(summarizeRestrictionPreview(preview.items), reviewRows);
  }, [preview, reviewRows]);
  const calendar = useMemo(
    () => (calendarQuery.data ? toRestrictionCalendar(calendarQuery.data) : null),
    [calendarQuery.data],
  );

  function failMessage(message: string) {
    return isRestrictionBulkStaleMessage(message)
      ? BULK_RESTRICTION_STALE_COPY
      : humanizeRestrictionValidation(message);
  }

  function requestPayload() {
    if (!expansion.ok) throw new Error("Select a valid scope before previewing.");
    const built = buildRestrictionOperation({ type: operationType, patch });
    if (!built.ok) throw new Error(built.message);
    return {
      restaurantId,
      targets: expansion.targets,
      operation: built.operation,
      reason: reason.trim() || null,
      expectedVersions: expectedVersionsFromRestrictionPreview(preview?.items ?? []),
      source: "rate_revenue" as const,
    };
  }

  const previewMutation = useMutation({
    mutationKey: ["bulk-restriction-preview", restaurantId],
    mutationFn: () => previewFn({ data: { ...requestPayload(), expectedVersions: undefined } }),
    onSuccess: (data) => {
      setPreview(data);
      setError(
        data.valid
          ? null
          : failMessage(
              data.items.find((item) => item.validationStatus === "invalid")?.validationMessages[0] ??
                "Preview is not valid.",
            ),
      );
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(failMessage(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: requestPayload() }),
    onSuccess: (result) => {
      setError(null);
      setSuccess(true);
      setAppliedCount(result.appliedCount);
      void queryClient.invalidateQueries({ queryKey: ["revenue-rate-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["revenue-control"] });
      void queryClient.invalidateQueries({ queryKey: ["restriction-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-restrictions"] });
    },
    onError: (err: Error) => {
      const message = failMessage(err.message);
      setError(message);
      setSuccess(false);
      if (isRestrictionBulkStaleMessage(err.message)) setStep(3);
    },
  });

  function updateScope(next: { fromDate?: string; toDate?: string; roomTypeIds?: string[]; planIds?: string[] }) {
    if (next.fromDate != null) setFromDate(next.fromDate);
    if (next.toDate != null) setToDate(next.toDate);
    if (next.roomTypeIds) {
      setRoomTypeIds(next.roomTypeIds);
      setPlanIds(prunePlanIdsForRoomTypes(planIds, ratePlans, next.roomTypeIds));
    }
    if (next.planIds) setPlanIds(next.planIds);
    setPreview(null);
    setError(null);
    setSuccess(false);
  }

  function cancelWizard() {
    setStep(1);
    setPreview(null);
    setError(null);
    setSuccess(false);
    setAppliedCount(null);
    previewMutation.reset();
    applyMutation.reset();
  }

  const canApply = canApplyRestrictions ?? access.canApplyRestrictions;
  const restrictionsSearch = serializeRevenueSearch("restrictions", context);
  const historySearch = serializeRevenueSearch("restriction-history", context);
  const defineReady = operationType === "CLEAR_ALL" || triStateChangedCount(patch) > 0;

  let body = (
    <BulkRestrictionScopeStep
      fromDate={fromDate}
      toDate={toDate}
      roomTypeIds={roomTypeIds}
      planIds={planIds}
      roomTypes={roomTypes}
      ratePlans={ratePlans}
      expansion={expansion}
      onChange={updateScope}
    />
  );
  if (step === 2) {
    body = (
      <BulkRestrictionDefineStep
        operationType={operationType}
        patch={patch}
        reason={reason}
        selectedPlans={selectedPlans}
        fromDate={fromDate}
        toDate={toDate}
        onChange={(next) => {
          if (next.operationType) setOperationType(next.operationType);
          if (next.patch) setPatch(next.patch);
          if (next.reason != null) setReason(next.reason);
          setPreview(null);
          setError(null);
          setSuccess(false);
        }}
      />
    );
  } else if (step === 3) {
    body = (
      <RestrictionReviewPanel
        rows={reviewRows}
        summary={summary}
        loading={previewMutation.isPending}
        error={error}
        showCtaCtdWarning={reviewTurnsOnCtaOrCtd(preview?.items ?? [])}
        showStopSellWarning={reviewTurnsOnStopSell(preview?.items ?? [])}
      />
    );
  } else if (step === 4) {
    body = (
      <RestrictionConfirmApply
        summary={summary}
        reason={reason.trim() || null}
        canApply={canApply}
        applying={applyMutation.isPending}
        error={error}
        success={success}
        appliedCount={appliedCount}
        restrictionsSearch={restrictionsSearch}
        historySearch={historySearch}
        onApply={() => applyMutation.mutate()}
      />
    );
  }

  const footer = success ? null : (
    <>
      <button type="button" className={secondaryButton()} onClick={cancelWizard}>
        Cancel
      </button>
      {step > 1 ? (
        <button
          type="button"
          className={secondaryButton()}
          onClick={() => setStep((current) => (current - 1) as BulkRestrictionStep)}
        >
          Back
        </button>
      ) : null}
      {step === 1 ? (
        <button type="button" className={goldButton()} disabled={!expansion.ok} onClick={() => setStep(2)}>
          Next
        </button>
      ) : null}
      {step === 2 ? (
        <button
          type="button"
          className={goldButton()}
          disabled={!defineReady || selectedPlans.length === 0}
          onClick={() => {
            const built = buildRestrictionOperation({ type: operationType, patch });
            if (!built.ok) {
              setError(built.message);
              return;
            }
            setError(null);
            setStep(3);
            previewMutation.mutate();
          }}
        >
          Review
        </button>
      ) : null}
      {step === 3 ? (
        <button
          type="button"
          className={goldButton()}
          disabled={previewMutation.isPending || !preview}
          onClick={() => setStep(4)}
        >
          Confirm
        </button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-2">
          <div className="rounded-xl border border-[#E8E1D7] bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Selected scope
            </p>
            <p className="mt-1 text-xs text-[#251605]">
              {fromDate} – {toDate} · {roomTypeIds.length || "all"} room type
              {roomTypeIds.length === 1 ? "" : "s"} · {planIds.length} plan{planIds.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {expansion.ok
                ? `${expansion.targetCount} planned changes. Calendar preview shows the first 14 days; the wizard uses the full range.`
                : expansion.code === "over_max"
                  ? "This selection exceeds the 366-change limit. Narrow the date range or selected plans."
                  : "Choose dates and rate plans in the Apply Restriction panel."}
            </p>
            {plansForSelectedRoomTypes(ratePlans, roomTypeIds).length === 0 && ratePlans.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No rate plans are configured. Configure them in Property Setup.
              </p>
            ) : null}
          </div>

          {calendarQuery.isLoading ? (
            <div className="hidden h-64 animate-pulse rounded-xl border border-[#E8E1D7] bg-card xl:block" />
          ) : calendarQuery.isError ? (
            <div className="hidden xl:block">
              <InventoryState
                state="error"
                title={RATE_CALENDAR_LOAD_ERROR}
                description={revenueUiError(calendarQuery.error, RATE_CALENDAR_LOAD_ERROR)}
                onRetry={() => void calendarQuery.refetch()}
              />
            </div>
          ) : calendar && calendar.groups.length > 0 ? (
            <div className="hidden space-y-2 xl:block">
              <RestrictionCalendarGrid data={calendar} selected={null} onSelect={() => undefined} />
              <RestrictionCalendarLegend />
            </div>
          ) : null}
        </div>

        <BulkRestrictionPanel step={step} progress={!success} body={body} footer={footer} />
      </div>
    </div>
  );
}
