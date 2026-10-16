import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapCreditBoard,
  mapCreditPreview,
  mapCreditSnapshot,
  type CreditNoteBoard,
  type CreditPreview,
  type IssuedCreditNote,
} from "./cashiering-credit-notes";
import {
  assertIdempotencyKey,
  canManageCashiering,
  cashierError,
  requireCashierManager,
  requireCashieringAccess,
} from "./cashiering.server";

const idSchema = z.string().uuid();
const targetSchema = z
  .object({
    restaurantId: idSchema,
    guestInvoiceId: idSchema.optional(),
    accountInvoiceId: idSchema.optional(),
  })
  .refine((value) => Boolean(value.guestInvoiceId) !== Boolean(value.accountInvoiceId), {
    message: "Choose one issued invoice.",
  });

const amountItem = z.object({
  sourceGroupId: idSchema,
  gross: z.number().positive().max(99999999),
});

function targetArgs(data: { guestInvoiceId?: string; accountInvoiceId?: string }) {
  return {
    _guest_invoice_id: data.guestInvoiceId ?? null,
    _account_invoice_id: data.accountInvoiceId ?? null,
  };
}

export const getInvoiceCreditBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<CreditNoteBoard & { canManage: boolean }> => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("list_invoice_credit_board", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
    });
    if (error) throw cashierError(error.message);
    const row = (payload ?? {}) as Record<string, unknown>;
    if (row.ok === false) throw cashierError(String(row.code ?? "INVOICE_NOT_FOUND"));
    return { ...mapCreditBoard(payload), canManage: canManageCashiering(me.role) };
  });

export const previewInvoiceCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    targetSchema.and(z.object({ items: z.array(amountItem).max(100) })).parse(input),
  )
  .handler(async ({ data, context }): Promise<CreditPreview> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("preview_invoice_credit_note", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
      _items: data.items.map((item) => ({ sourceGroupId: item.sourceGroupId, gross: item.gross })),
    });
    if (error) throw cashierError(error.message);
    return mapCreditPreview(payload);
  });

export const createInvoiceCreditNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    targetSchema.and(z.object({ reason: z.string().trim().min(1).max(500) })).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("create_invoice_credit_note_draft", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
      _reason: data.reason,
      _membership_id: me.id,
    });
    if (error || !row) throw cashierError(error?.message ?? "CREDIT_NOTE_DRAFT_NOT_FOUND");
    return { ok: true as const, draftId: String((row as { id: string }).id) };
  });

export const updateInvoiceCreditNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        reason: z.string().trim().min(1).max(500),
        items: z.array(amountItem).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_invoice_credit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _reason: data.reason,
      _items: data.items.map((item) => ({ sourceGroupId: item.sourceGroupId, gross: item.gross })),
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return { ok: true as const };
  });

export const deleteInvoiceCreditNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, draftId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("delete_invoice_credit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return { ok: true as const };
  });

export const issueInvoiceCreditNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; note: IssuedCreditNote }> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const key = assertIdempotencyKey(data.idempotencyKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("issue_invoice_credit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
      _idempotency_key: key,
    });
    if (error || !row) throw cashierError(error?.message ?? "CREDIT_NOTE_NOT_FOUND");
    const issued = row as {
      id: string;
      note_number: string;
      issued_at: string;
      reason: string;
      total_delta: number;
      reprint_count: number;
      snapshot: unknown;
    };
    return {
      ok: true,
      note: {
        id: issued.id,
        noteNumber: issued.note_number,
        issuedAt: issued.issued_at,
        reason: issued.reason,
        total: Number(issued.total_delta),
        issuedByName: null,
        reprintCount: issued.reprint_count,
        snapshot: mapCreditSnapshot(issued.snapshot),
      },
    };
  });

export const reprintInvoiceCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, noteId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("reprint_invoice_credit_note", {
      _restaurant_id: data.restaurantId,
      _note_id: data.noteId,
      _membership_id: me.id,
    });
    if (error || !row) throw cashierError(error?.message ?? "CREDIT_NOTE_NOT_FOUND");
    const issued = row as { id: string; snapshot: unknown; reprint_count: number };
    return {
      ok: true as const,
      noteId: issued.id,
      reprintCount: issued.reprint_count,
      snapshot: mapCreditSnapshot(issued.snapshot),
    };
  });
