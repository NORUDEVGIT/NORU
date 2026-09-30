import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InventoryState } from "@/packages/pms/components/rooms/room-inventory-shared";
import { useRevenueApprovalPolicy } from "@/packages/pms/components/rates/approvals/use-revenue-approval-policy";
import {
  BULK_RATE_CHANGE_OVER_MAX_COPY,
  BULK_RATE_CHANGE_STALE_COPY,
  buildBulkRule,
  buildInventoryLookup,
  expandBulkTargets,
  expectedVersionsFromPreview,
  humanizeRateChangeValidation,
  isBulkStaleMessage,
  joinPreviewInventory,
  summarizeBulkPreview,
  uniquePlanCurrencies,
} from "@/packages/pms/lib/revenue/bulk-rate-change";
import { getRevenueRateCalendar } from "@/packages/pms/lib/revenue/rate-calendar.functions";
import {
  RATE_CALENDAR_GROUP_PAGE_SIZE,
  type RateCalendarCell,
  type RateCalendarWorkspace,
} from "@/packages/pms/lib/revenue/rate-calendar";
import {
  applyRateChanges,
  previewRateChanges,
} from "@/packages/pms/lib/revenue/rate-change.functions";
import type { RateChangePreview, RateChangeRule } from "@/packages/pms/lib/revenue/rate-change";
import {
  approvalRequestSearch,
  handleRevenueMutationResult,
  invalidateRevenueApprovals,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import type { RevenueAccess } from "@/packages/pms/lib/revenue/revenue-access";
import {
  serializeRevenueSearch,
  type RevenueContext,
  type RevenueSearchParams,
} from "@/packages/pms/lib/revenue/revenue-context";
import {
  RATE_CALENDAR_LOAD_ERROR,
  revenueUiError,
} from "@/packages/pms/lib/revenue/revenue-read-error";
import { useMoney } from "@/core/state/property-format";
import { BulkDefineStep } from "../bulk-rate-change/bulk-define-step";
import { BulkRateChangePanel } from "../bulk-rate-change/bulk-rate-change-panel";
import type { BulkWizardStep } from "../bulk-rate-change/bulk-wizard-progress";
import { BulkConfirmApply } from "../impact-review/bulk-confirm-apply";
import { BulkReviewPanel } from "../impact-review/bulk-review-panel";
import { RateDetailDrawer, type DrawerTab } from "../rate-detail/rate-detail-drawer";
import { RateCalendarGrid } from "./rate-calendar-grid";
import { RateCalendarLegend } from "./rate-calendar-legend";
import { RateCalendarToolbar } from "./rate-calendar-toolbar";

function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
      <div className="h-72 animate-pulse rounded-xl border border-[#E8E1D7] bg-card" />
    </div>
  );
}

function pageGroups(data: RateCalendarWorkspace, page: number) {
  const start = page * RATE_CALENDAR_GROUP_PAGE_SIZE;
  return {
    ...data,
    groups: data.groups.slice(start, start + RATE_CALENDAR_GROUP_PAGE_SIZE),
  };
}

export function RateCalendarView({
  restaurantId,
  context,
  access,
  businessDate,
  searchQuery = "",
  onRangeChange,
}: {
  restaurantId: string;
  context: RevenueContext;
  access: RevenueAccess;
  businessDate: string;
  searchQuery?: string;
  onRangeChange: (fromDate: string, toDate: string) => void;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const policyQuery = useRevenueApprovalPolicy(restaurantId);
  const fetchCalendar = useServerFn(getRevenueRateCalendar);
  const previewFn = useServerFn(previewRateChanges);
  const applyFn = useServerFn(applyRateChanges);

  const [selected, setSelected] = useState<RateCalendarCell | null>(null);
  const [selectedRowPlanId, setSelectedRowPlanId] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [page, setPage] = useState(0);

  // Embedded Bulk Rate Change Workflow State
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<BulkWizardStep>(2);
  const [action, setAction] = useState<RateChangeRule["type"]>("SET_RATE");
  const [value, setValue] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RateChangePreview | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<RevenueSearchParams | null>(null);

  const query = useQuery({
    queryKey: [
      "revenue-rate-calendar",
      restaurantId,
      context.fromDate,
      context.toDate,
      context.roomTypeId,
      context.ratePlanId,
    ],
    queryFn: () =>
      fetchCalendar({
        data: {
          restaurantId,
          fromDate: context.fromDate,
          toDate: context.toDate,
          roomTypeId: context.roomTypeId,
          ratePlanId: context.ratePlanId,
        },
      }),
    retry: false,
  });

  const filteredCalendar = useMemo(() => {
    if (!query.data) return null;
    const term = searchQuery.trim().toLowerCase();
    if (!term) return query.data;
    const groups = query.data.groups
      .map((group) => {
        const roomMatches =
          group.roomType.name.toLowerCase().includes(term) ||
          group.roomType.code.toLowerCase().includes(term);
        if (roomMatches) return group;
        const rows = group.rows.filter(
          (row) =>
            row.plan.name.toLowerCase().includes(term) ||
            row.plan.code.toLowerCase().includes(term),
        );
        return { ...group, rows };
      })
      .filter((group) => group.rows.length > 0);
    return {
      ...query.data,
      groups,
      groupCount: groups.length,
      planCount: groups.reduce((acc, g) => acc + g.rows.length, 0),
    };
  }, [query.data, searchQuery]);

  const paged = useMemo(() => {
    if (!filteredCalendar) return null;
    const maxPage = Math.max(
      0,
      Math.ceil(filteredCalendar.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE) - 1,
    );
    return pageGroups(filteredCalendar, Math.min(page, maxPage));
  }, [filteredCalendar, page]);

  const selectedMeta = useMemo(() => {
    if (!selected || !query.data) return { plan: null, roomType: null, cells: [] };
    for (const group of query.data.groups) {
      const row = group.rows.find((item) => item.plan.id === selected.ratePlanId);
      if (row) return { plan: row.plan, roomType: group.roomType, cells: row.cells };
    }
    return { plan: null, roomType: null, cells: [] };
  }, [selected, query.data]);

  const allPlansInCalendar = useMemo(() => {
    if (!query.data) return [];
    return query.data.groups.flatMap((group) =>
      group.rows.map((row) => ({
        id: row.plan.id,
        code: row.plan.code,
        name: row.plan.name,
        roomTypeId: group.roomType.id,
        roomTypeCode: group.roomType.code,
        roomTypeName: group.roomType.name,
        currency: row.plan.currency,
        baseRate: row.plan.baseRate,
        validFrom: row.plan.validFrom,
        validTo: row.plan.validTo,
        active: row.plan.active,
        categoryId: null,
        categoryCode: null,
        categoryName: null,
      })),
    );
  }, [query.data]);

  const selectedPlans = useMemo(
    () => allPlansInCalendar.filter((plan) => selectedPlanIds.includes(plan.id)),
    [allPlansInCalendar, selectedPlanIds],
  );
  const selectedRoomTypeCount = useMemo(
    () => new Set(selectedPlans.map((plan) => plan.roomTypeId)).size,
    [selectedPlans],
  );
  const expansion = useMemo(
    () =>
      expandBulkTargets({
        planIds: selectedPlanIds,
        fromDate: context.fromDate,
        toDate: context.toDate,
      }),
    [selectedPlanIds, context.fromDate, context.toDate],
  );
  const mixedSetRate = action === "SET_RATE" && uniquePlanCurrencies(selectedPlans).length > 1;
  const reviewRows = useMemo(
    () => joinPreviewInventory(preview?.items ?? [], buildInventoryLookup(query.data)),
    [preview, query.data],
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
      setBulkError(
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
      setBulkError(failMessage(err.message));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => applyFn({ data: requestPayload() }),
    onSuccess: (result) => {
      setBulkError(null);
      const handled = handleRevenueMutationResult(result);
      if (handled.submitted) {
        setSubmittedRequest(
          handled.approvalRequestId ? approvalRequestSearch(handled.approvalRequestId) : {},
        );
        setBulkSuccess(false);
        invalidateRevenueApprovals(queryClient, restaurantId);
        return;
      }
      setSubmittedRequest(null);
      setBulkSuccess(true);
      setAppliedCount("appliedCount" in result ? result.appliedCount : null);
      void queryClient.invalidateQueries({ queryKey: ["revenue-rate-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["revenue-control"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["bulk-rate-preview"] });
    },
    onError: (err: Error) => {
      setBulkError(failMessage(err.message));
      setBulkSuccess(false);
      if (isBulkStaleMessage(err.message)) setBulkStep(3);
    },
  });

  const approveImmediateMutation = useMutation({
    mutationFn: () => applyFn({ data: { ...requestPayload(), applyImmediately: true } }),
    onSuccess: (result) => {
      setBulkError(null);
      setSubmittedRequest(null);
      setBulkSuccess(true);
      setAppliedCount("appliedCount" in result ? result.appliedCount : null);
      void queryClient.invalidateQueries({ queryKey: ["revenue-rate-calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["revenue-control"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-change-history"] });
      void queryClient.invalidateQueries({ queryKey: ["bulk-rate-preview"] });
    },
    onError: (err: Error) => {
      setBulkError(failMessage(err.message));
      setBulkSuccess(false);
      if (isBulkStaleMessage(err.message)) setBulkStep(3);
    },
  });

  function resetBulkState() {
    setPreview(null);
    setBulkError(null);
    setBulkSuccess(false);
    setAppliedCount(null);
    setSubmittedRequest(null);
  }

  const pageCount = filteredCalendar
    ? Math.max(1, Math.ceil(filteredCalendar.groupCount / RATE_CALENDAR_GROUP_PAGE_SIZE))
    : 1;

  const calendarSearch = serializeRevenueSearch("rate-calendar", context);
  const historySearch = serializeRevenueSearch("rate-history", context);

  const scopeSummaryCard = (
    <div className="rounded-xl border border-[#DDD4C5] bg-white px-4 py-3 text-xs text-[#251605]">
      <p className="font-semibold uppercase tracking-wider text-[#8A641A]">Selected Scope</p>
      <p className="mt-1 text-sm font-semibold text-[#251605]">
        {context.fromDate === context.toDate
          ? `Specific Date: ${context.fromDate}`
          : `${context.fromDate} – ${context.toDate}`}
      </p>
      <p className="mt-0.5 text-xs text-[#5A4833]">
        {selectedRoomTypeCount} room type{selectedRoomTypeCount === 1 ? "" : "s"} ·{" "}
        {selectedPlanIds.length} rate plan{selectedPlanIds.length === 1 ? "" : "s"} ·{" "}
        {expansion.ok ? `${expansion.targetCount} selected rate cells` : "0 selected rate cells"}
      </p>
    </div>
  );

  let bulkDrawerBody = (
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
          resetBulkState();
        }}
      />
      {bulkError ? <p className="text-xs font-medium text-[#6B4A0A]">{bulkError}</p> : null}
    </div>
  );

  if (bulkStep === 3) {
    bulkDrawerBody = (
      <div className="space-y-4">
        {scopeSummaryCard}
        <BulkReviewPanel
          rows={reviewRows}
          summary={summary}
          loading={previewMutation.isPending}
          error={bulkError}
          money={money}
        />
      </div>
    );
  } else if (bulkStep === 4) {
    bulkDrawerBody = (
      <div className="space-y-4">
        {scopeSummaryCard}
        <BulkConfirmApply
          summary={summary}
          reason={reason.trim() || null}
          canEdit={access.canEditDailyRates}
          applying={applyMutation.isPending || approveImmediateMutation.isPending}
          error={bulkError}
          success={bulkSuccess}
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

  const bulkFooter =
    bulkSuccess || submittedRequest ? null : (
      <>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF6F0]"
          onClick={() => {
            setBulkDrawerOpen(false);
            setBulkStep(2);
            resetBulkState();
          }}
        >
          Cancel
        </button>
        {bulkStep > 2 ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#FAF6F0]"
            onClick={() => setBulkStep((current) => (current - 1) as BulkWizardStep)}
          >
            Back
          </button>
        ) : null}
        {bulkStep === 2 ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
            disabled={mixedSetRate || selectedPlans.length === 0}
            onClick={() => {
              const rule = buildBulkRule({ type: action, value, sourceDate });
              if ("ok" in rule && rule.ok === false) {
                setBulkError(rule.message);
                return;
              }
              setBulkError(null);
              setBulkStep(3);
              previewMutation.mutate();
            }}
          >
            Review Bulk Change
          </button>
        ) : null}
        {bulkStep === 3 ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] disabled:opacity-50"
            disabled={previewMutation.isPending || !preview}
            onClick={() => setBulkStep(4)}
          >
            Confirm
          </button>
        ) : null}
      </>
    );

  return (
    <div className="space-y-3">
      <RateCalendarToolbar
        context={context}
        businessDate={businessDate}
        rangeClamped={query.data?.rangeClamped === true}
        currency={query.data?.currency ?? ""}
        mixedCurrency={query.data?.mixedCurrency === true}
        canViewRates={access.canViewRates}
        selectedCount={selectedPlanIds.length}
        onRangeChange={onRangeChange}
        onBulkTrigger={() => {
          const nextPlanIds =
            selectedPlanIds.length > 0
              ? selectedPlanIds
              : allPlansInCalendar.map((plan) => plan.id);
          if (selectedPlanIds.length === 0 && nextPlanIds.length > 0) {
            setSelectedPlanIds(nextPlanIds);
          }
          setSelected(null);
          setSelectedRowPlanId(null);
          setBulkStep(2);
          setBulkDrawerOpen(true);
        }}
      />

      {selectedPlanIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C89933]/60 bg-[#FDF7EB] px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#251605]">
            <span className="uppercase tracking-wider text-[#8A641A]">Bulk Selection</span>
            <span>·</span>
            <span>
              {selectedRoomTypeCount} room type{selectedRoomTypeCount === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>
              {selectedPlanIds.length} rate plan{selectedPlanIds.length === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span className="text-[#8A641A]">
              {expansion.ok
                ? `${expansion.targetCount} cells (${context.fromDate} – ${context.toDate})`
                : expansion.code === "over_max"
                  ? `${expansion.targetCount} cells — ${BULK_RATE_CHANGE_OVER_MAX_COPY}`
                  : "Select a valid range"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedPlanIds([]);
                resetBulkState();
              }}
              className="inline-flex h-8 items-center rounded-lg border border-[#DED7CD] bg-white px-3 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
            >
              Clear Selection
            </button>
            <button
              type="button"
              disabled={!expansion.ok}
              onClick={() => {
                setSelected(null);
                setSelectedRowPlanId(null);
                setBulkStep(2);
                setBulkDrawerOpen(true);
              }}
              className="inline-flex h-8 items-center rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] shadow-sm hover:bg-[#B5882D] disabled:opacity-50"
            >
              Set Rate for Selected Scope ({selectedPlanIds.length})
            </button>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title={RATE_CALENDAR_LOAD_ERROR}
          description={revenueUiError(query.error, RATE_CALENDAR_LOAD_ERROR)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data && query.data.groups.length === 0 ? (
        <InventoryState
          state="empty"
          title="No rate plans are configured for this property."
          description="Configure room types and rate plans in Property Setup."
        />
      ) : filteredCalendar && filteredCalendar.groups.length === 0 ? (
        <InventoryState
          state="empty"
          title="No room types or rate plans match your search."
          description="Clear the search filter or try a different room type or rate plan name."
        />
      ) : paged ? (
        <div className="min-w-0 space-y-3">
          <RateCalendarLegend />
          <RateCalendarGrid
            data={paged}
            selected={selected}
            selectedRowPlanId={selectedRowPlanId}
            selectedPlanIds={selectedPlanIds}
            onTogglePlan={(planId) => {
              setSelectedPlanIds((current) =>
                current.includes(planId)
                  ? current.filter((id) => id !== planId)
                  : [...current, planId],
              );
              resetBulkState();
            }}
            onToggleRoomType={(_roomTypeId, planIdsInGroup) => {
              setSelectedPlanIds((current) => {
                const allChecked =
                  planIdsInGroup.length > 0 && planIdsInGroup.every((id) => current.includes(id));
                return allChecked
                  ? current.filter((id) => !planIdsInGroup.includes(id))
                  : Array.from(new Set([...current, ...planIdsInGroup]));
              });
              resetBulkState();
            }}
            onToggleAllPlans={(allPlanIds) => {
              setSelectedPlanIds((current) => {
                const allChecked =
                  allPlanIds.length > 0 && allPlanIds.every((id) => current.includes(id));
                return allChecked ? [] : allPlanIds;
              });
              resetBulkState();
            }}
            onSelect={(cell) => {
              setSelected(cell);
              setSelectedRowPlanId(null);
              setTab("overview");
            }}
            onSelectRow={(row) => {
              if (row.cells[0]) {
                setSelected(row.cells[0]);
                setSelectedRowPlanId(row.plan.id);
                setTab("edit");
              }
            }}
          />
          {pageCount > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-[#DDD4C5] bg-white px-4 py-2.5 text-xs font-medium text-[#5A4833] shadow-sm">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
              >
                Previous room types
              </button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => current + 1)}
                className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
              >
                Next room types
              </button>
            </div>
          ) : null}

          <RateDetailDrawer
            restaurantId={restaurantId}
            cell={selected}
            plan={selectedMeta.plan}
            roomType={selectedMeta.roomType}
            rowCells={selectedMeta.cells}
            editScope={selectedRowPlanId ? "row" : "single"}
            context={context}
            access={access}
            tab={tab}
            setTab={setTab}
            onClose={() => {
              setSelected(null);
              setSelectedRowPlanId(null);
            }}
            money={money}
          />

          <BulkRateChangePanel
            open={bulkDrawerOpen}
            step={bulkStep}
            subtitle={`${context.fromDate === context.toDate ? context.fromDate : `${context.fromDate} – ${context.toDate}`} · ${selectedPlanIds.length} rate plan${selectedPlanIds.length === 1 ? "" : "s"}`}
            progress={!bulkSuccess && !submittedRequest}
            body={bulkDrawerBody}
            footer={bulkFooter}
            onClose={() => setBulkDrawerOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
