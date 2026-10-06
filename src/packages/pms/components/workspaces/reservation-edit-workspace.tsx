import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Check,
  FileText,
  Printer,
  Search,
  UserRound,
} from "lucide-react";

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
import { Label } from "@/shared/components/ui/label";
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
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm", className)}>
      <header className="mb-4 flex items-start gap-2">
        <span className="mt-0.5 text-[#1F6FEB]">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ReadValue({ value }: { value: string | null | undefined }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-[#E6DFD4] bg-[#F7F4EE] px-3 text-sm text-[#251605]">
      {reviewDash(value)}
    </div>
  );
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
      <div className="grid h-full place-items-center p-8 text-sm text-muted-foreground">
        Loading reservation…
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="edit-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-[#251605]">
                {step === "confirm"
                  ? "Modification Confirmed"
                  : step === "review"
                    ? `Review Changes — ${reservation.confirmationNumber}`
                    : `Edit Reservation ${reservation.confirmationNumber}`}
              </h1>
              {step === "confirm" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <Check className="size-3" />
                  The reservation has been successfully updated.
                </span>
              ) : (
                <ReservationStatusBadge status={reservation.status} />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {reservation.guestName} · {formatStayDate(reservation.arrivalDate)} –{" "}
              {formatStayDate(reservation.departureDate)}
              {step === "review"
                ? ` → ${formatStayDate(liveDraft.arrival)} – ${formatStayDate(liveDraft.departure)}`
                : null}{" "}
              · {reservation.roomTypeName}
            </p>
            {step === "confirm" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reservation {reservation.confirmationNumber} · Updated{" "}
                {dateTime(reservation.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {step === "details" ? (
              <Button type="button" size="sm" onClick={() => setStep("review")}>
                Review Changes
                <ArrowRight className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" data-testid="edit-reservation-stepper">
          {EDIT_RESERVATION_STEPS.map((item, index) => {
            const current = EDIT_RESERVATION_STEPS.findIndex((row) => row.id === step);
            const done = index < current || step === "confirm";
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
                    done || active ? "text-[#1F6FEB]" : "text-[#251605]",
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

      {step === "confirm" ? (
        <div className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Changes Saved Successfully</p>
          <p>
            The reservation was updated with the new details. Related inventory and pricing used the
            existing amendment writer.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "details" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                icon={<UserRound className="size-4" />}
                title="Guest & Booker Information"
                subtitle="Update guest or booking contact information."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Guest Name" required>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
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
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link
                        to="/restaurant/pms/guests/$guestId"
                        params={{ guestId: liveDraft.guestId }}
                      >
                        View Profile
                      </Link>
                    </Button>
                  </div>
                  {guestSearch.trim() ? (
                    <div className="sm:col-span-2 rounded-md border border-[#E6DFD4] bg-[#F7F4EE] p-2">
                      {guests.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-white"
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
                  <Field label="ID / Passport No.">
                    <ReadValue value={maskIdNumber(guest?.idDocumentNumber) ?? DETAIL_DASH} />
                  </Field>
                  <Field label="Nationality">
                    <ReadValue value={guest?.nationality} />
                  </Field>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-lg border border-[#E6DFD4] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-[#251605]">
                      Booking Contact (if different)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Booker is not written by the amendment action.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
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
                    <Field label="Contact Name">
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
                icon={<FileText className="size-4" />}
                title="Booking Source & Classification"
                subtitle="Update source, company, agent, or group."
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
                  <Field label="Market Segment">
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
                  <Field label="Travel Agent">
                    <ReadValue value={liveDraft.travelAgentName} />
                  </Field>
                  <Field label="Group">
                    <ReadValue value={liveDraft.groupName} />
                  </Field>
                  <Field label="Purpose of Stay">
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
                  <Field label="External Reference">
                    <Input
                      value={liveDraft.externalReference}
                      onChange={(event) => patch({ externalReference: event.target.value })}
                    />
                  </Field>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Source, market segment, and external reference save on confirm. Channel, company,
                  travel agent, group, and purpose of stay are display-only in this phase.
                </p>
              </SectionCard>

              <SectionCard
                icon={<BedDouble className="size-4" />}
                title="Room & Rate Details"
                subtitle="Update room assignment, rate plan, or packages."
              >
                <div className="flex gap-3">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-24 w-32 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-24 w-32 place-items-center rounded-lg bg-[#F4E9D0] text-[#765719]">
                      <BedDouble className="size-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#251605]">{liveDraft.roomTypeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {liveDraft.roomNumber ? `Room ${liveDraft.roomNumber}` : "Unassigned"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                  <Field label="Rate Plan">
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
                  <Field label="Rate per Night">
                    <ReadValue value={proposedRate} />
                  </Field>
                  <Field label="Nights">
                    <ReadValue value={String(nights)} />
                  </Field>
                  <Field label="Total Amount">
                    <ReadValue value={proposedTotal} />
                  </Field>
                  <Field label="Cancellation Policy">
                    <ReadValue value={proposedCancellation} />
                  </Field>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Totals come from the server quote. This screen does not recalculate pricing in the
                  browser.
                </p>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Special Requests & Preferences"
                subtitle="Update guest preferences and special requests."
              >
                <Field label="Special Requests">
                  <Textarea
                    rows={3}
                    value={liveDraft.specialRequests}
                    onChange={(event) => patch({ specialRequests: event.target.value })}
                  />
                </Field>
                <p className="mt-3 text-xs font-medium text-muted-foreground">Room Preferences</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {EDIT_PREFERENCE_FLAGS.map((pref) => {
                    const checked = requestPrefChecked(liveDraft.specialRequests, pref.aliases);
                    return (
                      <label key={pref.id} className="flex items-center gap-2 text-sm">
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

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Stay Details"
                subtitle="Update stay dates and occupancy."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Arrival Date">
                    <Input
                      type="date"
                      value={liveDraft.arrival}
                      onChange={(event) => {
                        const arrival = event.target.value;
                        patch({ arrival, departure: addDays(arrival, Math.max(nights, 1)) });
                      }}
                    />
                  </Field>
                  <Field label="Departure Date">
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
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={liveDraft.flexibleDates}
                      onCheckedChange={(checked) => patch({ flexibleDates: Boolean(checked) })}
                    />
                    Flexible Dates (± 3 days)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
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
                    Keep room unassigned (Assign later)
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Rooms, infants, and flexible dates are local in this phase. Arrival, departure,
                  adults, children, and assignment save on confirm.
                </p>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Additional Information"
                subtitle="Update notes, internal remarks or instructions."
              >
                <Field label="Internal Notes">
                  <Textarea
                    rows={4}
                    maxLength={500}
                    value={liveDraft.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                    placeholder="Add internal notes about this reservation..."
                  />
                </Field>
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {liveDraft.notes.length}/500
                </p>
              </SectionCard>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <SectionCard
                icon={<FileText className="size-4" />}
                title="Changes Summary"
                subtitle="Please review all changes below. The reservation will not be updated until you confirm the changes."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="edit-change-summary">
                    <thead className="text-left text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Item</th>
                        <th>Current (Before)</th>
                        <th>New (After)</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeRows.map((row) => (
                        <tr key={row.item} className="border-t border-[#EEE7DC]">
                          <td className="py-2 font-medium text-[#251605]">{row.item}</td>
                          <td>{row.before}</td>
                          <td>{row.after}</td>
                          <td>
                            <span
                              className={cn(
                                row.change === EDIT_NO_CHANGE
                                  ? "text-muted-foreground"
                                  : row.persistable
                                    ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                    : "text-amber-700",
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
                icon={<FileText className="size-4" />}
                title="Impact Analysis"
                subtitle="Only checks already evaluated by existing availability, quote, and assignment readers."
              >
                <ul className="space-y-3" data-testid="edit-impact-analysis">
                  {impactRows
                    .filter((row) => row.id !== "occupancy")
                    .map((row) => (
                      <li key={row.id} className="rounded-lg border border-[#EEE7DC] px-3 py-2">
                        <p className="text-sm font-medium text-[#251605]">{row.title}</p>
                        <p className="text-xs text-muted-foreground">{row.detail}</p>
                      </li>
                    ))}
                </ul>
                {occupancyBlocked ? (
                  <p className="mt-3 text-sm text-destructive">Occupancy exceeds this room type.</p>
                ) : null}
                <div
                  className={cn(
                    "mt-4 rounded-lg px-3 py-2 text-sm",
                    canConfirm
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-[#F7F4EE] text-muted-foreground",
                  )}
                >
                  {canConfirm
                    ? "All current validation checks passed. You can confirm the persistable changes."
                    : availabilityNone
                      ? "Confirm is blocked until availability exists for the requested dates."
                      : persistable.length === 0
                        ? "No persistable changes to confirm. Local-only fields stay on this device."
                        : "Confirm stays disabled until stay dates, occupancy, and availability pass existing checks."}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {step === "confirm" && persisted ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                icon={<FileText className="size-4" />}
                title="Updated Reservation Details"
                subtitle="Values after the amendment writer returned."
              >
                <table className="w-full text-sm" data-testid="edit-confirm-summary">
                  <thead className="text-left text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Item</th>
                      <th>Previous (Before)</th>
                      <th>Updated (After)</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistedRows.map((row) => (
                      <tr key={row.item} className="border-t border-[#EEE7DC]">
                        <td className="py-2 font-medium">{row.item}</td>
                        <td>{row.before}</td>
                        <td>{row.after}</td>
                        <td>{row.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
              <div className="grid gap-4">
                <SectionCard
                  icon={<FileText className="size-4" />}
                  title="Updated Financial Summary"
                  subtitle="Persisted room and stored package amounts."
                >
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <dt>Room Revenue</dt>
                      <dd>
                        {persisted.roomSubtotal == null
                          ? EDIT_DASH
                          : moneyFmt(persisted.roomSubtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Package Amount</dt>
                      <dd>
                        {commercialQuery.data?.packagesSubtotal == null
                          ? EDIT_DASH
                          : moneyFmt(commercialQuery.data.packagesSubtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Additional Charges</dt>
                      <dd>{EDIT_DASH}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>Total Amount</dt>
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
                  icon={<FileText className="size-4" />}
                  title="What Happens Next"
                  subtitle="Only events performed by the existing amendment path."
                >
                  <ul className="space-y-2 text-sm">
                    {nextEvents.map((event) => (
                      <li key={event.id} className="flex gap-2">
                        <Check className="mt-0.5 size-4 text-emerald-600" />
                        <span>
                          <span className="font-medium">{event.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {event.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
                <SectionCard
                  icon={<FileText className="size-4" />}
                  title="Audit Information"
                  subtitle="From reservation history after confirm."
                >
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Changed By</dt>
                      <dd>{reviewDash(audit?.actorName ?? membership.role)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Date & Time</dt>
                      <dd>
                        {audit?.createdAt
                          ? dateTime(audit.createdAt)
                          : dateTime(persisted.updatedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Change Type</dt>
                      <dd>
                        {audit?.eventType === "amended"
                          ? "Reservation Amended"
                          : reviewDash(audit?.eventType)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Reference</dt>
                      <dd>{reservation.confirmationNumber}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Remarks</dt>
                      <dd>{reviewDash(audit?.notes)}</dd>
                    </div>
                  </dl>
                </SectionCard>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[#DDD4C5] bg-white p-4 xl:block">
          <h2 className="text-sm font-semibold text-[#251605]">Reservation Summary</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {step === "confirm"
              ? "This reservation has been updated."
              : "Summary will reflect the current draft in real time."}
          </p>
          <div className="space-y-4 text-sm">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Guest Information
                </p>
              </div>
              <div className="flex gap-2">
                <span className="grid size-10 place-items-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
                  {guestInitials(liveDraft.guestName)}
                </span>
                <div>
                  <p className="font-medium">{liveDraft.guestName}</p>
                  <p className="text-xs text-muted-foreground">{reservation.confirmationNumber}</p>
                  <p className="text-xs">{reviewDash(guest?.phone ?? reservation.guestPhone)}</p>
                  <p className="text-xs">{reviewDash(guest?.email ?? reservation.guestEmail)}</p>
                </div>
              </div>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Stay Information
              </p>
              <p>
                {formatStayDate(liveDraft.arrival)} → {formatStayDate(liveDraft.departure)} (
                {nights} {nights === 1 ? "night" : "nights"})
              </p>
              <p className="text-xs text-muted-foreground">
                {guestCountLabel(liveDraft.adults, liveDraft.children)} · 1 Room
              </p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Room & Rate Information
              </p>
              {coverUrl ? (
                <img src={coverUrl} alt="" className="mb-2 h-20 w-full rounded-lg object-cover" />
              ) : null}
              <p className="font-medium">{liveDraft.roomTypeName}</p>
              <p className="text-xs text-muted-foreground">{reviewDash(liveDraft.ratePlanName)}</p>
              <p className="text-xs">
                {proposedRate} × {nights} nights
              </p>
              <p className="font-semibold">{proposedTotal}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Additional Information
              </p>
              <p>Source {sourceLabel(reservation.source, liveDraft.commercialBookingSource)}</p>
              <p>Company {reviewDash(liveDraft.companyName)}</p>
              <p>Travel Agent {reviewDash(liveDraft.travelAgentName)}</p>
              <p>Group {reviewDash(liveDraft.groupName)}</p>
              <p>Purpose of Stay {reviewDash(liveDraft.purposeOfStay)}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Special Requests
              </p>
              <p>{reviewDash(liveDraft.specialRequests)}</p>
            </section>
            <p className="border-t border-[#EEE7DC] pt-3 text-sm font-semibold">
              Estimated Total {step === "confirm" ? storedTotal : proposedTotal}
            </p>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white px-5 py-3">
        {step === "details" ? (
          <>
            <Button type="button" variant="ghost" onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back to Reservation
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  saveSessionDraft(reservationId, liveDraft);
                  toast.message("Draft saved locally", { description: EDIT_DRAFT_LOCAL_COPY });
                }}
              >
                Save Draft
              </Button>
              <Button type="button" onClick={() => setStep("review")}>
                Review Changes
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </>
        ) : null}
        {step === "review" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              <ArrowLeft className="size-3.5" />
              Back to Edit Details
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  saveSessionDraft(reservationId, liveDraft);
                  toast.message("Draft saved locally", { description: EDIT_DRAFT_LOCAL_COPY });
                }}
              >
                Save Draft
              </Button>
              <Button
                type="button"
                disabled={!canConfirm || save.isPending}
                onClick={() => save.mutate()}
              >
                Confirm Changes
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </>
        ) : null}
        {step === "confirm" ? (
          <>
            <Button type="button" variant="ghost" onClick={onBackToDesk}>
              <ArrowLeft className="size-3.5" />
              Back to Reservation
            </Button>
            <Button type="button" onClick={() => onOpenReservation(reservation.id)}>
              Go to Reservation
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
      </footer>
    </div>
  );
}
