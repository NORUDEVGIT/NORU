/**
 * Inventory core — server-only helpers.
 *
 * Every balance change in the product goes through one pipeline:
 * validate role -> validate item tenancy -> derive the sign server-side ->
 * `apply_inventory_movement` (atomic ledger insert + balance update).
 */

export const INVENTORY_TYPES = ["ingredient", "consumable"] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];

export const MOVEMENT_TYPES = [
  "opening_balance",
  "purchase_received",
  "usage",
  "waste",
  "loss",
  "adjustment_in",
  "adjustment_out",
  "stocktake_adjustment",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Direction of each movement. `stocktake_adjustment` is signed by the caller's intent. */
const DIRECTION: Record<MovementType, 1 | -1 | 0> = {
  opening_balance: 1,
  purchase_received: 1,
  adjustment_in: 1,
  usage: -1,
  waste: -1,
  loss: -1,
  adjustment_out: -1,
  stocktake_adjustment: 0,
};

export const MANAGE_ROLES = ["owner", "manager"] as const;
/** Roles that can see inventory at all. */
export const VIEW_ROLES = ["owner", "manager", "kitchen"] as const;
/** Kitchen may only consume stock. */
const KITCHEN_MOVEMENTS: MovementType[] = ["usage", "waste", "loss"];
/** Reason is mandatory for anything that isn't a plain receive/use. */
const REASON_REQUIRED: MovementType[] = [
  "waste",
  "loss",
  "adjustment_in",
  "adjustment_out",
  "stocktake_adjustment",
];

export function isManager(role: string): boolean {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}

export function canViewInventory(role: string): boolean {
  return (VIEW_ROLES as readonly string[]).includes(role);
}

export function canRecordMovement(role: string, type: MovementType): boolean {
  if (isManager(role)) return true;
  if (role === "kitchen") return KITCHEN_MOVEMENTS.includes(type);
  return false;
}

export function reasonRequired(type: MovementType): boolean {
  return REASON_REQUIRED.includes(type);
}

/**
 * Signed quantity from a positive user-entered amount. The UI never sends signs.
 * `stocktakeDirection` only applies to stocktake adjustments.
 */
export function signedQuantity(
  type: MovementType,
  quantity: number,
  stocktakeDirection: "in" | "out" = "in",
): number {
  const dir = DIRECTION[type] || (stocktakeDirection === "out" ? -1 : 1);
  return Math.abs(quantity) * dir;
}

/** Only owner/manager corrections may push a balance below zero. */
export function allowsNegative(type: MovementType, role: string): boolean {
  return isManager(role) && (type === "adjustment_out" || type === "stocktake_adjustment");
}

export interface InventoryItemRow {
  id: string;
  restaurant_id: string;
  name: string;
  inventory_type: string;
  base_unit_id: string;
  current_quantity: number;
  minimum_stock_level: number;
  unit_cost: number | null;
  active: boolean;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

/** An item that must belong to this exact restaurant. */
export async function loadInventoryItem(
  admin: any,
  restaurantId: string,
  itemId: string,
): Promise<InventoryItemRow> {
  const { data } = await admin
    .from("inventory_items")
    .select(
      "id, restaurant_id, name, inventory_type, base_unit_id, current_quantity, minimum_stock_level, unit_cost, active, notes, created_at, updated_at",
    )
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That inventory item could not be found.");
  return data as InventoryItemRow;
}

export function stockStatus(quantity: number, minimum: number): "out" | "low" | "in" {
  if (quantity <= 0) return "out";
  if (quantity <= minimum) return "low";
  return "in";
}
