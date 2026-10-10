import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  DebitNoteSnapshot,
  DebitSourceGroup,
} from "@/packages/pms/lib/cashiering-debit-notes";
import {
  createInvoiceDebitNoteDraft,
  deleteInvoiceDebitNoteDraft,
  getInvoiceDebitBoard,
  issueInvoiceDebitNoteDraft,
  previewInvoiceDebitNote,
  reprintInvoiceDebitNote,
  updateInvoiceDebitNoteDraft,
} from "@/packages/pms/lib/cashiering-debit-notes.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";
const HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

const PREVIEW_TEXT: Record<string, string> = {
  DEBIT_SOURCE_NOT_ELIGIBLE: "That charge cannot be added to this debit note.",
  DEBIT_SOURCE_ALREADY_COVERED: "That charge is already on an issued invoice or debit note.",
  DEBIT_SOURCE_WRONG_TARGET: "Choose a charge owned by this same guest, company, or group.",
  DEBIT_NOTE_DRAFT_EMPTY: "Select at least one uninvoiced charge.",
  UNSUPPORTED_INVOICE_TARGET: "This invoice cannot receive a debit note.",
};

export function DebitNoteSection({
  restaurantId,
  guestInvoiceId,
  accountInvoiceId,
  canManage,
  money,
  dateTime,
  onIssued,
  onPostCharge,
}: {
  restaurantId: string;
  guestInvoiceId?: string;
  accountInvoiceId?: string;
  canManage: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onIssued?: () => void;
  onPostCharge?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getInvoiceDebitBoard);
  const previewNote = useServerFn(previewInvoiceDebitNote);
  const createDraft = useServerFn(createInvoiceDebitNoteDraft);
  const updateDraft = useServerFn(updateInvoiceDebitNoteDraft);
  const removeDraft = useServerFn(deleteInvoiceDebitNoteDraft);
  const issueDraft = useServerFn(issueInvoiceDebitNoteDraft);
  const reprintNote = useServerFn(reprintInvoiceDebitNote);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [postedOn, setPostedOn] = useState("");
  const [source, setSource] = useState("");
  const [viewNoteId, setViewNoteId] = useState<string | null>(null);
  const [printSnap, setPrintSnap] = useState<DebitNoteSnapshot | null>(null);

  const boardQuery = useQuery({
    queryKey: ["invoice-debit-board", restaurantId, guestInvoiceId, accountInvoiceId],
    queryFn: () => fetchBoard({ data: { restaurantId, guestInvoiceId, accountInvoiceId } }),
  });
  const board = boardQuery.data;
  const sourceIds = useMemo(() => selected.filter(Boolean), [selected]);
  const previewQuery = useQuery({
    queryKey: ["invoice-debit-preview", restaurantId, guestInvoiceId, accountInvoiceId, sourceIds],
    enabled: editing && sourceIds.length > 0,
    queryFn: () =>
      previewNote({
        data: { restaurantId, guestInvoiceId, accountInvoiceId, sourceIds },
      }),
  });
  const preview = previewQuery.data;

  useEffect(() => {
    if (!board?.draft || !editing) return;
    setReason(board.draft.reason);
    setSelected(board.draft.sourceIds);
  }, [board?.draft, editing]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["invoice-debit-board", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-credit-board", restaurantId] });
    onIssued?.();
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const created = await createDraft({
        data: { restaurantId, guestInvoiceId, accountInvoiceId, reason: reason.trim() },
      });
      await updateDraft({
        data: { restaurantId, draftId: created.draftId, reason: reason.trim(), sourceIds },
      });
      return created.draftId;
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMut = useMutation({
    mutationFn: async () => {
      const draftId = board?.draft?.id ?? (await createMut.mutateAsync());
      if (board?.draft) {
        await updateDraft({
          data: { restaurantId, draftId, reason: reason.trim(), sourceIds },
        });
      }
      return draftId;
    },
    onSuccess: () => {
      toast.success("Debit note draft saved.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => {
      if (!board?.draft) throw new Error("There is no draft to delete.");
      return removeDraft({ data: { restaurantId, draftId: board.draft.id } });
    },
    onSuccess: () => {
      setEditing(false);
      setSelected([]);
      toast.success("Debit note draft deleted.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const issueMut = useMutation({
    mutationFn: async () => {
      const draftId = board?.draft?.id ?? (await createMut.mutateAsync());
      if (board?.draft) {
        await updateDraft({
          data: { restaurantId, draftId, reason: reason.trim(), sourceIds },
        });
      }
      return issueDraft({
        data: { restaurantId, draftId, idempotencyKey: `dndraft:${draftId}` },
      });
    },
    onSuccess: (result) => {
      toast.success(`Debit Note ${result.note.noteNumber} issued successfully.`);
      setEditing(false);
      setSelected([]);
      setViewNoteId(result.note.id);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reprintMut = useMutation({
    mutationFn: (noteId: string) => reprintNote({ data: { restaurantId, noteId } }),
    onSuccess: (result) => {
      setPrintSnap(result.snapshot);
      refresh();
      window.setTimeout(() => window.print(), 50);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (boardQuery.isError) {
    return (
      <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Debit notes could not be loaded. {boardQuery.error.message}
      </p>
    );
  }
  if (!board) return null;
  const viewed = board.notes.find((note) => note.id === viewNoteId) ?? null;
  const manageable = canManage && board.canManage;
  const departments = [
    ...new Set(board.eligibleGroups.map((group) => group.departmentName).filter(Boolean)),
  ] as string[];
  const visible = board.eligibleGroups.filter((group) => {
    const haystack =
      `${group.description} ${group.sourceGuest ?? ""} ${group.sourceFolioNumber ?? ""} ${group.departmentName ?? ""}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (department && group.departmentName !== department) return false;
    if (postedOn && !(group.postedAt ?? "").startsWith(postedOn)) return false;
    if (source.trim()) {
      const sourceText =
        `${group.sourceGuest ?? ""} ${group.sourceFolioNumber ?? ""}`.toLowerCase();
      if (!sourceText.includes(source.trim().toLowerCase())) return false;
    }
    return true;
  });
  const thisDebit = preview?.ok ? preview.total : 0;
  const newNet = preview?.ok ? preview.netAfter : board.netInvoice;

  return (
    <section className="mt-4 space-y-3" data-testid="invoice-debit-notes">
      <div className={cn(CARD, "px-4 py-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Debits</p>
            <p className="text-sm">
              Original {money(board.originalTotal)} · Credits {money(-board.previousCredits)} ·
              Debits {money(board.previousDebits)} · Net {money(board.netInvoice)}
            </p>
            <p className="text-xs text-muted-foreground">
              Net invoice is the original amount minus credits plus debits. The issued invoice is
              not changed.
            </p>
          </div>
          {manageable && !editing ? (
            <div className="flex gap-2">
              {board.draft ? (
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
              ) : (
                <Button
                  size="sm"
                  className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                  onClick={() => {
                    setReason("");
                    setSelected([]);
                    setEditing(true);
                  }}
                  data-testid="create-debit-note"
                >
                  Create debit note
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {!manageable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Create debit note is available to the owner or manager.
          </p>
        ) : null}
      </div>

      {board.draft && !editing ? (
        <p className={cn(CARD, "px-4 py-3 text-sm")}>
          Draft debit note · Updated {dateTime(board.draft.updatedAt)} · Note number assigned on
          issue
        </p>
      ) : null}

      {editing && manageable ? (
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <h3 className="font-display text-lg">Create Debit Note</h3>
            <p className="text-sm">
              Original invoice {board.invoiceNumber} · Bill to {board.billToName} · {board.currency}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Original {money(board.originalTotal)} · Previous credits{" "}
              {money(-board.previousCredits)} · Previous debits {money(board.previousDebits)} ·
              Current net {money(board.netInvoice)}
            </p>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.5fr)_280px]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  className="h-8 rounded-md border border-[#E8E1D7] px-2 text-sm"
                  placeholder="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <input
                  className="h-8 rounded-md border border-[#E8E1D7] px-2 text-sm"
                  type="date"
                  value={postedOn}
                  onChange={(event) => setPostedOn(event.target.value)}
                />
                <select
                  className="h-8 rounded-md border border-[#E8E1D7] px-2 text-sm"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                >
                  <option value="">Department</option>
                  {departments.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {accountInvoiceId ? (
                  <input
                    className="h-8 rounded-md border border-[#E8E1D7] px-2 text-sm"
                    placeholder="Source guest or folio"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                  />
                ) : null}
              </div>
              {board.eligibleGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E8E1D7] bg-[#F7F4EE] px-4 py-6 text-sm">
                  <p>No charges are available to add to this invoice.</p>
                  {onPostCharge ? (
                    <Button
                      size="sm"
                      className="mt-3 h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
                      onClick={onPostCharge}
                    >
                      <Plus className="size-4" /> Post Charge
                    </Button>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      A transferred or direct account charge must already exist before it can be
                      added with a debit note.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className={HEAD}>
                      <tr>
                        <th className="px-2 py-2" />
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Charge</th>
                        <th className="px-2 py-2">Source</th>
                        <th className="px-2 py-2">Department</th>
                        <th className="px-2 py-2 text-right">Qty / unit</th>
                        <th className="px-2 py-2 text-right">Subtotal</th>
                        <th className="px-2 py-2 text-right">Tax</th>
                        <th className="px-2 py-2 text-right">Service</th>
                        <th className="px-2 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((group) => (
                        <DebitSourceRow
                          key={group.sourceGroupId}
                          group={group}
                          checked={selected.includes(group.sourceGroupId)}
                          money={money}
                          dateTime={dateTime}
                          onToggle={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current, group.sourceGroupId]
                                : current.filter((id) => id !== group.sourceGroupId),
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                  {visible.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      No charges match these filters.
                    </p>
                  ) : null}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Need to add a new charge? Post it first. A debit note can only document a charge
                that is already on the ledger.
              </p>
              {onPostCharge && board.eligibleGroups.length > 0 ? (
                <Button size="sm" variant="outline" className="h-8" onClick={onPostCharge}>
                  <Plus className="size-4" /> Post Charge
                </Button>
              ) : null}
            </div>
            <aside className="space-y-2 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] p-3 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Debit note — draft
              </p>
              <p>
                {board.invoiceNumber} · {board.billToName} · {board.currency}
              </p>
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{money(preview?.subtotal ?? 0)}</span>
              </p>
              <p className="flex justify-between">
                <span>Tax</span>
                <span>{money(preview?.tax ?? 0)}</span>
              </p>
              <p className="flex justify-between">
                <span>Service charge</span>
                <span>{money(preview?.serviceCharge ?? 0)}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>Debit total</span>
                <span>{money(thisDebit)}</span>
              </p>
              <p className="flex justify-between">
                <span>Original invoice</span>
                <span>{money(board.originalTotal)}</span>
              </p>
              <p className="flex justify-between">
                <span>Credits</span>
                <span>{money(-board.previousCredits)}</span>
              </p>
              <p className="flex justify-between">
                <span>Previous debits</span>
                <span>{money(board.previousDebits)}</span>
              </p>
              <p className="flex justify-between">
                <span>This debit</span>
                <span>{money(thisDebit)}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>New net invoice</span>
                <span>{money(newNet)}</span>
              </p>
              {preview && !preview.ok && preview.code ? (
                <p className="text-xs text-amber-800">
                  {PREVIEW_TEXT[preview.code] ?? "That charge cannot be added to this debit note."}
                </p>
              ) : null}
            </aside>
          </div>
          <div className="grid gap-4 border-t border-[#E8E1D7] p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <label className="block text-xs text-muted-foreground">
              Reason *
              <textarea
                className="mt-1 w-full rounded-md border border-[#E8E1D7] px-2 py-1 text-sm text-foreground"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              The debit note number is assigned on issue. Owner or manager access is required. There
              is no approval step. Issuing documents the selected charges and does not post them
              again.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E8E1D7] px-4 py-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={saveMut.isPending || sourceIds.length === 0 || reason.trim().length === 0}
              onClick={() => saveMut.mutate()}
            >
              Save draft
            </Button>
            <Button
              size="sm"
              className="h-8 bg-[#C89933] text-white hover:bg-[#b7892d]"
              disabled={
                issueMut.isPending ||
                sourceIds.length === 0 ||
                reason.trim().length === 0 ||
                preview?.ok === false
              }
              onClick={() => issueMut.mutate()}
              data-testid="issue-debit-note"
            >
              Issue debit note
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="font-medium">Debit notes</h3>
        </div>
        {board.notes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No debit note has been issued for this invoice.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className={HEAD}>
              <tr>
                <th className="px-3 py-2">Note no.</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Issued by</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {board.notes.map((note) => (
                <tr key={note.id} className="border-b border-[#E8E1D7]">
                  <td className="px-3 py-2 font-medium">{note.noteNumber}</td>
                  <td className="px-3 py-2">{dateTime(note.issuedAt)}</td>
                  <td className="px-3 py-2">{note.reason}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(note.total)}</td>
                  <td className="px-3 py-2">{note.issuedByName ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2 h-8"
                      onClick={() => setViewNoteId(note.id)}
                    >
                      View
                    </Button>
                    {manageable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={reprintMut.isPending}
                        onClick={() => reprintMut.mutate(note.id)}
                      >
                        <Printer className="size-4" /> Print
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {viewed ? (
          <div className="border-t border-[#E8E1D7] p-4">
            <DebitNoteDocument
              snapshot={viewed.snapshot}
              money={money}
              dateTime={dateTime}
              issuedAt={viewed.issuedAt}
            />
          </div>
        ) : null}
      </div>
      {printSnap ? (
        <div className="hidden print:block">
          <DebitNoteDocument snapshot={printSnap} money={money} dateTime={dateTime} />
        </div>
      ) : null}
    </section>
  );
}

function DebitSourceRow({
  group,
  checked,
  money,
  dateTime,
  onToggle,
}: {
  group: DebitSourceGroup;
  checked: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onToggle: (checked: boolean) => void;
}) {
  const source = group.sourceGuest
    ? `${group.sourceGuest}${group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : ""}`
    : "—";
  return (
    <tr className="border-b border-[#E8E1D7]">
      <td className="px-2 py-2">
        <Checkbox checked={checked} onCheckedChange={(value) => onToggle(value === true)} />
      </td>
      <td className="px-2 py-2 text-xs">{dateTime(group.postedAt)}</td>
      <td className="px-2 py-2">{group.description}</td>
      <td className="px-2 py-2 text-xs">{source}</td>
      <td className="px-2 py-2 text-xs">{group.departmentName ?? "—"}</td>
      <td className="px-2 py-2 text-right text-xs tabular-nums">
        {group.quantity == null
          ? "—"
          : `${group.quantity} × ${group.unitAmount == null ? "—" : money(group.unitAmount)}`}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{money(group.subtotal)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{money(group.taxTotal)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{money(group.serviceChargeTotal)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{money(group.grossTotal)}</td>
    </tr>
  );
}

function DebitNoteDocument({
  snapshot,
  money,
  dateTime,
  issuedAt,
}: {
  snapshot: DebitNoteSnapshot;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  issuedAt?: string;
}) {
  return (
    <article className="space-y-3 text-sm" data-testid="debit-note-print">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Debit note</p>
        <h2 className="font-display text-xl">{snapshot.noteNumber || "Draft"}</h2>
        <p className="text-xs">
          Invoice {snapshot.originalInvoiceNumber ?? "—"} · {dateTime(issuedAt)} ·{" "}
          {snapshot.currency}
        </p>
      </header>
      <p>
        <span className="text-muted-foreground">Bill to </span>
        {snapshot.billToName}
      </p>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[11px] uppercase text-muted-foreground">
            <th>Description</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Subtotal</th>
            <th className="text-right">Tax</th>
            <th className="text-right">Service</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.groups.map((group) => (
            <tr key={`${group.description}-${group.gross}`}>
              <td>
                {group.description}
                {group.sourceGuest ? (
                  <span className="block text-xs text-muted-foreground">
                    {group.sourceGuest}
                    {group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : ""}
                  </span>
                ) : null}
              </td>
              <td className="text-right tabular-nums">{group.quantity ?? "—"}</td>
              <td className="text-right tabular-nums">
                {group.unitAmount == null ? "—" : money(group.unitAmount)}
              </td>
              <td className="text-right tabular-nums">{money(group.subtotal)}</td>
              <td className="text-right tabular-nums">{money(group.tax)}</td>
              <td className="text-right tabular-nums">{money(group.serviceCharge)}</td>
              <td className="text-right tabular-nums">{money(group.gross)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Reason: {snapshot.reason}</p>
      <div className="ml-auto w-72 space-y-1">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(snapshot.totals.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Tax</span>
          <span>{money(snapshot.totals.tax)}</span>
        </p>
        <p className="flex justify-between">
          <span>Service charge</span>
          <span>{money(snapshot.totals.serviceCharge)}</span>
        </p>
        <p className="flex justify-between font-medium">
          <span>Debit total</span>
          <span>{money(snapshot.totals.debitTotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Net invoice after debit</span>
          <span>{money(snapshot.totals.netInvoice)}</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Issued by {snapshot.issuedByName ?? "—"}</p>
    </article>
  );
}
