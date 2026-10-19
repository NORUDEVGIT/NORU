/**
 * Card 2 Phase 4 — Inventory Rules validators (pure).
 * Configuration only. Does not change count_sellable_rooms / assert_reservation_capacity.
 */
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
  type PropertySetupStatus,
} from "./pms-property-setup-card1.ts";

export const INVENTORY_BLOCK_TYPES = [
  "temporary",
  "permanent",
  "maintenance",
  "vip",
  "group",
  "owner",
  "internal_use",
  "inspection",
  "renovation",
] as const;
export type InventoryBlockType = (typeof INVENTORY_BLOCK_TYPES)[number];

export const INVENTORY_IMPACTS = [
  "remove_from_inventory",
  "assignment_only",
  "warning_only",
  "no_inventory_impact",
] as const;
export type InventoryImpact = (typeof INVENTORY_IMPACTS)[number];

export const OVERBOOKING_CAPACITY_NOTE =
  "Each room type has its own nightly allowance. When both a maximum and a percentage are set, the smaller limit is used. Percentage is calculated from that room type's physical sellable capacity and rounded down.";

export const OVERBOOKING_FUTURE_LIMITS_NOTE =
  "When this is on, a date range replaces that room type's allowance for those nights. Overlapping ranges use the smaller allowance. Other nights keep the room-type allowance.";

export const OVERBOOKING_AUTHORIZATION_NOTE =
  "Manager approval and a reason are required only when those switches are on. Normal bookings still stop at physical availability.";

export type InventoryBlockTypeRule = {
  blockType: InventoryBlockType;
  enabled: boolean;
  approvalRequired: boolean;
  inventoryImpact: InventoryImpact;
};

export type InventoryRulesDraft = {
  sellableStatusRequired: boolean;
  maintenanceAffectsAvailability: boolean;
  housekeepingAffectsAssignment: boolean;
  requireRoomTypeMatch: boolean;
  requireOccupancyMatch: boolean;
  requireBedTypeMatch: boolean;
  requireAccessibilityMatch: boolean;
  requireConnectingRoomMatch: boolean;
  useFloorPreference: boolean;
  useBuildingPreference: boolean;
  useGuestPreference: boolean;
  requireHousekeepingReadiness: boolean;
  requireMaintenanceAvailability: boolean;
  overbookingAllowed: boolean;
  maximumOverbooking: number | null;
  percentageLimit: number | null;
  roomTypeLimitEnabled: boolean;
  dateBasedLimitEnabled: boolean;
  managerApprovalRequired: boolean;
  overridePermissionRequired: boolean;
  overbookingReasonRequired: boolean;
  overbookingAlertEnabled: boolean;
  blockTypes: InventoryBlockTypeRule[];
};

function isBool(value: unknown): value is boolean {
  return value === true || value === false;
}

export function isInventoryBlockType(value: string): value is InventoryBlockType {
  return (INVENTORY_BLOCK_TYPES as readonly string[]).includes(value);
}

export function isInventoryImpact(value: string): value is InventoryImpact {
  return (INVENTORY_IMPACTS as readonly string[]).includes(value);
}

export function defaultBlockTypeRules(): InventoryBlockTypeRule[] {
  return INVENTORY_BLOCK_TYPES.map((blockType) => ({
    blockType,
    enabled: false,
    approvalRequired: false,
    inventoryImpact: "no_inventory_impact" as const,
  }));
}

export function defaultInventoryRules(): InventoryRulesDraft {
  return {
    sellableStatusRequired: true,
    maintenanceAffectsAvailability: false,
    housekeepingAffectsAssignment: false,
    requireRoomTypeMatch: true,
    requireOccupancyMatch: false,
    requireBedTypeMatch: false,
    requireAccessibilityMatch: false,
    requireConnectingRoomMatch: false,
    useFloorPreference: false,
    useBuildingPreference: false,
    useGuestPreference: false,
    requireHousekeepingReadiness: false,
    requireMaintenanceAvailability: false,
    overbookingAllowed: false,
    maximumOverbooking: null,
    percentageLimit: null,
    roomTypeLimitEnabled: false,
    dateBasedLimitEnabled: false,
    managerApprovalRequired: false,
    overridePermissionRequired: false,
    overbookingReasonRequired: false,
    overbookingAlertEnabled: false,
    blockTypes: defaultBlockTypeRules(),
  };
}

export function mergeBlockTypeRules(rows: InventoryBlockTypeRule[]): InventoryBlockTypeRule[] {
  const byType = new Map(rows.map((row) => [row.blockType, row]));
  return INVENTORY_BLOCK_TYPES.map((blockType) => {
    const existing = byType.get(blockType);
    return existing
      ? normalizeBlockTypeRule(existing)
      : {
          blockType,
          enabled: false,
          approvalRequired: false,
          inventoryImpact: "no_inventory_impact" as const,
        };
  });
}

export function normalizeBlockTypeRule(row: InventoryBlockTypeRule): InventoryBlockTypeRule {
  if (row.enabled) return { ...row };
  return {
    ...row,
    approvalRequired: false,
    inventoryImpact: "no_inventory_impact",
  };
}

export function normalizeInventoryRules(draft: InventoryRulesDraft): InventoryRulesDraft {
  const next: InventoryRulesDraft = {
    ...draft,
    blockTypes: mergeBlockTypeRules(draft.blockTypes ?? []),
  };
  if (!next.overbookingAllowed) {
    next.maximumOverbooking = null;
    next.percentageLimit = null;
    next.roomTypeLimitEnabled = false;
    next.dateBasedLimitEnabled = false;
    next.managerApprovalRequired = false;
    next.overridePermissionRequired = false;
    next.overbookingReasonRequired = false;
    next.overbookingAlertEnabled = false;
  } else {
    next.roomTypeLimitEnabled = false;
    next.overridePermissionRequired = false;
  }
  return next;
}

export function inventoryRulesErrors(draft: InventoryRulesDraft): string[] {
  const errors: string[] = [];
  const boolFields: Array<keyof InventoryRulesDraft> = [
    "sellableStatusRequired",
    "maintenanceAffectsAvailability",
    "housekeepingAffectsAssignment",
    "requireRoomTypeMatch",
    "requireOccupancyMatch",
    "requireBedTypeMatch",
    "requireAccessibilityMatch",
    "requireConnectingRoomMatch",
    "useFloorPreference",
    "useBuildingPreference",
    "useGuestPreference",
    "requireHousekeepingReadiness",
    "requireMaintenanceAvailability",
    "overbookingAllowed",
    "roomTypeLimitEnabled",
    "dateBasedLimitEnabled",
    "managerApprovalRequired",
    "overridePermissionRequired",
    "overbookingReasonRequired",
    "overbookingAlertEnabled",
  ];
  for (const key of boolFields) {
    if (!isBool(draft[key])) errors.push("Inventory policy flags must be true or false.");
  }
  if (errors.length > 0) return Array.from(new Set(errors));

  if (draft.maximumOverbooking != null) {
    if (!Number.isInteger(draft.maximumOverbooking) || draft.maximumOverbooking < 0) {
      errors.push("Maximum overbooking must be empty or an integer of 0 or more.");
    }
  }
  if (draft.percentageLimit != null) {
    if (typeof draft.percentageLimit !== "number" || !Number.isFinite(draft.percentageLimit)) {
      errors.push("Percentage limit must be empty or a number between 0 and 100.");
    } else if (draft.percentageLimit < 0 || draft.percentageLimit > 100) {
      errors.push("Percentage limit must be empty or a number between 0 and 100.");
    }
  }
  if (!Array.isArray(draft.blockTypes)) {
    errors.push("Block-type policy must include all nine supported types.");
    return errors;
  }
  const seen = new Set<string>();
  for (const row of draft.blockTypes) {
    if (!isInventoryBlockType(row.blockType)) {
      errors.push("Unknown block type.");
      continue;
    }
    if (seen.has(row.blockType)) errors.push("Duplicate block type.");
    seen.add(row.blockType);
    if (!isBool(row.enabled) || !isBool(row.approvalRequired)) {
      errors.push("Block-type flags must be true or false.");
    }
    if (!isInventoryImpact(row.inventoryImpact)) errors.push("Unknown inventory impact.");
  }
  for (const expected of INVENTORY_BLOCK_TYPES) {
    if (!seen.has(expected)) errors.push("Block-type policy must include all nine supported types.");
  }
  return Array.from(new Set(errors));
}

export type InventoryReadiness = {
  ready: boolean;
  blockers: string[];
  configuredButNotOperational: boolean;
};

export function evaluateCard2InventoryReadiness(input: {
  persisted: boolean;
  rules: InventoryRulesDraft;
}): InventoryReadiness {
  const configuredButNotOperational = false;
  if (!input.persisted) {
    return {
      ready: false,
      blockers: ["Save Inventory Rules to create the property configuration."],
      configuredButNotOperational: false,
    };
  }
  const normalized = normalizeInventoryRules(input.rules);
  const blockers = inventoryRulesErrors(normalized);
  return {
    ready: blockers.length === 0,
    blockers,
    configuredButNotOperational,
  };
}

export function card2InventoryStepStatus(ready: boolean, hasStarted: boolean): PropertySetupCardStatus {
  if (ready) return "complete";
  if (hasStarted) return "in_progress";
  return "not_started";
}

export function mergeCard2InventoryStatus(
  stored: unknown,
  stepStatus: PropertySetupCardStatus,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  const cards = { ...parsed.cards };
  if (cards["rooms-inventory"] === "complete") {
    cards["rooms-inventory"] = "in_progress";
  } else if (stepStatus !== "not_started" && cards["rooms-inventory"] !== "in_progress") {
    cards["rooms-inventory"] = "in_progress";
  }
  return {
    ...parsed,
    cards,
    card2Steps: { ...parsed.card2Steps, "inventory-rules": stepStatus },
  };
}
