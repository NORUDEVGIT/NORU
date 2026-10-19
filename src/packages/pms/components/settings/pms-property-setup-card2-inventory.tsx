import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  OVERBOOKING_AUTHORIZATION_NOTE,
  OVERBOOKING_CAPACITY_NOTE,
  OVERBOOKING_FUTURE_LIMITS_NOTE,
  card2InventoryStepStatus,
  defaultInventoryRules,
  inventoryRulesErrors,
  normalizeInventoryRules,
  type InventoryImpact,
  type InventoryRulesDraft,
} from "@/packages/pms/lib/inventory-rules-card2.server";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import { RoomTypeOverbookingEditor } from "@/packages/pms/components/settings/room-type-overbooking-editor";

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
  const sectionId = testId?.replace(/^pms-card2-inventory-/, "");
  return (
    <section
      id={sectionId}
      className="scroll-mb-32 rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm scroll-mt-6"
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
      const clientIssue = inventoryRulesErrors(normalized)[0];

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetSection = new URLSearchParams(window.location.search).get("section");
    if (targetSection) {
      const el =
        document.getElementById(targetSection) ||
        document.querySelector(`[data-testid*="${targetSection}"]`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, []);

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
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
        description="Control required matches, preferences, and readiness checks."
        testId="pms-card2-inventory-assignment"
      >
        <div className="space-y-5">
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
        title="Overbooking Rules"
        description="The property switch turns overbooking on. Each room type has its own allowance. This does not add rooms to ordinary availability."
        testId="pms-card2-inventory-overbooking"
      >
        <PolicyToggle
          label="Overbooking Allowed"
          help="Allows an owner or manager to explicitly overbook. Normal bookings still stop at physical availability."
          checked={draft.overbookingAllowed}
          disabled={!canEdit}
          onChange={(value) => patch({ overbookingAllowed: value })}
        />

        {draft.overbookingAllowed ? (
          <div className="mt-4 space-y-4">
            <RoomTypeOverbookingEditor restaurantId={restaurantId} canEdit={canEdit} />

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <PolicyToggle
                label="Date-Based Limit Enabled"
                help={OVERBOOKING_FUTURE_LIMITS_NOTE}
                checked={false}
                disabled
                onChange={() => undefined}
              />

              <PolicyToggle
                label="Manager Approval Required"
                help="Locked on. Only an owner or manager can confirm an overbooking."
                checked
                disabled
                onChange={() => undefined}
              />

              <PolicyToggle
                label="Override Permission Required"
                help="Locked on. There is no separate override permission in V1."
                checked
                disabled
                onChange={() => undefined}
              />

              <PolicyToggle
                label="Overbooking Reason Required"
                help="Locked on. Every overbooking confirmation stores a reason."
                checked
                disabled
                onChange={() => undefined}
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
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#5C5346]">{title}</h3>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
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
    <div className="group flex flex-col justify-between rounded-lg border border-[#EDE6D8] bg-[#FAF8F5]/30 px-3 py-2.5 transition-colors hover:border-[#DED7CD] hover:bg-[#FAF8F5]/70">
      <div className="flex items-center justify-between gap-2.5">
        <Label htmlFor={id} className="cursor-pointer text-xs font-semibold text-[#251605]">
          {label}
        </Label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          className="data-[state=checked]:bg-[#C89933] shrink-0"
          onCheckedChange={onChange}
        />
      </div>
      {help ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
