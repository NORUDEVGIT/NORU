import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import {
  getCard8Golive,
  saveCard8Golive,
} from "@/packages/pms/lib/pms-property-setup-card8-golive.functions";
import { getCard8Validation } from "@/packages/pms/lib/pms-property-setup-card8-validation.functions";
import {
  CARD8_GOLIVE_PLAN_STATUSES,
  CARD8_GOLIVE_TASK_CATEGORIES,
  CARD8_GOLIVE_TASK_STATUS_LABELS,
  CARD8_GOLIVE_TASK_STATUSES,
  card8GoliveReadinessInput,
  card8GoliveReady,
  emptyCard8GolivePlan,
  emptyCard8GoliveTasks,
  type Card8GolivePlan,
  type Card8GoliveTask,
} from "@/packages/pms/lib/pms-property-setup-card8-golive";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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

const CATEGORY_LABELS = {
  property: "Property",
  commercial: "Commercial",
  operations: "Operations",
  connectivity: "Connectivity",
  security: "Security",
  data: "Data",
} as const;

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
    onError: (error: Error) => toast.error(error.message),
  });

  function updateTask(taskKey: string, patch: Partial<Card8GoliveTask>) {
    setTasks((rows) =>
      rows.map((task) => (task.taskKey === taskKey ? { ...task, ...patch } : task)),
    );
  }

  const opening = query.data?.snapshot.opening;
  const validation = validationQuery.data;

  return (
    <PmsPropertySetupCard8Workspace
      lifecycle={
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Property lifecycle
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Setup → Validation →{" "}
            <span className="font-medium text-[#251605]">Go-Live preparation</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Card 8 remains incomplete. Property Activation is not started.
          </p>
        </>
      }
      validation={
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <h3 className="font-display text-lg text-[#251605]">System Validation</h3>
          {validation ? (
            <>
              <p
                className={cn(
                  "mt-2 text-xl font-semibold",
                  validation.counts.critical === 0 ? "text-emerald-700" : "text-destructive",
                )}
              >
                {validation.counts.critical} critical · {validation.counts.warning} warnings
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Live read-only input. Warnings remain visible and do not block Go-Live.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Loading live validation…</p>
          )}
        </section>
      }
      checklist={
        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <h3 className="font-display text-lg text-[#251605]">Checklist</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {`${readinessInput.incompleteRequiredTasks} required ${
              readinessInput.incompleteRequiredTasks === 1 ? "task" : "tasks"
            } incomplete.`}
          </p>
        </section>
      }
      summary={
        <>
          <h3 className="font-display text-lg text-[#251605]">Readiness summary</h3>
          <p
            className={cn(
              "mt-2 text-xl font-semibold",
              ready ? "text-emerald-700" : "text-destructive",
            )}
            data-testid="pms-card8-golive-readiness"
          >
            {ready ? "READY" : "NOT READY"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            READY is preparation only. It does not activate the property.
          </p>
        </>
      }
      status={
        <p className="text-sm text-muted-foreground">
          Go-Live Plan: {plan.status} · overall readiness is evaluated separately
        </p>
      }
      actions={
        <div className="space-y-2">
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!editable || mutation.isPending || query.isLoading}
            data-testid="pms-card8-golive-save"
          >
            {mutation.isPending ? "Saving…" : "Save Go-Live Preparation"}
          </Button>
          {!editable ? (
            <p className="text-xs text-muted-foreground">
              Owner or manager access is required to save Go-Live preparation.
            </p>
          ) : query.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Save is unavailable while current governance state loads.
            </p>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        {query.error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {query.error.message}
          </p>
        ) : null}

        <section className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
          <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
            <div>
              <Label>Plan status</Label>
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
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD8_GOLIVE_PLAN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Ready is accepted only when the live readiness gate passes.
              </p>
            </div>
            <div>
              <Label htmlFor="golive-notes">Plan notes</Label>
              <Textarea
                id="golive-notes"
                className="mt-2"
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

        <section className="grid gap-4 md:grid-cols-3">
          <Confirmation
            title="Business date"
            value={query.data?.snapshot.businessDate ?? "Unavailable"}
            detail="Card 1 / Night Audit authority. Only this confirmation is stored."
            checked={plan.businessDateConfirmed}
            disabled={!editable || !query.data?.snapshot.businessDate}
            onChecked={(checked) =>
              setPlan((current) => ({ ...current, businessDateConfirmed: checked }))
            }
          />
          <Confirmation
            title="Opening state"
            value={
              opening
                ? `${opening.totalRooms} rooms · ${opening.occupied} occupied · ${opening.available} available`
                : "Loading…"
            }
            detail={
              opening
                ? `${opening.dirty} dirty · ${opening.outOfOrder} OOO · ${opening.outOfService} OOS`
                : "Live room snapshot"
            }
            checked={plan.openingStateConfirmed}
            disabled={!editable || !opening}
            onChecked={(checked) =>
              setPlan((current) => ({ ...current, openingStateConfirmed: checked }))
            }
          />
          <Confirmation
            title="Future reservations"
            value={`${query.data?.snapshot.futureReservations ?? 0} upcoming`}
            detail="Live pending/confirmed arrivals after the business date."
            checked={plan.futureReservationsConfirmed}
            disabled={!editable || !query.data}
            onChecked={(checked) =>
              setPlan((current) => ({ ...current, futureReservationsConfirmed: checked }))
            }
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Limitation
            title="Sandbox: UNAVAILABLE"
            detail="No property sandbox or test isolation exists. This acknowledges the limitation only."
            checked={plan.sandboxAcknowledgement}
            disabled={!editable}
            onChecked={(checked) =>
              setPlan((current) => ({ ...current, sandboxAcknowledgement: checked }))
            }
          />
          <Limitation
            title="Cutover lock: UNSUPPORTED / DEFERRED"
            detail="No enforced configuration lock exists. This is not a working lock control."
            checked={plan.cutoverLockAcknowledgement}
            disabled={!editable}
            onChecked={(checked) =>
              setPlan((current) => ({ ...current, cutoverLockAcknowledgement: checked }))
            }
          />
        </section>

        <div className="space-y-4">
          {CARD8_GOLIVE_TASK_CATEGORIES.map((category) => (
            <section key={category} className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
              <h3 className="font-display text-lg text-[#251605]">{CATEGORY_LABELS[category]}</h3>
              <div className="mt-4 space-y-4">
                {tasks
                  .filter((task) => task.category === category)
                  .map((task) => (
                    <div
                      key={task.taskKey}
                      className="grid gap-3 rounded-xl border border-[#F0E8D8] p-4 lg:grid-cols-[1fr_11rem_14rem_14rem]"
                    >
                      <div>
                        <p className="font-medium text-[#251605]">{task.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {task.required ? "Required" : "Optional"} · explicit status only
                        </p>
                      </div>
                      <TaskSelect
                        label="Status"
                        value={task.status}
                        disabled={!editable}
                        options={CARD8_GOLIVE_TASK_STATUSES.map((status) => ({
                          value: status,
                          label: CARD8_GOLIVE_TASK_STATUS_LABELS[status],
                        }))}
                        onValue={(status) =>
                          updateTask(task.taskKey, {
                            status: status as Card8GoliveTask["status"],
                          })
                        }
                      />
                      <TaskSelect
                        label="Department owner"
                        value={task.ownerDepartmentId ?? "unassigned"}
                        disabled={!editable}
                        options={[
                          { value: "unassigned", label: "Unassigned" },
                          ...(query.data?.snapshot.departments ?? []).map((item) => ({
                            value: item.id,
                            label: item.label,
                          })),
                        ]}
                        onValue={(value) =>
                          updateTask(task.taskKey, {
                            ownerDepartmentId: value === "unassigned" ? null : value,
                          })
                        }
                      />
                      <TaskSelect
                        label="Team owner"
                        value={task.ownerUserId ?? "unassigned"}
                        disabled={!editable}
                        options={[
                          { value: "unassigned", label: "Unassigned" },
                          ...(query.data?.snapshot.users ?? []).map((item) => ({
                            value: item.id,
                            label: item.label,
                          })),
                        ]}
                        onValue={(value) =>
                          updateTask(task.taskKey, {
                            ownerUserId: value === "unassigned" ? null : value,
                          })
                        }
                      />
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PmsPropertySetupCard8Workspace>
  );
}

function Confirmation({
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
    <article className="rounded-2xl border border-[#E6DCC8] bg-card p-5">
      <h3 className="font-display text-lg text-[#251605]">{title}</h3>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChecked(value === true)}
        />
        Confirm reviewed
      </label>
    </article>
  );
}

function Limitation({
  title,
  detail,
  checked,
  disabled,
  onChecked,
}: {
  title: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <article className="rounded-2xl border border-[#C89933]/50 bg-[#FFF8E7] p-5">
      <h3 className="font-display text-lg text-[#251605]">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChecked(value === true)}
        />
        I acknowledge this limitation
      </label>
    </article>
  );
}

function TaskSelect({
  label,
  value,
  disabled,
  options,
  onValue,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onValue: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={onValue}>
        <SelectTrigger className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
