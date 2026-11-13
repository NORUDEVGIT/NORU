import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Calendar,
  Check,
  DoorOpen,
  FileText,
  Lock,
  Mail,
  Printer,
  Tag,
  User,
  UserRound,
  Users,
  X,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { ReservationAmendmentPrint } from "@/packages/pms/components/bookings/reservation-amendment-print";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
  isStayRangeValid,
} from "@/packages/pms/lib/create-reservation-phase1";
import { addDays, nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { getGuest, updateGuest } from "@/packages/pms/lib/guests.functions";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import {
  affectedRoomLabel,
  assignmentEditLocked,
  buildConfirmNextEvents,
  buildEditChangeRows,
  buildEditImpactRows,
  buildGuestProfileChangeRows,
  cancellationLabel,
  confirmIsEnabled,
  datesEditLocked,
  draftFromReservation,
  EDIT_DASH,
  EDIT_RESERVATION_STEPS,
  editCommercialLabel,
  editDraftDirty,
  guestContactIssue,
  guestProfileAmendPayload,
  folioReconciliationNotice,
  occupancyIsBlocked,
  persistableChanges,
  pickLatestAmendHistory,
  rateEditLocked,
  ratePerNightLabel,
  roomTotalImpact,
  roomTypeEditLocked,
  stayEditLocked,
  type EditReservationStepId,
  type ReservationEditDraft,
  type ReservationEditUnitSlice,
} from "@/packages/pms/lib/reservation-edit-workspace";
import type { AmendmentPrintData } from "@/packages/pms/lib/reservation-amendment-print";
import { listRatePlans, quoteStay } from "@/packages/pms/lib/rates.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
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
/** Same rectangular control as the Front Office Edit Reservation form. */
const CONTROL =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";
const SELECT =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus-visible:border-[#8A641A] focus-visible:ring-1 focus-visible:ring-[#8A641A] disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";
const MONEY_VALUE =
  "flex h-9 items-center rounded-[6px] border border-[#E4D3A8] bg-[#F4E9D0] px-3 text-sm font-bold text-[#251605]";
const EDITED_CONTROL = "border-[#C4A35A] bg-[#FBF7F1]";
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function catalogueChoices(
  rows: Array<{ id: string; code: string; name: string }> | undefined,
): Array<{ value: string; label: string; id: string; code: string }> {
  const choices: Array<{ value: string; label: string; id: string; code: string }> = [];
  for (const row of rows ?? []) {
    const label = row.name.trim();
    if (!label) continue;
    choices.push({ value: row.id, label, id: row.id, code: row.code });
    if (row.code && row.code !== row.id) {
      choices.push({ value: row.code, label, id: row.id, code: row.code });
    }
  }
  return choices;
}

function optionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string; id?: string | null; code?: string | null }[],
): string | null {
  const label = editCommercialLabel(value, options);
  return label === EDIT_DASH ? null : label;
}

function IconControl({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      {children}
    </div>
  );
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
      <span className="text-[11px] font-medium text-[#7A6B58]">
        {label}
        {required ? <span className="text-[#C89933]"> *</span> : null}
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
    <section className={cn("rounded-lg border border-[#DDD4C5] bg-white p-4", className)}>
      <header className="mb-4 flex items-start gap-2">
        <span className="mt-0.5 text-[#c9a24a]">{icon}</span>
        <div>
          <h2 className="font-display text-base font-semibold text-[#4a2c1a]">{title}</h2>
          <p className="text-xs text-[#7A6B58]">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function EditShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]" data-testid="edit-reservation-workspace">
      <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="font-display text-sm font-semibold text-[#F3E9D8]">Edit Reservation</h1>
          <span className="ml-auto">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
              onClick={onClose}
              aria-label="Close edit reservation"
            >
              <X className="size-4" />
            </Button>
          </span>
        </div>
      </header>
      {children}
    </div>
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
  onBackToDesk,
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
  const submitGuest = useServerFn(updateGuest);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const fetchQuotes = useServerFn(quoteStay);
  const fetchPlans = useServerFn(listRatePlans);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);
  const submitAmend = useServerFn(amendReservation);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);

  const [step, setStep] = useState<EditReservationStepId>("details");
  const [draft, setDraft] = useState<ReservationEditDraft | null>(null);
  const [baseline, setBaseline] = useState<ReservationEditDraft | null>(null);
  const hydratedGuestId = useRef<string | null>(null);
  const [openingRoomTotal, setOpeningRoomTotal] = useState<number | null>(null);
  const [folioWasReconciled, setFolioWasReconciled] = useState(false);
  const folioReconcileRef = useRef(false);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;
  const set6Query = useQuery({
    queryKey: ["pms-set6", restaurantId, "edit-reservation"],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const sourceOptions = catalogueChoices(set6Query.data?.snapshot.sourceCodes);
  const segmentOptions = catalogueChoices(set6Query.data?.snapshot.marketSegments);

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
    hydratedGuestId.current = null;
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

  useEffect(() => {
    const profile = guestQuery.data?.guest;
    if (!profile || hydratedGuestId.current === profile.id) return;
    hydratedGuestId.current = profile.id;
    const contact = {
      guestFirstName: profile.firstName,
      guestLastName: profile.lastName ?? "",
      guestPhone: profile.phone ?? "",
      guestEmail: profile.email ?? "",
      guestName: profile.fullName,
    };
    setDraft((current) =>
      current && current.guestId === profile.id ? { ...current, ...contact } : current,
    );
    setBaseline((current) =>
      current && current.guestId === profile.id ? { ...current, ...contact } : current,
    );
  }, [guestQuery.data]);

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

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, draft?.roomTypeId, "edit-reservation"],
    queryFn: () =>
      fetchPlans({
        data: { restaurantId, roomTypeId: draft!.roomTypeId, activeOnly: true },
      }),
    enabled: canManage && Boolean(draft?.roomTypeId),
    retry: false,
  });

  useEffect(() => {
    if (!plansQuery.isSuccess || !draft?.ratePlanId) return;
    const plans = plansQuery.data ?? [];
    if (plans.some((plan) => plan.id === draft.ratePlanId)) return;
    setDraft((current) =>
      current && current.ratePlanId === draft.ratePlanId
        ? { ...current, ratePlanId: null, ratePlanName: null }
        : current,
    );
  }, [plansQuery.isSuccess, plansQuery.data, draft?.ratePlanId, draft?.roomTypeId]);

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
  const guestChangeRows =
    baseline && liveDraft
      ? buildGuestProfileChangeRows({ before: baseline, after: liveDraft })
      : [];
  const guestPersistable = persistableChanges(guestChangeRows);
  const guestIssue = liveDraft ? guestContactIssue(liveDraft) : "First name is required.";
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

  const folioBlocked = folioNotice?.tone === "warn" && persistable.length > 0;
  const reservationReady =
    persistable.length === 0 ||
    confirmIsEnabled({
      datesValid,
      availabilityNone,
      occupancyBlocked,
      hasPersistableChange: true,
    });
  const guestReady = guestPersistable.length === 0 || (!guestIssue && hydratedGuestId.current === liveDraft?.guestId);
  const canConfirm =
    (persistable.length > 0 || guestPersistable.length > 0) &&
    reservationReady &&
    guestReady &&
    !folioBlocked;

  const save = useMutation({
    mutationFn: async () => {
      if (!liveDraft) throw new Error("Draft is not ready.");
      if (guestPersistable.length > 0) {
        const profile = guestQuery.data?.guest;
        if (!profile || profile.id !== liveDraft.guestId) {
          throw new Error("Guest profile is still loading.");
        }
        await submitGuest({
          data: {
            restaurantId,
            guestId: profile.id,
            guest: guestProfileAmendPayload(profile, {
              firstName: liveDraft.guestFirstName,
              lastName: liveDraft.guestLastName,
              phone: liveDraft.guestPhone,
              email: liveDraft.guestEmail,
            }),
          },
        });
      }
      if (persistable.length === 0) return { id: reservationId, amendment: null };
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
      await queryClient.invalidateQueries({ queryKey: ["guest", restaurantId] });
      toast.success(
        guestPersistable.length > 0 && persistable.length === 0
          ? "Guest profile updated."
          : "Reservation amended.",
      );
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
      ? persistableChanges(
          buildEditChangeRows({
            before: baseline,
            after: persistedDraft,
          }),
        )
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
          changes: [
            ...guestPersistable.map((row) => ({
              item: `Guest profile ${row.item}`,
              before: row.before,
              after: row.after,
            })),
            ...persistedRows
              .filter((row) => row.item !== "Reservation Internal Notes")
              .map((row) => ({ item: row.item, before: row.before, after: row.after })),
          ],
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
          source: optionLabel(persisted.commercialBookingSource, [
            ...DEFAULT_BOOKING_SOURCES,
            ...sourceOptions,
          ]),
          marketSegment: optionLabel(persisted.marketSegment, [
            ...DEFAULT_MARKET_SEGMENTS,
            ...segmentOptions,
          ]),
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
  const nextEvents = [
    ...(guestPersistable.length > 0
      ? [
          {
            id: "guest-profile",
            title: "Guest profile updated",
            detail: "The master guest profile was updated.",
          },
        ]
      : []),
    ...(persistable.length > 0
      ? buildConfirmNextEvents({
          inventoryChanged: stayChanged || assignmentChanged,
          rateMayChange: priceChanging,
          folioReconciled: folioWasReconciled,
        })
      : []),
  ];

  const guest = guestQuery.data?.guest;
  const guestFieldsReady = Boolean(guest && hydratedGuestId.current === guest.id);
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
      guestFirstName: draft.guestFirstName,
      guestLastName: draft.guestLastName,
      guestPhone: draft.guestPhone,
      guestEmail: draft.guestEmail,
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
      guestFirstName: baseline.guestFirstName,
      guestLastName: baseline.guestLastName,
      guestPhone: baseline.guestPhone,
      guestEmail: baseline.guestEmail,
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

  function requestClose() {
    if (unsavedDraft && !window.confirm("Close without saving these changes?")) return;
    onBackToDesk();
  }

  if (detailQuery.isError) {
    return (
      <EditShell onClose={requestClose}>
        <p className="grid h-full place-items-center p-8 text-sm text-destructive">
          Could not load this reservation.
        </p>
      </EditShell>
    );
  }
  if (!reservation || !liveDraft || !baseline) {
    return (
      <EditShell onClose={requestClose}>
        <p className="grid h-full place-items-center p-8 text-sm text-[#6B5E4E]">
          Loading reservation…
        </p>
      </EditShell>
    );
  }

  const changed = (field: keyof ReservationEditDraft) => baseline[field] !== liveDraft[field];
  const roomOptions = roomsQuery.data ?? [];
  const planOptions = plansQuery.data ?? [];

  const currentStep = EDIT_RESERVATION_STEPS.findIndex((row) => row.id === step);
  const shownImpact = impactRows.filter((row) => row.status !== "unevaluated");
  const priceImpact =
    financialImpact != null && (financialImpact.delta == null || financialImpact.delta !== 0);
  const hasRealImpact = Boolean(priceImpact || folioNotice || shownImpact.length > 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[#FBF7F1]"
      data-testid="edit-reservation-workspace"
    >
      <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-display text-sm font-semibold text-[#F3E9D8]">
            {reservation.confirmationNumber}
          </h1>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
            {STATUS_LABELS[reservation.status] ?? reservation.status}
          </span>
          <span className="ml-auto">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
              onClick={requestClose}
              aria-label="Close edit reservation"
              data-testid="edit-reservation-close"
            >
              <X className="size-4" />
            </Button>
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[#C4B6A0]">
          Current reservation · {formatStayDate(reservation.arrivalDate)} →{" "}
          {formatStayDate(reservation.departureDate)} · {reservation.roomTypeName}
        </p>
      </header>
      <nav
        aria-label="Edit reservation workflow"
        className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
        data-testid="edit-reservation-stepper"
      >
        <ol className="flex min-w-0 items-stretch">
          {EDIT_RESERVATION_STEPS.map((item, index) => {
            const active = item.id === step;
            const completed = index < currentStep;
            return (
              <li key={item.id} className="flex">
                <button
                  type="button"
                  title={item.hint}
                  aria-current={active ? "step" : undefined}
                  disabled={step === "confirm" || item.id === "confirm"}
                  onClick={() => {
                    if (item.id === "details" || item.id === "review") setStep(item.id);
                  }}
                  className={cn(
                    "relative flex h-full items-center gap-1 px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] disabled:cursor-default",
                    completed && "text-[#436436]",
                    active && "text-[#251605]",
                    !completed && !active && "text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="size-3" /> : (
                    <span className="tabular-nums">{index + 1}</span>
                  )}
                  <span className="whitespace-nowrap">
                    {step === "confirm" && item.id === "confirm" ? "Confirmed" : item.label}
                  </span>
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
        {step === "confirm" ? (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[#DDD4C5] bg-[#F4E9D0] px-4 py-3 text-sm text-[#251605]">
            <div className="flex items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-[#8A641A]" />
              <div>
                <p className="font-semibold">Changes Saved Successfully</p>
                <p className="text-[#5C4E3E]">
                  Reservation {reservation.confirmationNumber} was updated successfully.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              Print Amendment
            </Button>
          </div>
        ) : null}
          {step === "details" ? (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <div className="grid content-start gap-4">
              <SectionCard
                icon={<UserRound className="size-4" />}
                title="Guest"
                subtitle="Guest changes update the master guest profile."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First Name" required changed={changed("guestFirstName")}>
                    <IconControl icon={<User />}>
                      <Input
                        value={liveDraft.guestFirstName}
                        disabled={!guestFieldsReady}
                        placeholder="Enter first name"
                        className={cn(CONTROL, "pl-9", changed("guestFirstName") && EDITED_CONTROL)}
                        onChange={(event) =>
                          patch({
                            guestFirstName: event.target.value,
                            guestName: [event.target.value, liveDraft.guestLastName]
                              .filter((part) => part.trim())
                              .join(" "),
                          })
                        }
                      />
                    </IconControl>
                  </Field>
                  <Field label="Last Name" changed={changed("guestLastName")}>
                    <IconControl icon={<User />}>
                      <Input
                        value={liveDraft.guestLastName}
                        disabled={!guestFieldsReady}
                        placeholder="Enter last name"
                        className={cn(CONTROL, "pl-9", changed("guestLastName") && EDITED_CONTROL)}
                        onChange={(event) =>
                          patch({
                            guestLastName: event.target.value,
                            guestName: [liveDraft.guestFirstName, event.target.value]
                              .filter((part) => part.trim())
                              .join(" "),
                          })
                        }
                      />
                    </IconControl>
                  </Field>
                  <Field label="Phone" changed={changed("guestPhone")}>
                    <CanonicalPhoneInput
                      value={liveDraft.guestPhone}
                      disabled={!guestFieldsReady}
                      onChange={(phone) => patch({ guestPhone: phone })}
                      placeholder="Enter phone number"
                      size="modal"
                      containerClassName={cn(
                        "h-9 gap-0 overflow-hidden rounded-[6px] border bg-white focus-within:border-[#8A641A] focus-within:ring-1 focus-within:ring-[#8A641A]",
                        changed("guestPhone") ? EDITED_CONTROL : "border-[#CCCCCC]",
                      )}
                      triggerClassName="h-9 w-[7.75rem] rounded-none border-0 bg-transparent px-2 shadow-none hover:bg-[#FAF8F5]"
                      className="h-9 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                      popoverClassName="z-[90]"
                    />
                  </Field>
                  <Field label="Email" changed={changed("guestEmail")}>
                    <IconControl icon={<Mail />}>
                      <Input
                        type="email"
                        value={liveDraft.guestEmail}
                        disabled={!guestFieldsReady}
                        placeholder="Enter email address"
                        className={cn(CONTROL, "pl-9", changed("guestEmail") && EDITED_CONTROL)}
                        onChange={(event) => patch({ guestEmail: event.target.value })}
                      />
                    </IconControl>
                  </Field>
                </div>
                {guestIssue && guestPersistable.length > 0 ? (
                  <p className="mt-2 text-sm text-destructive">{guestIssue}</p>
                ) : null}
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
                    <IconControl icon={<Calendar />}>
                      {!liveDraft.arrival ? (
                        <span className="pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-sm text-muted-foreground">
                          Select arrival date
                        </span>
                      ) : null}
                      <Input
                        type="date"
                        disabled={datesLocked}
                        value={liveDraft.arrival}
                        placeholder="Select arrival date"
                        className={cn(
                          CONTROL,
                          "pl-9",
                          !liveDraft.arrival && "text-transparent",
                          changed("arrival") && EDITED_CONTROL,
                        )}
                        onChange={(event) => {
                          const arrival = event.target.value;
                          patch({ arrival, departure: addDays(arrival, Math.max(nights, 1)) });
                        }}
                      />
                    </IconControl>
                  </Field>
                  <Field label="Departure Date" changed={changed("departure")}>
                    <IconControl icon={<Calendar />}>
                      {!liveDraft.departure ? (
                        <span className="pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 text-sm text-muted-foreground">
                          Select departure date
                        </span>
                      ) : null}
                      <Input
                        type="date"
                        disabled={datesLocked}
                        value={liveDraft.departure}
                        placeholder="Select departure date"
                        className={cn(
                          CONTROL,
                          "pl-9",
                          !liveDraft.departure && "text-transparent",
                          changed("departure") && EDITED_CONTROL,
                        )}
                        onChange={(event) => patch({ departure: event.target.value })}
                      />
                    </IconControl>
                  </Field>
                  <Field label="Nights">
                    <Input
                      readOnly
                      value={String(nights)}
                      placeholder="Enter nights"
                      className={cn(CONTROL, "bg-[#FAF8F5]")}
                    />
                  </Field>
                  <Field label="Adults" changed={changed("adults")}>
                    <IconControl icon={<Users />}>
                      <Input
                        type="number"
                        min={1}
                        disabled={occupancyLocked}
                        value={liveDraft.adults}
                        placeholder="Enter adults count"
                        className={cn(CONTROL, "pl-9", changed("adults") && EDITED_CONTROL)}
                        onChange={(event) => patch({ adults: Number(event.target.value) || 1 })}
                      />
                    </IconControl>
                  </Field>
                  <Field label="Children" changed={changed("children")}>
                    <IconControl icon={<Users />}>
                      <Input
                        type="number"
                        min={0}
                        disabled={occupancyLocked}
                        value={liveDraft.children}
                        placeholder="Enter children count"
                        className={cn(CONTROL, "pl-9", changed("children") && EDITED_CONTROL)}
                        onChange={(event) => patch({ children: Number(event.target.value) || 0 })}
                      />
                    </IconControl>
                  </Field>
                </div>
                {occupancyBlocked ? (
                  <p className="mt-2 text-sm text-destructive">
                    Adults and children exceed this room type&apos;s maximum occupancy
                    {selectedType?.maxOccupancy != null ? ` of ${selectedType.maxOccupancy}` : ""}.
                  </p>
                ) : null}
              </SectionCard>

              <SectionCard
                icon={<FileText className="size-4" />}
                title="Internal Notes"
                subtitle="Visible to authorised hotel staff. Not shown to the guest."
              >
                <Field label="Reservation Internal Notes" changed={changed("notes")}>
                  <Textarea
                    rows={4}
                    maxLength={500}
                    value={liveDraft.notes}
                    onChange={(event) => patch({ notes: event.target.value })}
                    placeholder="Enter internal notes"
                    className={cn(CONTROL, "h-auto min-h-16 py-2", changed("notes") && EDITED_CONTROL)}
                  />
                </Field>
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {liveDraft.notes.length}/500
                </p>
              </SectionCard>

              </div>

              <div className="grid content-start gap-4">
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
                  <Field label="Selected room" changed={changed("reservationRoomId")}>
                    <Select value={liveDraft.reservationRoomId ?? NONE} onValueChange={selectUnit}>
                      <SelectTrigger className={cn(SELECT, changed("reservationRoomId") && EDITED_CONTROL)}>
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
                    <img src={coverUrl} alt="" className="h-20 w-28 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-20 w-28 place-items-center rounded-lg bg-[#F4E9D0] text-[#765719]">
                      <BedDouble className="size-7" />
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
                  <Field label="Room Type" changed={changed("roomTypeId")}>
                    <IconControl icon={<BedDouble />}>
                    <Select
                      value={liveDraft.roomTypeId}
                      disabled={roomTypeLocked}
                      onValueChange={(value) => {
                        const nextType = (availabilityQuery.data ?? []).find(
                          (row) => row.roomTypeId === value,
                        );
                        const roomStillMatches =
                          liveDraft.roomId != null &&
                          value === liveDraft.roomTypeId;
                        patch({
                          roomTypeId: value,
                          roomTypeName: nextType?.name ?? liveDraft.roomTypeName,
                          ...(roomStillMatches
                            ? {}
                            : { roomId: null, roomNumber: null }),
                        });
                      }}
                    >
                      <SelectTrigger className={cn(SELECT, "pl-9", changed("roomTypeId") && EDITED_CONTROL)}>
                        <SelectValue placeholder="Select room type" />
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
                    </IconControl>
                  </Field>
                  <Field label="Rate Plan" changed={changed("ratePlanId")}>
                    <IconControl icon={<Tag />}>
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
                      <SelectTrigger className={cn(SELECT, "pl-9", changed("ratePlanId") && EDITED_CONTROL)}>
                        <SelectValue placeholder="Select rate plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {liveDraft.ratePlanId ? null : (
                          <SelectItem value={NONE}>Choose a rate plan</SelectItem>
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
                    </IconControl>
                    {liveDraft.roomTypeId !== baseline.roomTypeId && !liveDraft.ratePlanId ? (
                      <p className="mt-1 text-xs text-[#8A641A]">
                        Choose a rate plan for this room type.
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Assigned Room" changed={changed("roomId")}>
                    <IconControl icon={<DoorOpen />}>
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
                      <SelectTrigger className={cn(SELECT, "pl-9", changed("roomId") && EDITED_CONTROL)}>
                        <SelectValue placeholder="Select assigned room" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {roomOptions.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            Room {row.roomNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    </IconControl>
                    {baseline.roomId &&
                    !liveDraft.roomId &&
                    liveDraft.roomTypeId !== baseline.roomTypeId ? (
                      <p className="mt-1 text-xs text-[#8A641A]">
                        The assigned room was cleared because it does not match the selected room type.
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Rate per Night">
                    <div className={MONEY_VALUE}>{proposedRate}</div>
                    {storedRate !== proposedRate &&
                    storedRate !== EDIT_DASH &&
                    proposedRate !== EDIT_DASH ? (
                      <p className="mt-1 text-xs text-[#8A641A]">
                        {storedRate} → {proposedRate}
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Reservation Room Total">
                    <div className={MONEY_VALUE}>{proposedTotal}</div>
                    {financialImpact &&
                    financialImpact.previous != null &&
                    financialImpact.next != null &&
                    financialImpact.delta !== 0 ? (
                      <p className="mt-1 text-xs text-[#8A641A]">
                        {moneyFmt(financialImpact.previous)} → {moneyFmt(financialImpact.next)}
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Cancellation Policy">
                    <div className="flex h-9 items-center gap-2 rounded-[6px] border border-[#E8E1D7] bg-[#FAF8F5] px-3 text-sm text-[#6B5E4E]">
                      <Lock className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{proposedCancellation}</span>
                    </div>
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
                    placeholder="Enter special requests or notes"
                    className={cn(
                      CONTROL,
                      "h-auto min-h-16 py-2",
                      changed("specialRequests") && EDITED_CONTROL,
                    )}
                    onChange={(event) => patch({ specialRequests: event.target.value })}
                  />
                </Field>
              </SectionCard>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div
              className={cn(
                "grid gap-4",
                hasRealImpact && "xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]",
              )}
            >
              <SectionCard
                icon={<FileText className="size-4" />}
                title="Changes Summary"
                subtitle={
                  persistable.length === 0 && guestPersistable.length === 0
                    ? "Nothing will be saved."
                    : "Before → After"
                }
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
                {persistable.length === 0 && guestPersistable.length === 0 ? (
                  <p className="py-6 text-sm text-[#6B5E4E]" data-testid="edit-no-changes">
                    No changes made
                  </p>
                ) : (
                  <div className="space-y-4" data-testid="edit-change-summary">
                    {guestPersistable.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                          Guest Profile
                        </p>
                        <ul className="divide-y divide-[#E8DFD0] text-sm">
                          {guestPersistable.map((row) => (
                            <li
                              key={row.item}
                              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                            >
                              <span className="font-medium text-[#251605]">{row.item}</span>
                              <span className="text-[#5C4E3E]">
                                {row.before} → {row.after}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {persistable.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                          Reservation
                        </p>
                        <ul className="divide-y divide-[#E8DFD0] text-sm">
                          {persistable.map((row) => (
                            <li
                              key={row.item}
                              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                            >
                              <span className="font-medium text-[#251605]">{row.item}</span>
                              <span className="text-[#5C4E3E]">
                                {row.before} → {row.after}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </SectionCard>
              {hasRealImpact ? (
                <SectionCard
                  icon={<FileText className="size-4" />}
                  title="Impact Analysis"
                  subtitle="What this amendment will affect."
                >
                  {priceImpact && financialImpact ? (
                    <div
                      className="mb-4 rounded-lg border border-[#DDD4C5] px-3 py-2 text-sm"
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
                    {shownImpact
                      .filter((row) => row.id !== "occupancy")
                      .map((row) => (
                        <li key={row.id} className="rounded-lg border border-[#DDD4C5] px-3 py-2">
                          <p className="text-sm font-medium text-[#251605]">{row.title}</p>
                          <p className="text-xs text-muted-foreground">{row.detail}</p>
                        </li>
                      ))}
                  </ul>
                  {occupancyBlocked ? (
                    <p className="mt-3 text-sm text-destructive">Occupancy exceeds this room type.</p>
                  ) : null}
                  {!canConfirm ? (
                    <div className="mt-4 rounded-lg bg-[#F7F4EE] px-3 py-2 text-sm text-muted-foreground">
                      {[
                        !datesValid ? "Departure must be after arrival." : null,
                        availabilityNone ? "No availability for the requested dates." : null,
                        occupancyBlocked ? "Occupancy exceeds this room type." : null,
                        folioNotice?.tone === "warn" ? folioNotice.detail : null,
                        guestPersistable.length > 0 ? guestIssue : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  ) : null}
                </SectionCard>
              ) : null}
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
                    {guestPersistable.map((row) => (
                      <tr key={`guest-${row.item}`} className="border-t border-[#EEE7DC]">
                        <td className="py-2 font-medium">Guest profile · {row.item}</td>
                        <td>{row.before}</td>
                        <td>{row.after}</td>
                        <td>{row.change}</td>
                      </tr>
                    ))}
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

      <footer
        className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E8DFD0] bg-white px-4 py-2"
        data-testid="edit-reservation-footer"
      >
        {step === "details" ? (
          <div className="ml-auto">
            <Button
              type="button"
              className={SHELL_PRIMARY_BUTTON}
              onClick={() => setStep("review")}
            >
              Review Changes
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ) : null}
        {step === "review" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-9 text-[#4a2c1a]"
              onClick={() => setStep("details")}
            >
              <ArrowLeft className="size-3.5" />
              Back to Edit Details
            </Button>
            <Button
              type="button"
              className={cn(SHELL_PRIMARY_BUTTON, "disabled:text-[#251605] disabled:opacity-70")}
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
