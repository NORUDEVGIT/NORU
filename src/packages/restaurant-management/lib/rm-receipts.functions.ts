/**
 * Issue #27 — Restaurant Management guest receipt server functions.
 *
 * Reads frozen `order_receipts.snapshot` (or materializes once for legacy
 * paid sales). Email uses that snapshot only — never live tax/menu.
 * No `pos_*` tables. Sale totals are never mutated.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDateTimeInZone } from "@/shared/lib/property-time";
import {
  assertPaidForReceipt,
  canSubmitReceiptEmail,
  isReprintCopy,
  mergeReceiptRefunds,
  receiptEmailSubject,
  receiptProfileIncomplete,
  renderReceiptHtml,
  renderReceiptText,
  validateReceiptEmail,
  type RmReceiptSnapshot,
} from "./rm-receipts";
import {
  freezeOrderReceiptAfterSettle,
  loadLiveRefunds,
  loadReceiptRow,
  materializeReceiptSnapshot,
  persistReceiptSnapshot,
  requireRmReceiptViewer,
  rmReceiptError,
} from "./rm-receipts.server";

const idSchema = z.string().uuid();

export interface OrderReceiptView {
  orderId: string;
  snapshot: RmReceiptSnapshot;
  reprintCount: number;
  lastReprintedAt: string | null;
  reprint: boolean;
  profileIncomplete: boolean;
  materialized: boolean;
}

export { freezeOrderReceiptAfterSettle };

const emailInFlight = new Set<string>();

function emailLockKey(orderId: string, email: string): string {
  return `${orderId}:${email.toLowerCase()}`;
}

async function receiptView(
  admin: { from: (t: string) => any; rpc: (...args: any[]) => any },
  restaurantId: string,
  orderId: string,
  mode?: "original" | "reprint",
): Promise<OrderReceiptView> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, paid_at, billing_method, room_charge_folio_id")
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

  const existing = await loadReceiptRow(admin, restaurantId, orderId);
  let snapshot = existing?.snapshot ?? null;
  let reprintCount = existing?.reprintCount ?? 0;
  let lastReprintedAt = existing?.lastReprintedAt ?? null;
  let materialized = false;

  if (!snapshot) {
    snapshot = await materializeReceiptSnapshot(admin, restaurantId, orderId);
    const persisted = await persistReceiptSnapshot(admin, restaurantId, orderId, snapshot);
    snapshot = persisted.snapshot;
    reprintCount = persisted.reprintCount;
    lastReprintedAt = persisted.lastReprintedAt;
    materialized = persisted.wrote;
  }

  const refunds = await loadLiveRefunds(admin, restaurantId, orderId);
  snapshot = mergeReceiptRefunds(snapshot, refunds);

  return {
    orderId,
    snapshot,
    reprintCount,
    lastReprintedAt,
    reprint: isReprintCopy({ reprintCount, ...(mode ? { mode } : {}) }),
    profileIncomplete: receiptProfileIncomplete(snapshot.header),
    materialized,
  };
}

export const getOrderReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        mode: z.enum(["original", "reprint"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OrderReceiptView> => {
    await requireRmReceiptViewer(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return data.mode
      ? receiptView(supabaseAdmin, data.restaurantId, data.orderId, data.mode)
      : receiptView(supabaseAdmin, data.restaurantId, data.orderId);
  });

export const recordReceiptReprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, orderId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<OrderReceiptView> => {
    await requireRmReceiptViewer(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await receiptView(supabaseAdmin, data.restaurantId, data.orderId);
    const { error } = await supabaseAdmin.rpc("record_order_receipt_reprint", {
      _restaurant_id: data.restaurantId,
      _order_id: data.orderId,
    });
    if (error) throw rmReceiptError(error.message);
    return receiptView(supabaseAdmin, data.restaurantId, data.orderId, "reprint");
  });

export const sendOrderReceiptEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        orderId: idSchema,
        toEmail: z.string().trim().max(254),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; message: string; retry: true; configured?: boolean }> => {
      try {
        await requireRmReceiptViewer(context as never, data.restaurantId);
        const parsed = validateReceiptEmail(data.toEmail);
        if (!parsed.ok || !canSubmitReceiptEmail({ email: data.toEmail, submitting: false })) {
          return { ok: false, message: parsed.ok ? "Enter a valid email address." : parsed.message, retry: true };
        }

        const apiKey = process.env["RESEND_API_KEY"]?.trim();
        const from = process.env["RECEIPT_EMAIL_FROM"]?.trim();
        if (!apiKey || !from) {
          return { ok: false, message: "Email not configured.", retry: true, configured: false };
        }

        const lock = emailLockKey(data.orderId, parsed.email);
        if (emailInFlight.has(lock)) {
          return { ok: false, message: "That receipt is already being sent.", retry: true };
        }
        emailInFlight.add(lock);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const view = await receiptView(supabaseAdmin, data.restaurantId, data.orderId);
          const reprintedAt = view.lastReprintedAt
            ? formatDateTimeInZone(view.lastReprintedAt, view.snapshot.sale.timezone)
            : null;
          const html = renderReceiptHtml(view.snapshot, {
            reprint: view.reprint,
            reprintCount: view.reprintCount,
            ...(reprintedAt ? { reprintedAt } : {}),
          });
          const text = renderReceiptText(view.snapshot, {
            reprint: view.reprint,
            reprintCount: view.reprintCount,
            ...(reprintedAt ? { reprintedAt } : {}),
          });

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [parsed.email],
              subject: receiptEmailSubject(view.snapshot.header, view.snapshot.sale),
              html,
              text,
            }),
          });
          if (!response.ok) {
            const body = await response.text();
            console.error("[sendOrderReceiptEmail]", response.status, body);
            return {
              ok: false,
              message: "The receipt email could not be sent. Try again.",
              retry: true,
              configured: true,
            };
          }
          return { ok: true };
        } finally {
          emailInFlight.delete(lock);
        }
      } catch (error) {
        return { ok: false, message: (error as Error).message, retry: true };
      }
    },
  );
