import type {
  InventoryBlockType,
  InventoryImpact,
  InventoryRulesDraft,
} from "@/packages/pms/lib/inventory-rules-card2.server";

export type RuleFlagKey =
  | "sellableStatusRequired"
  | "maintenanceAffectsAvailability"
  | "housekeepingAffectsAssignment"
  | "requireHousekeepingReadiness"
  | "requireMaintenanceAvailability"
  | "requireRoomTypeMatch"
  | "requireOccupancyMatch"
  | "requireBedTypeMatch"
  | "requireAccessibilityMatch"
  | "requireConnectingRoomMatch"
  | "useBuildingPreference"
  | "useFloorPreference"
  | "useGuestPreference";

export type RuleKind = "availability" | "blocking" | "preference";

export interface RuleDefinition {
  key: RuleFlagKey;
  label: string;
  help: string;
  kind: RuleKind;
  /** Applies only when Assignment Eligibility supplies the guest requirement. */
  inspectorOnly?: string;
}

export const AVAILABILITY_RULES: RuleDefinition[] = [
  {
    key: "sellableStatusRequired",
    label: "Sellable room required",
    help: "Only rooms marked sellable count toward availability and can be assigned.",
    kind: "availability",
  },
  {
    key: "maintenanceAffectsAvailability",
    label: "Maintenance affects availability",
    help: "Rooms whose maintenance status is not Good are removed from sellable availability.",
    kind: "availability",
  },
];

export const OPERATIONAL_REQUIREMENT_RULES: RuleDefinition[] = [
  {
    key: "housekeepingAffectsAssignment",
    label: "Housekeeping affects assignment",
    help: "Rooms that do not meet the property's clean and inspection settings cannot be assigned.",
    kind: "blocking",
  },
  {
    key: "requireHousekeepingReadiness",
    label: "Require housekeeping readiness",
    help: "Runs the same readiness check as Housekeeping affects assignment.",
    kind: "blocking",
  },
  {
    key: "requireMaintenanceAvailability",
    label: "Require maintenance-clear room",
    help: "Rooms whose maintenance status is set to prevent assignment cannot be assigned.",
    kind: "blocking",
  },
  {
    key: "requireRoomTypeMatch",
    label: "Require room type match",
    help: "The room must be the reservation's room type.",
    kind: "blocking",
  },
  {
    key: "requireOccupancyMatch",
    label: "Occupancy match required",
    help: "Adults and children cannot exceed the room type's maximum occupancy.",
    kind: "blocking",
  },
];

const INSPECTOR_NOTE = "Checked when this requirement is entered in Assignment Eligibility.";

export const GUEST_MATCHING_RULES: RuleDefinition[] = [
  {
    key: "requireBedTypeMatch",
    label: "Match bed preference",
    help: "Rooms without the requested bed type cannot be assigned.",
    kind: "blocking",
    inspectorOnly: INSPECTOR_NOTE,
  },
  {
    key: "requireAccessibilityMatch",
    label: "Accessibility match",
    help: "When an accessible room is required, rooms that are not accessible cannot be assigned.",
    kind: "blocking",
    inspectorOnly: INSPECTOR_NOTE,
  },
  {
    key: "requireConnectingRoomMatch",
    label: "Connecting-room match",
    help: "When a connecting room is required, rooms without a connecting link cannot be assigned.",
    kind: "blocking",
    inspectorOnly: INSPECTOR_NOTE,
  },
  {
    key: "useBuildingPreference",
    label: "Match building preference",
    help: "Rooms in the preferred building rank higher; other buildings show a warning.",
    kind: "preference",
    inspectorOnly: INSPECTOR_NOTE,
  },
  {
    key: "useFloorPreference",
    label: "Match floor preference",
    help: "Rooms on the preferred floor rank higher; other floors show a warning.",
    kind: "preference",
    inspectorOnly: INSPECTOR_NOTE,
  },
  {
    key: "useGuestPreference",
    label: "Match guest room preferences",
    help: "A matched guest preference ranks higher; an unmatched one shows a warning.",
    kind: "preference",
    inspectorOnly: "Checked when Match guest preferences is selected in Assignment Eligibility.",
  },
];

export const ASSIGNMENT_RULES = [...OPERATIONAL_REQUIREMENT_RULES, ...GUEST_MATCHING_RULES];

export function ruleStateLabel(kind: RuleKind, on: boolean): string {
  if (!on) return "Disabled";
  if (kind === "preference") return "Preference";
  if (kind === "blocking") return "Blocking";
  return "Applied";
}

export const BLOCK_TYPE_DESCRIPTIONS: Record<InventoryBlockType, string> = {
  temporary: "Short-term operational inventory hold",
  permanent: "Long-term hold kept until it is released",
  maintenance: "Room held due to repair or maintenance",
  vip: "Room held for a VIP arrival",
  group: "Inventory held for group or block business",
  owner: "Owner-use hold",
  internal_use: "Internal hotel operational use",
  inspection: "Room inspection hold",
  renovation: "Room held during renovation",
};

export const IMPACT_STAFF_LABELS: Record<InventoryImpact, string> = {
  no_inventory_impact: "No inventory impact",
  remove_from_inventory: "Remove from inventory",
  assignment_only: "Block assignment only",
  warning_only: "Warning only",
};

export const IMPACT_STAFF_HELP: Record<InventoryImpact, string> = {
  no_inventory_impact: "Recorded for reference; availability and assignment are unchanged.",
  remove_from_inventory: "Held rooms leave sellable availability and cannot be assigned.",
  assignment_only:
    "Rooms stay in the availability count but cannot be assigned. Not available for quantity blocks.",
  warning_only: "Assignment shows a warning for the held rooms.",
};

export function blockTypeLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sameRules(left: InventoryRulesDraft, right: InventoryRulesDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function rulesChanged(
  saved: InventoryRulesDraft | null,
  draft: InventoryRulesDraft,
): boolean {
  if (!saved) return false;
  return !sameRules(saved, draft);
}

/** Staff consequence lines for changes that alter who can be sold or assigned. */
export function highImpactConsequences(
  saved: InventoryRulesDraft,
  draft: InventoryRulesDraft,
): string[] {
  const lines: string[] = [];
  if (saved.sellableStatusRequired && !draft.sellableStatusRequired) {
    lines.push("Rooms marked not sellable will count toward availability and can be assigned.");
  }
  if (saved.maintenanceAffectsAvailability !== draft.maintenanceAffectsAvailability) {
    lines.push(
      draft.maintenanceAffectsAvailability
        ? "Rooms whose maintenance status is not Good will leave sellable availability."
        : "Rooms whose maintenance status is not Good will count as sellable again.",
    );
  }
  if (saved.requireRoomTypeMatch && !draft.requireRoomTypeMatch) {
    lines.push("Reservations can be assigned a room of a different room type.");
  }
  if (saved.requireOccupancyMatch && !draft.requireOccupancyMatch) {
    lines.push("Rooms can be assigned to parties larger than the room type's maximum occupancy.");
  }
  for (const before of saved.blockTypes) {
    const after = draft.blockTypes.find((row) => row.blockType === before.blockType);
    if (!after || !before.enabled) continue;
    const label = blockTypeLabel(before.blockType);
    if (!after.enabled) {
      lines.push(
        `${label} blocks can no longer be created, and existing draft or pending ${label} blocks cannot be approved or activated.`,
      );
    } else if (
      after.inventoryImpact !== before.inventoryImpact ||
      after.approvalRequired !== before.approvalRequired
    ) {
      lines.push(
        `Existing draft or pending ${label} blocks keep their old settings and cannot be approved or activated; create them again to use the new settings.`,
      );
    }
  }
  return lines;
}
