/**
 * Phase 8H6 — Standalone POS transaction detail, receipt reprint and refunds.
 *
 * Everything shown here is the snapshot stored when the sale completed, so a
 * later catalog edit never changes an old receipt. Completed sales are
 * immutable: the only correction is a refund, allocated to one of the sale's
 * own tenders and capped by the server.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer, Undo2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import { getPosSale, refundPosSale } from "@/lib/standalone-pos.functions";
import { STANDALONE_POS_MANAGE_ROLES } from "@/lib/module-access";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { ErrorNotice, PosHeader, ReadOnlyNotice } from "./pos-shared";
import { ReceiptView, tenderLabel } from "./receipt-view";

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  voided: "Voided",
  open: "Open",
};

type RefundResult = {
  reference: string | null;
  amount: number;
  reason: string | null;
  processedBy: string;
  processedAt: string;
  remaining: number;
  status: string;
};

export function StandalonePosTransactionDetail({
  membership,
  saleId,
}: {
  membership: RestaurantMembership;
  saleId: string;
}) {
  const restaurantId = membership.restaurant.id;
  const canRefund = (STANDALONE_POS_MANAGE_ROLES as readonly string[]).includes(membership.role);
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const qc = useQueryClient();

  const saleFn = useServerFn(getPosSale);
  const refundFn = useServerFn(refundPosSale);

  const sale = useQuery({
    queryKey: ["pos-sale", restaurantId, saleId],
    queryFn: () => saleFn({ data: { restaurantId, saleId } }),
  });

  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefundResult | null>(null);

  const data = sale.data;
  const selected = data?.payments.find((p) => p.id === paymentId) ?? null;

  const refund = useMutation({
    mutationFn: () =>
      refundFn({
        data: {
          restaurantId,
          saleId,
          paymentId,
          amount: Number(amount),
          reason: reason.trim() || null,
        },
      }),
    onSuccess: async (r) => {
      setError(null);
      setOpen(false);
      setResult({
        reference: r.reference,
        amount: r.amount,
        reason: r.reason,
        processedBy: r.processedBy,
        processedAt: r.processedAt,
        remaining: r.remaining,
        status: r.status,
      });
      setAmount("");
      setReason("");
      setPaymentId("");
      await qc.invalidateQueries({ queryKey: ["pos-sale", restaurantId, saleId] });
      await qc.invalidateQueries({ queryKey: ["pos-transactions"] });
      await qc.invalidateQueries({ queryKey: ["pos-shift-state", restaurantId] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That refund didn't go through."),
  });

  if (sale.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading sale…</p>;
  }
  if (!data) {
    return <ReadOnlyNotice>That sale could not be found for this property.</ReadOnlyNotice>;
  }

  const refundable = data.refundable;
  const canOfferRefund =
    canRefund && refundable > 0 && (data.status === "completed" || data.status === "partially_refunded");

  return (
    <div className="space-y-6">
      <PosHeader
        title={data.reference ?? "Sale"}
        crumb="Transactions"
        propertyName={membership.restaurant.name}
        description={`${STATUS_LABEL[data.status] ?? data.status} · ${data.registerName} · ${data.cashier}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/restaurant/pos/transactions">
                <ArrowLeft className="mr-2 size-4" /> All transactions
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" /> Reprint receipt
            </Button>
            {canOfferRefund ? (
              <Button
                onClick={() => {
                  const first = data.payments.find((p) => p.refundable > 0);
                  setPaymentId(first?.id ?? "");
                  setAmount(String(Math.min(refundable, first?.refundable ?? refundable).toFixed(2)));
                  setError(null);
                  setOpen(true);
                }}
              >
                <Undo2 className="mr-2 size-4" /> Refund
              </Button>
            ) : null}
          </>
        }
      />

      <ErrorNotice message={error} />

      {result ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Refund recorded</h2>
          <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <Fact label="Original receipt" value={result.reference ?? "—"} />
            <Fact label="Refund amount" value={money(result.amount)} />
            <Fact label="Reason" value={result.reason ?? "—"} />
            <Fact label="Processed by" value={result.processedBy} />
            <Fact label="Date and time" value={dateTime(result.processedAt)} />
            <Fact label="Still refundable" value={money(result.remaining)} />
            <Fact label="Sale is now" value={STATUS_LABEL[result.status] ?? result.status} />
          </dl>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" /> Print
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Dismiss
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg">Receipt</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Exactly as sold. Later catalog changes do not affect this receipt.
          </p>
          <ReceiptView
            receipt={{
              reference: data.reference,
              register: data.registerName,
              cashier: data.cashier,
              completedAt: data.completedAt,
              businessDate: data.businessDate,
              lines: data.items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.lineTotal,
              })),
              subtotal: data.subtotal,
              discountAmount: data.discountAmount,
              taxAmount: data.taxAmount,
              total: data.total,
              payments: data.payments
                .filter((p) => p.status !== "voided")
                .map((p) => ({ method: p.method, amount: p.amount, change: p.change })),
              refunds: data.refunds.map((r) => ({
                method: r.method,
                amount: r.amount,
                createdAt: r.createdAt,
              })),
            }}
          />
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="font-display text-lg">Original payments</h2>
            <ul className="mt-2 space-y-2">
              {data.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-4">
                  <span>
                    {tenderLabel(p.method)}
                    {p.status === "voided" ? " (voided)" : null}
                    <span className="block text-xs text-muted-foreground">
                      {dateTime(p.createdAt)} · {money(p.refundable)} still refundable
                    </span>
                  </span>
                  <span className="tabular-nums">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="font-display text-lg">Refunds</h2>
            {data.refunds.length === 0 ? (
              <p className="mt-2 text-muted-foreground">No refunds on this sale.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.refunds.map((r) => (
                  <li key={r.id} className="flex justify-between gap-4">
                    <span>
                      {tenderLabel(r.method)} refund
                      <span className="block text-xs text-muted-foreground">
                        {dateTime(r.createdAt)} · {r.processedBy}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums">−{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-border pt-3 font-medium">
              Still refundable <span className="tabular-nums">{money(refundable)}</span>
            </p>
            {!canRefund ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Only an owner or manager can refund a sale.
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund {data.reference}</DialogTitle>
            <DialogDescription>
              Money goes back on the payment it came in on. Cash refunds need your own cashier shift to be open.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Refund to</Label>
              <Select value={paymentId} onValueChange={setPaymentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a payment" />
                </SelectTrigger>
                <SelectContent>
                  {data.payments
                    .filter((p) => p.refundable > 0)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {tenderLabel(p.method)} {money(p.amount)} · {money(p.refundable)} refundable
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-refund-amount">Amount</Label>
              <Input
                id="pos-refund-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Up to {money(Math.min(refundable, selected?.refundable ?? refundable))} on this payment.{" "}
                {selected?.method === "card"
                  ? "A card refund here is an internal record only — no money is sent to a card network."
                  : null}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-refund-reason">Reason</Label>
              <Textarea
                id="pos-refund-reason"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being refunded?"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAmount(Math.min(refundable, selected?.refundable ?? refundable).toFixed(2))}
              >
                Full remaining amount
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => refund.mutate()}
              disabled={refund.isPending || !paymentId || !(Number(amount) > 0) || !reason.trim()}
            >
              {refund.isPending ? "Refunding…" : "Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
