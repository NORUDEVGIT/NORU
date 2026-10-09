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
  type InvoiceBoard,
  type InvoiceComponentLine,
  type InvoiceDraftRow,
  type InvoiceGroupView,
  type InvoiceSelectionPreview,
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

export async function loadGuestFolioInvoices(
  supabaseAdmin: Awaited<
    typeof import("@/integrations/supabase/client.server")
  >["supabaseAdmin"],
  restaurantId: string,
  folioId: string,
): Promise<{ invoices: IssuedFolioInvoiceRow[]; legacyFolio: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("guest_folio_invoices")
    .select(
      "id, issued_number, sequence_number, issued_at, reprint_count, last_reprinted_at, snapshot, coverage_scope",
    )
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folioId)
    .order("issued_at", { ascending: false });
  if (error) {
    if (error.message.includes("guest_folio_invoices") || error.message.includes("does not exist")) {
      return { invoices: [], legacyFolio: false };
    }
    throw cashierError(error.message);
  }
  const rows = (data ?? []) as Array<Parameters<typeof mapInvoiceRow>[0] & { coverage_scope?: string }>;
  return {
    invoices: rows.map((row) => mapInvoiceRow(row)),
    legacyFolio: rows.some((row) => row.coverage_scope === "legacy_folio"),
  };
}

export async function loadGuestFolioInvoice(
  supabaseAdmin: Awaited<
    typeof import("@/integrations/supabase/client.server")
  >["supabaseAdmin"],
  restaurantId: string,
  folioId: string,
): Promise<IssuedFolioInvoiceRow | null> {
  const loaded = await loadGuestFolioInvoices(supabaseAdmin, restaurantId, folioId);
  return loaded.invoices[0] ?? null;
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

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function optionalNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapComponentLines(value: unknown): InvoiceComponentLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => {
    const row = line as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      description: String(row.description ?? ""),
      amount: num(row.amount),
      name: String(row.name ?? row.description ?? ""),
      code: row.code ? String(row.code) : null,
      basis: row.basis ? String(row.basis) : null,
      calculation: row.calculation ? String(row.calculation) : null,
    };
  });
}

function mapInvoiceGroup(value: unknown): InvoiceGroupView {
  const row = value as Record<string, unknown>;
  const state = String(row.invoiceState ?? "uninvoiced");
  return {
    parentTransactionId: String(row.parentTransactionId ?? ""),
    postedAt: String(row.postedAt ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category ?? ""),
    departmentName: row.departmentName ? String(row.departmentName) : null,
    chargeSource: row.chargeSource ? String(row.chargeSource) : null,
    quantity: optionalNum(row.quantity),
    unitAmount: optionalNum(row.unitAmount),
    subtotal: num(row.subtotal),
    taxTotal: num(row.taxTotal),
    serviceChargeTotal: num(row.serviceChargeTotal),
    grossTotal: num(row.grossTotal),
    invoiceState: state === "invoiced" || state === "in_draft" ? state : "uninvoiced",
    coveredInvoiceId: row.coveredInvoiceId ? String(row.coveredInvoiceId) : null,
    coveredInvoiceNumber: row.coveredInvoiceNumber ? String(row.coveredInvoiceNumber) : null,
    taxLines: mapComponentLines(row.taxLines),
    serviceLines: mapComponentLines(row.serviceLines),
  };
}

async function preparedByName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  membershipId: string | null,
): Promise<string | null> {
  if (!membershipId) return null;
  const { data: member } = await supabaseAdmin
    .from("restaurant_users")
    .select("user_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", membershipId)
    .maybeSingle();
  const userId = (member as { user_id?: string } | null)?.user_id;
  if (!userId) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const row = profile as { first_name?: string | null; last_name?: string | null } | null;
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

export const getGuestFolioInvoiceBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<InvoiceBoard> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: board, error } = await supabaseAdmin.rpc("list_guest_folio_invoice_groups", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
    });
    if (error) throw cashierError(error.message);
    const row = (board ?? {}) as Record<string, unknown>;
    const draftRaw = row.draft as Record<string, unknown> | null;
    const selectedIds = Array.isArray(draftRaw?.selectedIds)
      ? draftRaw.selectedIds.map((id) => String(id))
      : [];
    const draft: InvoiceDraftRow | null = draftRaw
      ? {
          id: String(draftRaw.id ?? ""),
          notes: draftRaw.notes ? String(draftRaw.notes) : null,
          updatedAt: String(draftRaw.updatedAt ?? ""),
          createdByMembershipId: String(draftRaw.createdByMembershipId ?? ""),
          selectedIds,
          preparedBy: await preparedByName(
            supabaseAdmin,
            data.restaurantId,
            draftRaw.createdByMembershipId ? String(draftRaw.createdByMembershipId) : null,
          ),
        }
      : null;
    return {
      legacyFolio: row.legacyFolio === true,
      invoiceableAmount: num(row.invoiceableAmount),
      groups: Array.isArray(row.groups) ? row.groups.map(mapInvoiceGroup) : [],
      draft,
    };
  });

export const previewGuestFolioInvoiceSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        folioId: idSchema,
        sourceIds: z.array(idSchema).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InvoiceSelectionPreview> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error } = await supabaseAdmin.rpc("preview_guest_folio_invoice_selection", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
      _source_ids: data.sourceIds,
    });
    if (error) throw cashierError(error.message);
    const row = (preview ?? {}) as Record<string, unknown>;
    return {
      groups: Array.isArray(row.groups) ? row.groups.map(mapInvoiceGroup) : [],
      warnings: Array.isArray(row.warnings)
        ? row.warnings.map((warning) => {
            const item = warning as Record<string, unknown>;
            return {
              parentTransactionId: String(item.parentTransactionId ?? ""),
              code: String(item.code ?? "CHARGE_NOT_INVOICEABLE"),
            };
          })
        : [],
      subtotal: num(row.subtotal),
      tax: num(row.tax),
      serviceCharge: num(row.serviceCharge),
      total: num(row.total),
      legacyFolio: row.legacyFolio === true,
    };
  });

const draftNotes = z.string().max(500).optional();

export const createGuestFolioInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema, notes: draftNotes }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("create_guest_folio_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
      _notes: data.notes ?? null,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const, draftId: String((row as { id?: string } | null)?.id ?? "") };
  });

export const updateGuestFolioInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        notes: draftNotes,
        sourceIds: z.array(idSchema).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_guest_folio_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _notes: data.notes ?? null,
      _source_ids: data.sourceIds,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const };
  });

export const deleteGuestFolioInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, draftId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("delete_guest_folio_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const };
  });

export const issueGuestFolioInvoiceDraft = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<InvoiceActionResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("issue_guest_folio_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, invoice: mapInvoiceRow(row as Parameters<typeof mapInvoiceRow>[0]) };
  });
