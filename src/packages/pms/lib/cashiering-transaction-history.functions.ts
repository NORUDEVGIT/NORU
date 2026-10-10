import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  activityLabel,
  type ActivityEvent,
  type HistoryAllocation,
  type HistoryCounterparty,
  type HistoryCoverageInput,
  type HistoryLedgerRow,
} from "./cashiering-transaction-history";
import { canManageCashiering, cashierError, requireCashieringAccess } from "./cashiering.server";

const idSchema = z.string().uuid();
const ownerSchema = z.object({
  restaurantId: idSchema,
  ownerType: z.enum(["guest_folio", "financial_account"]),
  ownerId: idSchema,
});

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUEST_ACTIVITY = [
  "invoice_issued",
  "invoice_reprinted",
  "invoice_draft_created",
  "invoice_draft_updated",
  "invoice_draft_deleted",
  "deposit_allocated",
  "folio_closed",
] as const;

type Admin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

async function actorNames(supabaseAdmin: Admin, restaurantId: string, ids: Array<string | null>) {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return names;
  const { data: members } = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  if (memberRows.length === 0) return names;
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in(
      "id",
      memberRows.map((row) => row.user_id),
    );
  const byUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [
      profile.id,
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.email ||
        null,
    ]),
  );
  for (const member of memberRows) {
    const name = byUser.get(member.user_id);
    if (name) names.set(member.id, name);
  }
  return names;
}

function detailFrom(notes: string | null, values: Record<string, unknown> | null): string {
  const raw = [
    values?.issued_number,
    values?.note_number,
    values?.issuedNumber,
    values?.noteNumber,
    notes,
  ].find((value) => typeof value === "string" && value.trim() !== "") as string | undefined;
  if (!raw || UUID_TEXT.test(raw.trim())) return "";
  return raw.trim();
}

function toActivity(
  row: {
    id: string;
    event_type: string;
    notes?: string | null;
    new_values?: Record<string, unknown> | null;
    created_at: string;
    actor_membership_id?: string | null;
  },
  names: Map<string, string>,
): ActivityEvent {
  return {
    id: row.id,
    kind: row.event_type,
    label: activityLabel(row.event_type),
    occurredAt: row.created_at,
    detail: detailFrom(row.notes ?? null, row.new_values ?? null),
    actor: row.actor_membership_id ? (names.get(row.actor_membership_id) ?? null) : null,
  };
}

async function loadGuestActivity(supabaseAdmin: Admin, restaurantId: string, ownerId: string) {
  const [history, notes] = await Promise.all([
    supabaseAdmin
      .from("folio_history")
      .select("id, event_type, notes, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", restaurantId)
      .eq("folio_id", ownerId)
      .in("event_type", [...GUEST_ACTIVITY])
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("invoice_credit_note_events")
      .select("id, event_type, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", restaurantId)
      .eq("folio_id", ownerId)
      .order("created_at", { ascending: false }),
  ]);
  if (history.error) throw cashierError(history.error.message);
  if (notes.error) throw cashierError(notes.error.message);
  return [...(history.data ?? []), ...(notes.data ?? [])] as Array<{
    id: string;
    event_type: string;
    notes?: string | null;
    new_values?: Record<string, unknown> | null;
    created_at: string;
    actor_membership_id?: string | null;
  }>;
}

async function loadAccountActivity(supabaseAdmin: Admin, restaurantId: string, ownerId: string) {
  const [invoices, notes, closed] = await Promise.all([
    supabaseAdmin
      .from("financial_account_invoice_events")
      .select("id, event_type, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", restaurantId)
      .eq("financial_account_id", ownerId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("invoice_credit_note_events")
      .select("id, event_type, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", restaurantId)
      .eq("financial_account_id", ownerId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("folio_history")
      .select("id, event_type, notes, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", restaurantId)
      .eq("event_type", "financial_account_closed")
      .filter("new_values->>financial_account_id", "eq", ownerId),
  ]);
  if (invoices.error) throw cashierError(invoices.error.message);
  if (notes.error) throw cashierError(notes.error.message);
  if (closed.error) throw cashierError(closed.error.message);
  return [...(invoices.data ?? []), ...(notes.data ?? []), ...(closed.data ?? [])] as Array<{
    id: string;
    event_type: string;
    notes?: string | null;
    new_values?: Record<string, unknown> | null;
    created_at: string;
    actor_membership_id?: string | null;
  }>;
}

function parentIds(snapshot: unknown): string[] {
  const lines = (snapshot as { lines?: Array<Record<string, unknown>> } | null)?.lines ?? [];
  return lines
    .filter((line) => {
      const category = String(line.category ?? "");
      return category !== "tax" && category !== "service_charge" && !line.originalTransactionId;
    })
    .map((line) => String(line.id ?? ""))
    .filter(Boolean);
}

const LEDGER_SELECT =
  "id, transaction_type, category, description, amount, posted_at, created_at, reference_type, reference_id, payment_method, posted_by_membership_id, original_transaction_id, transfer_id, charge_source, quantity, unit_amount, charge_snapshot";

function mapLedger(row: Record<string, unknown>, names: Map<string, string>): HistoryLedgerRow {
  const snapshot = row.charge_snapshot as Record<string, unknown> | null;
  const department = snapshot?.departmentName;
  const membership = row.posted_by_membership_id ? String(row.posted_by_membership_id) : null;
  return {
    id: String(row.id),
    type: String(row.transaction_type),
    category: String(row.category),
    description: String(row.description ?? ""),
    amount: Number(row.amount),
    postedAt: String(row.posted_at),
    createdAt: String(row.created_at ?? row.posted_at),
    postedBy: membership ? (names.get(membership) ?? null) : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    originalTransactionId: row.original_transaction_id ? String(row.original_transaction_id) : null,
    referenceType: row.reference_type ? String(row.reference_type) : null,
    referenceId: row.reference_id ? String(row.reference_id) : null,
    transferId: row.transfer_id ? String(row.transfer_id) : null,
    quantity: row.quantity == null || row.quantity === "" ? null : Number(row.quantity),
    unitAmount: row.unit_amount == null || row.unit_amount === "" ? null : Number(row.unit_amount),
    chargeSource: row.charge_source ? String(row.charge_source) : null,
    departmentName: typeof department === "string" && department.trim() ? department : null,
  };
}

async function loadAccountLedger(supabaseAdmin: Admin, restaurantId: string, ownerId: string) {
  const accountResult = await supabaseAdmin
    .from("financial_accounts")
    .select("id, account_number, status, master_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", ownerId)
    .maybeSingle();
  if (accountResult.error) throw cashierError(accountResult.error.message);
  if (!accountResult.data) return null;
  const account = accountResult.data as {
    id: string;
    account_number: string;
    status: string;
    master_id: string;
  };
  const txnResult = await supabaseAdmin
    .from("folio_transactions")
    .select(LEDGER_SELECT)
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", ownerId)
    .order("posted_at", { ascending: true });
  if (txnResult.error) throw cashierError(txnResult.error.message);
  const txnRows = (txnResult.data ?? []) as Array<Record<string, unknown>>;
  const names = await actorNames(
    supabaseAdmin,
    restaurantId,
    txnRows.map((row) =>
      row.posted_by_membership_id ? String(row.posted_by_membership_id) : null,
    ),
  );
  const rows = txnRows.map((row) => mapLedger(row, names));
  const depositIds = rows.filter((row) => row.type === "deposit").map((row) => row.id);
  const allocations: HistoryAllocation[] = [];
  if (depositIds.length > 0) {
    const allocationResult = await supabaseAdmin
      .from("folio_deposit_allocations")
      .select("deposit_transaction_id, charge_transaction_id, amount")
      .eq("restaurant_id", restaurantId)
      .in("deposit_transaction_id", depositIds);
    if (allocationResult.error) throw cashierError(allocationResult.error.message);
    for (const line of (allocationResult.data ?? []) as Array<Record<string, unknown>>) {
      allocations.push({
        depositTransactionId: String(line.deposit_transaction_id),
        chargeTransactionId: line.charge_transaction_id ? String(line.charge_transaction_id) : null,
        amount: Number(line.amount),
      });
    }
  }
  const transferIds = [
    ...new Set(rows.map((row) => row.transferId).filter((id): id is string => Boolean(id))),
  ];
  const counterparts: Record<string, HistoryCounterparty> = {};
  if (transferIds.length > 0) {
    const pairResult = await supabaseAdmin
      .from("folio_transactions")
      .select("transfer_id, folio_id")
      .eq("restaurant_id", restaurantId)
      .in("transfer_id", transferIds);
    if (pairResult.error) throw cashierError(pairResult.error.message);
    const folioIds = [
      ...new Set(
        ((pairResult.data ?? []) as Array<{ folio_id: string | null }>)
          .map((row) => row.folio_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const numbers = new Map<string, string>();
    if (folioIds.length > 0) {
      const folioResult = await supabaseAdmin
        .from("guest_folios")
        .select("id, folio_number")
        .eq("restaurant_id", restaurantId)
        .in("id", folioIds);
      for (const folio of (folioResult.data ?? []) as Array<{ id: string; folio_number: string }>) {
        numbers.set(folio.id, folio.folio_number);
      }
    }
    for (const pair of (pairResult.data ?? []) as Array<{
      transfer_id: string;
      folio_id: string | null;
    }>) {
      if (!pair.folio_id) continue;
      counterparts[pair.transfer_id] = {
        label: numbers.get(pair.folio_id) ?? "Folio",
        folioId: pair.folio_id,
        accountId: null,
      };
    }
  }
  const invoiceResult = await supabaseAdmin
    .from("financial_account_invoices")
    .select("id, issued_number, snapshot")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", ownerId);
  if (invoiceResult.error) throw cashierError(invoiceResult.error.message);
  const noteResult = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("id, note_number, note_type")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", ownerId);
  if (noteResult.error) throw cashierError(noteResult.error.message);
  const noteRows = (noteResult.data ?? []) as Array<{
    id: string;
    note_number: string;
    note_type: string;
  }>;
  const noteIds = noteRows.map((note) => note.id);
  const lineParents = new Map<string, string[]>();
  if (noteIds.length > 0) {
    const lineResult = await supabaseAdmin
      .from("invoice_credit_note_lines")
      .select("credit_note_id, source_group_id, component_kind")
      .eq("restaurant_id", restaurantId)
      .in("credit_note_id", noteIds);
    if (lineResult.error) throw cashierError(lineResult.error.message);
    for (const line of (lineResult.data ?? []) as Array<{
      credit_note_id: string;
      source_group_id: string;
      component_kind: string;
    }>) {
      if (line.component_kind !== "parent") continue;
      const bucket = lineParents.get(line.credit_note_id) ?? [];
      bucket.push(line.source_group_id);
      lineParents.set(line.credit_note_id, bucket);
    }
  }
  const master = await supabaseAdmin
    .from("guest_account_masters")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", account.master_id)
    .maybeSingle();
  const coverage: HistoryCoverageInput = {
    legacyInvoice: null,
    invoices: (
      (invoiceResult.data ?? []) as Array<{ id: string; issued_number: string; snapshot: unknown }>
    ).map((invoice) => ({
      id: invoice.id,
      number: invoice.issued_number,
      parentIds: parentIds(invoice.snapshot),
    })),
    debitNotes: noteRows
      .filter((note) => note.note_type === "debit")
      .map((note) => ({
        id: note.id,
        number: note.note_number,
        parentIds: lineParents.get(note.id) ?? [],
      })),
    creditNotes: noteRows
      .filter((note) => note.note_type === "credit")
      .map((note) => ({ id: note.id, number: note.note_number, invoiceNumber: null })),
  };
  return {
    accountName: (master.data as { name?: string } | null)?.name ?? "Account",
    accountNumber: account.account_number,
    open: account.status === "open",
    rows,
    allocations,
    counterparts,
    coverage,
  };
}

async function loadNoteCoverage(
  supabaseAdmin: Admin,
  restaurantId: string,
  column: "folio_id" | "financial_account_id",
  ownerId: string,
): Promise<Pick<HistoryCoverageInput, "debitNotes" | "creditNotes">> {
  const noteResult = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("id, note_number, note_type")
    .eq("restaurant_id", restaurantId)
    .eq(column, ownerId);
  if (noteResult.error) throw cashierError(noteResult.error.message);
  const noteRows = (noteResult.data ?? []) as Array<{
    id: string;
    note_number: string;
    note_type: string;
  }>;
  const lineParents = new Map<string, string[]>();
  if (noteRows.length > 0) {
    const lineResult = await supabaseAdmin
      .from("invoice_credit_note_lines")
      .select("credit_note_id, source_group_id, component_kind")
      .eq("restaurant_id", restaurantId)
      .in(
        "credit_note_id",
        noteRows.map((note) => note.id),
      );
    if (lineResult.error) throw cashierError(lineResult.error.message);
    for (const line of (lineResult.data ?? []) as Array<{
      credit_note_id: string;
      source_group_id: string;
      component_kind: string;
    }>) {
      if (line.component_kind !== "parent") continue;
      const bucket = lineParents.get(line.credit_note_id) ?? [];
      bucket.push(line.source_group_id);
      lineParents.set(line.credit_note_id, bucket);
    }
  }
  return {
    debitNotes: noteRows
      .filter((note) => note.note_type === "debit")
      .map((note) => ({
        id: note.id,
        number: note.note_number,
        parentIds: lineParents.get(note.id) ?? [],
      })),
    creditNotes: noteRows
      .filter((note) => note.note_type === "credit")
      .map((note) => ({ id: note.id, number: note.note_number, invoiceNumber: null })),
  };
}

export const listOwnerActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ownerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows =
      data.ownerType === "guest_folio"
        ? await loadGuestActivity(supabaseAdmin, data.restaurantId, data.ownerId)
        : await loadAccountActivity(supabaseAdmin, data.restaurantId, data.ownerId);
    const names = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      rows.map((row) => row.actor_membership_id ?? null),
    );
    const notes = await loadNoteCoverage(
      supabaseAdmin,
      data.restaurantId,
      data.ownerType === "guest_folio" ? "folio_id" : "financial_account_id",
      data.ownerId,
    );
    const activity = rows
      .map((row) => toActivity(row, names))
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    return { activity, ...notes };
  });

export const getFinancialAccountLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ledger = await loadAccountLedger(supabaseAdmin, data.restaurantId, data.accountId);
    if (!ledger) return null;
    return { ...ledger, canManage: canManageCashiering(me.role) };
  });
