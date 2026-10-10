import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FolioInvoicePreview } from "@/packages/pms/components/cashiering/folio-invoice-panel";
import { CreditNoteSection } from "@/packages/pms/components/cashiering/credit-note-panel";
import { DebitNoteSection } from "@/packages/pms/components/cashiering/debit-note-panel";
import {
  createGuestFolioInvoiceDraft,
  deleteGuestFolioInvoiceDraft,
  getGuestFolioInvoiceBoard,
  issueGuestFolioInvoiceDraft,
  previewGuestFolioInvoiceSelection,
  updateGuestFolioInvoiceDraft,
} from "@/packages/pms/lib/cashiering-invoices.functions";
import type {
  InvoiceGroupView,
  IssuedFolioInvoiceRow,
} from "@/packages/pms/lib/cashiering-invoices.server";
import type { FolioWorkspace } from "@/packages/pms/lib/cashiering.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";
const HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const WARNING_TEXT: Record<string, string> = {
  CHARGE_ALREADY_INVOICED: "That charge is already on an issued invoice.",
  CHARGE_NOT_INVOICEABLE: "That line cannot be added to a guest invoice.",
  CHARGE_TRANSFERRED: "That charge has moved off this folio. Remove it from the draft.",
  CHARGE_GROUP_INCOMPLETE: "The tax or service lines for that charge are no longer on this folio.",
  LEGACY_FOLIO_ALREADY_INVOICED: "This folio already has a whole-folio invoice.",
};

function chargeKind(group: InvoiceGroupView): "room" | "service" | "manual" | "other" {
  if (group.category === "room" || group.chargeSource === "room") return "room";
  if (group.chargeSource === "service") return "service";
  if (group.category === "manual" || group.chargeSource === "manual") return "manual";
  return "other";
}

export function GuestInvoiceWorkspace({
  restaurantId,
  workspace,
  money,
  dateTime,
  onChanged,
  onPostCharge,
  onReprint,
  reprinting,
}: {
  restaurantId: string;
  workspace: FolioWorkspace;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onChanged: () => void;
  onPostCharge: () => void;
  onReprint: (invoice: IssuedFolioInvoiceRow) => void;
  reprinting: boolean;
}) {
  const folio = workspace.folio;
  const canManage = workspace.canManage && workspace.capabilities.canIssueInvoice;
  const fetchBoard = useServerFn(getGuestFolioInvoiceBoard);
  const previewSelection = useServerFn(previewGuestFolioInvoiceSelection);
  const createDraft = useServerFn(createGuestFolioInvoiceDraft);
  const updateDraft = useServerFn(updateGuestFolioInvoiceDraft);
  const removeDraft = useServerFn(deleteGuestFolioInvoiceDraft);
  const issueDraft = useServerFn(issueGuestFolioInvoiceDraft);

  const boardQuery = useQuery({
    queryKey: ["folio", restaurantId, folio.id, "invoice-board"],
    queryFn: () => fetchBoard({ data: { restaurantId, folioId: folio.id } }),
  });
  const board = boardQuery.data;
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("all");
  const [kind, setKind] = useState("all");
  const [stateFilter, setStateFilter] = useState("uninvoiced");
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState<"items" | "preview" | "tax">("items");
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!board?.draft || !editing) return;
    setSelectedIds(board.draft.selectedIds);
    setNotes(board.draft.notes ?? "");
  }, [board?.draft, editing]);

  const previewQuery = useQuery({
    queryKey: ["folio", restaurantId, folio.id, "invoice-preview", selectedIds],
    enabled: editing,
    queryFn: () =>
      previewSelection({
        data: { restaurantId, folioId: folio.id, sourceIds: selectedIds },
      }),
  });
  const preview = previewQuery.data;

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const group of board?.groups ?? []) {
      if (group.departmentName) names.add(group.departmentName);
    }
    return [...names].sort();
  }, [board?.groups]);

  const visible = (board?.groups ?? []).filter((group) => {
    const day = group.postedAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (department !== "all" && group.departmentName !== department) return false;
    if (kind !== "all" && chargeKind(group) !== kind) return false;
    if (stateFilter === "uninvoiced" && group.invoiceState === "invoiced") return false;
    if (stateFilter === "invoiced" && group.invoiceState !== "invoiced") return false;
    const haystack = `${group.description} ${group.departmentName ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const createMut = useMutation({
    mutationFn: () =>
      createDraft({ data: { restaurantId, folioId: folio.id } }) as Promise<{
        ok: boolean;
        message?: string;
      }>,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "The draft could not be created.");
        return;
      }
      setEditing(true);
      setPane("items");
      void boardQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMut = useMutation({
    mutationFn: () => {
      if (!board?.draft) throw new Error("Save the draft after it has been created.");
      return updateDraft({
        data: { restaurantId, draftId: board.draft.id, notes, sourceIds: selectedIds },
      }) as Promise<{ ok: boolean; message?: string }>;
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "The draft could not be saved.");
        return;
      }
      toast.success("Draft saved.");
      void boardQuery.refetch();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => {
      if (!board?.draft) throw new Error("There is no draft to delete.");
      return removeDraft({ data: { restaurantId, draftId: board.draft.id } }) as Promise<{
        ok: boolean;
        message?: string;
      }>;
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
      void boardQuery.refetch();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const issueMut = useMutation({
    mutationFn: async () => {
      if (!board?.draft) throw new Error("Create a draft before issuing.");
      const saved = (await updateDraft({
        data: { restaurantId, draftId: board.draft.id, notes, sourceIds: selectedIds },
      })) as { ok: boolean; message?: string };
      if (!saved.ok)
        return { ok: false as const, message: saved.message ?? "The draft could not be saved." };
      return issueDraft({
        data: {
          restaurantId,
          draftId: board.draft.id,
          idempotencyKey: `invdraft:${board.draft.id}`,
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
      setOpenInvoiceId(result.invoice.id);
      void boardQuery.refetch();
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  }

  const openInvoice = folio.issuedInvoices.find((invoice) => invoice.id === openInvoiceId) ?? null;

  return (
    <section className="space-y-4" data-testid="folio-invoices">
      <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-3 px-4 py-3")}>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Invoiceable amount
          </p>
          <p className="font-display text-2xl tabular-nums">
            {money(board?.invoiceableAmount ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            Uninvoiced charges on this folio. Payments and deposits stay off the invoice.
          </p>
        </div>
        {canManage && !board?.legacyFolio ? (
          <div className="flex flex-wrap gap-2">
            {board?.draft && !editing ? (
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
            {!board?.draft && !editing ? (
              <Button
                size="sm"
                className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                disabled={createMut.isPending || !workspace.invoiceSettingsAvailable}
                onClick={() => createMut.mutate()}
                data-testid="create-invoice"
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

      {board?.legacyFolio ? (
        <p className="rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] px-4 py-3 text-sm">
          This folio has a whole-folio invoice. Its snapshot stays as issued. A second invoice is
          not available for this folio.
        </p>
      ) : null}

      {editing && board?.draft ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="border-b border-[#E8E1D7] px-4 py-3">
              <h3 className="font-display text-lg">Create invoice</h3>
              <p className="text-xs text-muted-foreground">Select uninvoiced charges to include.</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Folio {folio.folioNumber} · {folio.guestName}
                {folio.roomNumber ? ` · Room ${folio.roomNumber}` : ""} · {folio.currency}
              </p>
            </div>
            <div className="grid gap-3 border-b border-[#E8E1D7] px-4 py-3 sm:grid-cols-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Bill to </span>
                {folio.guestName}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Invoice number </span>Assigned on issue
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Issue date </span>Assigned on issue
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Currency </span>
                {folio.currency}
              </p>
            </div>
            <div className="flex gap-2 border-b border-[#E8E1D7] px-4 py-2 lg:hidden">
              {(["items", "preview", "tax"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    pane === item ? "bg-[#C89933]/15 text-[#8a6a1f]" : "text-muted-foreground",
                  )}
                  onClick={() => setPane(item)}
                >
                  {item === "items"
                    ? "Invoice items"
                    : item === "preview"
                      ? "Preview"
                      : "Tax breakdown"}
                </button>
              ))}
            </div>
            <div className={cn("space-y-3 p-4", pane !== "items" && "hidden lg:block")}>
              <div className="flex flex-wrap gap-2">
                <input
                  className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <input
                  className="h-8 rounded-md border border-[#E8E1D7] px-2 text-xs"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
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
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  <option value="all">All charges</option>
                  <option value="room">Room</option>
                  <option value="service">Service</option>
                  <option value="manual">Manual</option>
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
                <input
                  className="h-8 min-w-[140px] flex-1 rounded-md border border-[#E8E1D7] px-2 text-xs"
                  placeholder="Search charges"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className={HEAD}>
                    <tr>
                      <th className="px-2 py-2" />
                      <th className="px-2 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Charge</th>
                      <th className="px-2 py-2 font-medium">Department</th>
                      <th className="px-2 py-2 text-right font-medium">Qty / Unit</th>
                      <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                      <th className="px-2 py-2 text-right font-medium">Tax</th>
                      <th className="px-2 py-2 text-right font-medium">Service</th>
                      <th className="px-2 py-2 text-right font-medium">Total</th>
                      <th className="px-2 py-2 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((group) => {
                      const invoiced = group.invoiceState === "invoiced";
                      const checked = selectedIds.includes(group.parentTransactionId);
                      return (
                        <tr
                          key={group.parentTransactionId}
                          className="border-t border-[#E8E1D7]/80"
                        >
                          <td className="px-2 py-2">
                            <Checkbox
                              checked={checked}
                              disabled={invoiced}
                              onCheckedChange={(value) =>
                                toggle(group.parentTransactionId, value === true)
                              }
                            />
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">
                            {dateTime(group.postedAt)}
                          </td>
                          <td className="px-2 py-2">{group.description}</td>
                          <td className="px-2 py-2">{group.departmentName ?? "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {group.quantity == null
                              ? "—"
                              : `${group.quantity} × ${group.unitAmount == null ? "—" : money(group.unitAmount)}`}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {money(group.subtotal)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {money(group.taxTotal)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {money(group.serviceChargeTotal)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {money(group.grossTotal)}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {invoiced
                              ? group.coveredInvoiceNumber?.startsWith("DN-")
                                ? `Invoiced via ${group.coveredInvoiceNumber}`
                                : `Invoiced · ${group.coveredInvoiceNumber ?? ""}`
                              : checked
                                ? "In draft"
                                : "Uninvoiced"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-[#8a6a1f]"
                  onClick={onPostCharge}
                >
                  <Plus className="size-3.5" /> Need another charge? Post charge
                </button>
                <div className="space-y-1 text-right">
                  <p>Selected {selectedIds.length} charges</p>
                  <p>Subtotal {money(preview?.subtotal ?? 0)}</p>
                  <p>Tax {money(preview?.tax ?? 0)}</p>
                  <p>Service charge {money(preview?.serviceCharge ?? 0)}</p>
                  <p className="font-semibold">Total {money(preview?.total ?? 0)}</p>
                </div>
              </div>
              {(preview?.warnings ?? []).map((warning) => (
                <div
                  key={warning.parentTransactionId}
                  className="flex items-center justify-between gap-2 rounded-md border border-[#E8E1D7] px-3 py-2 text-xs"
                >
                  <span>{WARNING_TEXT[warning.code] ?? warning.code}</span>
                  <button
                    type="button"
                    className="text-[#8a6a1f]"
                    onClick={() => toggle(warning.parentTransactionId, false)}
                  >
                    Remove
                  </button>
                </div>
              ))}
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
              <div className="flex flex-wrap justify-end gap-2">
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
                  data-testid="issue-invoice"
                >
                  Issue invoice
                </Button>
              </div>
            </div>
            <div className={cn("space-y-2 p-4 text-sm lg:hidden", pane !== "tax" && "hidden")}>
              <TaxBreakdown groups={preview?.groups ?? []} money={money} />
            </div>
          </div>
          <aside className={cn(CARD, "p-4", pane !== "preview" && "hidden lg:block")}>
            <InvoiceDraftPreview
              folio={folio}
              money={money}
              dateTime={dateTime}
              notes={notes}
              preparedBy={board?.draft?.preparedBy ?? null}
              groups={preview?.groups ?? []}
              subtotal={preview?.subtotal ?? 0}
              tax={preview?.tax ?? 0}
              serviceCharge={preview?.serviceCharge ?? 0}
              total={preview?.total ?? 0}
            />
            <div className="mt-4 hidden lg:block">
              <TaxBreakdown groups={preview?.groups ?? []} money={money} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="text-sm font-semibold">Issued invoices</h3>
        </div>
        {folio.issuedInvoices.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No issued invoice yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className={HEAD}>
                <tr>
                  <th className="px-3 py-2 font-medium">Invoice no.</th>
                  <th className="px-3 py-2 font-medium">Issued at</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Reprints</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {folio.issuedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-[#E8E1D7]/80">
                    <td className="px-3 py-2 font-medium">{invoice.issuedNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dateTime(invoice.issuedAt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(
                        invoice.snapshot.totals.invoiceTotal ?? invoice.snapshot.totals.balance,
                      )}
                    </td>
                    <td className="px-3 py-2">{invoice.reprintCount}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2 h-7"
                        onClick={() => setOpenInvoiceId(invoice.id)}
                      >
                        View
                      </Button>
                      {workspace.capabilities.canReprintInvoice ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={reprinting}
                          onClick={() => onReprint(invoice)}
                        >
                          <Printer className="size-3.5" /> Reprint
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {openInvoice ? (
          <div className="border-t border-[#E8E1D7] p-4">
            <FolioInvoicePreview invoice={openInvoice} money={money} dateTime={dateTime} />
            <CreditNoteSection
              restaurantId={restaurantId}
              guestInvoiceId={openInvoice.id}
              canManage={workspace.canManage}
              money={money}
              dateTime={dateTime}
              onIssued={onChanged}
            />
            <DebitNoteSection
              restaurantId={restaurantId}
              guestInvoiceId={openInvoice.id}
              canManage={workspace.canManage}
              money={money}
              dateTime={dateTime}
              onIssued={onChanged}
              onPostCharge={onPostCharge}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InvoiceDraftPreview({
  folio,
  money,
  dateTime,
  notes,
  preparedBy,
  groups,
  subtotal,
  tax,
  serviceCharge,
  total,
}: {
  folio: FolioWorkspace["folio"];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  notes: string;
  preparedBy: string | null;
  groups: InvoiceGroupView[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
}) {
  return (
    <div className="space-y-3 text-sm" data-testid="invoice-draft-preview">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice draft</p>
      <p className="font-semibold">{folio.guestName}</p>
      <p className="text-muted-foreground">Invoice no. Assigned on issue</p>
      <p className="text-muted-foreground">
        Folio {folio.folioNumber}
        {folio.confirmationNumber ? ` · ${folio.confirmationNumber}` : ""}
      </p>
      <p className="text-muted-foreground">
        {folio.arrivalDate ? dateTime(folio.arrivalDate) : "—"} –{" "}
        {folio.departureDate ? dateTime(folio.departureDate) : "—"}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {groups.map((group) => (
            <tr key={group.parentTransactionId} className="border-t border-[#E8E1D7]">
              <td className="py-1">{group.description}</td>
              <td className="py-1 text-right tabular-nums">{money(group.grossTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 border-t border-[#E8E1D7] pt-2">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Tax</span>
          <span>{money(tax)}</span>
        </p>
        <p className="flex justify-between">
          <span>Service charge</span>
          <span>{money(serviceCharge)}</span>
        </p>
        <p className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{money(total)}</span>
        </p>
      </div>
      {notes ? <p className="text-xs text-muted-foreground">{notes}</p> : null}
      {preparedBy ? (
        <p className="text-xs text-muted-foreground">Prepared by {preparedBy}</p>
      ) : null}
    </div>
  );
}

function TaxBreakdown({
  groups,
  money,
}: {
  groups: InvoiceGroupView[];
  money: (value: number) => string;
}) {
  const taxes = groups.flatMap((group) => group.taxLines);
  const services = groups.flatMap((group) => group.serviceLines);
  if (taxes.length === 0 && services.length === 0) return null;
  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">Tax breakdown</p>
      {taxes.map((line) => (
        <p key={line.id} className="flex justify-between gap-2">
          <span>
            {line.name}
            {line.code ? ` (${line.code})` : ""}
            {line.basis ? ` · ${line.basis}` : ""}
            {line.calculation ? ` · ${line.calculation}` : ""}
          </span>
          <span className="tabular-nums">{money(line.amount)}</span>
        </p>
      ))}
      {services.map((line) => (
        <p key={line.id} className="flex justify-between gap-2">
          <span>
            {line.name}
            {line.basis ? ` · ${line.basis}` : ""}
          </span>
          <span className="tabular-nums">{money(line.amount)}</span>
        </p>
      ))}
    </div>
  );
}
