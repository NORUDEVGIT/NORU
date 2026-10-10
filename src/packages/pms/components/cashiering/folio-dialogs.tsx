import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Coins,
  CreditCard,
  Info,
  Landmark,
  Lock,
  Printer,
  Receipt,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
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
import { methodLabel } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import {
  cashieringPropertyHotelName,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import {
  closeFolio,
  postFolioEntry,
  type FolioTransactionRow,
  type FolioWorkspace,
} from "@/packages/pms/lib/cashiering.functions";
import {
  remainingOnPaymentSource,
  type TransactionType,
} from "@/packages/pms/lib/cashiering.server";
import type { FolioFinancialSummary } from "@/packages/pms/lib/folio-workspace";
import { projectedFolioBalance } from "@/packages/pms/lib/cashiering-tender-state";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { NoruMarkSvg } from "@/packages/pms/components/cashiering/folio-invoice-panel";
import { settlementCloseBlock, stayNights } from "@/packages/pms/lib/folio-workspace";

const LEDGER_LINE = "This records a ledger line on the guest folio.";

export type TenderReceipt = {
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
  confirmationNumber?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  nights?: number | null;
  roomType?: string | null;
  ratePlan?: string | null;
  currencyCode?: string | null;
  roomNumber?: string | null;
  property?: CashieringDocumentProperty | null;
  folioBalance: number;
  grossCharges: number;
  depositUnapplied?: number | null;
  paymentRefundable?: number | null;
  depositPolicySummary?: string | null;
};

export type TenderReceiptBuildContext = {
  property: CashieringDocumentProperty | null;
  propertyDisplayName?: string;
  depositPolicySummary?: string | null;
};

function grossFolioCharges(summary: FolioFinancialSummary): number {
  return Math.round((summary.netCharges + summary.tax + summary.serviceCharge + Number.EPSILON) * 100) / 100;
}

export function buildTenderReceiptFromFolioRow(
  row: FolioTransactionRow,
  workspace: FolioWorkspace,
  ctx: TenderReceiptBuildContext,
): TenderReceipt | null {
  if (row.type !== "payment" && row.type !== "deposit") return null;
  const folio = workspace.folio;
  const depositLine = workspace.depositLines.find((line) => line.transaction.id === row.id);
  const summary = workspace.financialSummary;
  const nights =
    folio.arrivalDate && folio.departureDate
      ? stayNights(folio.arrivalDate, folio.departureDate)
      : null;
  const displayName =
    cashieringPropertyHotelName(ctx.property) || ctx.propertyDisplayName?.trim() || "Property";
  return {
    kind: row.type,
    transactionId: row.id,
    postedAt: row.postedAt,
    receivedFrom: row.description?.trim() || folio.guestName || "—",
    amount: Math.abs(row.amount),
    method: methodLabel(row.paymentMethod),
    notes: row.description,
    folioNumber: folio.folioNumber,
    guestName: folio.guestName,
    propertyName: displayName,
    property: ctx.property,
    confirmationNumber: folio.confirmationNumber,
    guestPhone: folio.guestPhone,
    guestEmail: folio.guestEmail,
    arrivalDate: folio.arrivalDate,
    departureDate: folio.departureDate,
    nights,
    roomNumber: folio.roomNumber,
    roomType: folio.roomTypeName,
    ratePlan: folio.ratePlanName,
    currencyCode: folio.currency,
    folioBalance: folio.balance,
    grossCharges: grossFolioCharges(summary),
    depositUnapplied: row.type === "deposit" ? (depositLine?.available ?? 0) : null,
    paymentRefundable:
      row.type === "payment"
        ? (remainingOnPaymentSource(row, workspace.folio.transactions) ?? 0)
        : null,
    depositPolicySummary: ctx.depositPolicySummary ?? null,
  };
}

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
  guestPhone = null,
  guestEmail = null,
  confirmationNumber = null,
  arrivalDate = null,
  departureDate = null,
  roomType = null,
  ratePlan = null,
  roomNumber = null,
  documentProperty = null,
  grossCharges = null,
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
  guestPhone?: string | null;
  guestEmail?: string | null;
  confirmationNumber?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  roomType?: string | null;
  ratePlan?: string | null;
  roomNumber?: string | null;
  documentProperty?: CashieringDocumentProperty | null;
  grossCharges?: number | null;
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
  const [showReceiptModal, setShowReceiptModal] = useState(false);
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
      if (isTenderReceipt && type) {
        const val = Number(amount);
        const displayName =
          cashieringPropertyHotelName(documentProperty) || propertyName?.trim() || "Property";
        const nights =
          arrivalDate && departureDate ? stayNights(arrivalDate, departureDate) : null;
        const newReceipt: TenderReceipt = {
          kind: type,
          transactionId: result.id || "—",
          postedAt: new Date().toISOString(),
          receivedFrom: receivedFrom.trim(),
          amount: val,
          method: tenders.find((row) => row.code === method)?.name ?? methodLabel(method),
          notes: description.trim(),
          folioNumber: folioNumber?.trim() || "—",
          guestName: guestName?.trim() || receivedFrom.trim() || "—",
          propertyName: displayName,
          property: documentProperty,
          confirmationNumber,
          guestPhone,
          guestEmail,
          arrivalDate,
          departureDate,
          nights,
          roomNumber,
          roomType,
          ratePlan,
          currencyCode: currencyCode?.trim() || "ETB",
          folioBalance: projected ?? currentBalance ?? 0,
          grossCharges: grossCharges ?? 0,
          depositUnapplied: type === "deposit" ? val : null,
          paymentRefundable: type === "payment" ? val : null,
          depositPolicySummary: depositPolicySummary ?? null,
        };
        setReceipt(newReceipt);
        setShowReceiptModal(true);
        if (printReceipt) {
          window.setTimeout(() => window.print(), 100);
        }
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
                    · {selectedSource.description} · {money(selectedSource.amount)}. The original line stays as posted.
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
      <DepositReceiptModal
        receipt={receipt}
        open={showReceiptModal && receipt !== null}
        money={money}
        dateTime={dateTime}
        onClose={() => {
          setShowReceiptModal(false);
        }}
      />
    </>
  );
}

function formatReceiptDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${mins}`;
  } catch {
    return iso;
  }
}

function formatReceiptStayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const weekday = days[d.getDay()];
    return `${day} ${month} ${year} (${weekday})`;
  } catch {
    return iso.slice(0, 10);
  }
}

function TenderReceiptPropertyHeader({
  receipt,
}: {
  receipt: TenderReceipt;
}) {
  const property = receipt.property;
  const brandName = cashieringPropertyHotelName(property) || receipt.propertyName;
  const legalName =
    property?.legalEntityName?.trim() ||
    property?.legalName?.trim() ||
    brandName;
  const legalAddress = property?.fullAddress?.trim();
  const brandAddress = property?.fullAddress?.trim();

  return (
    <div className="flex items-start justify-between gap-4 pb-1">
      <div className="space-y-0.5 min-w-0">
        {property?.logoUrl ? (
          <img
            src={property.logoUrl}
            alt=""
            className="mb-1 max-h-11 w-auto object-contain object-left"
          />
        ) : (
          <NoruMarkSvg className="size-11" strokeColor="#C89933" />
        )}
        <h2 className="mt-1 text-sm font-bold text-slate-950">{brandName}</h2>
        {brandAddress ? <p className="text-[11px] text-slate-600">{brandAddress}</p> : null}
        {property?.phone ? (
          <p className="text-[11px] text-slate-600">Tel: {property.phone}</p>
        ) : null}
      </div>
      <div className="space-y-0.5 text-right text-[11px] text-slate-600 min-w-0 max-w-[240px]">
        <p className="text-xs font-bold text-slate-950">{legalName}</p>
        {legalAddress && legalAddress !== brandAddress ? (
          <p>{legalAddress}</p>
        ) : null}
        {property?.email ? <p>{property.email}</p> : null}
        {property?.tinNumber ? <p>TIN: {property.tinNumber}</p> : null}
        {!property?.tinNumber && property?.vatNumber ? (
          <p>VAT: {property.vatNumber}</p>
        ) : null}
      </div>
    </div>
  );
}

function receiptField(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function TenderReceiptDocument({
  receipt,
  money,
}: {
  receipt: TenderReceipt;
  money: (value: number) => string;
  dateTime?: (iso: string | null | undefined) => string;
}) {
  const isDeposit = receipt.kind === "deposit";
  const title = isDeposit ? "DEPOSIT RECEIPT" : "PAYMENT RECEIPT";
  const currency = receipt.currencyCode?.trim() || "ETB";
  const nights =
    receipt.nights ??
    (receipt.arrivalDate && receipt.departureDate
      ? stayNights(receipt.arrivalDate, receipt.departureDate)
      : null);

  return (
    <div className="mx-auto w-full max-w-[540px] space-y-4 rounded-xl border border-[#E8E1D7] bg-white p-6 font-sans text-slate-800 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <TenderReceiptPropertyHeader receipt={receipt} />

      {/* Centered Document Title */}
      <div className="my-2 border-y border-slate-200 py-2 text-center">
        <h1 className="text-base font-extrabold tracking-wider text-[#0E2C6C] uppercase">
          {title}
        </h1>
      </div>

      {/* Aligned Key-Value Meta */}
      <div className="space-y-1 text-xs text-slate-700">
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Receipt No.</span>
          <span>:</span>
          <span className="font-bold text-slate-950">{receipt.transactionId}</span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Reservation No.</span>
          <span>:</span>
          <span className="font-semibold text-slate-950">
            {receipt.confirmationNumber || receipt.folioNumber || "—"}
          </span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Date & Time</span>
          <span>:</span>
          <span className="text-slate-900">{formatReceiptDateTime(receipt.postedAt)}</span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Folio No.</span>
          <span>:</span>
          <span className="font-medium text-slate-900">{receiptField(receipt.folioNumber)}</span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Payment Method</span>
          <span>:</span>
          <span className="font-medium text-slate-900">{receiptField(receipt.method)}</span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Received From</span>
          <span>:</span>
          <span className="text-slate-800">{receiptField(receipt.receivedFrom)}</span>
        </div>
        <div className="grid grid-cols-[135px_12px_1fr] items-baseline">
          <span className="text-slate-500">Reference / Notes</span>
          <span>:</span>
          <span className="text-slate-800">{receiptField(receipt.notes)}</span>
        </div>
      </div>

      {/* Section 1: Guest Information */}
      <div className="space-y-1.5 border-t border-slate-200 pt-3 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs tracking-wide">
          <User className="size-3.5 text-[#0E2C6C]" />
          <span>Guest Information</span>
        </div>
        <div className="space-y-1 pl-5 text-slate-700">
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Guest Name</span>
            <span>:</span>
            <span className="font-semibold text-slate-950">
              {receipt.guestName || receipt.receivedFrom}
            </span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Phone</span>
            <span>:</span>
            <span>{receiptField(receipt.guestPhone)}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Email</span>
            <span>:</span>
            <span>{receiptField(receipt.guestEmail)}</span>
          </div>
        </div>
      </div>

      {/* Section 2: Stay Information */}
      <div className="space-y-1.5 border-t border-slate-200 pt-3 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs tracking-wide">
          <CalendarDays className="size-3.5 text-[#0E2C6C]" />
          <span>Stay Information</span>
        </div>
        <div className="space-y-1 pl-5 text-slate-700">
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Arrival Date</span>
            <span>:</span>
            <span>{formatReceiptStayDate(receipt.arrivalDate)}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Departure Date</span>
            <span>:</span>
            <span>{formatReceiptStayDate(receipt.departureDate)}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Room</span>
            <span>:</span>
            <span>{receiptField(receipt.roomNumber)}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Nights</span>
            <span>:</span>
            <span>{nights ?? "—"}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Room Type</span>
            <span>:</span>
            <span>{receiptField(receipt.roomType)}</span>
          </div>
          <div className="grid grid-cols-[115px_12px_1fr] items-baseline">
            <span className="text-slate-500">Rate Plan</span>
            <span>:</span>
            <span>{receiptField(receipt.ratePlan)}</span>
          </div>
        </div>
      </div>

      {/* Section 3: Financial Details with Emerald & Sand Card Highlights */}
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs tracking-wide">
          <Coins className="size-3.5 text-[#0E2C6C]" />
          <span>Financial Details</span>
        </div>
        <div className="space-y-1 pl-5 text-slate-700">
          <div className="flex items-baseline justify-between py-0.5">
            <span className="font-medium text-slate-800">Charges on folio (incl. tax &amp; service)</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {money(receipt.grossCharges)} {currency}
            </span>
          </div>
          {isDeposit && receipt.depositUnapplied != null ? (
            <div className="flex items-baseline justify-between py-0.5">
              <span className="font-medium text-slate-800">Unapplied deposit credit</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {money(receipt.depositUnapplied)} {currency}
              </span>
            </div>
          ) : null}
          {!isDeposit && receipt.paymentRefundable != null ? (
            <div className="flex items-baseline justify-between py-0.5">
              <span className="font-medium text-slate-800">Refundable on this payment</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {money(Math.max(0, receipt.paymentRefundable))} {currency}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-emerald-200/90 bg-[#ECFDF5] px-3.5 py-2.5 text-[#065F46]">
          <span className="text-xs font-bold">
            {isDeposit ? "Deposit Received" : "Payment Received"}
          </span>
          <span className="text-sm font-extrabold tabular-nums">
            {money(receipt.amount)} {currency}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#FEFDF9] px-3.5 py-2.5 text-slate-900">
          <span className="text-xs font-bold">Folio balance</span>
          <span className="text-sm font-extrabold tabular-nums">
            {money(receipt.folioBalance)} {currency}
          </span>
        </div>
      </div>

      <div className="space-y-1 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
        {receipt.depositPolicySummary ? (
          <p>Deposit policy: {receipt.depositPolicySummary}</p>
        ) : isDeposit ? (
          <p>This deposit is recorded on the guest folio and may be applied to charges per property policy.</p>
        ) : (
          <p>This payment is recorded on the guest folio.</p>
        )}
        <p className="text-[10px] text-slate-400">
          This receipt is not a tax invoice. Amounts reflect the folio ledger at the time shown.
        </p>
      </div>
    </div>
  );
}

export function DepositReceiptModal({
  receipt,
  open,
  money,
  dateTime,
  onClose,
}: {
  receipt: TenderReceipt | null;
  open: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onClose: () => void;
}) {
  if (!receipt) return null;
  const receiptTitle = receipt.kind === "deposit" ? "Deposit receipt" : "Payment receipt";
  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onClose() : null)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-[#E8E1D7] bg-[#F7F4EE]/60 p-4 sm:p-6 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{receiptTitle}</DialogTitle>
          <DialogDescription>
            {receiptTitle} for {receipt.transactionId}
          </DialogDescription>
        </DialogHeader>
        <TenderReceiptDocument receipt={receipt} money={money} dateTime={dateTime} />
        <DialogFooter className="mt-4 flex flex-row items-center justify-between gap-2 border-t border-[#E8E1D7] pt-3">
          <Button variant="outline" size="sm" onClick={onClose} className="border-[#E8E1D7]">
            Close
          </Button>
          <Button
            size="sm"
            className="bg-[#C89933] font-semibold text-[#251605] shadow-sm hover:bg-[#b88928]"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 size-3.5" /> Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TenderReceiptPrint({
  receipt,
  money,
  dateTime,
}: {
  receipt: TenderReceipt;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  return (
    <>
      <article
        className="tender-receipt hidden bg-white p-6 text-sm text-foreground print:block"
        data-testid="tender-receipt"
      >
        <TenderReceiptDocument receipt={receipt} money={money} dateTime={dateTime} />
      </article>
      <style>{`
        @media print {
          @page { margin: 10mm; }
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
              Close Folio? This financially closes the folio only when the balance is zero. Front Office checkout is separate.
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
                Current Balance
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
                  Current balance is zero. This financially closes the folio. New charges, payments,
                  refunds, transfers and normal corrections cannot be posted afterward. Front Office
                  checkout is separate.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 pt-2 border-t border-amber-200/60 text-xs text-amber-800">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  {settlementCloseBlock(balance) ?? "Balance must be zero before closing."}{" "}
                  Remaining balance must be settled before this folio can be closed.
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
