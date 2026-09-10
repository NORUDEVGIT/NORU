import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import {
  canSubmitRefundConfirm,
  refundAllRemainingLines,
  selectedRefundAmount,
  tenderLabel,
  type RmRefundMethod,
} from "@/packages/restaurant-management/lib/rm-refunds";
import {
  getRefundSale,
  refundRestaurantRoomSale,
  refundRestaurantSale,
  type RefundSaleView,
} from "@/packages/restaurant-management/lib/rm-refunds.functions";

type Step = "lines" | "tender" | "reason" | "confirm";

export function RefundSaleFlow({
  restaurantId,
  orderId,
  open,
  onClose,
  onSuccess,
  money,
}: {
  restaurantId: string;
  orderId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const loadSale = useServerFn(getRefundSale);
  const refundSale = useServerFn(refundRestaurantSale);
  const refundRoom = useServerFn(refundRestaurantRoomSale);

  const sale = useQuery({
    queryKey: ["rm-refund-sale", restaurantId, orderId],
    queryFn: () => loadSale({ data: { restaurantId, orderId } }),
    enabled: open && Boolean(orderId),
    retry: false,
  });

  const [step, setStep] = useState<Step>("lines");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tenderId, setTenderId] = useState("");
  const [reason, setReason] = useState("");
  const [cardAck, setCardAck] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("lines");
      setQty({});
      setTenderId("");
      setReason("");
      setCardAck(false);
      setRoomError(null);
    }
  }, [open, orderId]);

  const view = sale.data ?? null;
  const selectedTender = view?.tenders.find((tender) => tender.id === tenderId) ?? null;

  const lineAmounts = useMemo(() => {
    if (!view) return [] as { id: string; quantity: number; amount: number }[];
    return view.lines
      .map((line) => {
        const quantity = Math.min(qty[line.id] ?? 0, line.remainingQuantity);
        if (quantity <= 0) return null;
        const unit = line.quantity > 0 ? line.lineTotal / line.quantity : line.unitPrice;
        return { id: line.id, quantity, amount: Math.round(unit * quantity * 100) / 100 };
      })
      .filter((row): row is { id: string; quantity: number; amount: number } => row !== null);
  }, [view, qty]);

  const amount = selectedRefundAmount(lineAmounts.map((line) => line.amount));
  const method: RmRefundMethod | null = selectedTender?.method ?? (view?.roomPosted ? "room" : null);
  const hasSelection = lineAmounts.length > 0;
  const tenderOk = view?.roomPosted ? true : Boolean(selectedTender && selectedTender.remaining + 0.001 >= amount);
  const confirmReady = canSubmitRefundConfirm({
    reason,
    amount,
    hasSelection,
    tenderSelected: tenderOk,
    cardAcknowledged: method === "card" ? cardAck : true,
    method,
    submitting: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!view) throw new Error("That restaurant sale could not be loaded.");
      if (view.roomPosted) {
        return refundRoom({ data: { restaurantId, orderId: view.orderId, reason: reason.trim() } });
      }
      if (!selectedTender || selectedTender.method === "room") {
        throw new Error("Choose a tender.");
      }
      return refundSale({
        data: {
          restaurantId,
          orderId: view.orderId,
          paymentId: selectedTender.id,
          amount,
          reason: reason.trim(),
          lines: lineAmounts.map((line) => ({
            orderItemId: line.id,
            quantity: line.quantity,
            amount: line.amount,
          })),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        if ("retry" in result && result.retry) {
          setRoomError(result.message);
          return;
        }
        toast.error(result.message);
        return;
      }
      setRoomError(null);
      toast.success("Refund recorded");
      void queryClient.invalidateQueries({ queryKey: ["rm-refund-sale", restaurantId, orderId] });
      void queryClient.invalidateQueries({ queryKey: ["rm-recent-paid", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["restaurant-order", restaurantId, orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-billing", restaurantId, orderId] });
      void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
      onSuccess();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function setLineQty(id: string, next: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, next) }));
  }

  function refundAll() {
    if (!view) return;
    const next: Record<string, number> = {};
    for (const line of view.lines) {
      next[line.id] = line.remainingQuantity;
    }
    setQty(next);
  }

  const remainingAll = view ? refundAllRemainingLines(view.lines).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Refund restaurant sale</DialogTitle>
          <DialogDescription>
            {view ? (
              <>
                Sale #{view.orderNumber} · {money(view.remaining)} still refundable
              </>
            ) : (
              "Load the restaurant sale, then choose lines, tender and a reason."
            )}
          </DialogDescription>
        </DialogHeader>

        {sale.isLoading ? <p className="text-sm text-muted-foreground">Loading restaurant sale…</p> : null}
        {sale.isError ? (
          <p className="text-sm text-destructive">{(sale.error as Error).message}</p>
        ) : null}

        {view && !view.canRefund ? (
          <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            You don&apos;t have permission to refund this restaurant sale, or nothing remains refundable.
          </p>
        ) : null}

        {view?.canRefund ? (
          <div className="space-y-4">
            <ol className="grid grid-cols-4 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {(["lines", "tender", "reason", "confirm"] as const).map((value) => (
                <li
                  key={value}
                  className={cn(
                    "rounded-full px-1 py-1",
                    step === value ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {value === "lines" ? "Lines" : value === "tender" ? "Tender" : value === "reason" ? "Reason" : "Confirm"}
                </li>
              ))}
            </ol>

            {step === "lines" ? (
              <div className="space-y-3">
                <Button type="button" variant="outline" className="h-12 w-full rounded-2xl" onClick={refundAll}>
                  Refund all remaining ({money(remainingAll)})
                </Button>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {view.lines.map((line) => (
                    <li key={line.id} className="rounded-2xl border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{line.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {line.remainingQuantity} of {line.quantity} left · {money(line.remainingAmount)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {money(((line.quantity > 0 ? line.lineTotal / line.quantity : 0) * (qty[line.id] ?? 0)))}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-11 rounded-xl"
                          aria-label={`Decrease ${line.name}`}
                          disabled={line.remainingQuantity <= 0}
                          onClick={() => setLineQty(line.id, (qty[line.id] ?? 0) - 1)}
                        >
                          <Minus className="size-5" />
                        </Button>
                        <span className="min-w-8 text-center text-base font-bold tabular-nums">
                          {qty[line.id] ?? 0}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-11 rounded-xl"
                          aria-label={`Increase ${line.name}`}
                          disabled={(qty[line.id] ?? 0) >= line.remainingQuantity}
                          onClick={() => setLineQty(line.id, (qty[line.id] ?? 0) + 1)}
                        >
                          <Plus className="size-5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Selected</span>
                  <span className="tabular-nums">{money(amount)}</span>
                </div>
                <Button
                  type="button"
                  className="h-14 w-full rounded-2xl text-base font-bold"
                  disabled={!hasSelection}
                  onClick={() => setStep("tender")}
                >
                  Next
                </Button>
              </div>
            ) : null}

            {step === "tender" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Choose the tender this refund goes back on. Remaining is shown per tender — it is not split
                  automatically.
                </p>
                {view.roomPosted ? (
                  <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                    This restaurant sale was charged to a room. Confirm will reverse the existing room charge.
                    If that reverse fails, nothing is refunded.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {view.tenders.map((tender) => (
                      <li key={tender.id}>
                        <button
                          type="button"
                          onClick={() => setTenderId(tender.id)}
                          className={cn(
                            "flex h-16 w-full items-center justify-between rounded-2xl border px-4 text-left",
                            tenderId === tender.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card",
                            tender.remaining <= 0 && "opacity-50",
                          )}
                          disabled={tender.remaining <= 0}
                        >
                          <span className="font-bold">{tenderLabel(tender.method)}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {money(tender.remaining)} remaining
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {method === "card" ? (
                  <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5"
                      checked={cardAck}
                      onChange={(event) => setCardAck(event.target.checked)}
                    />
                    <span>
                      Take the card refund on the terminal separately. NORU records this restaurant sale
                      refund only — it does not process the card.
                    </span>
                  </label>
                ) : null}
                {method === "cash" && view.hasOpenShift ? (
                  <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Hand {money(amount)} cash from the drawer. Expected drawer
                    {view.expectedCash == null ? "" : ` is now ${money(view.expectedCash)} and`} will be reduced
                    by this refund.
                  </p>
                ) : null}
                {method === "cash" && !view.hasOpenShift ? (
                  <p className="rounded-2xl border border-amber-600/30 bg-amber-500/10 p-4 text-sm">
                    No open cashier shift. This is a manager correction and will not adjust a drawer. Cashiers
                    cannot confirm a cash refund without an open shift.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={() => setStep("lines")}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    disabled={!tenderOk || (method === "card" && !cardAck)}
                    onClick={() => setStep("reason")}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "reason" ? (
              <div className="space-y-3">
                <Label htmlFor="rm-refund-reason">Reason</Label>
                <Textarea
                  id="rm-refund-reason"
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this restaurant sale being refunded?"
                  className="min-h-28 rounded-2xl text-base"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={() => setStep("tender")}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    disabled={reason.trim().length < 3}
                    onClick={() => setStep("confirm")}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "confirm" ? (
              <div className="space-y-3">
                <div className="space-y-1 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
                  <Row label="Restaurant sale" value={`#${view.orderNumber}`} />
                  <Row label="Amount" value={money(amount)} />
                  <Row label="Tender" value={method ? tenderLabel(method) : "—"} />
                  <Row label="Reason" value={reason.trim()} />
                </div>
                {roomError ? (
                  <div className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    <p>{roomError}</p>
                    <p>Nothing was refunded. Retry the room reverse, or cancel.</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 rounded-2xl"
                    onClick={() => setStep("reason")}
                    disabled={mutation.isPending}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-14 rounded-2xl text-base font-bold"
                    disabled={!confirmReady || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Refunding…" : roomError ? "Retry" : "Confirm refund"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function RefundHistory({
  history,
  money,
  dateTime,
}: {
  history: RefundSaleView["history"];
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Refund history</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No refunds on this restaurant sale.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {history.map((row) => (
            <li key={row.id} className="flex justify-between gap-4">
              <span>
                {tenderLabel(row.method)} refund
                <span className="block text-xs text-muted-foreground">
                  {dateTime(row.createdAt)}
                  {row.processedBy ? ` · ${row.processedBy}` : ""}
                  {row.noOpenShift ? " · no open shift" : ""}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
              </span>
              <span className="tabular-nums">−{money(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
