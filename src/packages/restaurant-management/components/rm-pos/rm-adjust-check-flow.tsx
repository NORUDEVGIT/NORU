import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
import { BillTotals } from "@/packages/restaurant-management/components/bill-totals";
import {
  adjustKindLabel,
  canCompleteCompedOrder,
  canSubmitCompConfirm,
  canSubmitDiscountConfirm,
  computeAdjustedRmBill,
  payableWasNow,
  resolveCompAmount,
  resolveDiscountAmount,
  type RmCompScope,
  type RmDiscountType,
} from "@/packages/restaurant-management/lib/rm-adjust";
import type { RmBillTotals } from "@/packages/restaurant-management/lib/rm-tax";
import {
  applyOrderComp,
  applyOrderDiscount,
  clearOrderDiscount,
  completeCompedOrder,
  getAdjustCheck,
  type AdjustCheckView,
} from "@/packages/restaurant-management/lib/rm-adjust.functions";

type Path = "choose" | "discount" | "comp";
type DiscountStep = "enter" | "reason" | "review";
type CompStep = "enter" | "reason" | "review";

export function RmAdjustCheckFlow({
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
  onSuccess: (result: { completed: boolean; payable: number; bill: RmBillTotals }) => void;
  money: (value: number) => string;
}) {
  const queryClient = useQueryClient();
  const loadCheck = useServerFn(getAdjustCheck);
  const discountFn = useServerFn(applyOrderDiscount);
  const clearFn = useServerFn(clearOrderDiscount);
  const compFn = useServerFn(applyOrderComp);
  const completeFn = useServerFn(completeCompedOrder);

  const check = useQuery({
    queryKey: ["rm-adjust-check", restaurantId, orderId],
    queryFn: () => loadCheck({ data: { restaurantId, orderId } }),
    enabled: open && Boolean(orderId),
    retry: false,
  });

  const [path, setPath] = useState<Path>("choose");
  const [discountStep, setDiscountStep] = useState<DiscountStep>("enter");
  const [compStep, setCompStep] = useState<CompStep>("enter");
  const [discountType, setDiscountType] = useState<RmDiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [clearing, setClearing] = useState(false);
  const [compScope, setCompScope] = useState<RmCompScope>("lines");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setPath("choose");
      setDiscountStep("enter");
      setCompStep("enter");
      setDiscountType("percent");
      setDiscountValue("");
      setClearing(false);
      setCompScope("lines");
      setSelected({});
      setReason("");
    }
  }, [open, orderId]);

  const view = check.data ?? null;

  const parsedDiscount = Number(discountValue);
  const resolvedDiscount = useMemo(() => {
    if (!view) return null;
    if (clearing) return { ok: true as const, amount: 0 };
    if (!Number.isFinite(parsedDiscount)) return null;
    return resolveDiscountAmount({
      type: discountType,
      value: parsedDiscount,
      eligibleMerchandise: Math.max(0, view.merchandiseSubtotal - view.compAmount),
    });
  }, [view, clearing, discountType, parsedDiscount]);

  const selectedRemainings = useMemo(() => {
    if (!view) return [];
    if (compScope === "check") return view.lines.filter((line) => line.remainingAmount > 0.001).map((line) => line.remainingAmount);
    return view.lines.filter((line) => selected[line.id]).map((line) => line.remainingAmount);
  }, [view, compScope, selected]);

  const resolvedComp = useMemo(() => {
    if (!view) return null;
    return resolveCompAmount({
      scope: compScope,
      merchandise: view.merchandiseSubtotal,
      selectedLineRemainings: selectedRemainings,
      alreadyComped: view.compAmount,
    });
  }, [view, compScope, selectedRemainings]);

  const proposedBill = useMemo(() => {
    if (!view) return null;
    if (path === "discount" && resolvedDiscount?.ok) {
      return computeAdjustedRmBill({
        merchandiseSubtotal: view.merchandiseSubtotal,
        settings: view.taxSettings,
        discountAmount: resolvedDiscount.amount,
        compAmount: view.compAmount,
      });
    }
    if (path === "comp" && resolvedComp?.ok) {
      const eligible = Math.max(0, view.merchandiseSubtotal - resolvedComp.nextCompTotal);
      const discountAmount = view.discount
        ? Math.min(view.discount.type === "percent" ? (eligible * view.discount.value) / 100 : view.discount.amount, eligible)
        : 0;
      return computeAdjustedRmBill({
        merchandiseSubtotal: view.merchandiseSubtotal,
        settings: view.taxSettings,
        discountAmount,
        compAmount: resolvedComp.nextCompTotal,
      });
    }
    return view.bill;
  }, [view, path, resolvedDiscount, resolvedComp]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["rm-adjust-check", restaurantId, orderId] });
    void queryClient.invalidateQueries({ queryKey: ["restaurant-order", restaurantId, orderId] });
    void queryClient.invalidateQueries({ queryKey: ["order-billing", restaurantId, orderId] });
    void queryClient.invalidateQueries({ queryKey: ["pos-context", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["rm-refund-sale", restaurantId, orderId] });
  }

  const discountMutation = useMutation({
    mutationFn: async () => {
      if (!view) throw new Error("That restaurant check could not be loaded.");
      if (clearing) {
        return clearFn({ data: { restaurantId, orderId: view.orderId, reason: reason.trim() } });
      }
      return discountFn({
        data: {
          restaurantId,
          orderId: view.orderId,
          type: discountType,
          value: parsedDiscount,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(clearing ? "Discount cleared" : "Discount applied");
      invalidate();
      onSuccess({ completed: false, payable: result.view.bill.payable, bill: result.view.bill });
      if (result.view.canComplete) {
        setPath("choose");
        setDiscountStep("enter");
        setReason("");
        return;
      }
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const compMutation = useMutation({
    mutationFn: async () => {
      if (!view) throw new Error("That restaurant check could not be loaded.");
      return compFn({
        data: {
          restaurantId,
          orderId: view.orderId,
          scope: compScope,
          ...(compScope === "lines"
            ? { orderItemIds: view.lines.filter((line) => selected[line.id]).map((line) => line.id) }
            : {}),
          reason: reason.trim(),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Comp applied");
      invalidate();
      onSuccess({ completed: false, payable: result.view.bill.payable, bill: result.view.bill });
      if (result.view.canComplete) {
        setPath("choose");
        setCompStep("enter");
        setReason("");
        return;
      }
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!view) throw new Error("That restaurant check could not be loaded.");
      return completeFn({ data: { restaurantId, orderId: view.orderId } });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Check completed (comped)");
      invalidate();
      onSuccess({ completed: true, payable: 0, bill: result.view.bill });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = discountMutation.isPending || compMutation.isPending || completeMutation.isPending;
  const discountReady = canSubmitDiscountConfirm({
    reason,
    amount: clearing ? 1 : resolvedDiscount?.ok ? resolvedDiscount.amount : 0,
    submitting: busy,
  });
  const compReady = canSubmitCompConfirm({
    reason,
    amount: resolvedComp?.ok ? resolvedComp.amount : 0,
    hasSelection: resolvedComp?.ok === true,
    submitting: busy,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Adjust check</DialogTitle>
          <DialogDescription>
            {view ? (
              <>
                Sale #{view.orderNumber} · Payable {money(view.bill.payable)}
              </>
            ) : (
              "Load the restaurant check, then discount or comp with a reason."
            )}
          </DialogDescription>
        </DialogHeader>

        {check.isLoading ? <p className="text-sm text-muted-foreground">Loading restaurant check…</p> : null}
        {check.isError ? <p className="text-sm text-destructive">{(check.error as Error).message}</p> : null}

        {view?.paidBlock ? (
          <Alert>
            <AlertTitle>This check is already paid</AlertTitle>
            <AlertDescription>Use Refund. Discounts and comps are only for open unpaid checks.</AlertDescription>
          </Alert>
        ) : null}

        {view && !view.paidBlock && !view.canDiscount && !view.canComp && !view.canComplete ? (
          <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            You don&apos;t have permission to discount or comp this restaurant check.
          </p>
        ) : null}

        {view && !view.paidBlock && (view.canDiscount || view.canComp || view.canComplete) ? (
          <div className="space-y-4">
            {view.canComplete ? (
              <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-semibold">Payable is {money(0)}</p>
                <p className="text-sm text-muted-foreground">
                  Complete this check as comped. No cash or card tender is recorded.
                </p>
                <Button
                  type="button"
                  className="h-14 w-full rounded-2xl text-base font-bold"
                  disabled={busy}
                  onClick={() => completeMutation.mutate()}
                >
                  {completeMutation.isPending ? "Completing…" : "Complete (comped)"}
                </Button>
              </div>
            ) : null}

            {path === "choose" ? (
              <div className="space-y-3">
                {view.bill.discountAmount > 0 || view.bill.compAmount > 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-3">
                    <BillTotals bill={view.bill} money={money} density="till" />
                  </div>
                ) : null}
                {view.canDiscount ? (
                  <Button
                    type="button"
                    className="h-16 w-full rounded-2xl text-lg font-bold"
                    disabled={busy}
                    onClick={() => {
                      setClearing(false);
                      setPath("discount");
                      setDiscountStep("enter");
                    }}
                  >
                    Discount
                  </Button>
                ) : null}
                {view.canDiscount && view.discount ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 w-full rounded-2xl text-base font-semibold"
                    disabled={busy}
                    onClick={() => {
                      setClearing(true);
                      setPath("discount");
                      setDiscountStep("reason");
                    }}
                  >
                    Clear discount
                  </Button>
                ) : null}
                {view.canComp && !view.checkComped ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 w-full rounded-2xl text-lg font-bold"
                    disabled={busy}
                    onClick={() => {
                      setPath("comp");
                      setCompStep("enter");
                    }}
                  >
                    Comp
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" className="h-12 w-full rounded-2xl" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
              </div>
            ) : null}

            {path === "discount" ? (
              <DiscountPath
                view={view}
                step={discountStep}
                setStep={setDiscountStep}
                type={discountType}
                setType={setDiscountType}
                value={discountValue}
                setValue={setDiscountValue}
                clearing={clearing}
                reason={reason}
                setReason={setReason}
                resolved={resolvedDiscount}
                proposed={proposedBill}
                money={money}
                busy={busy}
                confirmReady={discountReady}
                onBack={() => {
                  if (busy) return;
                  setPath("choose");
                  setDiscountStep("enter");
                  setClearing(false);
                  setReason("");
                }}
                onConfirm={() => discountMutation.mutate()}
              />
            ) : null}

            {path === "comp" ? (
              <CompPath
                view={view}
                step={compStep}
                setStep={setCompStep}
                scope={compScope}
                setScope={setCompScope}
                selected={selected}
                setSelected={setSelected}
                reason={reason}
                setReason={setReason}
                resolved={resolvedComp}
                proposed={proposedBill}
                money={money}
                busy={busy}
                confirmReady={compReady}
                onBack={() => {
                  if (busy) return;
                  setPath("choose");
                  setCompStep("enter");
                  setReason("");
                }}
                onConfirm={() => compMutation.mutate()}
              />
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DiscountPath({
  view,
  step,
  setStep,
  type,
  setType,
  value,
  setValue,
  clearing,
  reason,
  setReason,
  resolved,
  proposed,
  money,
  busy,
  confirmReady,
  onBack,
  onConfirm,
}: {
  view: AdjustCheckView;
  step: DiscountStep;
  setStep: (step: DiscountStep) => void;
  type: RmDiscountType;
  setType: (type: RmDiscountType) => void;
  value: string;
  setValue: (value: string) => void;
  clearing: boolean;
  reason: string;
  setReason: (value: string) => void;
  resolved: ReturnType<typeof resolveDiscountAmount> | { ok: true; amount: number } | null;
  proposed: ReturnType<typeof computeAdjustedRmBill> | null;
  money: (value: number) => string;
  busy: boolean;
  confirmReady: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const eligible = Math.max(0, view.merchandiseSubtotal - view.compAmount);
  const comparison = proposed ? payableWasNow(view.bill.payable, proposed.payable) : null;
  const amountOk = Boolean(resolved?.ok && (clearing || resolved.amount > 0));

  return (
    <div className="space-y-3">
      <StepPips steps={["enter", "reason", "review"]} current={clearing && step === "reason" ? "reason" : step} />
      {step === "enter" && !clearing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["percent", "amount"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={cn(
                  "h-14 rounded-2xl border text-sm font-bold uppercase",
                  type === option ? "border-primary bg-primary/10" : "border-border bg-card",
                )}
              >
                {option === "percent" ? "Percent" : "Amount"}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="rm-discount-value">{type === "percent" ? "Percent (0–100)" : "Amount"}</Label>
            <Input
              id="rm-discount-value"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={type === "percent" ? "10" : money(eligible)}
              className="h-14 rounded-2xl text-base"
            />
            <p className="text-xs text-muted-foreground">
              Eligible after comps {money(eligible)}
              {view.discount ? ` · current ${money(view.discount.amount)} will be replaced` : ""}
            </p>
          </div>
          {resolved && !resolved.ok ? <p className="text-sm text-destructive">{resolved.message}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={onBack}>
              Back
            </Button>
            <Button
              type="button"
              className="h-14 rounded-2xl text-base font-bold"
              disabled={!amountOk}
              onClick={() => setStep("reason")}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "reason" ? (
        <div className="space-y-3">
          <Label htmlFor="rm-adjust-discount-reason">Reason</Label>
          <Textarea
            id="rm-adjust-discount-reason"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder={clearing ? "Why is this discount being cleared?" : "Why is this discount being applied?"}
            className="min-h-28 rounded-2xl text-base"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-2xl"
              onClick={() => (clearing ? onBack() : setStep("enter"))}
              disabled={busy}
            >
              Back
            </Button>
            <Button
              type="button"
              className="h-14 rounded-2xl text-base font-bold"
              disabled={reason.trim().length < 3}
              onClick={() => setStep("review")}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <ReviewConfirm
          view={view}
          proposed={proposed}
          comparison={comparison}
          reason={reason}
          money={money}
          busy={busy}
          confirmReady={confirmReady}
          confirmLabel={busy ? "Saving…" : clearing ? "Confirm clear" : "Confirm discount"}
          onBack={() => setStep("reason")}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}

function CompPath({
  view,
  step,
  setStep,
  scope,
  setScope,
  selected,
  setSelected,
  reason,
  setReason,
  resolved,
  proposed,
  money,
  busy,
  confirmReady,
  onBack,
  onConfirm,
}: {
  view: AdjustCheckView;
  step: CompStep;
  setStep: (step: CompStep) => void;
  scope: RmCompScope;
  setScope: (scope: RmCompScope) => void;
  selected: Record<string, boolean>;
  setSelected: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  reason: string;
  setReason: (value: string) => void;
  resolved: ReturnType<typeof resolveCompAmount> | null;
  proposed: ReturnType<typeof computeAdjustedRmBill> | null;
  money: (value: number) => string;
  busy: boolean;
  confirmReady: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const comparison = proposed ? payableWasNow(view.bill.payable, proposed.payable) : null;

  return (
    <div className="space-y-3">
      <StepPips steps={["enter", "reason", "review"]} current={step} />
      {step === "enter" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope("lines")}
              className={cn(
                "h-14 rounded-2xl border text-sm font-bold uppercase",
                scope === "lines" ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              Lines
            </button>
            <button
              type="button"
              onClick={() => setScope("check")}
              className={cn(
                "h-14 rounded-2xl border text-sm font-bold uppercase",
                scope === "check" ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              Entire check
            </button>
          </div>
          {scope === "lines" ? (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {view.lines.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    disabled={line.remainingAmount <= 0}
                    onClick={() =>
                      setSelected((prev) => ({ ...prev, [line.id]: !prev[line.id] }))
                    }
                    className={cn(
                      "flex h-16 w-full items-center justify-between rounded-2xl border px-4 text-left",
                      selected[line.id] ? "border-primary bg-primary/10" : "border-border bg-card",
                      line.remainingAmount <= 0 && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{line.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {line.remainingAmount <= 0 ? "Comped" : `${line.quantity}× · ${money(line.remainingAmount)} left`}
                      </span>
                    </span>
                    <span className="tabular-nums text-sm font-bold">{money(line.lineTotal)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              Comp the remaining {money(Math.max(0, view.merchandiseSubtotal - view.compAmount))} merchandise on this
              check. Tax and service will recalculate to a {money(0)} payable.
            </p>
          )}
          {resolved && !resolved.ok ? <p className="text-sm text-destructive">{resolved.message}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={onBack}>
              Back
            </Button>
            <Button
              type="button"
              className="h-14 rounded-2xl text-base font-bold"
              disabled={!resolved?.ok}
              onClick={() => setStep("reason")}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "reason" ? (
        <div className="space-y-3">
          <Label htmlFor="rm-adjust-comp-reason">Reason</Label>
          <Textarea
            id="rm-adjust-comp-reason"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this being comped?"
            className="min-h-28 rounded-2xl text-base"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={() => setStep("enter")} disabled={busy}>
              Back
            </Button>
            <Button
              type="button"
              className="h-14 rounded-2xl text-base font-bold"
              disabled={reason.trim().length < 3}
              onClick={() => setStep("review")}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <ReviewConfirm
          view={view}
          proposed={proposed}
          comparison={comparison}
          reason={reason}
          money={money}
          busy={busy}
          confirmReady={confirmReady}
          confirmLabel={busy ? "Saving…" : "Confirm comp"}
          onBack={() => setStep("reason")}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}

function ReviewConfirm({
  view,
  proposed,
  comparison,
  reason,
  money,
  busy,
  confirmReady,
  confirmLabel,
  onBack,
  onConfirm,
}: {
  view: AdjustCheckView;
  proposed: ReturnType<typeof computeAdjustedRmBill> | null;
  comparison: ReturnType<typeof payableWasNow> | null;
  reason: string;
  money: (value: number) => string;
  busy: boolean;
  confirmReady: boolean;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
        <Row label="Restaurant check" value={`#${view.orderNumber}`} />
        <Row label="Payable was" value={money(view.bill.payable)} />
        <Row label="Payable now" value={money(proposed?.payable ?? view.bill.payable)} />
        {comparison ? <Row label="Change" value={money(comparison.delta)} /> : null}
        <Row label="Reason" value={reason.trim()} />
      </div>
      {proposed ? (
        <div className="rounded-2xl border border-border p-3">
          <BillTotals bill={proposed} money={money} density="till" />
        </div>
      ) : null}
      {proposed && canCompleteCompedOrder({ payable: proposed.payable, adjustable: true }) ? (
        <p className="text-sm text-muted-foreground">
          After confirm, payable will be {money(0)}. Complete (comped) without taking cash or card.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-14 rounded-2xl" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button
          type="button"
          className="h-14 rounded-2xl text-base font-bold"
          disabled={!confirmReady || busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function StepPips({ steps, current }: { steps: string[]; current: string }) {
  return (
    <ol className="grid grid-cols-3 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {steps.map((value) => (
        <li
          key={value}
          className={cn("rounded-full px-1 py-1", current === value ? "bg-primary text-primary-foreground" : "bg-muted")}
        >
          {value === "enter" ? "Enter" : value === "reason" ? "Reason" : "Review"}
        </li>
      ))}
    </ol>
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

export function AdjustmentHistory({
  history,
  money,
  dateTime,
}: {
  history: AdjustCheckView["history"];
  money: (value: number) => string;
  dateTime: (value: string) => string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-lg">Adjustment history</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No discounts or comps on this restaurant check.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {history.map((row) => (
            <li key={row.id} className="flex justify-between gap-4">
              <span>
                {adjustKindLabel(row.kind)}
                <span className="block text-xs text-muted-foreground">
                  {dateTime(row.createdAt)}
                  {row.actorName ? ` · ${row.actorName}` : ""}
                  {row.reason ? ` · ${row.reason}` : ""}
                  {row.payableWas != null && row.payableNow != null
                    ? ` · ${money(row.payableWas)} → ${money(row.payableNow)}`
                    : ""}
                </span>
              </span>
              <span className="tabular-nums">{row.amount > 0 ? `−${money(row.amount)}` : money(0)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
