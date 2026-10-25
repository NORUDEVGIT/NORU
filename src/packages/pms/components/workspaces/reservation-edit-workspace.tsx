import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { ReservationAmendmentPrint } from "@/packages/pms/components/bookings/reservation-amendment-print";
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
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  channelLabel,
  DETAIL_DASH,
  sourceLabel,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  affectedRoomLabel,
  assignmentEditLocked,
  buildConfirmNextEvents,
  buildEditChangeRows,
  buildEditImpactRows,
  cancellationLabel,
  confirmIsEnabled,
  datesEditLocked,
  draftFromReservation,
  EDIT_DASH,
  EDIT_RESERVATION_STEPS,
  editDraftDirty,
  folioReconciliationNotice,
  guestCountLabel,
  occupancyIsBlocked,
  persistableChanges,
  pickLatestAmendHistory,
  rateEditLocked,
  ratePerNightLabel,
  roomTotalImpact,
  roomTypeEditLocked,
  stayDatesLabel,
  stayEditLocked,
  type EditReservationStepId,
  type ReservationEditDraft,
  type ReservationEditUnitSlice,
} from "@/packages/pms/lib/reservation-edit-workspace";
import type { AmendmentPrintData } from "@/packages/pms/lib/reservation-amendment-print";
import { listRatePlans, quoteStay } from "@/packages/pms/lib/rates.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";
import { getFolio, getReservationFolio } from "@/packages/pms/lib/cashiering.functions";
import {
  amendReservation,
  getBookingsAccess,
  getReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
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

const UNASSIGNED = "unassigned";
const NONE = "__none__";
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function optionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[],
): string | null {
  const text = value?.trim();
  if (!text) return null;
  return options.find((option) => option.value === text)?.label ?? text;
}

function Field({
  label,
  required,
  changed,
  children,
}: {
  label: string;
  required?: boolean;
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm" data-edited={changed ? "true" : undefined}>
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
        {changed ? (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-[#8A6A1F]">
            <span className="size-1.5 rounded-full bg-[#C4A35A]" />
            Edited
          </span>
        ) : null}
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

function PlainValue({ value }: { value: string | null | undefined }) {
  return <p className="text-sm text-[#251605]">{reviewDash(value)}</p>;
}

function unitSlice(
  room: ReservationRoomUnit,
  reservation: {
    roomTypeId: string;
    roomTypeName: string;
    roomId: string | null;
    roomNumber: string | null;
    ratePlanId: string | null;
    ratePlanName: string | null;
  },
): ReservationEditUnitSlice {
  return {
    id: room.id,
    unitSequence: room.unitSequence,
    roomTypeId: room.roomTypeId,
    roomId: room.roomId,
    arrivalDate: room.arrivalDate,
    departureDate: room.departureDate,
    adults: room.adults,
    children: room.children,
    ratePlanId: room.ratePlanId,
    status: room.status,
    roomTypeName:
      room.roomTypeName ??
      (room.roomTypeId === reservation.roomTypeId ? reservation.roomTypeName : null),
    roomNumber:
      room.roomNumber ??
      (room.roomId != null && room.roomId === reservation.roomId ? reservation.roomNumber : null),
    ratePlanName:
      room.ratePlanName ??
      (room.ratePlanId != null && room.ratePlanId === reservation.ratePlanId
        ? reservation.ratePlanName
        : null),
  };
}

export function ReservationEditWorkspace({
  membership,
  reservationId,
  onBackToDesk: _onBackToDesk,
  onOpenReservation: _onOpenReservation,
  onRegisterCloseGuard,
}: {
  membership: RestaurantMembership;
  reservationId: string;
  onBackToDesk: () => void;
  onOpenReservation: (reservationId: string) => void;
  /** Shared overlay X asks this before discarding an unsaved draft. */
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
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
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);
  const submitAmend = useServerFn(amendReservation);

  const [step, setStep] = useState<EditReservationStepId>("details");
  const [draft, setDraft] = useState<ReservationEditDraft | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [baseline, setBaseline] = useState<ReservationEditDraft | null>(null);
  const [openingRoomTotal, setOpeningRoomTotal] = useState<number | null>(null);
  const [folioWasReconciled, setFolioWasReconciled] = useState(false);
  const folioReconcileRef = useRef(false);

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
    setGuestSearch("");
    setOpeningRoomTotal(null);
    setFolioWasReconciled(false);
    setStep("details");
  }, [reservationId]);

  useEffect(() => {
    if (!reservation || reservation.id !== reservationId) return;
    const next = draftFromReservation(reservation);
    setBaseline((current) => current ?? next);
    setDraft((current) => current ?? next);
    setOpeningRoomTotal((current) => current ?? reservation.roomSubtotal ?? null);
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
    enabled: canManage && step === "details" && guestSearch.trim().length > 0,
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

  const previewFolioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, reservationId],
    queryFn: () => fetchReservationFolio({ data: { restaurantId, reservationId } }),
    enabled: canManage,
    retry: false,
  });
  const folioQuery = useQuery({
    queryKey: ["folio", restaurantId, previewFolioQuery.data?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: previewFolioQuery.data!.id } }),
    enabled: Boolean(previewFolioQuery.data?.id),
    retry: false,
  });

  const selectedType = (availabilityQuery.data ?? []).find(
    (row) => row.roomTypeId === draft?.roomTypeId,
  );
  const quoted =
    quoteQuery.data?.find((row) => !draft?.ratePlanId || row.plan.id === draft.ratePlanId) ??
    quoteQuery.data?.[0];
  const quotedTotal = quoted?.quote?.subtotal ?? null;
  const quotedNightly = quoted?.quote?.nightly?.[0]?.rate ?? null;
  const quotedCancellation = quoted?.cancellationLabel ?? null;

  function patch(partial: Partial<ReservationEditDraft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  const liveDraft = draft;

  const moneyFmt = (value: number) => money(value, reservation?.currency);
  const signedDelta = (delta: number) => {
    if (delta === 0) return "No change";
    const text = moneyFmt(Math.abs(delta));
    return delta > 0 ? `+${text}` : `-${text}`;
  };
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
          liveDraft.ratePlanId === baseline.ratePlanId &&
          liveDraft.roomTypeId === baseline.roomTypeId
        ? storedTotal
        : EDIT_DASH;
  const proposedCancellation = quotedCancellation || storedCancellation;

  const changeRows =
    baseline && liveDraft ? buildEditChangeRows({ before: baseline, after: liveDraft }) : [];
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

  const occupancyChanged = Boolean(
    liveDraft &&
    baseline &&
    (liveDraft.adults !== baseline.adults || liveDraft.children !== baseline.children),
  );
  const priceChanging = stayChanged || ratePlanChanged || occupancyChanged;
  const comparableRoomTotal =
    liveDraft && liveDraft.unitCount > 1
      ? (reservation?.rooms?.find((room) => room.id === liveDraft.reservationRoomId)
          ?.roomSubtotal ?? null)
      : (reservation?.roomSubtotal ?? null);
  const financialImpact =
    liveDraft && priceChanging
      ? roomTotalImpact({
          label: liveDraft.unitCount > 1 ? "Selected room total" : "Reservation Room Total",
          priceChanging,
          previousTotal: comparableRoomTotal,
          quotedTotal,
        })
      : null;
  const folio = folioQuery.data ?? null;
  const hasUnitRoomCharge = Boolean(
    folio?.transactions.some(
      (row) =>
        row.type === "charge" &&
        row.referenceType === "reservation_room_charge" &&
        (liveDraft?.reservationRoomId
          ? row.referenceId === liveDraft.reservationRoomId
          : liveDraft?.unitCount === 1),
    ),
  );
  const folioNotice = folioReconciliationNotice({
    commercialChange: priceChanging,
    folioStatus: folio?.status ?? null,
    invoiced: Boolean(folio?.issuedInvoice) || (folio?.issuedInvoices.length ?? 0) > 0,
    hasRoomCharge: hasUnitRoomCharge,
  });
  folioReconcileRef.current =
    folioNotice?.tone === "info" && financialImpact?.delta != null && financialImpact.delta !== 0;

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
        occupancyChanged,
        updatedCancellation: quotedCancellation,
      })
    : [];

  const folioBlocked = folioNotice?.tone === "warn";
  const canConfirm =
    confirmIsEnabled({
      datesValid,
      availabilityNone,
      occupancyBlocked,
      hasPersistableChange: persistable.length > 0,
    }) && !folioBlocked;

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
          reservationRoomId: liveDraft.reservationRoomId,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["reservation", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["reservation-commercial", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["reservation-folio", restaurantId, reservationId],
      });
      await queryClient.invalidateQueries({ queryKey: ["folio", restaurantId] });
      toast.success("Reservation amended.");
      setFolioWasReconciled(folioReconcileRef.current);
      setStep("confirm");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const persisted = step === "confirm" ? reservation : null;
  const persistedUnit = persisted?.rooms?.find((room) => room.id === liveDraft?.reservationRoomId);
  const persistedDraft = persisted
    ? draftFromReservation(persisted, persistedUnit ? unitSlice(persistedUnit, persisted) : null)
    : null;
  const persistedRows =
    baseline && persistedDraft
      ? persistableChanges(buildEditChangeRows({ before: baseline, after: persistedDraft }))
      : [];
  const audit = pickLatestAmendHistory(history);
  const propertyContact = [
    membership.restaurant.address,
    membership.restaurant.city,
    membership.restaurant.phone,
    membership.restaurant.email,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const updatedPolicy =
    persisted && persistedRows.some((row) => row.item === "Rate Plan")
      ? cancellationLabel(persisted.cancellationPolicySnapshot)
      : null;
  const packageNames = (commercialQuery.data?.packages ?? [])
    .map((row) => row.packageName.trim())
    .filter(Boolean);
  const amendmentPrint: AmendmentPrintData | null =
    persisted && persistedDraft
      ? {
          propertyName: membership.restaurant.name,
          propertyContact: propertyContact || null,
          confirmationNumber: persisted.confirmationNumber,
          amendedAt: dateTime(audit?.createdAt ?? persisted.updatedAt),
          amendedBy: audit?.actorName ?? null,
          statusLabel: STATUS_LABELS[persisted.status] ?? persisted.status,
          reference: audit?.id ?? null,
          changes: persistedRows
            .filter((row) => row.item !== "Reservation Internal Notes")
            .map((row) => ({ item: row.item, before: row.before, after: row.after })),
          guestName: persisted.guestName,
          arrival: formatStayDate(persisted.arrivalDate),
          departure: formatStayDate(persisted.departureDate),
          nights: String(persisted.nights),
          adults: String(persisted.adults),
          children: String(persisted.children),
          roomType: persistedDraft.roomTypeName || persisted.roomTypeName,
          assignedRoom: persistedDraft.roomNumber
            ? `Room ${persistedDraft.roomNumber}`
            : "Unassigned",
          ratePlan: persistedDraft.ratePlanName,
          ratePerNight: ratePerNightLabel(
            persisted.nightlyRates,
            persisted.roomSubtotal,
            persisted.nights,
            moneyFmt,
          ),
          roomTotal: persisted.roomSubtotal == null ? null : moneyFmt(persisted.roomSubtotal),
          source: optionLabel(persisted.commercialBookingSource, DEFAULT_BOOKING_SOURCES),
          marketSegment: optionLabel(persisted.marketSegment, DEFAULT_MARKET_SEGMENTS),
          externalReference: persisted.externalReference?.trim() || null,
          specialRequests: persisted.specialRequests?.trim() || null,
          previousRoomTotal:
            openingRoomTotal == null ||
            persisted.roomSubtotal == null ||
            openingRoomTotal === persisted.roomSubtotal
              ? null
              : moneyFmt(openingRoomTotal),
          updatedRoomTotal:
            openingRoomTotal == null ||
            persisted.roomSubtotal == null ||
            openingRoomTotal === persisted.roomSubtotal
              ? null
              : moneyFmt(persisted.roomSubtotal),
          roomTotalDifference:
            openingRoomTotal == null ||
            persisted.roomSubtotal == null ||
            openingRoomTotal === persisted.roomSubtotal
              ? null
              : signedDelta(persisted.roomSubtotal - openingRoomTotal),
          packagesSummary: packageNames.length ? packageNames.join(", ") : null,
          packageAmount:
            packageNames.length === 0 || commercialQuery.data?.packagesSubtotal == null
              ? null
              : moneyFmt(commercialQuery.data.packagesSubtotal),
          policy: updatedPolicy && updatedPolicy !== EDIT_DASH ? updatedPolicy : null,
          generatedAt: dateTime(new Date().toISOString()),
        }
      : null;
  const nextEvents = buildConfirmNextEvents({
    inventoryChanged: stayChanged || assignmentChanged,
    rateMayChange: priceChanging,
    folioReconciled: folioWasReconciled,
  });

  const guest = guestQuery.data;
  const guests = guestListItems(guestsQuery.data);
  const coverUrl = selectedType?.coverUrl ?? null;
  const datesLocked = liveDraft ? datesEditLocked(liveDraft) : true;
  const occupancyLocked = liveDraft ? stayEditLocked(liveDraft) : true;
  const roomTypeLocked = liveDraft ? roomTypeEditLocked(liveDraft) : true;
  const assignmentLocked = liveDraft ? assignmentEditLocked(liveDraft) : true;
  const rateLocked = liveDraft ? rateEditLocked(liveDraft) : true;

  const unsavedDraft = Boolean(
    step !== "confirm" && draft && baseline && editDraftDirty(baseline, draft),
  );
  useEffect(() => {
    onRegisterCloseGuard?.(
      unsavedDraft ? () => window.confirm("Close without saving these changes?") : null,
    );
    return () => onRegisterCloseGuard?.(null);
  }, [unsavedDraft, onRegisterCloseGuard]);

  function selectUnit(unitId: string) {
    if (!reservation || !draft || !baseline || unitId === NONE) return;
    const room = reservation.rooms?.find((row) => row.id === unitId);
    if (!room) return;
    const roomDirty =
      draft.arrival !== baseline.arrival ||
      draft.departure !== baseline.departure ||
      draft.adults !== baseline.adults ||
      draft.children !== baseline.children ||
      draft.roomTypeId !== baseline.roomTypeId ||
      (draft.roomId ?? null) !== (baseline.roomId ?? null) ||
      (draft.ratePlanId ?? null) !== (baseline.ratePlanId ?? null);
    if (roomDirty && !window.confirm("Discard unsaved room changes for the current room?")) {
      return;
    }
    const stored = draftFromReservation(reservation, unitSlice(room, reservation));
    const keep = {
      guestId: draft.guestId,
      guestName: draft.guestName,
      specialRequests: draft.specialRequests,
      notes: draft.notes,
      commercialBookingSource: draft.commercialBookingSource,
      marketSegment: draft.marketSegment,
      externalReference: draft.externalReference,
      guaranteeMethod: draft.guaranteeMethod,
    };
    const keepBaseline = {
      guestId: baseline.guestId,
      guestName: baseline.guestName,
      specialRequests: baseline.specialRequests,
      notes: baseline.notes,
      commercialBookingSource: baseline.commercialBookingSource,
      marketSegment: baseline.marketSegment,
      externalReference: baseline.externalReference,
      guaranteeMethod: baseline.guaranteeMethod,
    };
    setDraft({ ...stored, ...keep });
    setBaseline({ ...stored, ...keepBaseline });
  }

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

  const changed = (field: keyof ReservationEditDraft) => baseline[field] !== liveDraft[field];
  const roomOptions = roomsQuery.data ?? [];
  const planOptions = plansQuery.data ?? [];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="edit-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#DDD4C5] bg-white py-3 pl-5 pr-14">
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
              {step === "confirm" ? null : <ReservationStatusBadge status={reservation.status} />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Current reservation · {formatStayDate(reservation.arrivalDate)} →{" "}
              {formatStayDate(reservation.departureDate)} · {reservation.roomTypeName}
            </p>
            {step === "confirm" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Reservation {reservation.confirmationNumber} · Updated{" "}
                {dateTime(reservation.updatedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step === "confirm" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-3.5" />
                Print Amendment
              </Button>
            ) : null}
          </div>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" data-testid="edit-reservation-stepper">
          {EDIT_RESERVATION_STEPS.map((item, index) => {
            const current = EDIT_RESERVATION_STEPS.findIndex((row) => row.id === step);
            const done = step === "confirm" || index < current;
            const active = step !== "confirm" && item.id === step;
            const label = step === "confirm" && item.id === "confirm" ? "Confirmed" : item.label;
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
                  {done ? <Check className="mr-1 inline size-3.5" /> : `${index + 1}. `}
                  {label}
                </p>
                {step === "confirm" ? null : (
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                )}
              </li>
            );
          })}
        </ol>
      </header>

      {step === "confirm" ? (
        <div className="mx-5 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Changes Saved Successfully</p>
          <p>Reservation {reservation.confirmationNumber} was updated successfully.</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "details" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                icon={<UserRound className="size-4" />}
                title="Guest"
                subtitle="Choose an existing guest. Phone and email are shown for reference."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Linked guest" required changed={changed("guestId")}>
                    <p className="text-sm font-medium text-[#251605]">{liveDraft.guestName}</p>
                  </Field>
                  <Field label="Guest search">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Search existing guest"
                        value={guestSearch}
                        onChange={(event) => setGuestSearch(event.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Phone">
                    <PlainValue value={guest?.phone ?? reservation.guestPhone} />
                  </Field>
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
                  <Field label="Email">
                    <PlainValue value={guest?.email ?? reservation.guestEmail} />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Booking Source & Classification"
                subtitle="Source, market segment, and external reference."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Source" changed={changed("commercialBookingSource")}>
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
                  <Field label="Market Segment" changed={changed("marketSegment")}>
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
                    <PlainValue
                      value={channelLabel(reservation.source, reservation.salesChannel)}
                    />
                  </Field>
                  <Field label="Company">
                    <PlainValue value={reservation.companyName} />
                  </Field>
                  <Field label="Travel Agent">
                    <PlainValue value={reservation.travelAgentName} />
                  </Field>
                  <Field label="Group">
                    <PlainValue value={reservation.groupName} />
                  </Field>
                  <Field label="External Reference" changed={changed("externalReference")}>
                    <Input
                      value={liveDraft.externalReference}
                      onChange={(event) => patch({ externalReference: event.target.value })}
                    />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<BedDouble className="size-4" />}
                title="Room & Rate"
                subtitle={
                  liveDraft.unitCount > 1 && !liveDraft.reservationRoomId
                    ? "Choose the room this change applies to."
                    : "Update the room, assignment, and rate plan."
                }
              >
                {liveDraft.unitCount > 1 ? (
                  <Field label="Selected room">
                    <Select value={liveDraft.reservationRoomId ?? NONE} onValueChange={selectUnit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a room" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Choose a room</SelectItem>
                        {(reservation.rooms ?? []).map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            Room {room.unitSequence}
                            {room.roomNumber ? ` · ${room.roomNumber}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <div className="mt-3 flex gap-3">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-24 w-32 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-24 w-32 place-items-center rounded-lg bg-[#F4E9D0] text-[#765719]">
                      <BedDouble className="size-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#251605]">
                      {liveDraft.roomTypeName || "Room"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {liveDraft.roomNumber ? `Room ${liveDraft.roomNumber}` : "Unassigned"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Room type" changed={changed("roomTypeId")}>
                    <Select
                      value={liveDraft.roomTypeId}
                      disabled={roomTypeLocked}
                      onValueChange={(value) => {
                        const nextType = (availabilityQuery.data ?? []).find(
                          (row) => row.roomTypeId === value,
                        );
                        patch({
                          roomTypeId: value,
                          roomTypeName: nextType?.name ?? liveDraft.roomTypeName,
                          roomId: null,
                          roomNumber: null,
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
                  <Field label="Assigned room" changed={changed("roomId")}>
                    <Select
                      value={liveDraft.roomId ?? UNASSIGNED}
                      disabled={assignmentLocked}
                      onValueChange={(value) =>
                        patch({
                          roomId: value === UNASSIGNED ? null : value,
                          roomNumber:
                            value === UNASSIGNED
                              ? null
                              : (roomOptions.find((row) => row.id === value)?.roomNumber ??
                                liveDraft.roomNumber),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {liveDraft.roomId &&
                        !roomOptions.some((row) => row.id === liveDraft.roomId) ? (
                          <SelectItem value={liveDraft.roomId}>
                            Room {liveDraft.roomNumber ?? "current"}
                          </SelectItem>
                        ) : null}
                        {roomOptions.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            Room {row.roomNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Rate Plan" changed={changed("ratePlanId")}>
                    <Select
                      value={liveDraft.ratePlanId ?? NONE}
                      disabled={rateLocked}
                      onValueChange={(value) => {
                        if (value === NONE) return;
                        const plan = planOptions.find((row) => row.id === value);
                        patch({
                          ratePlanId: value,
                          ratePlanName: plan?.name ?? liveDraft.ratePlanName,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={reviewDash(liveDraft.ratePlanName)} />
                      </SelectTrigger>
                      <SelectContent>
                        {liveDraft.ratePlanId ? null : (
                          <SelectItem value={NONE}>{reviewDash(liveDraft.ratePlanName)}</SelectItem>
                        )}
                        {liveDraft.ratePlanId &&
                        !planOptions.some((plan) => plan.id === liveDraft.ratePlanId) ? (
                          <SelectItem value={liveDraft.ratePlanId}>
                            {liveDraft.ratePlanName ?? "Current rate plan"}
                          </SelectItem>
                        ) : null}
                        {planOptions.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Rate per Night">
                    <PlainValue value={proposedRate} />
                  </Field>
                  <Field label="Nights">
                    <PlainValue value={String(nights)} />
                  </Field>
                  <Field label="Reservation Room Total">
                    <PlainValue value={proposedTotal} />
                  </Field>
                  <Field label="Cancellation Policy">
                    <PlainValue value={proposedCancellation} />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Special Requests"
                subtitle="Saved on the reservation."
              >
                <Field label="Special Requests" changed={changed("specialRequests")}>
                  <Textarea
                    rows={3}
                    value={liveDraft.specialRequests}
                    onChange={(event) => patch({ specialRequests: event.target.value })}
                  />
                </Field>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Stay Details"
                subtitle={
                  liveDraft.unitCount > 1
                    ? "Dates and occupancy stay as booked when this reservation has more than one room."
                    : datesLocked
                      ? "Arrival and departure stay as booked for this reservation."
                      : "Update stay dates and occupancy."
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Arrival Date" changed={changed("arrival")}>
                    <Input
                      type="date"
                      disabled={datesLocked}
                      value={liveDraft.arrival}
                      onChange={(event) => {
                        const arrival = event.target.value;
                        patch({ arrival, departure: addDays(arrival, Math.max(nights, 1)) });
                      }}
                    />
                  </Field>
                  <Field label="Departure Date" changed={changed("departure")}>
                    <Input
                      type="date"
                      disabled={datesLocked}
                      value={liveDraft.departure}
                      onChange={(event) => patch({ departure: event.target.value })}
                    />
                  </Field>
                  <Field label="Nights">
                    <PlainValue value={String(nights)} />
                  </Field>
                  <Field label="Adults" changed={changed("adults")}>
                    <Input
                      type="number"
                      min={1}
                      disabled={occupancyLocked}
                      value={liveDraft.adults}
                      onChange={(event) => patch({ adults: Number(event.target.value) || 1 })}
                    />
                  </Field>
                  <Field label="Children" changed={changed("children")}>
                    <Input
                      type="number"
                      min={0}
                      disabled={occupancyLocked}
                      value={liveDraft.children}
                      onChange={(event) => patch({ children: Number(event.target.value) || 0 })}
                    />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Additional Information"
                subtitle="Visible to authorised hotel staff. Not shown to the guest."
              >
                <Field label="Reservation Internal Notes" changed={changed("notes")}>
                  <Textarea
                    rows={4}
                    maxLength={500}
                    value={liveDraft.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                    placeholder="Add notes for hotel staff..."
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
                subtitle="These are the fields that will be saved."
              >
                {affectedRoomLabel(liveDraft) &&
                (liveDraft.unitCount > 1 ||
                  persistable.some((row) =>
                    [
                      "Stay Dates",
                      "Room Assignment",
                      "Room Type",
                      "Rate Plan",
                      "Guest Count",
                    ].includes(row.item),
                  )) ? (
                  <p className="mb-3 text-sm text-[#251605]">
                    <span className="text-muted-foreground">Affected room </span>
                    {affectedRoomLabel(liveDraft)}
                  </p>
                ) : null}
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
                      {persistable.map((row) => (
                        <tr key={row.item} className="border-t border-[#EEE7DC]">
                          <td className="py-2 font-medium text-[#251605]">{row.item}</td>
                          <td>{row.before}</td>
                          <td>{row.after}</td>
                          <td>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                              {row.change}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {persistable.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No changes to confirm.</p>
                  ) : null}
                </div>
              </SectionCard>
              <SectionCard
                icon={<FileText className="size-4" />}
                title="Impact Analysis"
                subtitle="What this amendment will affect."
              >
                {financialImpact ? (
                  <div
                    className="mb-4 rounded-lg border border-[#EEE7DC] px-3 py-2 text-sm"
                    data-testid="edit-financial-impact"
                  >
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {financialImpact.label}
                    </p>
                    {financialImpact.previous != null ? (
                      <p className="mt-2 flex justify-between">
                        <span>Previous</span>
                        <span>{moneyFmt(financialImpact.previous)}</span>
                      </p>
                    ) : null}
                    {financialImpact.next != null ? (
                      <p className="mt-1 flex justify-between">
                        <span>New</span>
                        <span>{moneyFmt(financialImpact.next)}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-muted-foreground">
                        The updated room total is not available yet.
                      </p>
                    )}
                    {financialImpact.delta != null ? (
                      <p className="mt-1 flex justify-between font-medium">
                        <span>Difference</span>
                        <span>{signedDelta(financialImpact.delta)}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {folioNotice ? (
                  <div
                    className={cn(
                      "mb-4 rounded-lg px-3 py-2 text-sm",
                      folioNotice.tone === "warn"
                        ? "bg-amber-50 text-amber-900"
                        : "bg-[#F7F4EE] text-[#251605]",
                    )}
                    data-testid="edit-folio-impact"
                  >
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Folio impact
                    </p>
                    <p className="mt-1">{folioNotice.detail}</p>
                    {folioNotice.folioState ? (
                      <p className="mt-1 text-xs">Current folio state {folioNotice.folioState}</p>
                    ) : null}
                  </div>
                ) : null}
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
                    ? "All validation checks passed. You can confirm these changes."
                    : [
                        !datesValid ? "Departure must be after arrival." : null,
                        availabilityNone ? "No availability for the requested dates." : null,
                        occupancyBlocked ? "Occupancy exceeds this room type." : null,
                        folioNotice?.tone === "warn" ? folioNotice.detail : null,
                        persistable.length === 0 ? "No changes to confirm." : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                </div>
              </SectionCard>
            </div>
          ) : null}

          {step === "confirm" && persisted ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                icon={<FileText className="size-4" />}
                title="Updated Reservation Details"
                subtitle="Values after confirm."
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
                  subtitle="Room total and stored package amount, kept separate."
                >
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <dt>Reservation Room Total</dt>
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
                    {openingRoomTotal != null &&
                    persisted.roomSubtotal != null &&
                    openingRoomTotal !== persisted.roomSubtotal ? (
                      <div className="flex justify-between">
                        <dt>Difference</dt>
                        <dd>{signedDelta(persisted.roomSubtotal - openingRoomTotal)}</dd>
                      </div>
                    ) : null}
                    {folioWasReconciled && folio ? (
                      <div className="flex justify-between">
                        <dt>Current folio balance</dt>
                        <dd>{moneyFmt(folio.balance)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </SectionCard>
                <SectionCard
                  icon={<FileText className="size-4" />}
                  title="System Updates Completed"
                  subtitle="What this amendment updated."
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
                    {liveDraft.reservationRoomId ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">Affected room</dt>
                        <dd>{affectedRoomLabel(liveDraft) ?? EDIT_DASH}</dd>
                      </div>
                    ) : null}
                    {audit?.notes ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">Remarks</dt>
                        <dd>{audit.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </SectionCard>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[#DDD4C5] bg-white p-4 xl:block">
          <h2 className="text-sm font-semibold text-[#251605]">
            {step === "confirm" ? "Reservation Summary" : "Draft Summary"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {step === "confirm" ? "Changes saved" : "Not yet saved"}
          </p>
          <div className="space-y-4 text-sm">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Guest</p>
              <div className="flex gap-2">
                <span className="grid size-10 place-items-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
                  {guestInitials(liveDraft.guestName)}
                </span>
                <div>
                  <p className="font-medium">{liveDraft.guestName}</p>
                  <p className="text-xs text-muted-foreground">{reservation.confirmationNumber}</p>
                </div>
              </div>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Stay</p>
              <p>{stayDatesLabel(liveDraft.arrival, liveDraft.departure)}</p>
              <p className="text-xs text-muted-foreground">
                {guestCountLabel(liveDraft.adults, liveDraft.children)}
              </p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Room & Rate
              </p>
              <p className="font-medium">{liveDraft.roomTypeName || EDIT_DASH}</p>
              <p className="text-xs">
                {liveDraft.roomNumber ? `Room ${liveDraft.roomNumber}` : "Unassigned"}
              </p>
              <p className="text-xs text-muted-foreground">{reviewDash(liveDraft.ratePlanName)}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Commercial
              </p>
              <p>Source {sourceLabel(reservation.source, liveDraft.commercialBookingSource)}</p>
              <p>Market segment {reviewDash(liveDraft.marketSegment)}</p>
              <p>External reference {reviewDash(liveDraft.externalReference)}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Special Requests
              </p>
              <p>{reviewDash(liveDraft.specialRequests)}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Reservation Internal Notes
              </p>
              <p>{reviewDash(liveDraft.notes)}</p>
            </section>
            <p className="border-t border-[#EEE7DC] pt-3 text-sm font-semibold">
              Reservation Room Total {step === "confirm" ? storedTotal : proposedTotal}
            </p>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white px-5 py-3">
        {step === "details" ? (
          <div className="ml-auto">
            <Button type="button" onClick={() => setStep("review")}>
              Review Changes
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ) : null}
        {step === "review" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              <ArrowLeft className="size-3.5" />
              Back to Edit Details
            </Button>
            <Button
              type="button"
              disabled={!canConfirm || save.isPending}
              onClick={() => save.mutate()}
            >
              Confirm Changes
              <ArrowRight className="size-3.5" />
            </Button>
          </>
        ) : null}
      </footer>
      {step === "confirm" && amendmentPrint ? (
        <ReservationAmendmentPrint data={amendmentPrint} />
      ) : null}
    </div>
  );
}
