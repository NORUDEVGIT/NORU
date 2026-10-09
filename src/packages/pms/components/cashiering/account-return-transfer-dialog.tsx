import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { listFolios, type FolioRow } from "@/packages/pms/lib/cashiering.functions";
import {
  listFinancialAccountCharges,
  postCrossLedgerTransfer,
  type FinancialAccountChargeRow,
  type FinancialAccountRow,
} from "@/packages/pms/lib/cashiering-phases.functions";
import { getFinancialAccountInvoiceBoard } from "@/packages/pms/lib/cashiering-account-invoices.functions";
import {
  chargeGroupRemainder,
  correctableGroupRemainder,
} from "@/packages/pms/lib/cashiering-transfer-allocate";
import { CorrectChargeDialog } from "@/packages/pms/components/cashiering/correct-charge-dialog";
import { roundFolioMoney } from "@/packages/pms/lib/folio-workspace";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

function idempotencyKey(): string {
  return `xacct-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function AccountReturnTransferDialog({
  restaurantId,
  account,
  open,
  onClose,
  onDone,
  money,
}: {
  restaurantId: string;
  account: FinancialAccountRow | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  money: (value: number) => string;
}) {
  const fetchCharges = useServerFn(listFinancialAccountCharges);
  const fetchBoard = useServerFn(getFinancialAccountInvoiceBoard);
  const fetchFolios = useServerFn(listFolios);
  const post = useServerFn(postCrossLedgerTransfer);
  const [sourceId, setSourceId] = useState("");
  const [search, setSearch] = useState("");
  const [folioId, setFolioId] = useState("");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partial, setPartial] = useState("");
  const [reason, setReason] = useState("");
  const [idemKey, setIdemKey] = useState(idempotencyKey);
  const [correctId, setCorrectId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSourceId("");
    setSearch("");
    setFolioId("");
    setMode("full");
    setPartial("");
    setReason("");
    setIdemKey(idempotencyKey());
    setCorrectId(null);
  }, [open, account?.id]);

  const chargesQuery = useQuery({
    queryKey: ["financial-account-charges", restaurantId, account?.id],
    queryFn: () => fetchCharges({ data: { restaurantId, accountId: account?.id ?? "" } }),
    enabled: open && Boolean(account),
    retry: false,
  });
  const boardQuery = useQuery({
    queryKey: ["account-invoice-board", restaurantId, account?.id],
    queryFn: () => fetchBoard({ data: { restaurantId, accountId: account?.id ?? "" } }),
    enabled: open && Boolean(account),
    retry: false,
  });
  const invoicedIds = new Set(
    (boardQuery.data?.groups ?? [])
      .filter((group) => group.invoiceState === "invoiced")
      .flatMap((group) => [group.sourceGroupId, ...group.ledgerIds]),
  );
  const rows = (chargesQuery.data ?? []) as FinancialAccountChargeRow[];
  const ledger = rows.map((row) => ({
    id: row.id,
    type: row.type,
    category: row.category,
    amount: row.amount,
    originalTransactionId: row.originalTransactionId,
  }));
  const sources = rows
    .filter(
      (row) => row.type === "charge" && row.category !== "tax" && row.category !== "service_charge",
    )
    .map((row) => ({
      row,
      remainder: chargeGroupRemainder(row.id, ledger),
      invoiced: invoicedIds.has(row.id),
    }))
    .filter((entry) => entry.remainder.grossRemaining > 0.009 || entry.invoiced);
  const selected =
    sources.find((entry) => entry.row.id === sourceId && !entry.invoiced) ??
    sources.find((entry) => !entry.invoiced) ??
    null;
  const gross = selected?.remainder.grossRemaining ?? 0;
  const parsedPartial = Number(partial);
  const transferAmount = mode === "full" ? gross : parsedPartial;
  const amountValid =
    Number.isFinite(transferAmount) && transferAmount > 0 && transferAmount <= gross + 0.001;

  const foliosQuery = useQuery({
    queryKey: ["account-return-folios", restaurantId, search],
    queryFn: () => fetchFolios({ data: { restaurantId, status: "open", search } }),
    enabled: open,
    retry: false,
  });
  const folios = ((foliosQuery.data ?? []) as FolioRow[]).filter(
    (row) => row.status === "open" && row.currency === account?.currency,
  );
  const destination = folios.find((row) => row.id === folioId) ?? null;
  const incoming = rows.filter((row) => row.type === "transfer_in");
  const correctable = rows
    .filter(
      (row) => row.type === "charge" && row.category !== "tax" && row.category !== "service_charge",
    )
    .map((row) => ({ row, remainder: correctableGroupRemainder(row.id, ledger) }))
    .filter((entry) => entry.remainder.grossRemaining > 0.009);
  const correctRow = correctable.find((entry) => entry.row.id === correctId)?.row ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!account || !selected) throw new Error("Choose a charge to transfer.");
      if (!destination) throw new Error("Choose an open guest folio.");
      if (!amountValid) throw new Error("Enter an amount within the remaining transferable total.");
      if (!reason.trim()) throw new Error("Enter a reason.");
      return post({
        data: {
          restaurantId,
          sourceType: "financial_account",
          sourceId: account.id,
          sourceTransactionId: selected.row.id,
          destinationType: "guest_folio",
          destinationId: destination.id,
          amount: roundFolioMoney(transferAmount),
          description: reason.trim(),
          idempotencyKey: idemKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Transfer posted");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const projected =
    account && destination && amountValid
      ? {
          account: roundFolioMoney(account.balance - transferAmount),
          folio: roundFolioMoney(destination.balance + transferAmount),
        }
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
        <DialogContent className="flex max-h-[88vh] max-w-[760px] flex-col gap-0 overflow-hidden border-[#E8E1D7] bg-[#fbf8f3] p-0">
          <DialogHeader className="space-y-1 border-b border-[#E8E1D7] bg-card px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="size-4 text-[#8a6a1f]" />
              Transfer to guest folio
            </DialogTitle>
            <DialogDescription>
              {account ? `${account.masterName} · ${account.accountNumber}` : "Financial account"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section className="rounded-xl border border-[#E8E1D7] bg-card p-4">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Account charges
              </h3>
              {incoming.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {incoming.map((row) => (
                    <li key={row.id}>
                      Transfer in · {row.sourceDescription ?? row.description}
                      {row.departmentName ? ` · ${row.departmentName}` : ""}
                      {row.quantity != null && row.unitAmount != null
                        ? ` · ${row.quantity} × ${money(row.unitAmount)}`
                        : ""}
                      {invoicedIds.has(row.id) || invoicedIds.has(row.originalTransactionId ?? "")
                        ? " · Invoiced"
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 space-y-2">
                {sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transferable charge remains.</p>
                ) : (
                  sources.map((entry) => (
                    <div
                      key={entry.row.id}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm",
                        selected?.row.id === entry.row.id ? "border-[#C89933]" : "border-[#E8E1D7]",
                      )}
                    >
                      <button
                        type="button"
                        className="block w-full text-left"
                        disabled={entry.invoiced}
                        onClick={() => setSourceId(entry.row.id)}
                      >
                        <span className="font-medium">{entry.row.description}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {entry.invoiced
                            ? "This charge is part of an issued invoice. Use a credit note to correct it."
                            : `Remaining ${money(entry.remainder.grossRemaining)}`}
                        </span>
                      </button>
                      {!entry.invoiced && correctable.some((item) => item.row.id === entry.row.id) ? (
                        <span className="mt-2 block">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setCorrectId(entry.row.id);
                            }}
                          >
                            Correct Charge
                          </Button>
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="rounded-xl border border-[#E8E1D7] bg-card p-4">
              <Label htmlFor="account-return-search">Guest folio</Label>
              <Input
                id="account-return-search"
                className="mt-2"
                value={search}
                placeholder="Search folio, guest, room or reservation..."
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                {folios.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm",
                      folioId === row.id ? "border-[#C89933]" : "border-[#E8E1D7]",
                    )}
                    onClick={() => setFolioId(row.id)}
                  >
                    <span className="font-medium">{row.guestName}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.folioNumber}
                      {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                      {row.confirmationNumber ? ` · ${row.confirmationNumber}` : ""} ·{" "}
                      {money(row.balance)} {row.currency}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />
                  Full amount <span className="tabular-nums">{money(gross)}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "partial"}
                    onChange={() => setMode("partial")}
                  />
                  Partial amount
                </label>
                {mode === "partial" ? (
                  <Input
                    inputMode="decimal"
                    value={partial}
                    placeholder="0.00"
                    onChange={(event) => setPartial(event.target.value)}
                  />
                ) : null}
              </div>
              <div className="mt-3">
                <Label htmlFor="account-return-reason">Reason *</Label>
                <Textarea
                  id="account-return-reason"
                  className="mt-1.5"
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              {projected && account ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {account.accountNumber} {money(account.balance)} → {money(projected.account)}
                  {" · "}
                  {destination?.folioNumber} {money(destination?.balance ?? 0)} →{" "}
                  {money(projected.folio)}
                </p>
              ) : null}
            </section>
          </div>
          <DialogFooter className="border-t border-[#E8E1D7] bg-card px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
              disabled={
                !selected || !destination || !reason.trim() || !amountValid || mutation.isPending
              }
              onClick={() => mutation.mutate()}
            >
              Transfer Charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CorrectChargeDialog
        restaurantId={restaurantId}
        sourceTransactionId={correctRow?.id ?? null}
        title={correctRow?.description ?? "Charge"}
        department={correctRow?.departmentName ?? null}
        quantity={correctRow?.quantity ?? null}
        unitAmount={correctRow?.unitAmount ?? null}
        open={correctRow != null}
        allowReplacement={false}
        onClose={() => setCorrectId(null)}
        onDone={() => {
          void chargesQuery.refetch();
          onDone();
        }}
        money={money}
      />
    </>
  );
}
