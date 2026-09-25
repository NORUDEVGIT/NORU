import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { RateCalendarGrid } from "@/packages/pms/components/rates/rate-calendar/rate-calendar-grid";
import { RateCalendarLegend } from "@/packages/pms/components/rates/rate-calendar/rate-calendar-legend";
import {
  BULK_RATE_CHANGE_STALE_COPY,
  buildBulkRule,
  buildInventoryLookup,
  expandBulkTargets,
  expectedVersionsFromPreview,
  humanizeRateChangeValidation,
  isBulkStaleMessage,
  joinPreviewInventory,
  plansForSelectedRoomTypes,
  prunePlanIdsForRoomTypes,
  summarizeBulkPreview,
  uniquePlanCurrencies,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import { getRevenueRateCalendar } from "@/packages/pms/lib/revenue/rate-calendar.functions";
import { applyRateChanges, previewRateChanges } from "@/packages/pms/lib/revenue/rate-change.functions";
import type { RateChangePreview, RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import { serializeRevenueSearch, type RevenueContext } from "@/packages/pms/lib/revenue/revenue-context";
import type { RevenueRatePlan, RevenueRoomType } from "@/packages/pms/lib/revenue/revenue-config.types";
import { RATE_CALENDAR_LOAD_ERROR, revenueUiError } from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { BulkDefineStep } from "./bulk-define-step";
import { BulkRateChangePanel } from "./bulk-rate-change-panel";
import { BulkScopeStep } from "./bulk-scope-step";
import type { BulkWizardStep } from "./bulk-wizard-progress";
import { BulkConfirmApply } from "../impact-review/bulk-confirm-apply";
import { BulkReviewPanel } from "../impact-review/bulk-review-panel";

function goldButton(disabled?: boolean) {
  return [
    "inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D] disabled:opacity-50",
    disabled ? "opacity-50" : "",
  ].join(" ");
}

function secondaryButton() {
  return "inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50";
}

export function BulkRateChangeView({
  restaurantId,
  context,
  access,
  roomTypes,
  ratePlans,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewRateChanges);
  const applyFn = useServerFn(applyRateChanges);
  const fetchCalendar = useServerFn(getRevenueRateCalendar);

  const [step, setStep] = useState<BulkWizardStep>(1);
  const [fromDate, setFromDate] = useState(context.fromDate);
  const [toDate, setToDate] = useState(context.toDate);
  const [roomTypeIds, setRoomTypeIds] = useState<string[]>(context.roomTypeId ? [context.roomTypeId] : []);
  const [planIds, setPlanIds] = useState<string[]>(context.ratePlanId ? [context.ratePlanId] : []);
  const [action, setAction] = useState<RateChangeRule["type"]>("SET_RATE");
  const [value, setValue] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RateChangePreview | null>(null);
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
  const mixedSetRate = action === "SET_RATE" && uniquePlanCurrencies(selectedPlans).length > 1;
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
    () => joinPreviewInventory(preview?.items ?? [], buildInventoryLookup(calendarQuery.data)),
    [preview, calendarQuery.data],
  );
  const summary = useMemo(() => (preview ? summarizeBulkPreview(preview.items) : null), [preview]);

  function failMessage(message: string) {
    return isBulkStaleMessage(message) ? BULK_RATE_CHANGE_STALE_COPY : humanizeRateChangeValidation(message);
  }

  function requestPayload() {
    if (!expansion.ok) throw new Error("Select a valid scope before previewing.");
    const rule = buildBulkRule({ type: action, value, sourceDate });
    if ("ok" in rule && rule.ok === false) throw new Error(rule.message);
    return {
      restaurantId,
      targets: expansion.targets,
      rule: rule as RateChangeRule,
      reason: reason.trim() || null,
      expectedVersions: expectedVersionsFromPreview(preview?.items ?? []),
      source: "rate_revenue" as const,
    };
  }

  const previewMutation = useMutation({
    mutationKey: ["bulk-rate-preview", restaurantId],
    mutationFn: () => previewFn({ data: { ...requestPayload(), expectedVersions: undefined } }),
    onSuccess: (data) => {
      setPreview(data);
      setError(data.valid ? null : failMessage(data.items.find((item) => item.validationStatus === "invalid")?.validationMessages[0] ?? "Preview is not valid."));
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
      void queryClient.invalidateQueries({ queryKey: ["rate-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["bulk-rate-preview"] });
    },
    onError: (err: Error) => {
      const message = failMessage(err.message);
      setError(message);
      setSuccess(false);
      if (isBulkStaleMessage(err.message)) setStep(3);
    },
  });

  function updateScope(patch: { fromDate?: string; toDate?: string; roomTypeIds?: string[]; planIds?: string[] }) {
    if (patch.fromDate != null) setFromDate(patch.fromDate);
    if (patch.toDate != null) setToDate(patch.toDate);
    if (patch.roomTypeIds) {
      setRoomTypeIds(patch.roomTypeIds);
      setPlanIds(prunePlanIdsForRoomTypes(planIds, ratePlans, patch.roomTypeIds));
    }
    if (patch.planIds) setPlanIds(patch.planIds);
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

  const canEdit = access.canEditDailyRates;
  const calendarSearch = serializeRevenueSearch("rate-calendar", context);
  const historySearch = serializeRevenueSearch("rate-history", context);

  let body = (
    <BulkScopeStep
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
      <BulkDefineStep
        action={action}
        value={value}
        sourceDate={sourceDate}
        reason={reason}
        selectedPlans={selectedPlans}
        onChange={(patch) => {
          if (patch.action) setAction(patch.action);
          if (patch.value != null) setValue(patch.value);
          if (patch.sourceDate != null) setSourceDate(patch.sourceDate);
          if (patch.reason != null) setReason(patch.reason);
          setPreview(null);
          setError(null);
          setSuccess(false);
        }}
      />
    );
  } else if (step === 3) {
    body = (
      <BulkReviewPanel
        rows={reviewRows}
        summary={summary}
        loading={previewMutation.isPending}
        error={error}
        money={money}
      />
    );
  } else if (step === 4) {
    body = (
      <BulkConfirmApply
        summary={summary}
        reason={reason.trim() || null}
        canEdit={canEdit}
        applying={applyMutation.isPending}
        error={error}
        success={success}
        appliedCount={appliedCount}
        calendarSearch={calendarSearch}
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
        <button type="button" className={secondaryButton()} onClick={() => setStep((current) => (current - 1) as BulkWizardStep)}>
          Back
        </button>
      ) : null}
      {step === 1 ? (
        <button
          type="button"
          className={goldButton()}
          disabled={!expansion.ok}
          onClick={() => setStep(2)}
        >
          Next
        </button>
      ) : null}
      {step === 2 ? (
        <button
          type="button"
          className={goldButton()}
          disabled={mixedSetRate || selectedPlans.length === 0}
          onClick={() => {
            const rule = buildBulkRule({ type: action, value, sourceDate });
            if ("ok" in rule && rule.ok === false) {
              setError(rule.message);
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
                : "Choose dates and rate plans in the Bulk Rate Change panel."}
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
          ) : calendarQuery.data && calendarQuery.data.groups.length > 0 ? (
            <div className="hidden space-y-2 xl:block">
              <RateCalendarGrid data={calendarQuery.data} selected={null} onSelect={() => undefined} />
              <RateCalendarLegend />
            </div>
          ) : null}
        </div>

        <BulkRateChangePanel step={step} progress={!success} body={body} footer={footer} />
      </div>
    </div>
  );
}
