import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
  evaluatePmsCard2HousekeepingReadiness,
  getPmsCard2Housekeeping,
  savePmsCard2CustomStatus,
  savePmsCard2Housekeeping,
} from "@/packages/pms/lib/housekeeping-card2.functions";
import {
  HOUSEKEEPING_OPERATIONAL_STATUSES,
  HOUSEKEEPING_OVERRIDE_PERMISSIONS,
  HOUSEKEEPING_PRIORITY_CODES,
  HOUSEKEEPING_RELEASE_RULES,
  priorityEventLabel,
  transitionEventLabel,
  type HousekeepingCard2Priority,
  type HousekeepingCard2Settings,
  type HousekeepingCard2Snapshot,
  type HousekeepingCard2Transition,
  type HousekeepingOperationalStatus,
  type HousekeepingOverridePermission,
  type HousekeepingPriorityCode,
  type HousekeepingReleaseRule,
} from "@/packages/pms/lib/housekeeping-card2.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

type StepActions = { saveDraft: () => Promise<boolean>; saveAndContinue: () => Promise<boolean> };

function RuleToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[#E5DED1] px-3 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}

function SectionCard({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mb-32 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C89933]/15 text-sm font-semibold text-[#7A5511]">
          {number}
        </span>
        <div>
          <h2 className="font-display text-xl text-[#251605]">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  disabled,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id}>
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

export function PmsPropertySetupCard2Housekeeping({
  restaurantId,
  canEdit,
  onReadiness,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[], warnings: string[]) => void;
  registerActions: (actions: StepActions) => void;
}) {
  const queryClient = useQueryClient();
  const getHousekeeping = useServerFn(getPmsCard2Housekeeping);
  const saveHousekeeping = useServerFn(savePmsCard2Housekeeping);
  const evaluateReadiness = useServerFn(evaluatePmsCard2HousekeepingReadiness);
  const saveCustomStatus = useServerFn(savePmsCard2CustomStatus);
  const [draft, setDraft] = useState<HousekeepingCard2Snapshot | null>(null);
  const [custom, setCustom] = useState({ id: "", code: "", name: "" });

  const query = useQuery({
    queryKey: ["pms-card2-housekeeping", restaurantId],
    queryFn: () => getHousekeeping({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft(query.data.snapshot);
    onReadiness(
      query.data.readiness.stepStatus,
      query.data.readiness.blockers,
      query.data.readiness.warnings,
    );
  }, [query.data, onReadiness]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Housekeeping settings are still loading.");
      return saveHousekeeping({
        data: {
          restaurantId,
          settings: {
            enabled: draft.settings.enabled,
            defaultStatus: draft.settings.defaultStatus,
            cleanRequired: draft.settings.cleanRequired,
            inspectionRequired: draft.settings.inspectionRequired,
            maintenanceClearRequired: draft.settings.maintenanceClearRequired,
            roomReleaseRule: draft.settings.roomReleaseRule,
            supervisorApprovalRequired: draft.settings.supervisorApprovalRequired,
            automaticStatusChangeEnabled: draft.settings.automaticStatusChangeEnabled,
            manualStatusChangeAllowed: draft.settings.manualStatusChangeAllowed,
            assignmentOverrideAllowed: draft.settings.assignmentOverrideAllowed,
            overridePermission: draft.settings.overridePermission,
            overrideReasonRequired: draft.settings.overrideReasonRequired,
          },
          transitions: draft.transitions.map(({ event, fromStatus, toStatus, enabled, approvalRequired }) => ({
            event,
            fromStatus,
            toStatus,
            enabled,
            approvalRequired,
          })),
          priorities: draft.priorities.map(({ event, priority, enabled, rank }) => ({
            event,
            priority,
            enabled,
            rank,
          })),
        },
      });
    },
    onSuccess: (result) => {
      setDraft(result.snapshot);
      onReadiness(result.readiness.stepStatus, result.readiness.blockers, result.readiness.warnings);
      void queryClient.invalidateQueries({ queryKey: ["pms-card2-housekeeping", restaurantId] });
    },
  });

  const customMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveCustomStatus({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      setDraft(result.snapshot);
      setCustom({ id: "", code: "", name: "" });
      onReadiness(result.readiness.stepStatus, result.readiness.blockers, result.readiness.warnings);
      toast.success("Custom status saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function saveDraft(): Promise<boolean> {
    if (!canEdit || !draft) return false;
    try {
      await saveMutation.mutateAsync();
      toast.success("Housekeeping draft saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Housekeeping.");
      return false;
    }
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;
    const readiness = await evaluateReadiness({ data: { restaurantId } });
    onReadiness(readiness.stepStatus, readiness.blockers, readiness.warnings);
    if (!readiness.ready) {
      toast.error(readiness.blockers[0] ?? "Housekeeping setup needs attention.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  if (query.isError) {
    return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  }
  if (query.isLoading || !draft) {
    return <p className="text-sm text-muted-foreground">Loading Housekeeping setup…</p>;
  }

  const disabled = !canEdit || saveMutation.isPending;
  const activeStatuses = draft.statuses.filter((status) => status.active);
  const operationalStatuses = activeStatuses.filter(
    (status) => status.operational && status.domain === "housekeeping",
  );
  const statusOptions = activeStatuses.map((status) => ({
    value: status.code,
    label: `${status.name} · ${status.domain}`,
  }));

  function updateSettings(patch: Partial<HousekeepingCard2Settings>) {
    setDraft((current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current,
    );
  }

  function updateTransition(event: HousekeepingCard2Transition["event"], patch: Partial<HousekeepingCard2Transition>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            transitions: current.transitions.map((rule) => (rule.event === event ? { ...rule, ...patch } : rule)),
          }
        : current,
    );
  }

  function updatePriority(event: HousekeepingCard2Priority["event"], patch: Partial<HousekeepingCard2Priority>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            priorities: current.priorities.map((rule) => (rule.event === event ? { ...rule, ...patch } : rule)),
          }
        : current,
    );
  }

  return (
    <div className="space-y-5" data-testid="pms-card2-housekeeping-form">
      <SectionCard
        number={1}
        title="Housekeeping Settings & Availability"
        description="Configure property rules. Daily room work remains in the Housekeeping module."
      >
        <RuleToggle
          id="hk-enabled"
          label="Enable Housekeeping Management"
          checked={draft.settings.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => updateSettings({ enabled })}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            id="hk-default-status"
            label="Default Housekeeping Status"
            value={draft.settings.defaultStatus}
            disabled={disabled}
            options={operationalStatuses.map((status) => ({ value: status.code, label: status.name }))}
            onValueChange={(defaultStatus) =>
              updateSettings({ defaultStatus: defaultStatus as HousekeepingOperationalStatus })
            }
          />
          <SelectField
            id="hk-release-rule"
            label="Room Release Rule"
            value={draft.settings.roomReleaseRule}
            disabled={disabled}
            options={HOUSEKEEPING_RELEASE_RULES.map((rule) => ({
              value: rule,
              label: rule.replaceAll("_", " "),
            }))}
            onValueChange={(roomReleaseRule) =>
              updateSettings({ roomReleaseRule: roomReleaseRule as HousekeepingReleaseRule })
            }
          />
        </div>
        <RuleToggle
          id="hk-auto-status"
          label="Automatic Status Change Enabled"
          checked={draft.settings.automaticStatusChangeEnabled}
          disabled={disabled}
          onCheckedChange={(automaticStatusChangeEnabled) => updateSettings({ automaticStatusChangeEnabled })}
        />
        <RuleToggle
          id="hk-manual-status"
          label="Manual Status Change Allowed"
          checked={draft.settings.manualStatusChangeAllowed}
          disabled={disabled}
          onCheckedChange={(manualStatusChangeAllowed) => updateSettings({ manualStatusChangeAllowed })}
        />
        {draft.settings.inspectionRequired ? (
          <RuleToggle
            id="hk-supervisor-approval"
            label="Supervisor Approval Required"
            checked={draft.settings.supervisorApprovalRequired}
            disabled={disabled}
            onCheckedChange={(supervisorApprovalRequired) => updateSettings({ supervisorApprovalRequired })}
          />
        ) : null}
      </SectionCard>

      <SectionCard
        number={2}
        title="Housekeeping Status Catalog"
        description="Core states retain their system meaning. Custom statuses are property labels and cannot replace operational room state."
      >
        <div className="space-y-2">
          {draft.statuses.map((status) => (
            <div
              key={status.id}
              className="grid gap-2 rounded-xl border border-[#E5DED1] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div>
                <p className="font-medium text-[#251605]">{status.name}</p>
                <p className="text-xs text-muted-foreground">
                  {status.code} · {status.domain} · {status.isCore ? "System/Core" : "Custom"}
                  {!status.active ? " · Inactive" : ""}
                </p>
              </div>
              {!status.isCore && canEdit ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCustom({ id: status.id, code: status.code, name: status.name })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      customMutation.mutate({
                        id: status.id,
                        code: status.code,
                        name: status.name,
                        active: !status.active,
                      })
                    }
                  >
                    {status.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="rounded-xl border border-dashed border-[#C89933]/60 bg-[#C89933]/5 p-3">
            <p className="mb-3 text-sm font-medium text-[#251605]">
              {custom.id ? "Edit custom status" : "Add custom status"}
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label="Custom status code"
                placeholder="status_code"
                value={custom.code}
                disabled={Boolean(custom.id)}
                onChange={(event) => setCustom({ ...custom, code: event.target.value })}
              />
              <Input
                aria-label="Custom status name"
                placeholder="Status name"
                value={custom.name}
                onChange={(event) => setCustom({ ...custom, name: event.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!custom.code.trim() || !custom.name.trim() || customMutation.isPending}
                onClick={() =>
                  customMutation.mutate({
                    ...(custom.id ? { id: custom.id } : {}),
                    code: custom.code.trim(),
                    name: custom.name.trim(),
                    active: true,
                  })
                }
              >
                <Plus className="mr-1 size-4" /> {custom.id ? "Save" : "Add Status"}
              </Button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        number={3}
        title="Automatic Status Transitions"
        description="These rules configure operational events; they do not execute housekeeping work from Settings."
      >
        {draft.transitions.map((rule) => (
          <div key={rule.event} className="rounded-xl border border-[#E5DED1] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-[#251605]">{transitionEventLabel(rule.event)}</p>
              <Switch
                checked={rule.enabled}
                disabled={disabled || rule.event === "guest_check_in"}
                onCheckedChange={(enabled) => updateTransition(rule.event, { enabled })}
                aria-label={`${transitionEventLabel(rule.event)} enabled`}
              />
            </div>
            {rule.event === "guest_check_in" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Occupancy is reservation-derived, so this core transition remains enabled.
              </p>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SelectField
                id={`hk-${rule.event}-from`}
                label="From Status"
                value={rule.fromStatus}
                options={statusOptions}
                disabled={disabled}
                onValueChange={(fromStatus) => updateTransition(rule.event, { fromStatus })}
              />
              <SelectField
                id={`hk-${rule.event}-to`}
                label="To Status"
                value={rule.toStatus}
                options={statusOptions}
                disabled={disabled || rule.event === "guest_check_in"}
                onValueChange={(toStatus) => updateTransition(rule.event, { toStatus })}
              />
            </div>
            {draft.settings.inspectionRequired && rule.event === "inspection_complete" ? (
              <RuleToggle
                id="hk-transition-inspection-approval"
                label="Approval required for this transition"
                checked={rule.approvalRequired}
                disabled={disabled}
                onCheckedChange={(approvalRequired) => updateTransition(rule.event, { approvalRequired })}
              />
            ) : null}
          </div>
        ))}
      </SectionCard>

      <SectionCard
        number={4}
        title="Check-In Readiness"
        description="These rules determine whether Front Office may assign and check in a room."
      >
        <RuleToggle
          id="hk-clean-required"
          label="Clean Required"
          checked={draft.settings.cleanRequired}
          disabled={disabled}
          onCheckedChange={(cleanRequired) => updateSettings({ cleanRequired })}
        />
        <RuleToggle
          id="hk-inspection-required"
          label="Inspection Required"
          checked={draft.settings.inspectionRequired}
          disabled={disabled}
          onCheckedChange={(inspectionRequired) =>
            updateSettings({
              inspectionRequired,
              supervisorApprovalRequired: inspectionRequired
                ? draft.settings.supervisorApprovalRequired
                : false,
            })
          }
        />
        <RuleToggle
          id="hk-maintenance-clear"
          label="Maintenance Clear Required"
          checked={draft.settings.maintenanceClearRequired}
          disabled={disabled}
          onCheckedChange={(maintenanceClearRequired) => updateSettings({ maintenanceClearRequired })}
        />
        <RuleToggle
          id="hk-assignment-override"
          label="Assignment Override Allowed"
          checked={draft.settings.assignmentOverrideAllowed}
          disabled={disabled}
          onCheckedChange={(assignmentOverrideAllowed) =>
            updateSettings({
              assignmentOverrideAllowed,
              overridePermission: assignmentOverrideAllowed ? "owner_manager" : null,
              overrideReasonRequired: assignmentOverrideAllowed,
            })
          }
        />
        {draft.settings.assignmentOverrideAllowed ? (
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              id="hk-override-permission"
              label="Override Permission"
              value={draft.settings.overridePermission ?? "owner_manager"}
              disabled={disabled}
              options={HOUSEKEEPING_OVERRIDE_PERMISSIONS.map((permission) => ({
                value: permission,
                label: permission.replaceAll("_", " "),
              }))}
              onValueChange={(overridePermission) =>
                updateSettings({ overridePermission: overridePermission as HousekeepingOverridePermission })
              }
            />
            <RuleToggle
              id="hk-override-reason"
              label="Override Reason Required"
              checked={draft.settings.overrideReasonRequired}
              disabled={disabled}
              onCheckedChange={(overrideReasonRequired) => updateSettings({ overrideReasonRequired })}
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        number={5}
        title="Housekeeping Priorities"
        description="Map operational triggers to task severity. Rank determines the display order."
      >
        <div className="space-y-2">
          {draft.priorities.map((rule) => (
            <div
              key={rule.event}
              className="grid items-end gap-3 rounded-xl border border-[#E5DED1] p-3 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_auto]"
            >
              <p className="self-center font-medium text-[#251605]">{priorityEventLabel(rule.event)} Priority</p>
              <SelectField
                id={`hk-priority-${rule.event}`}
                label="Priority"
                value={rule.priority}
                disabled={disabled}
                options={HOUSEKEEPING_PRIORITY_CODES.map((priority) => ({
                  value: priority,
                  label: priority.charAt(0).toUpperCase() + priority.slice(1),
                }))}
                onValueChange={(priority) =>
                  updatePriority(rule.event, { priority: priority as HousekeepingPriorityCode })
                }
              />
              <div className="space-y-2">
                <Label htmlFor={`hk-rank-${rule.event}`}>Rank</Label>
                <Input
                  id={`hk-rank-${rule.event}`}
                  type="number"
                  min={1}
                  max={99}
                  value={rule.rank}
                  disabled={disabled}
                  onChange={(event) => updatePriority(rule.event, { rank: Number(event.target.value) })}
                />
              </div>
              <Switch
                checked={rule.enabled}
                disabled={disabled}
                onCheckedChange={(enabled) => updatePriority(rule.event, { enabled })}
                aria-label={`${priorityEventLabel(rule.event)} priority enabled`}
                className="mb-2"
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="rounded-xl border border-[#E5DED1] bg-white px-4 py-3 text-sm text-muted-foreground">
        Daily cleaning tasks, inspections, assignments and room actions remain in{" "}
        <a className="font-medium text-[#7A5511] underline" href="/restaurant/pms/housekeeping">
          Housekeeping Operations
        </a>
        .
      </div>
    </div>
  );
}
