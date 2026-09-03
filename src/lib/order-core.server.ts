/**
 * The single server-side order-creation pipeline.
 *
 * Both entry points — the public customer wrapper (`placeOrder`) and the staff
 * wrapper (`placeWaiterAssistedOrder`) — go through these helpers. Pricing,
 * menu validation, table validation, totals and the inserts exist exactly once.
 *
 * Nothing here trusts the browser: identities are derived by the wrappers from
 * a verified session, prices and names are re-read from the database, and the
 * assigned waiter is resolved from workforce data, never from request input.
 */
import { shiftMoment } from "./workforce-rules";
import { getRestaurantSettings } from "./workforce.server";
import { displayName } from "./workforce.server";
import type { ResolvedLine } from "./order-pricing.server";

export type OrderSource = "customer_qr" | "waiter_assisted" | "pos_counter";

export interface RestaurantRow {
  id: string;
  approved: boolean;
  active: boolean;
}

export const RESTAURANT_CLOSED_MESSAGE =
  "This restaurant isn't accepting orders right now. Please ask a member of staff.";

/** An approved + active restaurant, resolved from its slug or its id. */
export async function resolveRestaurant(
  admin: any,
  by: { slug?: string; id?: string },
): Promise<{ ok: true; restaurant: RestaurantRow } | { ok: false; message: string }> {
  let query = admin.from("restaurants").select("id, approved, active");
  query = by.slug ? query.eq("slug", by.slug.toLowerCase()) : query.eq("id", by.id);
  const { data } = await query.maybeSingle();
  const restaurant = data as RestaurantRow | null;
  if (!restaurant || !restaurant.approved || !restaurant.active) {
    return { ok: false, message: RESTAURANT_CLOSED_MESSAGE };
  }
  return { ok: true, restaurant };
}

/**
 * Table identity is always the database's own row. A browser-supplied id is a
 * lookup key only: it must belong to THIS restaurant and be active.
 */
export async function resolveRestaurantTable(
  admin: any,
  restaurantId: string,
  input: { tableId?: string | null; tableLabel?: string },
): Promise<{ ok: true; tableId: string | null; tableLabel: string } | { ok: false; message: string }> {
  const { data } = await admin
    .from("restaurant_tables")
    .select("id, table_number")
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  const tables = (data ?? []) as { id: string; table_number: string }[];
  const label = (input.tableLabel ?? "").trim();

  if (input.tableId) {
    const match = tables.find((t) => t.id === input.tableId);
    if (!match) {
      return {
        ok: false,
        message: "That table is no longer available. Please scan the QR code on your table again.",
      };
    }
    return { ok: true, tableId: match.id, tableLabel: match.table_number };
  }

  if (tables.length > 0) {
    const match = tables.find((t) => t.table_number.toLowerCase() === label.toLowerCase());
    if (!match) return { ok: false, message: "Table not found. Please check your table number." };
    return { ok: true, tableId: match.id, tableLabel: match.table_number };
  }

  // Legacy restaurants without configured tables still need a label.
  if (!label) return { ok: false, message: "Please enter your table number." };
  return { ok: true, tableId: null, tableLabel: label };
}

export type AssignedWaiter =
  | { status: "none" }
  | { status: "ambiguous" }
  | { status: "ok"; membershipId: string; name: string | null };

/**
 * Resolves the waiter currently responsible for a table.
 *
 * Inputs are restaurant + table + the server's clock — never a waiter id,
 * membership id or assignment id from the request. Overlapping staffing data
 * that yields more than one current assignment is reported as ambiguous rather
 * than resolved to an arbitrary person.
 */
export async function resolveAssignedWaiter(
  admin: any,
  restaurantId: string,
  tableId: string | null,
  now: Date = new Date(),
): Promise<AssignedWaiter> {
  if (!tableId) return { status: "none" };

  // Shift clock times are restaurant-local; one timezone source for all of them.
  const { timezone } = await getRestaurantSettings(admin, restaurantId);

  const { data } = await admin
    .from("staff_table_assignments")
    .select(
      "id, staff_membership_id, shift_id, staff_shifts!inner(id, restaurant_id, shift_date, start_time, end_time, status)",
    )
    .eq("restaurant_id", restaurantId)
    .eq("restaurant_table_id", tableId);

  const rows = (data ?? []) as {
    id: string;
    staff_membership_id: string;
    shift_id: string;
    staff_shifts: {
      id: string;
      restaurant_id: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      status: string;
    };
  }[];

  // Same time convention as the rest of the workforce module.
  const current = rows.filter((row) => {
    const shift = row.staff_shifts;
    if (!shift || shift.restaurant_id !== restaurantId) return false;
    if (shift.status !== "scheduled") return false;
    if (row.shift_id !== shift.id) return false;
    const start = shiftMoment(shift.shift_date, shift.start_time, timezone).getTime();
    const end = shiftMoment(shift.shift_date, shift.end_time, timezone).getTime();
    const t = now.getTime();
    return t >= start && t <= end;
  });

  if (current.length === 0) return { status: "none" };

  const membershipIds = [...new Set(current.map((r) => r.staff_membership_id))];
  const { data: members } = await admin
    .from("restaurant_users")
    .select("id, user_id, role, active, restaurant_id")
    .in("id", membershipIds)
    .eq("restaurant_id", restaurantId)
    .eq("active", true);

  const assignable = ["waiter", "manager", "owner"];
  const valid = ((members ?? []) as { id: string; user_id: string; role: string }[]).filter((m) =>
    assignable.includes(m.role),
  );

  if (valid.length === 0) return { status: "none" };
  if (valid.length > 1) return { status: "ambiguous" };

  const member = valid[0]!;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", member.user_id)
    .maybeSingle();

  return {
    status: "ok",
    membershipId: member.id,
    name: displayName(profile) ?? profile?.email ?? null,
  };
}

/** Display-name snapshot for a membership, taken at order time. */
export async function staffNameSnapshot(
  admin: any,
  restaurantId: string,
  membershipId: string,
): Promise<string | null> {
  const { data: member } = await admin
    .from("restaurant_users")
    .select("user_id")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!member) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", member.user_id)
    .maybeSingle();
  return displayName(profile) ?? profile?.email ?? null;
}

export interface CreateValidatedOrderInput {
  restaurantId: string;
  restaurantTableId: string | null;
  /** Historical snapshot of the table label at ordering time. */
  tableLabel: string;
  /** Derived server-side by the wrapper — never accepted from the browser. */
  customerId: string | null;
  orderSource: OrderSource;
  assignedWaiterMembershipId: string | null;
  assignedWaiterName: string | null;
  createdByStaffMembershipId: string | null;
  createdByStaffName: string | null;
  guestTokenHash?: string | null;
  /** POS only: counter or takeaway sale. Dine-in orders leave this null. */
  orderType?: "counter" | "takeaway" | null;
  /** POS only: the cashier drawer the sale belongs to. */
  cashierShiftId?: string | null;
  lines: ResolvedLine[];
}

export interface CreatedOrder {
  id: string;
  orderNumber: number;
  tableNumber: string;
  total: number;
  status: string;
  createdAt: string;
}

/**
 * The complete write: the order row, its items, and the created order back.
 * The total is computed here from the resolved (authoritative) lines.
 */
export async function createValidatedOrder(
  admin: any,
  input: CreateValidatedOrderInput,
): Promise<CreatedOrder> {
  // Belt and braces alongside the database CHECK constraint.
  if (input.orderSource === "customer_qr" && input.createdByStaffMembershipId) {
    throw new Error("Invalid order attribution.");
  }
  if (input.orderSource !== "customer_qr" && !input.createdByStaffMembershipId) {
    throw new Error("Invalid order attribution.");
  }

  const total = Number(
    input.lines.reduce((sum, line) => sum + line.price * line.quantity, 0).toFixed(2),
  );

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      table_number: input.tableLabel,
      status: "new",
      total,
      restaurant_id: input.restaurantId,
      restaurant_table_id: input.restaurantTableId,
      customer_id: input.customerId,
      guest_token_hash: input.guestTokenHash ?? null,
      order_source: input.orderSource,
      assigned_waiter_membership_id: input.assignedWaiterMembershipId,
      assigned_waiter_name_snapshot: input.assignedWaiterName,
      created_by_staff_membership_id: input.createdByStaffMembershipId,
      created_by_staff_name_snapshot: input.createdByStaffName,
      order_type: input.orderType ?? null,
      cashier_shift_id: input.cashierShiftId ?? null,
    })
    .select("id, order_number, table_number, total, status, created_at")
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "Could not create the order.");
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    input.lines.map((line) => ({
      order_id: order.id,
      ...line,
      line_total: Number((line.price * line.quantity).toFixed(2)),
    })),
  );

  if (itemsError) {
    // Never leave a half-written order behind.
    await admin.from("orders").delete().eq("id", order.id);
    throw new Error(itemsError.message);
  }

  return {
    id: order.id as string,
    orderNumber: order.order_number as number,
    tableNumber: order.table_number as string,
    total: Number(order.total),
    status: order.status as string,
    createdAt: order.created_at as string,
  };
}
