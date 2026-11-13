import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Printer, X } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useAuth } from "@/core/state/auth-store";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  DETAIL_DASH,
  parseDepositRequirementSnapshot,
} from "@/packages/pms/lib/reservation-detail-overview";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  NOSHOW_BLACKLIST_GAP,
  NOSHOW_COLLECT_CASHIERING,
  NOSHOW_COMM_GAP,
  NOSHOW_REASON_OPTIONS,
  NOSHOW_RESERVATION_STEPS,
  composeNoShowReason,
  noShowFinanceRows,
  noShowPolicyLabel,
  postedNoShowFeeAmount,
  type NoShowReservationStepId,
} from "@/packages/pms/lib/reservation-noshow-workspace";
import { FEE_REQUIRED_BANNER } from "@/packages/pms/lib/fo-cancel-noshow";
import { printNoShowConfirmation } from "@/packages/pms/lib/noshow-confirmation-print";
import { formatPrintDateTime } from "@/packages/pms/lib/reservation-print-document";
import {
  completeFoNoShow,
  ensureCancelNoShowFolio,
  postCancelOrNoShowFee,
  waiveCancelOrNoShowFee,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { getNoShowReadiness } from "@/packages/pms/lib/fo-no-show-readiness.functions";
import { RoomUnitTargetSelect } from "@/packages/pms/components/frontoffice/room-unit-target-select";
import { getBookingsAccess, getReservation } from "@/packages/pms/lib/reservations.functions";
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
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-[#DDD4C5] bg-white p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ReservationNoShowWorkspace({
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchReadiness = useServerFn(getNoShowReadiness);
  const submitNoShow = useServerFn(completeFoNoShow);
  const submitWaive = useServerFn(waiveCancelOrNoShowFee);
  const submitEnsureFolio = useServerFn(ensureCancelNoShowFolio);
  const submitFee = useServerFn(postCancelOrNoShowFee);

  const [step, setStep] = useState<NoShowReservationStepId>("details");
  const [reason, setReason] = useState(NOSHOW_REASON_OPTIONS[0].value);
  const [notes, setNotes] = useState("");
  const [reservationRoomId, setReservationRoomId] = useState("");
  const feeIdempotencyKey = useRef(crypto.randomUUID());

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

  useEffect(() => {
    if (reservation?.rooms?.length === 1) {
      setReservationRoomId(reservation.rooms[0].id);
    }
  }, [reservation]);

  const readinessQuery = useQuery({
    queryKey: ["fo-no-show-readiness", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchReadiness({
        data: {
          restaurantId,
          reservationId,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: canManage,
    retry: false,
  });

  const composedReason = composeNoShowReason(reason, notes);
  const readiness = readinessQuery.data;
  const businessDate = readiness?.businessDate ?? "";
  const ctx = readiness?.context;
  const feeRequired = readiness?.fee.required ?? true;
  const posted = readiness?.fee.posted ?? false;
  const waived = readiness?.fee.waived ?? false;
  const moneyFmt = (value: number) => money(value, reservation?.currency ?? ctx?.folio.currency);
  const eligible = readiness?.eligible ?? false;
  const postedFee = postedNoShowFeeAmount(ctx?.folio.transactions);
  const deposit = parseDepositRequirementSnapshot(
    readiness?.commercial.depositRequirementSnapshot ??
      reservation?.depositRequirementSnapshot ??
      null,
  );
  const financeRows = noShowFinanceRows({
    roomSubtotal: readiness?.commercial.roomSubtotal ?? reservation?.roomSubtotal ?? null,
    packageAmount: readiness?.commercial.packageAmount ?? null,
    additionalServices: null,
    postedNoShowFee: postedFee,
    feeRequired,
    feeSatisfied: posted || waived,
    depositAmount: deposit?.amount ?? null,
    folioBalance: ctx?.folio.folioId ? ctx.folio.balance : null,
    money: moneyFmt,
  });
  const reviewOk = Boolean(
    readiness?.eligible &&
    composedReason.trim().length >= 3 &&
    composedReason.length <= 500 &&
    !readiness.blockers.some((item) =>
      ["ROOM_UNIT_REQUIRED", "INVALID_TRANSITION", "NOT_PAST_DUE", "CHECK_IN_PROGRESS"].includes(
        item.code,
      ),
    ),
  );
  const confirmOk = Boolean(
    readiness?.canComplete && composedReason.trim().length >= 3 && composedReason.length <= 500,
  );
  const policyName = noShowPolicyLabel(
    readiness?.commercial.noShowPolicySnapshot ?? reservation?.noShowPolicySnapshot,
    null,
  );
  const penalty = readiness?.fee.penalty;
  const chargeHeadline = chargeHeadlineFor({
    feeRequired,
    posted,
    waived,
    postedFee,
    calculable: penalty?.calculable ?? false,
    amount: penalty?.amount ?? null,
    money: moneyFmt,
  });

  const waive = useMutation({
    mutationFn: () =>
      submitWaive({
        data: {
          restaurantId,
          reservationId,
          kind: "noshow",
          reason: composedReason || "Fee waived for no-show.",
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("No-show charge waived.");
      void readinessQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ensureFolio = useMutation({
    mutationFn: () =>
      submitEnsureFolio({
        data: { restaurantId, reservationId },
      }),
    onSuccess: () => {
      toast.success("Folio is ready.");
      void readinessQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const postFee = useMutation({
    mutationFn: () => {
      const amount = readiness?.fee.penalty.amount;
      if (amount == null || amount <= 0) {
        throw new Error("The no-show policy does not provide a charge amount.");
      }
      return submitFee({
        data: {
          restaurantId,
          reservationId,
          kind: "noshow",
          amount,
          idempotencyKey: feeIdempotencyKey.current,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      });
    },
    onSuccess: () => {
      feeIdempotencyKey.current = crypto.randomUUID();
      toast.success("No-show charge posted.");
      void readinessQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateNoShow = useMutation({
    mutationFn: () =>
      submitNoShow({
        data: {
          restaurantId,
          reservationId,
          reason,
          ...(notes.trim() ? { additionalNotes: notes.trim() } : {}),
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["reservation", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["fo-no-show-readiness"] });
      await queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
      await queryClient.invalidateQueries({ queryKey: ["folio"] });
      await queryClient.invalidateQueries({ queryKey: ["night-audit"] });
      await queryClient.invalidateQueries({ queryKey: ["reservation-desk"] });
      await queryClient.invalidateQueries({ queryKey: ["property-business-date"] });
      await queryClient.invalidateQueries({ queryKey: ["room-inventory"] });
      toast.success("Reservation marked no-show.");
      onBackToDesk();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detailQuery.isError) {
    return (
      <NoShowShell onClose={onBackToDesk}>
        <p className="grid h-full place-items-center p-8 text-sm text-destructive">
          Could not load this reservation.
        </p>
      </NoShowShell>
    );
  }
  if (!reservation) {
    return (
      <NoShowShell onClose={onBackToDesk}>
        <p className="grid h-full place-items-center p-8 text-sm text-[#6B5E4E]">
          Loading reservation…
        </p>
      </NoShowShell>
    );
  }

  const selectedTarget = readiness?.target ?? null;
  const steps = NOSHOW_RESERVATION_STEPS.filter((item) => item.id !== "complete");
  const currentStep = steps.findIndex((row) => row.id === step);
  const arrivalBlockers = (readiness?.blockers ?? []).filter((item) => item.code !== "FEE_REQUIRED");
  const roomLabel = selectedTarget?.roomNumber
    ? `Room ${selectedTarget.roomNumber}`
    : reservation.roomNumber
      ? `Room ${reservation.roomNumber}`
      : "Unassigned";
  const reasonLabel =
    NOSHOW_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
  const roomRelease = selectedTarget?.roomNumber
    ? `Room ${selectedTarget.roomNumber} will be released.`
    : "No assigned room to release.";
  const chargeStatus = posted
    ? "Posted"
    : waived
      ? "Waived"
      : feeRequired
        ? "Not yet posted"
        : "No charge";
  const reservationResult = reservationConsequence(readiness?.predictedReservationStatus);

  function printConfirmation() {
    const property = membership.restaurant;
    const address = [property.address, property.city, property.postcode, property.country]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .join(", ");
    const meta = user?.user_metadata ?? {};
    const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
    const processedBy = [first, last].filter(Boolean).join(" ") || full || user?.email?.trim() || "Staff member";
    printNoShowConfirmation({
      property: {
        name: property.name,
        logoUrl: property.logoUrl,
        address: address || null,
        phone: property.phone,
        email: property.email,
      },
      generatedAt: formatPrintDateTime(new Date()) ?? "",
      confirmationNumber: reservation.confirmationNumber,
      guestName: reservation.guestName,
      stay: `${formatStayDate(reservation.arrivalDate)} – ${formatStayDate(reservation.departureDate)}`,
      room: roomLabel,
      roomType: reservation.roomTypeName,
      reason: reasonLabel,
      policy: policyName,
      charge: chargeHeadline.amount,
      chargeStatus,
      roomRelease,
      reservationResult,
      processedBy,
      publicNotes: reservation.specialRequests,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]" data-testid="noshow-reservation-workspace">
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
              data-testid="noshow-reservation-print"
              aria-label="Print"
              className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={printConfirmation}
            >
              <Printer className="size-4" />
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
              onClick={onBackToDesk}
              aria-label="Close no-show"
            >
              <X className="size-4" />
            </Button>
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[#C4B6A0]">
          No-show · {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} ·{" "}
          {reservation.guestName}
        </p>
      </header>
      <nav
        aria-label="No-show workflow"
        className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
        data-testid="noshow-reservation-stepper"
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
              <div className="mb-3">
                <RoomUnitTargetSelect
                  units={readiness?.targets}
                  value={reservationRoomId}
                  onChange={setReservationRoomId}
                />
              </div>
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
                    {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expected Arrival</dt>
                  <dd>
                    {reservation.expectedArrivalAt
                      ? dateTime(reservation.expectedArrivalAt)
                      : formatStayDate(reservation.arrivalDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Room</dt>
                  <dd>
                    {roomLabel}
                    {reservation.roomTypeName ? ` · ${reservation.roomTypeName}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Business date</dt>
                  <dd>{businessDate || DETAIL_DASH}</dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="Arrival Status">
              <div
                className={cn(
                  "rounded-lg px-3 py-3 text-sm",
                  eligible ? "bg-[#F4E9D0] text-[#251605]" : "bg-[#F7F4EE] text-[#5C4E3E]",
                )}
              >
                <p className="font-semibold">
                  {eligible ? "The guest has not arrived." : "This stay cannot be marked No-Show."}
                </p>
                <p className="mt-1">
                  {eligible
                    ? `Arrival was due before the business date${businessDate ? ` (${businessDate})` : ""}.`
                    : "Check the reason below before continuing."}
                </p>
                {arrivalBlockers.map((item) => (
                  <p key={item.code} className="mt-1">
                    {item.message}
                  </p>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="No-Show Policy" className="xl:col-span-2">
              <p className="text-sm text-[#5C4E3E]">{policyName}</p>
              <div className="mt-3 rounded-lg border border-[#E4D3A8] bg-[#F4E9D0] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A641A]">
                  No-show charge
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-[#251605]">
                  {chargeHeadline.amount}
                </p>
                <p className="mt-1 text-sm text-[#5C4E3E]">{chargeHeadline.detail}</p>
              </div>
            </SectionCard>

            <SectionCard title="Financial Impact">
              <ul className="divide-y divide-[#E8DFD0] text-sm" data-testid="noshow-finance-table">
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
              <p className="mt-2 text-xs text-[#6B5E4E]">{NOSHOW_COLLECT_CASHIERING}</p>
            </SectionCard>

            <SectionCard title="Room Inventory Impact">
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 text-[#436436]" />
                  {selectedTarget?.roomNumber
                    ? `Room ${selectedTarget.roomNumber} will be released and can be sold again.`
                    : "No assigned room to release."}
                </li>
              </ul>
            </SectionCard>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Reason">
              <div className="grid gap-3">
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className={SELECT} aria-label="Reason">
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
                <div className="grid gap-1.5">
                  <Label>Additional Notes</Label>
                  <Textarea
                    rows={3}
                    maxLength={Math.max(0, 498 - reason.trim().length)}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={cn(CONTROL, "h-auto min-h-16 py-2")}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Final review"
              action={
                <button
                  type="button"
                  data-testid="noshow-step2-print"
                  aria-label="Print"
                  className="rounded-md p-1.5 text-[#6B5E4E] hover:bg-[#F7F4EE] hover:text-[#251605]"
                  onClick={printConfirmation}
                >
                  <Printer className="size-4" />
                </button>
              }
            >
              <ul className="divide-y divide-[#E8DFD0] text-sm">
                <li className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-[#6B5E4E]">Reason</span>
                  <span className="text-right font-medium text-[#251605]">{reasonLabel}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-[#6B5E4E]">Charge</span>
                  <span className="text-right text-[#251605]">
                    <span className="font-medium">{chargeHeadline.amount}</span>
                    <span className="ml-2 text-xs text-[#6B5E4E]">{chargeStatus}</span>
                  </span>
                </li>
                <li className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-[#6B5E4E]">Room</span>
                  <span className="text-right text-[#251605]">{roomRelease}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-[#6B5E4E]">Reservation</span>
                  <span className="text-right text-[#251605]">{reservationResult}</span>
                </li>
              </ul>
              {feeRequired && !posted && !waived ? (
                <div className="mt-3 rounded-lg bg-[#F4E9D0] px-3 py-2 text-sm text-[#251605]">
                  <p>{FEE_REQUIRED_BANNER}</p>
                  <p className="mt-1 text-xs text-[#5C4E3E]">
                    {penalty?.calculable && (penalty.amount ?? 0) > 0
                      ? `Policy charge: ${moneyFmt(penalty.amount ?? 0)}`
                      : "A charge amount is not available. A supervisor waiver is required."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!ctx?.folio.folioId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={ensureFolio.isPending}
                        onClick={() => ensureFolio.mutate()}
                      >
                        Open Folio
                      </Button>
                    ) : null}
                    {ctx?.folio.status === "open" &&
                    penalty?.calculable &&
                    (penalty.amount ?? 0) > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={postFee.isPending}
                        onClick={() => postFee.mutate()}
                      >
                        Post No-Show Charge
                      </Button>
                    ) : null}
                    {ctx?.canWaive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={waive.isPending}
                        onClick={() => waive.mutate()}
                      >
                        Waive no-show charge
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {readiness?.blockers.length ? (
                <ul className="mt-3 space-y-1 text-sm text-destructive">
                  {readiness.blockers.map((item) => (
                    <li key={item.code}>{item.message}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-xs text-[#6B5E4E]">
                {NOSHOW_COMM_GAP} {NOSHOW_BLACKLIST_GAP}
              </p>
            </SectionCard>
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
              disabled={!reviewOk}
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
              disabled={!confirmOk || mutateNoShow.isPending}
              onClick={() => mutateNoShow.mutate()}
            >
              Process No-Show
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

function reservationConsequence(status: string | null | undefined): string {
  if (status === "no_show") return "The reservation will be marked No-Show.";
  if (!status) return "The selected room will be marked No-Show.";
  const label = STATUS_LABELS[status] ?? status.replaceAll("_", " ");
  return `The selected room will be marked No-Show. The reservation stays ${label}.`;
}

function chargeHeadlineFor(input: {
  feeRequired: boolean;
  posted: boolean;
  waived: boolean;
  postedFee: number | null;
  calculable: boolean;
  amount: number | null;
  money: (value: number) => string;
}): { amount: string; detail: string } {
  if (input.posted) {
    return {
      amount: input.postedFee == null ? "Posted" : input.money(input.postedFee),
      detail: "The no-show charge is already on the folio.",
    };
  }
  if (input.waived) {
    return { amount: "Waived", detail: "The no-show charge has been waived." };
  }
  if (!input.feeRequired) {
    return { amount: "No charge", detail: "This stay has no no-show charge." };
  }
  if (input.calculable && input.amount === 0) {
    return { amount: "No charge", detail: "The no-show policy has no charge." };
  }
  if (input.calculable && input.amount != null) {
    return {
      amount: input.money(input.amount),
      detail: "Post this charge, or waive it, before you process the no-show.",
    };
  }
  return {
    amount: "Not available",
    detail: "The charge amount is not available. A supervisor waiver is required.",
  };
}

function NoShowShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]" data-testid="noshow-reservation-workspace">
      <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-sm font-semibold text-[#F3E9D8]">No-show</h1>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto size-8 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close no-show"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
