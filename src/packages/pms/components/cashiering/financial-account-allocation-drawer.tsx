import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  applyFinancialAccountPaymentAllocations,
  getFinancialAccountPaymentAllocationWorkspace,
  previewFinancialAccountPaymentAllocation,
  reverseFinancialAccountPaymentAllocation,
} from "@/packages/pms/lib/cashiering-account-allocation.functions";
import {
  accountMethodLabel,
  parsePositiveAmount,
} from "@/packages/pms/lib/cashiering-account-payments";
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

function refreshAllocation(
  queryClient: ReturnType<typeof useQueryClient>,
  restaurantId: string,
  accountId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["financial-account-payments", restaurantId, accountId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["financial-account-payment", restaurantId, accountId],
  });
  void queryClient.invalidateQueries({ queryKey: ["account-invoices", restaurantId, accountId] });
  void queryClient.invalidateQueries({
    queryKey: ["account-invoice-settlements", restaurantId, accountId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["account-invoice-settlement", restaurantId, accountId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["financial-account-history", restaurantId, accountId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["financial-account-allocation", restaurantId, accountId],
  });
}

export function AllocatePaymentDialog({
  open,
  restaurantId,
  accountId,
  paymentId,
  money,
  dateTime,
  onOpenChange,
  focusInvoiceId,
}: {
  open: boolean;
  restaurantId: string;
  accountId: string;
  paymentId: string | null;
  money: Money;
  dateTime: DateTime;
  onOpenChange: (open: boolean) => void;
  focusInvoiceId?: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getFinancialAccountPaymentAllocationWorkspace);
  const previewAllocation = useServerFn(previewFinancialAccountPaymentAllocation);
  const applyAllocation = useServerFn(applyFinancialAccountPaymentAllocations);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [key, setKey] = useState("");
  const workspaceQuery = useQuery({
    queryKey: ["financial-account-allocation", restaurantId, accountId, paymentId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, accountId, paymentId: paymentId! } }),
    enabled: open && Boolean(paymentId),
  });
  const workspace = workspaceQuery.data;

  useEffect(() => {
    if (!open) return;
    setAmounts({});
    setStep("edit");
    setKey(postingKey("alloc"));
  }, [open, paymentId]);

  useEffect(() => {
    if (!open || !focusInvoiceId || !workspace) return;
    const inv = workspace.invoices.find((i) => i.invoiceId === focusInvoiceId);
    if (inv) {
      const defaultAmt = Math.min(Number(workspace.payment.available), Number(inv.outstanding));
      if (defaultAmt > 0) {
        setAmounts((prev) => {
          if (prev[focusInvoiceId]) return prev;
          return { ...prev, [focusInvoiceId]: defaultAmt.toFixed(2) };
        });
      }
    }
  }, [open, focusInvoiceId, workspace]);

  const chosen = (workspace?.invoices ?? [])
    .map((invoice) => ({ invoice, amount: parsePositiveAmount(amounts[invoice.invoiceId] ?? "") }))
    .filter(
      (row): row is { invoice: (typeof row)["invoice"]; amount: number } => row.amount != null,
    );
  const clientTotal = Math.round(chosen.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;

  const previewMut = useMutation({
    mutationFn: () =>
      previewAllocation({
        data: {
          restaurantId,
          accountId,
          paymentId: paymentId!,
          targets: chosen.map((row) => ({ invoiceId: row.invoice.invoiceId, amount: row.amount })),
        },
      }),
    onSuccess: () => setStep("review"),
    onError: (error: Error) => toast.error(error.message),
  });
  const applyMut = useMutation({
    mutationFn: () => {
      const preview = previewMut.data;
      if (!preview || !paymentId) throw new Error("Review the allocation before confirming.");
      return applyAllocation({
        data: {
          restaurantId,
          accountId,
          paymentId,
          expectedPaymentAvailable: Number(preview.payment.available),
          idempotencyKey: key,
          targets: preview.targets.map((target) => ({
            invoiceId: target.invoiceId,
            amount: Number(target.proposed),
            expectedOutstanding: Number(target.outstanding),
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Payment allocated.");
      refreshAllocation(queryClient, restaurantId, accountId);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = previewMut.data;
  const overPayment = preview != null && Number(preview.remainingAvailable) < -0.01;
  const overInvoice =
    preview?.targets.some((target) => Number(target.remainingOutstanding) < -0.01) ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
        data-testid="allocate-payment"
      >
        <DialogHeader>
          <DialogTitle>{step === "review" ? "Review allocation" : "Allocate payment"}</DialogTitle>
          <DialogDescription>
            Choose the invoices and amounts. Nothing is allocated until you confirm.
          </DialogDescription>
        </DialogHeader>
        {!workspace ? (
          <p className="text-sm text-muted-foreground">Loading payment…</p>
        ) : step === "edit" ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-lg bg-[#F7F4EE] p-3 sm:grid-cols-4">
              <Stat label="Payment amount" value={money(workspace.payment.face)} />
              <Stat label="Refunded" value={money(workspace.payment.refunded)} />
              <Stat label="Already allocated" value={money(workspace.payment.allocated)} />
              <Stat label="Available" value={money(workspace.payment.available)} />
            </div>
            {workspace.invoices.length === 0 ? (
              <p className="text-muted-foreground">No issued invoice has an outstanding balance.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Issue date</th>
                      <th className="px-2 py-2 text-right">Effective net</th>
                      <th className="px-2 py-2 text-right">Allocated</th>
                      <th className="px-2 py-2 text-right">Outstanding</th>
                      <th className="px-2 py-2 text-right">Allocate amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.invoices.map((invoice) => {
                      const isFocused = invoice.invoiceId === focusInvoiceId;
                      return (
                        <tr
                          key={invoice.invoiceId}
                          className={cn(
                            "border-t border-[#E8E1D7] transition-colors",
                            isFocused ? "bg-[#FAF5EB] font-medium" : "",
                          )}
                        >
                          <td className="px-2 py-2 font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{invoice.number}</span>
                              {isFocused ? (
                                <span className="rounded bg-[#C89933]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#8A641A]">
                                  Current Invoice
                                </span>
                              ) : null}
                            </div>
                          </td>
                        <td className="px-2 py-2">{dateTime(invoice.issuedAt)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(invoice.effectiveNet)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(invoice.allocated)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(invoice.outstanding)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            value={amounts[invoice.invoiceId] ?? ""}
                            inputMode="decimal"
                            className="ml-auto h-8 w-28 text-right"
                            aria-label={`Allocate amount for ${invoice.number}`}
                            onChange={(event) =>
                              setAmounts((current) => ({
                                ...current,
                                [invoice.invoiceId]: event.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-between gap-3 rounded-lg border border-[#E8E1D7] px-3 py-2">
              <span>Total allocation</span>
              <span className="tabular-nums">{money(clientTotal)}</span>
            </div>
            <div className="flex justify-between gap-3 px-3 text-muted-foreground">
              <span>Payment remaining</span>
              <span className="tabular-nums">
                {money(Math.round((workspace.payment.available - clientTotal) * 100) / 100)}
              </span>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-3 text-sm">
            <p>
              Payment {dateTime(workspace.payment.postedAt)} ·{" "}
              {accountMethodLabel(workspace.payment.method)} · {money(Number(preview.payment.face))}
            </p>
            <ul className="space-y-1">
              {preview.targets.map((target) => (
                <li key={target.invoiceId} className="flex justify-between gap-3">
                  <span>{target.invoiceNumber}</span>
                  <span className="tabular-nums">{money(Number(target.proposed))}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-3 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{money(Number(preview.operationTotal))}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Remaining payment</span>
              <span className="tabular-nums">{money(Number(preview.remainingAvailable))}</span>
            </div>
            {overPayment || overInvoice ? (
              <p className="text-destructive">
                The allocation is more than the payment still has available or more than an invoice
                has outstanding.
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => (step === "review" ? setStep("edit") : onOpenChange(false))}
          >
            {step === "review" ? "Back" : "Cancel"}
          </Button>
          {step === "edit" ? (
            <Button
              disabled={chosen.length === 0 || previewMut.isPending || !workspace?.canAllocate}
              onClick={() => previewMut.mutate()}
            >
              Review allocation
            </Button>
          ) : (
            <Button
              disabled={applyMut.isPending || overPayment || overInvoice || !preview}
              onClick={() => applyMut.mutate()}
            >
              Confirm & allocate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseAllocationDialog({
  restaurantId,
  allocation,
  money,
  onOpenChange,
}: {
  restaurantId: string;
  allocation: {
    id: string;
    invoiceNumber: string;
    amount: number;
    activeAmount: number;
  } | null;
  money: Money;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const reverseAllocation = useServerFn(reverseFinancialAccountPaymentAllocation);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    setReason("");
    setKey(postingKey("allocrev"));
  }, [allocation?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!allocation || !reason.trim()) throw new Error("A reason is required.");
      return reverseAllocation({
        data: {
          restaurantId,
          allocationId: allocation.id,
          reason: reason.trim(),
          idempotencyKey: key,
        },
      });
    },
    onSuccess: () => {
      toast.success("Allocation reversed.");
      void queryClient.invalidateQueries({
        queryKey: ["financial-account-payments", restaurantId],
      });
      void queryClient.invalidateQueries({ queryKey: ["financial-account-payment", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["account-invoices", restaurantId] });
      void queryClient.invalidateQueries({
        queryKey: ["account-invoice-settlements", restaurantId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["account-invoice-settlement", restaurantId],
      });
      void queryClient.invalidateQueries({ queryKey: ["financial-account-history", restaurantId] });
      void queryClient.invalidateQueries({
        queryKey: ["financial-account-allocation", restaurantId],
      });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(allocation)} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reverse-allocation">
        <DialogHeader>
          <DialogTitle>Reverse allocation</DialogTitle>
          <DialogDescription>
            This reverses the full remaining amount. It does not refund the payment or change the
            account balance.
          </DialogDescription>
        </DialogHeader>
        {allocation ? (
          <div className="space-y-3 text-sm">
            <p>Invoice {allocation.invoiceNumber}</p>
            <p>Original allocation {money(allocation.amount)}</p>
            <p>Remaining active amount {money(allocation.activeAmount)}</p>
            <label className="block space-y-1">
              <span>Reason *</span>
              <Textarea
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || !reason.trim()} onClick={() => mutation.mutate()}>
            Confirm reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
