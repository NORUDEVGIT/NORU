import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildAccountHistory,
  buildAccountStatement,
  historyHasBalanceActivity,
  queryAccountHistory,
  type AccountHistoryActor,
  type AccountHistoryAllocation,
  type AccountHistoryClose,
  type AccountHistoryDocument,
  type AccountHistoryEvent,
  type AccountHistoryFilter,
  type AccountHistoryFolio,
  type AccountLedgerRow,
  type AccountStatement,
} from "./cashiering-account-history";
import { cashierError, requireCashieringAccess } from "./cashiering.server";

const idSchema = z.string().uuid();
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pageSize = z.union([z.literal(10), z.literal(25), z.literal(50)]);

type ServiceClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

type AccountHeader = {
  id: string;
  accountNumber: string;
  accountKind: "company" | "group" | "master";
  currency: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  createdByMembershipId: string | null;
  master: {
    name: string;
    code: string | null;
    taxId: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    primaryContactName: string | null;
  };
};

const historyQuery = z.object({
  restaurantId: idSchema,
  accountId: idSchema,
  from: daySchema.nullable().optional(),
  to: daySchema.nullable().optional(),
  eventType: z
    .enum([
      "all",
      "charges",
      "transfers",
      "payments",
      "refunds",
      "write_offs",
      "corrections",
      "documents",
      "account",
    ])
    .optional(),
  actorId: idSchema.nullable().optional(),
  sourceFolioId: idSchema.nullable().optional(),
  documentNumber: z.string().max(80).nullable().optional(),
  paymentMethod: z.string().max(40).nullable().optional(),
  search: z.string().max(80).optional(),
  sort: z.enum(["newest", "oldest"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: pageSize.optional(),
});

async function loadPropertyTimezone(supabaseAdmin: ServiceClient, restaurantId: string) {
  const result = await supabaseAdmin
    .from("restaurants")
    .select("timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw cashierError(result.error.message);
  return (result.data as { timezone?: string | null } | null)?.timezone || "UTC";
}

async function loadAccount(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountHeader | null> {
  const accountResult = await supabaseAdmin
    .from("financial_accounts")
    .select(
      "id, account_number, account_kind, currency, status, opened_at, closed_at, created_by_membership_id, master_id",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .maybeSingle();
  if (accountResult.error) throw cashierError(accountResult.error.message);
  if (!accountResult.data) return null;
  const account = accountResult.data as {
    id: string;
    account_number: string;
    account_kind: AccountHeader["accountKind"];
    currency: string;
    status: "open" | "closed";
    opened_at: string;
    closed_at: string | null;
    created_by_membership_id: string | null;
    master_id: string;
  };
  const masterResult = await supabaseAdmin
    .from("guest_account_masters")
    .select("name, code, tax_id, address_line1, city, country, primary_contact_name")
    .eq("restaurant_id", restaurantId)
    .eq("id", account.master_id)
    .maybeSingle();
  if (masterResult.error) throw cashierError(masterResult.error.message);
  const master = (masterResult.data ?? null) as {
    name: string;
    code: string | null;
    tax_id: string | null;
    address_line1: string | null;
    city: string | null;
    country: string | null;
    primary_contact_name: string | null;
  } | null;
  return {
    id: account.id,
    accountNumber: account.account_number,
    accountKind: account.account_kind,
    currency: account.currency,
    status: account.status,
    openedAt: account.opened_at,
    closedAt: account.closed_at,
    createdByMembershipId: account.created_by_membership_id,
    master: {
      name: master?.name ?? "Account",
      code: master?.code ?? null,
      taxId: master?.tax_id ?? null,
      addressLine1: master?.address_line1 ?? null,
      city: master?.city ?? null,
      country: master?.country ?? null,
      primaryContactName: master?.primary_contact_name ?? null,
    },
  };
}

async function loadLedger(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountLedgerRow[]> {
  const result = await supabaseAdmin
    .from("folio_transactions")
    .select(
      "id, transaction_type, category, description, amount, posted_at, posted_by_membership_id, payment_method, original_transaction_id, reference_type, reference_id, transfer_id, hotel_cashier_shift_id",
    )
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (result.error) throw cashierError(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    type: String(row.transaction_type),
    category: String(row.category ?? ""),
    description: String(row.description ?? ""),
    amount: Number(row.amount),
    postedAt: String(row.posted_at),
    postedByMembershipId: row.posted_by_membership_id ? String(row.posted_by_membership_id) : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    originalTransactionId: row.original_transaction_id ? String(row.original_transaction_id) : null,
    referenceType: row.reference_type ? String(row.reference_type) : null,
    referenceId: row.reference_id ? String(row.reference_id) : null,
    transferId: row.transfer_id ? String(row.transfer_id) : null,
    shiftId: row.hotel_cashier_shift_id ? String(row.hotel_cashier_shift_id) : null,
  }));
}

async function loadActors(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  ids: Array<string | null | undefined>,
): Promise<Record<string, AccountHistoryActor>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const actors: Record<string, AccountHistoryActor> = {};
  if (unique.length === 0) return actors;
  const members = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id, role")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (members.error) throw cashierError(members.error.message);
  const memberRows = (members.data ?? []) as Array<{ id: string; user_id: string; role: string }>;
  const userIds = [...new Set(memberRows.map((row) => row.user_id))];
  const profiles = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", userIds)
    : { data: [], error: null };
  if (profiles.error) throw cashierError(profiles.error.message);
  const names = new Map<string, string>();
  for (const profile of (profiles.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    if (name) names.set(profile.id, name);
  }
  for (const member of memberRows) {
    actors[member.id] = { name: names.get(member.user_id) ?? null, role: member.role };
  }
  return actors;
}

async function loadTransferFolios(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  transferIds: string[],
): Promise<{
  folioByTransfer: Record<string, string>;
  folios: Record<string, AccountHistoryFolio>;
}> {
  const folioByTransfer: Record<string, string> = {};
  const folios: Record<string, AccountHistoryFolio> = {};
  if (transferIds.length === 0) return { folioByTransfer, folios };
  const pairs = await supabaseAdmin
    .from("folio_transactions")
    .select("transfer_id, folio_id")
    .eq("restaurant_id", restaurantId)
    .in("transfer_id", transferIds)
    .not("folio_id", "is", null);
  if (pairs.error) throw cashierError(pairs.error.message);
  const folioIds = new Set<string>();
  for (const pair of (pairs.data ?? []) as Array<{
    transfer_id: string;
    folio_id: string | null;
  }>) {
    if (!pair.folio_id || folioByTransfer[pair.transfer_id]) continue;
    folioByTransfer[pair.transfer_id] = pair.folio_id;
    folioIds.add(pair.folio_id);
  }
  if (folioIds.size === 0) return { folioByTransfer, folios };
  const result = await supabaseAdmin
    .from("guest_folios")
    .select(
      "id, folio_number, guest_profiles!guest_folios_guest_same_property(first_name, last_name)",
    )
    .eq("restaurant_id", restaurantId)
    .in("id", [...folioIds]);
  if (result.error) throw cashierError(result.error.message);
  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    const guest = row.guest_profiles as {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    const guestName = [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim();
    folios[String(row.id)] = {
      id: String(row.id),
      number: String(row.folio_number ?? ""),
      guestName: guestName || null,
    };
  }
  return { folioByTransfer, folios };
}

async function loadDocuments(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountHistoryDocument[]> {
  const invoiceResult = await supabaseAdmin
    .from("financial_account_invoices")
    .select("id, issued_number, issued_at, issued_by_membership_id, snapshot")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId)
    .not("issued_number", "is", null);
  if (invoiceResult.error) throw cashierError(invoiceResult.error.message);
  const invoices = (invoiceResult.data ?? []) as Array<{
    id: string;
    issued_number: string;
    issued_at: string;
    issued_by_membership_id: string | null;
    snapshot: { totals?: { invoiceTotal?: number; balance?: number } } | null;
  }>;
  const noteResult = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("id, note_number, note_type, issued_at, total_delta, issued_by_membership_id")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (noteResult.error && noteResult.error.code !== "42P01") {
    throw cashierError(noteResult.error.message);
  }
  const notes = (noteResult.data ?? []) as Array<{
    id: string;
    note_number: string;
    note_type: string;
    issued_at: string;
    total_delta: number | string;
    issued_by_membership_id: string | null;
  }>;
  return [
    ...invoices.map((invoice) => ({
      id: invoice.id,
      documentType: "invoice" as const,
      number: invoice.issued_number,
      amount: Number(
        invoice.snapshot?.totals?.invoiceTotal ?? invoice.snapshot?.totals?.balance ?? 0,
      ),
      issuedAt: invoice.issued_at,
      issuedByMembershipId: invoice.issued_by_membership_id,
    })),
    ...notes.map((note) => ({
      id: note.id,
      documentType: note.note_type === "debit" ? ("debit_note" as const) : ("credit_note" as const),
      number: note.note_number,
      amount: Number(note.total_delta),
      issuedAt: note.issued_at,
      issuedByMembershipId: note.issued_by_membership_id,
    })),
  ];
}

async function loadCloses(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountHistoryClose[]> {
  const result = await supabaseAdmin
    .from("folio_history")
    .select("id, created_at, actor_membership_id")
    .eq("restaurant_id", restaurantId)
    .eq("event_type", "financial_account_closed")
    .filter("new_values->>financial_account_id", "eq", accountId);
  if (result.error) throw cashierError(result.error.message);
  return (
    (result.data ?? []) as Array<{
      id: string;
      created_at: string;
      actor_membership_id: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    occurredAt: row.created_at,
    actorMembershipId: row.actor_membership_id,
  }));
}

async function loadAllocations(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountHistoryAllocation[]> {
  const result = await supabaseAdmin
    .from("financial_account_payment_allocations")
    .select(
      "id, amount, created_at, created_by_membership_id, payment_transaction_id, invoice_id, reason",
    )
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (result.error && result.error.code !== "42P01") throw cashierError(result.error.message);
  return (
    (result.data ?? []) as Array<{
      id: string;
      amount: number | string;
      created_at: string;
      created_by_membership_id: string | null;
      payment_transaction_id: string;
      invoice_id: string;
      reason: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    occurredAt: row.created_at,
    actorMembershipId: row.created_by_membership_id,
    paymentTransactionId: row.payment_transaction_id,
    paymentMethod: null,
    invoiceId: row.invoice_id,
    invoiceNumber: "",
    reason: row.reason,
  }));
}

function publicAccount(account: AccountHeader) {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    accountKind: account.accountKind,
    currency: account.currency,
    status: account.status,
    openedAt: account.openedAt,
    closedAt: account.closedAt,
    master: account.master,
  };
}

export const listFinancialAccountHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historyQuery.parse(input))
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    const [timezone, rows, documents, closes, allocations] = await Promise.all([
      loadPropertyTimezone(supabaseAdmin, data.restaurantId),
      loadLedger(supabaseAdmin, data.restaurantId, account.id),
      loadDocuments(supabaseAdmin, data.restaurantId, account.id),
      loadCloses(supabaseAdmin, data.restaurantId, account.id),
      loadAllocations(supabaseAdmin, data.restaurantId, account.id),
    ]);
    const transferIds = [
      ...new Set(rows.map((row) => row.transferId).filter((id): id is string => Boolean(id))),
    ];
    const { folioByTransfer, folios } = await loadTransferFolios(
      supabaseAdmin,
      data.restaurantId,
      transferIds,
    );
    const actorIds = [
      account.createdByMembershipId,
      ...rows.map((row) => row.postedByMembershipId),
      ...documents.map((document) => document.issuedByMembershipId),
      ...closes.map((close) => close.actorMembershipId),
      ...allocations.map((allocation) => allocation.actorMembershipId),
    ];
    const actors = await loadActors(supabaseAdmin, data.restaurantId, actorIds);
    const events = buildAccountHistory({
      accountId: account.id,
      currency: account.currency,
      openedAt: account.openedAt,
      closedAt: account.closedAt,
      createdByMembershipId: account.createdByMembershipId,
      rows,
      documents,
      closes,
      allocations: allocations.map((allocation) => ({
        ...allocation,
        paymentMethod:
          rows.find((row) => row.id === allocation.paymentTransactionId)?.paymentMethod ?? null,
        invoiceNumber:
          documents.find(
            (document) =>
              document.documentType === "invoice" && document.id === allocation.invoiceId,
          )?.number ?? allocation.invoiceNumber,
      })),
      actors,
      folios,
      folioByTransfer,
    });
    const page = queryAccountHistory(events, {
      from: data.from,
      to: data.to,
      eventType: data.eventType as AccountHistoryFilter | undefined,
      actorId: data.actorId,
      sourceFolioId: data.sourceFolioId,
      documentNumber: data.documentNumber,
      paymentMethod: data.paymentMethod,
      search: data.search,
      sort: data.sort,
      page: data.page,
      pageSize: data.pageSize,
      timezone,
    });
    const actorOptions = [
      ...new Map(
        events
          .filter((event) => event.actor.id)
          .map((event) => [
            event.actor.id,
            { id: event.actor.id as string, name: event.actor.name },
          ]),
      ).values(),
    ];
    return {
      account: publicAccount(account),
      timezone,
      hasBalanceActivity: historyHasBalanceActivity(events),
      actors: actorOptions,
      ...page,
    };
  });

export const getFinancialAccountStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        fromDate: daySchema,
        toDate: daySchema,
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<(AccountStatement & { account: ReturnType<typeof publicAccount> }) | null> => {
      await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
      if (!account) return null;
      const [timezone, rows, documents] = await Promise.all([
        loadPropertyTimezone(supabaseAdmin, data.restaurantId),
        loadLedger(supabaseAdmin, data.restaurantId, account.id),
        loadDocuments(supabaseAdmin, data.restaurantId, account.id),
      ]);
      const transferIds = [
        ...new Set(rows.map((row) => row.transferId).filter((id): id is string => Boolean(id))),
      ];
      const { folioByTransfer, folios } = await loadTransferFolios(
        supabaseAdmin,
        data.restaurantId,
        transferIds,
      );
      const documentNumbers: Record<string, string> = {};
      for (const document of documents) {
        if (document.documentType === "credit_note") documentNumbers[document.id] = document.number;
      }
      const statement = buildAccountStatement({
        currency: account.currency,
        timezone,
        fromDate: data.fromDate,
        toDate: data.toDate,
        closedAt: account.closedAt,
        rows,
        folios,
        folioByTransfer,
        documentNumbers,
      });
      return { ...statement, account: publicAccount(account) };
    },
  );

export type { AccountHistoryEvent };
