import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import { closeFolio, postFolioEntry } from "@/packages/pms/lib/cashiering.functions";
import {
  remainingOnPaymentSource,
  type TransactionType,
} from "@/packages/pms/lib/cashiering.server";
import { useMoney } from "@/core/state/property-format";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";

const LEDGER_LINE = "This records a ledger line on the guest folio.";

const COPY: Record<TransactionType, { title: string; description: string; cta: string }> = {
  charge: {
    title: "Post a charge",
    description: `${LEDGER_LINE} No tax amount is added.`,
    cta: "Post charge",
  },
  payment: {
    title: "Receive a payment",
    description: `${LEDGER_LINE} Partial payments are additional payment lines.`,
    cta: "Receive payment",
  },
  deposit: {
    title: "Add a deposit credit",
    description: `${LEDGER_LINE} A deposit is a folio credit.`,
    cta: "Add deposit credit",
  },
  refund: {
    title: "Post a refund",
    description: `${LEDGER_LINE} A refund cannot exceed the remaining amount on the selected payment.`,
    cta: "Post refund",
  },
  adjustment: {
    title: "Post an adjustment",
    description: `${LEDGER_LINE} Use a negative amount to reduce the balance.`,
    cta: "Post adjustment",
  },
  discount: {
    title: "Post a discount",
    description: `${LEDGER_LINE} A discount reduces what the guest owes.`,
    cta: "Post discount",
  },
};

export function FolioEntryDialog({
  restaurantId,
  folioId,
  type,
  open,
  sources,
  depositPolicySummary,
  authorizerNote,
  thresholdNote,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  type: TransactionType | null;
  open: boolean;
  sources: Array<{
    id: string;
    type: string;
    description: string;
    amount: number;
    originalTransactionId: string | null;
  }>;
  depositPolicySummary?: string | null;
  authorizerNote?: string | null;
  thresholdNote?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [sourceId, setSourceId] = useState("none");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });

  useEffect(() => {
    if (!tenders.some((row) => row.code === method)) {
      setMethod(tenders[0]?.code ?? "");
    }
  }, [tenders, method]);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setSourceId("none");
    }
  }, [open, type]);

  const post = useServerFn(postFolioEntry);
  const copy = type ? COPY[type] : null;
  const needsMethod = type === "payment" || type === "deposit" || type === "refund";
  const needsSource = type === "refund" || type === "adjustment" || type === "discount";
  const sourceChoices = useMemo(() => {
    if (type === "refund")
      return sources.filter((line) => line.type === "payment" || line.type === "deposit");
    if (type === "discount") return sources.filter((line) => line.type === "charge");
    return sources;
  }, [sources, type]);
  const selectedSource = sourceChoices.find((line) => line.id === sourceId) ?? null;
  const refundRemaining =
    type === "refund" && selectedSource ? remainingOnPaymentSource(selectedSource, sources) : null;

  useEffect(() => {
    if (!needsSource) return;
    if (sourceChoices.some((line) => line.id === sourceId)) return;
    setSourceId(sourceChoices[0]?.id ?? "none");
  }, [needsSource, sourceChoices, sourceId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!type) throw new Error("Pick a transaction type.");
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) throw new Error("Enter an amount.");
      if (type !== "adjustment" && value <= 0)
        throw new Error("Enter an amount greater than zero.");
      if (description.trim() === "")
        throw new Error(needsSource ? "Enter a reason." : "Enter a description.");
      if (needsSource && !sourceChoices.some((line) => line.id === sourceId)) {
        throw new Error("Choose the folio line this corrects.");
      }
      return post({
        data: {
          restaurantId,
          folioId,
          type,
          amount: value,
          description: description.trim(),
          idempotencyKey,
          ...(needsMethod ? { method } : {}),
          ...(needsSource && sourceId !== "none" ? { originalTransactionId: sourceId } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Posted to folio");
      setAmount("");
      setDescription("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open && type !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {type === "deposit" && depositPolicySummary ? (
            <p className="text-sm text-muted-foreground">{depositPolicySummary}</p>
          ) : null}
          <div>
            <Label htmlFor="entry-amount">Amount</Label>
            <Input
              id="entry-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="entry-description">{needsSource ? "Reason" : "Description"}</Label>
            <Input
              id="entry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                needsSource
                  ? "Why this correction is posted"
                  : type === "charge"
                    ? "Laundry service"
                    : "Reference or note"
              }
            />
          </div>
          {needsMethod ? (
            <div>
              <Label htmlFor="entry-method">Method</Label>
              {tenders.length === 0 ? (
                <p className="text-sm text-[#C89933]">
                  No active payment methods. Configure accepted tenders in{" "}
                  <a href={POLISH1_PAYMENT_METHODS_HREF} className="font-medium underline">
                    Payment methods
                  </a>
                  .
                </p>
              ) : (
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="entry-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tenders.map((row) => (
                      <SelectItem key={row.code} value={row.code}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}
          {needsSource ? (
            <div>
              <Label htmlFor="entry-source">Source line</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="entry-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceChoices.map((line) => (
                    <SelectItem key={line.id} value={line.id}>
                      {labelTransactionType(line.type)} · {line.description} · {money(line.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sourceChoices.length === 0 ? (
                <p className="mt-1 text-sm text-destructive">
                  This folio has no line that can be corrected this way.
                </p>
              ) : null}
              {selectedSource ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Original line: {labelTransactionType(selectedSource.type)} ·{" "}
                  {selectedSource.description} · {money(selectedSource.amount)}. The original line
                  amount stays as posted.
                </p>
              ) : null}
              {refundRemaining != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Remaining on this payment: {money(refundRemaining)}.
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {authorizerNote ?? "Only an owner or manager can post this correction."}
                {thresholdNote
                  ? ` ${thresholdNote}`
                  : " Approval thresholds are not enforced on this post."}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              (needsMethod && !method) ||
              (needsSource && (!selectedSource || description.trim() === ""))
            }
          >
            {copy?.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseFolioDialog({
  restaurantId,
  folioId,
  balance,
  open,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  balance: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const closeFn = useServerFn(closeFolio);
  const settled = Math.abs(balance) < 0.01;

  const mutation = useMutation({
    mutationFn: () => closeFn({ data: { restaurantId, folioId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Folio closed");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close folio</DialogTitle>
          <DialogDescription>
            Close records the folio close only when the balance is zero. A non-zero balance stays
            open.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Current balance: <span className="font-medium">{money(balance)}</span>
        </p>
        {!settled ? (
          <p className="text-sm text-destructive">
            Settle the outstanding balance before closing this folio.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!settled || mutation.isPending}>
            Close folio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
