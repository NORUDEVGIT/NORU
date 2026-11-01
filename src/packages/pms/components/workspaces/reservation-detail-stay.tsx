import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, Clock, NotebookPen } from "lucide-react";

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
import { getFrontOfficeApprovalRequirement } from "@/packages/pms/lib/fo-approvals.functions";
import {
  setExpectedArrivalTime,
  setLateCheckout,
} from "@/packages/pms/lib/arrivals-departures.functions";
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
import {
  GROUP_AMEND_UNAVAILABLE,
  GROUP_OCCUPANCY_NOTE,
  groupOccupancyTotals,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
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

const FIELD = "h-9 rounded-lg border-gray-200 bg-white";
const GOLD_BUTTON = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#251605]">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
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

/**
 * Simple stay form: one card for dates, guests and purpose (single Save),
 * one for expected arrival / late checkout, one for notes.
 */
export function ReservationStayTab({
  restaurantId,
  reservation,
  editable,
  canManage,
  timezone,
  money,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  editable: boolean;
  canManage: boolean;
  timezone: string;
  money: (value: number) => string;
  /** Kept so existing callers still compile. */
  coverUrl?: string | null;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const fetchPurpose = useServerFn(listPurposeOfStay);
  const submitAmend = useServerFn(amendReservation);
  const submitArrival = useServerFn(setExpectedArrivalTime);
  const submitLateCheckout = useServerFn(setLateCheckout);
  const fetchApproval = useServerFn(getFrontOfficeApprovalRequirement);

  const [draft, setDraft] = useState<ReservationStayDraft>(() => buildStayDraft(reservation));
  const [arrival, setArrival] = useState(reservation.arrivalDate);
  const [departure, setDeparture] = useState(reservation.departureDate);
  const [arrivalClock, setArrivalClock] = useState(() =>
    stayClockForInput(reservation.expectedArrivalAt, timezone),
  );
  const [lateClock, setLateClock] = useState(() =>
    stayClockForInput(reservation.lateCheckoutUntil, timezone),
  );
  const [impact, setImpact] = useState<StayAmendmentResult | null>(null);

  function reset() {
    setDraft(buildStayDraft(reservation));
    setArrival(reservation.arrivalDate);
    setDeparture(reservation.departureDate);
    setArrivalClock(stayClockForInput(reservation.expectedArrivalAt, timezone));
    setLateClock(stayClockForInput(reservation.lateCheckoutUntil, timezone));
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation, timezone]);

  const purposeQuery = useQuery({
    queryKey: ["pms-purpose-of-stay", restaurantId, "reservation-detail-stay"],
    queryFn: () => fetchPurpose({ data: { restaurantId } }),
    retry: false,
    enabled: editable,
  });
  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);

  const group = isGroupReservation(reservation);
  const groupOccupancy = groupOccupancyTotals(reservation);
  const datesValid = departure > arrival;
  const nights = datesValid ? stayNights(arrival, departure) : 0;
  const arrivalTime = clockFromInstant(reservation.expectedArrivalAt);
  const lateTime = clockFromInstant(reservation.lateCheckoutUntil);

  const etaWritable =
    canManage && (reservation.status === "pending" || reservation.status === "confirmed");
  const lateWritable = canManage && reservation.status === "checked_in";
  const lateApproval = useQuery({
    queryKey: ["front-office", "approval", restaurantId, "late_checkout.authorize", reservation.id],
    queryFn: () => fetchApproval({ data: { restaurantId, actionKey: "late_checkout.authorize" } }),
    enabled: lateWritable,
    retry: false,
  });

  function patch(next: Partial<ReservationStayDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  const save = useMutation({
    mutationFn: () =>
      submitAmend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: group ? reservation.arrivalDate : arrival,
          departure: group ? reservation.departureDate : departure,
          adults: group ? reservation.adults : draft.adults,
          children: group ? reservation.children : draft.children,
          infants: group ? reservation.infants : draft.infants,
          notes: draft.stayNotes,
          specialRequests: reservation.specialRequests,
          ratePlanId: reservation.ratePlanId,
          purposeOfStay: draft.purposeOfStay || null,
          arrivalTransport: draft.arrivalTransport || null,
          pickupNote: draft.pickupNote || null,
        },
      }),
    onSuccess: (result) => {
      setImpact(result.amendment);
      toast.success(
        result.amendment ? "Stay updated. Review the room subtotal change." : "Stay updated.",
      );
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveArrival = useMutation({
    mutationFn: (expectedArrivalAt: string | null) =>
      submitArrival({ data: { restaurantId, reservationId: reservation.id, expectedArrivalAt } }),
    onSuccess: () => {
      toast.success("Expected arrival updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveLate = useMutation({
    mutationFn: (granted: boolean) =>
      submitLateCheckout({
        data: {
          restaurantId,
          reservationId: reservation.id,
          granted,
          until: granted
            ? stayInstantFromClock(reservation.departureDate, lateClock, timezone)
            : null,
          note: null,
        },
      }),
    onSuccess: () => {
      toast.success("Late checkout updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="reservation-detail-stay">
      <Card
        icon={CalendarDays}
        title="Stay"
        description={
          group
            ? GROUP_AMEND_UNAVAILABLE
            : "Change the dates or guests, then save. The room is repriced if the dates change."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Arrival" htmlFor="stay-arrival">
            <Input
              id="stay-arrival"
              type="date"
              className={FIELD}
              value={arrival}
              disabled={!editable || group}
              onChange={(e) => setArrival(e.target.value)}
            />
          </Field>
          <Field label="Departure" htmlFor="stay-departure">
            <Input
              id="stay-departure"
              type="date"
              className={FIELD}
              value={departure}
              min={arrival}
              disabled={!editable || group}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </Field>
          <Field label="Nights">
            <Input className={FIELD} value={String(nights)} disabled />
          </Field>
          <Field label="Purpose of Stay">
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
          </Field>
          <Field label="Adults">
            <Input
              type="number"
              min={1}
              className={FIELD}
              value={group ? groupOccupancy.adults : draft.adults}
              disabled={group || !editable}
              onChange={(e) => patch({ adults: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label="Children">
            <Input
              type="number"
              min={0}
              className={FIELD}
              value={group ? groupOccupancy.children : draft.children}
              disabled={group || !editable}
              onChange={(e) => patch({ children: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Infants">
            <Input
              type="number"
              min={0}
              className={FIELD}
              value={group ? groupOccupancy.infants : draft.infants}
              disabled={group || !editable}
              onChange={(e) => patch({ infants: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          {group ? (
            <Field label="Rooms">
              <Input className={FIELD} value={String(groupOccupancy.rooms)} disabled />
            </Field>
          ) : null}
        </div>
        {group ? (
          <p className="mt-3 text-xs text-muted-foreground">{GROUP_OCCUPANCY_NOTE}</p>
        ) : null}
        {!datesValid && !group ? (
          <p className="mt-3 text-xs text-destructive">Departure must be after arrival.</p>
        ) : null}
      </Card>

      {impact ? (
        <p
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-[#251605]"
          data-testid="stay-amendment-result"
        >
          {stayAmendmentCopy(impact, money)}
        </p>
      ) : null}

      <Card
        icon={Clock}
        title="Arrival & Checkout Times"
        description={`Expected arrival: ${arrivalTime || "not set"} · Late checkout: ${
          reservation.lateCheckoutGranted ? lateTime || "granted" : "not granted"
        }`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Expected arrival (pending / confirmed)" htmlFor="stay-eta">
              <Input
                id="stay-eta"
                type="time"
                className={FIELD}
                value={arrivalClock}
                disabled={!etaWritable || saveArrival.isPending}
                onChange={(e) => setArrivalClock(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              size="sm"
              className={GOLD_BUTTON}
              disabled={!etaWritable || !arrivalClock || saveArrival.isPending}
              onClick={() =>
                saveArrival.mutate(
                  stayInstantFromClock(reservation.arrivalDate, arrivalClock, timezone),
                )
              }
            >
              Save
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

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Late checkout until (in-house)" htmlFor="stay-late">
              <Input
                id="stay-late"
                type="time"
                className={FIELD}
                value={lateClock}
                disabled={!lateWritable || saveLate.isPending}
                onChange={(e) => setLateClock(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              size="sm"
              className={GOLD_BUTTON}
              disabled={!lateWritable || !lateClock || saveLate.isPending}
              onClick={() => saveLate.mutate(true)}
            >
              Grant
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!lateWritable || saveLate.isPending}
              onClick={() => saveLate.mutate(false)}
            >
              Clear
            </Button>
          </div>
        </div>
        {lateApproval.data?.policyNeedsApproval ? (
          <p className="mt-2 text-xs text-amber-700">
            Late checkout needs owner or manager approval under property policy.
          </p>
        ) : null}
      </Card>

      <Card icon={NotebookPen} title="Notes & Pickup">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arrival transport" htmlFor="stay-transport">
            <Input
              id="stay-transport"
              className={FIELD}
              maxLength={200}
              placeholder="Flight or other transport"
              disabled={!editable}
              value={draft.arrivalTransport}
              onChange={(e) => patch({ arrivalTransport: e.target.value })}
            />
          </Field>
          <Field label="Pickup note" htmlFor="stay-pickup">
            <Input
              id="stay-pickup"
              className={FIELD}
              maxLength={200}
              disabled={!editable}
              value={draft.pickupNote}
              onChange={(e) => patch({ pickupNote: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Internal notes (staff only)" htmlFor="stay-notes">
            <Textarea
              id="stay-notes"
              maxLength={STAY_NOTES_MAX}
              disabled={!editable}
              value={draft.stayNotes}
              onChange={(e) => patch({ stayNotes: e.target.value.slice(0, STAY_NOTES_MAX) })}
              placeholder="Add internal notes here…"
              className="min-h-24 rounded-lg border-gray-200"
            />
          </Field>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {draft.stayNotes.length}/{STAY_NOTES_MAX}
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToOverview}>
          Back to Overview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className={GOLD_BUTTON}
            disabled={!editable || save.isPending || (!group && !datesValid)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={reset}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}