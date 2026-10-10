import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CreditNoteSection } from "@/packages/pms/components/cashiering/credit-note-panel";
import { DebitNoteSection } from "@/packages/pms/components/cashiering/debit-note-panel";
import {
  accountInvoiceIssuerLabel,
  type AccountInvoiceGroup,
  type IssuedAccountInvoice,
} from "@/packages/pms/lib/cashiering-account-invoices";
import {
  createFinancialAccountInvoiceDraft,
  deleteFinancialAccountInvoiceDraft,
  getFinancialAccountInvoiceBoard,
  issueFinancialAccountInvoiceDraft,
  listFinancialAccountInvoices,
  previewFinancialAccountInvoiceSelection,
  reprintFinancialAccountInvoice,
  updateFinancialAccountInvoiceDraft,
} from "@/packages/pms/lib/cashiering-account-invoices.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";
const HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const WARNING_TEXT: Record<string, string> = {
  ACCOUNT_CHARGE_ALREADY_INVOICED: "That charge is already on an issued invoice.",
  ACCOUNT_CHARGE_NOT_INVOICEABLE: "That line cannot be added to this invoice.",
  ACCOUNT_CHARGE_NO_LONGER_OWNED: "That charge is no longer owned by this account.",
  ACCOUNT_KIND_NOT_INVOICEABLE: "Only company and group accounts can be invoiced.",
};

function sourceLabel(group: AccountInvoiceGroup): string {
  if (group.origin === "direct") return "—";
  const guest = group.sourceGuest ?? "Guest";
  const folio = group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : "";
  const room = group.sourceRoomNumber ? ` · Room ${group.sourceRoomNumber}` : "";
  return `${guest}${folio}${room}`;
}

export function AccountInvoiceWorkspace({
  restaurantId,
  accountId,
  money,
  dateTime,
}: {
  restaurantId: string;
  accountId: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  const fetchBoard = useServerFn(getFinancialAccountInvoiceBoard);
  const fetchInvoices = useServerFn(listFinancialAccountInvoices);
  const previewSelection = useServerFn(previewFinancialAccountInvoiceSelection);
  const createDraft = useServerFn(createFinancialAccountInvoiceDraft);
  const updateDraft = useServerFn(updateFinancialAccountInvoiceDraft);
  const removeDraft = useServerFn(deleteFinancialAccountInvoiceDraft);
  const issueDraft = useServerFn(issueFinancialAccountInvoiceDraft);
  const reprintInvoice = useServerFn(reprintFinancialAccountInvoice);

  const boardQuery = useQuery({
    queryKey: ["account-invoice-board", restaurantId, accountId],
    queryFn: () => fetchBoard({ data: { restaurantId, accountId } }),
  });
  const invoicesQuery = useQuery({
    queryKey: ["account-invoices", restaurantId, accountId],
    queryFn: () => fetchInvoices({ data: { restaurantId, accountId } }),
  });
  const board = boardQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [stateFilter, setStateFilter] = useState("uninvoiced");
  const [printInvoice, setPrintInvoice] = useState<IssuedAccountInvoice | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!board?.draft || !editing) return;
    setSelectedIds(board.draft.selectedIds);
    setNotes(board.draft.notes ?? "");
  }, [board?.draft, editing]);

  const previewQuery = useQuery({
    queryKey: ["account-invoice-preview", restaurantId, accountId, selectedIds],
    enabled: editing,
    queryFn: () =>
      previewSelection({
        data: { restaurantId, accountId, sourceIds: selectedIds },
      }),
  });
  const preview = previewQuery.data;
  const draftTotal = useMemo(() => {
    if (!board?.draft) return 0;
    const selected = new Set(board.draft.selectedIds);
    return board.groups
      .filter((group) => selected.has(group.sourceGroupId))
      .reduce((sum, group) => sum + group.grossTotal, 0);
  }, [board]);
  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const group of board?.groups ?? []) {
      if (group.departmentName) names.add(group.departmentName);
    }
    return [...names].sort();
  }, [board?.groups]);
  const visible = (board?.groups ?? []).filter((group) => {
    if (department !== "all" && group.departmentName !== department) return false;
    if (origin !== "all" && group.origin !== origin) return false;
    if (stateFilter === "uninvoiced" && group.invoiceState === "invoiced") return false;
    if (stateFilter === "invoiced" && group.invoiceState !== "invoiced") return false;
    const haystack =
      `${group.description} ${group.sourceGuest ?? ""} ${group.sourceFolioNumber ?? ""} ${group.sourceConfirmation ?? ""} ${group.departmentName ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const canManage = Boolean(board?.canManage);
  const hasGroups = (board?.groups.length ?? 0) > 0;

  function refresh() {
    void boardQuery.refetch();
    void invoicesQuery.refetch();
  }

  const createMut = useMutation({
    mutationFn: () => createDraft({ data: { restaurantId, accountId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setEditing(true);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMut = useMutation({
    mutationFn: () => {
      if (!board?.draft) throw new Error("Save the draft after it has been created.");
      return updateDraft({
        data: { restaurantId, draftId: board.draft.id, notes, sourceIds: selectedIds },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "The draft could not be saved.");
        return;
      }
      toast.success("Draft saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => {
      if (!board?.draft) throw new Error("There is no draft to delete.");
      return removeDraft({ data: { restaurantId, draftId: board.draft.id } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "The draft could not be deleted.");
        return;
      }
      setEditing(false);
      setSelectedIds([]);
      setNotes("");
      toast.success("Draft deleted.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const issueMut = useMutation({
    mutationFn: async () => {
      if (!board?.draft) throw new Error("Create a draft before issuing.");
      const saved = await updateDraft({
        data: { restaurantId, draftId: board.draft.id, notes, sourceIds: selectedIds },
      });
      if (!saved.ok)
        return { ok: false as const, message: saved.message ?? "The draft could not be saved." };
      return issueDraft({
        data: {
          restaurantId,
          draftId: board.draft.id,
          idempotencyKey: `acctdraft:${board.draft.id}`,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Invoice ${result.invoice.issuedNumber} issued.`);
      setEditing(false);
      setSelectedIds([]);
      setNotes("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reprintMut = useMutation({
    mutationFn: (invoiceId: string) => reprintInvoice({ data: { restaurantId, invoiceId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPrintInvoice(result.invoice);
      refresh();
      window.setTimeout(() => window.print(), 50);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const kindLabel = board?.account.accountKind === "group" ? "Group" : "Company";
  const viewedInvoice = invoices.find((invoice) => invoice.id === viewInvoiceId) ?? null;

  return (
    <section className="space-y-4" data-testid="account-invoices">
      <div className={cn(CARD, "flex flex-wrap items-start justify-between gap-4 px-4 py-3")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Invoiceable amount
            </p>
            <p className="font-display text-2xl tabular-nums">
              {money(board?.invoiceableAmount ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Uninvoiced charges owned by this account.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Current balance
            </p>
            <p className="font-display text-2xl tabular-nums">
              {money(board?.account.balance ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">{board?.account.currency}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Issued invoices
            </p>
            <p className="font-display text-2xl tabular-nums">{invoices.length}</p>
            {board?.account.accountKind === "company" && board.account.creditLimitAmount != null ? (
              <p className="text-xs text-muted-foreground">
                Credit limit {money(board.account.creditLimitAmount)}
              </p>
            ) : null}
          </div>
        </div>
        {canManage && board?.account.status === "open" ? (
          <div className="flex flex-wrap gap-2">
            {board.draft && !editing ? (
              <>
                <Button
                  size="sm"
                  className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                  onClick={() => setEditing(true)}
                >
                  Continue draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate()}
                >
                  <Trash2 className="size-4" /> Delete draft
                </Button>
              </>
            ) : null}
            {!board.draft && !editing ? (
              <Button
                size="sm"
                className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                disabled={createMut.isPending || !hasGroups || !board.invoiceSettingsAvailable}
                onClick={() => createMut.mutate()}
                data-testid="create-account-invoice"
              >
                <FileText className="size-4" /> Create invoice
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {boardQuery.isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Invoice charges could not be loaded. {boardQuery.error.message}
        </p>
      ) : null}

      {!hasGroups && !boardQuery.isLoading ? (
        <p className="rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] px-4 py-3 text-sm">
          No invoiceable charges are on this account. Payments, deposits, and refunds stay off the
          invoice.
        </p>
      ) : null}

      {board?.draft && !editing ? (
        <div className={cn(CARD, "px-4 py-3 text-sm")}>
          <p className="font-medium">Draft invoice</p>
          <p className="text-muted-foreground">
            {board.draft.selectedIds.length} selected · Draft total {money(draftTotal)} · Updated{" "}
            {dateTime(board.draft.updatedAt)}
          </p>
        </div>
      ) : null}

      {editing && board?.draft ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-[#E8E1D7] px-4 py-3">
              <h3 className="font-display text-lg">Create invoice</h3>
              <p className="text-sm">
                {board.billTo.name} · {kindLabel} · {board.account.accountNumber}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Invoice number assigned on issue · {board.account.currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-[#E8E1D7] px-4 py-2">
              <input
                className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                placeholder="Search charge, guest, folio"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="all">All departments</option>
                {departments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
              >
                <option value="all">All sources</option>
                <option value="transferred">Transferred</option>
                <option value="direct">Direct account charge</option>
              </select>
              <select
                className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <option value="uninvoiced">Uninvoiced</option>
                <option value="invoiced">Invoiced</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className={HEAD}>
                  <tr>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Charge</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right">Service</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((group) => {
                    const invoiced = group.invoiceState === "invoiced";
                    const checked = selectedIds.includes(group.sourceGroupId);
                    return (
                      <tr key={group.sourceGroupId} className="border-b border-[#E8E1D7]">
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={checked}
                            disabled={invoiced || !canManage}
                            onCheckedChange={(value) =>
                              setSelectedIds((current) =>
                                value
                                  ? [...current, group.sourceGroupId]
                                  : current.filter((id) => id !== group.sourceGroupId),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {dateTime(group.postedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{group.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {group.origin === "direct" ? "Direct" : "Transferred"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">{sourceLabel(group)}</td>
                        <td className="px-3 py-2 text-xs">{group.departmentName ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">
                          {group.quantity == null
                            ? "—"
                            : `${group.quantity} × ${group.unitAmount == null ? "—" : money(group.unitAmount)}`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(group.subtotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(group.taxTotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(group.serviceChargeTotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(group.grossTotal)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {invoiced
                            ? group.coveredInvoiceNumber?.startsWith("DN-")
                              ? `Invoiced via ${group.coveredInvoiceNumber}`
                              : `Invoiced · ${group.coveredInvoiceNumber ?? ""}`
                            : group.invoiceState === "in_draft"
                              ? "In draft"
                              : "Available"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(preview?.warnings ?? []).map((warning) => (
              <p key={warning.sourceGroupId} className="px-4 py-2 text-xs text-amber-800">
                {WARNING_TEXT[warning.code] ?? warning.code}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.filter((id) => id !== warning.sourceGroupId),
                    )
                  }
                >
                  Remove
                </button>
              </p>
            ))}
            <div className="space-y-3 border-t border-[#E8E1D7] p-4">
              <label className="block text-xs text-muted-foreground">
                Invoice notes
                <textarea
                  className="mt-1 w-full rounded-md border border-[#E8E1D7] px-2 py-1 text-sm text-foreground"
                  rows={3}
                  maxLength={500}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  Save draft
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                  disabled={issueMut.isPending || selectedIds.length === 0}
                  onClick={() => issueMut.mutate()}
                  data-testid="issue-account-invoice"
                >
                  Issue invoice
                </Button>
              </div>
            </div>
          </div>
          <aside className={cn(CARD, "space-y-3 p-4 text-sm")}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bill to</p>
            <p className="font-medium">{board.billTo.name}</p>
            <p>Account {board.account.accountNumber}</p>
            {board.billTo.taxId ? <p>TIN {board.billTo.taxId}</p> : null}
            {board.billTo.address ? <p>{board.billTo.address}</p> : null}
            {board.billTo.paymentTerms ? <p>Payment terms {board.billTo.paymentTerms}</p> : null}
            {board.billTo.creditDays != null ? <p>{board.billTo.creditDays} credit days</p> : null}
            <p className="text-xs text-muted-foreground">Invoice no. Assigned on issue</p>
            <div className="space-y-1 border-t border-[#E8E1D7] pt-3">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(preview?.subtotal ?? 0)}</span>
              </p>
              <p className="flex justify-between">
                <span>Tax</span>
                <span className="tabular-nums">{money(preview?.tax ?? 0)}</span>
              </p>
              <p className="flex justify-between">
                <span>Service</span>
                <span className="tabular-nums">{money(preview?.serviceCharge ?? 0)}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>Total</span>
                <span className="tabular-nums">{money(preview?.total ?? 0)}</span>
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="font-medium">Issued invoices</h3>
        </div>
        {invoices.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No invoice has been issued for this account.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className={HEAD}>
                <tr>
                  <th className="px-3 py-2">Invoice no.</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Service</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Issued by</th>
                  <th className="px-3 py-2">Reprints</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[#E8E1D7]">
                    <td className="px-3 py-2 font-medium">{invoice.issuedNumber}</td>
                    <td className="px-3 py-2">{dateTime(invoice.issuedAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(invoice.snapshot.totals.subtotal)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(invoice.snapshot.totals.tax)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(invoice.snapshot.totals.serviceCharge)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(invoice.snapshot.totals.invoiceTotal)}
                    </td>
                    <td className="px-3 py-2">{invoice.snapshot.document.issuedByName ?? "—"}</td>
                    <td className="px-3 py-2">{invoice.reprintCount}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2 h-8"
                        onClick={() => setViewInvoiceId(invoice.id)}
                      >
                        View
                      </Button>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={reprintMut.isPending}
                          onClick={() => reprintMut.mutate(invoice.id)}
                        >
                          <Printer className="size-4" /> Reprint
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {viewedInvoice ? (
          <div className="border-t border-[#E8E1D7] p-4">
            <AccountInvoicePrint invoice={viewedInvoice} money={money} dateTime={dateTime} screen />
            <CreditNoteSection
              restaurantId={restaurantId}
              accountInvoiceId={viewedInvoice.id}
              canManage={canManage}
              money={money}
              dateTime={dateTime}
              onIssued={refresh}
            />
            <DebitNoteSection
              restaurantId={restaurantId}
              accountInvoiceId={viewedInvoice.id}
              canManage={canManage}
              money={money}
              dateTime={dateTime}
              onIssued={refresh}
            />
          </div>
        ) : null}
      </div>

      {printInvoice ? (
        <AccountInvoicePrint invoice={printInvoice} money={money} dateTime={dateTime} />
      ) : null}
    </section>
  );
}

export function AccountInvoicePrint({
  invoice,
  money,
  dateTime,
  screen = false,
}: {
  invoice: IssuedAccountInvoice;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  screen?: boolean;
}) {
  const snap = invoice.snapshot;
  const issuer = accountInvoiceIssuerLabel(snap.property);
  return (
    <section
      className={
        screen
          ? "space-y-4 text-foreground"
          : "hidden space-y-4 rounded-xl border border-border bg-white p-6 text-foreground print:block"
      }
      data-testid={screen ? "account-invoice-view" : "account-invoice-print"}
    >
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{issuer}</p>
        {snap.property.tinNumber ? <p className="text-xs">TIN {snap.property.tinNumber}</p> : null}
        {snap.property.fullAddress ? <p className="text-xs">{snap.property.fullAddress}</p> : null}
        <h2 className="mt-2 font-display text-xl">Invoice {snap.document.issuedNumber}</h2>
        <p className="text-xs">
          {dateTime(snap.issuedAt)} · {snap.account.currency}
        </p>
      </header>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bill to</p>
        <p className="font-medium">{snap.billTo.name}</p>
        <p>Account {snap.account.accountNumber}</p>
        {snap.billTo.taxId ? <p>TIN {snap.billTo.taxId}</p> : null}
        {snap.billTo.address ? <p>{snap.billTo.address}</p> : null}
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Description</th>
            <th>Source</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {snap.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.description}</td>
              <td>
                {line.sourceGuest
                  ? `${line.sourceGuest}${line.sourceFolioNumber ? ` · ${line.sourceFolioNumber}` : ""}`
                  : "—"}
              </td>
              <td className="text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-56 space-y-1 text-sm">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(snap.totals.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Tax</span>
          <span>{money(snap.totals.tax)}</span>
        </p>
        <p className="flex justify-between">
          <span>Service</span>
          <span>{money(snap.totals.serviceCharge)}</span>
        </p>
        <p className="flex justify-between font-medium">
          <span>Total</span>
          <span>{money(snap.totals.invoiceTotal)}</span>
        </p>
      </div>
      {snap.document.notes ? <p className="text-sm">Notes: {snap.document.notes}</p> : null}
      <p className="text-xs text-muted-foreground">
        Immutable snapshot{snap.document.issuedByName ? ` · ${snap.document.issuedByName}` : ""}
      </p>
    </section>
  );
}
