import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cashierError, requireCashieringAccess } from "./cashiering.server";
import {
  accountWorkspaceCapabilities,
  countIssuedInvoices,
  recentAccountActivity,
  recentAccountDocuments,
  workspaceCreditSummary,
  type AccountDocumentRow,
  type AccountWorkspaceCapabilities,
  type AccountWorkspaceKind,
  type ActivityLine,
  type CompanyCreditSummary,
} from "./cashiering-account-workspace";
import { currentSourceFolioIds } from "./cashiering-account-ownership";
import { loadAccountChargeGroups } from "./cashiering-account-ownership.functions";

const idSchema = z.string().min(1);

export type FinancialAccountWorkspace = {
  account: {
    id: string;
    accountNumber: string;
    accountKind: AccountWorkspaceKind;
    currency: string;
    status: "open" | "closed";
    openedAt: string;
    closedAt: string | null;
    balance: number;
  };
  master: {
    id: string;
    name: string;
    code: string | null;
    accountType: string;
    accountStatus: string | null;
    taxId: string | null;
    phone: string | null;
    email: string | null;
    primaryContactName: string | null;
    paymentTerms: string | null;
    creditDays: number | null;
    creditLimitAmount: number | null;
  };
  credit: CompanyCreditSummary | null;
  issuedInvoiceCount: number;
  sourceFolioCount: number;
  recentActivity: ActivityLine[];
  recentDocuments: AccountDocumentRow[];
  capabilities: AccountWorkspaceCapabilities;
};

export const getFinancialAccountWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FinancialAccountWorkspace | null> => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const accountResult = await supabaseAdmin
      .from("financial_accounts")
      .select("id, master_id, account_kind, account_number, currency, status, opened_at, closed_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (accountResult.error) throw cashierError(accountResult.error.message);
    if (!accountResult.data) return null;
    const account = accountResult.data as {
      id: string;
      master_id: string;
      account_kind: AccountWorkspaceKind;
      account_number: string;
      currency: string;
      status: "open" | "closed";
      opened_at: string;
      closed_at: string | null;
    };

    const masterResult = account.master_id
      ? await supabaseAdmin
          .from("guest_account_masters")
          .select(
            "id, name, code, account_type, account_status, tax_id, phone, email, primary_contact_name, payment_terms, credit_days, credit_limit_amount",
          )
          .eq("restaurant_id", data.restaurantId)
          .eq("id", account.master_id)
          .maybeSingle()
      : { data: null, error: null };
    const master = (masterResult.data ?? null) as {
      id: string;
      name: string;
      code: string | null;
      account_type: string;
      account_status: string | null;
      tax_id: string | null;
      phone: string | null;
      email: string | null;
      primaryContactName?: string | null;
      primary_contact_name: string | null;
      payment_terms: string | null;
      credit_days: number | null;
      credit_limit_amount: number | string | null;
    } | null;

    let balance = 0;
    try {
      const balanceResult = await supabaseAdmin.rpc("financial_account_balance", {
        _restaurant_id: data.restaurantId,
        _account_id: account.id,
      });
      balance = Number(balanceResult.data ?? 0);
    } catch {
      balance = 0;
    }

    const txnResult = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, transaction_type, category, description, amount, posted_at, posted_by_membership_id, transfer_id, original_transaction_id, reference_type, financial_account_id, folio_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", account.id)
      .order("posted_at", { ascending: false })
      .limit(40);
    if (txnResult.error) throw cashierError(txnResult.error.message);
    const txns = (txnResult.data ?? []) as Array<{
      id: string;
      transaction_type: string;
      category: string;
      description: string;
      amount: number | string;
      posted_at: string;
      posted_by_membership_id: string | null;
      transfer_id: string | null;
      original_transaction_id: string | null;
      reference_type: string | null;
      financial_account_id: string | null;
      folio_id: string | null;
    }>;

    const ownershipGroups = await loadAccountChargeGroups(
      supabaseAdmin,
      data.restaurantId,
      account.id,
    ).catch(() => []);
    const sourceIds = currentSourceFolioIds(ownershipGroups ?? []);

    const transferIds = [
      ...new Set(txns.map((row) => row.transfer_id).filter((id): id is string => Boolean(id))),
    ];
    const counterparts: Array<{
      transfer_id: string;
      folio_id: string | null;
      financial_account_id: string | null;
    }> = [];
    const folioNumbers = new Map<string, string>();
    if (transferIds.length > 0) {
      const pairResult = await supabaseAdmin
        .from("folio_transactions")
        .select("transfer_id, folio_id, financial_account_id")
        .eq("restaurant_id", data.restaurantId)
        .in("transfer_id", transferIds);
      if (pairResult.error) throw cashierError(pairResult.error.message);
      counterparts.push(
        ...((pairResult.data ?? []) as Array<{
          transfer_id: string;
          folio_id: string | null;
          financial_account_id: string | null;
        }>),
      );
      const folioIds = [
        ...new Set(
          counterparts.map((row) => row.folio_id).filter((id): id is string => Boolean(id)),
        ),
      ];
      if (folioIds.length > 0) {
        const folioResult = await supabaseAdmin
          .from("guest_folios")
          .select("id, folio_number")
          .eq("restaurant_id", data.restaurantId)
          .in("id", folioIds);
        if (folioResult.error) throw cashierError(folioResult.error.message);
        for (const folio of (folioResult.data ?? []) as Array<{
          id: string;
          folio_number: string;
        }>) {
          folioNumbers.set(folio.id, folio.folio_number);
        }
      }
    }

    const actorIds = [
      ...new Set(
        txns.map((row) => row.posted_by_membership_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const members = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", actorIds);
      const userIds = [
        ...new Set(
          ((members.data ?? []) as Array<{ id: string; user_id: string }>).map(
            (row) => row.user_id,
          ),
        ),
      ];
      const profiles = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", userIds)
        : { data: [] };
      const names = new Map<string, string>();
      for (const profile of (profiles.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>) {
        const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        if (name) names.set(profile.id, name);
      }
      for (const member of (members.data ?? []) as Array<{ id: string; user_id: string }>) {
        const name = names.get(member.user_id);
        if (name) actorNames.set(member.id, name);
      }
    }

    const folioByTransfer = new Map<string, string>();
    for (const pair of counterparts) {
      if (pair.folio_id) folioByTransfer.set(pair.transfer_id, pair.folio_id);
    }

    const activity = recentAccountActivity(
      txns.map((row) => {
        const folioId = row.transfer_id ? (folioByTransfer.get(row.transfer_id) ?? null) : null;
        return {
          id: row.id,
          postedAt: row.posted_at,
          type: row.transaction_type,
          category: row.category,
          description: row.description,
          amount: Number(row.amount),
          actorName: row.posted_by_membership_id
            ? (actorNames.get(row.posted_by_membership_id) ?? null)
            : null,
          transferId: row.transfer_id,
          originalTransactionId: row.original_transaction_id,
          referenceType: row.reference_type,
          sourceFolioId: folioId,
          sourceFolioNumber: folioId ? (folioNumbers.get(folioId) ?? null) : null,
        };
      }),
    );

    const invoiceResult = await supabaseAdmin
      .from("financial_account_invoices")
      .select("id, issued_number, issued_at, snapshot")
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", account.id)
      .not("issued_number", "is", null);
    if (invoiceResult.error) throw cashierError(invoiceResult.error.message);
    const invoices = (invoiceResult.data ?? []) as Array<{
      id: string;
      issued_number: string;
      issued_at: string;
      snapshot: { totals?: { invoiceTotal?: number; balance?: number } } | null;
    }>;

    const noteResult = await supabaseAdmin
      .from("invoice_credit_notes")
      .select("id, note_number, note_type, issued_at, total_delta")
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", account.id);
    if (noteResult.error && noteResult.error.code !== "42P01") {
      throw cashierError(noteResult.error.message);
    }
    const notes = (noteResult.data ?? []) as Array<{
      id: string;
      note_number: string;
      note_type: string;
      issued_at: string;
      total_delta: number | string;
    }>;

    const documents = recentAccountDocuments([
      ...invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.issued_number,
        documentType: "invoice" as const,
        issuedAt: invoice.issued_at,
        amount: Number(
          invoice.snapshot?.totals?.invoiceTotal ?? invoice.snapshot?.totals?.balance ?? 0,
        ),
      })),
      ...notes.map((note) => ({
        id: note.id,
        number: note.note_number,
        documentType:
          note.note_type === "debit" ? ("debit_note" as const) : ("credit_note" as const),
        issuedAt: note.issued_at,
        amount: Number(note.total_delta),
      })),
    ]);

    const limit = master?.credit_limit_amount == null ? null : Number(master.credit_limit_amount);
    const kind = account.account_kind;

    return {
      account: {
        id: account.id,
        accountNumber: account.account_number,
        accountKind: kind,
        currency: account.currency,
        status: account.status,
        openedAt: account.opened_at,
        closedAt: account.closed_at,
        balance,
      },
      master: {
        id: master?.id ?? account.master_id,
        name: master?.name ?? "Account",
        code: master?.code ?? null,
        accountType: master?.account_type ?? kind,
        accountStatus: master?.account_status ?? null,
        taxId: master?.tax_id ?? null,
        phone: master?.phone ?? null,
        email: master?.email ?? null,
        primaryContactName: master?.primary_contact_name ?? null,
        paymentTerms: master?.payment_terms ?? null,
        creditDays: master?.credit_days ?? null,
        creditLimitAmount: limit,
      },
      credit: workspaceCreditSummary(kind, limit, balance),
      issuedInvoiceCount: countIssuedInvoices(
        invoices.map((invoice) => ({ issuedNumber: invoice.issued_number })),
      ),
      sourceFolioCount: sourceIds.length,
      recentActivity: activity,
      recentDocuments: documents,
      capabilities: accountWorkspaceCapabilities({
        role: me.role,
        status: account.status,
        balance,
        accountKind: kind,
      }),
    };
  });
