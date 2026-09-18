import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
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
  registerActions: (actions: { saveDraft: () => Promise<boolean>; saveAndContinue: () => Promise<boolean> }) => void;
}) {
  const queryClient = useQueryClient();
  const fetchRules = useServerFn(getInventoryRules);
  const persistRules = useServerFn(saveInventoryRules);
  const fetchSummary = useServerFn(getInventorySummary);
  const fetchReady = useServerFn(evaluateCard2InventoryReadiness);
  const [draft, setDraft] = useState<InventoryRulesDraft>(defaultInventoryRules);
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
  const blockers = ready?.blockers ?? (persisted ? [] : ["Save Inventory Rules to create the property configuration."]);
  const stepStatus = ready?.stepStatus ?? card2InventoryStepStatus(false, persisted);
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
      canonicalEngineSellableRoomCount: summary?.canonicalEngineSellableRoomCount ?? 0,
      blockPoliciesConfigured: draft.blockTypes.filter((row) => row.enabled).length,
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
    setDraft((current) => normalizeInventoryRules({ ...current, ...next }));
    setFormError("");
  }

  async function refetchAll() {
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-inventory-rules", restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-inventory-summary", restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ["pms-card2-inventory-ready", restaurantId] });
    const latest = await fetchRules({ data: { restaurantId } });
    setDraft(normalizeInventoryRules(latest.rules));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalized = normalizeInventoryRules(draft);
      const clientIssue = inventoryRulesErrors(normalized)[0] ?? assignmentError;
      if (clientIssue) return { ok: false as const, message: clientIssue };
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
      toast.error(latest.blockers[0] ?? "Inventory Rules is not complete yet.");
      return false;
    }
    return true;
  }

  useEffect(() => {
    registerActions({ saveDraft, saveAndContinue });
  });

  return (
    <div className="space-y-5 scroll-mb-32" data-testid="pms-card2-inventory-form">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-overview">
        <h2 className="font-display text-xl text-[#251605]">Inventory Overview</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Room-level sellable is a configuration dimension. Reservation capacity currently follows the canonical booking
          engine.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Physical Rooms" value={summary?.physicalRoomCount ?? "—"} />
          <Stat label="Room-Level Sellable" value={summary?.roomLevelSellableCount ?? "—"} hint="hotel_rooms.sellable" />
          <Stat label="Room-Level Non-Sellable" value={summary?.roomLevelNonSellableCount ?? "—"} />
          <Stat label="Sellable Room Types" value={summary?.sellableRoomTypeCount ?? "—"} />
          <Stat
            label="Canonical Capacity"
            value={summary?.canonicalEngineSellableRoomCount ?? "—"}
            hint="Existing reservation-capacity engine"
          />
        </div>
        {!persisted ? (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="pms-card2-inventory-not-started">
            No inventory rules saved yet. Defaults are shown and will not write until you save.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-availability">
        <h2 className="font-display text-xl text-[#251605]">Availability Rules</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These are configuration policies. They do not create a second booking engine. Live reservation capacity still
          uses count_sellable_rooms.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PolicyToggle
            label="Sellable Status Required"
            help="Policy for type-level sellable (room_types.sellable). Does not wire hotel_rooms.sellable into booking."
            checked={draft.sellableStatusRequired}
            disabled={!canEdit}
            onChange={(value) => patch({ sellableStatusRequired: value })}
          />
          <PolicyToggle
            label="Operational Availability Required"
            help="Policy corresponding to hotel_rooms.status. Configuration only until the engine is changed."
            checked={draft.operationalAvailabilityRequired}
            disabled={!canEdit}
            onChange={(value) => patch({ operationalAvailabilityRequired: value })}
          />
          <PolicyToggle
            label="Housekeeping Readiness Required"
            help="Housekeeping dimension is separate from operational status. Configuration policy."
            checked={draft.housekeepingReadinessRequired}
            disabled={!canEdit}
            onChange={(value) => patch({ housekeepingReadinessRequired: value })}
          />
          <PolicyToggle
            label="Maintenance Clear Required"
            help="Maintenance dimension is separate from operational status. Configuration policy."
            checked={draft.maintenanceClearRequired}
            disabled={!canEdit}
            onChange={(value) => patch({ maintenanceClearRequired: value })}
          />
          <PolicyToggle
            label="Room Block Removes Inventory"
            help="Block-type policy impact. Dated operational blocks are not created here."
            checked={draft.roomBlockRemovesInventory}
            disabled={!canEdit}
            onChange={(value) => patch({ roomBlockRemovesInventory: value })}
          />
          <PolicyToggle
            label="Out of Order Removes Inventory"
            help="OOO impact policy. Complementary to SET4 OOO/OOS meaning text."
            checked={draft.outOfOrderRemovesInventory}
            disabled={!canEdit}
            onChange={(value) => patch({ outOfOrderRemovesInventory: value })}
          />
          <PolicyToggle
            label="Out of Service Removes Inventory"
            help="OOS impact policy. Complementary to SET4 OOO/OOS meaning text."
            checked={draft.outOfServiceRemovesInventory}
            disabled={!canEdit}
            onChange={(value) => patch({ outOfServiceRemovesInventory: value })}
          />
          <PolicyToggle
            label="Maintenance Affects Availability"
            help="Whether maintenance status should affect availability. Configuration only."
            checked={draft.maintenanceAffectsAvailability}
            disabled={!canEdit}
            onChange={(value) => patch({ maintenanceAffectsAvailability: value })}
          />
          <PolicyToggle
            label="Housekeeping Affects Assignment"
            help="Whether housekeeping status should affect assignment. Configuration only."
            checked={draft.housekeepingAffectsAssignment}
            disabled={!canEdit}
            onChange={(value) => patch({ housekeepingAffectsAssignment: value })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-blocking">
        <h2 className="font-display text-xl text-[#251605]">Room Blocking Rules</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Block type policy only. No room selector, dates, or live block instances.
        </p>
        <div className="mt-4 grid gap-3">
          {draft.blockTypes.map((row) => (
            <div
              key={row.blockType}
              className="rounded-xl border border-[#EDE6D8] p-4"
              data-testid={`pms-card2-inventory-block-${row.blockType}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-[#251605]">{BLOCK_LABELS[row.blockType]}</p>
                <PolicyToggle
                  id={`inventory-block-${row.blockType}-enabled`}
                  label="Enabled"
                  checked={row.enabled}
                  disabled={!canEdit}
                  onChange={(enabled) =>
                    patch({
                      blockTypes: draft.blockTypes.map((item) =>
                        item.blockType === row.blockType ? { ...item, enabled } : item,
                      ),
                    })
                  }
                />
              </div>
              {row.enabled ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <PolicyToggle
                    id={`inventory-block-${row.blockType}-approval`}
                    label="Approval Required"
                    checked={row.approvalRequired}
                    disabled={!canEdit}
                    onChange={(approvalRequired) =>
                      patch({
                        blockTypes: draft.blockTypes.map((item) =>
                          item.blockType === row.blockType ? { ...item, approvalRequired } : item,
                        ),
                      })
                    }
                  />
                  <Field label="Inventory Impact">
                    <Select
                      value={row.inventoryImpact}
                      disabled={!canEdit}
                      onValueChange={(value) =>
                        patch({
                          blockTypes: draft.blockTypes.map((item) =>
                            item.blockType === row.blockType
                              ? { ...item, inventoryImpact: value as InventoryImpact }
                              : item,
                          ),
                        })
                      }
                    >
                      <SelectTrigger aria-label={`${BLOCK_LABELS[row.blockType]} inventory impact`}>
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
                  </Field>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Disabled policies use no inventory impact and do not require approval.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-assignment">
        <h2 className="font-display text-xl text-[#251605]">Room Assignment Rules</h2>
        <h3 className="mt-4 text-sm font-medium text-[#251605]">Assignment Modes</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <PolicyToggle
            label="Automatic Assignment"
            checked={draft.automaticAssignmentAllowed}
            disabled={!canEdit}
            onChange={(value) => patch({ automaticAssignmentAllowed: value })}
          />
          <PolicyToggle
            label="Manual Assignment"
            checked={draft.manualAssignmentAllowed}
            disabled={!canEdit}
            onChange={(value) => patch({ manualAssignmentAllowed: value })}
          />
        </div>
        {assignmentError ? (
          <p className="mt-2 text-sm text-destructive" data-testid="pms-card2-inventory-assignment-error" role="alert">
            {assignmentError}
          </p>
        ) : null}
        <h3 className="mt-4 text-sm font-medium text-[#251605]">Requirements</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <PolicyToggle label="Require Room Type Match" checked={draft.requireRoomTypeMatch} disabled={!canEdit} onChange={(value) => patch({ requireRoomTypeMatch: value })} />
          <PolicyToggle label="Require Occupancy Match" checked={draft.requireOccupancyMatch} disabled={!canEdit} onChange={(value) => patch({ requireOccupancyMatch: value })} />
          <PolicyToggle label="Require Bed Type Match" checked={draft.requireBedTypeMatch} disabled={!canEdit} onChange={(value) => patch({ requireBedTypeMatch: value })} />
          <PolicyToggle label="Require Accessibility Match" checked={draft.requireAccessibilityMatch} disabled={!canEdit} onChange={(value) => patch({ requireAccessibilityMatch: value })} />
          <PolicyToggle label="Require Connecting Room Match" checked={draft.requireConnectingRoomMatch} disabled={!canEdit} onChange={(value) => patch({ requireConnectingRoomMatch: value })} />
        </div>
        <h3 className="mt-4 text-sm font-medium text-[#251605]">Preferences</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <PolicyToggle label="Use Floor Preference" checked={draft.useFloorPreference} disabled={!canEdit} onChange={(value) => patch({ useFloorPreference: value })} />
          <PolicyToggle label="Use Building Preference" checked={draft.useBuildingPreference} disabled={!canEdit} onChange={(value) => patch({ useBuildingPreference: value })} />
          <PolicyToggle label="Use Guest Preference" checked={draft.useGuestPreference} disabled={!canEdit} onChange={(value) => patch({ useGuestPreference: value })} />
        </div>
        <h3 className="mt-4 text-sm font-medium text-[#251605]">Operational Readiness</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <PolicyToggle label="Require Housekeeping Readiness" checked={draft.requireHousekeepingReadiness} disabled={!canEdit} onChange={(value) => patch({ requireHousekeepingReadiness: value })} />
          <PolicyToggle label="Require Maintenance Availability" checked={draft.requireMaintenanceAvailability} disabled={!canEdit} onChange={(value) => patch({ requireMaintenanceAvailability: value })} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-move">
        <h2 className="font-display text-xl text-[#251605]">Room Move Rules</h2>
        <p className="mt-2 text-sm text-muted-foreground">Policy only. This is not the live Front Office move workflow.</p>
        <div className="mt-4">
          <PolicyToggle
            label="Room Move Allowed"
            checked={draft.roomMoveAllowed}
            disabled={!canEdit}
            onChange={(value) => patch({ roomMoveAllowed: value })}
          />
        </div>
        {draft.roomMoveAllowed ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <PolicyToggle label="Room Type Change Allowed" checked={draft.roomTypeChangeAllowed} disabled={!canEdit} onChange={(value) => patch({ roomTypeChangeAllowed: value })} />
            <PolicyToggle label="Rate Recalculation Required" checked={draft.rateRecalculationRequired} disabled={!canEdit} onChange={(value) => patch({ rateRecalculationRequired: value })} />
            <PolicyToggle id="inventory-move-approval-required" label="Approval Required" checked={draft.moveApprovalRequired} disabled={!canEdit} onChange={(value) => patch({ moveApprovalRequired: value })} />
            <PolicyToggle label="Reason Required" checked={draft.moveReasonRequired} disabled={!canEdit} onChange={(value) => patch({ moveReasonRequired: value })} />
            <PolicyToggle label="Inventory Recalculation Required" checked={draft.inventoryRecalculationRequired} disabled={!canEdit} onChange={(value) => patch({ inventoryRecalculationRequired: value })} />
            <PolicyToggle label="Housekeeping Update Required" checked={draft.housekeepingUpdateRequired} disabled={!canEdit} onChange={(value) => patch({ housekeepingUpdateRequired: value })} />
            <PolicyToggle label="Maintenance Validation Required" checked={draft.maintenanceValidationRequired} disabled={!canEdit} onChange={(value) => patch({ maintenanceValidationRequired: value })} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Dependent move flags are off while room moves are not allowed.</p>
        )}
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm" data-testid="pms-card2-inventory-overbooking">
        <h2 className="font-display text-xl text-[#251605]">Overbooking Rules</h2>
        <PolicyToggle
          label="Overbooking Allowed"
          help="Stores policy only. Does not enable live oversell."
          checked={draft.overbookingAllowed}
          disabled={!canEdit}
          onChange={(value) => patch({ overbookingAllowed: value })}
        />
        {draft.overbookingAllowed ? (
          <div className="mt-3 space-y-3">
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-[#251605]"
              data-testid="pms-card2-inventory-overbooking-warning"
              role="status"
            >
              <p>{OVERBOOKING_CAPACITY_NOTE}</p>
              <p className="mt-1">
                Room-type and date-based limits are policy flags only and are not yet operational.
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
                      maximumOverbooking: event.target.value === "" ? null : Number(event.target.value),
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
                      percentageLimit: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  aria-label="Percentage limit"
                />
              </Field>
              <PolicyToggle label="Room-Type Limit Enabled" help="Forward-looking flag. Not operational." checked={draft.roomTypeLimitEnabled} disabled={!canEdit} onChange={(value) => patch({ roomTypeLimitEnabled: value })} />
              <PolicyToggle label="Date-Based Limit Enabled" help="Forward-looking flag. Not operational." checked={draft.dateBasedLimitEnabled} disabled={!canEdit} onChange={(value) => patch({ dateBasedLimitEnabled: value })} />
              <PolicyToggle label="Manager Approval Required" checked={draft.managerApprovalRequired} disabled={!canEdit} onChange={(value) => patch({ managerApprovalRequired: value })} />
              <PolicyToggle label="Override Permission Required" checked={draft.overridePermissionRequired} disabled={!canEdit} onChange={(value) => patch({ overridePermissionRequired: value })} />
              <PolicyToggle label="Overbooking Reason Required" checked={draft.overbookingReasonRequired} disabled={!canEdit} onChange={(value) => patch({ overbookingReasonRequired: value })} />
              <PolicyToggle label="Overbooking Alert Enabled" checked={draft.overbookingAlertEnabled} disabled={!canEdit} onChange={(value) => patch({ overbookingAlertEnabled: value })} />
            </div>
          </div>
        ) : null}
      </section>

      {formError ? (
        <p className="text-sm text-destructive" data-testid="pms-card2-inventory-error" role="alert">
          {formError}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#EDE6D8] bg-[#F7F4EE] px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-[#251605]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
  const id = idProp ?? `inventory-${label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-xl border border-[#EDE6D8] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-[#251605]">
          {label}
        </Label>
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </div>
      {help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}
