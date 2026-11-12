import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Lock } from "lucide-react";
import { toast } from "sonner";

import { useMoney } from "@/core/state/property-format";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import { getAmendContext } from "@/packages/pms/lib/fo-amendments.functions";
import {
  FO_EDIT_DETAILS_PLACEHOLDERS,
  foEditDetailsErrors,
  foEditDetailsFinancial,
  foEditDetailsPlan,
  foEditDetailsSeed,
  foGuestProfileWrite,
  type FoEditDetailsDraft,
  type FoEditDetailsErrors,
} from "@/packages/pms/lib/fo-edit-details";
import {
  CREATE_RESERVATION_MIN_NIGHTS,
  isStayRangeValid,
  linkedStayFromDeparture,
  linkedStayFromNights,
} from "@/packages/pms/lib/create-reservation-phase1";
import { stayDateWriteInput, type RackDatesDraft } from "@/packages/pms/lib/fo-rack-power";
import { quoteInHouseStayChange, changeStayDates } from "@/packages/pms/lib/frontoffice.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getGuest, updateGuest } from "@/packages/pms/lib/guests.functions";
import { amendReservation, getReservation } from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const GOLD_BUTTON = "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]";

/** Same rectangular control used by Check-In registration. */
const CONTROL =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

const SELECT =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus-visible:border-[#8A641A] focus-visible:ring-1 focus-visible:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#756A5B] md:col-span-2">
      {children}
    </p>
  );
}

export function FoEditDetailsForm({
  restaurantId,
  stay,
  notes = null,
  testId,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  notes?: string | null;
  testId: string;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchReservation = useServerFn(getReservation);
  const fetchGuest = useServerFn(getGuest);
  const fetchAmend = useServerFn(getAmendContext);
  const quoteStayChange = useServerFn(quoteInHouseStayChange);
  const submitAmend = useServerFn(amendReservation);
  const submitDates = useServerFn(changeStayDates);
  const submitGuest = useServerFn(updateGuest);

  const reservationQuery = useQuery({
    queryKey: ["reservation", restaurantId, stay.id],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId: stay.id } }),
    retry: false,
  });
  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, stay.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: stay.guestId } }),
    retry: false,
  });
  const amendQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchAmend({ data: { restaurantId, reservationId: stay.id } }),
    retry: false,
  });

  const reservation = reservationQuery.data?.reservation;
  const profile = guestQuery.data?.guest;
  const seed = foEditDetailsSeed({
    stay,
    notes: reservation?.notes ?? notes,
    firstName: profile?.firstName,
    middleName: profile?.middleName,
    lastName: profile?.lastName,
    phone: profile?.phone ?? stay.guestPhone,
    email: profile?.email ?? stay.guestEmail,
  });
  const seedKey = [
    stay.id,
    stay.reservationRoomId ?? "",
    stay.updatedAt ?? "",
    profile?.updatedAt ?? "",
    reservation?.notes ?? notes ?? "",
    seed.firstName,
    seed.middleName,
    seed.lastName,
    seed.phone,
    seed.email,
  ].join("|");

  const [draft, setDraft] = useState<FoEditDetailsDraft>(seed);
  const [errors, setErrors] = useState<FoEditDetailsErrors>({});

  useEffect(() => {
    setDraft(seed);
    setErrors({});
    // Seed identity is the reset boundary. `seed` itself is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const datesChanged = draft.arrival !== seed.arrival || draft.departure !== seed.departure;
  const datesValid = isStayRangeValid(draft.arrival, draft.departure);
  const quoteQuery = useQuery({
    queryKey: [
      "front-office",
      "stay-date-quote",
      restaurantId,
      stay.id,
      draft.arrival,
      draft.departure,
    ],
    queryFn: () =>
      quoteStayChange({
        data: {
          restaurantId,
          reservationId: stay.id,
          arrival: draft.arrival,
          departure: draft.departure,
        },
      }),
    enabled: datesChanged && datesValid,
    retry: false,
  });
  const financial = foEditDetailsFinancial(
    datesChanged && quoteQuery.isSuccess ? quoteQuery.data : null,
  );
  void money;
  void financial;

  const roomTypes = amendQuery.data?.roomTypes ?? [];
  const knownType = roomTypes.some((type) => type.id === draft.roomTypeId);
  const typeOptions = knownType
    ? roomTypes
    : [
        { id: stay.roomTypeId, name: stay.roomTypeName, code: null, maxOccupancy: 0, available: 0 },
        ...roomTypes,
      ];
  const selectedType = roomTypes.find((type) => type.id === draft.roomTypeId);
  const maxOccupancy = selectedType?.maxOccupancy ?? amendQuery.data?.maxOccupancy ?? null;

  function patch(partial: Partial<FoEditDetailsDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function onArrivalChange(arrival: string) {
    const next = linkedStayFromDeparture(arrival, draft.departure);
    patch({ arrival, nights: String(next.nights) });
  }

  function onDepartureChange(departure: string) {
    const next = linkedStayFromDeparture(draft.arrival, departure);
    patch({ departure, nights: String(next.nights) });
  }

  function onNightsChange(nights: string) {
    const parsed = /^\d+$/.test(nights.trim()) ? Number(nights.trim()) : NaN;
    if (!Number.isFinite(parsed) || parsed < CREATE_RESERVATION_MIN_NIGHTS || !draft.arrival) {
      patch({ nights });
      return;
    }
    const next = linkedStayFromNights(draft.arrival, parsed);
    patch({ nights: String(next.nights), departure: next.departure });
  }

  const stayIntervalValid =
    isStayRangeValid(draft.arrival, draft.departure) &&
    /^\d+$/.test(draft.nights.trim()) &&
    Number(draft.nights) >= CREATE_RESERVATION_MIN_NIGHTS;

  const save = useMutation({
    mutationFn: async () => {
      const nextErrors = foEditDetailsErrors({
        draft,
        baseline: seed,
        status: stay.status,
        stay,
        maxOccupancy,
      });
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return false;
      const plan = foEditDetailsPlan({ draft, baseline: seed, status: stay.status });
      if (!plan.amend && !plan.inHouseDates && !plan.guest) return false;
      if (plan.guest) {
        if (!profile) throw new Error("Guest profile is still loading.");
        await submitGuest({
          data: {
            restaurantId,
            guestId: stay.guestId,
            guest: foGuestProfileWrite(profile, {
              firstName: draft.firstName,
              middleName: draft.middleName,
              lastName: draft.lastName,
              phone: draft.phone,
              email: draft.email,
            }),
          },
        });
      }
      if (plan.amend) {
        if (!reservation) throw new Error("Reservation details are still loading.");
        await submitAmend({
          data: {
            restaurantId,
            reservationId: stay.id,
            guestId: stay.guestId,
            roomTypeId: plan.roomTypeId,
            roomId: stay.roomId,
            arrival: plan.amendDates === "form" ? draft.arrival : stay.arrivalDate,
            departure: plan.amendDates === "form" ? draft.departure : stay.departureDate,
            adults: Number(draft.adults),
            children: Number(draft.children),
            specialRequests: draft.specialRequests,
            notes: draft.notes,
            ratePlanId: reservation.ratePlanId,
            commercialBookingSource: reservation.commercialBookingSource,
            marketSegment: reservation.marketSegment,
            externalReference: reservation.externalReference,
            guaranteeMethod: reservation.guaranteeMethod,
            ...(stay.reservationRoomId ? { reservationRoomId: stay.reservationRoomId } : {}),
          },
        });
      }
      if (plan.inHouseDates) {
        const dateDraft: RackDatesDraft = {
          kind: "change_dates",
          reservationId: stay.id,
          guestName: stay.guestName,
          confirmationNumber: stay.confirmationNumber,
          status: stay.status,
          currentRoomId: stay.roomId,
          currentRoomNumber: stay.roomNumber,
          currentRoomTypeId: stay.roomTypeId,
          arrivalDate: stay.arrivalDate,
          departureDate: stay.departureDate,
          nextArrivalDate: draft.arrival,
          nextDepartureDate: draft.departure,
          roomSubtotal: null,
          nightlyRates: null,
          ...(stay.reservationRoomId ? { reservationRoomId: stay.reservationRoomId } : {}),
        };
        await submitDates({
          data: {
            restaurantId,
            reservationId: stay.id,
            ...stayDateWriteInput(dateDraft),
            expectedRoomId: stay.roomId,
            expectedArrival: stay.arrivalDate,
            expectedDeparture: stay.departureDate,
            expectedUpdatedAt: stay.updatedAt ?? null,
          },
        });
      }
      return true;
    },
    onSuccess: (saved) => {
      if (!saved) return;
      void queryClient.invalidateQueries({ queryKey: ["front-office"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId, stay.id] });
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, stay.guestId] });
      void queryClient.invalidateQueries({ queryKey: ["fo-amend", restaurantId, stay.id] });
      void queryClient.invalidateQueries({ queryKey: ["fo-arrival-qv", restaurantId, stay.id] });
      toast.success("Changes saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      role="tabpanel"
      className="rounded-lg border border-[#DDD4C5] bg-card p-3 shadow-sm"
      data-testid={testId}
    >
      <div className="grid gap-2.5 md:grid-cols-2" data-testid="fo-edit-details-form">
        {errors.form ? (
          <p className="text-sm text-destructive md:col-span-2" role="alert">
            {errors.form}
          </p>
        ) : null}

        <SectionLabel>Stay</SectionLabel>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-arrival" required>
            Check-in date
          </FieldLabel>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {!draft.arrival ? (
              <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {FO_EDIT_DETAILS_PLACEHOLDERS.arrival}
              </span>
            ) : null}
            <Input
              id="fo-edit-arrival"
              type="date"
              value={draft.arrival}
              placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.arrival}
              className={cn(CONTROL, "pl-9", !draft.arrival && "text-transparent")}
              data-testid="fo-edit-details-arrival"
              onChange={(event) => onArrivalChange(event.target.value)}
            />
          </div>
          <FieldError message={errors.arrival} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-departure" required>
            Check-out date
          </FieldLabel>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {!draft.departure ? (
              <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {FO_EDIT_DETAILS_PLACEHOLDERS.departure}
              </span>
            ) : null}
            <Input
              id="fo-edit-departure"
              type="date"
              value={draft.departure}
              placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.departure}
              className={cn(CONTROL, "pl-9", !draft.departure && "text-transparent")}
              data-testid="fo-edit-details-departure"
              onChange={(event) => onDepartureChange(event.target.value)}
            />
          </div>
          <FieldError message={errors.departure} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-nights" required>
            Nights
          </FieldLabel>
          <Input
            id="fo-edit-nights"
            inputMode="numeric"
            value={draft.nights}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.nights}
            className={CONTROL}
            data-testid="fo-edit-details-nights"
            onChange={(event) => onNightsChange(event.target.value)}
          />
          <FieldError message={errors.nights} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-room-type" required>
            Room category
          </FieldLabel>
          <Select value={draft.roomTypeId} onValueChange={(roomTypeId) => patch({ roomTypeId })}>
            <SelectTrigger
              id="fo-edit-room-type"
              className={SELECT}
              data-testid="fo-edit-details-room-type"
            >
              <SelectValue placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.roomType} />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.roomType} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-room">Assigned room / unit</FieldLabel>
          <div
            id="fo-edit-room"
            data-testid="fo-edit-details-room"
            className="flex h-9 items-center gap-2 rounded-[6px] border border-[#E8E1D7] bg-[#FAF8F5] px-3 text-sm text-[#8C7E72]"
          >
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span>
              {stay.roomNumber
                ? `Room ${stay.roomNumber}`
                : (FO_EDIT_DETAILS_PLACEHOLDERS.room ?? "Unassigned")}
            </span>
          </div>
        </div>

        <SectionLabel>Occupancy</SectionLabel>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-adults">Adults</FieldLabel>
          <Input
            id="fo-edit-adults"
            inputMode="numeric"
            value={draft.adults}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.adults}
            className={CONTROL}
            data-testid="fo-edit-details-adults"
            onChange={(event) => patch({ adults: event.target.value })}
          />
          <FieldError message={errors.adults} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-children">Children</FieldLabel>
          <Input
            id="fo-edit-children"
            inputMode="numeric"
            value={draft.children}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.children}
            className={CONTROL}
            data-testid="fo-edit-details-children"
            onChange={(event) => patch({ children: event.target.value })}
          />
          <FieldError message={errors.children} />
        </div>

        <SectionLabel>Guest</SectionLabel>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-first-name" required>
            First name
          </FieldLabel>
          <Input
            id="fo-edit-first-name"
            value={draft.firstName}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.firstName}
            className={CONTROL}
            data-testid="fo-edit-details-first-name"
            onChange={(event) => patch({ firstName: event.target.value })}
          />
          <FieldError message={errors.firstName} />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-middle-name">Middle name</FieldLabel>
          <Input
            id="fo-edit-middle-name"
            value={draft.middleName}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.middleName}
            className={CONTROL}
            data-testid="fo-edit-details-middle-name"
            onChange={(event) => patch({ middleName: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-last-name">Last name</FieldLabel>
          <Input
            id="fo-edit-last-name"
            value={draft.lastName}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.lastName}
            className={CONTROL}
            data-testid="fo-edit-details-last-name"
            onChange={(event) => patch({ lastName: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-phone">Phone number</FieldLabel>
          <CanonicalPhoneInput
            id="fo-edit-phone"
            value={draft.phone}
            onChange={(phone) => patch({ phone })}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.phone}
            size="modal"
            containerClassName="h-9 gap-0 overflow-hidden rounded-[6px] border border-[#CCCCCC] bg-white focus-within:border-[#8A641A] focus-within:ring-1 focus-within:ring-[#8A641A]"
            triggerClassName="h-9 w-[7.75rem] rounded-none border-0 bg-transparent px-2 shadow-none hover:bg-[#FAF8F5]"
            className="h-9 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            popoverClassName="z-[90]"
            data-testid="fo-edit-details-phone"
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="fo-edit-email">Email address</FieldLabel>
          <Input
            id="fo-edit-email"
            type="email"
            value={draft.email}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.email}
            className={CONTROL}
            data-testid="fo-edit-details-email"
            onChange={(event) => patch({ email: event.target.value })}
          />
          <FieldError message={errors.email} />
        </div>

        <SectionLabel>Requests & Notes</SectionLabel>
        <div className="space-y-1.5 md:col-span-2">
          <FieldLabel htmlFor="fo-edit-requests">Special Requests</FieldLabel>
          <Textarea
            id="fo-edit-requests"
            value={draft.specialRequests}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.requests}
            className={cn(CONTROL, "min-h-16 py-2")}
            data-testid="fo-edit-details-requests"
            onChange={(event) => patch({ specialRequests: event.target.value })}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <FieldLabel htmlFor="fo-edit-notes">Internal Notes</FieldLabel>
          <Textarea
            id="fo-edit-notes"
            value={draft.notes}
            placeholder={FO_EDIT_DETAILS_PLACEHOLDERS.notes}
            className={cn(CONTROL, "min-h-16 py-2")}
            data-testid="fo-edit-details-notes"
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-md"
          data-testid="fo-edit-details-cancel"
          disabled={save.isPending}
          onClick={() => {
            setDraft(seed);
            setErrors({});
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className={cn("rounded-md", GOLD_BUTTON)}
          data-testid="fo-edit-details-save"
          disabled={save.isPending || !stayIntervalValid}
          onClick={() => save.mutate()}
        >
          Save Changes
        </Button>
      </div>
    </section>
  );
}
