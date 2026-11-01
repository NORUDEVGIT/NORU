import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BedDouble, Check, Printer, Search } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
  isStayRangeValid,
} from "@/packages/pms/lib/create-reservation-phase1";
import { addDays, nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { guestListItems, getGuest, listGuests } from "@/packages/pms/lib/guests.functions";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  channelLabel,
  DETAIL_DASH,
  sourceLabel,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  buildConfirmNextEvents,
  buildEditChangeRows,
  buildEditImpactRows,
  cancellationLabel,
  clearSessionDraft,
  confirmIsEnabled,
  depositLabel,
  draftFromReservation,
  EDIT_DASH,
  EDIT_DRAFT_LOCAL_COPY,
  EDIT_NO_CHANGE,
  EDIT_PREFERENCE_FLAGS,
  EDIT_RESERVATION_STEPS,
  guestCountLabel,
  loadSessionDraft,
  occupancyIsBlocked,
  packagesLabel,
  persistableChanges,
  pickLatestAmendHistory,
  ratePerNightLabel,
  requestPrefChecked,
  saveSessionDraft,
  stayDatesLabel,
  toggleRequestPref,
  type EditReservationStepId,
  type ReservationEditDraft,
} from "@/packages/pms/lib/reservation-edit-workspace";
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
import { listRatePlans, quoteStay } from "@/packages/pms/lib/rates.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import {
  amendReservation,
  getBookingsAccess,
  getReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const UNASSIGNED = "unassigned";
const NONE = "__none__";

/* Palette: brown text, gold accents, white surfaces. */
const PRIMARY_BUTTON =
  "rounded-full bg-[#C89933] font-bold text-[#251605] hover:bg-[#B98B2D] disabled:opacity-50";
const OUTLINE_BUTTON =
  "rounded-full border-[#e9dfd0] bg-white font-semibold text-[#4a2c1a] shadow-none hover:bg-[#f5ead0]";
const GHOST_BUTTON = "rounded-full font-semibold text-[#4a2c1a] hover:bg-[#f5ead0]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-[11px] font-medium text-[#7A6B58]">
        {label}
        {required ? <span className="text-[#C89933]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-[#e9dfd0] bg-white p-5 shadow-sm", className)}
    >
      <header className="mb-4">
        <h2 className="font-display text-base font-semibold text-[#4a2c1a]">{title}</h2>
        <p className="text-xs text-[#7A6B58]">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function ReadValue({ value }: { value: string | null | undefined }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-[#efe7d8] bg-[#faf7f1] px-3 text-sm text-[#4a2c1a]">
      {reviewDash(value)}
    </div>
  );
}

function SummaryHeading({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-bold text-[#8C6D23]">{children}</p>;
}

export function ReservationEditWorkspace({
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
  const { dateTime } = useRestaurantTime();
  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchGuest = useServerFn(getGuest);
  const fetchGuests = useServerFn(listGuests);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const fetchQuotes = useServerFn(quoteStay);
  const fetchPlans = useServerFn(listRatePlans);
  const fetchPurpose = useServerFn(listPurposeOfStay);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const submitAmend = useServerFn(amendReservation);

  const [step, setStep] = useState<EditReservationStepId>("details");
  const [draft, setDraft] = useState<ReservationEditDraft | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [baseline, setBaseline] = useState<ReservationEditDraft | null>(null);

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
    setDraft(null);
    setBaseline(null);
    setStep("details");
  }, [reservationId]);

  useEffect(() => {
    if (!reservation) return;
    const next = draftFromReservation(reservation);
    const stored = loadSessionDraft(reservationId);
    setBaseline((current) => current ?? next);
    setDraft(
      (current) =>
        current ??
        (stored ? { ...next, ...stored, guestId: stored.guestId || next.guestId } : next),
    );
  }, [reservation, reservationId]);

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, draft?.guestId ?? reservation?.guestId],
    queryFn: () =>
      fetchGuest({ data: { restaurantId, guestId: (draft?.guestId ?? reservation!.guestId)! } }),
    enabled: canManage && Boolean(draft?.guestId ?? reservation?.guestId),
    retry: false,
  });

  const datesValid = Boolean(draft && isStayRangeValid(draft.arrival, draft.departure));
  const nights = draft && datesValid ? nightsBetween(draft.arrival, draft.departure) : 0;

  const availabilityQuery = useQuery({
    queryKey: [
      "room-type-availability",
      restaurantId,
      draft?.arrival,
      draft?.departure,
      reservationId,
    ],
    queryFn: () =>
      fetchAvailability({
        data: {
          restaurantId,
          arrival: draft!.arrival,
          departure: draft!.departure,
          excludeReservationId: reservationId,
        },
      }),
    enabled: canManage && Boolean(draft) && datesValid,
    retry: false,
  });

  const roomsQuery = useQuery({
    queryKey: [
      "assignable-rooms",
      restaurantId,
      draft?.roomTypeId,
      draft?.arrival,
      draft?.departure,
      reservationId,
      "edit",
    ],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: draft!.roomTypeId,
          arrival: draft!.arrival,
          departure: draft!.departure,
          excludeReservationId: reservationId,
        },
      }),
    enabled: canManage && Boolean(draft?.roomTypeId) && datesValid,
    retry: false,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, guestSearch, "edit-reservation"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: 8,
          ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}),
        },
      }),
    enabled: canManage && step === "details",
    retry: false,
  });

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, draft?.roomTypeId, "edit-reservation"],
    queryFn: () =>
      fetchPlans({
        data: { restaurantId, roomTypeId: draft!.roomTypeId, activeOnly: true },
      }),
    enabled: canManage && Boolean(draft?.roomTypeId),
    retry: false,
  });

  const quoteQuery = useQuery({
    queryKey: [
      "edit-quote",
      restaurantId,
      draft?.roomTypeId,
      draft?.arrival,
      draft?.departure,
      draft?.ratePlanId,
      draft?.adults,
      draft?.children,
    ],
    queryFn: () =>
      fetchQuotes({
        data: {
          restaurantId,
          roomTypeId: draft!.roomTypeId,
          arrival: draft!.arrival,
          departure: draft!.departure,
          adults: draft!.adults,
          children: draft!.children,
          ...(draft!.ratePlanId ? { ratePlanId: draft!.ratePlanId } : {}),
        },
      }),
    enabled: canManage && Boolean(draft) && datesValid && Boolean(draft?.ratePlanId),
    retry: false,
  });

  const purposeQuery = useQuery({
    queryKey: ["purpose-of-stay", restaurantId],
    queryFn: () => fetchPurpose({ data: { restaurantId } }),
    enabled: canManage,
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

  const selectedType = (availabilityQuery.data ?? []).find(
    (row) => row.roomTypeId === draft?.roomTypeId,
  );
  const selectedRoom = (roomsQuery.data ?? []).find((row) => row.id === draft?.roomId);
  const quoted =
    quoteQuery.data?.find((row) => !draft?.ratePlanId || row.plan.id === draft.ratePlanId) ??
    quoteQuery.data?.[0];
  const quotedTotal = quoted?.quote?.subtotal ?? null;
  const quotedNightly = quoted?.quote?.nightly?.[0]?.rate ?? null;
  const quotedCancellation = quoted?.cancellationLabel ?? null;

  function patch(partial: Partial<ReservationEditDraft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  const liveDraft: ReservationEditDraft | null = draft
    ? {
        ...draft,
        roomTypeName: selectedType?.name ?? draft.roomTypeName,
        roomNumber: draft.keepRoomUnassigned
          ? null
          : (selectedRoom?.roomNumber ??
            (draft.roomId === reservation?.roomId ? draft.roomNumber : null)),
        roomId: draft.keepRoomUnassigned ? null : draft.roomId,
        ratePlanName:
          (plansQuery.data ?? []).find((plan) => plan.id === draft.ratePlanId)?.name ??
          draft.ratePlanName,
      }
    : null;

  const moneyFmt = (value: number) => money(value, reservation?.currency);
  const storedPackages = packagesLabel(
    commercialQuery.data?.packages.map((row) => row.packageName),
  );
  const storedDeposit = reservation
    ? depositLabel(reservation.depositRequirementSnapshot, moneyFmt)
    : EDIT_DASH;
  const storedCancellation = reservation
    ? cancellationLabel(reservation.cancellationPolicySnapshot)
    : EDIT_DASH;
  const storedRate = reservation
    ? ratePerNightLabel(
        reservation.nightlyRates,
        reservation.roomSubtotal,
        reservation.nights,
        moneyFmt,
      )
    : EDIT_DASH;
  const storedTotal =
    reservation?.roomSubtotal == null ? EDIT_DASH : moneyFmt(reservation.roomSubtotal);
  const proposedRate =
    quotedNightly != null
      ? moneyFmt(quotedNightly)
      : liveDraft &&
          baseline &&
          liveDraft.ratePlanId === baseline.ratePlanId &&
          liveDraft.arrival === baseline.arrival &&
          liveDraft.departure === baseline.departure
        ? storedRate
        : EDIT_DASH;
  const proposedTotal =
    quotedTotal != null
      ? moneyFmt(quotedTotal)
      : liveDraft &&
          baseline &&
          liveDraft.arrival === baseline.arrival &&
          liveDraft.departure === baseline.departure &&
          liveDraft.ratePlanId === baseline.ratePlanId
        ? storedTotal
        : EDIT_DASH;
  const proposedCancellation = quotedCancellation || storedCancellation;

  const changeRows =
    baseline && liveDraft
      ? buildEditChangeRows({
          before: baseline,
          after: liveDraft,
          beforeTotal: storedTotal,
          afterTotal: proposedTotal,
          beforeRate: storedRate,
          afterRate: proposedRate,
          beforePackages: storedPackages,
          afterPackages: storedPackages,
          beforeDeposit: storedDeposit,
          afterDeposit: storedDeposit,
          beforeCancellation: storedCancellation,
          afterCancellation: proposedCancellation,
        })
      : [];

  const persistable = persistableChanges(changeRows);
  const occupancyBlocked = occupancyIsBlocked(
    liveDraft?.adults ?? 0,
    liveDraft?.children ?? 0,
    selectedType?.maxOccupancy ?? null,
  );
  const availabilityNone = Boolean(
    availabilityQuery.isFetched && selectedType && selectedType.available <= 0,
  );
  const stayChanged = Boolean(
    liveDraft &&
    baseline &&
    (liveDraft.arrival !== baseline.arrival ||
      liveDraft.departure !== baseline.departure ||
      liveDraft.roomTypeId !== baseline.roomTypeId),
  );
  const ratePlanChanged = Boolean(
    liveDraft && baseline && liveDraft.ratePlanId !== baseline.ratePlanId,
  );
  const assignmentChanged = Boolean(
    liveDraft && baseline && (liveDraft.roomId ?? null) !== (baseline.roomId ?? null),
  );

  const impactRows = liveDraft
    ? buildEditImpactRows({
        datesValid,
        availability: selectedType?.available ?? null,
        availabilityLoaded: availabilityQuery.isFetched && !availabilityQuery.isError,
        occupancyBlocked,
        maxOccupancy: selectedType?.maxOccupancy ?? null,
        quotedTotal,
        quoteLoaded: quoteQuery.isFetched && !quoteQuery.isError,
        currentTotal: reservation?.roomSubtotal ?? null,
        money: moneyFmt,
        assignmentCleared: Boolean(baseline?.roomId) && liveDraft.roomId == null,
        roomChanged: assignmentChanged,
        ratePlanChanged,
        stayChanged,
      })
    : [];

  const canConfirm = confirmIsEnabled({
    datesValid,
    availabilityNone,
    occupancyBlocked,
    hasPersistableChange: persistable.length > 0,
  });

  const save = useMutation({
    mutationFn: () => {
      if (!liveDraft) throw new Error("Draft is not ready.");
      return submitAmend({
        data: {
          restaurantId,
          reservationId,
          guestId: liveDraft.guestId,
          roomTypeId: liveDraft.roomTypeId,
          roomId: liveDraft.roomId,
          arrival: liveDraft.arrival,
          departure: liveDraft.departure,
          adults: liveDraft.adults,
          children: liveDraft.children,
          specialRequests: liveDraft.specialRequests || null,
          notes: liveDraft.notes || null,
          ratePlanId: liveDraft.ratePlanId,
          commercialBookingSource: liveDraft.commercialBookingSource || null,
          marketSegment: liveDraft.marketSegment || null,
          externalReference: liveDraft.externalReference || null,
          guaranteeMethod: liveDraft.guaranteeMethod || null,
        },
      });
    },
    onSuccess: async () => {
      clearSessionDraft(reservationId);
      await queryClient.invalidateQueries({
        queryKey: ["reservation", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["reservation-commercial", restaurantId, reservationId],
      });
      toast.success("Reservation amended.");
      setStep("confirm");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const persisted = step === "confirm" ? reservation : null;
  const persistedDraft = persisted ? draftFromReservation(persisted) : null;
  const persistedRows =
    baseline && persistedDraft
      ? buildEditChangeRows({
          before: baseline,
          after: persistedDraft,
          beforeTotal: storedTotal,
          afterTotal: persisted.roomSubtotal == null ? EDIT_DASH : moneyFmt(persisted.roomSubtotal),
          beforeRate: storedRate,
          afterRate: ratePerNightLabel(
            persisted.nightlyRates,
            persisted.roomSubtotal,
            persisted.nights,
            moneyFmt,
          ),
          beforePackages: storedPackages,
          afterPackages: packagesLabel(
            commercialQuery.data?.packages.map((row) => row.packageName),
          ),
          beforeDeposit: storedDeposit,
          afterDeposit: depositLabel(persisted.depositRequirementSnapshot, moneyFmt),
          beforeCancellation: storedCancellation,
          afterCancellation: cancellationLabel(persisted.cancellationPolicySnapshot),
        })
      : [];
  const audit = pickLatestAmendHistory(history);
  const nextEvents = buildConfirmNextEvents({
    stayChanged,
    assignmentChanged,
    rateMayChange: stayChanged || ratePlanChanged,
  });

  const guest = guestQuery.data;
  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);
  const guests = guestListItems(guestsQuery.data);
  const coverUrl = selectedType?.coverUrl ?? null;

  if (detailQuery.isError) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-destructive">
        Could not load this reservation.
      </div>
    );
  }
  if (!reservation || !liveDraft || !baseline) {
    return (
      <div className="grid h-full place-items-center p-8 text-sm text-[#7A6B58]">
        Loading reservation…
      </div>
    );
  }

  const currentStepIndex = EDIT_RESERVATION_STEPS.findIndex((row) => row.id === step);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#fbfbfb]"
      data-testid="edit-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#e9dfd0] bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-[#4a2c1a]">
                {step === "confirm"
                  ? "Changes saved"
                  : step === "review"
                    ? `Review changes · ${reservation.confirmationNumber}`
                    : `Edit reservation ${reservation.confirmationNumber}`}
              </h1>
              {step === "confirm" ? null : <ReservationStatusBadge status={reservation.status} />}
            </div>
            <p className="mt-1 text-sm text-[#7A6B58]">
              {reservation.guestName} · {formatStayDate(reservation.arrivalDate)} –{" "}
              {formatStayDate(reservation.departureDate)}
              {step === "review"
                ? ` → ${formatStayDate(liveDraft.arrival)} – ${formatStayDate(liveDraft.departure)}`
                : null}{" "}
              · {reservation.roomTypeName}
            </p>
            {step === "confirm" ? (
              <p className="mt-1 text-xs text-[#7A6B58]">
                Updated {dateTime(reservation.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={OUTLINE_BUTTON}
              onClick={() => onOpenReservation(reservation.id)}
            >
              View reservation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={OUTLINE_BUTTON}
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              Print
            </Button>
          </div>
        </div>

        <ol
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2"
          data-testid="edit-reservation-stepper"
        >
          {EDIT_RESERVATION_STEPS.map((item, index) => {
            const done = index < currentStepIndex || step === "confirm";
            const active = item.id === step;
            return (
              <li key={item.id} className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-xs font-bold",
                      active
                        ? "bg-[#C89933] text-[#251605]"
                        : done
                          ? "bg-[#4a2c1a] text-white"
                          : "bg-[#f1ede6] text-[#7A6B58]",
                    )}
                  >
                    {done && !active ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      active ? "font-bold text-[#4a2c1a]" : "font-medium text-[#7A6B58]",
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {index < EDIT_RESERVATION_STEPS.length - 1 ? (
                  <span aria-hidden="true" className="h-px w-8 bg-[#e9dfd0]" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </header>

      {step === "confirm" ? (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-2xl border border-[#c9a24a] bg-[#f5ead0] px-4 py-3 text-sm text-[#4a2c1a]">
          <Check className="mt-0.5 size-4 shrink-0 text-[#8C6D23]" />
          <div>
            <p className="font-bold">The reservation was updated.</p>
            <p className="text-[#7A6B58]">
              The new details were saved through the existing amendment writer.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "details" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Guest & booker"
                subtitle="Update guest or booking contact information."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Guest name" required>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-[#c9a24a]" />
                      <Input
                        className="pl-8"
                        value={guestSearch || liveDraft.guestName}
                        onChange={(event) => {
                          setGuestSearch(event.target.value);
                          patch({ guestName: event.target.value });
                        }}
                      />
                    </div>
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={OUTLINE_BUTTON}
                      asChild
                    >
                      <Link
                        to="/restaurant/pms/guests/$guestId"
                        params={{ guestId: liveDraft.guestId }}
                      >
                        View profile
                      </Link>
                    </Button>
                  </div>
                  {guestSearch.trim() ? (
                    <div className="rounded-xl border border-[#efe7d8] bg-[#faf7f1] p-2 sm:col-span-2">
                      {guests.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-[#4a2c1a] hover:bg-[#f5ead0]"
                          onClick={() => {
                            patch({ guestId: row.id, guestName: row.fullName });
                            setGuestSearch("");
                          }}
                        >
                          {row.fullName}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Field label="Phone">
                    <ReadValue value={guest?.phone ?? reservation.guestPhone} />
                  </Field>
                  <Field label="Email">
                    <ReadValue value={guest?.email ?? reservation.guestEmail} />
                  </Field>
                  <Field label="ID / Passport no.">
                    <ReadValue value={maskIdNumber(guest?.idDocumentNumber) ?? DETAIL_DASH} />
                  </Field>
                  <Field label="Nationality">
                    <ReadValue value={guest?.nationality} />
                  </Field>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#efe7d8] bg-[#faf7f1] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-[#4a2c1a]">
                      Booking contact (if different)
                    </p>
                    <p className="text-xs text-[#7A6B58]">
                      The booker is not saved by the amendment action.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#4a2c1a]">
                    Same as guest
                    <Switch
                      checked={liveDraft.bookerSameAsGuest}
                      onCheckedChange={(checked) =>
                        patch({
                          bookerSameAsGuest: checked,
                          bookerName: checked ? liveDraft.guestName : liveDraft.bookerName,
                          bookerPhone: checked
                            ? (guest?.phone ?? reservation.guestPhone ?? "")
                            : liveDraft.bookerPhone,
                        })
                      }
                    />
                  </label>
                </div>
                {liveDraft.bookerSameAsGuest ? null : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Contact name">
                      <Input
                        value={liveDraft.bookerName}
                        onChange={(event) => patch({ bookerName: event.target.value })}
                      />
                    </Field>
                    <Field label="Phone">
                      <Input
                        value={liveDraft.bookerPhone}
                        onChange={(event) => patch({ bookerPhone: event.target.value })}
                      />
                    </Field>
                    <Field label="Company">
                      <Input
                        value={liveDraft.bookerCompany}
                        onChange={(event) => patch({ bookerCompany: event.target.value })}
                      />
                    </Field>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Source & classification"
                subtitle="Update source, market segment or reference."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Source">
                    <Select
                      value={liveDraft.commercialBookingSource || NONE}
                      onValueChange={(value) =>
                        patch({ commercialBookingSource: value === NONE ? "" : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={DETAIL_DASH} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{DETAIL_DASH}</SelectItem>
                        {DEFAULT_BOOKING_SOURCES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Market segment">
                    <Select
                      value={liveDraft.marketSegment || NONE}
                      onValueChange={(value) =>
                        patch({ marketSegment: value === NONE ? "" : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={DETAIL_DASH} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{DETAIL_DASH}</SelectItem>
                        {DEFAULT_MARKET_SEGMENTS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Channel">
                    <ReadValue value={channelLabel(reservation.source, liveDraft.salesChannel)} />
                  </Field>
                  <Field label="Company">
                    <ReadValue value={liveDraft.companyName} />
                  </Field>
                  <Field label="Travel agent">
                    <ReadValue value={liveDraft.travelAgentName} />
                  </Field>
                  <Field label="Group">
                    <ReadValue value={liveDraft.groupName} />
                  </Field>
                  <Field label="Purpose of stay">
                    {purposeOptions.length ? (
                      <Select
                        value={liveDraft.purposeOfStay || NONE}
                        onValueChange={(value) =>
                          patch({ purposeOfStay: value === NONE ? "" : value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={DETAIL_DASH} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{DETAIL_DASH}</SelectItem>
                          {purposeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={liveDraft.purposeOfStay}
                        onChange={(event) => patch({ purposeOfStay: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="External reference">
                    <Input
                      value={liveDraft.externalReference}
                      onChange={(event) => patch({ externalReference: event.target.value })}
                    />
                  </Field>
                </div>
                <p className="mt-3 text-xs text-[#7A6B58]">
                  Source, market segment and external reference are saved on confirm. The other
                  fields are display-only for now.
                </p>
              </SectionCard>

              <SectionCard
                title="Room & rate"
                subtitle="Update room type, assigned room or rate plan."
              >
                <div className="flex gap-3">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-24 w-32 rounded-xl object-cover" />
                  ) : (
                    <div className="grid h-24 w-32 place-items-center rounded-xl bg-[#f5ead0] text-[#8C6D23]">
                      <BedDouble className="size-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#4a2c1a]">{liveDraft.roomTypeName}</p>
                    <p className="text-sm text-[#7A6B58]">
                      {liveDraft.roomNumber ? `Room ${liveDraft.roomNumber}` : "Unassigned"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Room type">
                    <Select
                      value={liveDraft.roomTypeId}
                      onValueChange={(value) => {
                        const nextType = (availabilityQuery.data ?? []).find(
                          (row) => row.roomTypeId === value,
                        );
                        patch({
                          roomTypeId: value,
                          roomTypeName: nextType?.name ?? liveDraft.roomTypeName,
                          roomId: null,
                          roomNumber: null,
                          keepRoomUnassigned: true,
                          ratePlanId: null,
                          ratePlanName: null,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          availabilityQuery.data ?? [
                            { roomTypeId: liveDraft.roomTypeId, name: liveDraft.roomTypeName },
                          ]
                        ).map((row) => (
                          <SelectItem key={row.roomTypeId} value={row.roomTypeId}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Assigned room">
                    <Select
                      value={
                        liveDraft.keepRoomUnassigned ? UNASSIGNED : (liveDraft.roomId ?? UNASSIGNED)
                      }
                      onValueChange={(value) =>
                        patch({
                          keepRoomUnassigned: value === UNASSIGNED,
                          roomId: value === UNASSIGNED ? null : value,
                          roomNumber:
                            value === UNASSIGNED
                              ? null
                              : ((roomsQuery.data ?? []).find((row) => row.id === value)
                                  ?.roomNumber ?? null),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {(roomsQuery.data ?? []).map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            Room {row.roomNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Rate plan">
                    <Select
                      value={liveDraft.ratePlanId ?? NONE}
                      onValueChange={(value) => {
                        const plan = (plansQuery.data ?? []).find((row) => row.id === value);
                        patch({
                          ratePlanId: value === NONE ? null : value,
                          ratePlanName: plan?.name ?? null,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={reviewDash(liveDraft.ratePlanName)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{reviewDash(liveDraft.ratePlanName)}</SelectItem>
                        {(plansQuery.data ?? []).map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Rate per night">
                    <ReadValue value={proposedRate} />
                  </Field>
                  <Field label="Nights">
                    <ReadValue value={String(nights)} />
                  </Field>
                  <Field label="Total amount">
                    <ReadValue value={proposedTotal} />
                  </Field>
                  <Field label="Cancellation policy">
                    <ReadValue value={proposedCancellation} />
                  </Field>
                </div>
                <p className="mt-3 text-xs text-[#7A6B58]">
                  Totals come from the server quote. Pricing is not recalculated in the browser.
                </p>
              </SectionCard>

              <SectionCard
                title="Special requests"
                subtitle="Update guest preferences and special requests."
              >
                <Field label="Special requests">
                  <Textarea
                    rows={3}
                    value={liveDraft.specialRequests}
                    onChange={(event) => patch({ specialRequests: event.target.value })}
                  />
                </Field>
                <p className="mt-4 text-xs font-bold text-[#8C6D23]">Room preferences</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {EDIT_PREFERENCE_FLAGS.map((pref) => {
                    const checked = requestPrefChecked(liveDraft.specialRequests, pref.aliases);
                    return (
                      <label key={pref.id} className="flex items-center gap-2 text-sm text-[#4a2c1a]">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            patch({
                              specialRequests: toggleRequestPref(
                                liveDraft.specialRequests,
                                pref.label,
                                Boolean(next),
                              ),
                            })
                          }
                        />
                        {pref.label}
                      </label>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Stay details" subtitle="Update stay dates and occupancy.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Arrival date">
                    <Input
                      type="date"
                      value={liveDraft.arrival}
                      onChange={(event) => {
                        const arrival = event.target.value;
                        patch({ arrival, departure: addDays(arrival, Math.max(nights, 1)) });
                      }}
                    />
                  </Field>
                  <Field label="Departure date">
                    <Input
                      type="date"
                      value={liveDraft.departure}
                      onChange={(event) => patch({ departure: event.target.value })}
                    />
                  </Field>
                  <Field label="Nights">
                    <ReadValue value={String(nights)} />
                  </Field>
                  <Field label="Rooms">
                    <Input
                      type="number"
                      min={1}
                      value={liveDraft.rooms}
                      onChange={(event) => patch({ rooms: Number(event.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Adults">
                    <Input
                      type="number"
                      min={1}
                      value={liveDraft.adults}
                      onChange={(event) => patch({ adults: Number(event.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Children">
                    <Input
                      type="number"
                      min={0}
                      value={liveDraft.children}
                      onChange={(event) => patch({ children: Number(event.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Infants">
                    <Input
                      type="number"
                      min={0}
                      value={liveDraft.infants}
                      onChange={(event) => patch({ infants: Number(event.target.value) || 0 })}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-[#4a2c1a]">
                    <Checkbox
                      checked={liveDraft.flexibleDates}
                      onCheckedChange={(checked) => patch({ flexibleDates: Boolean(checked) })}
                    />
                    Flexible dates (± 3 days)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#4a2c1a]">
                    <Checkbox
                      checked={liveDraft.keepRoomUnassigned}
                      onCheckedChange={(checked) =>
                        patch({
                          keepRoomUnassigned: Boolean(checked),
                          roomId: checked ? null : liveDraft.roomId,
                          roomNumber: checked ? null : liveDraft.roomNumber,
                        })
                      }
                    />
                    Keep room unassigned (assign later)
                  </label>
                </div>
                <p className="mt-2 text-xs text-[#7A6B58]">
                  Rooms, infants and flexible dates stay on this device. Dates, adults, children and
                  room assignment are saved on confirm.
                </p>
              </SectionCard>

              <SectionCard
                title="Notes"
                subtitle="Internal remarks or instructions for this reservation."
              >
                <Field label="Internal notes">
                  <Textarea
                    rows={4}
                    maxLength={500}
                    value={liveDraft.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                    placeholder="Add internal notes about this reservation..."
                  />
                </Field>
                <p className="mt-1 text-right text-[11px] text-[#7A6B58]">
                  {liveDraft.notes.length}/500
                </p>
              </SectionCard>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <SectionCard
                title="Changes summary"
                subtitle="Review the changes below. Nothing is updated until you confirm."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="edit-change-summary">
                    <thead className="border-b border-[#efe7d8] text-left text-xs font-semibold text-[#7A6B58]">
                      <tr>
                        <th className="py-2 pr-3">Item</th>
                        <th className="pr-3">Before</th>
                        <th className="pr-3">After</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeRows.map((row) => (
                        <tr key={row.item} className="border-t border-[#efe7d8]">
                          <td className="py-2 pr-3 font-semibold text-[#4a2c1a]">{row.item}</td>
                          <td className="pr-3 text-[#7A6B58]">{row.before}</td>
                          <td className="pr-3 text-[#4a2c1a]">{row.after}</td>
                          <td>
                            <span
                              className={cn(
                                row.change === EDIT_NO_CHANGE
                                  ? "text-[#7A6B58]"
                                  : row.persistable
                                    ? "rounded-full bg-[#f5ead0] px-2 py-0.5 text-xs font-bold text-[#4a2c1a]"
                                    : "text-xs font-semibold text-[#8C6D23]",
                              )}
                            >
                              {row.change}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
              <SectionCard
                title="Impact"
                subtitle="Checks from the existing availability, quote and assignment readers."
              >
                <ul className="space-y-2" data-testid="edit-impact-analysis">
                  {impactRows
                    .filter((row) => row.id !== "occupancy")
                    .map((row) => (
                      <li key={row.id} className="rounded-xl border border-[#efe7d8] px-3 py-2">
                        <p className="text-sm font-semibold text-[#4a2c1a]">{row.title}</p>
                        <p className="text-xs text-[#7A6B58]">{row.detail}</p>
                      </li>
                    ))}
                </ul>
                {occupancyBlocked ? (
                  <p className="mt-3 text-sm text-destructive">Occupancy exceeds this room type.</p>
                ) : null}
                <div
                  className={cn(
                    "mt-4 rounded-xl px-3 py-2.5 text-sm",
                    canConfirm
                      ? "border border-[#c9a24a] bg-[#f5ead0] font-medium text-[#4a2c1a]"
                      : "bg-[#faf7f1] text-[#7A6B58]",
                  )}
                >
                  {canConfirm
                    ? "All checks passed. You can confirm the changes."
                    : availabilityNone
                      ? "Confirm is blocked until availability exists for the requested dates."
                      : persistable.length === 0
                        ? "No changes to confirm. Fields marked local stay on this device."
                        : "Confirm stays disabled until dates, occupancy and availability pass."}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {step === "confirm" && persisted ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Updated reservation"
                subtitle="Values after the amendment was saved."
              >
                <table className="w-full text-sm" data-testid="edit-confirm-summary">
                  <thead className="border-b border-[#efe7d8] text-left text-xs font-semibold text-[#7A6B58]">
                    <tr>
                      <th className="py-2 pr-3">Item</th>
                      <th className="pr-3">Before</th>
                      <th className="pr-3">After</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistedRows.map((row) => (
                      <tr key={row.item} className="border-t border-[#efe7d8]">
                        <td className="py-2 pr-3 font-semibold text-[#4a2c1a]">{row.item}</td>
                        <td className="pr-3 text-[#7A6B58]">{row.before}</td>
                        <td className="pr-3 text-[#4a2c1a]">{row.after}</td>
                        <td className="text-[#4a2c1a]">{row.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
              <div className="grid gap-4">
                <SectionCard
                  title="Financial summary"
                  subtitle="Saved room and package amounts."
                >
                  <dl className="grid gap-2 text-sm text-[#4a2c1a]">
                    <div className="flex justify-between">
                      <dt className="text-[#7A6B58]">Room revenue</dt>
                      <dd>
                        {persisted.roomSubtotal == null
                          ? EDIT_DASH
                          : moneyFmt(persisted.roomSubtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#7A6B58]">Package amount</dt>
                      <dd>
                        {commercialQuery.data?.packagesSubtotal == null
                          ? EDIT_DASH
                          : moneyFmt(commercialQuery.data.packagesSubtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#7A6B58]">Additional charges</dt>
                      <dd>{EDIT_DASH}</dd>
                    </div>
                    <div className="flex justify-between border-t border-[#efe7d8] pt-2 font-bold">
                      <dt>Total amount</dt>
                      <dd>
                        {commercialQuery.data?.grandCommercialSubtotal == null
                          ? persisted.roomSubtotal == null
                            ? EDIT_DASH
                            : moneyFmt(persisted.roomSubtotal)
                          : moneyFmt(commercialQuery.data.grandCommercialSubtotal)}
                      </dd>
                    </div>
                  </dl>
                </SectionCard>
                <SectionCard
                  title="What happens next"
                  subtitle="Events performed by the existing amendment path."
                >
                  <ul className="space-y-2 text-sm">
                    {nextEvents.map((event) => (
                      <li key={event.id} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-[#C89933]" />
                        <span>
                          <span className="font-semibold text-[#4a2c1a]">{event.title}</span>
                          <span className="block text-xs text-[#7A6B58]">{event.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
                <SectionCard title="Audit" subtitle="From the reservation history.">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-[#7A6B58]">Changed by</dt>
                      <dd className="text-[#4a2c1a]">
                        {reviewDash(audit?.actorName ?? membership.role)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#7A6B58]">Date & time</dt>
                      <dd className="text-[#4a2c1a]">
                        {audit?.createdAt
                          ? dateTime(audit.createdAt)
                          : dateTime(persisted.updatedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#7A6B58]">Change type</dt>
                      <dd className="text-[#4a2c1a]">
                        {audit?.eventType === "amended"
                          ? "Reservation amended"
                          : reviewDash(audit?.eventType)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#7A6B58]">Reference</dt>
                      <dd className="text-[#4a2c1a]">{reservation.confirmationNumber}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-[#7A6B58]">Remarks</dt>
                      <dd className="text-[#4a2c1a]">{reviewDash(audit?.notes)}</dd>
                    </div>
                  </dl>
                </SectionCard>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[#e9dfd0] bg-white p-5 xl:block">
          <h2 className="font-display text-base font-semibold text-[#4a2c1a]">Summary</h2>
          <p className="mb-4 text-xs text-[#7A6B58]">
            {step === "confirm"
              ? "This reservation has been updated."
              : "Updates as you edit the draft."}
          </p>
          <div className="space-y-5 text-sm text-[#4a2c1a]">
            <section>
              <SummaryHeading>Guest</SummaryHeading>
              <div className="flex gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f5ead0] text-xs font-bold text-[#4a2c1a]">
                  {guestInitials(liveDraft.guestName)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{liveDraft.guestName}</p>
                  <p className="text-xs text-[#7A6B58]">{reservation.confirmationNumber}</p>
                  <p className="text-xs">{reviewDash(guest?.phone ?? reservation.guestPhone)}</p>
                  <p className="truncate text-xs">
                    {reviewDash(guest?.email ?? reservation.guestEmail)}
                  </p>
                </div>
              </div>
            </section>
            <section>
              <SummaryHeading>Stay</SummaryHeading>
              <p>
                {formatStayDate(liveDraft.arrival)} → {formatStayDate(liveDraft.departure)} (
                {nights} {nights === 1 ? "night" : "nights"})
              </p>
              <p className="text-xs text-[#7A6B58]">
                {guestCountLabel(liveDraft.adults, liveDraft.children)} · 1 Room
              </p>
            </section>
            <section>
              <SummaryHeading>Room & rate</SummaryHeading>
              {coverUrl ? (
                <img src={coverUrl} alt="" className="mb-2 h-20 w-full rounded-xl object-cover" />
              ) : null}
              <p className="font-semibold">{liveDraft.roomTypeName}</p>
              <p className="text-xs text-[#7A6B58]">{reviewDash(liveDraft.ratePlanName)}</p>
              <p className="text-xs">
                {proposedRate} × {nights} nights
              </p>
            </section>
            <section>
              <SummaryHeading>Details</SummaryHeading>
              <p>Source {sourceLabel(reservation.source, liveDraft.commercialBookingSource)}</p>
              <p>Company {reviewDash(liveDraft.companyName)}</p>
              <p>Travel agent {reviewDash(liveDraft.travelAgentName)}</p>
              <p>Group {reviewDash(liveDraft.groupName)}</p>
              <p>Purpose {reviewDash(liveDraft.purposeOfStay)}</p>
            </section>
            <section>
              <SummaryHeading>Special requests</SummaryHeading>
              <p>{reviewDash(liveDraft.specialRequests)}</p>
            </section>
            <div className="flex items-center justify-between rounded-xl bg-[#f5ead0] px-3 py-2.5">
              <span className="text-sm font-semibold">Estimated total</span>
              <span className="font-display text-base font-bold">
                {step === "confirm" ? storedTotal : proposedTotal}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e9dfd0] bg-white px-5 py-3">
        {step === "details" ? (
          <>
            <Button type="button" variant="ghost" className={GHOST_BUTTON} onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back to reservation
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={OUTLINE_BUTTON}
                onClick={() => {
                  saveSessionDraft(reservationId, liveDraft);
                  toast.message("Draft saved locally", { description: EDIT_DRAFT_LOCAL_COPY });
                }}
              >
                Save draft
              </Button>
              <Button type="button" className={PRIMARY_BUTTON} onClick={() => setStep("review")}>
                Review changes
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </>
        ) : null}
        {step === "review" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className={GHOST_BUTTON}
              onClick={() => setStep("details")}
            >
              <ArrowLeft className="size-3.5" />
              Back to edit
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={OUTLINE_BUTTON}
                onClick={() => {
                  saveSessionDraft(reservationId, liveDraft);
                  toast.message("Draft saved locally", { description: EDIT_DRAFT_LOCAL_COPY });
                }}
              >
                Save draft
              </Button>
              <Button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={!canConfirm || save.isPending}
                onClick={() => save.mutate()}
              >
                Confirm changes
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </>
        ) : null}
        {step === "confirm" ? (
          <>
            <Button type="button" variant="ghost" className={GHOST_BUTTON} onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back to reservation
            </Button>
            <Button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => onOpenReservation(reservation.id)}
            >
              Go to reservation
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
      </footer>
    </div>
  );
}