import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  NOSHOW_REASON_OPTIONS,
  composeNoShowReason,
} from "@/packages/pms/lib/reservation-noshow-workspace";
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
import { RoomUnitTargetSelect } from "@/packages/pms/components/frontoffice/room-unit-target-select";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import { useMoney } from "@/core/state/property-format";
import {
  CANCEL_NOSHOW_STEPS,
  REFUND_IN_CASHIERING_CTA,
  canCompleteCancel,
  canContinueMoney,
  canContinueReason,
  cashieringRefundHref,
  feeAmountAllowed,
  folioDepositLines,
  isCreditBalance,
  isFeeSatisfied,
  noFeeRequiredLabel,
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
import { getNoShowReadiness } from "@/packages/pms/lib/fo-no-show-readiness.functions";
import { cn } from "@/shared/lib/utils";

const HEADER_BG = "bg-[#1F140A]";
const CONTROL =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A]";
const COMPACT_TEXTAREA =
  "min-h-[2.25rem] w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-1.5 text-sm leading-snug text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A]";
const SELECT =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus-visible:border-[#8A641A] focus-visible:ring-1 focus-visible:ring-[#8A641A]";
const OUTLINE =
  "h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]";

const NOSHOW_STEP_LABELS: Record<CancelNoShowStepId, string> = {
  stay: "Stay",
  reason: "Reason",
  money: "Charge",
  confirm: "Confirm",
};

const CANCEL_STEP_LABELS: Record<CancelNoShowStepId, string> = {
  stay: "Stay",
  reason: "Reason",
  money: "Cancellation Fee",
  confirm: "Confirm",
};

const FROZEN_NOSHOW_CHARGE_MESSAGE = "The no-show charge must match the frozen policy amount.";
const NOSHOW_CHARGE_CONTINUE = "Post or waive the charge to continue";
const CANCEL_FEE_CONTINUE = "Post or waive the fee to continue";

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
  initialReservationRoomId,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  today?: string;
  kind: CancelNoShowKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialReservationRoomId?: string;
}) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const [step, setStep] = useState<CancelNoShowStepId>("stay");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denyMessage, setDenyMessage] = useState<string | null>(null);
  const feeKey = useRef(crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(NOSHOW_REASON_OPTIONS[0].value);
  const [internalNote, setInternalNote] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [postFieldError, setPostFieldError] = useState<string | null>(null);
  const [reservationRoomId, setReservationRoomId] = useState(
    stay.reservationRoomId ?? initialReservationRoomId ?? "",
  );
  const multiRoom = (stay.roomUnits?.length ?? 0) > 1;

  const fetchContext = useServerFn(getCancelNoShowContext);
  const ensureFolio = useServerFn(ensureCancelNoShowFolio);
  const postFee = useServerFn(postCancelOrNoShowFee);
  const waiveFn = useServerFn(waiveCancelOrNoShowFee);
  const completeCancel = useServerFn(completeFoCancel);
  const completeNoShow = useServerFn(completeFoNoShow);
  const fetchNoShowReadiness = useServerFn(getNoShowReadiness);

  const contextQuery = useQuery({
    queryKey: ["fo-cancel-noshow", kind, restaurantId, stay.id, reservationRoomId],
    queryFn: () =>
      fetchContext({
        data: {
          restaurantId,
          reservationId: stay.id,
          kind,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: open,
    retry: false,
  });
  const ctx = contextQuery.data;
  const readinessQuery = useQuery({
    queryKey: ["fo-no-show-readiness", restaurantId, stay.id, reservationRoomId],
    queryFn: () =>
      fetchNoShowReadiness({
        data: {
          restaurantId,
          reservationId: stay.id,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: open && kind === "noshow",
    retry: false,
  });
  const frozenNoShowAmount = readinessQuery.data?.fee.penalty.amount ?? null;
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);
  const approvalQuery = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "front_office.fee.override"],
    queryFn: () =>
      fetchApproval({ data: { restaurantId, actionKey: "front_office.fee.override" } }),
    enabled: open,
    retry: false,
  });
  const feeAuth = approvalQuery.data;
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
    setReasonCode(NOSHOW_REASON_OPTIONS[0].value);
    setInternalNote("");
    setFeeAmount("");
    setWaiveReason("");
    setLedgerOpen(false);
    setWaiveOpen(false);
    setPostFieldError(null);
    setReservationRoomId(stay.reservationRoomId ?? initialReservationRoomId ?? "");
  }, [open, stay.id, stay.reservationRoomId, initialReservationRoomId, kind]);

  useEffect(() => {
    if (kind === "noshow") {
      if (frozenNoShowAmount != null && Number.isFinite(frozenNoShowAmount) && frozenNoShowAmount > 0) {
        setFeeAmount(frozenNoShowAmount.toFixed(2));
      }
      return;
    }
    if (!ctx) return;
    if (ctx.policy.defaultAmount > 0) {
      setFeeAmount(ctx.policy.defaultAmount.toFixed(2));
    }
  }, [ctx, kind, frozenNoShowAmount]);

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
  }, [
    open,
    step,
    restaurantId,
    stay.id,
    ctx?.folio.folioId,
    contextQuery.isLoading,
    contextQuery.isError,
  ]);

  const composedNoShowReason = composeNoShowReason(reasonCode, internalNote);
  const submittedReason = kind === "noshow" ? composedNoShowReason : reason;
  const reasonOk = canContinueReason(submittedReason);
  const feeOk = isFeeSatisfied({ required, posted, waived });
  const moneyOk = canContinueMoney({ required, posted, waived });
  const confirmOk = canCompleteCancel({ reasonOk, feeOk });

  const currentIndex = CANCEL_NOSHOW_STEPS.indexOf(step);

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
          amount:
            kind === "noshow"
              ? Number(frozenNoShowAmount)
              : Number(
                  ctx?.policy.defaultAmount && ctx.policy.defaultAmount > 0
                    ? ctx.policy.defaultAmount
                    : feeAmount,
                ),
          idempotencyKey: feeKey.current,
          ...(kind === "noshow" && reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    onSuccess: async () => {
      feeKey.current = crypto.randomUUID();
      setDirty(false);
      setPostFieldError(null);
      await contextQuery.refetch();
    },
    onError: (error) => {
      const message = errorText(error);
      if (kind === "noshow" && message === FROZEN_NOSHOW_CHARGE_MESSAGE) {
        setPostFieldError(message);
        return;
      }
      if (isPermissionDeniedMessage(error)) setDenyMessage(message);
      else toast.error(message);
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
    mutationFn: async (): Promise<{ id: string; status: string }> => {
      const room = reservationRoomId ? { reservationRoomId } : {};
      if (kind === "cancel") {
        return completeCancel({
          data: { restaurantId, reservationId: stay.id, reason: submittedReason.trim(), ...room },
        });
      }
      return completeNoShow({
        data: {
          restaurantId,
          reservationId: stay.id,
          reason: submittedReason.trim(),
          today: today ?? stay.arrivalDate,
          ...room,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        kind === "cancel"
          ? multiRoom
            ? "That room was cancelled."
            : "Reservation cancelled."
          : multiRoom
            ? "That room was marked as a no-show."
            : "Marked as no-show.",
      );
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
      if (multiRoom && !reservationRoomId) return;
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

  const canonicalCancelAmount =
    policy && Number.isFinite(policy.defaultAmount) && policy.defaultAmount > 0
      ? policy.defaultAmount
      : null;
  const cancelAmountLocked = canonicalCancelAmount != null;
  const payValue =
    kind === "noshow"
      ? Number(frozenNoShowAmount)
      : Number(cancelAmountLocked ? canonicalCancelAmount : feeAmount);
  const canPost = feeAmountAllowed(payValue) && !posted;
  const continueDisabled =
    (step === "stay" && multiRoom && !reservationRoomId) ||
    (step === "reason" && !reasonOk) ||
    (step === "money" && !moneyOk) ||
    (step === "confirm" && (!confirmOk || completeMut.isPending));

  const guestLabel = ctx?.stay.guestName ?? stay.guestName;
  const confirmation = ctx?.stay.confirmationNumber ?? stay.confirmationNumber;
  const dates = `${formatStayDate(stay.arrivalDate)} → ${formatStayDate(stay.departureDate)}`;
  const deposits = folio ? folioDepositLines(folio.transactions) : [];
  const depositTotal = deposits.reduce((sum, line) => sum + Math.abs(line.amount), 0);
  const title = kind === "cancel" ? "Cancel Reservation" : "Mark as No-Show";
  const confirmLabel = kind === "cancel" ? "Confirm Cancellation" : "Confirm No-Show";
  const roomChip = stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned";
  const chargeStatus = !required
    ? noFeeRequiredLabel(kind)
    : waived
      ? "Waived"
      : posted
        ? "Posted"
        : "Required";
  const frozenChargeLabel =
    frozenNoShowAmount != null && Number.isFinite(frozenNoShowAmount)
      ? money(frozenNoShowAmount)
      : "—";
  const cancelFeeLabel =
    canonicalCancelAmount != null
      ? money(canonicalCancelAmount)
      : feeAmount
        ? money(Number(feeAmount) || 0)
        : "—";
  const displayedFeeAmount = kind === "noshow" ? frozenChargeLabel : cancelFeeLabel;
  const chargeAmountLabel = !required
    ? noFeeRequiredLabel(kind)
    : waived
      ? "Waived"
      : displayedFeeAmount;
  const moneyContinueCopy = kind === "noshow" ? NOSHOW_CHARGE_CONTINUE : CANCEL_FEE_CONTINUE;
  const footerBlocker =
    step === "stay" && multiRoom && !reservationRoomId
      ? "Choose which room this applies to"
      : step === "reason" && !reasonOk
        ? "Enter a reason"
        : step === "money" && !moneyOk
          ? moneyContinueCopy
          : step === "confirm" && !confirmOk
            ? moneyContinueCopy
            : null;
  const visibleSteps = CANCEL_NOSHOW_STEPS.map((id) => ({
    id,
    label: kind === "noshow" ? NOSHOW_STEP_LABELS[id] : CANCEL_STEP_LABELS[id],
  }));

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent
          data-testid={kind === "cancel" ? "fo-cancel-stepper" : "fo-no-show-stepper"}
          className="z-[70] flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[640px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[640px] [&>button:last-child]:text-[#F3E9D8]"
        >
          <header className={cn(HEADER_BG, "shrink-0 px-4 py-2 pr-12 text-[#F3E9D8]")}>
            <DialogTitle className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
              <span>{title}</span>
              <span className="text-[#8A7A61]">·</span>
              <span className="truncate">{guestLabel}</span>
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#C89933]">
                {confirmation}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                {roomChip}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {guestLabel} · {confirmation} · {dates}
            </DialogDescription>
          </header>

          <nav className="flex h-9 shrink-0 items-center border-b border-[#DDD4C5] bg-white px-3">
            <ol className="flex min-w-0 items-center">
              {visibleSteps.map((item, index) => {
                const done = index < currentIndex;
                const current = index === currentIndex;
                return (
                  <li key={item.id}>
                    <span
                      className={cn(
                        "relative flex h-9 items-center gap-1 px-2.5 text-xs font-medium",
                        done && "text-[#436436]",
                        current && "text-[#251605]",
                        !done && !current && "text-muted-foreground",
                      )}
                    >
                      {done ? <CheckCircle2 className="size-3" /> : null}
                      {item.label}
                      {done ? (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#436436]" />
                      ) : null}
                      {current ? (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F0] px-4 py-3">
            {contextQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : contextQuery.isError && isPermissionDeniedMessage(contextQuery.error) ? (
              <PermissionDeniedPanel message={errorText(contextQuery.error)} />
            ) : (
              <>
                {denyMessage ? (
                  <PermissionDeniedPanel className="mb-4" message={denyMessage} />
                ) : null}

                {step === "stay" ? (
                  <div className="space-y-3">
                    <RoomUnitTargetSelect
                      units={stay.roomUnits}
                      value={reservationRoomId}
                      onChange={setReservationRoomId}
                      locked={Boolean(stay.reservationRoomId)}
                    />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[#DDD4C5] bg-white p-3 text-sm">
                      <StayFact label="Guest" value={guestLabel} />
                      <StayFact label="Confirmation" value={confirmation} />
                      <StayFact label="Stay dates" value={dates} />
                      <StayFact
                        label="Nights"
                        value={`${stay.nights} night${stay.nights === 1 ? "" : "s"}`}
                      />
                      <StayFact label="Room" value={roomChip} />
                      <StayFact label="Room Type" value={stay.roomTypeName ?? "—"} />
                      <StayFact
                        label="Adults / Children"
                        value={`${stay.adults} / ${stay.children}`}
                      />
                    </dl>
                    {kind === "noshow" && ctx?.rateMissing ? (
                      <p className="rounded-lg border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]">
                        This stay has no rate on file. First-night suggest stays hidden.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {step === "reason" ? (
                  <div className="space-y-3 rounded-lg border border-[#DDD4C5] bg-white p-3">
                    {kind === "noshow" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="fo-fs3-reason">No-Show Reason</Label>
                          <Select
                            value={reasonCode}
                            onValueChange={(value) => {
                              setReasonCode(value);
                              markDirty();
                            }}
                          >
                            <SelectTrigger id="fo-fs3-reason" className={SELECT}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NOSHOW_REASON_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="fo-fs3-note">Optional Internal Note</Label>
                          <Textarea
                            id="fo-fs3-note"
                            className={CONTROL}
                            value={internalNote}
                            onChange={(e) => {
                              setInternalNote(e.target.value);
                              markDirty();
                            }}
                            rows={3}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="fo-fs3-reason">Cancellation Reason</Label>
                        <Textarea
                          id="fo-fs3-reason"
                          className={COMPACT_TEXTAREA}
                          value={reason}
                          onChange={(e) => {
                            setReason(e.target.value);
                            markDirty();
                          }}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                ) : null}

                {step === "money" ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#DDD4C5] bg-white px-3 py-2 text-sm">
                        <span>
                          <span className="text-[#6B5E4E]">
                            {kind === "noshow" ? "No-Show Charge " : "Cancellation Fee "}
                          </span>
                          <span className="font-semibold text-[#251605]">{displayedFeeAmount}</span>
                        </span>
                        <span className="text-[#DDD4C5]">|</span>
                        <span>
                          <span className="text-[#6B5E4E]">Folio Balance </span>
                          <span className="font-semibold text-[#251605]">
                            {folio ? money(folio.balance) : "—"}
                          </span>
                        </span>
                        {deposits.length > 0 ? (
                          <>
                            <span className="text-[#DDD4C5]">|</span>
                            <span>
                              <span className="text-[#6B5E4E]">Deposit </span>
                              <span className="font-semibold text-[#251605]">
                                {money(depositTotal)}
                              </span>
                            </span>
                          </>
                        ) : null}
                        <span className="text-[#DDD4C5]">|</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            feeOk
                              ? "bg-[#436436]/15 text-[#436436]"
                              : "bg-[#C89933]/20 text-[#8B6914]",
                          )}
                        >
                          {chargeStatus === "Required" ? "Required" : chargeStatus}
                        </span>
                      </div>
                      {folio?.folioId && deposits.length === 0 ? (
                        <p className="text-xs text-[#8C7E72]">No deposit on this folio.</p>
                      ) : null}

                      {folio?.folioId ? (
                        <>
                          {isCreditBalance(folio.balance) ? (
                            <Button asChild className={SHELL_PRIMARY_BUTTON}>
                              <a href={cashieringRefundHref(folio.folioNumber)}>
                                {REFUND_IN_CASHIERING_CTA}
                              </a>
                            </Button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center text-xs font-medium text-[#8A641A]"
                            onClick={() => setLedgerOpen((v) => !v)}
                          >
                            {ledgerOpen ? "Hide ledger" : "View ledger"}
                            <ChevronRight
                              className={cn("size-3.5", ledgerOpen && "rotate-90")}
                            />
                          </button>
                          {ledgerOpen ? (
                            <ul className="space-y-2 rounded-lg border border-[#DDD4C5] bg-white p-3 text-sm">
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
                        <p className="text-sm text-[#6B5E4E]">Opening the Cashiering folio…</p>
                      )}

                      {required && !posted && !waived ? (
                        <>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-[#6B5E4E]">
                              {kind === "noshow" ? "Charge Amount" : "Cancellation Fee Amount"}
                            </p>
                            {kind === "noshow" || cancelAmountLocked ? (
                              <p
                                id="fo-fs3-fee-amount"
                                className="flex h-9 items-center rounded-[6px] border border-[#CCCCCC] bg-[#FAF8F5] px-3 text-sm font-medium text-[#251605]"
                              >
                                {displayedFeeAmount}
                              </p>
                            ) : (
                              <Input
                                id="fo-fs3-fee-amount"
                                className={CONTROL}
                                type="number"
                                min={0.01}
                                step="0.01"
                                value={feeAmount}
                                onChange={(e) => {
                                  setFeeAmount(e.target.value);
                                  markDirty();
                                }}
                              />
                            )}
                            {postFieldError ? (
                              <p className="text-xs text-[#8B6914]">{postFieldError}</p>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            className={SHELL_PRIMARY_BUTTON}
                            disabled={!canPost || postMut.isPending}
                            onClick={() => postMut.mutate()}
                          >
                            {postMut.isPending
                              ? "Posting…"
                              : kind === "noshow"
                                ? "Post No-Show Charge"
                                : "Post Cancellation Fee"}
                          </Button>
                          <div>
                            <button
                              type="button"
                              className="inline-flex items-center text-xs font-medium text-[#8A641A]"
                              onClick={() => setWaiveOpen((v) => !v)}
                            >
                              {kind === "noshow" ? "Waive charge" : "Waive fee"}
                              <ChevronRight
                                className={cn("size-3.5", waiveOpen && "rotate-90")}
                              />
                            </button>
                            {waiveOpen ? (
                              <div className="mt-1.5 space-y-1.5 rounded-lg border border-[#DDD4C5] bg-white px-3 py-2">
                                {!feeAuth ? (
                                  <p className="text-sm text-[#6B5E4E]">Loading authorization…</p>
                                ) : (
                                  <>
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                        feeAuth.canCurrentUserAuthorize
                                          ? "bg-[#436436]/15 text-[#436436]"
                                          : "bg-[#E8DFD0] text-[#6B5E4E]",
                                      )}
                                    >
                                      {feeAuth.canCurrentUserAuthorize
                                        ? "Authorized"
                                        : "Not authorized"}
                                    </span>
                                    {feeAuth.foCommand && feeAuth.canCurrentUserAuthorize ? (
                                      <>
                                        <div className="space-y-1">
                                          <Label htmlFor="fo-fs3-waive">Waiver Reason</Label>
                                          <Textarea
                                            id="fo-fs3-waive"
                                            className={COMPACT_TEXTAREA}
                                            value={waiveReason}
                                            onChange={(e) => setWaiveReason(e.target.value)}
                                            rows={2}
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className={OUTLINE}
                                          disabled={!waiveReason.trim() || waiveMut.isPending}
                                          onClick={() => waiveMut.mutate()}
                                        >
                                          {waiveMut.isPending ? "Saving…" : "Waive Fee"}
                                        </Button>
                                      </>
                                    ) : (
                                      <p className="text-sm text-[#6B5E4E]">
                                        You don't have permission to authorize this.
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                ) : null}

                {step === "confirm" ? (
                  <div className="space-y-3 text-sm">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[#DDD4C5] bg-white p-3">
                      <StayFact label="Guest" value={guestLabel} />
                      <StayFact label="Reservation" value={confirmation} />
                      <StayFact label="Stay" value={dates} />
                      <StayFact label="Room" value={roomChip} />
                      <StayFact
                        label={kind === "noshow" ? "No-Show Reason" : "Cancellation Reason"}
                        value={submittedReason.trim() || "required"}
                      />
                      <StayFact
                        label={kind === "cancel" ? "Cancellation Fee" : "Charge"}
                        value={chargeStatus === "Posted" ? chargeAmountLabel : chargeStatus}
                      />
                      {waived ? (
                        <StayFact
                          label="Authorization"
                          value={
                            feeAuth?.canCurrentUserAuthorize ? "Authorized · Waived" : "Waived"
                          }
                        />
                      ) : null}
                    </dl>
                    {folio?.folioNumber ? (
                      <p className="text-xs text-[#6B5E4E]">
                        Folio {folio.folioNumber} · Balance {money(folio.balance)}
                      </p>
                    ) : null}
                    {folio && isCreditBalance(folio.balance) ? (
                      <Button asChild variant="outline" className={OUTLINE}>
                        <a href={cashieringRefundHref(folio.folioNumber)}>
                          {REFUND_IN_CASHIERING_CTA}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-[#DDD4C5] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" className={OUTLINE} onClick={requestClose}>
                Cancel
              </Button>
              <div className="flex flex-col items-end gap-1">
                {footerBlocker ? (
                  <p className="text-xs text-[#8B6914]">{footerBlocker}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  {step !== "stay" ? (
                    <Button type="button" variant="outline" className={OUTLINE} onClick={goBack}>
                      Back
                    </Button>
                  ) : null}
                  {step === "confirm" ? (
                    <Button
                      type="button"
                      className={SHELL_PRIMARY_BUTTON}
                      disabled={continueDisabled}
                      onClick={() => completeMut.mutate()}
                    >
                      {completeMut.isPending ? "Saving…" : confirmLabel}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className={SHELL_PRIMARY_BUTTON}
                      disabled={continueDisabled}
                      onClick={onContinue}
                    >
                      Continue
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {kind === "cancel" ? "Leave cancellation?" : "Leave no-show?"}
            </AlertDialogTitle>
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

function StayFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#251605]">{value}</dd>
    </div>
  );
}
