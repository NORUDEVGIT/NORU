import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  receiveCompanyInvoicePayment,
  receiveGuestInvoicePayment,
} from "@/packages/pms/lib/cashiering-invoice-payment.functions";
import {
  ACCOUNT_TENDER_METHODS,
  accountMethodLabel,
} from "@/packages/pms/lib/cashiering-account-payments";

type ReceiveTarget =
  | { lane: "guest"; restaurantId: string; folioId: string; invoiceId: string }
  | { lane: "company"; restaurantId: string; accountId: string; invoiceId: string };

export function InvoiceReceivePaymentDialog({
  open,
  onOpenChange,
  target,
  outstanding,
  currency,
  receivedFrom,
  canAllocateExisting,
  onSettled,
  onAllocateExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReceiveTarget;
  outstanding: number;
  currency: string;
  receivedFrom: string;
  canAllocateExisting: boolean;
  onSettled: () => Promise<void> | void;
  onAllocateExisting: (paymentId: string) => void;
}) {
  const receiveGuest = useServerFn(receiveGuestInvoicePayment);
  const receiveCompany = useServerFn(receiveCompanyInvoicePayment);
  const foundation = usePmsSet1Foundation(target.restaurantId);
  const guestMethods = useMemo(
    () =>
      cashieringTenderOptions({
        available: foundation.data?.polish1?.paymentMethodsAvailable ?? false,
        methods: foundation.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
      }),
    [foundation.data],
  );
  const methods =
    target.lane === "guest"
      ? guestMethods.map((method) => ({ value: method.code, label: method.name }))
      : ACCOUNT_TENDER_METHODS.map((method) => ({
          value: method,
          label: accountMethodLabel(method),
        }));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [payer, setPayer] = useState(receivedFrom);
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unallocatedPaymentId, setUnallocatedPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (unallocatedPaymentId) return;
    setAmount(outstanding.toFixed(2));
    setPayer(receivedFrom);
    setNote("");
    setError(null);
    setUnallocatedPaymentId(null);
    setIdempotencyKey(crypto.randomUUID());
  }, [open, outstanding, receivedFrom, unallocatedPaymentId]); // Method options may load after opening.

  useEffect(() => {
    if (open && !method && methods[0]?.value) setMethod(methods[0].value);
  }, [methods, method, open]);

  const submit = async () => {
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (paymentAmount > outstanding + 0.009) {
      setError(
        `Amount cannot exceed the invoice outstanding balance of ${currency} ${outstanding.toFixed(2)}. Use the general payment workflow for an overpayment.`,
      );
      return;
    }
    if (!method) {
      setError("Select a payment method.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const input = {
        restaurantId: target.restaurantId,
        parentId: target.lane === "guest" ? target.folioId : target.accountId,
        invoiceId: target.invoiceId,
        amount: paymentAmount,
        method,
        receivedFrom: payer.trim(),
        note: note.trim() || undefined,
        paymentIdempotencyKey: idempotencyKey,
      };
      const result =
        target.lane === "guest"
          ? await receiveGuest({ data: input })
          : await receiveCompany({ data: input });

      if (!result.ok) {
        setError(result.message);
        if (result.stage === "allocation" && result.paymentId) {
          setUnallocatedPaymentId(result.paymentId);
          toast.warning("Payment received. It is not allocated yet.");
          await onSettled();
        }
        return;
      }

      toast.success(
        result.replayed ? "Payment allocation completed." : "Payment received and allocated.",
      );
      setIdempotencyKey(crypto.randomUUID());
      await onSettled();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be received.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
          <DialogDescription>
            This payment will be posted and allocated to the current invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-payment-amount">Amount</Label>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="pl-3 text-sm text-muted-foreground">{currency}</span>
              <Input
                id="invoice-payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="border-0 shadow-none focus-visible:ring-0"
                data-testid="invoice-payment-amount"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum for this invoice: {currency} {outstanding.toFixed(2)}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="invoice-payment-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-payment-received-from">Received from</Label>
            <Input
              id="invoice-payment-received-from"
              value={payer}
              onChange={(event) => setPayer(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invoice-payment-note">Optional note</Label>
            <Textarea
              id="invoice-payment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>

          {error ? (
            <Alert variant={unallocatedPaymentId ? "default" : "destructive"}>
              <AlertTriangle className="size-4" />
              <AlertTitle>
                {unallocatedPaymentId
                  ? "Payment received. It is not allocated yet."
                  : "Payment failed"}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error}</p>
                {unallocatedPaymentId && canAllocateExisting ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      const paymentId = unallocatedPaymentId;
                      setUnallocatedPaymentId(null);
                      setIdempotencyKey(crypto.randomUUID());
                      onOpenChange(false);
                      onAllocateExisting(paymentId);
                    }}
                  >
                    <ArrowRightLeft className="size-3.5" />
                    Allocate Existing
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-[#146C43] text-white hover:bg-[#0E5232]"
          >
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {unallocatedPaymentId ? "Retry Allocation" : "Receive & Allocate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
