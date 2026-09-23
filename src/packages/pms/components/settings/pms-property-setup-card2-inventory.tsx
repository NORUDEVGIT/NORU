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
  evaluateCard2InventoryReadiness,
  getInventoryRules,
  getInventorySummary,
  saveInventoryRules,
} from "@/packages/pms/lib/inventory-rules.functions";
import {
  INVENTORY_BLOCK_TYPES,
  INVENTORY_IMPACTS,
  OVERBOOKING_CAPACITY_NOTE,
  card2InventoryStepStatus,
  defaultInventoryRules,
  inventoryRulesErrors,
  normalizeInventoryRules,
  type InventoryImpact,
  type InventoryRulesDraft,
} from "@/packages/pms/lib/inventory-rules-card2.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

const BLOCK_LABELS: Record<(typeof INVENTORY_BLOCK_TYPES)[number], string> = {
  temporary: "Temporary",
  permanent: "Permanent",
  maintenance: "Maintenance",
  vip: "VIP",
  group: "Group",
  owner: "Owner",
  internal_use: "Internal Use",
  inspection: "Inspection",
  renovation: "Renovation",
};

const IMPACT_LABELS: Record<InventoryImpact, string> = {
  remove_from_inventory: "Remove from Inventory",
  assignment_only: "Assignment Only",
  warning_only: "Warning Only",
  no_inventory_impact: "No Inventory Impact",
};

export type InventoryRailStats = {
  physicalRoomCount: number;
  roomLevelSellableCount: number;
  canonicalEngineSellableRoomCount: number;
  blockPoliciesConfigured: number;
  blockers: string[];
  stepStatus: PropertySetupCardStatus;
  configuredButNotOperational: boolean;
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

export function PmsPropertySetupCard2Inventory({
  restaurantId,
  canEdit,
  onReadiness,
  onStats,
  registerActions,
}: {
  restaurantId: string;
  canEdit: boolean;
  onReadiness: (status: PropertySetupCardStatus, blockers: string[]) => void;
  onStats: (stats: InventoryRailStats) => void;
  registerActions: (actions: {
    saveDraft: () => Promise<boolean>;
    saveAndContinue: () => Promise<boolean>;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchRules = useServerFn(getInventoryRules);
  const persistRules = useServerFn(saveInventoryRules);
  const fetchSummary = useServerFn(getInventorySummary);
  const fetchReady = useServerFn(evaluateCard2InventoryReadiness);

  const [draft, setDraft] = useState<InventoryRulesDraft>(
    defaultInventoryRules,
  );
  const [hydrated, setHydrated] = useState(false);
  const [formError, setFormError] = useState("");

  const rulesQuery = useQuery({
    queryKey: ["pms-card2-inventory-rules", restaurantId],
    queryFn: () => fetchRules({ data: { restaurantId } }),
  });

  const summaryQuery = useQuery({
    queryKey: ["pms-card2-inventory-summary", restaurantId],
    queryFn: () => fetchSummary({ data: { restaurantId } }),
  });

  const readyQuery = useQuery({
    queryKey: ["pms-card2-inventory-ready", restaurantId],
    queryFn: () => fetchReady({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!rulesQuery.data || hydrated) return;
    setDraft(normalizeInventoryRules(rulesQuery.data.rules));
    setHydrated(true);
  }, [rulesQuery.data, hydrated]);

  const persisted = rulesQuery.data?.persisted ?? false;
  const summary = summaryQuery.data;
  const ready = readyQuery.data;
  const blockers =
    ready?.blockers ??
    (persisted
      ? []
      : ["Save Inventory Rules to create the property configuration."]);
  const stepStatus =
    ready?.stepStatus ?? card2InventoryStepStatus(false, persisted);
  const configuredButNotOperational = Boolean(
    ready?.configuredButNotOperational || draft.overbookingAllowed,
  );
  const assignmentError =
    !draft.manualAssignmentAllowed && !draft.automaticAssignmentAllowed
      ? "At least one assignment mode (manual or automatic) must be allowed."
      : "";

  useEffect(() => {
    onReadiness(stepStatus, blockers);
    onStats({
      physicalRoomCount: summary?.physicalRoomCount ?? 0,
      roomLevelSellableCount: summary?.roomLevelSellableCount ?? 0,
      canonicalEngineSellableRoomCount:
        summary?.canonicalEngineSellableRoomCount ?? 0,
      blockPoliciesConfigured: draft.blockTypes.filter((row) => row.enabled)
        .length,
      blockers,
      stepStatus,
      configuredButNotOperational,
    });
  }, [
    blockers,
    configuredButNotOperational,
    draft.blockTypes,
    onReadiness,
    onStats,
    stepStatus,
    summary?.canonicalEngineSellableRoomCount,
    summary?.physicalRoomCount,
    summary?.roomLevelSellableCount,
  ]);

  function patch(next: Partial<InventoryRulesDraft>) {
    setDraft((current) =>
      normalizeInventoryRules({ ...current, ...next }),
    );
    setFormError("");
  }

  async function refetchAll() {
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-inventory-rules", restaurantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-inventory-summary", restaurantId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pms-card2-inventory-ready", restaurantId],
    });
    const latest = await fetchRules({ data: { restaurantId } });
    setDraft(normalizeInventoryRules(latest.rules));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeInventoryRules(draft);
      const clientIssue =
        inventoryRulesErrors(normalized)[0] ?? assignmentError;

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
      toast.success("Inventory rules saved");
      await refetchAll();
    },
  });

  async function saveDraft(): Promise<boolean> {
    if (!canEdit) return false;

    const normalized = normalizeInventoryRules(draft);
    const clientIssue = inventoryRulesErrors(normalized)[0];

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
        latest.blockers[0] ?? "Inventory Rules is not complete yet.",
      );
      return false;
    }

    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  return (
    <div
      className="space-y-5 scroll-mb-32"
      data-testid="pms-card2-inventory-form"
    >
      {!persisted ? (
        <div
          className="rounded-xl border border-[#E5DED1] bg-white px-4 py-3 text-sm text-muted-foreground"
          data-testid="pms-card2-inventory-not-started"
        >
          Defaults are shown. Save this step to create the property inventory-rules configuration.
        </div>
      ) : null}

      <SectionCard
        number={1}
        title="Availability Rules"
        description="Define which room conditions affect sellability, availability, and assignment."
        testId="pms-card2-inventory-availability"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            label="Sellable Status Required"
            help="Room types must be marked sellable before they can contribute inventory."
            checked={draft.sellableStatusRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ sellableStatusRequired: value })
            }
          />

          <PolicyToggle
            label="Operational Availability Required"
            help="A room's operational state must allow it to be considered available."
            checked={draft.operationalAvailabilityRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ operationalAvailabilityRequired: value })
            }
          />

          <PolicyToggle
            label="Housekeeping Readiness Required"
            help="Housekeeping readiness must be satisfied before the room is eligible."
            checked={draft.housekeepingReadinessRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ housekeepingReadinessRequired: value })
            }
          />

          <PolicyToggle
            label="Maintenance Clear Required"
            help="Maintenance state must be clear before the room is eligible."
            checked={draft.maintenanceClearRequired}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ maintenanceClearRequired: value })
            }
          />

          <PolicyToggle
            label="Room Block Removes Inventory"
            help="Configured room blocks remove affected inventory from availability."
            checked={draft.roomBlockRemovesInventory}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ roomBlockRemovesInventory: value })
            }
          />

          <PolicyToggle
            label="Out of Order Removes Inventory"
            help="Out-of-order rooms are removed from available inventory."
            checked={draft.outOfOrderRemovesInventory}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ outOfOrderRemovesInventory: value })
            }
          />

          <PolicyToggle
            label="Out of Service Removes Inventory"
            help="Out-of-service rooms are removed from available inventory."
            checked={draft.outOfServiceRemovesInventory}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ outOfServiceRemovesInventory: value })
            }
          />

          <PolicyToggle
            label="Maintenance Affects Availability"
            help="Maintenance state participates in availability decisions."
            checked={draft.maintenanceAffectsAvailability}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ maintenanceAffectsAvailability: value })
            }
          />

          <PolicyToggle
            label="Housekeeping Affects Assignment"
            help="Housekeeping state participates in room-assignment eligibility."
            checked={draft.housekeepingAffectsAssignment}
            disabled={!canEdit}
            onChange={(value) =>
              patch({ housekeepingAffectsAssignment: value })
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        number={2}
        title="Room Blocking Rules"
        description="Configure how each block type affects inventory and whether approval is required."
        testId="pms-card2-inventory-blocking"
      >
        <div className="overflow-x-auto rounded-lg border border-[#E6DFD3]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F7F4EE] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Block Type</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Inventory Impact</th>
                <th className="px-3 py-2">Approval Required</th>
              </tr>
            </thead>
            <tbody>
              {draft.blockTypes.map((row) => (
                <tr
                  key={row.blockType}
                  className="border-t border-[#EDE6D8]"
                  data-testid={`pms-card2-inventory-block-${row.blockType}`}
                >
                  <td className="px-3 py-3 font-medium text-[#251605]">
                    {BLOCK_LABELS[row.blockType]}
                  </td>

                  <td className="px-3 py-3">
                    <Switch
                      id={`inventory-block-${row.blockType}-enabled`}
                      checked={row.enabled}
                      disabled={!canEdit}
                      onCheckedChange={(enabled) =>
                        patch({
                          blockTypes: draft.blockTypes.map((item) =>
                            item.blockType === row.blockType
                              ? { ...item, enabled }
                              : item,
                          ),
                        })
                      }
                      aria-label={`${BLOCK_LABELS[row.blockType]} enabled`}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <Select
                      value={row.inventoryImpact}
                      disabled={!canEdit || !row.enabled}
                      onValueChange={(value) =>
                        patch({
                          blockTypes: draft.blockTypes.map((item) =>
                            item.blockType === row.blockType
                              ? {
                                  ...item,
                                  inventoryImpact: value as InventoryImpact,
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-52"
                        aria-label={`${BLOCK_LABELS[row.blockType]} inventory impact`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVENTORY_IMPACTS.map((impact) => (
                          <SelectItem key={impact} value={impact}>
                            {IMPACT_LABELS[impact]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="px-3 py-3">
                    <Switch
                      id={`inventory-block-${row.blockType}-approval`}
                      checked={row.approvalRequired}
                      disabled={!canEdit || !row.enabled}
                      onCheckedChange={(approvalRequired) =>
                        patch({
                          blockTypes: draft.blockTypes.map((item) =>
                            item.blockType === row.blockType
                              ? { ...item, approvalRequired }
                              : item,
                          ),
                        })
                      }
                      aria-label={`${BLOCK_LABELS[row.blockType]} approval required`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        number={3}
        title="Room Assignment Rules"
        description="Control assignment modes, required matches, preferences, and readiness checks."
        testId="pms-card2-inventory-assignment"
      >
        <div className="space-y-5">
          <RuleGroup title="Assignment Modes">
            <PolicyToggle
              label="Automatic Assignment"
              checked={draft.automaticAssignmentAllowed}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ automaticAssignmentAllowed: value })
              }
            />
            <PolicyToggle
              label="Manual Assignment"
              checked={draft.manualAssignmentAllowed}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ manualAssignmentAllowed: value })
              }
            />
          </RuleGroup>

          {assignmentError ? (
            <p
              className="text-sm text-destructive"
              data-testid="pms-card2-inventory-assignment-error"
              role="alert"
            >
              {assignmentError}
            </p>
          ) : null}

          <RuleGroup title="Required Matches">
            <PolicyToggle
              label="Room Type Match"
              checked={draft.requireRoomTypeMatch}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireRoomTypeMatch: value })
              }
            />
            <PolicyToggle
              label="Occupancy Match"
              checked={draft.requireOccupancyMatch}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireOccupancyMatch: value })
              }
            />
            <PolicyToggle
              label="Bed Type Match"
              checked={draft.requireBedTypeMatch}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireBedTypeMatch: value })
              }
            />
            <PolicyToggle
              label="Accessibility Match"
              checked={draft.requireAccessibilityMatch}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireAccessibilityMatch: value })
              }
            />
            <PolicyToggle
              label="Connecting Room Match"
              checked={draft.requireConnectingRoomMatch}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireConnectingRoomMatch: value })
              }
            />
          </RuleGroup>

          <RuleGroup title="Preferences">
            <PolicyToggle
              label="Floor Preference"
              checked={draft.useFloorPreference}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ useFloorPreference: value })
              }
            />
            <PolicyToggle
              label="Building Preference"
              checked={draft.useBuildingPreference}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ useBuildingPreference: value })
              }
            />
            <PolicyToggle
              label="Guest Preference"
              checked={draft.useGuestPreference}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ useGuestPreference: value })
              }
            />
          </RuleGroup>

          <RuleGroup title="Operational Readiness">
            <PolicyToggle
              label="Housekeeping Readiness"
              checked={draft.requireHousekeepingReadiness}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireHousekeepingReadiness: value })
              }
            />
            <PolicyToggle
              label="Maintenance Availability"
              checked={draft.requireMaintenanceAvailability}
              disabled={!canEdit}
              onChange={(value) =>
                patch({ requireMaintenanceAvailability: value })
              }
            />
          </RuleGroup>
        </div>
      </SectionCard>

      <SectionCard
        number={4}
        title="Room Move Rules"
        description="Define move-policy requirements. Live room moves remain in Front Office."
        testId="pms-card2-inventory-move"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PolicyToggle
            label="Room Move Allowed"
            checked={draft.roomMoveAllowed}
            disabled={!canEdit}
            onChange={(value) => patch({ roomMoveAllowed: value })}
          />

          {draft.roomMoveAllowed ? (
            <>
              <PolicyToggle
                label="Room Type Change Allowed"
                checked={draft.roomTypeChangeAllowed}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ roomTypeChangeAllowed: value })
                }
              />
              <PolicyToggle
                label="Rate Recalculation Required"
                checked={draft.rateRecalculationRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ rateRecalculationRequired: value })
                }
              />
              <PolicyToggle
                id="inventory-move-approval-required"
                label="Approval Required"
                checked={draft.moveApprovalRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ moveApprovalRequired: value })
                }
              />
              <PolicyToggle
                label="Reason Required"
                checked={draft.moveReasonRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ moveReasonRequired: value })
                }
              />
              <PolicyToggle
                label="Inventory Recalculation Required"
                checked={draft.inventoryRecalculationRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ inventoryRecalculationRequired: value })
                }
              />
              <PolicyToggle
                label="Housekeeping Update Required"
                checked={draft.housekeepingUpdateRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ housekeepingUpdateRequired: value })
                }
              />
              <PolicyToggle
                label="Maintenance Validation Required"
                checked={draft.maintenanceValidationRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ maintenanceValidationRequired: value })
                }
              />
            </>
          ) : (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-3 text-sm text-muted-foreground">
              Move-dependent rules remain inactive until Room Move Allowed is enabled.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        number={5}
        title="Overbooking Rules"
        description="Store the property's overbooking policy without creating a separate booking engine."
        testId="pms-card2-inventory-overbooking"
      >
        <PolicyToggle
          label="Overbooking Allowed"
          help="This enables policy configuration only; it does not activate live oversell."
          checked={draft.overbookingAllowed}
          disabled={!canEdit}
          onChange={(value) => patch({ overbookingAllowed: value })}
        />

        {draft.overbookingAllowed ? (
          <div className="mt-4 space-y-4">
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-[#251605]"
              data-testid="pms-card2-inventory-overbooking-warning"
              role="status"
            >
              <p>{OVERBOOKING_CAPACITY_NOTE}</p>
              <p className="mt-1">
                Room-type and date-based limits are stored as policy settings and are not yet applied to live capacity.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Maximum Overbooking">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!canEdit}
                  value={draft.maximumOverbooking ?? ""}
                  onChange={(event) =>
                    patch({
                      maximumOverbooking:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                  aria-label="Maximum overbooking"
                />
              </Field>

              <Field label="Percentage Limit">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  disabled={!canEdit}
                  value={draft.percentageLimit ?? ""}
                  onChange={(event) =>
                    patch({
                      percentageLimit:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                  aria-label="Percentage limit"
                />
              </Field>

              <PolicyToggle
                label="Room-Type Limit Enabled"
                help="Stores the policy flag for room-type limits."
                checked={draft.roomTypeLimitEnabled}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ roomTypeLimitEnabled: value })
                }
              />

              <PolicyToggle
                label="Date-Based Limit Enabled"
                help="Stores the policy flag for date-based limits."
                checked={draft.dateBasedLimitEnabled}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ dateBasedLimitEnabled: value })
                }
              />

              <PolicyToggle
                label="Manager Approval Required"
                checked={draft.managerApprovalRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ managerApprovalRequired: value })
                }
              />

              <PolicyToggle
                label="Override Permission Required"
                checked={draft.overridePermissionRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ overridePermissionRequired: value })
                }
              />

              <PolicyToggle
                label="Overbooking Reason Required"
                checked={draft.overbookingReasonRequired}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ overbookingReasonRequired: value })
                }
              />

              <PolicyToggle
                label="Overbooking Alert Enabled"
                checked={draft.overbookingAlertEnabled}
                disabled={!canEdit}
                onChange={(value) =>
                  patch({ overbookingAlertEnabled: value })
                }
              />
            </div>
          </div>
        ) : null}
      </SectionCard>

      {configuredButNotOperational ? (
        <div className="rounded-xl border border-[#E5DED1] bg-white px-4 py-3 text-sm text-muted-foreground">
          Some Inventory Rules are stored as configuration policy and are not yet enforced by live reservation capacity.
        </div>
      ) : null}

      {formError ? (
        <p
          className="text-sm text-destructive"
          data-testid="pms-card2-inventory-error"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function RuleGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label className="text-[#251605]">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PolicyToggle({
  id: idProp,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id =
    idProp ??
    `inventory-${label
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase()}`;

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
