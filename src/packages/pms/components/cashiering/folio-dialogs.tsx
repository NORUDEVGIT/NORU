import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Info,
  Landmark,
  Lock,
  Receipt,
  RotateCcw,
  SlidersHorizontal,
  Tag,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { projectedFolioBalance } from "@/packages/pms/lib/cashiering-tender-state";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";

const LEDGER_LINE = "This records a ledger line on the guest folio.";

type TenderReceipt = {
  kind: "payment" | "deposit";
  transactionId: string;
  postedAt: string;
  receivedFrom: string;
  amount: number;
  method: string;
  notes: string;
  folioNumber: string;
  guestName: string;
  propertyName: string;
};

const TYPE_ICONS: Record<TransactionType, React.ComponentType<{ className?: string }>> = {
  charge: Receipt,
  payment: CreditCard,
  deposit: Landmark,
  refund: RotateCcw,
  adjustment: SlidersHorizontal,
  discount: Tag,
};

const COPY: Record<TransactionType, { title: string; description: string; cta: string }> = {
  charge: {
    title: "Post a charge",
    description: `${LEDGER_LINE} Active tax and service charges from Settings post as linked lines.`,
    cta: "Post charge",
  },
  payment: {
    title: "Receive payment",
    description: "Posts a payment on this open folio. The folio stays open.",
    cta: "Receive payment",
  },
  deposit: {
    title: "Record deposit",
    description:
      "This amount reduces the folio balance now. Applying it to a charge later does not change the balance again.",
    cta: "Record deposit",
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
  initialSourceId,
  currentBalance = null,
  currencyCode = null,
  guestName = null,
  folioNumber = null,
  propertyName = null,
  onClose,
  onDone,
}: {
  restaurantId: string;
  folioId: string;
  type: TransactionType | null;
  initialSourceId?: string | null;
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
  currentBalance?: number | null;
  currencyCode?: string | null;
  guestName?: string | null;
  folioNumber?: string | null;
  propertyName?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("");
  const [sourceId, setSourceId] = useState("none");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [receipt, setReceipt] = useState<TenderReceipt | null>(null);
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
      setSourceId(initialSourceId ?? "none");
      setReceivedFrom(guestName?.trim() ?? "");
      setPrintReceipt(true);
    }
  }, [open, type, initialSourceId, guestName]);

  useEffect(() => {
    if (!receipt) return;
    const clear = () => setReceipt(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, [receipt]);

  const post = useServerFn(postFolioEntry);
  const copy = type ? COPY[type] : null;
  const Icon = type ? TYPE_ICONS[type] : Receipt;
  const needsMethod = type === "payment" || type === "deposit" || type === "refund";
  const isTenderReceipt = type === "payment" || type === "deposit";
  const needsSource = type === "refund" || type === "adjustment" || type === "discount";
  const enteredAmount = Number(amount);
  const projected =
    currentBalance == null
      ? null
      : projectedFolioBalance(currentBalance, Number.isFinite(enteredAmount) ? enteredAmount : 0);
  const creditWarning = isTenderReceipt && projected != null && projected < -0.009;
  const sourceChoices = useMemo(() => {
    if (type === "refund")
      return sources.filter((line) => line.type === "payment" || line.type === "deposit");
    if (type === "discount") return [];
    if (type === "adjustment") return sources.filter((line) => line.type !== "charge");
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
      if (isTenderReceipt && receivedFrom.trim() === "")
        throw new Error("Enter who the money was received from.");
      if (description.trim() === "" && !isTenderReceipt)
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
          description: description.trim() || receivedFrom.trim(),
          idempotencyKey,
          ...(isTenderReceipt ? { receivedFrom: receivedFrom.trim() } : {}),
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
      if (isTenderReceipt && printReceipt && type) {
        setReceipt({
          kind: type,
          transactionId: result.id,
          postedAt: new Date().toISOString(),
          receivedFrom: receivedFrom.trim(),
          amount: Number(amount),
          method: tenders.find((row) => row.code === method)?.name ?? method,
          notes: description.trim(),
          folioNumber: folioNumber?.trim() || "—",
          guestName: guestName?.trim() || "—",
          propertyName: propertyName?.trim() || "NORU",
        });
        window.setTimeout(() => window.print(), 80);
      }
      setAmount("");
      setDescription("");
      onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Dialog open={open && type !== null} onOpenChange={(o) => (o ? null : onClose())}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[500px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-card p-0 shadow-2xl sm:max-w-[500px]">
          <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
                {copy?.title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
                {copy?.description}
              </DialogDescription>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {type === "deposit" && depositPolicySummary ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-[#C89933]/30 bg-[#C89933]/10 p-3 text-xs text-[#765719]">
                <Info className="size-4 shrink-0 mt-0.5 text-[#8a6a1f]" />
                <span>{depositPolicySummary}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label
                htmlFor="entry-amount"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Amount {currencyCode ? `(${currencyCode.trim()})` : ""}
              </Label>
              <Input
                id="entry-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 border-[#E8E1D7] bg-background text-base font-semibold tabular-nums focus-visible:ring-[#C89933]"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="entry-description"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {needsSource
                  ? "Reason for correction"
                  : isTenderReceipt
                    ? "Notes (optional)"
                    : "Description"}
              </Label>
              <Input
                id="entry-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  needsSource
                    ? "Why this correction is posted"
                    : type === "charge"
                      ? "e.g. Laundry service, Minibar"
                      : "Payment reference or note"
                }
                className="h-10 border-[#E8E1D7] bg-background focus-visible:ring-[#C89933]"
              />
            </div>

            {isTenderReceipt ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Posting date
                  </Label>
                  <p className="rounded-lg border border-[#E8E1D7] bg-[#F7F4EE]/70 px-3 py-2 text-sm">
                    {dateTime(new Date().toISOString())}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Posted now on the property clock. This date cannot be changed.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="entry-received-from"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Received from
                  </Label>
                  <Input
                    id="entry-received-from"
                    value={receivedFrom}
                    onChange={(e) => setReceivedFrom(e.target.value)}
                    maxLength={120}
                    placeholder="Name of the person or company paying"
                    className="h-10 border-[#E8E1D7] bg-background focus-visible:ring-[#C89933]"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={printReceipt}
                    onCheckedChange={(checked) => setPrintReceipt(checked === true)}
                  />
                  Print receipt
                </label>
              </div>
            ) : null}

            {isTenderReceipt ? (
              <div className="space-y-2 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE]/70 p-3.5 text-xs">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Balance Summary
                </p>
                <div className="divide-y divide-[#E8E1D7]/60">
                  <div className="flex justify-between py-1.5 text-xs text-muted-foreground">
                    <span>Currency</span>
                    <span className="font-medium text-foreground">
                      {currencyCode?.trim() || "Folio currency"}
                    </span>
                  </div>
                  {currentBalance != null ? (
                    <>
                      <div className="flex justify-between py-1.5 text-xs text-muted-foreground">
                        <span>Current balance</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {money(currentBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 text-xs text-muted-foreground">
                        <span>{type === "deposit" ? "Deposit amount" : "Payment amount"}</span>
                        <span className="font-semibold tabular-nums text-emerald-700">
                          {Number.isFinite(enteredAmount) && enteredAmount > 0
                            ? `-${money(enteredAmount)}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 text-xs font-medium">
                        <span className="text-foreground">Projected balance</span>
                        <span className="text-sm font-bold tabular-nums text-[#251605]">
                          {money(projected ?? currentBalance)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
                {creditWarning ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      This amount is larger than the balance. The folio will show a folio credit of{" "}
                      {money(Math.abs(projected ?? 0))}. The folio stays open until the balance is
                      zero.
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {needsMethod ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="entry-method"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Payment Method
                </Label>
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
                    <SelectTrigger
                      id="entry-method"
                      className="h-10 border-[#E8E1D7] bg-background"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#E8E1D7]">
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
              <div className="space-y-2">
                <Label
                  htmlFor="entry-source"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Source Line to Correct
                </Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger id="entry-source" className="h-10 border-[#E8E1D7] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[#E8E1D7]">
                    {sourceChoices.map((line) => (
                      <SelectItem key={line.id} value={line.id}>
                        {labelTransactionType(line.type)} · {line.description} ·{" "}
                        {money(line.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sourceChoices.length === 0 ? (
                  <p className="text-xs text-destructive">
                    This folio has no line that can be corrected this way.
                  </p>
                ) : null}
                {selectedSource ? (
                  <p className="rounded-lg border border-[#E8E1D7] bg-[#F7F4EE]/60 p-2.5 text-xs text-muted-foreground">
                    Original line:{" "}
                    <strong className="text-foreground">
                      {labelTransactionType(selectedSource.type)}
                    </strong>{" "}
                    · {selectedSource.description} · {money(selectedSource.amount)}. The original
                    line amount stays as posted.
                  </p>
                ) : null}
                {refundRemaining != null ? (
                  <p className="text-xs text-muted-foreground font-medium">
                    Remaining on this payment:{" "}
                    <span className="text-foreground">{money(refundRemaining)}</span>
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  {authorizerNote ?? "Only an owner or manager can post this correction."}
                  {thresholdNote
                    ? ` ${thresholdNote}`
                    : " Approval thresholds are not enforced on this post."}
                </p>
              </div>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2.5 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 px-6 py-3.5">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-[#E8E1D7] hover:bg-[#F7F4EE]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (needsMethod && !method) ||
                (isTenderReceipt && receivedFrom.trim() === "") ||
                (needsSource && (!selectedSource || description.trim() === ""))
              }
              className="bg-[#C89933] text-[#251605] font-semibold hover:bg-[#b88928] shadow-sm disabled:opacity-50"
            >
              {mutation.isPending ? "Posting..." : copy?.cta}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
      {receipt ? <TenderReceiptPrint receipt={receipt} money={money} dateTime={dateTime} /> : null}
    </>
  );
}

function TenderReceiptPrint({
  receipt,
  money,
  dateTime,
}: {
  receipt: TenderReceipt;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  const title = receipt.kind === "deposit" ? "Deposit receipt" : "Payment receipt";
  return (
    <>
      <article
        className="tender-receipt hidden bg-white p-6 text-sm text-foreground print:block"
        data-testid="tender-receipt"
      >
        <p className="text-xs uppercase tracking-wide">{receipt.propertyName}</p>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground">{receipt.transactionId}</p>
        <dl className="mt-4 space-y-1">
          <div className="flex justify-between gap-4">
            <dt>Posted</dt>
            <dd>{dateTime(receipt.postedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Folio</dt>
            <dd>{receipt.folioNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Guest</dt>
            <dd>{receipt.guestName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Received from</dt>
            <dd>{receipt.receivedFrom}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Method</dt>
            <dd>{receipt.method || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt>Amount</dt>
            <dd>{money(receipt.amount)}</dd>
          </div>
          {receipt.notes ? (
            <div className="flex justify-between gap-4">
              <dt>Notes</dt>
              <dd>{receipt.notes}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          This receipt is not an invoice and does not return money.
        </p>
      </article>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .tender-receipt, .tender-receipt * { visibility: visible; }
          .tender-receipt { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </>
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
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[480px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-card p-0 shadow-2xl sm:max-w-[480px]">
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            <Lock className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
              Close Folio
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              Close records the folio close only when the balance is zero. A non-zero balance stays open.
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div
            className={cn(
              "rounded-xl border p-4 space-y-2.5",
              settled
                ? "border-emerald-200 bg-emerald-50/60 text-emerald-950"
                : "border-amber-200 bg-amber-50/60 text-amber-950",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
                Current Net Balance
              </span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  settled ? "text-emerald-700" : "text-amber-800",
                )}
              >
                {money(balance)}
              </span>
            </div>

            {settled ? (
              <div className="flex items-start gap-2.5 pt-2 border-t border-emerald-200/60 text-xs text-emerald-800">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>
                  Folio balance is zero. Closing will finalize the record and lock the folio.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 pt-2 border-t border-amber-200/60 text-xs text-amber-800">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Settle the outstanding balance before closing this folio.
                </span>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 px-6 py-3.5">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#E8E1D7] hover:bg-[#F7F4EE]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!settled || mutation.isPending}
            className="bg-[#C89933] text-[#251605] font-semibold hover:bg-[#b88928] shadow-sm disabled:opacity-50"
          >
            {mutation.isPending ? "Closing..." : "Close Folio"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
