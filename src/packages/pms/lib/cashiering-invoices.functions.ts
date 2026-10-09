import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertIdempotencyKey,
  cashierError,
  requireCashierManager,
  requireCashieringAccess,
} from "./cashiering.server";
import {
  mapFolioInvoiceSnapshot,
  type IssuedFolioInvoiceRow,
} from "./cashiering-invoices.server";

const idSchema = z.string().uuid();

export type InvoiceActionResult = { ok: true; invoice: IssuedFolioInvoiceRow } | { ok: false; message: string };

function mapInvoiceRow(row: {
  id: string;
  issued_number: string;
  sequence_number: number;
  issued_at: string;
  reprint_count: number;
  last_reprinted_at: string | null;
  snapshot: unknown;
}): IssuedFolioInvoiceRow {
  return {
    id: row.id,
    issuedNumber: row.issued_number,
    sequenceNumber: row.sequence_number,
    issuedAt: row.issued_at,
    reprintCount: row.reprint_count,
    lastReprintedAt: row.last_reprinted_at,
    snapshot: mapFolioInvoiceSnapshot(row.snapshot),
  };
}

export async function loadGuestFolioInvoice(
  supabaseAdmin: Awaited<
    typeof import("@/integrations/supabase/client.server")
  >["supabaseAdmin"],
  restaurantId: string,
  folioId: string,
): Promise<IssuedFolioInvoiceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("guest_folio_invoices")
    .select("id, issued_number, sequence_number, issued_at, reprint_count, last_reprinted_at, snapshot")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folioId)
    .maybeSingle();
  if (error) {
    if (error.message.includes("guest_folio_invoices") || error.message.includes("does not exist")) {
      return null;
    }
    throw cashierError(error.message);
  }
  if (!data) return null;
  return mapInvoiceRow(data as Parameters<typeof mapInvoiceRow>[0]);
}

export const issueGuestFolioInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        folioId: idSchema,
        idempotencyKey: z.string().min(8).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InvoiceActionResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("issue_guest_folio_invoice", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
      _membership_id: me.id,
      _idempotency_key: data.idempotencyKey ? assertIdempotencyKey(data.idempotencyKey) : undefined,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, invoice: mapInvoiceRow(row as Parameters<typeof mapInvoiceRow>[0]) };
  });

export const reprintGuestFolioInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<InvoiceActionResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("reprint_guest_folio_invoice", {
      _restaurant_id: data.restaurantId,
      _invoice_id: data.invoiceId,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, invoice: mapInvoiceRow(row as Parameters<typeof mapInvoiceRow>[0]) };
  });

export const getGuestFolioInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IssuedFolioInvoiceRow | null> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadGuestFolioInvoice(supabaseAdmin, data.restaurantId, data.folioId);
  });
