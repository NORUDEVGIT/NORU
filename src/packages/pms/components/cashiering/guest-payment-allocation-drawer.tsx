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
import { cn } from "@/shared/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  CreditCard,
  FileText,
  Sparkles,
  X,
} from "lucide-react";

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
  void queryClient.invalidateQueries({ queryKey: ["guest-invoice-fiscal", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-sales-receipts", restaurantId] });
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
  canAllocate = false,
  canFiscalRegister = false,
  onAllocate,
}: {
  restaurantId: string;
  folioId: string;
  invoiceId: string;
  legacy: boolean;
  money: Money;
  dateTime: DateTime;
  canAllocate?: boolean | undefined;
  canFiscalRegister?: boolean | undefined;
  onAllocate?: ((invoiceId: string) => void) | undefined;
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
      className="mt-4 space-y-4 rounded-xl border border-[#E8E1D7] bg-white p-5 shadow-xs text-sm"
      data-testid="invoice-settlement-detail"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E1D7] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-[#251605]">Settlement Status</h4>
            {settlement.settlementState ? (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs font-semibold",
                  settlement.settlementState === "settled"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : settlement.settlementState === "partial"
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                      : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                {guestSettlementLabel(settlement.settlementState)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Document state: Issued</p>
        </div>

        {canAllocate && (settlement.outstanding ?? 0) > 0.01 && onAllocate ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onAllocate(invoiceId)}
            className="h-8 gap-1.5 bg-[#8A641A] text-white hover:bg-[#735315] text-xs font-semibold px-3 shadow-xs"
          >
            <ArrowRightLeft className="size-3.5" />
            <span>Allocate Payment</span>
          </Button>
        ) : null}
      </div>

      {/* 4-KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
          <p className="text-[11px] font-medium text-[#7A6B58]">Original Invoice</p>
          <p className="font-display text-base font-bold tabular-nums text-[#251605]">
            {money(settlement.originalAmount ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
          <p className="text-[11px] font-medium text-[#7A6B58]">Effective Net</p>
          <p className="font-display text-base font-bold tabular-nums text-[#251605]">
            {money(settlement.effectiveNet)}
          </p>
        </div>
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
          <p className="text-[11px] font-medium text-[#7A6B58]">Allocated Paid</p>
          <p className="font-display text-base font-bold tabular-nums text-emerald-700">
            {money(settlement.allocated)}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-[11px] font-medium text-amber-900">Outstanding</p>
          <p className="font-display text-base font-bold tabular-nums text-amber-950">
            {money(settlement.outstanding ?? 0)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-[#E8E1D7]/60 text-xs">
        <div className="flex justify-between py-2 text-[#7A6B58]">
          <span>Credit Notes Applied</span>
          <span className="tabular-nums font-medium text-[#251605]">
            {money(settlement.creditNoteTotal)}
          </span>
        </div>
        <div className="flex justify-between py-2 text-[#7A6B58]">
          <span>Debit Notes Applied</span>
          <span className="tabular-nums font-medium text-[#251605]">
            {money(settlement.debitNoteTotal)}
          </span>
        </div>
      </div>
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
        canRegister={canFiscalRegister}
        canInspect={canFiscalRegister}
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
  const remainingPayment = Math.round(((detail?.available ?? 0) - operationTotal) * 100) / 100;
  const isOverAllocated = remainingPayment < -0.001;

  const handleSetFull = (invoiceId: string, outstanding: number) => {
    const available = detail?.available ?? 0;
    const currentAllocatedToOthers = Object.entries(amounts).reduce((sum, [id, val]) => {
      if (id === invoiceId) return sum;
      const num = Number(val);
      return sum + (Number.isFinite(num) && num > 0 ? num : 0);
    }, 0);
    const maxPossible = Math.max(0, Math.round((available - currentAllocatedToOthers) * 100) / 100);
    const targetAmount = Math.min(outstanding, maxPossible);
    setAmounts((current) => ({
      ...current,
      [invoiceId]: targetAmount > 0 ? targetAmount.toFixed(2) : "",
    }));
  };

  const handleClear = (invoiceId: string) => {
    setAmounts((current) => {
      const next = { ...current };
      delete next[invoiceId];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-w-4xl overflow-hidden p-0 rounded-2xl border border-[#E8E1D7] bg-[#FAF8F5] shadow-2xl flex flex-col">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-[#E8E1D7] bg-white px-6 py-4">
          <div className="flex items-center gap-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E5DECE] bg-[#F4E9D0] text-[#765719] shadow-xs">
              <ArrowRightLeft className="size-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold tracking-tight text-[#251605]">
                Allocate Payment to Invoices
              </DialogTitle>
              <DialogDescription className="text-xs text-[#7A6B58] mt-0.5">
                Classify posted payment funds against eligible issued invoices. Total folio balance
                remains unaffected.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FAF8F5]">
          {/* Payment Selection if not pre-bound */}
          {!paymentId && payments.length > 0 ? (
            <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                Select Posted Payment
              </label>
              <select
                className="h-10 w-full rounded-lg border border-[#DDD4C5] bg-white px-3 text-sm text-[#251605] shadow-2xs focus:border-[#C89933] focus:outline-none focus:ring-2 focus:ring-[#C89933]/20"
                value={pickedPaymentId ?? ""}
                onChange={(event) => {
                  setPickedPaymentId(event.target.value || null);
                  setReview(null);
                }}
              >
                <option value="">Choose a payment to allocate</option>
                {payments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} · Available {money(row.available)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Payment Metrics Strip */}
          {detail ? (
            <div className="rounded-xl border border-[#E8E1D7] bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  <CreditCard className="size-3.5 text-[#8a6a1f]" /> Payment Balance Details
                </span>
                <span className="rounded-md border border-[#E8E1D7] bg-[#F7F4EE] px-2 py-0.5 text-xs font-medium text-[#7A6B58]">
                  {payment.data?.lines?.length ?? 0} previous{" "}
                  {payment.data?.lines?.length === 1 ? "allocation" : "allocations"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#8A7968]">
                    Face Amount
                  </p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-[#251605]">
                    {money(detail.face)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#8A7968]">
                    Refunded
                  </p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-[#7A6B58]">
                    {money(detail.refunded)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F5] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#8A7968]">
                    Already Allocated
                  </p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-blue-900">
                    {money(detail.allocated)}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-3 shadow-xs">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                    Available to Allocate
                  </p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-emerald-950">
                    {money(detail.available)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white p-6 text-center text-sm text-[#7A6B58]">
              Please choose a posted payment before allocating funds.
            </div>
          )}

          {/* Allocation Stage vs Review Stage */}
          {!review ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Outstanding Issued Invoices ({eligible.length})
                </h4>
                <p className="text-xs text-[#7A6B58]">
                  Use the <span className="font-semibold text-[#8A641A]">Max</span> button to
                  quickly allocate up to the remaining amount.
                </p>
              </div>

              {eligible.length === 0 ? (
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-8 text-center text-sm text-[#7A6B58]">
                  <CheckCircle2 className="mx-auto size-8 text-emerald-600 mb-2 opacity-80" />
                  <p className="font-semibold text-[#251605]">All invoices are fully settled</p>
                  <p className="mt-1 text-xs">
                    There are no outstanding eligible invoices on this folio.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#E8E1D7] bg-white shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-semibold uppercase tracking-wider text-[#7A6B58]">
                        <tr>
                          <th className="px-4 py-3">Invoice Number</th>
                          <th className="px-3 py-3">Issued Date</th>
                          <th className="px-3 py-3 text-right">Effective Net</th>
                          <th className="px-3 py-3 text-right">Allocated</th>
                          <th className="px-3 py-3 text-right">Outstanding</th>
                          <th className="px-4 py-3 w-56 text-right">Allocation Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E1D7]/70 text-xs">
                        {eligible.map((row) => {
                          const isFocused = row.invoiceId === focusInvoiceId;
                          const currentVal = amounts[row.invoiceId] ?? "";
                          const currentNum = Number(currentVal);
                          const hasVal = Number.isFinite(currentNum) && currentNum > 0;
                          const isFullyCovered =
                            hasVal && Math.abs(currentNum - (row.outstanding ?? 0)) < 0.01;

                          return (
                            <tr
                              key={row.invoiceId}
                              className={cn(
                                "transition-colors hover:bg-[#FAF8F5]",
                                isFocused && "bg-[#FAF7EE] ring-1 ring-inset ring-[#C89933]/30",
                              )}
                            >
                              <td className="px-4 py-3 font-semibold text-[#251605]">
                                <div className="flex items-center gap-1.5">
                                  <span>{row.number}</span>
                                  {isFocused ? (
                                    <span className="rounded-md bg-[#C89933]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                                      Target
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-[#7A6B58]">{dateTime(row.issuedAt)}</td>
                              <td className="px-3 py-3 text-right font-medium tabular-nums text-[#251605]">
                                {money(row.effectiveNet ?? 0)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-[#7A6B58]">
                                {money(row.allocated)}
                              </td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums text-[#8A641A]">
                                {money(row.outstanding ?? 0)}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="relative">
                                    <Input
                                      inputMode="decimal"
                                      value={currentVal}
                                      placeholder="0.00"
                                      className={cn(
                                        "h-8 w-28 text-right tabular-nums font-semibold pr-6 text-xs border-[#DDD4C5] focus-visible:ring-1 focus-visible:ring-[#C89933]",
                                        hasVal && "border-[#C89933] bg-[#C89933]/5 text-[#251605]",
                                      )}
                                      onChange={(event) =>
                                        setAmounts((current) => ({
                                          ...current,
                                          [row.invoiceId]: event.target.value,
                                        }))
                                      }
                                    />
                                    {hasVal ? (
                                      <button
                                        type="button"
                                        onClick={() => handleClear(row.invoiceId)}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        title="Clear amount"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    ) : null}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleSetFull(row.invoiceId, row.outstanding ?? 0)
                                    }
                                    className={cn(
                                      "h-8 px-2.5 text-[11px] font-semibold transition-all border-[#DDD4C5]",
                                      isFullyCovered
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                        : "bg-white text-[#765719] hover:bg-[#F4E9D0]/50 hover:border-[#C89933]",
                                    )}
                                    title="Fill with remaining payment or full outstanding"
                                  >
                                    {isFullyCovered ? "Full ✓" : "Max"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Live Allocation Summary Banner */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-xs transition-colors",
                  isOverAllocated
                    ? "border-red-300 bg-red-50 text-red-950"
                    : "border-[#E8E1D7] bg-white text-[#251605]",
                )}
              >
                <div className="flex items-center gap-2">
                  {isOverAllocated ? (
                    <AlertCircle className="size-4 shrink-0 text-red-600" />
                  ) : (
                    <Sparkles className="size-4 shrink-0 text-[#8a6a1f]" />
                  )}
                  <div className="text-xs">
                    <span className="font-semibold">
                      {selected.length} {selected.length === 1 ? "invoice" : "invoices"} selected
                    </span>
                    {isOverAllocated ? (
                      <span className="ml-2 font-semibold text-red-600">
                        (Allocated amount exceeds available payment!)
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <div>
                    <span className="text-[#8A7968] mr-1.5">Total Allocation:</span>
                    <span className="font-bold text-sm text-[#251605]">
                      {money(operationTotal)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-[#E8E1D7]" />
                  <div>
                    <span className="text-[#8A7968] mr-1.5">Remaining Payment:</span>
                    <span
                      className={cn(
                        "font-bold text-sm",
                        isOverAllocated ? "text-red-600" : "text-emerald-800",
                      )}
                    >
                      {money(remainingPayment)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Review & Confirmation Step */
            <div className="space-y-4">
              <div className="rounded-xl border border-[#C89933]/40 bg-[#FAF7EE] p-4 text-xs text-[#765719] shadow-xs">
                <p className="font-semibold text-sm text-[#251605]">
                  Please review allocation changes before confirming
                </p>
                <p className="mt-1 text-[#7A6B58]">
                  The allocated amounts will be bound to each selected invoice and update its
                  settlement status.
                </p>
              </div>

              {/* Review Breakdown Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-xs">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#8A7968]">
                    Pre-Allocation Balance
                  </p>
                  <p className="mt-1 font-display text-base font-bold tabular-nums text-[#251605]">
                    {money(Number(review.payment.available))}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-xs">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#8A7968]">
                    Total Being Applied
                  </p>
                  <p className="mt-1 font-display text-base font-bold tabular-nums text-[#8A641A]">
                    {money(operationTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 shadow-xs">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                    Remaining Payment Balance
                  </p>
                  <p className="mt-1 font-display text-base font-bold tabular-nums text-emerald-950">
                    {money(Number(review.payment.available) - operationTotal)}
                  </p>
                </div>
              </div>

              {/* Target Invoices Breakdown Table */}
              <div className="overflow-hidden rounded-xl border border-[#E8E1D7] bg-white shadow-xs">
                <table className="w-full text-xs">
                  <thead className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-[11px] font-semibold uppercase tracking-wider text-[#7A6B58]">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-3 py-3 text-right">Current Outstanding</th>
                      <th className="px-3 py-3 text-right text-[#8A641A]">Amount to Apply</th>
                      <th className="px-4 py-3 text-right">New Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E1D7]/70">
                    {review.targets.map((target) => {
                      const remaining = Number(target.remainingOutstanding);
                      const isSettled = remaining < 0.01;
                      return (
                        <tr key={target.invoiceId} className="hover:bg-[#FAF8F5]">
                          <td className="px-4 py-3 font-semibold text-[#251605]">
                            {target.invoiceNumber}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-[#7A6B58]">
                            {money(Number(target.outstanding))}
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-800">
                            +{money(Number(target.proposed))}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                isSettled ? "text-emerald-700" : "text-[#251605]",
                              )}
                            >
                              {money(remaining)}
                              {isSettled ? (
                                <span className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                                  Fully Settled ✓
                                </span>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-[#E8E1D7] bg-white px-6 py-3.5 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[#DDD4C5] text-xs font-medium"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {review ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReview(null)}
                  className="border-[#DDD4C5] text-xs font-medium"
                >
                  Back to Edit
                </Button>
                <Button
                  type="button"
                  disabled={applyMutation.isPending}
                  onClick={() => applyMutation.mutate()}
                  className="h-9 gap-1.5 bg-[#8A641A] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#735315]"
                >
                  <CheckCircle2 className="size-3.5" />
                  {applyMutation.isPending ? "Allocating…" : "Confirm & Allocate"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={
                  reviewMutation.isPending ||
                  !pickedPaymentId ||
                  selected.length === 0 ||
                  isOverAllocated
                }
                onClick={() => reviewMutation.mutate()}
                className="h-9 gap-1.5 bg-[#8A641A] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#735315]"
              >
                <span>{reviewMutation.isPending ? "Calculating…" : "Review Allocation"}</span>
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
