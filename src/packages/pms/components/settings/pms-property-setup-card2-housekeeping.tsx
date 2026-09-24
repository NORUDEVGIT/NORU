import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
  evaluatePmsCard2HousekeepingReadiness,
  getPmsCard2Housekeeping,
  savePmsCard2CustomStatus,
  savePmsCard2Housekeeping,
} from "@/packages/pms/lib/housekeeping-card2.functions";
import {
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

type StepActions = {
  saveDraft: () => Promise<boolean>;
  saveAndContinue: () => Promise<boolean>;
};

type CustomStatusDraft = {
  id: string;
  code: string;
  name: string;
};

const emptyCustomStatus = (): CustomStatusDraft => ({
  id: "",
  code: "",
  name: "",
});

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
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
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
  action,
  children,
}: {
  number: number;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mb-32 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C89933]/15 text-sm font-semibold text-[#7A5511]">
            {number}
          </span>
          <div>
            <h2 className="font-display text-xl text-[#251605]">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
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

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PmsPropertySetupCard2Housekeeping({
  restaurantId,
  canEdit,
  onReadiness,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (
    status: PropertySetupCardStatus,
    blockers: string[],
    warnings: string[],
  ) => void;
  registerActions: (actions: StepActions) => void;
}) {
  const queryClient = useQueryClient();
  const getHousekeeping = useServerFn(getPmsCard2Housekeeping);
  const saveHousekeeping = useServerFn(savePmsCard2Housekeeping);
  const evaluateReadiness = useServerFn(
    evaluatePmsCard2HousekeepingReadiness,
  );
  const saveCustomStatus = useServerFn(savePmsCard2CustomStatus);

  const [draft, setDraft] = useState<HousekeepingCard2Snapshot | null>(null);
  const [custom, setCustom] = useState<CustomStatusDraft>(
    emptyCustomStatus(),
  );
  const [customStatusOpen, setCustomStatusOpen] = useState(false);
  const [statusSearch, setStatusSearch] = useState("");
  const [statusSourceFilter, setStatusSourceFilter] = useState("__all");
  const [transitionEvent, setTransitionEvent] = useState<
    HousekeepingCard2Transition["event"] | null
  >(null);

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
      if (!draft) {
        throw new Error("Housekeeping settings are still loading.");
      }

      return saveHousekeeping({
        data: {
          restaurantId,
          settings: {
            enabled: draft.settings.enabled,
            defaultStatus: draft.settings.defaultStatus,
            cleanRequired: draft.settings.cleanRequired,
            inspectionRequired: draft.settings.inspectionRequired,
            maintenanceClearRequired:
              draft.settings.maintenanceClearRequired,
            roomReleaseRule: draft.settings.roomReleaseRule,
            supervisorApprovalRequired:
              draft.settings.supervisorApprovalRequired,
            automaticStatusChangeEnabled:
              draft.settings.automaticStatusChangeEnabled,
            manualStatusChangeAllowed:
              draft.settings.manualStatusChangeAllowed,
            assignmentOverrideAllowed:
              draft.settings.assignmentOverrideAllowed,
            overridePermission: draft.settings.overridePermission,
            overrideReasonRequired:
              draft.settings.overrideReasonRequired,
          },
          transitions: draft.transitions.map(
            ({
              event,
              fromStatus,
              toStatus,
              enabled,
              approvalRequired,
            }) => ({
              event,
              fromStatus,
              toStatus,
              enabled,
              approvalRequired,
            }),
          ),
          priorities: draft.priorities.map(
            ({ event, priority, enabled, rank }) => ({
              event,
              priority,
              enabled,
              rank,
            }),
          ),
        },
      });
    },
    onSuccess: (result) => {
      setDraft(result.snapshot);
      onReadiness(
        result.readiness.stepStatus,
        result.readiness.blockers,
        result.readiness.warnings,
      );
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-housekeeping", restaurantId],
      });
    },
  });

  const customMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      active: boolean;
    }) => saveCustomStatus({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      setDraft(result.snapshot);
      setCustom(emptyCustomStatus());
      setCustomStatusOpen(false);
      onReadiness(
        result.readiness.stepStatus,
        result.readiness.blockers,
        result.readiness.warnings,
      );
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save Housekeeping.",
      );
      return false;
    }
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;

    const readiness = await evaluateReadiness({
      data: { restaurantId },
    });

    onReadiness(
      readiness.stepStatus,
      readiness.blockers,
      readiness.warnings,
    );

    if (!readiness.ready) {
      toast.error(
        readiness.blockers[0] ??
          "Housekeeping setup needs attention.",
      );
      return false;
    }

    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {(query.error as Error).message}
      </p>
    );
  }

  if (query.isLoading || !draft) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading Housekeeping setup…
      </p>
    );
  }

  const disabled = !canEdit || saveMutation.isPending;
  const activeStatuses = draft.statuses.filter((status) => status.active);
  const operationalStatuses = activeStatuses.filter(
    (status) =>
      status.operational && status.domain === "housekeeping",
  );
  const statusOptions = activeStatuses.map((status) => ({
    value: status.code,
    label: `${status.name} · ${status.domain}`,
  }));

  const filteredStatuses = draft.statuses.filter((status) => {
    const queryText = statusSearch.trim().toLowerCase();
    const matchesSearch =
      !queryText ||
      `${status.name} ${status.code} ${status.domain}`
        .toLowerCase()
        .includes(queryText);
    const matchesSource =
      statusSourceFilter === "__all" ||
      (statusSourceFilter === "core"
        ? status.isCore
        : !status.isCore);

    return matchesSearch && matchesSource;
  });

  const selectedTransition = transitionEvent
    ? draft.transitions.find((rule) => rule.event === transitionEvent) ??
      null
    : null;

  function updateSettings(
    patch: Partial<HousekeepingCard2Settings>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            settings: { ...current.settings, ...patch },
          }
        : current,
    );
  }

  function updateTransition(
    event: HousekeepingCard2Transition["event"],
    patch: Partial<HousekeepingCard2Transition>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            transitions: current.transitions.map((rule) =>
              rule.event === event ? { ...rule, ...patch } : rule,
            ),
          }
        : current,
    );
  }

  function updatePriority(
    event: HousekeepingCard2Priority["event"],
    patch: Partial<HousekeepingCard2Priority>,
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            priorities: current.priorities.map((rule) =>
              rule.event === event ? { ...rule, ...patch } : rule,
            ),
          }
        : current,
    );
  }

  function openNewCustomStatus() {
    setCustom(emptyCustomStatus());
    setCustomStatusOpen(true);
  }

  function openEditCustomStatus(status: {
    id: string;
    code: string;
    name: string;
  }) {
    setCustom({
      id: status.id,
      code: status.code,
      name: status.name,
    });
    setCustomStatusOpen(true);
  }

  return (
    <div
      className="space-y-5"
      data-testid="pms-card2-housekeeping-form"
    >
      <SectionCard
        number={1}
        title="Housekeeping Settings & Availability"
        description="Configure property rules. Daily room work remains in the Housekeeping module."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <RuleToggle
            id="hk-enabled"
            label="Enable Housekeeping Management"
            checked={draft.settings.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) =>
              updateSettings({ enabled })
            }
          />

          <RuleToggle
            id="hk-auto-status"
            label="Automatic Status Change Enabled"
            checked={draft.settings.automaticStatusChangeEnabled}
            disabled={disabled}
            onCheckedChange={(automaticStatusChangeEnabled) =>
              updateSettings({ automaticStatusChangeEnabled })
            }
          />

          <SelectField
            id="hk-default-status"
            label="Default Housekeeping Status"
            value={draft.settings.defaultStatus}
            disabled={disabled}
            options={operationalStatuses.map((status) => ({
              value: status.code,
              label: status.name,
            }))}
            onValueChange={(defaultStatus) =>
              updateSettings({
                defaultStatus:
                  defaultStatus as HousekeepingOperationalStatus,
              })
            }
          />

          <SelectField
            id="hk-release-rule"
            label="Room Release Rule"
            value={draft.settings.roomReleaseRule}
            disabled={disabled}
            options={HOUSEKEEPING_RELEASE_RULES.map((rule) => ({
              value: rule,
              label: titleCase(rule),
            }))}
            onValueChange={(roomReleaseRule) =>
              updateSettings({
                roomReleaseRule:
                  roomReleaseRule as HousekeepingReleaseRule,
              })
            }
          />

          <RuleToggle
            id="hk-manual-status"
            label="Manual Status Change Allowed"
            checked={draft.settings.manualStatusChangeAllowed}
            disabled={disabled}
            onCheckedChange={(manualStatusChangeAllowed) =>
              updateSettings({ manualStatusChangeAllowed })
            }
          />

          {draft.settings.inspectionRequired ? (
            <RuleToggle
              id="hk-supervisor-approval"
              label="Supervisor Approval Required"
              checked={draft.settings.supervisorApprovalRequired}
              disabled={disabled}
              onCheckedChange={(supervisorApprovalRequired) =>
                updateSettings({ supervisorApprovalRequired })
              }
            />
          ) : (
            <div />
          )}
        </div>
      </SectionCard>

      <SectionCard
        number={2}
        title="Housekeeping Status Catalog"
        description="Core states retain their system meaning. Custom statuses are property labels and cannot replace operational room state."
        action={
          canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={openNewCustomStatus}
            >
              <Plus className="mr-1 size-4" />
              Add custom status
            </Button>
          ) : null
        }
      >
        <div className="grid gap-2 lg:grid-cols-[1fr_14rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search statuses"
              value={statusSearch}
              onChange={(event) =>
                setStatusSearch(event.target.value)
              }
              aria-label="Search housekeeping statuses"
            />
          </div>

          <Select
            value={statusSourceFilter}
            onValueChange={setStatusSourceFilter}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All sources</SelectItem>
              <SelectItem value="core">System/Core</SelectItem>
              <SelectItem value="custom">Property</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-[#E6DFD3] md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status Name</th>
                <th className="px-3 py-2">Status Code</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStatuses.map((status) => (
                <tr
                  key={status.id}
                  className="border-t border-[#EDE6D8] hover:bg-[#FBF9F5]"
                >
                  <td className="px-3 py-2 font-medium text-[#251605]">
                    {status.name}
                  </td>
                  <td className="px-3 py-2">{status.code}</td>
                  <td className="px-3 py-2">
                    {titleCase(status.domain)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        status.isCore
                          ? "bg-slate-100 text-slate-700"
                          : "bg-purple-50 text-purple-700"
                      }`}
                    >
                      {status.isCore
                        ? "System/Core"
                        : "Property"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {status.active ? "Active" : "Inactive"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {status.isCore ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <LockKeyhole className="size-3.5" />
                        Locked
                      </span>
                    ) : canEdit ? (
                      <div className="inline-flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openEditCustomStatus(status)
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={customMutation.isPending}
                          onClick={() =>
                            customMutation.mutate({
                              id: status.id,
                              code: status.code,
                              name: status.name,
                              active: !status.active,
                            })
                          }
                        >
                          {status.active
                            ? "Deactivate"
                            : "Activate"}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}

              {filteredStatuses.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No housekeeping statuses match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {filteredStatuses.map((status) => (
            <article
              key={status.id}
              className="rounded-xl border border-[#E6DFD3] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#251605]">
                    {status.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {status.code} · {titleCase(status.domain)} ·{" "}
                    {status.isCore ? "System/Core" : "Property"}
                  </p>
                </div>

                {!status.isCore && canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditCustomStatus(status)}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        number={3}
        title="Automatic Status Transitions"
        description="These rules configure operational events; they do not execute housekeeping work from Settings."
      >
        <div className="overflow-x-auto rounded-lg border border-[#E6DFD3]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">From Status</th>
                <th className="px-3 py-2">To Status</th>
                <th className="px-3 py-2">Approval</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {draft.transitions.map((rule) => (
                <tr
                  key={rule.event}
                  className="border-t border-[#EDE6D8] hover:bg-[#FBF9F5]"
                >
                  <td className="px-3 py-2 font-medium text-[#251605]">
                    {transitionEventLabel(rule.event)}
                  </td>
                  <td className="px-3 py-2">
                    {statusOptions.find(
                      (option) => option.value === rule.fromStatus,
                    )?.label ?? rule.fromStatus}
                  </td>
                  <td className="px-3 py-2">
                    {statusOptions.find(
                      (option) => option.value === rule.toStatus,
                    )?.label ?? rule.toStatus}
                  </td>
                  <td className="px-3 py-2">
                    {rule.approvalRequired
                      ? "Required"
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full ${
                          rule.enabled
                            ? "bg-green-500"
                            : "bg-gray-400"
                        }`}
                      />
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rule.event === "guest_check_in" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <LockKeyhole className="size-3.5" />
                        System
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() =>
                          setTransitionEvent(rule.event)
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Guest Check-In is reservation-derived and remains system controlled.
        </p>
      </SectionCard>

      <SectionCard
        number={4}
        title="Check-In Readiness"
        description="These rules determine whether Front Office may assign and check in a room."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <RuleToggle
            id="hk-clean-required"
            label="Clean Required"
            checked={draft.settings.cleanRequired}
            disabled={disabled}
            onCheckedChange={(cleanRequired) =>
              updateSettings({ cleanRequired })
            }
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
            onCheckedChange={(maintenanceClearRequired) =>
              updateSettings({ maintenanceClearRequired })
            }
          />

          <RuleToggle
            id="hk-assignment-override"
            label="Assignment Override Allowed"
            checked={draft.settings.assignmentOverrideAllowed}
            disabled={disabled}
            onCheckedChange={(assignmentOverrideAllowed) =>
              updateSettings({
                assignmentOverrideAllowed,
                overridePermission: assignmentOverrideAllowed
                  ? "owner_manager"
                  : null,
                overrideReasonRequired:
                  assignmentOverrideAllowed,
              })
            }
          />
        </div>

        {draft.settings.assignmentOverrideAllowed ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField
              id="hk-override-permission"
              label="Override Permission"
              value={
                draft.settings.overridePermission ??
                "owner_manager"
              }
              disabled={disabled}
              options={HOUSEKEEPING_OVERRIDE_PERMISSIONS.map(
                (permission) => ({
                  value: permission,
                  label: titleCase(permission),
                }),
              )}
              onValueChange={(overridePermission) =>
                updateSettings({
                  overridePermission:
                    overridePermission as HousekeepingOverridePermission,
                })
              }
            />

            <RuleToggle
              id="hk-override-reason"
              label="Override Reason Required"
              checked={draft.settings.overrideReasonRequired}
              disabled={disabled}
              onCheckedChange={(overrideReasonRequired) =>
                updateSettings({ overrideReasonRequired })
              }
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        number={5}
        title="Housekeeping Priorities"
        description="Map operational triggers to task severity. Rank determines the display order."
      >
        <div className="overflow-x-auto rounded-lg border border-[#E6DFD3]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {draft.priorities.map((rule) => (
                <tr
                  key={rule.event}
                  className="border-t border-[#EDE6D8]"
                >
                  <td className="px-3 py-2 font-medium text-[#251605]">
                    {priorityEventLabel(rule.event)} Priority
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={rule.priority}
                      disabled={disabled}
                      onValueChange={(priority) =>
                        updatePriority(rule.event, {
                          priority:
                            priority as HousekeepingPriorityCode,
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUSEKEEPING_PRIORITY_CODES.map(
                          (priority) => (
                            <SelectItem
                              key={priority}
                              value={priority}
                            >
                              {titleCase(priority)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="w-24"
                      id={`hk-rank-${rule.event}`}
                      type="number"
                      min={1}
                      max={99}
                      value={rule.rank}
                      disabled={disabled}
                      onChange={(event) =>
                        updatePriority(rule.event, {
                          rank: Number(event.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Switch
                      checked={rule.enabled}
                      disabled={disabled}
                      onCheckedChange={(enabled) =>
                        updatePriority(rule.event, { enabled })
                      }
                      aria-label={`${priorityEventLabel(
                        rule.event,
                      )} priority enabled`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="rounded-xl border border-[#E5DED1] bg-white px-4 py-3 text-sm text-muted-foreground">
        Daily cleaning tasks, inspections, assignments and room
        actions remain in{" "}
        <a
          className="font-medium text-[#7A5511] underline"
          href="/restaurant/pms/housekeeping"
        >
          Housekeeping Operations
        </a>
        .
      </div>

      <Dialog
        open={customStatusOpen}
        onOpenChange={(open) => {
          setCustomStatusOpen(open);
          if (!open) setCustom(emptyCustomStatus());
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          <div className="border-b border-[#EDE6D8] bg-white px-5 py-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                {custom.id
                  ? "Edit custom housekeeping status"
                  : "Add custom housekeeping status"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Custom statuses are property labels and cannot replace
                core system states.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="hk-custom-name">Status Name *</Label>
              <Input
                id="hk-custom-name"
                value={custom.name}
                disabled={!canEdit}
                onChange={(event) =>
                  setCustom({
                    ...custom,
                    name: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hk-custom-code">Status Code *</Label>
              <Input
                id="hk-custom-code"
                value={custom.code}
                disabled={!canEdit || Boolean(custom.id)}
                placeholder="stayover_clean"
                onChange={(event) =>
                  setCustom({
                    ...custom,
                    code: event.target.value,
                  })
                }
              />
              {custom.id ? (
                <p className="text-xs text-muted-foreground">
                  The code is locked after creation.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomStatusOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={
                !canEdit ||
                !custom.code.trim() ||
                !custom.name.trim() ||
                customMutation.isPending
              }
              onClick={() =>
                customMutation.mutate({
                  ...(custom.id ? { id: custom.id } : {}),
                  code: custom.code.trim(),
                  name: custom.name.trim(),
                  active: true,
                })
              }
            >
              {customMutation.isPending
                ? "Saving..."
                : custom.id
                  ? "Save changes"
                  : "Add status"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedTransition)}
        onOpenChange={(open) => {
          if (!open) setTransitionEvent(null);
        }}
      >
        <DialogContent className="block max-h-[88dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-[#CCCCCC] bg-white p-0 shadow-xl">
          {selectedTransition ? (
            <>
              <div className="border-b border-[#EDE6D8] bg-white px-5 py-4">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="font-sans text-lg font-semibold text-[#251605]">
                    Edit transition —{" "}
                    {transitionEventLabel(selectedTransition.event)}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Configure the automatic status transition for this
                    operational event.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-4 p-5">
                <RuleToggle
                  id={`hk-${selectedTransition.event}-enabled`}
                  label="Enabled"
                  checked={selectedTransition.enabled}
                  disabled={disabled}
                  onCheckedChange={(enabled) =>
                    updateTransition(selectedTransition.event, {
                      enabled,
                    })
                  }
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    id={`hk-${selectedTransition.event}-from`}
                    label="From Status"
                    value={selectedTransition.fromStatus}
                    options={statusOptions}
                    disabled={disabled}
                    onValueChange={(fromStatus) =>
                      updateTransition(selectedTransition.event, {
                        fromStatus,
                      })
                    }
                  />

                  <SelectField
                    id={`hk-${selectedTransition.event}-to`}
                    label="To Status"
                    value={selectedTransition.toStatus}
                    options={statusOptions}
                    disabled={disabled}
                    onValueChange={(toStatus) =>
                      updateTransition(selectedTransition.event, {
                        toStatus,
                      })
                    }
                  />
                </div>

                {draft.settings.inspectionRequired &&
                selectedTransition.event ===
                  "inspection_complete" ? (
                  <RuleToggle
                    id="hk-transition-inspection-approval"
                    label="Approval Required"
                    description="Require supervisor approval for this transition."
                    checked={selectedTransition.approvalRequired}
                    disabled={disabled}
                    onCheckedChange={(approvalRequired) =>
                      updateTransition(
                        selectedTransition.event,
                        { approvalRequired },
                      )
                    }
                  />
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-[#EDE6D8] bg-white px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTransitionEvent(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  onClick={() => setTransitionEvent(null)}
                >
                  Done
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
