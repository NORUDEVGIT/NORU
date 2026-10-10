import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { roundCredit, type CreditNoteSnapshot } from "@/packages/pms/lib/cashiering-credit-notes";
import {
  createInvoiceCreditNoteDraft,
  deleteInvoiceCreditNoteDraft,
  getInvoiceCreditBoard,
  issueInvoiceCreditNoteDraft,
  previewInvoiceCreditNote,
  reprintInvoiceCreditNote,
  updateInvoiceCreditNoteDraft,
} from "@/packages/pms/lib/cashiering-credit-notes.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white";
const HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function CreditNoteSection({
  restaurantId,
  guestInvoiceId,
  accountInvoiceId,
  canManage,
  money,
  dateTime,
  onIssued,
}: {
  restaurantId: string;
  guestInvoiceId?: string;
  accountInvoiceId?: string;
  canManage: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onIssued?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getInvoiceCreditBoard);
  const previewNote = useServerFn(previewInvoiceCreditNote);
  const createDraft = useServerFn(createInvoiceCreditNoteDraft);
  const updateDraft = useServerFn(updateInvoiceCreditNoteDraft);
  const removeDraft = useServerFn(deleteInvoiceCreditNoteDraft);
  const issueDraft = useServerFn(issueInvoiceCreditNoteDraft);
  const reprintNote = useServerFn(reprintInvoiceCreditNote);
  const [editing, setEditing] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [viewNoteId, setViewNoteId] = useState<string | null>(null);
  const [printSnap, setPrintSnap] = useState<CreditNoteSnapshot | null>(null);

  const boardQuery = useQuery({
    queryKey: ["invoice-credit-board", restaurantId, guestInvoiceId, accountInvoiceId],
    queryFn: () =>
      fetchBoard({
        data: { restaurantId, guestInvoiceId, accountInvoiceId },
      }),
  });
  const board = boardQuery.data;
  const items = useMemo(
    () =>
      Object.entries(amounts)
        .map(([sourceGroupId, raw]) => ({ sourceGroupId, gross: roundCredit(Number(raw)) }))
        .filter((item) => item.gross > 0),
    [amounts],
  );
  const previewQuery = useQuery({
    queryKey: ["invoice-credit-preview", restaurantId, guestInvoiceId, accountInvoiceId, items],
    enabled: editing && items.length > 0,
    queryFn: () =>
      previewNote({
        data: { restaurantId, guestInvoiceId, accountInvoiceId, items },
      }),
  });
  const preview = previewQuery.data;

  useEffect(() => {
    if (!board?.draft || !editing) return;
    setReason(board.draft.reason);
    const next: Record<string, string> = {};
    for (const item of board.draft.items) next[item.sourceGroupId] = String(item.gross);
    setAmounts(next);
  }, [board?.draft, editing]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["invoice-credit-board", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-debit-board", restaurantId] });
    onIssued?.();
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const created = await createDraft({
        data: {
          restaurantId,
          guestInvoiceId,
          accountInvoiceId,
          reason: reason.trim(),
        },
      });
      await updateDraft({
        data: { restaurantId, draftId: created.draftId, reason: reason.trim(), items },
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
          data: { restaurantId, draftId, reason: reason.trim(), items },
        });
      }
      return draftId;
    },
    onSuccess: () => {
      toast.success("Credit note draft saved.");
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
      setAmounts({});
      toast.success("Credit note draft deleted.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const issueMut = useMutation({
    mutationFn: async () => {
      const draftId = board?.draft?.id ?? (await createMut.mutateAsync());
      if (board?.draft) {
        await updateDraft({
          data: { restaurantId, draftId, reason: reason.trim(), items },
        });
      }
      return issueDraft({
        data: {
          restaurantId,
          draftId,
          idempotencyKey: `cndraft:${draftId}`,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`Credit note ${result.note.noteNumber} issued.`);
      setEditing(false);
      setAmounts({});
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
        Credit notes could not be loaded. {boardQuery.error.message}
      </p>
    );
  }
  if (!board) return null;
  const viewed = board.notes.find((note) => note.id === viewNoteId) ?? null;
  const manageable = canManage && board.canManage;

  return (
    <section className="mt-4 space-y-3" data-testid="invoice-credit-notes">
      <div className={cn(CARD, "px-4 py-3")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Credits</p>
            <p className="text-sm">
              Original {money(board.originalTotal)} · Credits {money(-board.previousCredits)} ·
              Debits {money(board.previousDebits)} · Net {money(board.netInvoice)}
            </p>
            <p className="text-xs text-muted-foreground">
              {board.creditState} · Remaining {money(board.remaining)}
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
                  disabled={board.remaining <= 0.009 || board.groups.length === 0}
                  onClick={() => {
                    setReason("");
                    setEditing(true);
                  }}
                  data-testid="create-credit-note"
                >
                  Create credit note
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {!manageable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Create credit note is available to the owner or manager.
          </p>
        ) : null}
        {manageable && !editing && board.groups.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This invoice has no charge groups that can be credited.
          </p>
        ) : null}
      </div>

      {board.draft && !editing ? (
        <p className={cn(CARD, "px-4 py-3 text-sm")}>
          Draft credit note · Updated {dateTime(board.draft.updatedAt)} · Note number assigned on
          issue
        </p>
      ) : null}

      {editing && (board.draft || manageable) ? (
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <h3 className="font-display text-lg">Create credit note</h3>
            <p className="text-sm">
              {board.invoiceNumber} · {board.billToName} · {dateTime(board.issuedAt)} ·{" "}
              {board.currency}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className={HEAD}>
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2 text-right">Original</th>
                  <th className="px-3 py-2 text-right">Credited</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Credit amount</th>
                </tr>
              </thead>
              <tbody>
                {board.groups.map((group) => {
                  const disabled = group.remaining <= 0.009;
                  const selected =
                    amounts[group.sourceGroupId] != null && amounts[group.sourceGroupId] !== "";
                  const source = group.sourceGuest
                    ? `${group.sourceGuest}${group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : ""}`
                    : "—";
                  return (
                    <tr key={group.sourceGroupId} className="border-b border-[#E8E1D7]">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected}
                          disabled={disabled}
                          onCheckedChange={(value) =>
                            setAmounts((current) => {
                              const next = { ...current };
                              if (value) next[group.sourceGroupId] = String(group.remaining);
                              else delete next[group.sourceGroupId];
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">{group.description}</td>
                      <td className="px-3 py-2 text-xs">{source}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(group.originalGross)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(group.previouslyCredited)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(group.remaining)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          className="h-8 w-24 rounded-md border border-[#E8E1D7] px-2 text-right text-sm"
                          inputMode="decimal"
                          disabled={disabled || !selected}
                          value={amounts[group.sourceGroupId] ?? ""}
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [group.sourceGroupId]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="ml-2 text-[11px] text-[#8a6a1d] underline"
                          disabled={disabled}
                          onClick={() =>
                            setAmounts((current) => ({
                              ...current,
                              [group.sourceGroupId]: String(group.remaining),
                            }))
                          }
                        >
                          Full
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t border-[#E8E1D7] p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <label className="block text-xs text-muted-foreground">
              Reason
              <textarea
                className="mt-1 w-full rounded-md border border-[#E8E1D7] px-2 py-1 text-sm text-foreground"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{money(-(preview?.subtotal ?? 0))}</span>
              </p>
              <p className="flex justify-between">
                <span>Tax</span>
                <span>{money(-(preview?.tax ?? 0))}</span>
              </p>
              <p className="flex justify-between">
                <span>Service</span>
                <span>{money(-(preview?.serviceCharge ?? 0))}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>Total credit</span>
                <span>{money(-(preview?.total ?? 0))}</span>
              </p>
              <p className="flex justify-between">
                <span>Net invoice</span>
                <span>{money(preview?.netAfter ?? board.netInvoice)}</span>
              </p>
              {preview && !preview.ok && preview.code ? (
                <p className="text-xs text-amber-800">{preview.code}</p>
              ) : null}
              {preview?.creditBalance != null ? (
                <p className="text-xs text-amber-800">
                  This credit will create a credit balance of {money(preview.creditBalance)}. Refund
                  is a separate action.
                </p>
              ) : null}
              {(preview?.groups ?? []).flatMap((group) =>
                group.components.map((component) => (
                  <p
                    key={`${group.description}-${component.kind}-${component.description}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {component.description} {money(-component.credited)}
                  </p>
                )),
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E8E1D7] px-4 py-3">
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
              disabled={issueMut.isPending || items.length === 0 || reason.trim().length === 0}
              onClick={() => issueMut.mutate()}
              data-testid="issue-credit-note"
            >
              Issue credit note
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-[#E8E1D7] px-4 py-3">
          <h3 className="font-medium">Credit notes</h3>
        </div>
        {board.notes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No credit note has been issued for this invoice.
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
            <CreditNoteDocument
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
          <CreditNoteDocument snapshot={printSnap} money={money} dateTime={dateTime} />
        </div>
      ) : null}
    </section>
  );
}

function CreditNoteDocument({
  snapshot,
  money,
  dateTime,
  issuedAt,
}: {
  snapshot: CreditNoteSnapshot;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  issuedAt?: string;
}) {
  return (
    <article className="space-y-3 text-sm" data-testid="credit-note-print">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Credit note</p>
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
            <th className="text-right">Subtotal</th>
            <th className="text-right">Tax</th>
            <th className="text-right">Service</th>
            <th className="text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.groups.map((group) => (
            <tr key={`${group.description}-${group.creditGross}`}>
              <td>
                {group.description}
                {group.sourceGuest ? (
                  <span className="block text-xs text-muted-foreground">
                    {group.sourceGuest}
                    {group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : ""}
                  </span>
                ) : null}
              </td>
              <td className="text-right tabular-nums">{money(-group.subtotal)}</td>
              <td className="text-right tabular-nums">{money(-group.tax)}</td>
              <td className="text-right tabular-nums">{money(-group.serviceCharge)}</td>
              <td className="text-right tabular-nums">{money(-group.creditGross)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Reason: {snapshot.reason}</p>
      <div className="ml-auto w-64 space-y-1">
        <p className="flex justify-between">
          <span>Subtotal credit</span>
          <span>{money(-snapshot.totals.subtotal)}</span>
        </p>
        <p className="flex justify-between">
          <span>Tax credit</span>
          <span>{money(-snapshot.totals.tax)}</span>
        </p>
        <p className="flex justify-between">
          <span>Service credit</span>
          <span>{money(-snapshot.totals.serviceCharge)}</span>
        </p>
        <p className="flex justify-between font-medium">
          <span>Total credit</span>
          <span>{money(-snapshot.totals.totalCredit)}</span>
        </p>
        <p className="flex justify-between">
          <span>Net invoice</span>
          <span>{money(snapshot.totals.netInvoice)}</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Issued by {snapshot.issuedByName ?? "—"}</p>
    </article>
  );
}
