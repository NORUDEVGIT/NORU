import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  accountPaymentActors,
  accountPaymentCapabilities,
  accountTenderScopeLabel,
  buildAccountPayments,
  findAccountPayment,
  queryAccountPayments,
  type AccountLedgerTender,
  type AccountPaymentRow,
  type AccountTenderMethod,
} from "./cashiering-account-payments";
import type { AccountWorkspaceKind } from "./cashiering-account-workspace";
import { cashierError, requireCashieringAccess } from "./cashiering.server";

const idSchema = z.string().uuid();
const METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;

type ServiceClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

const paymentQuery = z.object({
  restaurantId: idSchema,
  accountId: idSchema,
  search: z.string().max(80).optional(),
  type: z.enum(["all", "payment", "refund", "write_off"]).optional(),
  method: z.enum(["all", ...METHODS]).optional(),
  postedBy: idSchema.nullable().optional(),
  from: z.string().max(10).nullable().optional(),
  to: z.string().max(10).nullable().optional(),
  sort: z.enum(["newest", "oldest", "amount"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).optional(),
});

export const listFinancialAccountPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentQuery.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    const ledger = await loadTenders(supabaseAdmin, data.restaurantId, data.accountId);
    const balance = await accountBalance(supabaseAdmin, data.restaurantId, data.accountId);
    const names = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      ledger.map((row) => row.postedByMembershipId),
    );
    const capabilities = accountPaymentCapabilities({
      role: me.role,
      status: account.status,
      balance,
      accountKind: account.accountKind,
    });
    const built = buildAccountPayments({
      rows: ledger,
      actorNames: Object.fromEntries(names),
      canRefund: capabilities.canRefund,
    });
    const page = queryAccountPayments(built, {
      search: data.search,
      type: data.type,
      method: data.method as AccountTenderMethod | "all" | undefined,
      postedBy: data.postedBy,
      from: data.from,
      to: data.to,
      sort: data.sort,
      page: data.page,
      pageSize: data.pageSize,
    });
    const { data: shift } = await supabaseAdmin
      .from("hotel_cashier_shifts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("membership_id", me.id)
      .eq("status", "open")
      .limit(1);
    return {
      ...page,
      scopeLabel: accountTenderScopeLabel(page.scope),
      accountTotal: built.length,
      balance,
      currency: account.currency,
      status: account.status,
      actors: accountPaymentActors(built),
      actorOpenCashShift: ((shift ?? []) as Array<{ id: string }>).length > 0,
      capabilities,
    };
  });

export const getFinancialAccountPaymentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema, transactionId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    const ledger = await loadTenders(supabaseAdmin, data.restaurantId, data.accountId);
    const balance = await accountBalance(supabaseAdmin, data.restaurantId, data.accountId);
    const names = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      ledger.map((row) => row.postedByMembershipId),
    );
    const capabilities = accountPaymentCapabilities({
      role: me.role,
      status: account.status,
      balance,
      accountKind: account.accountKind,
    });
    const built = buildAccountPayments({
      rows: ledger,
      actorNames: Object.fromEntries(names),
      canRefund: capabilities.canRefund,
    });
    const found = findAccountPayment(built, data.transactionId);
    if (!found) return null;
    const shift = await shiftContext(
      supabaseAdmin,
      data.restaurantId,
      found.payment.hotelCashierShiftId,
    );
    return {
      accountName: account.masterName,
      accountNumber: account.accountNumber,
      accountKind: account.accountKind,
      currency: account.currency,
      balance,
      payment: found.payment,
      linkedRefunds: found.linkedRefunds,
      source: found.source,
      shift,
    };
  });

async function loadAccount(supabaseAdmin: ServiceClient, restaurantId: string, accountId: string) {
  const result = await supabaseAdmin
    .from("financial_accounts")
    .select("id, master_id, account_kind, account_number, currency, status")
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .maybeSingle();
  if (result.error) throw cashierError(result.error.message);
  const account = result.data as {
    id: string;
    master_id: string;
    account_kind: AccountWorkspaceKind;
    account_number: string;
    currency: string;
    status: "open" | "closed";
  } | null;
  if (!account) return null;
  const master = await supabaseAdmin
    .from("guest_account_masters")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", account.master_id)
    .maybeSingle();
  if (master.error) throw cashierError(master.error.message);
  return {
    id: account.id,
    accountKind: account.account_kind,
    accountNumber: account.account_number,
    currency: account.currency,
    status: account.status,
    masterName: ((master.data as { name?: string | null } | null)?.name ?? "").trim() || "Account",
  };
}

async function loadTenders(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<AccountLedgerTender[]> {
  const result = await supabaseAdmin
    .from("folio_transactions")
    .select(
      "id, transaction_type, category, description, amount, posted_at, payment_method, posted_by_membership_id, hotel_cashier_shift_id, original_transaction_id, reference_type",
    )
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId)
    .in("transaction_type", ["payment", "deposit", "refund", "adjustment"]);
  if (result.error) throw cashierError(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    type: String(row.transaction_type),
    category: String(row.category ?? ""),
    description: String(row.description ?? ""),
    amount: Number(row.amount),
    postedAt: String(row.posted_at),
    paymentMethod: (row.payment_method as string | null) ?? null,
    postedByMembershipId: (row.posted_by_membership_id as string | null) ?? null,
    hotelCashierShiftId: (row.hotel_cashier_shift_id as string | null) ?? null,
    originalTransactionId: (row.original_transaction_id as string | null) ?? null,
    referenceType: (row.reference_type as string | null) ?? null,
  }));
}

async function accountBalance(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<number> {
  const result = await supabaseAdmin.rpc("financial_account_balance", {
    _restaurant_id: restaurantId,
    _account_id: accountId,
  });
  if (result.error) throw cashierError(result.error.message);
  return Number(result.data ?? 0);
}

async function shiftContext(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  shiftId: string | null,
): Promise<{ openedAt: string; cashierName: string } | null> {
  if (!shiftId) return null;
  const result = await supabaseAdmin
    .from("hotel_cashier_shifts")
    .select("id, opened_at, membership_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", shiftId)
    .maybeSingle();
  if (result.error) throw cashierError(result.error.message);
  const shift = result.data as {
    opened_at: string;
    membership_id: string;
  } | null;
  if (!shift) return null;
  const names = await actorNames(supabaseAdmin, restaurantId, [shift.membership_id]);
  return {
    openedAt: shift.opened_at,
    cashierName: names.get(shift.membership_id) ?? "Cashier",
  };
}

async function actorNames(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  membershipIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return names;
  const members = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  const memberRows = (members.data ?? []) as Array<{ id: string; user_id: string }>;
  const userIds = [...new Set(memberRows.map((row) => row.user_id))];
  if (userIds.length === 0) return names;
  const profiles = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);
  for (const profile of (profiles.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    if (name) {
      const member = memberRows.find((row) => row.user_id === profile.id);
      if (member) names.set(member.id, name);
    }
  }
  return names;
}

export type { AccountPaymentRow };
