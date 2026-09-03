/**
 * Procurement core (suppliers, purchase orders, goods receiving) — server-only helpers.
 *
 * Everything here is tenant-derived: the caller's membership decides what they
 * may do, and every supplier / PO / PO line is re-loaded against the same
 * restaurant before it is touched. Stock balances are never written here — the
 * Phase 5A ledger (`apply_inventory_movement`, wrapped by
 * `receive_purchase_order_goods`) remains the only writer.
 */

export const PO_STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

const MANAGE_ROLES = ["owner", "manager", "storekeeper"] as const;

/** Owners and managers manage suppliers and purchase orders. */
export function canManagePurchasing(role: string): boolean {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}

/** Kitchen can see procurement and receive goods, but never edit it. */
export function canViewPurchasing(role: string): boolean {
  return canManagePurchasing(role) || role === "kitchen";
}

export function canReceiveGoods(role: string): boolean {
  return canManagePurchasing(role) || role === "kitchen";
}

/** Goods can only be received against a live order. */
export function isReceivable(status: string): boolean {
  return status === "ordered" || status === "partially_received";
}

export function isEditable(status: string): boolean {
  return status === "draft";
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lineTotal(quantity: number, unitCost: number): number {
  return round2(quantity * unitCost);
}

export interface SupplierRow {
  id: string;
  restaurant_id: string;
  name: string;
  active: boolean;
}

/** A supplier that must belong to this exact restaurant. */
export async function loadSupplier(admin: any, restaurantId: string, supplierId: string): Promise<SupplierRow> {
  const { data } = await admin
    .from("restaurant_suppliers")
    .select("id, restaurant_id, name, active")
    .eq("id", supplierId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That supplier could not be found.");
  return data as SupplierRow;
}

export interface PurchaseOrderRow {
  id: string;
  restaurant_id: string;
  supplier_id: string;
  po_number: string;
  status: PoStatus;
  order_date: string;
  expected_delivery_date: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  created_by_staff_membership_id: string | null;
  ordered_by_staff_membership_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A purchase order that must belong to this exact restaurant. */
export async function loadPurchaseOrder(
  admin: any,
  restaurantId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderRow> {
  const { data } = await admin
    .from("purchase_orders")
    .select("*")
    .eq("id", purchaseOrderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That purchase order could not be found.");
  return data as PurchaseOrderRow;
}

/** Next PO number for a restaurant: PO-0001, PO-0002, … (server-generated). */
export async function nextPoNumber(admin: any, restaurantId: string): Promise<string> {
  const { data } = await admin
    .from("purchase_orders")
    .select("po_number")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(50);
  let max = 0;
  for (const row of (data ?? []) as { po_number: string }[]) {
    const m = /^PO-(\d+)$/.exec(row.po_number.trim());
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return `PO-${String(max + 1).padStart(4, "0")}`;
}

/** Recompute PO money from its own lines — browser totals are never trusted. */
export async function recalculateTotals(admin: any, restaurantId: string, purchaseOrderId: string): Promise<number> {
  const { data } = await admin
    .from("purchase_order_items")
    .select("line_total")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("restaurant_id", restaurantId);
  const subtotal = round2(
    ((data ?? []) as { line_total: number }[]).reduce((sum, l) => sum + Number(l.line_total), 0),
  );
  await admin
    .from("purchase_orders")
    .update({ subtotal, total: subtotal })
    .eq("id", purchaseOrderId)
    .eq("restaurant_id", restaurantId);
  return subtotal;
}

export async function recordPoEvent(
  admin: any,
  input: {
    restaurantId: string;
    purchaseOrderId: string;
    eventType: string;
    previousValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    notes?: string | null;
    membershipId: string;
  },
): Promise<void> {
  await admin.from("purchase_order_history").insert({
    restaurant_id: input.restaurantId,
    purchase_order_id: input.purchaseOrderId,
    event_type: input.eventType,
    previous_values: input.previousValues ?? null,
    new_values: input.newValues ?? null,
    notes: input.notes ?? null,
    created_by_staff_membership_id: input.membershipId,
  });
}

const RECEIVE_ERRORS: Record<string, string> = {
  PO_NOT_FOUND: "That purchase order could not be found.",
  PO_NOT_RECEIVABLE: "This purchase order can no longer receive goods.",
  LINE_NOT_FOUND: "One of those order lines could not be found.",
  EXCEEDS_REMAINING: "You can't receive more than the outstanding quantity.",
  INVALID_QUANTITY: "Enter a quantity greater than zero.",
  NOTHING_TO_RECEIVE: "Enter at least one quantity to receive.",
};

export function receiveErrorMessage(raw: string): string {
  for (const [code, message] of Object.entries(RECEIVE_ERRORS)) {
    if (raw.includes(code)) return message;
  }
  return "We couldn't record that goods receipt. Please try again.";
}
