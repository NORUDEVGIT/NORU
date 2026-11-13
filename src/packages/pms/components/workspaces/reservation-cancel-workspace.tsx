import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Printer, X } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { parseDepositRequirementSnapshot } from "@/packages/pms/lib/reservation-detail-overview";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  CANCEL_COMM_GAP,
  CANCEL_DASH,
  CANCEL_REASON_OPTIONS,
  CANCEL_REFUND_CASHIERING,
  CANCEL_RESERVATION_STEPS,
  canConfirmCancelReservation,
  canContinueCancelReview,
  cancelFinanceRows,
  cancelPolicyStaffCopy,
  cancelPolicyView,
  composeCancelReason,
  folioCreditExposure,
  postedCancelFeeAmount,
  predictedSystemUpdates,
  type CancelReservationStepId,
} from "@/packages/pms/lib/reservation-cancel-workspace";
import {
  FEE_REQUIRED_BANNER,
  REFUND_IN_CASHIERING_CTA,
  cashieringRefundHref,
  isStayCancellable,
} from "@/packages/pms/lib/fo-cancel-noshow";
import {
  completeFoCancel,
  getCancelNoShowContext,
  waiveCancelOrNoShowFee,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import {
  getBookingsAccess,
  getReservation,
} from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const CONTROL =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A]";
const SELECT =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus-visible:border-[#8A641A] focus-visible:ring-1 focus-visible:ring-[#8A641A]";
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-[#DDD4C5] bg-white p-4", className)}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ReservationCancelWorkspace({
  membership,
  reservationId,
  onBackToDesk,
  onOpenReservation: _onOpenReservation,
  finishLabel: _finishLabel = "Go to Reservation Desk",
}: {
  membership: RestaurantMembership;
  reservationId: string;
  onBackToDesk: () => void;
  onOpenReservation: (reservationId: string) => void;
  finishLabel?: string;
}) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const { timezone } = useRestaurantTime();
  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchCancelCtx = useServerFn(getCancelNoShowContext);
  const submitCancel = useServerFn(completeFoCancel);
  const submitWaive = useServerFn(waiveCancelOrNoShowFee);

  const [step, setStep] = useState<CancelReservationStepId>("details");
  const [reason, setReason] = useState(CANCEL_REASON_OPTIONS[0].value);
  const [notes, setNotes] = useState("");

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    enabled: canManage,
    retry: false,
  });
  const reservation = detailQuery.data?.reservation;

  const commercialQuery = useQuery({
    queryKey: ["reservation-commercial", restaurantId, reservationId, reservation?.roomSubtotal],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId,
          roomSubtotal: reservation?.roomSubtotal ?? null,
        },
      }),
    enabled: canManage && Boolean(reservation),
    retry: false,
  });

  const cancelCtxQuery = useQuery({
    queryKey: ["fo-cancel-noshow", "cancel", restaurantId, reservationId],
    queryFn: () => fetchCancelCtx({ data: { restaurantId, reservationId, kind: "cancel" } }),
    enabled: canManage,
    retry: false,
  });

  const composedReason = composeCancelReason(reason, notes);
  const ctx = cancelCtxQuery.data;
  const feeRequired = ctx?.policy.required ?? true;
  const posted = ctx?.posted ?? false;
  const waived = ctx?.waived ?? false;
  const moneyFmt = (value: number) => money(value, reservation?.currency ?? ctx?.folio.currency);
  const policy = reservation
    ? cancelPolicyView(
        reservation.cancellationPolicySnapshot,
        reservation.arrivalDate,
        timezone,
        new Date(),
      )
    : null;
  const postedFee = postedCancelFeeAmount(ctx?.folio.transactions);
  const credit = folioCreditExposure(ctx?.folio.balance);
  const financeRows = cancelFinanceRows({
    roomSubtotal: reservation?.roomSubtotal ?? null,
    packageAmount: commercialQuery.data?.packagesSubtotal ?? null,
    additionalServices: null,
    postedCancelFee: postedFee,
    feeRequired,
    feeSatisfied: posted || waived,
    creditBalance: credit,
    money: moneyFmt,
    afterCancel: false,
  });
  const reviewOk = Boolean(
    reservation && canContinueCancelReview({ status: reservation.status, reason: composedReason }),
  );
  const confirmOk = Boolean(
    reservation &&
    canConfirmCancelReservation({
      status: reservation.status,
      reason: composedReason,
      feeRequired,
      posted,
      waived,
    }),
  );

  const waive = useMutation({
    mutationFn: () =>
      submitWaive({
        data: {
          restaurantId,
          reservationId,
          kind: "cancel",
          reason: composedReason || "Fee waived for reservation cancel.",
        },
      }),
    onSuccess: () => {
      toast.success("Cancel fee waived.");
      void cancelCtxQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      submitCancel({
        data: { restaurantId, reservationId, reason: composedReason },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["reservation", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["fo-cancel-noshow"] });
      toast.success("Reservation cancelled.");
      onBackToDesk();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detailQuery.isError) {
    return (
      <CancelShell onClose={onBackToDesk}>
        <p className="grid h-full place-items-center p-8 text-sm text-destructive">
          Could not load this reservation.
        </p>
      </CancelShell>
    );
  }
  if (!reservation || !policy) {
    return (
      <CancelShell onClose={onBackToDesk}>
        <p className="grid h-full place-items-center p-8 text-sm text-[#6B5E4E]">
          Loading reservation…
        </p>
      </CancelShell>
    );
  }

  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const staffPolicy = cancelPolicyStaffCopy(policy);
  const systemRows = predictedSystemUpdates({
    assignedRoom: reservation.roomNumber,
    feeRequired,
  });
  const steps = CANCEL_RESERVATION_STEPS.filter((item) => item.id !== "complete");
  const currentStep = steps.findIndex((row) => row.id === step);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]"
      data-testid="cancel-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-display text-sm font-semibold text-[#F3E9D8]">
            {reservation.confirmationNumber}
          </h1>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
            {STATUS_LABELS[reservation.status] ?? reservation.status}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-testid="cancel-reservation-print"
              aria-label="Print"
              className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
              onClick={onBackToDesk}
              aria-label="Close cancellation"
            >
              <X className="size-4" />
            </Button>
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[#C4B6A0]">
          Cancel reservation · {formatStayDate(reservation.arrivalDate)} →{" "}
          {formatStayDate(reservation.departureDate)} · {reservation.guestName}
        </p>
      </header>
      <nav
        aria-label="Cancel reservation workflow"
        className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
        data-testid="cancel-reservation-stepper"
      >
        <ol className="flex min-w-0 items-stretch">
          {steps.map((item, index) => {
            const active = item.id === step;
            const completed = index < currentStep;
            return (
              <li key={item.id} className="flex">
                <button
                  type="button"
                  title={item.hint}
                  aria-current={active ? "step" : undefined}
                  disabled={item.id === "confirm" && !reviewOk}
                  onClick={() => {
                    if (item.id === "details") setStep("details");
                    if (item.id === "confirm" && reviewOk) setStep("confirm");
                  }}
                  className={cn(
                    "relative flex h-full items-center gap-1 px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] disabled:cursor-default",
                    completed && "text-[#436436]",
                    active && "text-[#251605]",
                    !completed && !active && "text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="size-3" /> : <span className="tabular-nums">{index + 1}</span>}
                  <span className="whitespace-nowrap">{item.label}</span>
                  {completed ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#436436]" />
                  ) : null}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        {step === "details" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Reservation Details">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Guest</dt>
                  <dd>{reservation.guestName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reservation No.</dt>
                  <dd>{reservation.confirmationNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stay Dates</dt>
                  <dd>
                    {formatStayDate(reservation.arrivalDate)} →{" "}
                    {formatStayDate(reservation.departureDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Assigned room</dt>
                  <dd>{reservation.roomNumber ? `Room ${reservation.roomNumber}` : "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Room type</dt>
                  <dd>{reservation.roomTypeName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rate plan</dt>
                  <dd>{reviewDash(reservation.ratePlanName)}</dd>
                </div>
              </dl>
            </SectionCard>
            <PolicyCard policyName={policy.name} staff={staffPolicy} penaltyRule={policy.outcome === "penalty_applies" ? policy.penaltyRule : CANCEL_DASH} />
            <SectionCard title="Cancellation Reason">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Reason for Cancellation</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className={SELECT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANCEL_REASON_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Additional Notes (Optional)</Label>
                  <Textarea
                    rows={3}
                    maxLength={500}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={cn(CONTROL, "h-auto min-h-16 py-2")}
                  />
                  <p className="text-right text-[11px] text-muted-foreground">{notes.length}/500</p>
                </div>
              </div>
            </SectionCard>
            <CommunicationNote />
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <PolicyCard policyName={policy.name} staff={staffPolicy} penaltyRule={policy.outcome === "penalty_applies" ? policy.penaltyRule : CANCEL_DASH} />
            <SectionCard title="Financial Impact">
              <ul className="divide-y divide-[#E8DFD0] text-sm" data-testid="cancel-finance-table">
                {financeRows.map((row) => (
                  <li key={row.description} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-[#5C4E3E]">{row.description}</span>
                    <span className="text-right">
                      <span className="font-medium text-[#251605]">{row.amount}</span>
                      <span className="ml-2 text-xs text-[#6B5E4E]">{row.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#6B5E4E]">{CANCEL_REFUND_CASHIERING}</p>
              {credit != null && credit > 0 ? (
                <Button type="button" variant="outline" size="sm" className="mt-2 h-8" asChild>
                  <a href={cashieringRefundHref(ctx?.folio.folioNumber)}>{REFUND_IN_CASHIERING_CTA}</a>
                </Button>
              ) : null}
              {deposit?.amount != null ? (
                <p className="mt-2 text-xs text-[#6B5E4E]">
                  Stored deposit requirement: {moneyFmt(deposit.amount)}. This is not a refund.
                </p>
              ) : null}
            </SectionCard>
            <SectionCard title="Room Inventory Impact">
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 text-[#436436]" />
                  {reservation.roomNumber
                    ? `Room ${reservation.roomNumber} (${reservation.roomTypeName}) will be released back to inventory.`
                    : "No assigned room to release."}
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 text-[#436436]" />
                  The room becomes available for other reservations on these dates.
                </li>
              </ul>
            </SectionCard>
            <SectionCard title="Related System Updates">
              <ul className="space-y-2 text-sm">
                {systemRows.map((row) => (
                  <li key={row.id} className="flex gap-2">
                    <Check className="mt-0.5 size-4 text-[#436436]" />
                    <span>
                      <span className="font-medium text-[#251605]">{row.title}</span>
                      <span className="block text-xs text-[#6B5E4E]">{row.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Cancellation Reason" subtitle="This reason will be saved with the cancellation.">
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Reason for Cancellation</dt>
                  <dd>{composedReason}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Additional Notes</dt>
                  <dd>{reviewDash(notes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Fee</dt>
                  <dd>
                    {feeRequired
                      ? posted
                        ? "Posted on folio"
                        : waived
                          ? "Waived"
                          : FEE_REQUIRED_BANNER
                      : "Not applicable"}
                  </dd>
                </div>
              </dl>
              {feeRequired && !posted && !waived ? (
                <div className="mt-3 rounded-lg bg-[#F4E9D0] px-3 py-2 text-sm text-[#251605]">
                  <p>{FEE_REQUIRED_BANNER}</p>
                  {ctx?.canWaive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8"
                      disabled={waive.isPending}
                      onClick={() => waive.mutate()}
                    >
                      Waive cancel fee
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
            <CommunicationNote />
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E8DFD0] bg-white px-4 py-2">
        {step === "details" ? (
          <>
            <Button type="button" variant="ghost" className="h-9 text-[#4a2c1a]" onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              type="button"
              className={SHELL_PRIMARY_BUTTON}
              disabled={!reviewOk || !isStayCancellable(reservation.status)}
              onClick={() => setStep("confirm")}
            >
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" className="h-9 text-[#4a2c1a]" onClick={() => setStep("details")}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-9"
              disabled={!confirmOk || cancelMut.isPending}
              onClick={() => cancelMut.mutate()}
            >
              Confirm Cancellation
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

function CancelShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]" data-testid="cancel-reservation-workspace">
      <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-sm font-semibold text-[#F3E9D8]">Cancel reservation</h1>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto size-8 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close cancellation"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}

function PolicyCard({
  policyName,
  staff,
  penaltyRule,
}: {
  policyName: string;
  staff: { headline: string; detail: string };
  penaltyRule: string;
}) {
  const penalty = staff.headline === "Cancellation penalty applies";
  return (
    <SectionCard title="Cancellation Policy">
      <p className="text-sm font-medium text-[#251605]">{policyName}</p>
      <div
        className={cn(
          "mt-3 rounded-lg px-3 py-2 text-sm",
          penalty ? "bg-[#F4E9D0] text-[#251605]" : "bg-[#F7F4EE] text-[#251605]",
        )}
      >
        <p className="font-semibold">{staff.headline}</p>
        <p className="mt-1">{staff.detail}</p>
      </div>
      {penalty && penaltyRule !== CANCEL_DASH ? (
        <p className="mt-2 text-xs text-[#6B5E4E]">Penalty rule: {penaltyRule}</p>
      ) : null}
    </SectionCard>
  );
}

function CommunicationNote() {
  return (
    <SectionCard title="Communication" subtitle="Not available from this cancellation.">
      <p className="text-sm text-[#5C4E3E]">{CANCEL_COMM_GAP}</p>
      <ul className="mt-2 space-y-1 text-sm text-[#6B5E4E]">
        <li>Cancellation email to the guest — not available</li>
        <li>Company or travel agent notification — not available</li>
        <li>Internal staff notification — not available</li>
      </ul>
    </SectionCard>
  );
}
