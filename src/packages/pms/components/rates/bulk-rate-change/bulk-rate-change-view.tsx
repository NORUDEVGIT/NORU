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
import { useRevenueApprovalPolicy } from "@/packages/pms/components/rates/approvals/use-revenue-approval-policy";
import {
  applyRateChanges,
  previewRateChanges,
} from "@/packages/pms/lib/revenue/rate-change.functions";
import {
  approvalRequestSearch,
  handleRevenueMutationResult,
  invalidateRevenueApprovals,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RateChangePreview, RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import {
  serializeRevenueSearch,
  type RevenueContext,
  type RevenueSearchParams,
} from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueRatePlan,
  RevenueRoomType,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import {
  RATE_CALENDAR_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/core/state/property-format";
import { BulkDefineStep } from "./bulk-define-step";
import { BulkRateChangePanel } from "./bulk-rate-change-panel";
import { BulkScopeStep } from "./bulk-scope-step";
import type { BulkWizardStep } from "./bulk-wizard-progress";
import { BulkConfirmApply } from "../impact-review/bulk-confirm-apply";
import { BulkReviewPanel } from "../impact-review/bulk-review-panel";

function goldButton(disabled?: boolean) {
  return [
    "inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50",
    disabled ? "opacity-50" : "",
  ].join(" ");
}

function secondaryButton() {
  return "inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF6F0] disabled:opacity-50";
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
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const previewFn = useServerFn(previewRateChanges);
  const applyFn = useServerFn(applyRateChanges);
  const fetchCalendar = useServerFn(getRevenueRateCalendar);

  const [submittedRequest, setSubmittedRequest] = useState<RevenueSearchParams | null>(null);
  const [step, setStep] = useState<BulkWizardStep>(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fromDate, setFromDate] = useState(context.fromDate);
  const [toDate, setToDate] = useState(context.toDate);
  const [roomTypeIds, setRoomTypeIds] = useState<string[]>(
    context.roomTypeId ? [context.roomTypeId] : [],
  );
  const [planIds, setPlanIds] = useState<string[]>(context.ratePlanId ? [context.ratePlanId] : []);
  const [selectedCell, setSelectedCell] = useState<
    import("@/packages/pms/lib/revenue/rate-calendar").RateCalendarCell | null
  >(null);
  const [selectedRowPlanId, setSelectedRowPlanId] = useState<string | null>(null);
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
  const calendarFilter = null;
  const planFilter = null;

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
    return isBulkStaleMessage(message)
      ? BULK_RATE_CHANGE_STALE_COPY
      : humanizeRateChangeValidation(message);
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
      setError(
        data.valid
          ? null
          : failMessage(
              data.items.find((item) => item.validationStatus === "invalid")
                ?.validationMessages[0] ?? "Preview is not valid.",
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
      const handled = handleRevenueMutationResult(result);
      if (handled.submitted) {
        setSubmittedRequest(
          handled.approvalRequestId ? approvalRequestSearch(handled.approvalRequestId) : {},
        );
        setSuccess(false);
        invalidateRevenueApprovals(queryClient, restaurantId);
        return;
      }
      setSubmittedRequest(null);
      setSuccess(true);
      setAppliedCount("appliedCount" in result ? result.appliedCount : null);
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

  const approveImmediateMutation = useMutation({
    mutationFn: () => applyFn({ data: { ...requestPayload(), applyImmediately: true } }),
    onSuccess: (result) => {
      setError(null);
      setSubmittedRequest(null);
      setSuccess(true);
      setAppliedCount("appliedCount" in result ? result.appliedCount : null);
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

  function updateScope(patch: {
    fromDate?: string;
    toDate?: string;
    roomTypeIds?: string[];
    planIds?: string[];
  }) {
    if (patch.fromDate != null) setFromDate(patch.fromDate);
    if (patch.toDate != null) setToDate(patch.toDate);
    if (patch.roomTypeIds) {
      setRoomTypeIds(patch.roomTypeIds);
      setPlanIds(prunePlanIdsForRoomTypes(planIds, ratePlans, patch.roomTypeIds));
    }
    if (patch.planIds) setPlanIds(patch.planIds);
    setSelectedCell(null);
    setSelectedRowPlanId(null);
    setPreview(null);
    setError(null);
    setSuccess(false);
  }

  function cancelWizard() {
    setStep(1);
    setDrawerOpen(false);
    setSelectedCell(null);
    setSelectedRowPlanId(null);
    setPreview(null);
    setError(null);
    setSuccess(false);
    setAppliedCount(null);
    setSubmittedRequest(null);
    previewMutation.reset();
    applyMutation.reset();
    approveImmediateMutation.reset();
  }

  function openWorkflowDrawer() {
    if (!expansion.ok) return;
    if (step === 1) {
      setStep(2);
    }
    setDrawerOpen(true);
  }

  const canEdit = access.canEditDailyRates;
  const calendarSearch = serializeRevenueSearch("rate-calendar", context);
  const historySearch = serializeRevenueSearch("rate-history", context);

  const scopeSummaryCard = (
    <div className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 text-xs text-[#251605]">
      <p className="font-semibold uppercase tracking-wider text-[#8A641A]">Selected Scope</p>
      <p className="mt-1 text-sm font-semibold text-[#251605]">
        {fromDate === toDate ? `Specific Date: ${fromDate}` : `${fromDate} – ${toDate}`}
      </p>
      <p className="mt-0.5 text-xs text-[#5A4833]">
        {roomTypeIds.length || roomTypes.length} room type
        {(roomTypeIds.length || roomTypes.length) === 1 ? "" : "s"} · {planIds.length} rate plan
        {planIds.length === 1 ? "" : "s"} ·{" "}
        {expansion.ok ? `${expansion.targetCount} selected rate cells` : "0 selected rate cells"}
      </p>
    </div>
  );

  let drawerBody = (
    <div className="space-y-4">
      {scopeSummaryCard}
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
      {error ? <p className="text-xs font-medium text-[#6B4A0A]">{error}</p> : null}
    </div>
  );

  if (step === 3) {
    drawerBody = (
      <div className="space-y-4">
        {scopeSummaryCard}
        <BulkReviewPanel
          rows={reviewRows}
          summary={summary}
          loading={previewMutation.isPending}
          error={error}
          money={money}
        />
      </div>
    );
  } else if (step === 4) {
    drawerBody = (
      <div className="space-y-4">
        {scopeSummaryCard}
        <BulkConfirmApply
          summary={summary}
          reason={reason.trim() || null}
          canEdit={canEdit}
          applying={applyMutation.isPending || approveImmediateMutation.isPending}
          error={error}
          success={success}
          appliedCount={appliedCount}
          calendarSearch={calendarSearch}
          historySearch={historySearch}
          requestSearch={submittedRequest ?? undefined}
          submitted={Boolean(submittedRequest)}
          submitForApproval={policyQuery.data?.enabled === true}
          onApply={() => applyMutation.mutate()}
          onApproveImmediate={() => approveImmediateMutation.mutate()}
        />
      </div>
    );
  }

  const footer =
    success || submittedRequest ? null : (
      <>
        <button type="button" className={secondaryButton()} onClick={cancelWizard}>
          Cancel
        </button>
        {step === 2 ? (
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => {
              setStep(1);
              setDrawerOpen(false);
            }}
          >
            Back to Selection
          </button>
        ) : step > 2 ? (
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => setStep((current) => (current - 1) as BulkWizardStep)}
          >
            Back
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
            Review Bulk Change
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
    <div className="min-w-0 space-y-3">
      {/* Compact Selected Scope Bar + Primary Workflow Trigger */}
      <div className="flex flex-col gap-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Selected Scope
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold text-[#251605]">
            <span>
              {fromDate === toDate ? `Specific Date: ${fromDate}` : `${fromDate} – ${toDate}`}
            </span>
            <span className="text-[#756A5B]">·</span>
            <span>
              {roomTypeIds.length || roomTypes.length} room type
              {(roomTypeIds.length || roomTypes.length) === 1 ? "" : "s"}
            </span>
            <span className="text-[#756A5B]">·</span>
            <span>
              {planIds.length} rate plan{planIds.length === 1 ? "" : "s"}
            </span>
            <span className="text-[#756A5B]">·</span>
            <span className="text-[#8A641A]">
              {expansion.ok
                ? `${expansion.targetCount} selected rate cells`
                : "0 selected rate cells"}
            </span>
          </div>
          {plansForSelectedRoomTypes(ratePlans, roomTypeIds).length === 0 &&
          ratePlans.length === 0 ? (
            <p className="mt-1 text-xs text-[#756A5B]">
              No rate plans are configured. Configure them in Property Setup.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={goldButton(!expansion.ok)}
            disabled={!expansion.ok}
            onClick={openWorkflowDrawer}
          >
            {step > 1 ? "Resume Bulk Rate Change" : "Set Rate for Selected Scope"}
          </button>
        </div>
      </div>

      {/* Step 1 Full-Width Scope Filter Toolbar */}
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

      {/* Full-Width Calendar Preview Grid */}
      {calendarQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border border-[#DDD4C5] bg-white" />
      ) : calendarQuery.isError ? (
        <InventoryState
          state="error"
          title={RATE_CALENDAR_LOAD_ERROR}
          description={revenueUiError(calendarQuery.error, RATE_CALENDAR_LOAD_ERROR)}
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : calendarQuery.data && calendarQuery.data.groups.length > 0 ? (
        <div className="space-y-3">
          <RateCalendarLegend />
          <RateCalendarGrid
            data={calendarQuery.data}
            selected={selectedCell}
            selectedRowPlanId={selectedRowPlanId}
            selectedPlanIds={planIds}
            onTogglePlan={(planId) => {
              const nextPlans = planIds.includes(planId)
                ? planIds.filter((id) => id !== planId)
                : [...planIds, planId];
              const nextRoomTypes = Array.from(
                new Set(
                  ratePlans
                    .filter((plan) => nextPlans.includes(plan.id))
                    .map((plan) => plan.roomTypeId),
                ),
              );
              setPlanIds(nextPlans);
              setRoomTypeIds(nextRoomTypes);
              setSelectedCell(null);
              setSelectedRowPlanId(null);
              setPreview(null);
              setError(null);
              setSuccess(false);
            }}
            onToggleRoomType={(roomTypeId, planIdsInGroup) => {
              const allGroupChecked =
                planIdsInGroup.length > 0 && planIdsInGroup.every((id) => planIds.includes(id));
              const nextPlans = allGroupChecked
                ? planIds.filter((id) => !planIdsInGroup.includes(id))
                : Array.from(new Set([...planIds, ...planIdsInGroup]));
              const nextRoomTypes = allGroupChecked
                ? roomTypeIds.filter((id) => id !== roomTypeId)
                : Array.from(new Set([...roomTypeIds, roomTypeId]));
              setPlanIds(nextPlans);
              setRoomTypeIds(nextRoomTypes);
              setSelectedCell(null);
              setSelectedRowPlanId(null);
              setPreview(null);
              setError(null);
              setSuccess(false);
            }}
            onToggleAllPlans={(allPlanIds) => {
              const allChecked =
                allPlanIds.length > 0 && allPlanIds.every((id) => planIds.includes(id));
              const nextPlans = allChecked ? [] : allPlanIds;
              const nextRoomTypes = allChecked ? [] : roomTypes.map((rt) => rt.id);
              setPlanIds(nextPlans);
              setRoomTypeIds(nextRoomTypes);
              setSelectedCell(null);
              setSelectedRowPlanId(null);
              setPreview(null);
              setError(null);
              setSuccess(false);
            }}
            onSelect={(cell) => {
              setSelectedCell(cell);
              setSelectedRowPlanId(null);
              setFromDate(cell.date);
              setToDate(cell.date);
              setRoomTypeIds([cell.roomTypeId]);
              setPlanIds([cell.ratePlanId]);
              setValue(String(cell.effectiveRate));
              setPreview(null);
              setError(null);
              setSuccess(false);
              setStep(2);
              setDrawerOpen(true);
            }}
            onSelectRow={(row, roomType) => {
              setSelectedCell(null);
              setSelectedRowPlanId(row.plan.id);
              setRoomTypeIds([roomType.id]);
              setPlanIds([row.plan.id]);
              if (row.cells[0]) {
                setValue(String(row.cells[0].effectiveRate));
              }
              setPreview(null);
              setError(null);
              setSuccess(false);
              setStep(2);
              setDrawerOpen(true);
            }}
          />
        </div>
      ) : null}

      {/* On-Demand Right-Side Workflow Drawer (Steps 2–4) */}
      <BulkRateChangePanel
        open={drawerOpen}
        step={step}
        subtitle={`${fromDate === toDate ? fromDate : `${fromDate} – ${toDate}`} · ${planIds.length} rate plan${planIds.length === 1 ? "" : "s"}`}
        progress={!success && !submittedRequest}
        body={drawerBody}
        footer={footer}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
