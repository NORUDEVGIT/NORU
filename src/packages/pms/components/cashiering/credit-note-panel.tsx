import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronUp, FileText, Printer, Trash2 } from "lucide-react";
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
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { CashieringDocumentLetterhead } from "@/packages/pms/components/cashiering/cashiering-document-letterhead";
import { CompanyCreditNoteFiscalSection } from "@/packages/pms/components/cashiering/company-credit-note-fiscal-section";
import { CreditNoteFiscalSection } from "@/packages/pms/components/cashiering/credit-note-fiscal-section";
import { CashieringPrintLayer } from "@/packages/pms/components/cashiering/cashiering-print-layer";
import {
  mergeCashieringDocumentProperty,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import { getCashieringDocumentProperty } from "@/packages/pms/lib/cashiering-invoices.functions";
import { cashieringInvoiceAccess } from "@/packages/pms/lib/cashiering-invoice-access";
import { fiscalDeskAccess } from "@/packages/pms/lib/fiscal-desk-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

function CreditAmountField({
  value,
  remaining,
  filled,
  disabled,
  money,
  onChange,
}: {
  value: string;
  remaining: number;
  filled: number;
  disabled: boolean;
  money: (value: number) => string;
  onChange: (next: string | null) => void;
}) {
  const share = remaining > 0 ? Math.min(100, Math.round((filled / remaining) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          disabled={disabled}
          value={value}
          aria-label="Credit amount"
          placeholder="0"
          className="h-9 text-right tabular-nums"
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw.trim()) {
              onChange(null);
              return;
            }
            const amount = Number(raw);
            if (Number.isFinite(amount) && amount > remaining) {
              onChange(String(remaining));
              return;
            }
            onChange(raw);
          }}
          onBlur={() => {
            const amount = roundCredit(Number(value));
            if (!value.trim() || !Number.isFinite(amount) || amount <= 0) {
              onChange(null);
              return;
            }
            onChange(String(Math.min(amount, remaining)));
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 shrink-0 border-[#DDD4C5]"
          disabled={disabled}
          onClick={() => onChange(String(remaining))}
        >
          Full
        </Button>
      </div>
      <input
        type="range"
        min={0}
        max={remaining}
        step={0.01}
        disabled={disabled}
        value={disabled ? 0 : filled}
        aria-label="Credit amount slider"
        className="mt-2 h-1.5 w-full cursor-pointer accent-[#C89933] disabled:cursor-not-allowed"
        onChange={(event) => {
          const amount = roundCredit(Number(event.target.value));
          onChange(amount > 0 ? String(amount) : null);
        }}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {disabled ? "Nothing left to credit" : `${money(filled)} of ${money(remaining)} · ${share}%`}
      </p>
    </div>
  );
}

const CARD = "rounded-xl border border-[#E8E1D7] bg-white";
const HEAD =
  "border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function CreditNoteSection({
  restaurantId,
  guestInvoiceId,
  accountInvoiceId,
  money,
  dateTime,
  onIssued,
}: {
  restaurantId: string;
  guestInvoiceId?: string;
  accountInvoiceId?: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onIssued?: () => void;
}) {
  const queryClient = useQueryClient();
  const permissions = usePmsPermissions(restaurantId);
  const invoiceAccess = useMemo(
    () =>
      cashieringInvoiceAccess({ isOwner: permissions.isOwner, codes: permissions.permissions }),
    [permissions.isOwner, permissions.permissions],
  );
  const fiscal = useMemo(
    () => fiscalDeskAccess({ isOwner: permissions.isOwner, codes: permissions.permissions }),
    [permissions.isOwner, permissions.permissions],
  );
  const canEditDraft = invoiceAccess.canEdit;
  const canAuthorize = invoiceAccess.canAuthorize;
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
  const [printIssuedAt, setPrintIssuedAt] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["invoice-credit-board", restaurantId, guestInvoiceId, accountInvoiceId],
    queryFn: () =>
      fetchBoard({
        data: { restaurantId, guestInvoiceId, accountInvoiceId },
      }),
  });
  const fetchDocumentProperty = useServerFn(getCashieringDocumentProperty);
  const documentPropertyQuery = useQuery({
    queryKey: ["cashiering-document-property", restaurantId],
    queryFn: () => fetchDocumentProperty({ data: { restaurantId } }),
  });
  const board = boardQuery.data;
  const invoiceProperty = board?.property ?? null;
  const liveProperty = documentPropertyQuery.data ?? null;
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
    onSuccess: (result, noteId) => {
      const source = board?.notes.find((note) => note.id === noteId);
      setPrintSnap(result.snapshot);
      setPrintIssuedAt(source?.issuedAt ?? null);
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
          {canEditDraft && !editing ? (
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
        {!canEditDraft ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Draft credit notes require Invoice Edit permission in Staff &amp; Access.
          </p>
        ) : null}
        {canEditDraft && !editing && board.groups.length === 0 ? (
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

      {editing && (board.draft || canEditDraft) ? (
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="border-b border-[#E8E1D7] px-4 py-3">
            <h3 className="font-display text-lg">Create credit note</h3>
            <p className="text-sm text-muted-foreground">
              {board.invoiceNumber} · {board.billToName} · {money(board.remaining)} still available
            </p>
          </div>
          <ul className="divide-y divide-[#E8E1D7]">
            {board.groups.map((group) => {
              const disabled = group.remaining <= 0.009;
              const raw = amounts[group.sourceGroupId] ?? "";
              const typed = Number(raw);
              const filled = Number.isFinite(typed) ? Math.min(Math.max(typed, 0), group.remaining) : 0;
              const source = group.sourceGuest
                ? `${group.sourceGuest}${group.sourceFolioNumber ? ` · ${group.sourceFolioNumber}` : ""}`
                : null;
              return (
                <li key={group.sourceGroupId} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="min-w-0">
                    <p className="font-medium">{group.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {source ? `${source} · ` : ""}
                      Original {money(group.originalGross)}
                      {group.previouslyCredited > 0.009
                        ? ` · Credited ${money(group.previouslyCredited)}`
                        : ""}
                      {" · "}
                      Left {money(group.remaining)}
                    </p>
                  </div>
                  <CreditAmountField
                    value={raw}
                    remaining={group.remaining}
                    filled={filled}
                    disabled={disabled}
                    money={money}
                    onChange={(next) =>
                      setAmounts((current) => {
                        const copy = { ...current };
                        if (next == null) delete copy[group.sourceGroupId];
                        else copy[group.sourceGroupId] = next;
                        return copy;
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
          <div className="grid gap-4 border-t border-[#E8E1D7] p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">Reason</span>
              <textarea
                className="mt-1 w-full rounded-md border border-[#E8E1D7] px-2 py-1.5 text-sm"
                rows={2}
                maxLength={500}
                placeholder="Why this amount is being credited"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Credit</span>
                <span className="font-semibold tabular-nums">{money(-(preview?.total ?? 0))}</span>
              </p>
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>Invoice after credit</span>
                <span className="tabular-nums">{money(preview?.netAfter ?? board.netInvoice)}</span>
              </p>
              {preview && !preview.ok && preview.code ? (
                <p className="text-xs text-amber-800">{preview.code}</p>
              ) : null}
              {preview?.creditBalance != null ? (
                <p className="text-xs text-amber-800">
                  This leaves a credit balance of {money(preview.creditBalance)}. A refund is separate.
                </p>
              ) : null}
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
              disabled={
                !canAuthorize ||
                issueMut.isPending ||
                items.length === 0 ||
                reason.trim().length === 0
              }
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
                      variant={viewNoteId === note.id ? "secondary" : "outline"}
                      className="mr-2 h-8"
                      onClick={() =>
                        setViewNoteId((current) => (current === note.id ? null : note.id))
                      }
                    >
                      {viewNoteId === note.id ? "Collapse" : "View"}
                    </Button>
                    {canAuthorize ? (
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
          <div className="border-t border-[#E8E1D7] p-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#F7F4EE] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-[#8a6a1f]" />
                <span className="text-sm font-medium">Viewing Credit Note {viewed.noteNumber}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-[#E8E1D7] bg-white text-xs hover:bg-[#F2ECE1]"
                onClick={() => setViewNoteId(null)}
              >
                <ChevronUp className="size-3.5" /> Collapse credit note
              </Button>
            </div>
            {guestInvoiceId ? (
              <CreditNoteFiscalSection
                restaurantId={restaurantId}
                creditNoteId={viewed.id}
                canRegister={fiscal.canRegister}
                canInspect={fiscal.canInspect}
                money={money}
              />
            ) : null}
            {accountInvoiceId && !guestInvoiceId ? (
              <CompanyCreditNoteFiscalSection
                restaurantId={restaurantId}
                creditNoteId={viewed.id}
                canRegister={fiscal.canRegister}
                canInspect={fiscal.canInspect}
                money={money}
              />
            ) : null}
            <CreditNoteDocument
              snapshot={viewed.snapshot}
              money={money}
              dateTime={dateTime}
              issuedAt={viewed.issuedAt}
              invoiceProperty={invoiceProperty}
              liveProperty={liveProperty}
            />
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-[#E8E1D7] bg-white text-xs hover:bg-[#F2ECE1]"
                onClick={() => setViewNoteId(null)}
              >
                <ChevronUp className="size-3.5" /> Collapse credit note
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <CashieringPrintLayer active={Boolean(printSnap)}>
        {printSnap ? (
          <CreditNoteDocument
            snapshot={printSnap}
            money={money}
            dateTime={dateTime}
            issuedAt={printIssuedAt ?? undefined}
            invoiceProperty={invoiceProperty}
            liveProperty={liveProperty}
          />
        ) : null}
      </CashieringPrintLayer>
    </section>
  );
}

function CreditNoteDocument({
  snapshot,
  money,
  dateTime,
  issuedAt,
  invoiceProperty,
  liveProperty,
}: {
  snapshot: CreditNoteSnapshot;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  issuedAt?: string;
  invoiceProperty?: CashieringDocumentProperty | null;
  liveProperty?: CashieringDocumentProperty | null;
}) {
  const currency = snapshot.currency || "ETB";
  const property = mergeCashieringDocumentProperty(
    snapshot.property ?? invoiceProperty,
    liveProperty ?? null,
  );

  return (
    <article
      className="space-y-6 rounded-xl border border-slate-100 bg-white p-6 font-sans text-slate-800 shadow-sm print:border-0 print:p-0 print:shadow-none"
      data-testid="credit-note-print"
    >
      {/* Top Header matching reference layout */}
      <header className="flex flex-wrap items-start justify-between gap-6 pb-2 border-b border-slate-100">
        <CashieringDocumentLetterhead property={property} />

        <div className="text-right space-y-1 sm:min-w-[220px]">
          <h1 className="text-xl font-extrabold tracking-tight text-[#0E2C6C] uppercase">
            CREDIT NOTE
          </h1>
          <div className="mt-2 space-y-0.5 text-xs text-slate-700">
            <p>
              <span className="font-semibold text-slate-500">Note No:</span>{" "}
              <span className="font-bold text-[#0E2C6C]">{snapshot.noteNumber || "Draft"}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Original Invoice:</span>{" "}
              <span className="font-semibold">{snapshot.originalInvoiceNumber ?? "—"}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Date:</span>{" "}
              <span>{dateTime(issuedAt)}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-500">Currency:</span>{" "}
              <span>{currency}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Bill To & Reason Block */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
        <div className="space-y-0.5">
          <p className="font-bold text-[#0E2C6C] uppercase tracking-wider text-[11px]">Bill To</p>
          <p className="text-sm font-bold text-slate-950">{snapshot.billToName}</p>
        </div>
        <div className="space-y-0.5">
          <p className="font-bold text-[#0E2C6C] uppercase tracking-wider text-[11px]">
            Reason for Credit
          </p>
          <p className="text-xs font-medium text-slate-800">{snapshot.reason}</p>
        </div>
      </section>

      {/* Table with Light Blue Header */}
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-[#EDF3FA] text-[#0E2C6C]">
            <tr>
              <th className="px-3 py-2 text-left font-bold">Description</th>
              <th className="px-3 py-2 text-right font-bold">Subtotal</th>
              <th className="px-3 py-2 text-right font-bold">Tax</th>
              <th className="px-3 py-2 text-right font-bold">Service</th>
              <th className="px-3 py-2 text-right font-bold">Credit Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF3FA]/70">
            {snapshot.groups.map((group) => (
              <tr
                key={`${group.description}-${group.creditGross}`}
                className="transition-colors hover:bg-slate-50/60"
              >
                <td className="px-3 py-2.5 text-slate-800">
                  <span className="font-medium text-slate-900 block">{group.description}</span>
                  {group.sourceGuest ? (
                    <span className="block text-[11px] text-slate-500">
                      {group.sourceGuest}
                      {group.sourceFolioNumber ? ` · Folio ${group.sourceFolioNumber}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {money(-group.subtotal)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {money(-group.tax)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {money(-group.serviceCharge)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-[#0E2C6C]">
                  {money(-group.creditGross)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <footer className="pt-2">
        <div className="ml-auto w-full sm:w-72 space-y-1.5 text-xs">
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-bold text-[#0E2C6C]">Subtotal Credit</span>
            <span className="tabular-nums font-semibold">{money(-snapshot.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-bold text-[#0E2C6C]">Tax Credit</span>
            <span className="tabular-nums font-semibold">{money(-snapshot.totals.tax)}</span>
          </div>
          {snapshot.totals.serviceCharge !== 0 ? (
            <div className="flex justify-between items-center text-slate-700">
              <span className="font-bold text-[#0E2C6C]">Service Credit</span>
              <span className="tabular-nums font-semibold">
                {money(-snapshot.totals.serviceCharge)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
            <span className="text-sm font-extrabold text-[#0E2C6C]">Total Credit</span>
            <span className="text-sm sm:text-base font-extrabold text-[#0E2C6C] tabular-nums">
              {money(-snapshot.totals.totalCredit)} {currency}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 text-slate-600 border-t border-slate-100">
            <span className="font-medium">Net Invoice Balance</span>
            <span className="tabular-nums font-semibold text-slate-900">
              {money(snapshot.totals.netInvoice)}
            </span>
          </div>
        </div>

        {/* Footer Notes and Sign-off */}
        <div className="mt-6 border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">
            Issued by: {snapshot.issuedByName ?? "Front Desk"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Credit note snapshot issued against invoice {snapshot.originalInvoiceNumber ?? "—"}.
          </p>
        </div>
      </footer>
    </article>
  );
}
