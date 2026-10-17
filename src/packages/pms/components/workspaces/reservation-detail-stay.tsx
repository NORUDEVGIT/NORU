import { useEffect, useState, type ReactNode } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BedDouble, CalendarDays, CreditCard, FileText, Shield, UserRound } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import {
  setExpectedArrivalTime,
  setLateCheckout,
} from "@/packages/pms/lib/arrivals-departures.functions";
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  GROUP_AMEND_UNAVAILABLE,
  GROUP_OCCUPANCY_NOTE,
  groupOccupancyTotals,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import {
  buildStayDraft,
  clockFromInstant,
  STAY_NOTES_MAX,
  stayAmendmentCopy,
  stayClockForInput,
  stayInstantFromClock,
  stayNights,
  type ReservationStayDraft,
} from "@/packages/pms/lib/reservation-detail-stay";
import type { StayAmendmentResult } from "@/packages/pms/lib/reservation-stay-amendment";
import {
  amendReservation,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";

export function ReservationDetailStayTab({
  restaurantId,
  reservation,
  editable,
  canManage,
  canOverbook = false,
  timezone,
  money,
  coverUrl,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  editable: boolean;
  canManage: boolean;
  canOverbook?: boolean;
  timezone: string;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const fetchPurpose = useServerFn(listPurposeOfStay);
  const submitAmend = useServerFn(amendReservation);
  const submitArrival = useServerFn(setExpectedArrivalTime);
  const submitLateCheckout = useServerFn(setLateCheckout);
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);
  const [draft, setDraft] = useState<ReservationStayDraft>(() => buildStayDraft(reservation));
  const [amendArrival, setAmendArrival] = useState(reservation.arrivalDate);
  const [amendDeparture, setAmendDeparture] = useState(reservation.departureDate);
  const [extendDeparture, setExtendDeparture] = useState("");
  const [arrivalClock, setArrivalClock] = useState(() =>
    stayClockForInput(reservation.expectedArrivalAt, timezone),
  );
  const [lateClock, setLateClock] = useState(() =>
    stayClockForInput(reservation.lateCheckoutUntil, timezone),
  );
  const [lateNote, setLateNote] = useState("");
  const [impact, setImpact] = useState<StayAmendmentResult | null>(null);
  const [overbookReason, setOverbookReason] = useState("");
  const [overbookOffer, setOverbookOffer] = useState<null | "dates" | "extend">(null);

  useEffect(() => {
    setDraft(buildStayDraft(reservation));
    setAmendArrival(reservation.arrivalDate);
    setAmendDeparture(reservation.departureDate);
    setExtendDeparture("");
    setArrivalClock(stayClockForInput(reservation.expectedArrivalAt, timezone));
    setLateClock(stayClockForInput(reservation.lateCheckoutUntil, timezone));
  }, [reservation, timezone]);

  const purposeQuery = useQuery({
    queryKey: ["pms-purpose-of-stay", restaurantId, "reservation-detail-stay"],
    queryFn: () => fetchPurpose({ data: { restaurantId } }),
    retry: false,
    enabled: editable,
  });

  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);
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

  function stayPayload(arrival: string, departure: string, overbook?: { reason: string }) {
    return {
      restaurantId,
      reservationId: reservation.id,
      guestId: reservation.guestId,
      roomTypeId: reservation.roomTypeId,
      roomId: reservation.roomId,
      arrival,
      departure,
      adults: groupStay ? reservation.adults : draft.adults,
      children: groupStay ? reservation.children : draft.children,
      infants: groupStay ? reservation.infants : draft.infants,
      notes: draft.stayNotes,
      specialRequests: reservation.specialRequests,
      ratePlanId: reservation.ratePlanId,
      purposeOfStay: draft.purposeOfStay || null,
      arrivalTransport: draft.arrivalTransport || null,
      pickupNote: draft.pickupNote || null,
      ...(overbook
        ? { overbookingRequested: true as const, overbookingReason: overbook.reason }
        : {}),
    };
  }

  const save = useMutation({
    mutationFn: () =>
      submitAmend({ data: stayPayload(reservation.arrivalDate, reservation.departureDate) }),
    onSuccess: (result) => {
      setImpact(result.amendment);
      toast.success(
        result.amendment ? "Stay updated. Review the room subtotal change." : "Stay updated.",
      );
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function reportStayError(error: Error, kind: "dates" | "extend") {
    if (error.message.includes("No rooms of that type are available")) {
      if (canOverbook) {
        setOverbookOffer(kind);
        return;
      }
      toast.error("No physical availability. Overbooking requires Owner or Manager authorization.");
      return;
    }
    toast.error(error.message);
  }

  const amendDates = useMutation({
    mutationFn: (reason?: string) =>
      submitAmend({
        data: stayPayload(amendArrival, amendDeparture, reason ? { reason } : undefined),
      }),
    onSuccess: (result) => {
      setOverbookOffer(null);
      setImpact(result.amendment);
      toast.success("Stay dates amended.");
      onSaved();
    },
    onError: (error: Error) => reportStayError(error, "dates"),
  });

  const extendStay = useMutation({
    mutationFn: (reason?: string) =>
      submitAmend({
        data: stayPayload(
          reservation.arrivalDate,
          extendDeparture,
          reason ? { reason } : undefined,
        ),
      }),
    onSuccess: (result) => {
      setOverbookOffer(null);
      setImpact(result.amendment);
      toast.success("Stay extended.");
      onSaved();
    },
    onError: (error: Error) => reportStayError(error, "extend"),
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
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-base text-[#251605]">
              <CalendarDays className="size-4 text-[#B8954F]" />
              Stay Information
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Dates stay fixed until a stay amendment reprices the reservation. Occupancy, purpose,
              and internal notes can be saved when this stay is editable.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StayField label="Arrival Date" htmlFor="stay-arrival">
                <Input
                  id="stay-arrival"
                  type="date"
                  className={FIELD}
                  value={reservation.arrivalDate}
                  readOnly
                  disabled
                />
              </StayField>
              <StayField label="Departure Date" htmlFor="stay-departure">
                <Input
                  id="stay-departure"
                  type="date"
                  className={FIELD}
                  value={reservation.departureDate}
                  readOnly
                  disabled
                />
              </StayField>
              <StayField label="Nights">
                <Input className={FIELD} value={String(nights)} disabled />
              </StayField>
              {groupStay ? (
                <StayField label="Rooms">
                  <Input className={FIELD} value={String(groupOccupancy.rooms)} disabled readOnly />
                </StayField>
              ) : null}
              <StayField label="Adults *">
                <Input
                  type="number"
                  min={1}
                  className={FIELD}
                  value={groupStay ? groupOccupancy.adults : draft.adults}
                  disabled={groupStay || !editable}
                  readOnly={groupStay}
                  onChange={(e) => patch({ adults: Math.max(1, Number(e.target.value) || 1) })}
                />
              </StayField>
              <StayField label="Children">
                <Input
                  type="number"
                  min={0}
                  className={FIELD}
                  value={groupStay ? groupOccupancy.children : draft.children}
                  disabled={groupStay || !editable}
                  readOnly={groupStay}
                  onChange={(e) => patch({ children: Math.max(0, Number(e.target.value) || 0) })}
                />
              </StayField>
              <StayField label="Infants">
                <Input
                  type="number"
                  min={0}
                  className={FIELD}
                  value={groupStay ? groupOccupancy.infants : draft.infants}
                  disabled={groupStay || !editable}
                  readOnly={groupStay}
                  onChange={(e) => patch({ infants: Math.max(0, Number(e.target.value) || 0) })}
                />
              </StayField>
              <StayField label="Purpose of Stay">
                <Select
                  value={draft.purposeOfStay || "none"}
                  onValueChange={(value) => patch({ purposeOfStay: value === "none" ? "" : value })}
                  disabled={!editable}
                >
                  <SelectTrigger className={FIELD}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {draft.purposeOfStay &&
                    !purposeOptions.some((option) => option.value === draft.purposeOfStay) ? (
                      <SelectItem value={draft.purposeOfStay}>{draft.purposeOfStay}</SelectItem>
                    ) : null}
                    {purposeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </StayField>
              <StayField label="Expected Arrival">
                <Input className={FIELD} value={arrivalTime || DETAIL_DASH} disabled />
              </StayField>
              <StayField label="Late Checkout">
                <Input
                  className={FIELD}
                  value={
                    reservation.lateCheckoutGranted ? lateCheckoutTime || "Granted" : "Not granted"
                  }
                  disabled
                />
              </StayField>
            </div>
            {groupStay ? (
              <p className="mt-3 text-xs text-muted-foreground" data-testid="stay-group-occupancy">
                {GROUP_OCCUPANCY_NOTE}
              </p>
            ) : null}
          </section>
          {impact ? (
            <p
              className="rounded-md border border-[#E7D7B1] bg-[#FBF6EC] px-3 py-2 text-sm text-[#251605]"
              data-testid="stay-amendment-result"
            >
              {stayAmendmentCopy(impact, money)}
            </p>
          ) : null}
          {groupStay ? (
            <p
              className="rounded-md border border-[#E7D7B1] bg-[#FBF6EC] px-3 py-2 text-xs text-[#251605]"
              data-testid="stay-group-amend-unavailable"
            >
              {GROUP_AMEND_UNAVAILABLE}
            </p>
          ) : (
            <>
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <h2 className="font-display text-base text-[#251605]">Amend dates</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  This saves a new arrival and departure, reprices one room, and shows the room
                  subtotal returned by the server.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StayField label="New arrival" htmlFor="amend-arrival">
                    <Input
                      id="amend-arrival"
                      type="date"
                      className={FIELD}
                      value={amendArrival}
                      disabled={!editable || amendDates.isPending}
                      onChange={(event) => setAmendArrival(event.target.value)}
                    />
                  </StayField>
                  <StayField label="New departure" htmlFor="amend-departure">
                    <Input
                      id="amend-departure"
                      type="date"
                      className={FIELD}
                      value={amendDeparture}
                      disabled={!editable || amendDates.isPending}
                      onChange={(event) => setAmendDeparture(event.target.value)}
                    />
                  </StayField>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={!editable || amendDates.isPending}
                  onClick={() => amendDates.mutate(undefined)}
                >
                  {amendDates.isPending ? "Amending…" : "Amend dates"}
                </Button>
                {overbookOffer === "dates" && canOverbook ? (
                  <OverbookAmendReason
                    reason={overbookReason}
                    pending={amendDates.isPending}
                    onReason={setOverbookReason}
                    onConfirm={() => amendDates.mutate(overbookReason.trim())}
                  />
                ) : null}
              </section>
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <h2 className="font-display text-base text-[#251605]">Extend Stay</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Moves only the departure date. If the assigned room is already booked for the
                  extra nights, use Change Room. This does not move the guest or create another
                  reservation.
                </p>
                <StayField label="New departure" htmlFor="extend-departure">
                  <Input
                    id="extend-departure"
                    type="date"
                    className={FIELD}
                    value={extendDeparture}
                    min={reservation.departureDate}
                    disabled={!editable || extendStay.isPending}
                    onChange={(event) => setExtendDeparture(event.target.value)}
                  />
                </StayField>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={
                    !editable ||
                    !extendDeparture ||
                    extendDeparture <= reservation.departureDate ||
                    extendStay.isPending
                  }
                  onClick={() => extendStay.mutate(undefined)}
                >
                  {extendStay.isPending ? "Extending…" : "Extend Stay"}
                </Button>
                {overbookOffer === "extend" && canOverbook ? (
                  <OverbookAmendReason
                    reason={overbookReason}
                    pending={extendStay.isPending}
                    onReason={setOverbookReason}
                    onConfirm={() => extendStay.mutate(overbookReason.trim())}
                  />
                ) : null}
              </section>
            </>
          )}
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Expected arrival</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Saved on the arrival date for pending and confirmed stays. Current time:{" "}
              {arrivalTime || "not set"}.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <StayField label="Time" htmlFor="stay-eta">
                <Input
                  id="stay-eta"
                  type="time"
                  className={FIELD}
                  value={arrivalClock}
                  disabled={!etaWritable || saveArrival.isPending}
                  onChange={(event) => setArrivalClock(event.target.value)}
                />
              </StayField>
              <Button
                type="button"
                size="sm"
                disabled={!etaWritable || !arrivalClock || saveArrival.isPending}
                onClick={() =>
                  saveArrival.mutate(
                    stayInstantFromClock(reservation.arrivalDate, arrivalClock, timezone),
                  )
                }
              >
                Save expected arrival
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!etaWritable || saveArrival.isPending}
                onClick={() => saveArrival.mutate(null)}
              >
                Clear
              </Button>
            </div>
          </section>
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Late checkout</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              In-house stays only. The departure date stays {reservation.departureDate}. Current:{" "}
              {reservation.lateCheckoutGranted ? lateCheckoutTime || "Granted" : "Not granted"}.
            </p>
            {lateApproval.data?.policyNeedsApproval ? (
              <p className="mb-2 text-xs text-[#765719]">
                Property policy requires owner or manager approval for late checkout.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <StayField label="Until" htmlFor="stay-late">
                <Input
                  id="stay-late"
                  type="time"
                  className={FIELD}
                  value={lateClock}
                  disabled={!lateWritable || saveLateCheckout.isPending}
                  onChange={(event) => setLateClock(event.target.value)}
                />
              </StayField>
              <StayField label="Note" htmlFor="stay-late-note">
                <Input
                  id="stay-late-note"
                  className={FIELD}
                  value={lateNote}
                  maxLength={500}
                  disabled={!lateWritable || saveLateCheckout.isPending}
                  onChange={(event) => setLateNote(event.target.value)}
                />
              </StayField>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!lateWritable || !lateClock || saveLateCheckout.isPending}
                onClick={() => saveLateCheckout.mutate(true)}
              >
                Grant late checkout
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!lateWritable || saveLateCheckout.isPending}
                onClick={() => saveLateCheckout.mutate(false)}
              >
                Clear late checkout
              </Button>
            </div>
          </section>
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Arrival transport</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Flight or other transport text stored on this reservation.
            </p>
            <Input
              id="stay-transport"
              className={FIELD}
              maxLength={200}
              disabled={!editable}
              value={draft.arrivalTransport}
              onChange={(event) => patch({ arrivalTransport: event.target.value })}
            />
          </section>
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Pickup note</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              A note on the reservation. This does not create a pickup request or a service order.
            </p>
            <Input
              id="stay-pickup"
              className={FIELD}
              maxLength={200}
              disabled={!editable}
              value={draft.pickupNote}
              onChange={(event) => patch({ pickupNote: event.target.value })}
            />
          </section>
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Internal Notes</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Same internal notes as the Notes tab. Visible to hotel staff.
            </p>
            <Textarea
              id="stay-notes"
              maxLength={STAY_NOTES_MAX}
              disabled={!editable}
              value={draft.stayNotes}
              onChange={(e) => patch({ stayNotes: e.target.value.slice(0, STAY_NOTES_MAX) })}
              placeholder="Add internal notes here…"
              className="min-h-24"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {draft.stayNotes.length}/{STAY_NOTES_MAX}
            </p>
          </section>
        </div>
        <StaySummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToOverview}>
          Back to Overview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable}
            onClick={() => setDraft(buildStayDraft(reservation))}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverbookAmendReason({
  reason,
  pending,
  onReason,
  onConfirm,
}: {
  reason: string;
  pending: boolean;
  onReason: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-[#251605]">
      <p>This change exceeds physical inventory.</p>
      <label className="mt-2 block text-xs">
        Reason *
        <textarea
          className="mt-1 w-full rounded-md border border-[#E5DED4] bg-white p-2"
          value={reason}
          onChange={(event) => onReason(event.target.value)}
        />
      </label>
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={pending || reason.trim().length === 0}
        onClick={onConfirm}
      >
        Confirm overbooking
      </Button>
    </div>
  );
}

function StaySummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-stay-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
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
