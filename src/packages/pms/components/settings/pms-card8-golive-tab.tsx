import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import {
  getCard8Golive,
  initializeCard8BusinessDate,
  saveCard8Golive,
} from "@/packages/pms/lib/pms-property-setup-card8-golive.functions";
import { getCard8Validation } from "@/packages/pms/lib/pms-property-setup-card8-validation.functions";
import { BUSINESS_DATE_CONFIRM_WORD } from "@/packages/pms/lib/business-date-recovery";
import {
  CARD8_GOLIVE_DATE_INIT_COPY,
  CARD8_GOLIVE_PLAN_STATUSES,
  CARD8_GOLIVE_TASK_STATUS_LABELS,
  CARD8_GOLIVE_TASK_STATUSES,
  card8GoliveReadinessInput,
  card8GoliveReady,
  emptyCard8GolivePlan,
  emptyCard8GoliveTasks,
  type Card8GolivePlan,
  type Card8GoliveTask,
  type Card8GoliveTaskStatus,
} from "@/packages/pms/lib/pms-property-setup-card8-golive";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { friendlySetupError } from "@/packages/pms/lib/setup-form-errors";

const CATEGORY_LABELS = {
  property: "Property",
  commercial: "Commercial",
  operations: "Operations",
  connectivity: "Connectivity",
  security: "Security",
  data: "Data",
} as const;

const PLAN_STATUS_LABELS = {
  draft: "Draft",
  preparing: "Preparing",
  ready: "Ready",
} as const;

const controlClass =
  "h-9 rounded-md border-[#D6CDBF] bg-white text-sm text-[#251605] shadow-none";

function formatBusinessDate(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function taskRowQuiet(status: Card8GoliveTaskStatus) {
  return status === "complete" || status === "not_applicable";
}

export function Card8GoliveTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard8Golive);
  const save = useServerFn(saveCard8Golive);
  const initializeBusinessDate = useServerFn(initializeCard8BusinessDate);
  const loadValidation = useServerFn(getCard8Validation);
  const query = useQuery({
    queryKey: ["pms-card8-golive", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const validationQuery = useQuery({
    queryKey: ["pms-card8-validation", restaurantId],
    queryFn: () => loadValidation({ data: { restaurantId } }),
  });
  const [plan, setPlan] = useState<Card8GolivePlan>(emptyCard8GolivePlan());
  const [tasks, setTasks] = useState<Card8GoliveTask[]>(emptyCard8GoliveTasks());
  const [initAcknowledged, setInitAcknowledged] = useState(false);
  const [initConfirmation, setInitConfirmation] = useState("");

  useEffect(() => {
    if (!query.data?.snapshot) return;
    setPlan(query.data.snapshot.plan);
    setTasks(query.data.snapshot.tasks);
  }, [query.data]);

  const validationCritical = validationQuery.data?.counts.critical ?? 1;
  const readinessInput = card8GoliveReadinessInput(plan, tasks, validationCritical);
  const ready = card8GoliveReady(readinessInput);
  const editable = canEdit && query.data?.snapshot.canEdit === true;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          status: plan.status,
          businessDateConfirmed: plan.businessDateConfirmed,
          openingStateConfirmed: plan.openingStateConfirmed,
          futureReservationsConfirmed: plan.futureReservationsConfirmed,
          sandboxAcknowledgement: plan.sandboxAcknowledgement,
          cutoverLockAcknowledgement: plan.cutoverLockAcknowledgement,
          notes: plan.notes,
          tasks: tasks.map((task) => ({
            taskKey: task.taskKey,
            required: task.required,
            ownerDepartmentId: task.ownerDepartmentId,
            ownerUserId: task.ownerUserId,
            status: task.status,
            notes: task.notes,
          })),
        },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["pms-card8-golive", restaurantId], result);
      setPlan(result.snapshot.plan);
      setTasks(result.snapshot.tasks);
      void queryClient.invalidateQueries({
        queryKey: ["pms-card8-validation", restaurantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pms-card8-readiness", restaurantId],
      });
      void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
      toast.success("Go-Live preparation saved.");
    },
    onError: (error: Error) => toast.error(friendlySetupError(error)),
  });

  const initMutation = useMutation({
    mutationFn: () =>
      initializeBusinessDate({
        data: {
          restaurantId,
          confirmed: true as const,
          confirmation: BUSINESS_DATE_CONFIRM_WORD,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        if (result.snapshot) {
          queryClient.setQueryData(["pms-card8-golive", restaurantId], { snapshot: result.snapshot });
          setPlan(result.snapshot.plan);
          setTasks(result.snapshot.tasks);
        }
        return;
      }
      queryClient.setQueryData(["pms-card8-golive", restaurantId], { snapshot: result.snapshot });
      setPlan(result.snapshot.plan);
      setTasks(result.snapshot.tasks);
      setInitAcknowledged(false);
      setInitConfirmation("");
      void queryClient.invalidateQueries({ queryKey: ["pms-card8-golive", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card8-readiness", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
      toast.success(
        result.alreadyInitialized
          ? `Business date already set to ${result.businessDate}.`
          : `Business date initialized to ${result.businessDate}.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateTask(taskKey: string, patch: Partial<Card8GoliveTask>) {
    setTasks((rows) =>
      rows.map((task) => (task.taskKey === taskKey ? { ...task, ...patch } : task)),
    );
  }

  const snapshot = query.data?.snapshot;
  const opening = snapshot?.opening;
  const validation = validationQuery.data;
  const needsBusinessDateInit = Boolean(snapshot && !snapshot.businessDate);
  const canInitialize =
    editable &&
    needsBusinessDateInit &&
    Boolean(snapshot?.proposedBusinessDate) &&
    !snapshot?.businessDateInitBlockedReason &&
    initAcknowledged &&
    initConfirmation.trim() === BUSINESS_DATE_CONFIRM_WORD;

  const requiredTasks = tasks.filter((task) => task.required);
  const requiredComplete =
    requiredTasks.length - readinessInput.incompleteRequiredTasks;
  const criticalCount = validation?.counts.critical;
  const warningCount = validation?.counts.warning;
  const readinessTone = ready
    ? "ready"
    : (criticalCount ?? validationCritical) > 0
      ? "blocked"
      : "preparing";

  return (
    <PmsPropertySetupCard8Workspace
      fullWidth
      lifecycle={
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
            Property lifecycle
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6B6458]">
            <span>Setup</span>
            <span aria-hidden="true">→</span>
            <span>Validation</span>
            <span aria-hidden="true">→</span>
            <span className="border-b border-[#C89933] pb-px font-medium text-[#251605]">
              Go-Live preparation
            </span>
            <span aria-hidden="true">→</span>
            <span>Live</span>
          </div>
          <p className="mt-1.5 text-[11px] text-[#6B6458]">
            Go-Live preparation is incomplete. Property Activation is not started.
          </p>
        </>
      }
      status={
        <p className="text-sm text-[#5C5346]">
          Go-Live Plan: {PLAN_STATUS_LABELS[plan.status]}
        </p>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="bg-[#C89933] font-medium text-[#251605] shadow-none hover:bg-[#C89933]/90"
            onClick={() => mutation.mutate()}
            disabled={!editable || mutation.isPending || query.isLoading}
            data-testid="pms-card8-golive-save"
          >
            {mutation.isPending ? "Saving…" : "Save Go-Live Preparation"}
          </Button>
          {!editable ? (
            <p className="text-xs text-[#6B6458]">
              Owner or manager access is required to save Go-Live preparation.
            </p>
          ) : query.isLoading ? (
            <p className="text-xs text-[#6B6458]">
              Save is unavailable while current preparation state loads.
            </p>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        {query.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {query.error.message}
          </p>
        ) : null}

        <section
          className="flex overflow-hidden rounded-md border border-[#E6E1D8] bg-white"
          data-testid="pms-card8-golive-readiness"
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-1 shrink-0",
              readinessTone === "ready" && "bg-emerald-700",
              readinessTone === "blocked" && "bg-red-700",
              readinessTone === "preparing" && "bg-[#C89933]",
            )}
          />
          <div className="min-w-0 flex-1 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#251605]">Go-Live Readiness</h3>
                <p
                  className={cn(
                    "mt-1 text-lg font-semibold",
                    readinessTone === "ready" && "text-emerald-800",
                    readinessTone === "blocked" && "text-red-800",
                    readinessTone === "preparing" && "text-[#9A6A12]",
                  )}
                >
                  {ready ? "READY" : "NOT READY"}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6B6458]">
                  Preparation only. Saving does not activate the property.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Plan status
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">
                    {PLAN_STATUS_LABELS[plan.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Business date
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">
                    {formatBusinessDate(snapshot?.businessDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    Required tasks
                  </dt>
                  <dd className="mt-0.5 font-medium text-[#251605]">
                    {requiredComplete}/{requiredTasks.length} complete
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                    System Validation
                  </dt>
                  <dd
                    className={cn(
                      "mt-0.5 font-medium",
                      criticalCount == null
                        ? "text-[#6B6458]"
                        : criticalCount > 0
                          ? "text-red-800"
                          : "text-emerald-800",
                    )}
                  >
                    {criticalCount == null || warningCount == null
                      ? "Loading…"
                      : `${criticalCount} critical · ${warningCount} warnings`}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-[#E6E1D8] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#251605]">Go-Live Plan</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <Label htmlFor="golive-plan-status" className="text-[11px] uppercase tracking-wide text-[#6B6458]">
                Plan status
              </Label>
              <Select
                value={plan.status}
                disabled={!editable}
                onValueChange={(value) =>
                  setPlan((current) => ({
                    ...current,
                    status: value as Card8GolivePlan["status"],
                  }))
                }
              >
                <SelectTrigger id="golive-plan-status" className={cn("mt-1.5", controlClass)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD8_GOLIVE_PLAN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {PLAN_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[11px] text-[#6B6458]">
                Ready is accepted only when the live readiness gate passes.
              </p>
            </div>
            <div>
              <Label htmlFor="golive-notes" className="text-[11px] uppercase tracking-wide text-[#6B6458]">
                Plan notes
              </Label>
              <Textarea
                id="golive-notes"
                className="mt-1.5 min-h-[4.5rem] rounded-md border-[#D6CDBF] bg-white text-sm shadow-none"
                value={plan.notes}
                disabled={!editable}
                maxLength={2000}
                onChange={(event) =>
                  setPlan((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
          </div>
        </section>

        {needsBusinessDateInit ? (
          <section
            className="rounded-md border border-[#E6D3A8] bg-[#FFF8E7] p-4"
            data-testid="pms-card8-golive-business-date-init"
          >
            <h3 className="text-sm font-semibold text-[#251605]">Initialize Business Date</h3>
            <p className="mt-1.5 text-sm text-[#5C5346]">{CARD8_GOLIVE_DATE_INIT_COPY}</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                  Proposed live date
                </dt>
                <dd className="mt-1 text-base font-semibold text-[#251605]">
                  {formatBusinessDate(snapshot?.proposedBusinessDate)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                  Property timezone
                </dt>
                <dd className="mt-1 font-medium text-[#251605]">{snapshot?.timezone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                  Opening date
                </dt>
                <dd className="mt-1 font-medium text-[#251605]">
                  {snapshot?.openingDate ? formatBusinessDate(snapshot.openingDate) : "Not set"}
                </dd>
              </div>
            </dl>
            {snapshot?.businessDateInitBlockedReason ? (
              <p className="mt-3 text-sm text-red-800">{snapshot.businessDateInitBlockedReason}</p>
            ) : (
              <>
                <p className="mt-3 text-sm text-[#5C5346]">
                  This becomes the live operating business date. Night Audit will own every later
                  roll. Property Activation stays a separate step.
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm text-[#251605]">
                  <Checkbox
                    checked={initAcknowledged}
                    disabled={!editable || initMutation.isPending}
                    onCheckedChange={(value) => setInitAcknowledged(value === true)}
                    data-testid="pms-card8-golive-business-date-ack"
                  />
                  <span>
                    I confirm {snapshot?.proposedBusinessDate} in {snapshot?.timezone} should become
                    the live business date.
                  </span>
                </label>
                <div className="mt-3 max-w-xs">
                  <Label htmlFor="golive-bd-confirm" className="text-[11px] uppercase tracking-wide text-[#6B6458]">
                    Type {BUSINESS_DATE_CONFIRM_WORD} to continue
                  </Label>
                  <Input
                    id="golive-bd-confirm"
                    className={cn("mt-1.5", controlClass)}
                    value={initConfirmation}
                    disabled={!editable || initMutation.isPending}
                    onChange={(event) => setInitConfirmation(event.target.value)}
                    autoComplete="off"
                    data-testid="pms-card8-golive-business-date-confirm"
                  />
                </div>
                <Button
                  type="button"
                  className="mt-3 bg-[#C89933] font-medium text-[#251605] shadow-none hover:bg-[#C89933]/90"
                  disabled={!canInitialize || initMutation.isPending}
                  onClick={() => initMutation.mutate()}
                  data-testid="pms-card8-golive-business-date-init-action"
                >
                  {initMutation.isPending ? "Initializing…" : "Initialize Business Date"}
                </Button>
              </>
            )}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[#251605]">Operational Readiness</h3>
          <div className="grid gap-2 md:grid-cols-3">
            <ConfirmationTile
              title="Business date"
              value={formatBusinessDate(snapshot?.businessDate)}
              detail="Night Audit business date"
              checked={plan.businessDateConfirmed}
              disabled={!editable || !snapshot?.businessDate}
              onChecked={(checked) =>
                setPlan((current) => ({ ...current, businessDateConfirmed: checked }))
              }
            />
            <ConfirmationTile
              title="Opening state"
              value={
                opening
                  ? `${opening.totalRooms} rooms · ${opening.occupied} occupied · ${opening.available} available`
                  : "Loading…"
              }
              detail={
                opening
                  ? `${opening.dirty} Dirty · ${opening.outOfOrder} OOO · ${opening.outOfService} OOS`
                  : "Live room snapshot"
              }
              checked={plan.openingStateConfirmed}
              disabled={!editable || !opening}
              onChecked={(checked) =>
                setPlan((current) => ({ ...current, openingStateConfirmed: checked }))
              }
            />
            <ConfirmationTile
              title="Future reservations"
              value={`${query.data?.snapshot.futureReservations ?? 0} upcoming`}
              detail="Confirmed arrivals after business date"
              checked={plan.futureReservationsConfirmed}
              disabled={!editable || !query.data}
              onChecked={(checked) =>
                setPlan((current) => ({ ...current, futureReservationsConfirmed: checked }))
              }
            />
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-[#251605]">Platform Limitations</h3>
            <p className="mt-0.5 text-[11px] text-[#6B6458]">
              Acknowledgements only. These are not operational controls.
            </p>
          </div>
          <div className="overflow-hidden rounded-md border border-[#E6E1D8] bg-white">
            <LimitationRow
              title="Sandbox unavailable"
              status="UNAVAILABLE"
              detail="Offline operation is not currently available. No property sandbox or test isolation exists."
              checked={plan.sandboxAcknowledgement}
              disabled={!editable}
              onChecked={(checked) =>
                setPlan((current) => ({ ...current, sandboxAcknowledgement: checked }))
              }
            />
            <LimitationRow
              title="Cutover lock unsupported / deferred"
              status="UNSUPPORTED / DEFERRED"
              detail="No enforced configuration freeze exists. Acknowledge this before marking preparation ready."
              checked={plan.cutoverLockAcknowledgement}
              disabled={!editable}
              onChecked={(checked) =>
                setPlan((current) => ({ ...current, cutoverLockAcknowledgement: checked }))
              }
            />
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-[#251605]">Go-Live Checklist</h3>
            <p className="mt-0.5 text-[11px] text-[#6B6458]">
              Confirm each area before Go-Live. Status is saved explicitly and never inferred.
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-[#E6E1D8] bg-white">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-[#E6E1D8] bg-[#FBF8F2] text-[11px] font-medium uppercase tracking-wide text-[#6B6458]">
                <tr>
                  <th className="px-3 py-2 font-medium">Area</th>
                  <th className="px-3 py-2 font-medium">Confirmation</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const quiet = taskRowQuiet(task.status);
                  return (
                    <tr
                      key={task.taskKey}
                      className={cn(
                        "border-b border-[#F0EBE3] last:border-0",
                        quiet ? "bg-white" : "bg-[#FFFBF2]",
                      )}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-start gap-2">
                          {quiet ? (
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-emerald-100 text-emerald-800">
                              <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                            </span>
                          ) : (
                            <span
                              aria-hidden="true"
                              className="mt-1 size-2 shrink-0 rounded-full bg-[#C89933]"
                            />
                          )}
                          <div>
                            <div
                              className={cn(
                                "font-medium",
                                quiet ? "text-[#5C5346]" : "text-[#251605]",
                              )}
                            >
                              {CATEGORY_LABELS[task.category]}
                            </div>
                            {task.required ? (
                              <div className="text-[11px] text-[#8A8175]">Required</div>
                            ) : (
                              <div className="text-[11px] text-[#8A8175]">Optional</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 align-top",
                          quiet ? "text-[#5C5346]" : "text-[#251605]",
                        )}
                      >
                        {task.title}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Select
                          value={task.status}
                          disabled={!editable}
                          onValueChange={(status) =>
                            updateTask(task.taskKey, {
                              status: status as Card8GoliveTask["status"],
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={`${CATEGORY_LABELS[task.category]} status`}
                            className={cn(
                              "h-8 w-[9.5rem]",
                              controlClass,
                              quiet && "border-emerald-200 bg-emerald-50 text-emerald-800",
                              !quiet && "border-[#E6D3A8] bg-[#FFF8E7] text-[#9A6A12]",
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CARD8_GOLIVE_TASK_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {CARD8_GOLIVE_TASK_STATUS_LABELS[status]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row">
                          <Select
                            value={task.ownerDepartmentId ?? "unassigned"}
                            disabled={!editable}
                            onValueChange={(value) =>
                              updateTask(task.taskKey, {
                                ownerDepartmentId: value === "unassigned" ? null : value,
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`${CATEGORY_LABELS[task.category]} department owner`}
                              className={cn("h-8 w-full min-w-[8.5rem] sm:w-[9.5rem]", controlClass)}
                            >
                              <SelectValue placeholder="Department" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {(query.data?.snapshot.departments ?? []).map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={task.ownerUserId ?? "unassigned"}
                            disabled={!editable}
                            onValueChange={(value) =>
                              updateTask(task.taskKey, {
                                ownerUserId: value === "unassigned" ? null : value,
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`${CATEGORY_LABELS[task.category]} team owner`}
                              className={cn("h-8 w-full min-w-[8.5rem] sm:w-[9.5rem]", controlClass)}
                            >
                              <SelectValue placeholder="Team owner" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {(query.data?.snapshot.users ?? []).map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PmsPropertySetupCard8Workspace>
  );
}

function ConfirmationTile({
  title,
  value,
  detail,
  checked,
  disabled,
  onChecked,
}: {
  title: string;
  value: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-md border bg-white p-3",
        checked ? "border-emerald-200" : "border-[#E6E1D8]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#6B6458]">{title}</h4>
        {checked ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
            <Check className="size-3" strokeWidth={3} aria-hidden="true" />
            Confirmed
          </span>
        ) : (
          <span className="text-[11px] font-medium text-[#9A6A12]">Pending</span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug text-[#251605]">{value}</p>
      <p className="mt-1 text-[11px] text-[#6B6458]">{detail}</p>
      <label className="mt-3 flex items-center gap-2 text-xs text-[#251605]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChecked(value === true)}
        />
        Confirmed
      </label>
    </article>
  );
}

function LimitationRow({
  title,
  status,
  detail,
  checked,
  disabled,
  onChecked,
}: {
  title: string;
  status: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[#F0EBE3] px-3 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[#251605]">{title}</p>
          <span className="inline-flex items-center border border-[#E6D3A8] bg-[#FFF8E7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9A6A12]">
            {status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[#6B6458]">{detail}</p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-xs text-[#251605]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChecked(value === true)}
        />
        Acknowledged
      </label>
    </div>
  );
}
