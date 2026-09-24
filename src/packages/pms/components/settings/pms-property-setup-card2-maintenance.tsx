import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  evaluateCard2MaintenanceReadiness,
  getMaintenanceRules,
  getMaintenanceSummary,
  listMaintenanceDepartments,
  saveMaintenanceRules,
} from "@/packages/pms/lib/maintenance.functions";
import {
  MAINTENANCE_FREQUENCIES,
  MAINTENANCE_STATUS_RULE_STATUSES,
  card2MaintenanceStepStatus,
  defaultMaintenanceRules,
  isMaintenanceFrequency,
  maintenanceRulesErrors,
  normalizeMaintenanceRules,
  type MaintenanceFrequency,
  type MaintenanceRulesDraft,
  type MaintenanceStatusRule,
  type MaintenanceStatusRuleStatus,
} from "@/packages/pms/lib/maintenance-card2.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

const STATUS_LABELS: Record<MaintenanceStatusRuleStatus, string> = {
  normal: "Normal",
  maintenance_required: "Maintenance Required",
  in_progress: "In Progress",
  out_of_service: "Out of Service",
  out_of_order: "Out of Order",
  inspection: "Inspection",
};

const FREQUENCY_LABELS: Record<MaintenanceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export type MaintenanceRailStats = {
  configuredStatusRules: number;
  oosPolicyConfigured: boolean;
  oooPolicyConfigured: boolean;
  preventiveMaintenanceEnabled: boolean;
  blockers: string[];
  stepStatus: PropertySetupCardStatus;
};

function SectionCard({
  number,
  title,
  description,
  children,
  testId,
}: {
  number: number;
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="scroll-mb-32 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C89933]/15 text-sm font-semibold text-[#7A5511]">
          {number}
        </span>
        <div>
          <h2 className="font-display text-xl text-[#251605]">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PmsPropertySetupCard2Maintenance({
  restaurantId,
  canEdit,
  onReadiness,
  onStats,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[]) => void;
  onStats: (stats: MaintenanceRailStats) => void;
  registerActions: (actions: {
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchRules = useServerFn(getMaintenanceRules);
  const persistRules = useServerFn(saveMaintenanceRules);
  const fetchSummary = useServerFn(getMaintenanceSummary);
  const fetchReady = useServerFn(evaluateCard2MaintenanceReadiness);
  const fetchDepartments = useServerFn(listMaintenanceDepartments);

  const [draft, setDraft] = useState<MaintenanceRulesDraft>(
    defaultMaintenanceRules,
  );
  const [hydrated, setHydrated] = useState(false);
  const [formError, setFormError] = useState("");

  const rulesQuery = useQuery({
    queryKey: ["pms-card2-maintenance-rules", restaurantId],
    queryFn: () => fetchRules({ data: { restaurantId } }),
  });

  const summaryQuery = useQuery({
    queryKey: ["pms-card2-maintenance-summary", restaurantId],
    queryFn: () => fetchSummary({ data: { restaurantId } }),
  });

  const readyQuery = useQuery({
    queryKey: ["pms-card2-maintenance-ready", restaurantId],
    queryFn: () => fetchReady({ data: { restaurantId } }),
  });

  const departmentsQuery = useQuery({
    queryKey: ["pms-card2-maintenance-departments", restaurantId],
    queryFn: () => fetchDepartments({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!rulesQuery.data || hydrated) return;
    setDraft(normalizeMaintenanceRules(rulesQuery.data.rules));
    setHydrated(true);
  }, [rulesQuery.data, hydrated]);

  const persisted = rulesQuery.data?.persisted ?? false;
  const summary = summaryQuery.data;
  const ready = readyQuery.data;
  const blockers =
    ready?.blockers ??
    (persisted
      ? []
      : ["Save Maintenance Rules to create the property configuration."]);
  const stepStatus =
    ready?.stepStatus ?? card2MaintenanceStepStatus(false, persisted);
  const departments = departmentsQuery.data?.departments ?? [];

  useEffect(() => {
    onReadiness(stepStatus, blockers);
    onStats({
      configuredStatusRules:
        summary?.configuredStatusRules ??
        (persisted ? draft.statusRules.length : 0),
      oosPolicyConfigured:
        summary?.oosPolicyConfigured ?? draft.operationalOosEnabled,
      oooPolicyConfigured:
        summary?.oooPolicyConfigured ?? draft.operationalOooEnabled,
      preventiveMaintenanceEnabled:
        summary?.preventiveMaintenanceEnabled ??
        draft.preventiveMaintenanceEnabled,
      blockers,
      stepStatus,
    });
  }, [
    blockers,
    draft.operationalOooEnabled,
    draft.operationalOosEnabled,
    draft.preventiveMaintenanceEnabled,
    draft.statusRules.length,
    onReadiness,
    onStats,
    persisted,
    stepStatus,
    summary?.configuredStatusRules,
    summary?.oooPolicyConfigured,
    summary?.oosPolicyConfigured,
    summary?.preventiveMaintenanceEnabled,
  ]);

  function patch(next: Partial<MaintenanceRulesDraft>) {
    setDraft((current) =>
      normalizeMaintenanceRules({ ...current, ...next }),
    );
    setFormError("");
  }

  function patchStatus(
    status: MaintenanceStatusRuleStatus,
    next: Partial<MaintenanceStatusRule>,
  ) {
    setDraft((current) =>
      normalizeMaintenanceRules({
        ...current,
        statusRules: current.statusRules.map((row) =>
          row.maintenanceStatus === status
            ? { ...row, ...next, maintenanceStatus: status }
            : row,
        ),
      }),
    );
    setFormError("");
  }

  async function refetchAll() {
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-maintenance-rules", restaurantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-maintenance-summary", restaurantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-maintenance-ready", restaurantId],
    });

    const latest = await fetchRules({ data: { restaurantId } });
    setDraft(normalizeMaintenanceRules(latest.rules));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeMaintenanceRules(draft);
      const clientIssue = maintenanceRulesErrors(normalized)[0];

      if (clientIssue) {
        return { ok: false as const, message: clientIssue };
      }

      return persistRules({ data: { restaurantId, ...normalized } });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setFormError(result.message);
        toast.error(result.message);
        return;
      }

      setFormError("");
      toast.success("Maintenance rules saved");
      await refetchAll();
    },
  });

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;

    const normalized = normalizeMaintenanceRules(draft);
    const clientIssue = maintenanceRulesErrors(normalized)[0];

    if (clientIssue) {
      setFormError(clientIssue);
      toast.error(clientIssue);
      return false;
    }

    const result = await saveMutation.mutateAsync();
    if (!result.ok) return false;

    return true;
  }

  async function saveAndContinue(): Promise<boolean> {
    const saved = await saveDraft();
    if (!saved) return false;

    const latest = await fetchReady({ data: { restaurantId } });
    onReadiness(latest.stepStatus, latest.blockers);

    if (!latest.ready) {
      toast.error(
        latest.blockers[0] ?? "Maintenance is not complete yet.",
      );
      return false;
    }

    toast.success(
      "Maintenance is ready. Rooms & Operations stays In Progress until Card 2 review.",
    );
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  return (
    <div
      className="space-y-5 scroll-mb-32"
      data-testid="pms-card2-maintenance-form"
    >
      {!persisted ? (
        <div
          className="rounded-xl border border-[#E5DED1] bg-white px-4 py-3 text-sm text-muted-foreground"
          data-testid="pms-card2-maintenance-not-started"
        >
          Defaults are shown. Save this step to create the property maintenance-rules configuration.
        </div>
      ) : null}

      <SectionCard
        number={1}
        title="General Maintenance Policy"
        description="Control maintenance workflow defaults without changing operational room status directly."
        testId="pms-card2-maintenance-general"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            id="maintenance-management-enabled"
            label="Maintenance Management Enabled"
            checked={draft.maintenanceManagementEnabled}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ maintenanceManagementEnabled: value })
            }
          />

          <PolicyToggle
            id="maintenance-requires-supervisor-approval"
            label="Requires Supervisor Approval"
            checked={draft.requiresSupervisorApproval}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ requiresSupervisorApproval: value })
            }
          />

          <PolicyToggle
            id="maintenance-manual-status-change-allowed"
            label="Manual Maintenance Status Change Allowed"
            checked={draft.manualStatusChangeAllowed}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ manualStatusChangeAllowed: value })
            }
          />

          <PolicyToggle
            id="maintenance-status-change-reason-required"
            label="Status Change Reason Required"
            checked={draft.maintenanceStatusChangeReasonRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ maintenanceStatusChangeReasonRequired: value })
            }
          />

          <PolicyToggle
            id="maintenance-status-change-notes-required"
            label="Status Change Notes Required"
            checked={draft.maintenanceStatusChangeNotesRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ maintenanceStatusChangeNotesRequired: value })
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        number={2}
        title="Maintenance Status Rules"
        description="Define how each maintenance condition affects room assignment, check-in, clearance, and release."
        testId="pms-card2-maintenance-status-rules"
      >
        <div className="overflow-x-auto rounded-lg border border-[#E6DFD3]">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 text-center">Prevent Assignment</th>
                <th className="px-3 py-2 text-center">Prevent Check-In</th>
                <th className="px-3 py-2 text-center">Supervisor Approval</th>
                <th className="px-3 py-2 text-center">Clearance Required</th>
                <th className="px-3 py-2 text-center">Inspection Before Release</th>
              </tr>
            </thead>
            <tbody>
              {MAINTENANCE_STATUS_RULE_STATUSES.map((status) => {
                const row =
                  draft.statusRules.find(
                    (item) => item.maintenanceStatus === status,
                  ) ?? draft.statusRules[0];

                return (
                  <tr
                    key={status}
                    className="border-t border-[#EDE6D8]"
                    data-testid={`pms-card2-maintenance-status-${status}`}
                  >
                    <td className="px-3 py-3 font-medium text-[#251605]">
                      {STATUS_LABELS[status]}
                    </td>

                    <StatusSwitch
                      id={`maintenance-status-${status}-active`}
                      checked={row.active}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} active`}
                      onChange={(value) =>
                        patchStatus(status, { active: value })
                      }
                    />

                    <StatusSwitch
                      id={`maintenance-status-${status}-preventsRoomAssignment`}
                      checked={row.preventsRoomAssignment}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} prevents room assignment`}
                      onChange={(value) =>
                        patchStatus(status, {
                          preventsRoomAssignment: value,
                        })
                      }
                    />

                    <StatusSwitch
                      id={`maintenance-status-${status}-preventsCheckIn`}
                      checked={row.preventsCheckIn}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} prevents check-in`}
                      onChange={(value) =>
                        patchStatus(status, {
                          preventsCheckIn: value,
                        })
                      }
                    />

                    <StatusSwitch
                      id={`maintenance-status-${status}-requiresSupervisorApproval`}
                      checked={row.requiresSupervisorApproval}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} requires supervisor approval`}
                      onChange={(value) =>
                        patchStatus(status, {
                          requiresSupervisorApproval: value,
                        })
                      }
                    />

                    <StatusSwitch
                      id={`maintenance-status-${status}-requiresMaintenanceClearance`}
                      checked={row.requiresMaintenanceClearance}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} requires maintenance clearance`}
                      onChange={(value) =>
                        patchStatus(status, {
                          requiresMaintenanceClearance: value,
                        })
                      }
                    />

                    <StatusSwitch
                      id={`maintenance-status-${status}-requiresInspectionBeforeRelease`}
                      checked={row.requiresInspectionBeforeRelease}
                      disabled={!canEdit}
                      label={`${STATUS_LABELS[status]} requires inspection before release`}
                      onChange={(value) =>
                        patchStatus(status, {
                          requiresInspectionBeforeRelease: value,
                        })
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Out of Service and Out of Order operational policies are configured separately below.
        </p>
      </SectionCard>

      <SectionCard
        number={3}
        title="Out of Service Policy"
        description="Configure the operational policy for rooms placed Out of Service."
        testId="pms-card2-maintenance-oos"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            id="maintenance-oos-enabled"
            label="Out of Service Enabled"
            checked={draft.operationalOosEnabled}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ operationalOosEnabled: value })
            }
          />

          {draft.operationalOosEnabled ? (
            <>
              <PolicyToggle
                id="maintenance-oos-reason-required"
                label="Reason Required"
                checked={draft.operationalOosReasonRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ operationalOosReasonRequired: value })
                }
              />

              <PolicyToggle
                id="maintenance-oos-approval-required"
                label="Approval Required"
                checked={draft.operationalOosApprovalRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ operationalOosApprovalRequired: value })
                }
              />

              <PolicyToggle
                id="maintenance-oos-supervisor-approval-required"
                label="Supervisor Approval Required"
                checked={
                  draft.operationalOosSupervisorApprovalRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOosSupervisorApprovalRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-oos-assignment-restricted"
                label="Restrict Room Assignment"
                checked={draft.operationalOosAssignmentRestricted}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOosAssignmentRestricted: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-oos-clearance-required"
                label="Maintenance Clearance Required"
                checked={
                  draft.operationalOosMaintenanceClearanceRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOosMaintenanceClearanceRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-oos-reopening-inspection"
                label="Reopening Inspection Required"
                checked={
                  draft.operationalOosReopeningInspectionRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOosReopeningInspectionRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-oos-expected-completion"
                label="Expected Completion Required"
                checked={
                  draft.operationalOosExpectedCompletionRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOosExpectedCompletionRequired: value,
                  })
                }
              />
            </>
          ) : (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-3 text-sm text-muted-foreground">
              Dependent Out of Service rules remain inactive while this policy is disabled.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        number={4}
        title="Out of Order Policy"
        description="Configure the operational policy for rooms placed Out of Order."
        testId="pms-card2-maintenance-ooo"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            id="maintenance-ooo-enabled"
            label="Out of Order Enabled"
            checked={draft.operationalOooEnabled}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ operationalOooEnabled: value })
            }
          />

          {draft.operationalOooEnabled ? (
            <>
              <PolicyToggle
                id="maintenance-ooo-reason-required"
                label="Reason Required"
                checked={draft.operationalOooReasonRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ operationalOooReasonRequired: value })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-ticket-required"
                label="Maintenance Ticket Required"
                checked={
                  draft.operationalOooMaintenanceTicketRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooMaintenanceTicketRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-approval-required"
                label="Approval Required"
                checked={draft.operationalOooApprovalRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ operationalOooApprovalRequired: value })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-manager-approval-required"
                label="Manager Approval Required"
                checked={
                  draft.operationalOooManagerApprovalRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooManagerApprovalRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-assignment-restricted"
                label="Restrict Room Assignment"
                checked={draft.operationalOooAssignmentRestricted}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooAssignmentRestricted: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-check-in-restricted"
                label="Restrict Check-In"
                checked={draft.operationalOooCheckInRestricted}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooCheckInRestricted: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-clearance-required"
                label="Maintenance Clearance Required"
                checked={
                  draft.operationalOooMaintenanceClearanceRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooMaintenanceClearanceRequired: value,
                  })
                }
              />

              <PolicyToggle
                id="maintenance-ooo-reopening-inspection"
                label="Reopening Inspection Required"
                checked={
                  draft.operationalOooReopeningInspectionRequired
                }
                disabled={!canEdit}
                onChange={(value) =>
                  patch({
                    operationalOooReopeningInspectionRequired: value,
                  })
                }
              />
            </>
          ) : (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-3 text-sm text-muted-foreground">
              Dependent Out of Order rules remain inactive while this policy is disabled.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        number={5}
        title="Preventive Maintenance Defaults"
        description="Configure reminder defaults without creating work orders, assets, technicians, or schedules."
        testId="pms-card2-maintenance-preventive"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            id="maintenance-preventive-enabled"
            label="Preventive Maintenance Enabled"
            checked={draft.preventiveMaintenanceEnabled}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ preventiveMaintenanceEnabled: value })
            }
          />

          {draft.preventiveMaintenanceEnabled ? (
            <>
              <Field
                label="Default Frequency"
                htmlFor="maintenance-preventive-frequency"
              >
                <Select
                  value={draft.defaultMaintenanceFrequency}
                  onValueChange={(value) => {
                    if (isMaintenanceFrequency(value)) {
                      patch({ defaultMaintenanceFrequency: value });
                    }
                  }}
                  disabled={!canEdit}
                >
                  <SelectTrigger
                    id="maintenance-preventive-frequency"
                    aria-label="Default frequency"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {FREQUENCY_LABELS[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <PolicyToggle
                id="maintenance-preventive-reminder-enabled"
                label="Reminder Enabled"
                checked={draft.preventiveReminderEnabled}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ preventiveReminderEnabled: value })
                }
              />

              {draft.preventiveReminderEnabled ? (
                <Field
                  label="Reminder Lead Days"
                  htmlFor="maintenance-preventive-lead-days"
                >
                  <Input
                    id="maintenance-preventive-lead-days"
                    type="number"
                    min={0}
                    step={1}
                    disabled={!canEdit}
                    value={draft.preventiveReminderLeadDays ?? ""}
                    onChange={(event) =>
                      patch({
                        preventiveReminderLeadDays:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    aria-label="Reminder lead days"
                  />
                </Field>
              ) : null}

              <PolicyToggle
                id="maintenance-preventive-inspection-required"
                label="Inspection Required"
                checked={draft.preventiveInspectionRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ preventiveInspectionRequired: value })
                }
              />

              <Field
                label="Assigned Department"
                htmlFor="maintenance-preventive-department"
              >
                <Select
                  value={
                    draft.preventiveAssignedDepartmentId ?? "none"
                  }
                  onValueChange={(value) =>
                    patch({
                      preventiveAssignedDepartmentId:
                        value === "none" ? null : value,
                    })
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger
                    id="maintenance-preventive-department"
                    aria-label="Assigned department"
                  >
                    <SelectValue placeholder="Not assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {departments.map((department) => (
                      <SelectItem
                        key={department.id}
                        value={department.id}
                      >
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-3 text-sm text-muted-foreground">
              Preventive defaults remain inactive until Preventive Maintenance is enabled.
            </div>
          )}
        </div>
      </SectionCard>

      {formError ? (
        <p
          className="text-sm text-destructive"
          data-testid="pms-card2-maintenance-error"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function StatusSwitch({
  id,
  checked,
  disabled,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <td className="px-3 py-3 text-center">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </td>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-[#251605]">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PolicyToggle({
  id,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-[#EDE6D8] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-[#251605]">
          {label}
        </Label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
      {help ? (
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
