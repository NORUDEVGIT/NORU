import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapDebitBoard,
  mapDebitPreview,
  mapDebitSnapshot,
  type DebitNoteBoard,
  type DebitPreview,
  type IssuedDebitNote,
} from "./cashiering-debit-notes";
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

function targetArgs(data: { guestInvoiceId?: string; accountInvoiceId?: string }) {
  return {
    _guest_invoice_id: data.guestInvoiceId ?? null,
    _account_invoice_id: data.accountInvoiceId ?? null,
  };
}

export const getInvoiceDebitBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<DebitNoteBoard & { canManage: boolean }> => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("list_invoice_debit_board", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
    });
    if (error) throw cashierError(error.message);
    const row = (payload ?? {}) as Record<string, unknown>;
    if (row.ok === false) throw cashierError(String(row.code ?? "INVOICE_NOT_FOUND"));
    return { ...mapDebitBoard(payload), canManage: canManageCashiering(me.role) };
  });

export const previewInvoiceDebitNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    targetSchema.and(z.object({ sourceIds: z.array(idSchema).min(1).max(100) })).parse(input),
  )
  .handler(async ({ data, context }): Promise<DebitPreview> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("preview_invoice_debit_note", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
      _source_ids: data.sourceIds,
    });
    if (error) throw cashierError(error.message);
    return mapDebitPreview(payload);
  });

export const createInvoiceDebitNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    targetSchema.and(z.object({ reason: z.string().trim().min(1).max(500) })).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("create_invoice_debit_note_draft", {
      _restaurant_id: data.restaurantId,
      ...targetArgs(data),
      _reason: data.reason,
      _membership_id: me.id,
    });
    if (error || !row) throw cashierError(error?.message ?? "DEBIT_NOTE_DRAFT_NOT_FOUND");
    return { ok: true as const, draftId: String((row as { id: string }).id) };
  });

export const updateInvoiceDebitNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        reason: z.string().trim().min(1).max(500),
        sourceIds: z.array(idSchema).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_invoice_debit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _reason: data.reason,
      _source_ids: data.sourceIds,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return { ok: true as const };
  });

export const deleteInvoiceDebitNoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, draftId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("delete_invoice_debit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return { ok: true as const };
  });

export const issueInvoiceDebitNoteDraft = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<{ ok: true; note: IssuedDebitNote }> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const key = assertIdempotencyKey(data.idempotencyKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("issue_invoice_debit_note_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
      _idempotency_key: key,
    });
    if (error || !row) throw cashierError(error?.message ?? "DEBIT_NOTE_DRAFT_NOT_FOUND");
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
        snapshot: mapDebitSnapshot(issued.snapshot),
      },
    };
  });

export const reprintInvoiceDebitNote = createServerFn({ method: "POST" })
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
    if (error || !row) throw cashierError(error?.message ?? "DEBIT_NOTE_DRAFT_NOT_FOUND");
    const issued = row as { id: string; snapshot: unknown; reprint_count: number };
    return {
      ok: true as const,
      noteId: issued.id,
      reprintCount: issued.reprint_count,
      snapshot: mapDebitSnapshot(issued.snapshot),
    };
  });
