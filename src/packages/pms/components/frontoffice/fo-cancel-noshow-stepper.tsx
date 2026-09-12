import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import {
  CANCEL_NOSHOW_STEPS,
  CANCEL_STEP_META,
  FEE_REQUIRED_BANNER,
  NOSHOW_STEP_META,
  REFUND_IN_CASHIERING_CTA,
  SUGGEST_FIRST_NIGHT_LABEL,
  canCompleteCancel,
  canContinueMoney,
  canContinueReason,
  cashieringRefundHref,
  feeAmountAllowed,
  folioDepositLines,
  isCreditBalance,
  isFeeSatisfied,
  noFeeRequiredLabel,
  stepRailState,
  type CancelNoShowKind,
  type CancelNoShowStepId,
} from "@/packages/pms/lib/fo-cancel-noshow";
import {
  completeFoCancel,
  completeFoNoShow,
  ensureCancelNoShowFolio,
  getCancelNoShowContext,
  postCancelOrNoShowFee,
  waiveCancelOrNoShowFee,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { cn } from "@/shared/lib/utils";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoCancelNoShowStepper({
  restaurantId,
  stay,
  today,
  kind,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  today?: string;
  kind: CancelNoShowKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const [step, setStep] = useState<CancelNoShowStepId>("stay");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const fetchContext = useServerFn(getCancelNoShowContext);
  const ensureFolio = useServerFn(ensureCancelNoShowFolio);
  const postFee = useServerFn(postCancelOrNoShowFee);
  const waiveFn = useServerFn(waiveCancelOrNoShowFee);
  const completeCancel = useServerFn(completeFoCancel);
  const completeNoShow = useServerFn(completeFoNoShow);

  const contextQuery = useQuery({
    queryKey: ["fo-cancel-noshow", kind, restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id, kind } }),
    enabled: open,
    retry: false,
  });
  const ctx = contextQuery.data;
  const folio = ctx?.folio;
  const policy = ctx?.policy;
  const posted = ctx?.posted ?? false;
  const waived = ctx?.waived ?? false;
  const required = policy?.required ?? true;

  useEffect(() => {
    if (!open) return;
    setStep("stay");
    setConfirmLeave(false);
    setDirty(false);
    setDenyMessage(null);
    setReason("");
    setFeeAmount("");
    setWaiveReason("");
    setLedgerOpen(false);
  }, [open, stay.id, kind]);

  useEffect(() => {
    if (!ctx) return;
    if (ctx.policy.defaultAmount > 0) {
      setFeeAmount((prev) => prev || ctx.policy.defaultAmount.toFixed(2));
    }
  }, [ctx]);

  useEffect(() => {
    if (!open || step !== "money") return;
    if (ctx?.folio.folioId) return;
    if (contextQuery.isLoading || contextQuery.isError) return;
    void ensureFolio({ data: { restaurantId, reservationId: stay.id } })
      .then(() => contextQuery.refetch())
      .catch((error: unknown) => {
        if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
        else toast.error(errorText(error));
      });
    // Folio open is a Step C entry side-effect; refetch is owned by the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, restaurantId, stay.id, ctx?.folio.folioId, contextQuery.isLoading, contextQuery.isError]);

  const reasonOk = canContinueReason(reason);
  const feeOk = isFeeSatisfied({ required, posted, waived });
  const moneyOk = canContinueMoney({ required, posted, waived });
  const confirmOk = canCompleteCancel({ reasonOk, feeOk });

  const currentIndex = CANCEL_NOSHOW_STEPS.indexOf(step);
  const currentBlocked =
    (step === "reason" && !reasonOk) ||
    (step === "money" && !moneyOk) ||
    (step === "confirm" && !confirmOk);

  const meta = kind === "cancel" ? CANCEL_STEP_META : NOSHOW_STEP_META;

  function markDirty() {
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setConfirmLeave(true);
    else onOpenChange(false);
  }

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-cancel-noshow"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations-cancelled"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-walk-ins"] });
  }

  const postMut = useMutation({
    mutationFn: () =>
      postFee({
        data: {
          restaurantId,
          reservationId: stay.id,
          kind,
          amount: Number(feeAmount),
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const waiveMut = useMutation({
    mutationFn: () =>
      waiveFn({
        data: {
          restaurantId,
          reservationId: stay.id,
          kind,
          reason: waiveReason.trim(),
        },
      }),
    onSuccess: async () => {
      setWaiveReason("");
      setDenyMessage(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const completeMut = useMutation({
    mutationFn: () =>
      kind === "cancel"
        ? completeCancel({ data: { restaurantId, reservationId: stay.id, reason: reason.trim() } })
        : completeNoShow({
            data: {
              restaurantId,
              reservationId: stay.id,
              reason: reason.trim(),
              today: today ?? stay.arrivalDate,
            },
          }),
    onSuccess: () => {
      toast.success(kind === "cancel" ? "Reservation cancelled." : "Marked as no-show.");
      refreshDesk();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function goBack() {
    const idx = CANCEL_NOSHOW_STEPS.indexOf(step);
    if (idx > 0) setStep(CANCEL_NOSHOW_STEPS[idx - 1] ?? "stay");
  }

  function onContinue() {
    if (step === "stay") {
      setStep("reason");
      return;
    }
    if (step === "reason" && reasonOk) {
      setStep("money");
      return;
    }
    if (step === "money" && moneyOk) {
      setStep("confirm");
    }
  }

  const payValue = Number(feeAmount);
  const canPost = feeAmountAllowed(payValue) && !posted;
  const continueDisabled =
    (step === "reason" && !reasonOk) ||
    (step === "money" && !moneyOk) ||
    (step === "confirm" && (!confirmOk || completeMut.isPending));

  const guestLabel = ctx?.stay.guestName ?? stay.guestName;
  const confirmation = ctx?.stay.confirmationNumber ?? stay.confirmationNumber;
  const dates = `${formatStayDate(stay.arrivalDate)} → ${formatStayDate(stay.departureDate)}`;
  const deposits = folio ? folioDepositLines(folio.transactions) : [];
  const title = kind === "cancel" ? "Cancel reservation" : "Mark as no-show";
  const confirmLabel = kind === "cancel" ? "Confirm cancellation" : "Confirm no-show";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent
          side="right"
          data-testid={kind === "cancel" ? "fo-cancel-stepper" : "fo-no-show-stepper"}
          className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        >
          <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
            <SheetTitle className="text-[#251605]">{title}</SheetTitle>
            <SheetDescription>
              {guestLabel} · {confirmation} · {dates}
            </SheetDescription>
          </SheetHeader>

          <nav className="sticky top-0 z-10 shrink-0 border-b border-[#CCCCCC] bg-background px-4 py-3">
            <ol className="flex flex-wrap gap-2">
              {meta.map((item, index) => {
                const state = stepRailState(index, currentIndex, currentBlocked);
                return (
                  <li key={item.id}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                        state === "done" && "bg-[#436436]/15 text-[#436436]",
                        state === "current" && "bg-[#C89933]/20 text-[#251605] ring-1 ring-[#C89933]",
                        state === "blocked" && "bg-destructive/10 text-destructive",
                        state === "locked" && "bg-[#CCCCCC]/40 text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold">{item.letter}</span>
                      {item.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {contextQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : contextQuery.isError && isPermissionDeniedMessage(contextQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contextQuery.error)} />
            ) : (
              <>
                {denyMessage ? <PermissionDeniedPanel className="mb-4" message={denyMessage} /> : null}

                {step === "stay" ? (
                  <div className="space-y-4">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guest</dt>
                        <dd>{guestLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room</dt>
                        <dd>{stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
                        <dd>{dates}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guests</dt>
                        <dd>
                          {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                          {stay.children ? ` · ${stay.children} child` : ""}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                      {stay.roomTypeName} · {stay.nights} night{stay.nights === 1 ? "" : "s"}
                    </p>
                    {stay.specialRequests ? (
                      <p className="text-sm text-muted-foreground">Special requests: {stay.specialRequests}</p>
                    ) : null}
                    {ctx?.rateMissing ? (
                      <p className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]">
                        This stay has no rate on file. First-night suggest stays hidden.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {step === "reason" ? (
                  <div className="space-y-3">
                    {!reasonOk ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                        Enter a reason of at least 3 characters.
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="fo-fs3-reason">Reason</Label>
                      <Textarea
                        id="fo-fs3-reason"
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          markDirty();
                        }}
                        rows={4}
                      />
                    </div>
                  </div>
                ) : null}

                {step === "money" ? (
                  <div className="space-y-4">
                    {!required ? (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        {noFeeRequiredLabel(kind)}
                      </p>
                    ) : !feeOk ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                        {FEE_REQUIRED_BANNER}
                      </p>
                    ) : posted ? (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        {kind === "cancel" ? "Cancel fee posted" : "No-show charge posted"}
                      </p>
                    ) : (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        Fee waived
                      </p>
                    )}

                    {folio?.folioId ? (
                      <>
                        <p className="text-sm">
                          Folio {folio.folioNumber} · Balance {money(folio.balance)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Charges {money(folio.charges)} · Credits {money(folio.credits)}
                        </p>
                        <div className="rounded-xl border border-border p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Deposits</p>
                          {deposits.length === 0 ? (
                            <p className="mt-1 text-sm text-muted-foreground">No deposit on this folio.</p>
                          ) : (
                            <ul className="mt-2 space-y-1 text-sm">
                              {deposits.map((line) => (
                                <li key={line.id ?? line.description} className="flex justify-between gap-3">
                                  <span>{line.description}</span>
                                  <span className="tabular-nums">{money(Math.abs(line.amount))}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {isCreditBalance(folio.balance) ? (
                          <Button asChild className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                            <a href={cashieringRefundHref(folio.folioNumber)}>{REFUND_IN_CASHIERING_CTA}</a>
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className="text-sm font-medium text-[#251605] underline-offset-4 hover:underline"
                          onClick={() => setLedgerOpen((v) => !v)}
                        >
                          {ledgerOpen ? "Hide ledger" : "Show ledger"}
                        </button>
                        {ledgerOpen ? (
                          <ul className="space-y-2 rounded-xl border border-border p-3 text-sm">
                            {folio.transactions.length === 0 ? (
                              <li className="text-muted-foreground">No folio lines yet.</li>
                            ) : (
                              folio.transactions.map((line) => (
                                <li key={line.id} className="flex justify-between gap-3">
                                  <span>{line.description}</span>
                                  <span className="tabular-nums">{money(line.amount)}</span>
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Opening the Cashiering folio…</p>
                    )}

                    {required && !posted && !waived ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="fo-fs3-fee-amount">
                            {kind === "cancel" ? "Cancel fee" : "No-show charge"}
                          </Label>
                          <Input
                            id="fo-fs3-fee-amount"
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={feeAmount}
                            onChange={(e) => {
                              setFeeAmount(e.target.value);
                              markDirty();
                            }}
                          />
                        </div>
                        {ctx?.suggestedFirstNight != null ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setFeeAmount(ctx.suggestedFirstNight!.toFixed(2));
                              markDirty();
                            }}
                          >
                            {SUGGEST_FIRST_NIGHT_LABEL}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                          disabled={!canPost || postMut.isPending}
                          onClick={() => postMut.mutate()}
                        >
                          {postMut.isPending ? "Posting…" : kind === "cancel" ? "Post cancel fee" : "Post no-show charge"}
                        </Button>
                        <div className="space-y-2 rounded-xl border border-border p-3">
                          <Label htmlFor="fo-fs3-waive">Waive (owner or manager)</Label>
                          <Textarea
                            id="fo-fs3-waive"
                            value={waiveReason}
                            onChange={(e) => setWaiveReason(e.target.value)}
                            placeholder="Supervisor reason"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!waiveReason.trim() || waiveMut.isPending}
                            onClick={() => waiveMut.mutate()}
                          >
                            {waiveMut.isPending ? "Saving…" : "Waive fee"}
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {step === "confirm" ? (
                  <div className="space-y-3 text-sm">
                    {!confirmOk && required && !feeOk ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
                        {FEE_REQUIRED_BANNER}
                      </p>
                    ) : null}
                    <SummaryRow label="Stay" value={stay.roomNumber ? `Room ${stay.roomNumber}` : stay.roomTypeName} ok />
                    <SummaryRow label="Reason" value={reason.trim() || "required"} ok={reasonOk} />
                    <SummaryRow
                      label={kind === "cancel" ? "Cancel fee" : "No-show charge"}
                      value={
                        !required
                          ? noFeeRequiredLabel(kind)
                          : waived
                            ? "Waived"
                            : posted
                              ? "Posted"
                              : "Required"
                      }
                      ok={feeOk}
                    />
                    {folio?.folioNumber ? (
                      <p className="text-xs text-muted-foreground">
                        Folio {folio.folioNumber} · Balance {money(folio.balance)}
                      </p>
                    ) : null}
                    {folio && isCreditBalance(folio.balance) ? (
                      <Button asChild variant="outline">
                        <a href={cashieringRefundHref(folio.folioNumber)}>{REFUND_IN_CASHIERING_CTA}</a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-[#CCCCCC] bg-background px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={step === "stay"} onClick={goBack}>
                  Back
                </Button>
                {step === "confirm" ? (
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    disabled={continueDisabled}
                    onClick={() => completeMut.mutate()}
                  >
                    {completeMut.isPending ? "Saving…" : confirmLabel}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    disabled={continueDisabled}
                    onClick={onContinue}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{kind === "cancel" ? "Leave cancellation?" : "Leave no-show?"}</AlertDialogTitle>
            <AlertDialogDescription>
              Posted fees stay on the folio. The reservation status is unchanged until Confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLeave(false);
                onOpenChange(false);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "font-medium text-[#436436]" : "font-medium text-destructive"}>{value}</span>
    </div>
  );
}
