import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cashierError, requireCashieringAccess } from "./cashiering.server";
import {
  buildAccountChargeGroups,
  chargeCapabilities,
  currentSourceFolioIds,
  ownershipSummary,
  queryChargeGroups,
  querySourceFolios,
  rollupSourceFolios,
  visibleChargeGroups,
  type AccountChargeGroup,
  type AccountNoteHit,
  type ChargeListRow,
  type InvoiceCoverageHit,
  type OwnershipLedgerRow,
  type SourceFolioContext,
  type SourceFolioRow,
} from "./cashiering-account-ownership";

const idSchema = z.string().min(1);

type ServiceClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function actorNames(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  membershipIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (membershipIds.length === 0) return names;
  const members = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", membershipIds);
  const memberRows = (members.data ?? []) as Array<{ id: string; user_id: string }>;
  const userIds = [...new Set(memberRows.map((row) => row.user_id))];
  if (userIds.length === 0) return names;
  const profiles = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);
  const byUser = new Map<string, string>();
  for (const profile of (profiles.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    if (name) byUser.set(profile.id, name);
  }
  for (const member of memberRows) {
    const name = byUser.get(member.user_id);
    if (name) names.set(member.id, name);
  }
  return names;
}

export async function loadAccountChargeGroups(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountChargeGroup[] | null> {
  const accountResult = await supabaseAdmin
    .from("financial_accounts")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId);
  const accountRows = (accountResult.data ?? []) as Array<{ id: string }>;
  if (accountResult.error) throw cashierError(accountResult.error.message);
  if (accountRows.length === 0) return null;

  const txnResult = await supabaseAdmin
    .from("folio_transactions")
    .select(
      "id, financial_account_id, folio_id, transaction_type, category, description, amount, posted_at, original_transaction_id, posted_by_membership_id, quantity, unit_amount",
    )
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (txnResult.error) throw cashierError(txnResult.error.message);
  const accountLines = (txnResult.data ?? []) as Array<Record<string, unknown>>;

  const originIds = [
    ...new Set(
      accountLines
        .filter((row) => row.transaction_type === "transfer_in" && row.original_transaction_id)
        .map((row) => String(row.original_transaction_id)),
    ),
  ];
  const origins: Array<Record<string, unknown>> = [];
  if (originIds.length > 0) {
    const originResult = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, financial_account_id, folio_id, transaction_type, category, description, amount, posted_at, original_transaction_id, posted_by_membership_id, quantity, unit_amount",
      )
      .eq("restaurant_id", restaurantId)
      .in("id", originIds);
    if (originResult.error) throw cashierError(originResult.error.message);
    origins.push(...((originResult.data ?? []) as Array<Record<string, unknown>>));
    const parentIds = [
      ...new Set(
        origins
          .filter(
            (row) =>
              (row.category === "tax" || row.category === "service_charge") &&
              row.original_transaction_id,
          )
          .map((row) => String(row.original_transaction_id)),
      ),
    ].filter((id) => !origins.some((row) => String(row.id) === id));
    if (parentIds.length > 0) {
      const parentResult = await supabaseAdmin
        .from("folio_transactions")
        .select(
          "id, financial_account_id, folio_id, transaction_type, category, description, amount, posted_at, original_transaction_id, posted_by_membership_id, quantity, unit_amount",
        )
        .eq("restaurant_id", restaurantId)
        .in("id", parentIds);
      if (parentResult.error) throw cashierError(parentResult.error.message);
      origins.push(...((parentResult.data ?? []) as Array<Record<string, unknown>>));
    }
  }

  function mapRow(row: Record<string, unknown>): OwnershipLedgerRow {
    return {
      id: String(row.id),
      accountId: row.financial_account_id ? String(row.financial_account_id) : null,
      folioId: row.folio_id ? String(row.folio_id) : null,
      type: String(row.transaction_type),
      category: String(row.category ?? ""),
      description: String(row.description ?? ""),
      amount: Number(row.amount),
      postedAt: String(row.posted_at),
      originalTransactionId: row.original_transaction_id
        ? String(row.original_transaction_id)
        : null,
      postedByMembershipId: row.posted_by_membership_id
        ? String(row.posted_by_membership_id)
        : null,
      quantity: row.quantity == null || row.quantity === "" ? null : Number(row.quantity),
      unitAmount:
        row.unit_amount == null || row.unit_amount === "" ? null : Number(row.unit_amount),
    };
  }

  const lineResult = await supabaseAdmin
    .from("financial_account_invoice_lines")
    .select("source_group_id, component_transaction_id, invoice_id")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (lineResult.error && lineResult.error.code !== "42P01")
    throw cashierError(lineResult.error.message);
  const lines = (lineResult.data ?? []) as Array<{
    source_group_id: string;
    component_transaction_id: string;
    invoice_id: string;
  }>;
  const invoiceIds = [...new Set(lines.map((line) => line.invoice_id))];
  const invoiceNumbers = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const invoiceResult = await supabaseAdmin
      .from("financial_account_invoices")
      .select("id, issued_number")
      .eq("restaurant_id", restaurantId)
      .in("id", invoiceIds);
    if (invoiceResult.error) throw cashierError(invoiceResult.error.message);
    for (const invoice of (invoiceResult.data ?? []) as Array<{
      id: string;
      issued_number: string;
    }>) {
      invoiceNumbers.set(invoice.id, invoice.issued_number);
    }
  }
  const coverage: InvoiceCoverageHit[] = lines.map((line) => ({
    sourceGroupId: line.source_group_id,
    componentTransactionId: line.component_transaction_id,
    invoiceId: line.invoice_id,
    invoiceNumber: invoiceNumbers.get(line.invoice_id) ?? "",
  }));

  const draftResult = await supabaseAdmin
    .from("financial_account_invoice_drafts")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  const draftIds = ((draftResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  let draftGroupIds: string[] = [];
  if (!draftResult.error && draftIds.length > 0) {
    const itemResult = await supabaseAdmin
      .from("financial_account_invoice_draft_items")
      .select("source_group_id")
      .in("draft_id", draftIds);
    if (!itemResult.error) {
      draftGroupIds = ((itemResult.data ?? []) as Array<{ source_group_id: string }>).map(
        (row) => row.source_group_id,
      );
    }
  }

  const noteResult = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("id, note_type")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  const notes: AccountNoteHit[] = [];
  if (!noteResult.error) {
    const noteRows = (noteResult.data ?? []) as Array<{ id: string; note_type: string }>;
    const noteIds = noteRows.map((row) => row.id);
    const noteType = new Map(noteRows.map((row) => [row.id, row.note_type]));
    if (noteIds.length > 0) {
      const noteLines = await supabaseAdmin
        .from("invoice_credit_note_lines")
        .select("credit_note_id, source_group_id, credited_amount")
        .eq("restaurant_id", restaurantId)
        .in("credit_note_id", noteIds);
      if (!noteLines.error) {
        for (const line of (noteLines.data ?? []) as Array<{
          credit_note_id: string;
          source_group_id: string;
          credited_amount: number | string;
        }>) {
          notes.push({
            sourceGroupId: line.source_group_id,
            noteType: noteType.get(line.credit_note_id) === "debit" ? "debit" : "credit",
            amount: Number(line.credited_amount),
          });
        }
      }
    }
  }

  return buildAccountChargeGroups({
    accountId,
    rows: [...accountLines.map(mapRow), ...origins.map(mapRow)],
    coverage,
    draftGroupIds,
    notes,
  });
}

async function folioContext(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  folioIds: string[],
): Promise<Map<string, SourceFolioContext>> {
  const context = new Map<string, SourceFolioContext>();
  if (folioIds.length === 0) return context;
  const result = await supabaseAdmin
    .from("guest_folios")
    .select(
      "id, folio_number, status, reservation_id, guest_id, " +
        "guest_profiles!guest_folios_guest_same_property(first_name, last_name), " +
        "hotel_reservations!guest_folios_reservation_same_property(confirmation_number, status, arrival_date, departure_date, hotel_rooms!hotel_reservations_room_same_type(room_number))",
    )
    .eq("restaurant_id", restaurantId)
    .in("id", folioIds);
  if (result.error) throw cashierError(result.error.message);
  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    const guest = row.guest_profiles as {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    const reservation = row.hotel_reservations as {
      confirmation_number?: string | null;
      status?: string | null;
      arrival_date?: string | null;
      departure_date?: string | null;
      hotel_rooms?: { room_number?: string | null } | null;
    } | null;
    const guestName = [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim();
    context.set(String(row.id), {
      folioNumber: String(row.folio_number ?? ""),
      guestId: row.guest_id ? String(row.guest_id) : null,
      guestName: guestName || null,
      reservationId: row.reservation_id ? String(row.reservation_id) : null,
      reservationNumber: reservation?.confirmation_number ?? null,
      roomNumber: reservation?.hotel_rooms?.room_number ?? null,
      arrivalDate: reservation?.arrival_date ?? null,
      departureDate: reservation?.departure_date ?? null,
      folioStatus: row.status === "closed" ? "closed" : "open",
      stayStatus: reservation?.status ?? null,
    });
  }
  return context;
}

const sourceQuery = z.object({
  restaurantId: idSchema,
  accountId: idSchema,
  search: z.string().max(80).optional(),
  stay: z.enum(["all", "in_house", "checked_out", "folio_open", "folio_closed"]).optional(),
  coverage: z.enum(["all", "invoiced", "partial", "uninvoiced"]).optional(),
  scope: z.enum(["current", "history"]).optional(),
  sort: z.enum(["recent", "guest", "arrival", "departure", "owned"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).optional(),
});

export const listFinancialAccountSourceFolios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sourceQuery.parse(input))
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groups = await loadAccountChargeGroups(supabaseAdmin, data.restaurantId, data.accountId);
    if (!groups) return null;
    const scope = data.scope ?? "current";
    const rollups = rollupSourceFolios(groups, scope);
    const contexts = await folioContext(
      supabaseAdmin,
      data.restaurantId,
      rollups.map((row) => row.sourceFolioId),
    );
    const rows: SourceFolioRow[] = rollups.map((row) => {
      const info = contexts.get(row.sourceFolioId);
      return {
        ...row,
        folioNumber: info?.folioNumber ?? row.sourceFolioId,
        guestId: info?.guestId ?? null,
        guestName: info?.guestName ?? null,
        reservationId: info?.reservationId ?? null,
        reservationNumber: info?.reservationNumber ?? null,
        roomNumber: info?.roomNumber ?? null,
        arrivalDate: info?.arrivalDate ?? null,
        departureDate: info?.departureDate ?? null,
        folioStatus: info?.folioStatus ?? "open",
        stayStatus: info?.stayStatus ?? null,
      };
    });
    const page = querySourceFolios(rows, data);
    const owned = rows.reduce((sum, row) => sum + row.accountOwnedRemaining, 0);
    return {
      ...page,
      summary: {
        sourceFolios: rows.length,
        accountOwnedAmount: Math.round((owned + Number.EPSILON) * 100) / 100,
        invoicedGroups: rows.reduce((sum, row) => sum + row.invoicedGroupCount, 0),
        uninvoicedGroups: rows.reduce((sum, row) => sum + row.uninvoicedGroupCount, 0),
      },
    };
  });

const chargeQuery = z.object({
  restaurantId: idSchema,
  accountId: idSchema,
  search: z.string().max(80).optional(),
  source: z.enum(["all", "transferred", "direct"]).optional(),
  coverage: z.enum(["all", "uninvoiced", "invoiced", "partial"]).optional(),
  sourceFolioId: idSchema.nullable().optional(),
  from: z.string().max(10).nullable().optional(),
  to: z.string().max(10).nullable().optional(),
  sort: z.enum(["newest", "oldest", "amount", "remaining"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).optional(),
});

export const listFinancialAccountChargeGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => chargeQuery.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const accountResult = await supabaseAdmin
      .from("financial_accounts")
      .select("id, status, currency")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (accountResult.error) throw cashierError(accountResult.error.message);
    if (!accountResult.data) return null;
    const account = accountResult.data as {
      id: string;
      status: "open" | "closed";
      currency: string;
    };
    const groups = await loadAccountChargeGroups(supabaseAdmin, data.restaurantId, data.accountId);
    if (!groups) return null;
    const visible = visibleChargeGroups(groups, "current");
    const folioIds = [
      ...new Set(
        visible.map((group) => group.sourceFolioId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const contexts = await folioContext(supabaseAdmin, data.restaurantId, folioIds);
    const actors = await actorNames(supabaseAdmin, data.restaurantId, [
      ...new Set(
        visible.map((group) => group.actorMembershipId).filter((id): id is string => Boolean(id)),
      ),
    ]);
    const listed: ChargeListRow[] = visible.map((group) => {
      const info = group.sourceFolioId ? contexts.get(group.sourceFolioId) : undefined;
      return {
        ...group,
        guestName: info?.guestName ?? null,
        folioNumber: info?.folioNumber ?? null,
        actorName: group.actorMembershipId ? (actors.get(group.actorMembershipId) ?? null) : null,
        capabilities: chargeCapabilities({
          role: me.role,
          accountStatus: account.status,
          group,
        }),
      } as ChargeListRow & { capabilities: ReturnType<typeof chargeCapabilities> };
    });
    const page = queryChargeGroups(listed, data);
    return {
      ...page,
      currency: account.currency,
      accountStatus: account.status,
      summary: ownershipSummary(groups),
      rows: page.rows.map((row) => ({
        ...row,
        capabilities: chargeCapabilities({
          role: me.role,
          accountStatus: account.status,
          group: row,
        }),
      })),
    };
  });

export { currentSourceFolioIds };
