/**
 * Issue #27 — Restaurant Management guest receipts, server-only guards.
 *
 * View/print/email are available to staff who can open the paid sale.
 * Snapshot writes go through service_role / SECURITY DEFINER only.
 * Standalone POS is not consulted.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireRestaurantManagement } from "./restaurant-package.server";
import {
  assertPaidForReceipt,
  buildReceiptHeader,
  buildReceiptSnapshot,
  choosePersistedSnapshot,
  receiptProfileIncomplete,
  type RmReceiptHeader,
  type RmReceiptRefund,
  type RmReceiptSnapshot,
} from "./rm-receipts";

export const RM_RECEIPT_ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "That restaurant sale could not be found for this property.",
  ORDER_UNPAID: "This restaurant sale has not been paid.",
  RECEIPT_NOT_FOUND: "That guest receipt could not be found.",
  RECEIPT_SNAPSHOT_REQUIRED: "A guest receipt snapshot is required.",
  EMAIL_NOT_CONFIGURED: "Email not configured.",
  INVALID_EMAIL: "Enter a valid email address.",
};

export function rmReceiptError(message: string): Error {
  for (const [code, text] of Object.entries(RM_RECEIPT_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

export async function requireRmReceiptViewer(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await callerMembership(context, restaurantId);
  await requireRestaurantManagement(restaurantId);
  return membership;
}

type AdminClient = { from: (table: string) => any; rpc: (...args: any[]) => any };

function moneyOrZero(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export interface RestaurantHeaderRow {
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  booking_contact_phone: string | null;
  booking_contact_email: string | null;
  timezone: string | null;
  currency_code: string | null;
}

export function headerFromRestaurantRow(row: RestaurantHeaderRow): RmReceiptHeader {
  return buildReceiptHeader({
    name: row.name,
    address: row.address,
    city: row.city,
    postcode: row.postcode,
    country: row.country,
    phone: row.phone,
    email: row.email,
    bookingContactPhone: row.booking_contact_phone,
    bookingContactEmail: row.booking_contact_email,
  });
}

export async function loadRestaurantHeader(
  admin: AdminClient,
  restaurantId: string,
): Promise<{ header: RmReceiptHeader; timezone: string; currencyCode: string; incomplete: boolean }> {
  const { data, error } = await admin
    .from("restaurants")
    .select(
      "name, address, city, postcode, country, phone, email, booking_contact_phone, booking_contact_email, timezone, currency_code",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error || !data) throw new Error("That restaurant sale could not be found for this property.");
  const row = data as RestaurantHeaderRow;
  const header = headerFromRestaurantRow(row);
  return {
    header,
    timezone: row.timezone || "Europe/London",
    currencyCode: row.currency_code || "GBP",
    incomplete: receiptProfileIncomplete(header),
  };
}

function parseSnapshot(value: unknown): RmReceiptSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snap = value as RmReceiptSnapshot;
  if (snap.version !== 1 || !snap.header || !snap.sale || !snap.totals) return null;
  return snap;
}

export async function loadReceiptRow(
  admin: AdminClient,
  restaurantId: string,
  orderId: string,
): Promise<{
  snapshot: RmReceiptSnapshot;
  reprintCount: number;
  lastReprintedAt: string | null;
} | null> {
  const { data } = await admin
    .from("order_receipts")
    .select("snapshot, reprint_count, last_reprinted_at")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (!data) return null;
  const snapshot = parseSnapshot(data.snapshot);
  if (!snapshot) return null;
  return {
    snapshot,
    reprintCount: Number(data.reprint_count ?? 0),
    lastReprintedAt: (data.last_reprinted_at as string | null) ?? null,
  };
}

async function loadFolioReference(
  admin: AdminClient,
  restaurantId: string,
  folioId: string | null,
): Promise<string | null> {
  if (!folioId) return null;
  const { data } = await admin
    .from("guest_folios")
    .select("folio_number")
    .eq("id", folioId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return (data?.folio_number as string | null) ?? null;
}

/**
 * Materialize from stored order / items / payments / refunds + the restaurant
 * header passed in (current header for legacy; freeze-time header for new pays).
 * Never reads live tax settings or current menu prices.
 */
export async function materializeReceiptSnapshot(
  admin: AdminClient,
  restaurantId: string,
  orderId: string,
  headerContext?: { header: RmReceiptHeader; timezone: string; currencyCode: string },
): Promise<RmReceiptSnapshot> {
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, order_number, table_number, order_source, paid_at, billing_method, room_charge_folio_id, merchandise_subtotal, discount_amount, discount_reason, comp_amount, tax_amount, tax_inclusive_snapshot, tax_rate_snapshot, service_amount, service_enabled_snapshot, service_rate_snapshot, total",
    )
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !order) throw new Error("That restaurant sale could not be found for this property.");

  const gate = assertPaidForReceipt({
    paidAt: order.paid_at,
    billingMethod: order.billing_method,
    roomPosted: Boolean(order.room_charge_folio_id) || order.billing_method === "room_charge",
  });
  if (!gate.ok) throw new Error(gate.message);

  const [{ data: itemRows }, { data: paymentRows }, { data: refundRows }, property, folioReference] =
    await Promise.all([
      admin
        .from("order_items")
        .select("item_name, quantity, price, line_total, comp_reason")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      admin
        .from("order_payments")
        .select("method, amount, reference")
        .eq("order_id", order.id)
        .eq("restaurant_id", restaurantId),
      admin
        .from("order_refunds")
        .select("method, amount, created_at")
        .eq("order_id", order.id)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: true }),
      headerContext ?? loadRestaurantHeader(admin, restaurantId),
      loadFolioReference(admin, restaurantId, order.room_charge_folio_id as string | null),
    ]);

  const items = (itemRows ?? []) as {
    item_name: string;
    quantity: number;
    price: number;
    line_total: number | null;
    comp_reason: string | null;
  }[];
  const compReason =
    items.map((item) => item.comp_reason).find((reason) => (reason ?? "").trim().length > 0) ?? null;

  const refunds: RmReceiptRefund[] = ((refundRows ?? []) as {
    method: string;
    amount: number;
    created_at: string;
  }[]).map((row) => ({
    amount: moneyOrZero(row.amount),
    method: row.method,
    createdAt: row.created_at,
  }));

  return buildReceiptSnapshot({
    header: property.header,
    orderNumber: order.order_number,
    paidAt: order.paid_at,
    timezone: property.timezone,
    currencyCode: property.currencyCode,
    orderSource: order.order_source ?? "customer_qr",
    tableLabel: order.table_number ?? "",
    billingMethod: order.billing_method,
    lines: items.map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      lineTotal: item.line_total == null ? Number(item.price) * item.quantity : Number(item.line_total),
    })),
    merchandiseSubtotal: order.merchandise_subtotal == null ? null : moneyOrZero(order.merchandise_subtotal),
    discountAmount: moneyOrZero(order.discount_amount),
    discountReason: order.discount_reason,
    compAmount: moneyOrZero(order.comp_amount),
    compReason,
    taxAmount: order.tax_amount == null ? null : moneyOrZero(order.tax_amount),
    taxInclusive: order.tax_inclusive_snapshot,
    taxRate: order.tax_rate_snapshot == null ? null : moneyOrZero(order.tax_rate_snapshot),
    serviceAmount: order.service_amount == null ? null : moneyOrZero(order.service_amount),
    serviceEnabled: order.service_enabled_snapshot,
    serviceRate: order.service_rate_snapshot == null ? null : moneyOrZero(order.service_rate_snapshot),
    payable: moneyOrZero(order.total),
    tenders: ((paymentRows ?? []) as { method: string; amount: number; reference: string | null }[]).map(
      (payment) => ({
        method: payment.method,
        amount: moneyOrZero(payment.amount),
        reference: payment.reference,
      }),
    ),
    refunds,
    folioReference,
  });
}

export async function persistReceiptSnapshot(
  admin: AdminClient,
  restaurantId: string,
  orderId: string,
  snapshot: RmReceiptSnapshot,
): Promise<{ snapshot: RmReceiptSnapshot; reprintCount: number; lastReprintedAt: string | null; wrote: boolean }> {
  const existing = await loadReceiptRow(admin, restaurantId, orderId);
  const choice = choosePersistedSnapshot(existing?.snapshot ?? null, snapshot);
  if (!choice.wrote && existing) return { ...existing, wrote: false };

  const { data, error } = await admin.rpc("freeze_order_receipt", {
    _restaurant_id: restaurantId,
    _order_id: orderId,
    _snapshot: snapshot,
  });
  if (error) {
    const raced = await loadReceiptRow(admin, restaurantId, orderId);
    if (raced) return { ...raced, wrote: false };
    throw rmReceiptError(error.message);
  }
  const row = data as {
    snapshot: unknown;
    reprint_count?: number;
    last_reprinted_at?: string | null;
  } | null;
  return {
    snapshot: parseSnapshot(row?.snapshot) ?? snapshot,
    reprintCount: Number(row?.reprint_count ?? 0),
    lastReprintedAt: row?.last_reprinted_at ?? null,
    wrote: true,
  };
}

/** Best-effort freeze after a successful settle. Must never fail the sale. */
export async function freezeOrderReceiptAfterSettle(
  admin: AdminClient,
  restaurantId: string,
  orderId: string,
): Promise<void> {
  try {
    const existing = await loadReceiptRow(admin, restaurantId, orderId);
    if (existing) return;
    const snapshot = await materializeReceiptSnapshot(admin, restaurantId, orderId);
    await persistReceiptSnapshot(admin, restaurantId, orderId, snapshot);
  } catch (error) {
    console.error("[freezeOrderReceiptAfterSettle]", (error as Error).message);
  }
}

export async function loadLiveRefunds(
  admin: AdminClient,
  restaurantId: string,
  orderId: string,
): Promise<RmReceiptRefund[]> {
  const { data } = await admin
    .from("order_refunds")
    .select("method, amount, created_at")
    .eq("order_id", orderId)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as { method: string; amount: number; created_at: string }[]).map((row) => ({
    amount: moneyOrZero(row.amount),
    method: row.method,
    createdAt: row.created_at,
  }));
}
