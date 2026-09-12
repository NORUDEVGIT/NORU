import { useEffect, useMemo, useState } from "react";
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
import { stepRailState } from "@/packages/pms/lib/fo-check-in";
import {
  CHECK_OUT_STEPS,
  CHECK_OUT_STEP_META,
  CLOSE_REQUIRED_BANNER,
  CREDIT_BLOCK_BANNER,
  EMAIL_NOT_CONFIGURED_MESSAGE,
  FOLIO_LEFT_OPEN_CHIP,
  OVERRIDE_CREDIT_TITLE,
  OVERRIDE_UNPAID_TITLE,
  REFUND_IN_CASHIERING_CTA,
  SETTLE_REQUIRED_BANNER,
  SETTLEMENT_METHOD_CHIPS,
  STAY_NOT_IN_HOUSE_MESSAGE,
  canCompleteCheckOut,
  canContinueClose,
  canContinueFolio,
  canContinueSettle,
  canContinueStay,
  cashieringRefundHref,
  formatCheckoutMoney,
  isCreditBalance,
  isFolioSettled,
  isOwesBalance,
  outstandingAmount,
  overrideKindForBalance,
  paymentAmountAllowed,
  renderCheckoutDocumentHtml,
  type CheckOutDocumentSnapshot,
  type CheckOutStepId,
  type SettlementMethodChipId,
} from "@/packages/pms/lib/fo-check-out";
import {
  closeFolioAtCheckout,
  completeFoCheckOut,
  ensureCheckOutFolio,
  getCheckOutContext,
  overrideCheckOutSettlement,
  postCheckOutPayment,
  sendCheckOutDocumentEmail,
} from "@/packages/pms/lib/fo-check-out.functions";
import { cn } from "@/shared/lib/utils";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoCheckOutStepper({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const [step, setStep] = useState<CheckOutStepId>("stay");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<SettlementMethodChipId>("cash");
  const [payRef, setPayRef] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [emailTo, setEmailTo] = useState("");

  const fetchContext = useServerFn(getCheckOutContext);
  const ensureFolio = useServerFn(ensureCheckOutFolio);
  const postPayment = useServerFn(postCheckOutPayment);
  const overrideFn = useServerFn(overrideCheckOutSettlement);
  const closeFn = useServerFn(closeFolioAtCheckout);
  const emailFn = useServerFn(sendCheckOutDocumentEmail);
  const complete = useServerFn(completeFoCheckOut);

  const contextQuery = useQuery({
    queryKey: ["fo-check-out", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });
  const ctx = contextQuery.data;
  const folio = ctx?.folio;
  const balance = folio?.balance ?? 0;
  const override = ctx?.override.recorded ?? false;

  useEffect(() => {
    if (!open) return;
    setStep("stay");
    setConfirmCancel(false);
    setDirty(false);
    setDenyMessage(null);
    setLedgerOpen(false);
    setDocumentOpen(false);
    setPayAmount("");
    setPayMethod("cash");
    setPayRef("");
    setOverrideReason("");
  }, [open, stay.id]);

  useEffect(() => {
    if (!ctx) return;
    setEmailTo((prev) => prev || ctx.guestEmail || "");
    if (isOwesBalance(ctx.folio.balance)) {
      setPayAmount(outstandingAmount(ctx.folio.balance).toFixed(2));
    } else {
      setPayAmount("");
    }
  }, [ctx]);

  useEffect(() => {
    if (!open || step !== "folio") return;
    if (ctx?.folio.folioId) return;
    if (contextQuery.isLoading || contextQuery.isError) return;
    void ensureFolio({ data: { restaurantId, reservationId: stay.id } })
      .then(() => contextQuery.refetch())
      .catch((error: unknown) => {
        if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
        else toast.error(errorText(error));
      });
    // Folio open is a Step B entry side-effect; refetch is owned by the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, restaurantId, stay.id, ctx?.folio.folioId, contextQuery.isLoading, contextQuery.isError]);

  const stayOk = canContinueStay({
    loaded: Boolean(ctx) && !contextQuery.isLoading,
    status: ctx?.stay.status ?? stay.status,
  });
  const folioOk = canContinueFolio({ folioId: folio?.folioId ?? null });
  const settleOk = canContinueSettle({ balance, override });
  const closeOk = canContinueClose({
    balance,
    override,
    folioStatus: folio?.status ?? null,
  });
  const completeOk = canCompleteCheckOut({ stayOk, folioOk, settleOk, closeOk });

  const currentIndex = CHECK_OUT_STEPS.indexOf(step);
  const currentBlocked =
    (step === "stay" && !stayOk) ||
    (step === "folio" && !folioOk) ||
    (step === "settle" && !settleOk) ||
    (step === "close" && !closeOk) ||
    (step === "complete" && !completeOk);

  function markDirty() {
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setConfirmCancel(true);
    else onOpenChange(false);
  }

  function refreshDesk() {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["fo-check-out"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard"] });
  }

  const postPayMut = useMutation({
    mutationFn: () =>
      postPayment({
        data: {
          restaurantId,
          reservationId: stay.id,
          amount: Number(payAmount),
          method: payMethod,
          reference: payRef,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      setPayRef("");
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const overrideMut = useMutation({
    mutationFn: () =>
      overrideFn({ data: { restaurantId, reservationId: stay.id, reason: overrideReason.trim() } }),
    onSuccess: async () => {
      setOverrideReason("");
      setDenyMessage(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const closeMut = useMutation({
    mutationFn: () => closeFn({ data: { restaurantId, reservationId: stay.id } }),
    onSuccess: async () => {
      await contextQuery.refetch();
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDenyMessage(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const emailMut = useMutation({
    mutationFn: () =>
      emailFn({ data: { restaurantId, reservationId: stay.id, toEmail: emailTo } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Guest document emailed.");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const completeMut = useMutation({
    mutationFn: () => complete({ data: { restaurantId, reservationId: stay.id } }),
    onSuccess: (result) => {
      toast.success(
        `${ctx?.stay.guestName ?? stay.guestName} checked out${result.roomNumber ? ` · Room ${result.roomNumber}` : ""}.`,
      );
      refreshDesk();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function goBack() {
    const idx = CHECK_OUT_STEPS.indexOf(step);
    if (idx > 0) setStep(CHECK_OUT_STEPS[idx - 1] ?? "stay");
  }

  function onContinue() {
    if (step === "stay" && stayOk) {
      setStep("folio");
      return;
    }
    if (step === "folio" && folioOk) {
      setStep("settle");
      return;
    }
    if (step === "settle" && settleOk) {
      setStep("close");
      return;
    }
    if (step === "close" && closeOk) {
      setStep("complete");
    }
  }

  const remaining = outstandingAmount(balance);
  const payValue = Number(payAmount);
  const canPostPay = paymentAmountAllowed(payValue, remaining);
  const overrideKind = overrideKindForBalance(balance);
  const continueDisabled =
    (step === "stay" && !stayOk) ||
    (step === "folio" && !folioOk) ||
    (step === "settle" && !settleOk) ||
    (step === "close" && !closeOk) ||
    (step === "complete" && (!completeOk || completeMut.isPending));

  const guestLabel = ctx?.stay.guestName ?? stay.guestName;
  const confirmation = ctx?.stay.confirmationNumber ?? stay.confirmationNumber;
  const dates = `${formatStayDate(stay.arrivalDate)} → ${formatStayDate(stay.departureDate)}`;
  const snapshot = useMemo<CheckOutDocumentSnapshot | null>(() => {
    if (!ctx || !folio?.folioId) return null;
    return {
      propertyName: ctx.propertyName,
      guestName: ctx.stay.guestName,
      confirmationNumber: ctx.stay.confirmationNumber,
      folioNumber: folio.folioNumber ?? "—",
      roomNumber: ctx.stay.roomNumber,
      arrivalDate: ctx.stay.arrivalDate,
      departureDate: ctx.stay.departureDate,
      currency: folio.currency,
      lines: folio.transactions.map((t) => ({
        description: t.description,
        amount: t.amount,
        type: t.type,
        postedAt: t.postedAt,
      })),
      charges: folio.charges,
      credits: folio.credits,
      balance: folio.balance,
      folioStatus: folio.status ?? "open",
      overrideOpen: override,
    };
  }, [ctx, folio, override]);

  function printDocument() {
    if (!snapshot) return;
    const html = renderCheckoutDocumentHtml(snapshot);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => document.body.removeChild(frame), 1000);
  }

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
          data-testid="fo-check-out-stepper"
          className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        >
          <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
            <SheetTitle className="text-[#251605]">Check out</SheetTitle>
            <SheetDescription>
              {guestLabel} · {confirmation} · {dates}
            </SheetDescription>
          </SheetHeader>

          <nav className="sticky top-0 z-10 shrink-0 border-b border-[#CCCCCC] bg-background px-4 py-3">
            <ol className="flex flex-wrap gap-2">
              {CHECK_OUT_STEP_META.map((meta, index) => {
                const state = stepRailState(index, currentIndex, currentBlocked);
                return (
                  <li key={meta.id}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                        state === "done" && "bg-[#436436]/15 text-[#436436]",
                        state === "current" && "bg-[#C89933]/20 text-[#251605] ring-1 ring-[#C89933]",
                        state === "blocked" && "bg-destructive/10 text-destructive",
                        state === "locked" && "bg-[#CCCCCC]/40 text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold">{meta.letter}</span>
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {contextQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading check-out…</p>
            ) : contextQuery.isError && isPermissionDeniedMessage(contextQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contextQuery.error)} />
            ) : (
              <>
                {denyMessage ? <PermissionDeniedPanel className="mb-4" message={denyMessage} /> : null}

                {step === "stay" ? (
                  <div className="space-y-4">
                    {!stayOk ? (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                        {STAY_NOT_IN_HOUSE_MESSAGE}
                      </p>
                    ) : null}
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
                      {stay.overstay ? " · Overstay" : ""}
                    </p>
                    {stay.specialRequests ? (
                      <p className="text-sm text-muted-foreground">Special requests: {stay.specialRequests}</p>
                    ) : null}
                    {ctx?.rateMissing ? (
                      <p className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]">
                        This stay has no rate on file. You can still continue.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {step === "folio" ? (
                  <div className="space-y-4">
                    {folio?.folioId ? (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <FolioChip label="open" on={folio.status === "open"} />
                          <FolioChip label="closed" on={folio.status === "closed"} />
                          <FolioChip label="settled" on={isFolioSettled(balance)} />
                          <FolioChip label="credit" on={isCreditBalance(balance)} />
                        </div>
                        <p className="text-sm">
                          Folio {folio.folioNumber} · Balance {money(balance)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Charges {money(folio.charges)} · Credits {money(folio.credits)}
                        </p>
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
                  </div>
                ) : null}

                {step === "settle" ? (
                  <div className="space-y-4">
                    {isFolioSettled(balance) ? (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        Settled{folio?.folioNumber ? ` · ${folio.folioNumber}` : ""} · {money(balance)}
                      </p>
                    ) : isCreditBalance(balance) ? (
                      <>
                        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                          {CREDIT_BLOCK_BANNER}
                        </p>
                        <p className="text-sm">
                          Credit {money(Math.abs(balance))}
                          {folio?.folioNumber ? ` on ${folio.folioNumber}` : ""}.
                        </p>
                        <Button asChild className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                          <a href={cashieringRefundHref(folio?.folioNumber)}>
                            {REFUND_IN_CASHIERING_CTA}
                          </a>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                          {SETTLE_REQUIRED_BANNER}
                        </p>
                        <Field label="Amount">
                          <Input
                            type="number"
                            min={0.01}
                            step="0.01"
                            max={remaining}
                            value={payAmount}
                            onChange={(e) => {
                              setPayAmount(e.target.value);
                              markDirty();
                            }}
                          />
                        </Field>
                        <p className="text-xs text-muted-foreground">Outstanding {money(remaining)}.</p>
                        <div className="flex flex-wrap gap-2">
                          {SETTLEMENT_METHOD_CHIPS.map((chip) => (
                            <button
                              key={chip.id}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-sm",
                                payMethod === chip.id
                                  ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]"
                                  : "border-[#CCCCCC] text-muted-foreground",
                              )}
                              onClick={() => setPayMethod(chip.id)}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                        <Field label="Reference">
                          <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                        </Field>
                        <Button
                          type="button"
                          className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                          disabled={!canPostPay || postPayMut.isPending}
                          onClick={() => postPayMut.mutate()}
                        >
                          {postPayMut.isPending ? "Posting…" : "Post payment"}
                        </Button>
                      </>
                    )}

                    {override ? (
                      <p className="inline-flex rounded-full bg-[#C89933] px-2.5 py-1 text-xs font-semibold text-[#251605]">
                        {FOLIO_LEFT_OPEN_CHIP}
                      </p>
                    ) : overrideKind ? (
                      <div className="space-y-2 rounded-xl border border-border p-3">
                        <Label htmlFor="checkout-override">
                          {overrideKind === "credit" ? OVERRIDE_CREDIT_TITLE : OVERRIDE_UNPAID_TITLE}
                        </Label>
                        <Textarea
                          id="checkout-override"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Supervisor reason"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!overrideReason.trim() || overrideMut.isPending}
                          onClick={() => overrideMut.mutate()}
                        >
                          {overrideMut.isPending ? "Saving…" : "Record override"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {step === "close" ? (
                  <div className="space-y-4">
                    {override ? (
                      <p className="rounded-full bg-[#C89933] px-3 py-2 text-sm font-semibold text-[#251605]">
                        {FOLIO_LEFT_OPEN_CHIP}
                      </p>
                    ) : folio?.status === "closed" && isFolioSettled(balance) ? (
                      <p className="rounded-xl bg-[#436436]/15 px-3 py-2 text-sm font-medium text-[#436436]">
                        Folio closed at zero
                      </p>
                    ) : (
                      <>
                        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                          {CLOSE_REQUIRED_BANNER}
                        </p>
                        <Button
                          type="button"
                          className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                          disabled={!isFolioSettled(balance) || closeMut.isPending}
                          onClick={() => closeMut.mutate()}
                        >
                          {closeMut.isPending ? "Closing…" : "Close folio"}
                        </Button>
                      </>
                    )}

                    <div className="space-y-3 rounded-xl border border-border p-3">
                      <p className="text-sm font-medium text-[#251605]">Guest document</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" disabled={!snapshot} onClick={() => setDocumentOpen((v) => !v)}>
                          View
                        </Button>
                        <Button type="button" variant="outline" disabled={!snapshot} onClick={printDocument}>
                          Print
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!ctx?.emailConfigured || emailMut.isPending}
                          title={ctx?.emailConfigured ? undefined : EMAIL_NOT_CONFIGURED_MESSAGE}
                          onClick={() => emailMut.mutate()}
                        >
                          {emailMut.isPending ? "Sending…" : "Email"}
                        </Button>
                      </div>
                      {!ctx?.emailConfigured ? (
                        <p className="text-xs text-muted-foreground">{EMAIL_NOT_CONFIGURED_MESSAGE}</p>
                      ) : (
                        <Field label="Guest email">
                          <Input
                            type="email"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                          />
                        </Field>
                      )}
                      {documentOpen && snapshot ? <CheckoutDocumentView snapshot={snapshot} /> : null}
                    </div>
                  </div>
                ) : null}

                {step === "complete" ? (
                  <div className="space-y-3 text-sm">
                    <SummaryRow
                      label="Stay"
                      value={stay.roomNumber ? `Room ${stay.roomNumber}` : stay.roomTypeName}
                      ok={stayOk}
                    />
                    <SummaryRow
                      label="Folio"
                      value={folio?.folioNumber ?? "required"}
                      ok={folioOk}
                    />
                    <SummaryRow
                      label="Settle"
                      value={
                        override
                          ? FOLIO_LEFT_OPEN_CHIP
                          : isFolioSettled(balance)
                            ? `Settled · ${money(balance)}`
                            : money(balance)
                      }
                      ok={settleOk}
                    />
                    <SummaryRow
                      label="Close"
                      value={
                        override
                          ? FOLIO_LEFT_OPEN_CHIP
                          : folio?.status === "closed"
                            ? "closed"
                            : "open"
                      }
                      ok={closeOk}
                    />
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
                {step === "complete" ? (
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    disabled={continueDisabled}
                    onClick={() => completeMut.mutate()}
                  >
                    {completeMut.isPending ? "Checking out…" : "Complete check-out"}
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

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave check-out?</AlertDialogTitle>
            <AlertDialogDescription>
              Posted payments stay on the folio. The stay stays in-house until Complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FolioChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-center",
        on ? "bg-[#436436]/15 text-[#436436]" : "bg-[#CCCCCC]/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
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

function CheckoutDocumentView({ snapshot }: { snapshot: CheckOutDocumentSnapshot }) {
  return (
    <div className="fo-check-out-document space-y-2 bg-white px-3 py-4 text-[#251605]">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#C89933]">NORU</p>
      <p className="font-display text-lg">{snapshot.propertyName}</p>
      <p className="text-sm">
        Guest document · Folio {snapshot.folioNumber}
      </p>
      <p className="text-sm">
        {snapshot.guestName} · {snapshot.confirmationNumber}
      </p>
      <p className="text-xs text-muted-foreground">
        {snapshot.roomNumber ? `Room ${snapshot.roomNumber}` : "Room unassigned"} ·{" "}
        {formatStayDate(snapshot.arrivalDate)} → {formatStayDate(snapshot.departureDate)}
      </p>
      <ul className="space-y-1 text-sm">
        {snapshot.lines.map((line, index) => (
          <li key={`${line.description}-${index}`} className="flex justify-between gap-3">
            <span>{line.description}</span>
            <span className="tabular-nums">{formatCheckoutMoney(line.amount, snapshot.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">Charges {formatCheckoutMoney(snapshot.charges, snapshot.currency)}</p>
      <p className="text-sm">Credits {formatCheckoutMoney(snapshot.credits, snapshot.currency)}</p>
      <p className="text-sm font-semibold">
        Balance {formatCheckoutMoney(snapshot.balance, snapshot.currency)}
      </p>
      {snapshot.overrideOpen ? (
        <p className="rounded-full bg-[#C89933] px-2.5 py-1 text-xs font-semibold">{FOLIO_LEFT_OPEN_CHIP}</p>
      ) : null}
    </div>
  );
}
