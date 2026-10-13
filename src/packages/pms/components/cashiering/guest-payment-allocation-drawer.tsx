import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { methodLabel } from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import { GuestSalesReceiptSection } from "@/packages/pms/components/cashiering/guest-sales-receipt-section";
import {
  applyGuestPaymentInvoiceAllocations,
  getGuestInvoiceSettlement,
  getGuestPaymentAllocationDetail,
  listGuestInvoiceSettlementForFolio,
  previewGuestPaymentInvoiceAllocation,
  reverseGuestPaymentInvoiceAllocation,
} from "@/packages/pms/lib/cashiering-guest-allocation.functions";
import {
  FOLIO_INVOICE_ALLOCATION_WARNING,
  folioSettledWithUnallocatedInvoices,
  guestSettlementLabel,
} from "@/packages/pms/lib/cashiering-guest-allocation";
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
import { Textarea } from "@/shared/components/ui/textarea";

type Money = (value: number) => string;
type DateTime = (iso: string | null | undefined) => string;

function postingKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function refreshGuestAllocation(
  queryClient: ReturnType<typeof useQueryClient>,
  restaurantId: string,
  folioId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["folio-workspace", restaurantId, folioId] });
  void queryClient.invalidateQueries({
    queryKey: ["guest-invoice-settlement", restaurantId, folioId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["guest-payment-allocation", restaurantId, folioId],
  });
  void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folioId] });
}

export function GuestInvoiceSettlementPanel({
  restaurantId,
  folioId,
  balance,
  money,
  dateTime,
  canAllocate,
  onAllocate,
}: {
  restaurantId: string;
  folioId: string;
  balance: number;
  money: Money;
  dateTime: DateTime;
  canAllocate: boolean;
  onAllocate: (invoiceId: string) => void;
}) {
  const fetchRows = useServerFn(listGuestInvoiceSettlementForFolio);
  const query = useQuery({
    queryKey: ["guest-invoice-settlement", restaurantId, folioId],
    queryFn: () => fetchRows({ data: { restaurantId, folioId } }),
  });
  const rows = (query.data ?? []).filter((row) => row.eligible);
  const warn = folioSettledWithUnallocatedInvoices(
    balance,
    rows.map((row) => row.outstanding ?? 0),
  );
  if (query.isLoading) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">Loading invoice settlement…</p>;
  }
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="guest-invoice-settlement">
      {warn ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {FOLIO_INVOICE_ALLOCATION_WARNING}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2 text-right">Effective net</th>
              <th className="px-3 py-2 text-right">Allocated</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Settlement</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invoiceId} className="border-t border-[#E8E1D7]">
                <td className="px-3 py-2">
                  <div className="font-medium">{row.number}</div>
                  <div className="text-xs text-muted-foreground">{dateTime(row.issuedAt)}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(row.effectiveNet ?? 0)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.allocated)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(row.outstanding ?? 0)}</td>
                <td className="px-3 py-2">
                  {row.settlementState ? guestSettlementLabel(row.settlementState) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {canAllocate && (row.outstanding ?? 0) > 0.01 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAllocate(row.invoiceId)}
                    >
                      Allocate
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GuestInvoiceSettlementDetail({
  restaurantId,
  folioId,
  invoiceId,
  legacy,
  money,
  dateTime,
  canManage = false,
}: {
  restaurantId: string;
  folioId: string;
  invoiceId: string;
  legacy: boolean;
  money: Money;
  dateTime: DateTime;
  canManage?: boolean;
}) {
  const fetchSettlement = useServerFn(getGuestInvoiceSettlement);
  const query = useQuery({
    queryKey: ["guest-invoice-settlement", restaurantId, folioId, invoiceId],
    queryFn: () => fetchSettlement({ data: { restaurantId, folioId, invoiceId } }),
    enabled: !legacy,
  });
  if (legacy) {
    return (
      <div className="mt-4 rounded-lg border border-[#E8E1D7] bg-[#F7F4EE] px-4 py-3 text-sm">
        <p className="font-medium">Legacy folio invoice</p>
        <p className="mt-1 text-muted-foreground">
          Payment allocation is unavailable for this legacy whole-folio invoice.
        </p>
      </div>
    );
  }
  const settlement = query.data?.settlement;
  if (!settlement?.eligible || settlement.effectiveNet == null) return null;
  return (
    <div
      className="mt-4 space-y-3 rounded-lg border border-[#E8E1D7] px-4 py-3 text-sm"
      data-testid="invoice-settlement-detail"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Settlement</p>
        <p>{settlement.settlementState ? guestSettlementLabel(settlement.settlementState) : "—"}</p>
      </div>
      <p className="text-xs text-muted-foreground">Document state: Issued</p>
      <dl className="grid grid-cols-2 gap-2">
        <div>Original invoice</div>
        <div className="text-right tabular-nums">{money(settlement.originalAmount ?? 0)}</div>
        <div>Credit notes</div>
        <div className="text-right tabular-nums">{money(settlement.creditNoteTotal)}</div>
        <div>Debit notes</div>
        <div className="text-right tabular-nums">{money(settlement.debitNoteTotal)}</div>
        <div>Effective net</div>
        <div className="text-right tabular-nums">{money(settlement.effectiveNet)}</div>
        <div>Allocated</div>
        <div className="text-right tabular-nums">{money(settlement.allocated)}</div>
        <div>Outstanding</div>
        <div className="text-right tabular-nums">{money(settlement.outstanding ?? 0)}</div>
      </dl>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payments
        </p>
        {(query.data?.payments ?? []).length === 0 ? (
          <p className="text-muted-foreground">No payment has been allocated to this invoice.</p>
        ) : (
          <ul className="space-y-1">
            {(query.data?.payments ?? []).map((payment) => (
              <li key={payment.id} className="flex justify-between gap-3">
                <span>
                  {dateTime(payment.postedAt)} · {methodLabel(payment.method)}
                  {payment.actor ? ` · ${payment.actor}` : ""}
                  {payment.reversed ? " · Reversed" : ""}
                </span>
                <span className="tabular-nums">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <GuestSalesReceiptSection
        restaurantId={restaurantId}
        invoiceId={invoiceId}
        canRegister={canManage}
        canInspect={canManage}
        money={money}
      />
    </div>
  );
}

export function GuestPaymentAllocationFacts({
  restaurantId,
  folioId,
  paymentId,
  money,
  dateTime,
  canReverse,
  onAllocate,
  canAllocate,
}: {
  restaurantId: string;
  folioId: string;
  paymentId: string;
  money: Money;
  dateTime: DateTime;
  canReverse: boolean;
  canAllocate: boolean;
  onAllocate: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getGuestPaymentAllocationDetail);
  const reverse = useServerFn(reverseGuestPaymentInvoiceAllocation);
  const query = useQuery({
    queryKey: ["guest-payment-allocation", restaurantId, folioId, paymentId],
    queryFn: () => fetchDetail({ data: { restaurantId, folioId, paymentId } }),
  });
  const [reason, setReason] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const detail = query.data;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("Choose an allocation to reverse.");
      if (reason.trim() === "") throw new Error("A reason is required.");
      return reverse({
        data: {
          restaurantId,
          allocationId: targetId,
          reason: reason.trim(),
          idempotencyKey: postingKey("grev"),
        },
      });
    },
    onSuccess: () => {
      toast.success("Allocation reversed");
      setTargetId(null);
      setReason("");
      refreshGuestAllocation(queryClient, restaurantId, folioId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!detail) return null;
  return (
    <div
      className="space-y-3 border-t border-[#E8E1D7] pt-3"
      data-testid="guest-payment-allocation-facts"
    >
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <div>Original payment</div>
        <div className="text-right tabular-nums">{money(detail.face)}</div>
        <div>Refunded</div>
        <div className="text-right tabular-nums">{money(detail.refunded)}</div>
        <div>Allocated</div>
        <div className="text-right tabular-nums">{money(detail.allocated)}</div>
        <div>Available</div>
        <div className="text-right tabular-nums">{money(detail.available)}</div>
      </dl>
      {detail.allocated > 0.009 ? (
        <p className="text-xs text-muted-foreground">
          Allocated amounts must be reversed before they can be refunded.
        </p>
      ) : null}
      {canAllocate && detail.available > 0.009 ? (
        <Button type="button" size="sm" variant="outline" onClick={onAllocate}>
          Allocate to invoice
        </Button>
      ) : null}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Invoice allocations
        </p>
        {detail.lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This payment is not allocated to an invoice.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.lines.map((line) => (
              <li key={line.id} className="rounded-md border border-[#E8E1D7] px-2 py-1.5">
                <div className="flex justify-between gap-2">
                  <span>{line.invoiceNumber}</span>
                  <span className="tabular-nums">{money(line.amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dateTime(line.allocatedAt)}
                  {line.actor ? ` · ${line.actor}` : ""}
                  {line.amount < 0 ? " · Reversal" : line.active ? " · Active" : " · Reversed"}
                </p>
                {line.reason ? (
                  <p className="text-xs text-muted-foreground">{line.reason}</p>
                ) : null}
                {canReverse && line.active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => setTargetId(line.id)}
                  >
                    Reverse allocation
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {targetId ? (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for reversing this allocation"
          />
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Reversing…" : "Confirm reversal"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function GuestPaymentAllocationDrawer({
  open,
  restaurantId,
  folioId,
  paymentId,
  payments = [],
  focusInvoiceId,
  money,
  dateTime,
  onOpenChange,
}: {
  open: boolean;
  restaurantId: string;
  folioId: string;
  paymentId: string | null;
  payments?: Array<{ id: string; label: string; available: number }>;
  focusInvoiceId: string | null;
  money: Money;
  dateTime: DateTime;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listGuestInvoiceSettlementForFolio);
  const fetchDetail = useServerFn(getGuestPaymentAllocationDetail);
  const preview = useServerFn(previewGuestPaymentInvoiceAllocation);
  const apply = useServerFn(applyGuestPaymentInvoiceAllocations);
  const [pickedPaymentId, setPickedPaymentId] = useState<string | null>(paymentId);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => postingKey("galloc"));
  const invoices = useQuery({
    queryKey: ["guest-invoice-settlement", restaurantId, folioId],
    queryFn: () => fetchRows({ data: { restaurantId, folioId } }),
    enabled: open,
  });
  const payment = useQuery({
    queryKey: ["guest-payment-allocation", restaurantId, folioId, pickedPaymentId],
    queryFn: () =>
      fetchDetail({ data: { restaurantId, folioId, paymentId: pickedPaymentId ?? "" } }),
    enabled: open && Boolean(pickedPaymentId),
  });
  const eligible = useMemo(
    () => (invoices.data ?? []).filter((row) => row.eligible && (row.outstanding ?? 0) > 0.01),
    [invoices.data],
  );

  useEffect(() => {
    if (!open) return;
    setAmounts({});
    setReview(null);
    setPickedPaymentId(paymentId);
    setIdempotencyKey(postingKey("galloc"));
  }, [open, paymentId]);

  const selected = eligible
    .map((row) => ({
      invoiceId: row.invoiceId,
      amount: Number(amounts[row.invoiceId] ?? ""),
    }))
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!pickedPaymentId) throw new Error("Choose a payment.");
      if (selected.length === 0) throw new Error("Enter an amount on at least one invoice.");
      return preview({
        data: { restaurantId, folioId, paymentId: pickedPaymentId, targets: selected },
      });
    },
    onSuccess: (result) => setReview(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!pickedPaymentId || !review) throw new Error("Review the allocation first.");
      return apply({
        data: {
          restaurantId,
          folioId,
          paymentId: pickedPaymentId,
          expectedPaymentAvailable: Number(review.payment.available),
          idempotencyKey,
          targets: review.targets.map((target) => ({
            invoiceId: target.invoiceId,
            amount: Number(target.proposed),
            expectedOutstanding: Number(target.outstanding),
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Payment allocated");
      refreshGuestAllocation(queryClient, restaurantId, folioId);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const detail = payment.data;
  const operationTotal = selected.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Allocate payment</DialogTitle>
          <DialogDescription>
            Classify this posted payment against issued invoices. The folio balance does not change.
          </DialogDescription>
        </DialogHeader>
        {!paymentId && payments.length > 0 ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Payment</span>
            <select
              className="h-9 w-full rounded-md border border-[#E8E1D7] bg-white px-2"
              value={pickedPaymentId ?? ""}
              onChange={(event) => {
                setPickedPaymentId(event.target.value || null);
                setReview(null);
              }}
            >
              <option value="">Choose a payment</option>
              {payments.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label} · available {money(row.available)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {detail ? (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="tabular-nums">{money(detail.face)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Refunded</p>
              <p className="tabular-nums">{money(detail.refunded)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Already allocated</p>
              <p className="tabular-nums">{money(detail.allocated)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="tabular-nums">{money(detail.available)}</p>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Choose a posted payment before allocating.
          </p>
        )}
        {!review ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Invoice no.</th>
                    <th className="py-2">Issued</th>
                    <th className="py-2 text-right">Effective net</th>
                    <th className="py-2 text-right">Allocated</th>
                    <th className="py-2 text-right">Outstanding</th>
                    <th className="py-2">Allocate amount</th>
                  </tr>
                </thead>
                <tbody>
                  {eligible.map((row) => (
                    <tr key={row.invoiceId} className="border-t border-[#E8E1D7]">
                      <td className="py-2 font-medium">{row.number}</td>
                      <td className="py-2">{dateTime(row.issuedAt)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {money(row.effectiveNet ?? 0)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{money(row.allocated)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {money(row.outstanding ?? 0)}
                      </td>
                      <td className="py-2">
                        <Input
                          inputMode="decimal"
                          value={amounts[row.invoiceId] ?? ""}
                          placeholder={row.invoiceId === focusInvoiceId ? "Amount" : ""}
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [row.invoiceId]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total allocation {money(operationTotal)}</span>
              <span>
                Remaining payment{" "}
                {money(Math.round(((detail?.available ?? 0) - operationTotal) * 100) / 100)}
              </span>
            </div>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p>Payment available {money(Number(review.payment.available))}</p>
            {review.targets.map((target) => (
              <p key={target.invoiceId}>
                {target.invoiceNumber}: outstanding {money(Number(target.outstanding))}, allocate{" "}
                {money(Number(target.proposed))}, remaining{" "}
                {money(Number(target.remainingOutstanding))}
              </p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {review ? (
            <>
              <Button type="button" variant="outline" onClick={() => setReview(null)}>
                Back
              </Button>
              <Button
                type="button"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? "Allocating…" : "Confirm & allocate"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={reviewMutation.isPending || !pickedPaymentId}
              onClick={() => reviewMutation.mutate()}
            >
              {reviewMutation.isPending ? "Reviewing…" : "Review allocation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
