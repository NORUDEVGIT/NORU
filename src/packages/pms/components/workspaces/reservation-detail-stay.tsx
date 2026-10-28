import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Baby,
  Calendar,
  CalendarDays,
  Clock,
  DoorOpen,
  FileText,
  Info,
  Lock,
  Moon,
  UserRound,
  Users,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import {
  setExpectedArrivalTime,
  setLateCheckout,
} from "@/packages/pms/lib/arrivals-departures.functions";
import { getReservationFolio, getFolio } from "@/packages/pms/lib/cashiering.functions";
import { folioLedgerSummary } from "@/packages/pms/lib/reservation-detail-folio";
import {
  groupOccupancyTotals,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import {
  buildStayDraft,
  clockFromInstant,
  STAY_NOTES_MAX,
  stayClockForInput,
  stayInstantFromClock,
  stayNights,
  type ReservationStayDraft,
} from "@/packages/pms/lib/reservation-detail-stay";
import {
  amendReservation,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";

function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return DETAIL_DASH;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function ReservationDetailStayTab({
  restaurantId,
  reservation,
  editable,
  canManage,
  timezone,
  money,
  coverUrl,
  paymentReceived: initialPaymentReceived,
  paymentRefunded: initialPaymentRefunded,
  guestDeposit: initialGuestDeposit,
  totalAmount: initialTotalAmount,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  editable: boolean;
  canManage: boolean;
  timezone: string;
  money: (value: number) => string;
  coverUrl: string | null;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const submitAmend = useServerFn(amendReservation);
  const submitArrival = useServerFn(setExpectedArrivalTime);
  const submitLateCheckout = useServerFn(setLateCheckout);
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);

  const previewFolioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, reservation.id],
    queryFn: () => fetchReservationFolio({ data: { restaurantId, reservationId: reservation.id } }),
    enabled: initialPaymentReceived === undefined,
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["folio", restaurantId, previewFolioQuery.data?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: previewFolioQuery.data!.id } }),
    enabled: Boolean(previewFolioQuery.data?.id) && initialPaymentReceived === undefined,
    retry: false,
  });

  const folioSummary = folioLedgerSummary(folioQuery.data ?? null);
  const effectivePaymentReceived =
    initialPaymentReceived !== undefined
      ? initialPaymentReceived
      : (folioSummary?.payments ?? null);
  const effectivePaymentRefunded =
    initialPaymentRefunded !== undefined
      ? initialPaymentRefunded
      : (folioSummary?.refunds ?? null);
  const effectiveGuestDeposit =
    initialGuestDeposit !== undefined
      ? initialGuestDeposit
      : (folioSummary?.depositCredits ?? null);

  const [draft, setDraft] = useState<ReservationStayDraft>(() => buildStayDraft(reservation));
  const [arrivalClock, setArrivalClock] = useState(() =>
    stayClockForInput(reservation.expectedArrivalAt, timezone),
  );
  const [lateClock, setLateClock] = useState(
    () => stayClockForInput(reservation.lateCheckoutUntil, timezone) || "14:00",
  );
  const [lateNote, setLateNote] = useState("");

  useEffect(() => {
    setDraft(buildStayDraft(reservation));
    setArrivalClock(stayClockForInput(reservation.expectedArrivalAt, timezone));
    setLateClock(stayClockForInput(reservation.lateCheckoutUntil, timezone) || "14:00");
  }, [reservation, timezone]);

  const initialDraft = useMemo(() => buildStayDraft(reservation), [reservation]);
  const isDirty = useMemo(() => {
    return (
      draft.adults !== initialDraft.adults ||
      draft.children !== initialDraft.children ||
      draft.infants !== initialDraft.infants ||
      (draft.stayNotes || "") !== (initialDraft.stayNotes || "")
    );
  }, [draft, initialDraft]);

  const nights = stayNights(reservation.arrivalDate, reservation.departureDate);
  const groupStay = isGroupReservation(reservation);
  const groupOccupancy = groupOccupancyTotals(reservation);
  const arrivalTime = clockFromInstant(reservation.expectedArrivalAt);
  const lateCheckoutTime = clockFromInstant(reservation.lateCheckoutUntil);

  function patch(next: Partial<ReservationStayDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  const etaWritable =
    canManage && (reservation.status === "pending" || reservation.status === "confirmed");
  const lateWritable = canManage && reservation.status === "checked_in";
  const lateApproval = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "late_checkout.authorize", reservation.id],
    queryFn: () => fetchApproval({ data: { restaurantId, actionKey: "late_checkout.authorize" } }),
    enabled: lateWritable,
    retry: false,
  });

  function stayPayload(arrival: string, departure: string) {
    const singleOccupancy = {
      adults: draft.adults,
      children: draft.children,
      infants: draft.infants,
    };
    return {
      restaurantId,
      reservationId: reservation.id,
      guestId: reservation.guestId,
      roomTypeId: reservation.roomTypeId,
      roomId: reservation.roomId,
      arrival,
      departure,
      adults: groupStay ? reservation.adults : singleOccupancy.adults,
      children: groupStay ? reservation.children : singleOccupancy.children,
      infants: groupStay ? reservation.infants : singleOccupancy.infants,
      notes: draft.stayNotes,
      specialRequests: reservation.specialRequests,
      ratePlanId: reservation.ratePlanId,
      purposeOfStay: draft.purposeOfStay || null,
      arrivalTransport: draft.arrivalTransport || null,
      pickupNote: draft.pickupNote || null,
    };
  }

  const save = useMutation({
    mutationFn: () =>
      submitAmend({ data: stayPayload(reservation.arrivalDate, reservation.departureDate) }),
    onSuccess: (result) => {
      toast.success(
        result.amendment ? "Stay updated. Review the room subtotal change." : "Stay updated.",
      );
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveArrival = useMutation({
    mutationFn: (expectedArrivalAt: string | null) =>
      submitArrival({
        data: { restaurantId, reservationId: reservation.id, expectedArrivalAt },
      }),
    onSuccess: () => {
      toast.success("Expected arrival updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveLateCheckout = useMutation({
    mutationFn: (granted: boolean) =>
      submitLateCheckout({
        data: {
          restaurantId,
          reservationId: reservation.id,
          granted,
          until: granted
            ? stayInstantFromClock(reservation.departureDate, lateClock, timezone)
            : null,
          note: lateNote || null,
        },
      }),
    onSuccess: () => {
      toast.success("Late checkout updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-stay">
      <div className="grid min-h-0 flex-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-4 min-w-0">
          {/* Stay Information Card */}
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-[#D97706]" />
              <h2 className="font-display text-base font-semibold text-[#251605]">
                Stay Information
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Core reservation details. These dates and occupancy are fixed until a stay amendment
              is made.
            </p>

            {/* Row 1: Arrival Date, Departure Date, Nights, Rooms */}
            <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StayField label="Arrival Date" htmlFor="stay-arrival">
                <div className="flex h-9 w-full items-center justify-between rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] px-3 text-sm text-[#251605]">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 text-[#8C7A6B]" />
                    <span className="font-medium">{formatDateDMY(reservation.arrivalDate)}</span>
                  </div>
                  <Lock className="size-3.5 text-[#8C7A6B]/70" />
                  <input
                    id="stay-arrival"
                    type="hidden"
                    value={reservation.arrivalDate}
                    readOnly
                    disabled={!editable}
                  />
                </div>
              </StayField>

              <StayField label="Departure Date" htmlFor="stay-departure">
                <div className="flex h-9 w-full items-center justify-between rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] px-3 text-sm text-[#251605]">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 text-[#8C7A6B]" />
                    <span className="font-medium">{formatDateDMY(reservation.departureDate)}</span>
                  </div>
                  <Lock className="size-3.5 text-[#8C7A6B]/70" />
                  <input
                    id="stay-departure"
                    type="hidden"
                    value={reservation.departureDate}
                    readOnly
                    disabled={!editable}
                  />
                </div>
              </StayField>

              <StayField label="Nights">
                <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] px-3 text-sm text-[#251605]">
                  <Moon className="size-3.5 text-[#8C7A6B]" />
                  <span className="font-medium">{nights}</span>
                </div>
              </StayField>

              <StayField label="Rooms">
                <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] px-3 text-sm text-[#251605]">
                  <DoorOpen className="size-3.5 text-[#8C7A6B]" />
                  <span className="font-medium">
                    {groupStay ? groupOccupancy.rooms : reservation.roomsRequested || 1}
                  </span>
                </div>
              </StayField>
            </div>

            {/* Row 2: Adults, Children, Infants */}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StayField label="Adults" htmlFor="stay-adults">
                <div className="relative flex items-center">
                  <UserRound className="pointer-events-none absolute left-3 size-3.5 text-[#8C7A6B]" />
                  <Input
                    id="stay-adults"
                    type="number"
                    min={1}
                    className="h-9 w-full rounded-lg border-[#DDD4C5] bg-white pl-8 pr-3 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#FAF8F5]"
                    value={groupStay ? groupOccupancy.adults : draft.adults}
                    disabled={groupStay || !editable}
                    readOnly={groupStay}
                    onChange={(e) => patch({ adults: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </StayField>

              <StayField label="Children" htmlFor="stay-children">
                <div className="relative flex items-center">
                  <Users className="pointer-events-none absolute left-3 size-3.5 text-[#8C7A6B]" />
                  <Input
                    id="stay-children"
                    type="number"
                    min={0}
                    className="h-9 w-full rounded-lg border-[#DDD4C5] bg-white pl-8 pr-3 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#FAF8F5]"
                    value={groupStay ? groupOccupancy.children : draft.children}
                    disabled={groupStay || !editable}
                    readOnly={groupStay}
                    onChange={(e) => patch({ children: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </StayField>

              <StayField label="Infants" htmlFor="stay-infants">
                <div className="relative flex items-center">
                  <Baby className="pointer-events-none absolute left-3 size-3.5 text-[#8C7A6B]" />
                  <Input
                    id="stay-infants"
                    type="number"
                    min={0}
                    className="h-9 w-full rounded-lg border-[#DDD4C5] bg-white pl-8 pr-3 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#FAF8F5]"
                    value={groupStay ? groupOccupancy.infants : draft.infants}
                    disabled={groupStay || !editable}
                    readOnly={groupStay}
                    onChange={(e) => patch({ infants: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </StayField>
            </div>

            {/* Compact contextual notice for multi-room group stays */}
            {groupStay ? (
              <div
                className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#D5E4F0] bg-[#F2F7FA] px-3 py-2 text-xs text-[#2B5D88]"
                data-testid="stay-group-amend-unavailable"
              >
                <Info className="size-3.5 shrink-0 text-[#2B79B4]" />
                <span>Multi-room date amendments are not supported from this workspace yet.</span>
              </div>
            ) : null}
          </section>

          {/* Row 2: Expected arrival & Late checkout */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Expected arrival */}
            <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-[#D97706]" />
                <h2 className="font-display text-base font-semibold text-[#251605]">
                  Expected arrival
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Set the guest's expected arrival time for operational planning.
              </p>
              <div className="mt-3.5 space-y-1">
                <Label htmlFor="stay-eta" className="text-[11px] text-muted-foreground">
                  Expected arrival time
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="stay-eta"
                    type="time"
                    className="h-9 w-36 rounded-lg border-[#DDD4C5] bg-white px-3 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#FAF8F5]"
                    value={arrivalClock}
                    disabled={!etaWritable || saveArrival.isPending}
                    onChange={(event) => setArrivalClock(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
                    disabled={!etaWritable || !arrivalClock || saveArrival.isPending}
                    onClick={() =>
                      saveArrival.mutate(
                        stayInstantFromClock(reservation.arrivalDate, arrivalClock, timezone),
                      )
                    }
                  >
                    {saveArrival.isPending ? "Saving…" : "Save expected arrival"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-lg border-[#DDD4C5] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F7F2EA]"
                    disabled={
                      !etaWritable ||
                      saveArrival.isPending ||
                      (!reservation.expectedArrivalAt && !arrivalClock)
                    }
                    onClick={() => {
                      setArrivalClock("");
                      saveArrival.mutate(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </section>

            {/* Late checkout */}
            <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-[#D97706]" />
                <h2 className="font-display text-base font-semibold text-[#251605]">
                  Late checkout
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Grant a late checkout for in-house stays only.
              </p>
              <div className="mt-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Current status</span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 font-medium",
                      reservation.lateCheckoutGranted
                        ? "bg-[#EAF7EE] text-[#16A34A]"
                        : "bg-[#F3EFEA] text-[#5C5346]",
                    )}
                  >
                    {reservation.lateCheckoutGranted
                      ? lateCheckoutTime
                        ? `Granted (${lateCheckoutTime})`
                        : "Granted"
                      : "Not granted"}
                  </span>
                </div>
                {lateApproval.data?.policyNeedsApproval ? (
                  <p className="text-xs text-[#765719]">
                    Property policy requires owner or manager approval for late checkout.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
                    disabled={!lateWritable || saveLateCheckout.isPending}
                    onClick={() => saveLateCheckout.mutate(true)}
                  >
                    {saveLateCheckout.isPending ? "Updating…" : "Grant late checkout"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-lg border-[#DDD4C5] bg-white px-3 text-xs font-medium text-[#251605] hover:bg-[#F7F2EA]"
                    disabled={
                      !lateWritable ||
                      !reservation.lateCheckoutGranted ||
                      saveLateCheckout.isPending
                    }
                    onClick={() => saveLateCheckout.mutate(false)}
                  >
                    Clear late checkout
                  </Button>
                </div>
              </div>
            </section>
          </div>

          {/* Internal Notes */}
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#D97706]" />
              <h2 className="font-display text-base font-semibold text-[#251605]">
                Internal Notes
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Same internal notes as the Notes tab. Visible to hotel staff.
            </p>
            <Textarea
              id="stay-notes"
              maxLength={STAY_NOTES_MAX}
              disabled={!editable}
              value={draft.stayNotes}
              onChange={(e) => patch({ stayNotes: e.target.value.slice(0, STAY_NOTES_MAX) })}
              placeholder="Add internal notes here..."
              className="mt-3 min-h-[140px] sm:min-h-[160px] w-full rounded-lg border-[#DDD4C5] bg-white p-3 text-sm text-[#251605] placeholder:text-muted-foreground/60 resize-y disabled:bg-[#FAF8F5]"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {draft.stayNotes.length}/{STAY_NOTES_MAX}
            </p>
          </section>
        </div>

        {/* Right Sticky Reservation Summary */}
        <StaySummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          paymentReceived={effectivePaymentReceived}
          paymentRefunded={effectivePaymentRefunded}
          guestDeposit={effectiveGuestDeposit}
          totalAmount={initialTotalAmount}
        />
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-[#FAF8F5]/95 backdrop-blur-xs px-4 py-3 sm:px-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
          onClick={onBackToOverview}
        >
          <ArrowLeft className="size-3.5" />
          Back to Overview
        </Button>
        <div className="flex items-center gap-3">
          {isDirty ? (
            <span className="flex items-center text-xs font-medium text-[#E06D14]">
              <span className="mr-1.5 size-2 rounded-full bg-[#E06D14]" />
              Unsaved changes
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F2EA]"
            disabled={!editable || !isDirty}
            onClick={() => setDraft(buildStayDraft(reservation))}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-[#251605] px-4 text-xs font-medium text-white hover:bg-[#3D2810]"
            disabled={!editable || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StaySummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  paymentReceived,
  paymentRefunded,
  guestDeposit,
  totalAmount,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-stay-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
      paymentReceived={paymentReceived}
      paymentRefunded={paymentRefunded}
      guestDeposit={guestDeposit}
      totalAmount={totalAmount}
    />
  );
}

function StayField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
