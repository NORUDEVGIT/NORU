import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  OVERBOOKING_CAPACITY_NOTE,
  defaultInventoryRules,
  evaluateCard2InventoryReadiness as evaluateInventoryRulesReadiness,
  inventoryRulesErrors,
  isInventoryBlockType,
  isInventoryImpact,
  mergeBlockTypeRules,
  mergeCard2InventoryStatus,
  card2InventoryStepStatus,
  normalizeInventoryRules,
  type InventoryBlockTypeRule,
  type InventoryRulesDraft,
} from "./inventory-rules-card2.server";

const idSchema = z.string().uuid();

type DbClient = {
  from: (table: string) => any;
};

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

const blockTypeSchema = z.object({
  blockType: z.string(),
  enabled: z.boolean(),
  approvalRequired: z.boolean(),
  inventoryImpact: z.string(),
});

const saveInventoryRulesInput = z.object({
  restaurantId: idSchema,
  sellableStatusRequired: z.boolean(),
  operationalAvailabilityRequired: z.boolean(),
  housekeepingReadinessRequired: z.boolean(),
  maintenanceClearRequired: z.boolean(),
  roomBlockRemovesInventory: z.boolean(),
  outOfOrderRemovesInventory: z.boolean(),
  outOfServiceRemovesInventory: z.boolean(),
  maintenanceAffectsAvailability: z.boolean(),
  housekeepingAffectsAssignment: z.boolean(),
  automaticAssignmentAllowed: z.boolean(),
  manualAssignmentAllowed: z.boolean(),
  requireRoomTypeMatch: z.boolean(),
  requireOccupancyMatch: z.boolean(),
  requireBedTypeMatch: z.boolean(),
  requireAccessibilityMatch: z.boolean(),
  requireConnectingRoomMatch: z.boolean(),
  useFloorPreference: z.boolean(),
  useBuildingPreference: z.boolean(),
  useGuestPreference: z.boolean(),
  requireHousekeepingReadiness: z.boolean(),
  requireMaintenanceAvailability: z.boolean(),
  roomMoveAllowed: z.boolean(),
  roomTypeChangeAllowed: z.boolean(),
  rateRecalculationRequired: z.boolean(),
  moveApprovalRequired: z.boolean(),
  moveReasonRequired: z.boolean(),
  inventoryRecalculationRequired: z.boolean(),
  housekeepingUpdateRequired: z.boolean(),
  maintenanceValidationRequired: z.boolean(),
  overbookingAllowed: z.boolean(),
  maximumOverbooking: z.number().int().nullable(),
  percentageLimit: z.number().nullable(),
  roomTypeLimitEnabled: z.boolean(),
  dateBasedLimitEnabled: z.boolean(),
  managerApprovalRequired: z.boolean(),
  overridePermissionRequired: z.boolean(),
  overbookingReasonRequired: z.boolean(),
  overbookingAlertEnabled: z.boolean(),
  blockTypes: z.array(blockTypeSchema),
});

type ParentRow = Record<string, unknown>;

function mapBlockRow(row: {
  block_type?: string;
  enabled?: boolean;
  approval_required?: boolean;
  inventory_impact?: string;
}): InventoryBlockTypeRule | null {
  const blockType = String(row.block_type ?? "");
  const inventoryImpact = String(row.inventory_impact ?? "no_inventory_impact");
  if (!isInventoryBlockType(blockType) || !isInventoryImpact(inventoryImpact)) return null;
  return {
    blockType,
    enabled: Boolean(row.enabled),
    approvalRequired: Boolean(row.approval_required),
    inventoryImpact,
  };
}

function mapParent(row: ParentRow, blockTypes: InventoryBlockTypeRule[]): InventoryRulesDraft {
  return {
    sellableStatusRequired: Boolean(row.sellable_status_required),
    operationalAvailabilityRequired: Boolean(row.operational_availability_required),
    housekeepingReadinessRequired: Boolean(row.housekeeping_readiness_required),
    maintenanceClearRequired: Boolean(row.maintenance_clear_required),
    roomBlockRemovesInventory: Boolean(row.room_block_removes_inventory),
    outOfOrderRemovesInventory: Boolean(row.out_of_order_removes_inventory),
    outOfServiceRemovesInventory: Boolean(row.out_of_service_removes_inventory),
    maintenanceAffectsAvailability: Boolean(row.maintenance_affects_availability),
    housekeepingAffectsAssignment: Boolean(row.housekeeping_affects_assignment),
    automaticAssignmentAllowed: Boolean(row.automatic_assignment_allowed),
    manualAssignmentAllowed: Boolean(row.manual_assignment_allowed),
    requireRoomTypeMatch: Boolean(row.require_room_type_match),
    requireOccupancyMatch: Boolean(row.require_occupancy_match),
    requireBedTypeMatch: Boolean(row.require_bed_type_match),
    requireAccessibilityMatch: Boolean(row.require_accessibility_match),
    requireConnectingRoomMatch: Boolean(row.require_connecting_room_match),
    useFloorPreference: Boolean(row.use_floor_preference),
    useBuildingPreference: Boolean(row.use_building_preference),
    useGuestPreference: Boolean(row.use_guest_preference),
    requireHousekeepingReadiness: Boolean(row.require_housekeeping_readiness),
    requireMaintenanceAvailability: Boolean(row.require_maintenance_availability),
    roomMoveAllowed: Boolean(row.room_move_allowed),
    roomTypeChangeAllowed: Boolean(row.room_type_change_allowed),
    rateRecalculationRequired: Boolean(row.rate_recalculation_required),
    moveApprovalRequired: Boolean(row.move_approval_required),
    moveReasonRequired: Boolean(row.move_reason_required),
    inventoryRecalculationRequired: Boolean(row.inventory_recalculation_required),
    housekeepingUpdateRequired: Boolean(row.housekeeping_update_required),
    maintenanceValidationRequired: Boolean(row.maintenance_validation_required),
    overbookingAllowed: Boolean(row.overbooking_allowed),
    maximumOverbooking: row.maximum_overbooking == null ? null : Number(row.maximum_overbooking),
    percentageLimit: row.percentage_limit == null ? null : Number(row.percentage_limit),
    roomTypeLimitEnabled: Boolean(row.room_type_limit_enabled),
    dateBasedLimitEnabled: Boolean(row.date_based_limit_enabled),
    managerApprovalRequired: Boolean(row.manager_approval_required),
    overridePermissionRequired: Boolean(row.override_permission_required),
    overbookingReasonRequired: Boolean(row.overbooking_reason_required),
    overbookingAlertEnabled: Boolean(row.overbooking_alert_enabled),
    blockTypes: mergeBlockTypeRules(blockTypes),
  };
}

function parentPayload(restaurantId: string, rules: InventoryRulesDraft) {
  return {
    restaurant_id: restaurantId,
    sellable_status_required: rules.sellableStatusRequired,
    operational_availability_required: rules.operationalAvailabilityRequired,
    housekeeping_readiness_required: rules.housekeepingReadinessRequired,
    maintenance_clear_required: rules.maintenanceClearRequired,
    room_block_removes_inventory: rules.roomBlockRemovesInventory,
    out_of_order_removes_inventory: rules.outOfOrderRemovesInventory,
    out_of_service_removes_inventory: rules.outOfServiceRemovesInventory,
    maintenance_affects_availability: rules.maintenanceAffectsAvailability,
    housekeeping_affects_assignment: rules.housekeepingAffectsAssignment,
    automatic_assignment_allowed: rules.automaticAssignmentAllowed,
    manual_assignment_allowed: rules.manualAssignmentAllowed,
    require_room_type_match: rules.requireRoomTypeMatch,
    require_occupancy_match: rules.requireOccupancyMatch,
    require_bed_type_match: rules.requireBedTypeMatch,
    require_accessibility_match: rules.requireAccessibilityMatch,
    require_connecting_room_match: rules.requireConnectingRoomMatch,
    use_floor_preference: rules.useFloorPreference,
    use_building_preference: rules.useBuildingPreference,
    use_guest_preference: rules.useGuestPreference,
    require_housekeeping_readiness: rules.requireHousekeepingReadiness,
    require_maintenance_availability: rules.requireMaintenanceAvailability,
    room_move_allowed: rules.roomMoveAllowed,
    room_type_change_allowed: rules.roomTypeChangeAllowed,
    rate_recalculation_required: rules.rateRecalculationRequired,
    move_approval_required: rules.moveApprovalRequired,
    move_reason_required: rules.moveReasonRequired,
    inventory_recalculation_required: rules.inventoryRecalculationRequired,
    housekeeping_update_required: rules.housekeepingUpdateRequired,
    maintenance_validation_required: rules.maintenanceValidationRequired,
    overbooking_allowed: rules.overbookingAllowed,
    maximum_overbooking: rules.maximumOverbooking,
    percentage_limit: rules.percentageLimit,
    room_type_limit_enabled: rules.roomTypeLimitEnabled,
    date_based_limit_enabled: rules.dateBasedLimitEnabled,
    manager_approval_required: rules.managerApprovalRequired,
    override_permission_required: rules.overridePermissionRequired,
    overbooking_reason_required: rules.overbookingReasonRequired,
    overbooking_alert_enabled: rules.overbookingAlertEnabled,
  };
}

function overbookingMeta(allowed: boolean) {
  return {
    configuredButNotOperational: allowed,
    capacityNote: OVERBOOKING_CAPACITY_NOTE,
  };
}

async function loadRules(supabase: DbClient, restaurantId: string) {
  const [{ data: parent }, { data: children }] = await Promise.all([
    supabase.from("pms_inventory_rules").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    supabase
      .from("pms_inventory_block_type_rules")
      .select("block_type, enabled, approval_required, inventory_impact")
      .eq("restaurant_id", restaurantId),
  ]);
  const blockTypes = ((children ?? []) as Array<{
    block_type?: string;
    enabled?: boolean;
    approval_required?: boolean;
    inventory_impact?: string;
  }>)
    .map(mapBlockRow)
    .filter((row): row is InventoryBlockTypeRule => row != null);
  return { parent: parent as ParentRow | null, blockTypes };
}

export async function persistCard2InventoryReadiness(
  supabase: DbClient,
  restaurantId: string,
): Promise<void> {
  const loaded = await loadRules(supabase, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  const rules = loaded.parent
    ? mapParent(loaded.parent, loaded.blockTypes)
    : defaultInventoryRules();
  const readiness = evaluateInventoryRulesReadiness({
    persisted: Boolean(loaded.parent),
    rules,
  });
  const next = mergeCard2InventoryStatus(
    restaurant?.pms_property_setup_status,
    card2InventoryStepStatus(readiness.ready, Boolean(loaded.parent)),
  );
  await supabaseAdmin
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
}

export const getInventoryRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const loaded = await loadRules(pmsDb(context.supabase), data.restaurantId);
    if (!loaded.parent) {
      const rules = defaultInventoryRules();
      return {
        persisted: false,
        rules,
        overbooking: overbookingMeta(false),
      };
    }
    const rules = mapParent(loaded.parent, loaded.blockTypes);
    return {
      persisted: true,
      rules,
      overbooking: overbookingMeta(rules.overbookingAllowed),
    };
  });

export const saveInventoryRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInventoryRulesInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const mappedBlocks: InventoryBlockTypeRule[] = [];
    for (const row of data.blockTypes) {
      if (!isInventoryBlockType(row.blockType) || !isInventoryImpact(row.inventoryImpact)) {
        return { ok: false as const, message: "Unknown block type or inventory impact." };
      }
      mappedBlocks.push({
        blockType: row.blockType,
        enabled: row.enabled,
        approvalRequired: row.approvalRequired,
        inventoryImpact: row.inventoryImpact,
      });
    }
    const normalized = normalizeInventoryRules({
      ...data,
      blockTypes: mappedBlocks,
    });
    const issue = inventoryRulesErrors(normalized)[0];
    if (issue) return { ok: false as const, message: issue };

    const db = pmsDb(context.supabase);
    const parentResult = await db
      .from("pms_inventory_rules")
      .upsert(parentPayload(data.restaurantId, normalized), { onConflict: "restaurant_id" })
      .select("id")
      .maybeSingle();
    if (parentResult.error) {
      return { ok: false as const, message: parentResult.error.message ?? "Could not save inventory rules." };
    }

    const childRows = normalized.blockTypes.map((row) => ({
      restaurant_id: data.restaurantId,
      block_type: row.blockType,
      enabled: row.enabled,
      approval_required: row.approvalRequired,
      inventory_impact: row.inventoryImpact,
    }));
    const childResult = await db
      .from("pms_inventory_block_type_rules")
      .upsert(childRows, { onConflict: "restaurant_id,block_type" });
    if (childResult.error) {
      return { ok: false as const, message: childResult.error.message ?? "Could not save block-type policy." };
    }

    await persistCard2InventoryReadiness(db, data.restaurantId);
    return {
      ok: true as const,
      rules: normalized,
      overbooking: overbookingMeta(normalized.overbookingAllowed),
    };
  });

export const getInventorySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb(context.supabase);
    const [{ data: rooms }, { data: types }] = await Promise.all([
      db
        .from("hotel_rooms")
        .select("id, sellable, active, status, room_type_id")
        .eq("restaurant_id", data.restaurantId),
      db.from("room_types").select("id, sellable, active").eq("restaurant_id", data.restaurantId),
    ]);
    const typeById = new Map(
      ((types ?? []) as Array<{ id: string; sellable?: boolean; active?: boolean }>).map((row) => [
        row.id,
        row,
      ]),
    );
    const roomRows = (rooms ?? []) as Array<{
      id: string;
      sellable?: boolean;
      active?: boolean;
      status?: string;
      room_type_id?: string | null;
    }>;
    const physicalRoomCount = roomRows.length;
    const roomLevelSellableCount = roomRows.filter((row) => row.sellable === true).length;
    const roomLevelNonSellableCount = roomRows.filter((row) => row.sellable !== true).length;
    const sellableRoomTypeCount = [...typeById.values()].filter((row) => row.sellable === true).length;
    const canonicalEngineSellableRoomCount = roomRows.filter((row) => {
      if (row.active === false) return false;
      if (row.status !== "available") return false;
      const type = row.room_type_id ? typeById.get(row.room_type_id) : undefined;
      return Boolean(type && type.active !== false && type.sellable === true);
    }).length;
    return {
      physicalRoomCount,
      roomLevelSellableCount,
      roomLevelNonSellableCount,
      sellableRoomTypeCount,
      canonicalEngineSellableRoomCount,
      roomLevelSellableNote:
        "hotel_rooms.sellable is a room-level flag and is not the booking-engine sellable count.",
      canonicalEngineNote:
        "canonicalEngineSellableRoomCount uses the same predicates as count_sellable_rooms (active, status=available, type active and sellable).",
    };
  });

/** Read-only Card 2 Inventory Rules evaluator for Card 8. */
export async function loadCard2InventoryValidation(db: DbClient, restaurantId: string) {
  const loaded = await loadRules(db, restaurantId);
  const persisted = Boolean(loaded.parent);
  const rules = loaded.parent ? mapParent(loaded.parent, loaded.blockTypes) : defaultInventoryRules();
  return evaluateInventoryRulesReadiness({ persisted, rules });
}

export const evaluateCard2InventoryReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb(context.supabase);
    await persistCard2InventoryReadiness(db, data.restaurantId);
    const loaded = await loadRules(db, data.restaurantId);
    const persisted = Boolean(loaded.parent);
    const rules = loaded.parent ? mapParent(loaded.parent, loaded.blockTypes) : defaultInventoryRules();
    const readiness = evaluateInventoryRulesReadiness({ persisted, rules });
    return {
      ...readiness,
      persisted,
      stepStatus: card2InventoryStepStatus(readiness.ready, persisted),
    };
  });
