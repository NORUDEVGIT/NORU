import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { useRestaurantTime } from "@/core/state/property-format";
import {
  getCashieringCorrectionNotice,
  postFolioChargeCorrection,
  previewFolioChargeCorrection,
  type CorrectionMode,
  type FolioChargeCorrectionPreview,
} from "@/packages/pms/lib/cashiering.functions";
import { CORRECTION_AUTHORIZER } from "@/packages/pms/lib/cashiering.server";
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
  return `corr-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

const MODES: Array<{ id: CorrectionMode; label: string }> = [
  { id: "adjust_amount", label: "Adjust amount" },
  { id: "correct_quantity", label: "Correct quantity" },
  { id: "discount", label: "Apply discount" },
  { id: "reverse_remaining", label: "Reverse remaining charge" },
];

export function CorrectChargeDialog({
  restaurantId,
  sourceTransactionId,
  title,
  department,
  quantity,
  unitAmount,
  open,
  allowReplacement,
  onClose,
  onDone,
  onPostReplacement,
  money,
}: {
  restaurantId: string;
  sourceTransactionId: string | null;
  title: string;
  department: string | null;
  quantity: number | null;
  unitAmount: number | null;
  open: boolean;
  allowReplacement: boolean;
  onClose: () => void;
  onDone: () => void;
  onPostReplacement?: () => void;
  money: (value: number) => string;
}) {
  const { dateTime } = useRestaurantTime();
  const preview = useServerFn(previewFolioChargeCorrection);
  const post = useServerFn(postFolioChargeCorrection);
  const fetchNotice = useServerFn(getCashieringCorrectionNotice);
  const [mode, setMode] = useState<CorrectionMode>("adjust_amount");
  const [amount, setAmount] = useState("");
  const [nextQuantity, setNextQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [replaceAfter, setReplaceAfter] = useState(false);
  const [idemKey, setIdemKey] = useState(idempotencyKey);
  const quantityAvailable = quantity != null && unitAmount != null && quantity > 1;

  useEffect(() => {
    if (!open) return;
    setMode("adjust_amount");
    setAmount("");
    setNextQuantity(quantityAvailable && quantity != null ? String(quantity - 1) : "");
    setReason("");
    setReplaceAfter(false);
    setIdemKey(idempotencyKey());
  }, [open, sourceTransactionId, quantityAvailable, quantity]);

  const parsedAmount = Number(amount);
  const parsedQuantity = Number(nextQuantity);
  const amountReady =
    mode === "reverse_remaining"
      ? true
      : mode === "correct_quantity"
        ? Number.isInteger(parsedQuantity) && parsedQuantity >= 1
        : Number.isFinite(parsedAmount) && parsedAmount > 0;
  const requested =
    mode === "reverse_remaining"
      ? null
      : mode === "correct_quantity"
        ? parsedQuantity
        : roundFolioMoney(parsedAmount);

  const noticeQuery = useQuery({
    queryKey: ["cashiering-correction-notice", restaurantId],
    queryFn: () => fetchNotice({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });
  const previewQuery = useQuery({
    queryKey: ["folio-charge-correction", restaurantId, sourceTransactionId, mode, requested],
    queryFn: () =>
      preview({
        data: {
          restaurantId,
          sourceTransactionId: sourceTransactionId ?? "",
          mode,
          amount: requested,
        },
      }),
    enabled: open && Boolean(sourceTransactionId) && amountReady,
    retry: false,
  });
  const plan = previewQuery.data as FolioChargeCorrectionPreview | undefined;
  const previewError = previewQuery.error instanceof Error ? previewQuery.error.message : null;
  const postingAmount =
    mode === "reverse_remaining" && plan ? Math.abs(plan.grossCorrection) : requested;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!sourceTransactionId) throw new Error("Choose a charge to correct.");
      if (!reason.trim()) throw new Error("Enter a reason.");
      if (!plan || postingAmount == null) {
        throw new Error(previewError ?? "Review the correction before posting.");
      }
      return post({
        data: {
          restaurantId,
          sourceTransactionId,
          mode,
          amount: postingAmount,
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
      toast.success(mode === "discount" ? "Discount posted" : "Correction posted");
      onDone();
      if (replaceAfter) onPostReplacement?.();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const notice = noticeQuery.data;
  const threshold = mode === "discount" ? notice?.discountThreshold : notice?.adjustmentThreshold;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-[#fbf8f3] p-0 shadow-2xl sm:max-w-[720px]">
        <header className="flex items-start gap-3 border-b border-[#E8E1D7] bg-[#F7F4EE]/80 px-6 py-4.5 pr-12 text-left">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8a6a1f] shadow-xs">
            <SlidersHorizontal className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-tight text-[#251605]">
              Correct Charge
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground leading-normal">
              {title}
              {department ? ` · ${department}` : ""}
            </DialogDescription>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <section className="rounded-xl border border-[#E8E1D7] bg-card p-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Posted charge
            </h3>
            <p className="mt-2 text-sm font-medium">{title}</p>
            {department ? <p className="text-xs text-muted-foreground">{department}</p> : null}
            {quantity != null && unitAmount != null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Qty {quantity} · Unit price {money(unitAmount)}
              </p>
            ) : null}
          </section>
          <section className="rounded-xl border border-[#E8E1D7] bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {MODES.filter((item) => item.id !== "correct_quantity" || quantityAvailable).map(
                (item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs",
                      mode === item.id
                        ? "border-[#C89933] bg-[#C89933]/10 text-[#251605]"
                        : "border-[#E8E1D7] text-muted-foreground",
                    )}
                    onClick={() => {
                      setMode(item.id);
                      setReplaceAfter(false);
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
            {mode === "adjust_amount" || mode === "discount" ? (
              <div className="mt-3">
                <Label htmlFor="correction-amount">
                  {mode === "discount" ? "Discount amount" : "Amount to reduce"}
                </Label>
                <Input
                  id="correction-amount"
                  className="mt-1.5"
                  inputMode="decimal"
                  value={amount}
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            ) : null}
            {mode === "correct_quantity" && quantity != null ? (
              <div className="mt-3">
                <Label htmlFor="correction-quantity">Corrected quantity</Label>
                <Input
                  id="correction-quantity"
                  className="mt-1.5"
                  inputMode="numeric"
                  value={nextQuantity}
                  onChange={(event) => setNextQuantity(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Original quantity {quantity}. The posted quantity stays on the original line.
                </p>
              </div>
            ) : null}
            {mode === "reverse_remaining" ? (
              <p className="mt-3 text-sm text-muted-foreground">
                This posts a reversal for whatever gross remains on the charge, including its frozen
                tax and service lines.
              </p>
            ) : null}
            <div className="mt-3">
              <Label htmlFor="correction-reason">Reason *</Label>
              <Textarea
                id="correction-reason"
                className="mt-1.5"
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            {allowReplacement ? (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={replaceAfter}
                  onChange={(event) => {
                    setReplaceAfter(event.target.checked);
                    if (event.target.checked) setMode("reverse_remaining");
                  }}
                />
                <span>
                  This was the wrong service. Reverse what remains, then open Post Charge for the
                  correct service.
                </span>
              </label>
            ) : null}
          </section>
          <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 text-sm">
            {previewQuery.isLoading ? (
              <p className="text-muted-foreground">Calculating the correction…</p>
            ) : previewError ? (
              <p className="text-destructive">{previewError}</p>
            ) : plan ? (
              <dl className="space-y-1.5">
                <PreviewLine label="Original gross" value={money(plan.originalGross)} />
                <PreviewLine label="Remaining gross" value={money(plan.remainingGross)} />
                <PreviewLine label="Net correction" value={money(plan.netCorrection)} />
                <PreviewLine label="VAT correction" value={money(plan.taxCorrection)} />
                <PreviewLine label="Service correction" value={money(plan.serviceCorrection)} />
                <PreviewLine
                  label="New effective gross"
                  value={money(plan.newEffectiveGross)}
                  strong
                />
              </dl>
            ) : (
              <p className="text-muted-foreground">
                Enter the correction to see the posted shares.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Posting now {dateTime(new Date().toISOString())}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {notice?.authorizer ?? CORRECTION_AUTHORIZER}
              {threshold ? ` ${threshold}` : ""}
            </p>
          </section>
        </div>
        <DialogFooter className="border-t border-[#E8E1D7] bg-card px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            disabled={!plan || !reason.trim() || mutation.isPending || Boolean(previewError)}
            onClick={() => mutation.mutate()}
          >
            {replaceAfter
              ? "Reverse Charge"
              : mode === "discount"
                ? "Apply Discount"
                : mode === "reverse_remaining"
                  ? "Reverse Charge"
                  : "Post Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold text-foreground")}>{value}</dd>
    </div>
  );
}
