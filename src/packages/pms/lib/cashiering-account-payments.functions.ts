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
import { allocationCapabilities } from "./cashiering-account-allocation";
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
    const allocatedByPayment = await loadAllocationNets(
      supabaseAdmin,
      data.restaurantId,
      data.accountId,
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
      allocatedByPayment,
    });
    const property = await supabaseAdmin
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (property.error) throw cashierError(property.error.message);
    const timezone = (property.data as { timezone?: string | null } | null)?.timezone || "UTC";
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
      timezone,
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
      capabilities: {
        ...capabilities,
        ...allocationCapabilities({ role: me.role, status: account.status }),
      },
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
    const allocatedByPayment = await loadAllocationNets(
      supabaseAdmin,
      data.restaurantId,
      data.accountId,
    );
    const capabilities = accountPaymentCapabilities({
      role: me.role,
      status: account.status,
      balance,
      accountKind: account.accountKind,
    });
    const allocationRights = allocationCapabilities({ role: me.role, status: account.status });
    const built = buildAccountPayments({
      rows: ledger,
      actorNames: Object.fromEntries(names),
      canRefund: capabilities.canRefund,
      allocatedByPayment,
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
      canAllocate:
        allocationRights.canAllocate &&
        found.payment.transactionType === "payment" &&
        found.payment.remainingRefundable > 0.01,
      canReverse: allocationRights.canReverse && found.payment.transactionType === "payment",
      allocations: await loadPaymentAllocationLines(
        supabaseAdmin,
        data.restaurantId,
        found.payment.id,
      ),
    };
  });

async function loadAllocationNets(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  accountId: string,
): Promise<Record<string, number>> {
  const result = await supabaseAdmin
    .from("financial_account_payment_allocations")
    .select("payment_transaction_id, amount")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", accountId);
  if (result.error && result.error.code !== "42P01") throw cashierError(result.error.message);
  const nets: Record<string, number> = {};
  for (const row of (result.data ?? []) as Array<{
    payment_transaction_id: string;
    amount: number | string;
  }>) {
    const id = row.payment_transaction_id;
    nets[id] = Math.round(((nets[id] ?? 0) + Number(row.amount)) * 100) / 100;
  }
  return nets;
}

async function loadPaymentAllocationLines(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  paymentId: string,
) {
  const result = await supabaseAdmin
    .from("financial_account_payment_allocations")
    .select(
      "id, invoice_id, amount, created_at, created_by_membership_id, reverses_allocation_id, reason",
    )
    .eq("restaurant_id", restaurantId)
    .eq("payment_transaction_id", paymentId);
  if (result.error && result.error.code !== "42P01") throw cashierError(result.error.message);
  const rows = (result.data ?? []) as Array<{
    id: string;
    invoice_id: string;
    amount: number | string;
    created_at: string;
    created_by_membership_id: string | null;
    reverses_allocation_id: string | null;
    reason: string | null;
  }>;
  const names = await actorNames(
    supabaseAdmin,
    restaurantId,
    rows.map((row) => row.created_by_membership_id),
  );
  const invoiceIds = [...new Set(rows.map((row) => row.invoice_id))];
  const numbers = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const invoices = await supabaseAdmin
      .from("financial_account_invoices")
      .select("id, issued_number")
      .eq("restaurant_id", restaurantId)
      .in("id", invoiceIds);
    if (invoices.error) throw cashierError(invoices.error.message);
    for (const invoice of (invoices.data ?? []) as Array<{ id: string; issued_number: string }>) {
      numbers.set(invoice.id, invoice.issued_number);
    }
  }
  return rows
    .map((row) => {
      const reversals = rows
        .filter((other) => other.reverses_allocation_id === row.id)
        .reduce((sum, other) => sum + Number(other.amount), 0);
      const activeAmount =
        Number(row.amount) > 0 ? Math.round((Number(row.amount) + reversals) * 100) / 100 : 0;
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceNumber: numbers.get(row.invoice_id) ?? "Invoice",
        amount: Number(row.amount),
        activeAmount,
        createdAt: row.created_at,
        actorName: row.created_by_membership_id
          ? (names.get(row.created_by_membership_id) ?? "Staff member")
          : "System",
        reversesAllocationId: row.reverses_allocation_id,
        reason: row.reason,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

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
