import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertIdempotencyKey, cashierError, requireCashierAllocator } from "./cashiering.server";

const idSchema = z.string().uuid();

export const recordCompanyWithholdingCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        invoiceId: idSchema,
        amount: z.number().positive().finite(),
        pretaxBase: z.number().positive().finite(),
        certificateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reference: z.string().trim().max(80).optional(),
        reason: z.string().trim().max(500).optional(),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierAllocator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.rpc("record_withholding_certificate", {
      _restaurant_id: data.restaurantId,
      _invoice_id: data.invoiceId,
      _amount: data.amount,
      _pretax_base: data.pretaxBase,
      _certificate_date: data.certificateDate,
      _reference: data.reference?.trim() || null,
      _reason: data.reason?.trim() || null,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return created;
  });

export const reverseCompanyWithholdingCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        certificateId: idSchema,
        reason: z.string().trim().min(1).max(500),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierAllocator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.rpc("reverse_withholding_certificate", {
      _restaurant_id: data.restaurantId,
      _certificate_id: data.certificateId,
      _reason: data.reason,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return created;
  });
