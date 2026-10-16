import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BedDouble, Check, Printer } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  channelLabel,
  DETAIL_DASH,
  parseDepositRequirementSnapshot,
  sourceLabel,
} from "@/packages/pms/lib/reservation-detail-overview";
import { cancelPolicyView } from "@/packages/pms/lib/reservation-cancel-workspace";
import {
  NOSHOW_BLACKLIST_GAP,
  NOSHOW_COLLECT_CASHIERING,
  NOSHOW_COMM_GAP,
  NOSHOW_REASON_OPTIONS,
  NOSHOW_RESERVATION_STEPS,
  canConfirmNoShowReservation,
  canContinueNoShowReview,
  composeNoShowReason,
  isDeskNoShowEligible,
  noShowFinanceRows,
  noShowPolicyLabel,
  persistedNoShowUpdates,
  pickNoShowHistory,
  postedNoShowFeeAmount,
  predictedNoShowUpdates,
  type NoShowReservationStepId,
} from "@/packages/pms/lib/reservation-noshow-workspace";
import { FEE_REQUIRED_BANNER, cashieringRefundHref } from "@/packages/pms/lib/fo-cancel-noshow";
import {
  completeFoNoShow,
  getCancelNoShowContext,
  waiveCancelOrNoShowFee,
} from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import {
  getBookingsAccess,
  getReservation,
  getRoomTypeAvailability,
} from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
    <section className={cn("rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm", className)}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ReservationNoShowWorkspace({
  membership,
  reservationId,
  onBackToDesk,
  onOpenReservation,
}: {
  membership: RestaurantMembership;
  reservationId: string;
  onBackToDesk: () => void;
  onOpenReservation: (reservationId: string) => void;
}) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime, timezone } = useRestaurantTime();
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);
  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchCtx = useServerFn(getCancelNoShowContext);
  const submitNoShow = useServerFn(completeFoNoShow);
  const submitWaive = useServerFn(waiveCancelOrNoShowFee);

  const [step, setStep] = useState<NoShowReservationStepId>("details");
  const [reason, setReason] = useState(NOSHOW_REASON_OPTIONS[0].value);
  const [notes, setNotes] = useState("");
  const [assignedBefore, setAssignedBefore] = useState<string | null>(null);

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
  const history = detailQuery.data?.history ?? [];

  useEffect(() => {
    if (!reservation) return;
    setAssignedBefore((current) => current ?? reservation.roomNumber);
  }, [reservation]);

  const availabilityQuery = useQuery({
    queryKey: [
      "room-type-availability",
      restaurantId,
      reservation?.arrivalDate,
      reservation?.departureDate,
      reservationId,
      "noshow",
    ],
    queryFn: () =>
      fetchAvailability({
        data: {
          restaurantId,
          arrival: reservation!.arrivalDate,
          departure: reservation!.departureDate,
          excludeReservationId: reservationId,
        },
      }),
    enabled: canManage && Boolean(reservation),
    retry: false,
  });

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

  const ctxQuery = useQuery({
    queryKey: ["fo-cancel-noshow", "noshow", restaurantId, reservationId],
    queryFn: () => fetchCtx({ data: { restaurantId, reservationId, kind: "noshow" } }),
    enabled: canManage,
    retry: false,
  });

  const composedReason = composeNoShowReason(reason, notes);
  const ctx = ctxQuery.data;
  const feeRequired = ctx?.policy.required ?? true;
  const posted = ctx?.posted ?? false;
  const waived = ctx?.waived ?? false;
  const moneyFmt = (value: number) => money(value, reservation?.currency ?? ctx?.folio.currency);
  const eligible = Boolean(
    reservation &&
    businessDate &&
    isDeskNoShowEligible(reservation.status, reservation.arrivalDate, businessDate),
  );
  const cancelPolicy = reservation
    ? cancelPolicyView(
        reservation.cancellationPolicySnapshot,
        reservation.arrivalDate,
        timezone,
        new Date(),
      )
    : null;
  const deposit = reservation
    ? parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot)
    : null;
  const financeRows = noShowFinanceRows({
    roomSubtotal: reservation?.roomSubtotal ?? null,
    packageAmount: commercialQuery.data?.packagesSubtotal ?? null,
    additionalServices: null,
    postedNoShowFee: postedNoShowFeeAmount(ctx?.folio.transactions),
    feeRequired,
    feeSatisfied: posted || waived,
    depositAmount: deposit?.amount ?? null,
    folioBalance: ctx?.folio.balance ?? null,
    money: moneyFmt,
  });
  const reviewOk = Boolean(
    reservation &&
    businessDate &&
    canContinueNoShowReview({
      status: reservation.status,
      arrivalDate: reservation.arrivalDate,
      businessDate,
      reason: composedReason,
    }),
  );
  const confirmOk = Boolean(
    reservation &&
    businessDate &&
    canConfirmNoShowReservation({
      status: reservation.status,
      arrivalDate: reservation.arrivalDate,
      businessDate,
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
          kind: "noshow",
          reason: composedReason || "Fee waived for no-show.",
        },
      }),
    onSuccess: () => {
      toast.success("No-show charge waived.");
      void ctxQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateNoShow = useMutation({
    mutationFn: () => {
      if (!businessDate) throw new Error("Business date is not available.");
      return submitNoShow({
        data: {
          restaurantId,
          reservationId,
          today: businessDate,
          reason: composedReason,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["reservation", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["fo-cancel-noshow"] });
      toast.success("Reservation marked no-show.");
      setStep("complete");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detailQuery.isError) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-destructive">
        Could not load this reservation.
      </div>
    );
  }
  if (!reservation) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-muted-foreground">
        Loading reservation…
      </div>
    );
  }

  const coverUrl =
    (availabilityQuery.data ?? []).find((row) => row.roomTypeId === reservation.roomTypeId)
      ?.coverUrl ?? null;
  const audit = pickNoShowHistory(history);
  const roomReleased = step === "complete" && Boolean(assignedBefore) && !reservation.roomId;
  const systemRows =
    step === "complete"
      ? persistedNoShowUpdates({
          status: reservation.status,
          roomReleased,
          assignedBefore,
          historyRecorded: Boolean(audit),
        })
      : predictedNoShowUpdates({ assignedRoom: reservation.roomNumber, feeRequired });

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="noshow-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-[#251605]">
                {step === "complete"
                  ? "No-Show Processed"
                  : `No-Show Processing — ${reservation.confirmationNumber}`}
              </h1>
              <ReservationStatusBadge status={reservation.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "complete"
                ? "The reservation has been marked as No-Show."
                : "Process guest no-show using the existing Front Office no-show writer."}
            </p>
            {step === "complete" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reservation {reservation.confirmationNumber} · Marked{" "}
                {dateTime(reservation.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenReservation(reservation.id)}
            >
              View Reservation
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" />
              Print
            </Button>
          </div>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" data-testid="noshow-reservation-stepper">
          {NOSHOW_RESERVATION_STEPS.map((item, index) => {
            const current = NOSHOW_RESERVATION_STEPS.findIndex((row) => row.id === step);
            const active = item.id === step;
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  active ? "border-[#1F6FEB] bg-[#EEF4FF]" : "border-[#E6DFD4] bg-white",
                )}
              >
                <p
                  className={cn(
                    "font-medium",
                    index <= current ? "text-[#1F6FEB]" : "text-[#251605]",
                  )}
                >
                  {index + 1}. {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </li>
            );
          })}
        </ol>
      </header>

      {step === "complete" ? (
        <div className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">No-Show Completed</p>
          <p>
            The reservation was marked no-show with completeFoNoShow. Only events that writer
            actually performs are listed below.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              title={step === "complete" ? "Reservation Details (No-Show)" : "Reservation Details"}
            >
              <div className="flex gap-3">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-24 w-32 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-24 w-32 place-items-center rounded-lg bg-[#F4E9D0] text-[#765719]">
                    <BedDouble className="size-8" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-[#251605]">{reservation.roomTypeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {reviewDash(reservation.ratePlanName)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {reservation.adults} Adults · {reservation.nights} nights
                    {reservation.roomNumber ? ` · Room ${reservation.roomNumber}` : " · Unassigned"}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Stay Dates</dt>
                  <dd>
                    {formatStayDate(reservation.arrivalDate)} →{" "}
                    {formatStayDate(reservation.departureDate)}
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
                  <dt className="text-xs text-muted-foreground">Current date / business date</dt>
                  <dd>{businessDate || DETAIL_DASH}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reservation No.</dt>
                  <dd>{reservation.confirmationNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Guest</dt>
                  <dd>{reservation.guestName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="capitalize">{reservation.status.replaceAll("_", " ")}</dd>
                </div>
              </dl>
            </SectionCard>

            {step === "complete" ? (
              <SectionCard title="No-Show Information">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Reason for No-Show</dt>
                    <dd>{reviewDash(audit?.notes ?? composedReason)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Additional Notes</dt>
                    <dd>{reviewDash(notes)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Marked By</dt>
                    <dd>{reviewDash(audit?.actorName)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Date & Time</dt>
                    <dd>
                      {audit?.createdAt
                        ? dateTime(audit.createdAt)
                        : dateTime(reservation.updatedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reference</dt>
                    <dd>{reservation.confirmationNumber}</dd>
                  </div>
                </dl>
              </SectionCard>
            ) : (
              <SectionCard title="Arrival Status">
                <div
                  className={cn(
                    "rounded-lg px-3 py-3 text-sm",
                    eligible ? "bg-rose-50 text-rose-900" : "bg-[#F7F4EE] text-muted-foreground",
                  )}
                >
                  <p className="font-semibold">
                    {eligible ? "Guest has not arrived" : "Not eligible to mark No-Show from Desk"}
                  </p>
                  <p className="mt-1 text-xs">
                    Desk eligibility is confirmed + arrival on or before the property business date.
                    Status is still {reservation.status.replaceAll("_", " ")}.
                  </p>
                  <p className="mt-1 text-xs">Business date: {businessDate || DETAIL_DASH}</p>
                </div>
              </SectionCard>
            )}

            {step !== "complete" ? (
              <SectionCard title="Cancellation Policy Check">
                <p className="text-sm font-medium">{cancelPolicy?.name ?? DETAIL_DASH}</p>
                <p className="text-sm text-muted-foreground">
                  {cancelPolicy?.deadlineLabel ?? DETAIL_DASH}
                </p>
                <p className="mt-2 text-sm">
                  No-show policy:{" "}
                  {noShowPolicyLabel(
                    reservation.refundabilitySnapshot,
                    reservation.cancellationPolicySnapshot,
                  )}
                </p>
                <div
                  className={cn(
                    "mt-3 rounded-lg px-3 py-2 text-sm",
                    cancelPolicy?.outcome === "penalty_applies"
                      ? "bg-amber-50 text-amber-900"
                      : "bg-[#F7F4EE] text-muted-foreground",
                  )}
                >
                  {cancelPolicy?.outcomeLabel ?? "Not evaluated"}. This screen does not calculate a
                  no-show fee from the policy snapshot.
                </div>
              </SectionCard>
            ) : null}

            <SectionCard title={step === "complete" ? "Financial Summary" : "Financial Impact"}>
              <table className="w-full text-sm" data-testid="noshow-finance-table">
                <thead className="text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {financeRows.map((row) => (
                    <tr key={row.description} className="border-t border-[#EEE7DC]">
                      <td className="py-2">{row.description}</td>
                      <td>{row.amount}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">{NOSHOW_COLLECT_CASHIERING}</p>
              {ctx?.folio.folioNumber ? (
                <Button type="button" variant="outline" size="sm" className="mt-2" asChild>
                  <a href={cashieringRefundHref(ctx.folio.folioNumber)}>Open folio in Cashiering</a>
                </Button>
              ) : null}
            </SectionCard>

            <div className="grid gap-4">
              {step !== "complete" ? (
                <SectionCard title="Room Inventory Impact">
                  <ul className="space-y-2 text-sm">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 text-emerald-600" />
                      {reservation.roomNumber
                        ? `If room ${reservation.roomNumber} is still assigned after the RPC, completeFoNoShow clears room_id.`
                        : "No assigned room to release."}
                    </li>
                  </ul>
                </SectionCard>
              ) : null}

              <SectionCard
                title={step === "complete" ? "System Updates" : "Related System Updates"}
              >
                <ul className="space-y-2 text-sm">
                  {systemRows.map((row) => (
                    <li key={row.id} className="flex gap-2">
                      <Check
                        className={cn(
                          "mt-0.5 size-4",
                          row.guaranteed ? "text-emerald-600" : "text-muted-foreground",
                        )}
                      />
                      <span>
                        <span className="font-medium">{row.title}</span>
                        <span className="block text-xs text-muted-foreground">{row.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {step === "complete" ? (
                <SectionCard title="Communication">
                  <p className="text-sm text-muted-foreground">{NOSHOW_COMM_GAP}</p>
                </SectionCard>
              ) : (
                <>
                  <SectionCard title="No-Show Details">
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label>Reason for No-Show</Label>
                        <Select value={reason} onValueChange={setReason}>
                          <SelectTrigger>
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
                      <div className="grid gap-1.5">
                        <Label>Additional Notes (Optional)</Label>
                        <Textarea
                          rows={3}
                          maxLength={500}
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox disabled checked />
                        Mark reservation as No-Show (completeFoNoShow sets reservation status)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox disabled checked={false} />
                        Blacklist guest
                      </label>
                      <p className="text-xs text-muted-foreground">{NOSHOW_BLACKLIST_GAP}</p>
                    </div>
                  </SectionCard>
                  <SectionCard title="Communication">
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox disabled checked={false} />
                        Send no-show notification to guest
                      </label>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox disabled checked={false} />
                        Send notification to company / travel agent
                      </label>
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox disabled checked={false} />
                        Send internal notification to staff
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{NOSHOW_COMM_GAP}</p>
                  </SectionCard>
                </>
              )}
            </div>
          </div>

          {step === "confirm" ? (
            <SectionCard
              className="mt-4"
              title="Confirm no-show"
              subtitle="Nothing is written until you confirm."
            >
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Reason</dt>
                  <dd>{composedReason}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Eligibility</dt>
                  <dd>{eligible ? "Desk-eligible" : "Not eligible"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Room release</dt>
                  <dd>
                    {reservation.roomNumber ? `Room ${reservation.roomNumber}` : "Unassigned"}
                  </dd>
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
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p>{FEE_REQUIRED_BANNER}</p>
                  {ctx?.canWaive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={waive.isPending}
                      onClick={() => waive.mutate()}
                    >
                      Waive no-show charge
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[#DDD4C5] bg-white p-4 xl:block">
          <h2 className="text-sm font-semibold text-[#251605]">Reservation Summary</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {step === "complete"
              ? "This reservation is marked as No-Show."
              : "This reservation will be marked as No-Show."}
          </p>
          <div className="space-y-4 text-sm">
            <div className="flex gap-2">
              <span className="grid size-10 place-items-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
                {guestInitials(reservation.guestName)}
              </span>
              <div>
                <p className="font-medium">{reservation.guestName}</p>
                <p className="text-xs text-muted-foreground">{reservation.confirmationNumber}</p>
                <p className="text-xs">{reviewDash(reservation.guestPhone)}</p>
              </div>
            </div>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Stay Information
              </p>
              <p>
                {formatStayDate(reservation.arrivalDate)} →{" "}
                {formatStayDate(reservation.departureDate)}
              </p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Room & Rate Information
              </p>
              {coverUrl ? (
                <img src={coverUrl} alt="" className="mb-2 h-20 w-full rounded-lg object-cover" />
              ) : null}
              <p className="font-medium">{reservation.roomTypeName}</p>
              <p className="font-semibold">
                {reservation.roomSubtotal == null
                  ? DETAIL_DASH
                  : moneyFmt(reservation.roomSubtotal)}
              </p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Additional Information
              </p>
              <p>Source {sourceLabel(reservation.source, reservation.commercialBookingSource)}</p>
              <p>Channel {channelLabel(reservation.source, reservation.salesChannel)}</p>
            </section>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white px-5 py-3">
        {step === "details" ? (
          <>
            <Button type="button" variant="ghost" onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button type="button" disabled={!reviewOk} onClick={() => setStep("confirm")}>
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
        {step === "confirm" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              <ArrowLeft className="size-3.5" />
              Back to Reservation
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmOk || mutateNoShow.isPending}
              onClick={() => mutateNoShow.mutate()}
            >
              Process No-Show
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
        {step === "complete" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenReservation(reservation.id)}>
              <ArrowLeft className="size-3.5" />
              Back to Reservation
            </Button>
            <Button type="button" onClick={onBackToDesk}>
              Go to Reservation Desk
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
      </footer>
    </div>
  );
}
