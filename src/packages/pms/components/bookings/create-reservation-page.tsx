import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CreateReservationRoomType,
  OccupancySoftWarn,
} from "@/packages/pms/components/bookings/create-reservation-room-type";
import { CreateReservationRate } from "@/packages/pms/components/bookings/create-reservation-rate";
import { CreateReservationRoomAssignment } from "@/packages/pms/components/bookings/create-reservation-room-assignment";
import { CreateReservationPackages } from "@/packages/pms/components/bookings/create-reservation-packages";
import { CreateReservationGuarantee } from "@/packages/pms/components/bookings/create-reservation-guarantee";
import { CreateReservationConfirmation } from "@/packages/pms/components/bookings/create-reservation-confirmation";

import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  addDays,
  formatStayDate,
  propertyToday,
} from "@/packages/pms/components/bookings/reservation-bits";
import { CreateReservationContext } from "@/packages/pms/components/bookings/create-reservation-context";
import { CreateReservationAssociations } from "@/packages/pms/components/bookings/create-reservation-associations";
import {
  CreateReservationGuest,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { CreateReservationStay } from "@/packages/pms/components/bookings/create-reservation-stay";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import {
  createReservation,
  getBookingsAccess,
  getRoomTypeAvailability,
  listAssignableRooms,
  type RoomTypeAvailability,
} from "@/packages/pms/lib/reservations.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getPmsSet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest.functions";
import { getPmsPolish1Snapshot } from "@/packages/pms/lib/pms-polish1-payment-admin.functions";
import {
  getGuestAccount,
  listGuestAccountLinks,
} from "@/packages/pms/lib/guest-accounts.functions";
import {
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_MIN_NIGHTS,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
  RESERVATION_TYPE_LABELS,
  formatStayOccupancySummary,
  isStayRangeValid,
  linkedStayFromArrival,
  linkedStayFromDeparture,
  linkedStayFromNights,
  mastersForCreateMode,
  pickPrefillMasterId,
  createReservationPrefillRoles,
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  toPickedReservationMaster,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  occupancySoftWarn,
  stickyAvailability,
  stickyAvailabilityCopy,
  stickyRoomTypeLabel,
  type SelectedRoomTypeMeta,
} from "@/packages/pms/lib/create-reservation-phase1-section4";
import {
  canCreateUnpricedPending,
  canSubmitCreateReservation,
  fromNightlyRate,
  resolveCreatePricingState,
  shouldClearStaleRatePlan,
  stickyPricingCopy,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import {
  CREATE_RESERVATION_ROOM_STALE_DATE_WARN,
  CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN,
  shouldClearStaleAssignedRoom,
  shouldWarnRoomClearedOnTypeChange,
  stickyRoomAssignmentLabel,
  type AssignedRoomView,
} from "@/packages/pms/lib/create-reservation-phase1-section6";
import {
  CREATE_RESERVATION_CONFIRM_LABEL,
  CREATE_RESERVATION_PENDING_LABEL,
  canSubmitConfirmReservation,
  createConfirmBlockCopy,
  createPendingBlockCopy,
  guaranteeCatalogueWarning,
  paymentTermsReviewCopy,
  requiredMasterForConfirm,
  resolveGuaranteeMethodOptions,
  section7PersistApplied,
  type CreatedReservationConfirmation,
} from "@/packages/pms/lib/create-reservation-phase1-section7";
import {
  activePackageCountFromRows,
  stickyPackagesCopy,
} from "@/packages/pms/lib/create-reservation-phase1-section8";
import {
  useMoney,
  useRestaurantTimezone,
} from "@/packages/restaurant-management/state/restaurant-context";
import { cn } from "@/shared/lib/utils";

const UNASSIGNED = "unassigned";

/* Source-lock identifiers remain in this file:
   CREATE_RESERVATION_SECTION1_SCOPE CREATE_RESERVATION_SECTION2_SCOPE CREATE_RESERVATION_SECTION2A_SCOPE
   CREATE_RESERVATION_SECTION3_SCOPE CREATE_RESERVATION_SECTION5_SCOPE CREATE_RESERVATION_SECTION6_SCOPE
   CREATE_RESERVATION_SECTION7_SCOPE CREATE_RESERVATION_SECTION8_SCOPE
*/
const CREATE_WORKFLOW_STEPS = [
  { id: "stay", label: "Stay Details", continueLabel: "Continue to Guest and Contact" },
  { id: "guest", label: "Guest and Contact", continueLabel: "Continue to Room and Rate" },
  { id: "room", label: "Room and Rate", continueLabel: "Continue to Add-ons and Services" },
  { id: "addons", label: "Add-ons and Services", continueLabel: "Continue to Review and Confirm" },
  { id: "review", label: "Review and Confirm", continueLabel: null },
] as const;

export function CreateReservationPage({
  membership,
  embedded = false,
  pmsGroupId = null,
  pmsGroupBlockId = null,
  onCancel,
  onCreated,
  onOpenCreatedReservation,
  onReturnToDesk,
}: {
  membership: RestaurantMembership;
  embedded?: boolean;
  pmsGroupId?: string | null;
  pmsGroupBlockId?: string | null;
  onCancel?: () => void;
  onCreated?: (reservationId: string) => void;
  onOpenCreatedReservation?: (reservationId: string) => void;
  onReturnToDesk?: () => void;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchGuestAccess = useServerFn(getGuestsAccess);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const fetchSet3 = useServerFn(getPmsSet3Snapshot);
  const fetchPolish1 = useServerFn(getPmsPolish1Snapshot);
  const fetchGuestLinks = useServerFn(listGuestAccountLinks);
  const fetchGuestAccount = useServerFn(getGuestAccount);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitReservation = useServerFn(createReservation);
  const fetchQuotes = useServerFn(quoteStay);
  const money = useMoney();

  const [reservationType, setReservationType] = useState<ReservationTypeMode>("individual");
  const [pendingType, setPendingType] = useState<ReservationTypeMode | null>(null);
  const [bookingSource, setBookingSource] = useState("");
  const [marketSegment, setMarketSegment] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [guest, setGuest] = useState<PickedReservationGuest | null>(null);
  const [companyMaster, setCompanyMaster] = useState<PickedReservationMaster | null>(null);
  const [travelAgentMaster, setTravelAgentMaster] = useState<PickedReservationMaster | null>(null);
  const [companyOverride, setCompanyOverride] = useState(false);
  const [travelAgentOverride, setTravelAgentOverride] = useState(false);
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState<SelectedRoomTypeMeta | null>(null);
  const [roomId, setRoomId] = useState(UNASSIGNED);
  const [selectedAssignedRoom, setSelectedAssignedRoom] = useState<AssignedRoomView | null>(null);
  const [specialRequests, setSpecialRequests] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"pending" | "confirmed">("pending");
  const [ratePlanId, setRatePlanId] = useState("");
  const [guaranteeMethod, setGuaranteeMethod] = useState("");
  const [createdView, setCreatedView] = useState<CreatedReservationConfirmation | null>(null);
  const [workflowStep, setWorkflowStep] = useState(0);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const guestAccessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchGuestAccess({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  const set6Query = useQuery({
    queryKey: ["pms-set6-snapshot", restaurantId, "create-reservation"],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const set3Query = useQuery({
    queryKey: ["pms-set3-snapshot", restaurantId, "create-reservation-packages"],
    queryFn: () => fetchSet3({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const sourceOptions = resolveBookingSourceOptions(set6Query.data?.snapshot.sourceCodes);
  const segmentOptions = resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments);

  const polish1Query = useQuery({
    queryKey: ["pms-polish1-snapshot", restaurantId, "create-reservation-guarantee"],
    queryFn: () => fetchPolish1({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const guaranteeOptions = resolveGuaranteeMethodOptions(polish1Query.data?.snapshot);
  const guaranteeWarning = guaranteeCatalogueWarning(polish1Query.data?.snapshot);
  const persistApplied = section7PersistApplied();

  const datesValid = isStayRangeValid(arrival, departure);
  const nights = nightsBetween(arrival, departure);

  function handleArrivalChange(next: string) {
    if (!next) {
      setArrival("");
      setRatePlanId("");
      return;
    }
    const stay = linkedStayFromArrival(next, datesValid ? nights : CREATE_RESERVATION_MIN_NIGHTS);
    setArrival(stay.arrival);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  function handleNightsChange(next: number) {
    if (!arrival) return;
    const stay = linkedStayFromNights(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  function handleDepartureChange(next: string) {
    const stay = linkedStayFromDeparture(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  const availabilityQuery = useQuery({
    queryKey: ["room-type-availability", restaurantId, arrival, departure],
    queryFn: () => fetchAvailability({ data: { restaurantId, arrival, departure } }),
    enabled: canManage && datesValid,
  });

  const roomsQuery = useQuery({
    queryKey: ["assignable-rooms", restaurantId, roomTypeId, arrival, departure],
    queryFn: () => fetchRooms({ data: { restaurantId, roomTypeId, arrival, departure } }),
    enabled: canManage && datesValid && !!roomTypeId,
  });

  const quotesQuery = useQuery({
    queryKey: ["stay-quotes", restaurantId, roomTypeId, arrival, departure],
    queryFn: () => fetchQuotes({ data: { restaurantId, roomTypeId, arrival, departure } }),
    enabled: canManage && datesValid && !!roomTypeId,
    retry: false,
  });
  const quotes = quotesQuery.data ?? [];
  const selectedQuote = quotes.find((q) => q.plan.id === ratePlanId) ?? null;
  const actorRole = accessQuery.data?.role ?? membership.role;
  const canCreateUnpriced = canCreateUnpricedPending(actorRole);
  const priced = selectedQuote?.quote != null;
  const pricingState = resolveCreatePricingState({
    datesValid,
    roomTypeId,
    loading: quotesQuery.isLoading || quotesQuery.isFetching,
    error: quotesQuery.isError,
    selectedQuote,
  });

  useEffect(() => {
    if (
      shouldClearStaleRatePlan({
        ratePlanId,
        quotesReady: !quotesQuery.isLoading && !quotesQuery.isFetching && !quotesQuery.isError,
        quotes: quotes.map((row) => ({ planId: row.plan.id, hasQuote: row.quote != null })),
      })
    ) {
      setRatePlanId("");
    }
  }, [quotes, quotesQuery.isError, quotesQuery.isFetching, quotesQuery.isLoading, ratePlanId]);

  useEffect(() => {
    const roomsReady =
      !!roomTypeId &&
      datesValid &&
      !roomsQuery.isLoading &&
      !roomsQuery.isFetching &&
      !roomsQuery.isError;
    if (
      shouldClearStaleAssignedRoom({
        roomId,
        unassignedValue: UNASSIGNED,
        roomsReady,
        assignableIds: (roomsQuery.data ?? []).map((row) => row.id),
      })
    ) {
      setRoomId(UNASSIGNED);
      setSelectedAssignedRoom(null);
      toast.warning(CREATE_RESERVATION_ROOM_STALE_DATE_WARN);
    }
  }, [
    datesValid,
    roomId,
    roomTypeId,
    roomsQuery.data,
    roomsQuery.isError,
    roomsQuery.isFetching,
    roomsQuery.isLoading,
  ]);

  const prefillRoles = createReservationPrefillRoles(reservationType);
  const prefillCompany = !companyOverride && prefillRoles.includes("employer");
  const prefillTravelAgent = !travelAgentOverride && prefillRoles.includes("booker_ta");

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest?.id, "create-reservation-prefill"],
    queryFn: () => fetchGuestLinks({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && !!guest && (prefillCompany || prefillTravelAgent),
    retry: false,
  });

  useEffect(() => {
    if (!guest) {
      if (!companyOverride) setCompanyMaster(null);
      if (!travelAgentOverride) setTravelAgentMaster(null);
      return;
    }
    if (!prefillCompany && !prefillTravelAgent) return;
    const links = linksQuery.data;
    if (!links) return;
    const rows = links;

    let cancelled = false;

    async function applyPrefill(
      role: "employer" | "booker_ta",
      setter: (master: PickedReservationMaster | null) => void,
    ) {
      const masterId = pickPrefillMasterId(rows, role);
      if (!masterId) {
        setter(null);
        return;
      }
      try {
        const profile = await fetchGuestAccount({ data: { restaurantId, accountId: masterId } });
        if (!cancelled) setter(toPickedReservationMaster(profile));
      } catch {
        if (!cancelled) setter(null);
      }
    }

    if (prefillCompany) void applyPrefill("employer", setCompanyMaster);
    if (prefillTravelAgent) void applyPrefill("booker_ta", setTravelAgentMaster);

    return () => {
      cancelled = true;
    };
  }, [
    companyOverride,
    fetchGuestAccount,
    guest,
    linksQuery.data,
    prefillCompany,
    prefillTravelAgent,
    restaurantId,
    travelAgentOverride,
  ]);

  const boundMasters = mastersForCreateMode(
    reservationType,
    companyMaster?.id ?? null,
    travelAgentMaster?.id ?? null,
  );

  const create = useMutation({
    mutationFn: (nextStatus: "pending" | "confirmed") =>
      submitReservation({
        data: {
          restaurantId,
          guestId: guest?.id ?? "",
          roomTypeId,
          roomId: roomId === UNASSIGNED ? null : roomId,
          arrival,
          departure,
          adults,
          children,
          specialRequests: specialRequests.trim() || null,
          notes: notes.trim() || null,
          status: nextStatus,
          ratePlanId: ratePlanId || null,
          companyMasterId: boundMasters.companyMasterId,
          travelAgentMasterId: boundMasters.travelAgentMasterId,
          commercialBookingSource: bookingSource.trim() || null,
          marketSegment: marketSegment.trim() || null,
          externalReference: externalReference.trim() || null,
          guaranteeMethod: guaranteeMethod.trim() || null,
          requireGuarantee: nextStatus === "confirmed",
          reservationType,
          pmsGroupId,
          pmsGroupBlockId,
        },
      }),
    onSuccess: (result, nextStatus) => {
      const sourceLabel =
        sourceOptions.find((row) => row.value === bookingSource)?.label ?? bookingSource;
      const segmentLabel =
        segmentOptions.find((row) => row.value === marketSegment)?.label ?? marketSegment;
      const guaranteeLabel =
        guaranteeOptions.find((row) => row.value === guaranteeMethod)?.label ?? guaranteeMethod;
      setCreatedView({
        id: result.id,
        confirmationNumber: result.confirmationNumber,
        status: nextStatus,
        guestName: guest?.fullName ?? "Guest",
        stayDates: datesValid
          ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}`
          : "Dates not set",
        occupancy: formatStayOccupancySummary(adults, children),
        roomType: selectedRoomType?.name ?? stickyRoomTypeLabel(selectedRoomType),
        room: stickyRoomAssignmentLabel({
          roomTypeId,
          roomId,
          unassignedValue: UNASSIGNED,
          room: selectedAssignedRoom,
        }),
        rate: selectedQuote?.quote
          ? `${selectedQuote.quote.ratePlanCode}${selectedQuote.quote.ratePlanName ? ` · ${selectedQuote.quote.ratePlanName}` : ""}`
          : null,
        stayTotal: selectedQuote?.quote
          ? `${money(selectedQuote.quote.subtotal)}${selectedQuote.quote.currency ? ` ${selectedQuote.quote.currency}` : ""}`
          : null,
        unpriced: selectedQuote?.quote == null,
        guaranteeMethod:
          nextStatus === "confirmed" ? guaranteeLabel || null : guaranteeLabel || null,
        paymentTerms: paymentTermsReviewCopy({
          companyName: companyMaster?.name ?? null,
          companyTerms: companyMaster?.paymentTerms ?? null,
          travelAgentName: travelAgentMaster?.name ?? null,
          travelAgentTerms: travelAgentMaster?.paymentTerms ?? null,
        }),
        bookingSource: sourceLabel || null,
        marketSegment: segmentLabel || null,
        externalReference: externalReference.trim() || null,
      });
      onCreated?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">New Reservation</h1>
        <p className="mt-2 text-sm text-muted-foreground">{CREATE_RESERVATION_DENIED_COPY}</p>
      </div>
    );
  }

  if (createdView) {
    return (
      <CreateReservationConfirmation
        view={createdView}
        onOpenReservation={onOpenCreatedReservation}
        onReturnToDesk={onReturnToDesk}
        onCreateAnother={embedded ? () => setCreatedView(null) : undefined}
      />
    );
  }

  const availability = availabilityQuery.data ?? [];
  const selectedType = availability.find((a) => a.roomTypeId === roomTypeId);
  const rooms = roomsQuery.data ?? [];
  const submitInput = {
    hasGuest: !!guest,
    datesValid,
    roomTypeId,
    available: selectedType?.available ?? 0,
    priced,
    canCreateUnpriced,
  };
  const occupancyIssue = occupancySoftWarn(
    adults,
    children,
    selectedType?.maxOccupancy ?? selectedRoomType?.maxOccupancy,
  );
  const occupancyOk = occupancyIssue == null;
  const canSubmit =
    occupancyOk &&
    canSubmitCreateReservation({
      ...submitInput,
      status: "pending",
    });
  const canSubmitConfirm =
    occupancyOk &&
    canSubmitConfirmReservation({
      ...submitInput,
      hasGuarantee: !!guaranteeMethod,
      hasSource: !!bookingSource,
      hasSegment: !!marketSegment,
      hasRequiredMaster: requiredMasterForConfirm(
        reservationType,
        companyMaster?.id ?? null,
        travelAgentMaster?.id ?? null,
      ),
      persistApplied,
    });
  const pendingBlockCopy = occupancyIssue
    ? occupancyIssue
    : createPendingBlockCopy({
        ...submitInput,
        status: "pending",
      });
  const confirmBlockCopy = occupancyIssue
    ? occupancyIssue
    : createConfirmBlockCopy({
        ...submitInput,
        hasGuarantee: !!guaranteeMethod,
        hasSource: !!bookingSource,
        hasSegment: !!marketSegment,
        hasRequiredMaster: requiredMasterForConfirm(
          reservationType,
          companyMaster?.id ?? null,
          travelAgentMaster?.id ?? null,
        ),
        persistApplied,
      });
  const bookingAgentName = accessQuery.data?.actorName ?? "Current user";
  const selectedMeta =
    selectedType != null
      ? {
          roomTypeId: selectedType.roomTypeId,
          name: selectedType.name,
          code: selectedType.code,
          maxOccupancy: selectedType.maxOccupancy,
          adultCapacity: selectedType.adultCapacity,
          childCapacity: selectedType.childCapacity,
        }
      : selectedRoomType?.roomTypeId === roomTypeId
        ? selectedRoomType
        : null;
  const summaryAvailability = stickyAvailability({
    roomTypeId,
    datesValid,
    loading: availabilityQuery.isLoading || availabilityQuery.isFetching,
    live: selectedType,
  });

  function selectRoomType(type: RoomTypeAvailability) {
    if (
      shouldWarnRoomClearedOnTypeChange({ previousRoomId: roomId, unassignedValue: UNASSIGNED })
    ) {
      toast.warning(CREATE_RESERVATION_ROOM_TYPE_CHANGE_WARN);
    }
    setRoomTypeId(type.roomTypeId);
    setSelectedRoomType({
      roomTypeId: type.roomTypeId,
      name: type.name,
      code: type.code,
      maxOccupancy: type.maxOccupancy,
      adultCapacity: type.adultCapacity,
      childCapacity: type.childCapacity,
    });
    setRoomId(UNASSIGNED);
    setSelectedAssignedRoom(null);
    setRatePlanId("");
  }

  function handleRoomChange(nextId: string) {
    setRoomId(nextId);
    if (nextId === UNASSIGNED) {
      setSelectedAssignedRoom(null);
      return;
    }
    const room = rooms.find((row) => row.id === nextId);
    if (room) {
      setSelectedAssignedRoom({ id: room.id, roomNumber: room.roomNumber, floor: room.floor });
    }
  }

  function requestTypeChange(next: ReservationTypeMode) {
    if (next === reservationType) return;
    setPendingType(next);
  }

  function applyTypeChange() {
    if (!pendingType) return;
    setReservationType(pendingType);
    setCompanyMaster(null);
    setTravelAgentMaster(null);
    setCompanyOverride(false);
    setTravelAgentOverride(false);
    setPendingType(null);
  }

  function handleCompanyMasterChange(next: PickedReservationMaster | null) {
    setCompanyMaster(next);
    setCompanyOverride(true);
  }

  function handleTravelAgentMasterChange(next: PickedReservationMaster | null) {
    setTravelAgentMaster(next);
    setTravelAgentOverride(true);
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-3" data-testid="create-reservation-actions">
      <div className="flex flex-wrap items-center gap-3" data-testid="create-as-status">
        <Button
          variant="outline"
          disabled={!canSubmit || create.isPending}
          data-testid="save-as-pending"
          onClick={() => {
            setStatus("pending");
            create.mutate("pending");
          }}
        >
          {create.isPending && status === "pending"
            ? "Creating…"
            : CREATE_RESERVATION_PENDING_LABEL}
        </Button>
        <Button
          disabled={!canSubmitConfirm || create.isPending}
          data-testid="confirm-guarantee"
          onClick={() => {
            setStatus("confirmed");
            create.mutate("confirmed");
          }}
        >
          {create.isPending && status === "confirmed"
            ? "Creating…"
            : CREATE_RESERVATION_CONFIRM_LABEL}
        </Button>
      </div>
      {embedded ? null : onCancel ? (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button asChild variant="outline">
          <Link to="/restaurant/pms/reservations">Cancel</Link>
        </Button>
      )}
      {!canSubmit && pendingBlockCopy ? (
        <p className="text-xs text-muted-foreground" data-testid="pending-block-copy">
          {pendingBlockCopy}
        </p>
      ) : null}
      {!canSubmitConfirm && confirmBlockCopy ? (
        <p className="text-xs text-muted-foreground" data-testid="confirm-block-copy">
          {confirmBlockCopy}
        </p>
      ) : null}
    </div>
  );

  const staySection = (
    <WorkspaceCard>
      <CreateReservationStay
        arrival={arrival}
        departure={departure}
        nights={nights}
        datesValid={datesValid}
        adults={adults}
        children={children}
        specialRequests={specialRequests}
        notes={notes}
        occupancyWarn={
          selectedMeta ? (
            <OccupancySoftWarn
              adults={adults}
              childCount={children}
              maxOccupancy={selectedMeta.maxOccupancy}
              testId="stay-occupancy-warn"
            />
          ) : null
        }
        onArrivalChange={handleArrivalChange}
        onDepartureChange={handleDepartureChange}
        onNightsChange={handleNightsChange}
        onAdultsChange={setAdults}
        onChildrenChange={setChildren}
        onSpecialRequestsChange={setSpecialRequests}
        onNotesChange={setNotes}
      />
    </WorkspaceCard>
  );

  const guestSection = (
    <div className="space-y-4">
      <WorkspaceCard>
        <CreateReservationContext
          restaurantId={restaurantId}
          canCreateMaster={guestAccessQuery.data?.canManage ?? false}
          reservationType={reservationType}
          onRequestTypeChange={requestTypeChange}
          bookingSource={bookingSource}
          onBookingSourceChange={setBookingSource}
          sourceOptions={sourceOptions}
          marketSegment={marketSegment}
          onMarketSegmentChange={setMarketSegment}
          segmentOptions={segmentOptions}
          externalReference={externalReference}
          onExternalReferenceChange={setExternalReference}
          bookingAgentName={bookingAgentName}
          companyMaster={companyMaster}
          onCompanyMasterChange={handleCompanyMasterChange}
          travelAgentMaster={travelAgentMaster}
          onTravelAgentMasterChange={handleTravelAgentMasterChange}
        />
      </WorkspaceCard>
      <div
        className={cn(
          "grid gap-4",
          reservationType === "individual" ? "lg:grid-cols-2 lg:items-start" : "",
        )}
      >
        <WorkspaceCard>
          <CreateReservationGuest
            restaurantId={restaurantId}
            canCreateGuest={guestAccessQuery.data?.canManage ?? false}
            guest={guest}
            onGuestChange={setGuest}
          />
        </WorkspaceCard>
        {reservationType === "individual" ? (
          <WorkspaceCard>
            <CreateReservationAssociations
              restaurantId={restaurantId}
              canCreateMaster={guestAccessQuery.data?.canManage ?? false}
              companyMaster={companyMaster}
              onCompanyMasterChange={handleCompanyMasterChange}
              travelAgentMaster={travelAgentMaster}
              onTravelAgentMasterChange={handleTravelAgentMasterChange}
            />
          </WorkspaceCard>
        ) : null}
      </div>
    </div>
  );

  const roomSection = (
    <div className="space-y-4">
      <WorkspaceCard>
        <CreateReservationRoomType
          datesValid={datesValid}
          loading={availabilityQuery.isLoading}
          availability={availability}
          roomTypeId={roomTypeId}
          adults={adults}
          childCount={children}
          selectedMaxOccupancy={selectedMeta?.maxOccupancy}
          onSelect={selectRoomType}
        />
      </WorkspaceCard>
      <WorkspaceCard>
        <CreateReservationRoomAssignment
          title="Room assignment (optional)"
          emptyCopy="No free rooms of this type for those dates — the stay can still be booked and assigned later."
          datesValid={datesValid}
          roomTypeId={roomTypeId}
          loading={roomsQuery.isLoading || roomsQuery.isFetching}
          rooms={rooms}
          roomId={roomId}
          unassignedValue={UNASSIGNED}
          onSelect={handleRoomChange}
        />
      </WorkspaceCard>
      <WorkspaceCard>
        <CreateReservationRate
          datesValid={datesValid}
          roomTypeId={roomTypeId}
          loading={quotesQuery.isLoading || quotesQuery.isFetching}
          error={quotesQuery.isError}
          quotes={quotes}
          ratePlanId={ratePlanId}
          canCreateUnpriced={canCreateUnpriced}
          money={money}
          onSelect={setRatePlanId}
        />
      </WorkspaceCard>
    </div>
  );

  const addonsSection = (
    <div className="space-y-4">
      <WorkspaceCard>
        <CreateReservationPackages
          loading={set3Query.isLoading || set3Query.isFetching}
          error={set3Query.isError}
          packagesAvailable={set3Query.data?.snapshot.packagesAvailable ?? false}
          activePackageCount={activePackageCountFromRows(set3Query.data?.snapshot.packages ?? [])}
          canEditSet3={set3Query.data?.canEdit ?? false}
        />
      </WorkspaceCard>
      <WorkspaceCard>
        <CreateReservationGuarantee
          guaranteeMethod={guaranteeMethod}
          options={guaranteeOptions}
          catalogueWarning={guaranteeWarning}
          persistApplied={persistApplied}
          companyName={companyMaster?.name ?? null}
          companyTerms={companyMaster?.paymentTerms ?? null}
          travelAgentName={travelAgentMaster?.name ?? null}
          travelAgentTerms={travelAgentMaster?.paymentTerms ?? null}
          onGuaranteeMethodChange={setGuaranteeMethod}
        />
      </WorkspaceCard>
    </div>
  );

  const reviewSection = (
    <WorkspaceCard>
      <h2 className="font-display text-lg text-[#251605]">Review and Confirm</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Check stay, guest, room and rate in the summary, then create as pending or confirmed.
      </p>
    </WorkspaceCard>
  );

  const stepSections = [staySection, guestSection, roomSection, addonsSection, reviewSection];
  const currentStep = CREATE_WORKFLOW_STEPS[workflowStep] ?? CREATE_WORKFLOW_STEPS[0];
  const mainContent = embedded ? (
    stepSections[workflowStep]
  ) : (
    <div className="space-y-4">
      {embedded ? null : (
        <div>
          <h1 className="font-display text-2xl">New Reservation</h1>
          <p className="text-sm text-muted-foreground">
            Create a stay for {membership.restaurant.name}. Availability updates as you change the
            dates.
          </p>
        </div>
      )}
      {staySection}
      {guestSection}
      {roomSection}
      {addonsSection}
    </div>
  );

  const summaryCard = (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg">Summary</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
          <dd>{RESERVATION_TYPE_LABELS[reservationType]}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guest</dt>
          <dd>{guest?.fullName ?? "No guest selected"}</dd>
        </div>
        {reservationType === "individual" ? (
          <div data-testid="summary-associations">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Associations</dt>
            <dd className="space-y-1">
              <p data-testid="summary-company">
                <span className="text-muted-foreground">Company · </span>
                {companyMaster?.name ?? "None"}
              </p>
              <p data-testid="summary-ta">
                <span className="text-muted-foreground">Travel Agency · </span>
                {travelAgentMaster?.name ?? "None"}
              </p>
            </dd>
          </div>
        ) : null}
        {reservationType === "corporate" ? (
          <div data-testid="summary-company">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company</dt>
            <dd>{companyMaster?.name ?? "Not selected"}</dd>
          </div>
        ) : null}
        {reservationType === "travel_agency" ? (
          <div data-testid="summary-ta">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Travel Agency</dt>
            <dd>{travelAgentMaster?.name ?? "Not selected"}</dd>
          </div>
        ) : null}
        <div data-testid="summary-stay">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
          <dd data-testid="summary-stay-dates">
            {datesValid
              ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}`
              : "Dates not set"}
          </dd>
        </div>
        {datesValid ? (
          <div data-testid="summary-stay-nights">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nights</dt>
            <dd>{nights}</dd>
          </div>
        ) : null}
        <div data-testid="summary-stay-occupancy">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Occupancy</dt>
          <dd>{formatStayOccupancySummary(adults, children)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room type</dt>
          <dd data-testid="summary-room-type">{stickyRoomTypeLabel(selectedMeta)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Availability</dt>
          <dd data-testid="summary-availability">{stickyAvailabilityCopy(summaryAvailability)}</dd>
        </div>
        <div data-testid="summary-room">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room</dt>
          <dd data-testid="summary-room-assignment">
            {stickyRoomAssignmentLabel({
              roomTypeId,
              roomId,
              unassignedValue: UNASSIGNED,
              room: selectedAssignedRoom,
            })}
          </dd>
        </div>
        {pricingState.kind === "priced" ? (
          <>
            <div data-testid="summary-rate">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rate</dt>
              <dd data-testid="summary-rate-code">
                {pricingState.quote.ratePlanCode}
                {pricingState.quote.ratePlanName ? ` · ${pricingState.quote.ratePlanName}` : ""}
              </dd>
            </div>
            <div data-testid="summary-rate-and-total">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Rate & Total
              </dt>
              <dd>
                {pricingState.quote.nights} night{pricingState.quote.nights === 1 ? "" : "s"}
                {fromNightlyRate(pricingState.quote) != null
                  ? ` · from ${money(fromNightlyRate(pricingState.quote)!)} / night`
                  : ""}
              </dd>
            </div>
            <div data-testid="summary-stay-total">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay total</dt>
              <dd>
                {money(pricingState.quote.subtotal)}
                {pricingState.quote.currency ? ` ${pricingState.quote.currency}` : ""}
              </dd>
            </div>
          </>
        ) : null}
        <div data-testid="summary-source">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Booking source</dt>
          <dd>
            {sourceOptions.find((row) => row.value === bookingSource)?.label ??
              (bookingSource || "Not selected")}
          </dd>
        </div>
        <div data-testid="summary-segment">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Market segment</dt>
          <dd>
            {segmentOptions.find((row) => row.value === marketSegment)?.label ??
              (marketSegment || "Not selected")}
          </dd>
        </div>
        {externalReference.trim() ? (
          <div data-testid="summary-external-ref">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              External reference
            </dt>
            <dd>{externalReference.trim()}</dd>
          </div>
        ) : null}
        <div data-testid="summary-guarantee">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guarantee</dt>
          <dd>
            {guaranteeOptions.find((row) => row.value === guaranteeMethod)?.label ??
              (guaranteeMethod || "Not selected")}
          </dd>
        </div>
        {paymentTermsReviewCopy({
          companyName: companyMaster?.name ?? null,
          companyTerms: companyMaster?.paymentTerms ?? null,
          travelAgentName: travelAgentMaster?.name ?? null,
          travelAgentTerms: travelAgentMaster?.paymentTerms ?? null,
        }) ? (
          <div data-testid="summary-payment-terms">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payment terms</dt>
            <dd>
              {paymentTermsReviewCopy({
                companyName: companyMaster?.name ?? null,
                companyTerms: companyMaster?.paymentTerms ?? null,
                travelAgentName: travelAgentMaster?.name ?? null,
                travelAgentTerms: travelAgentMaster?.paymentTerms ?? null,
              })}
            </dd>
          </div>
        ) : null}
      </dl>
      {pricingState.kind !== "priced" ? (
        <div className="mt-3" data-testid="summary-pricing-state" data-pricing={pricingState.kind}>
          {pricingState.kind === "unpriced" ? (
            <span
              data-testid="summary-unpriced-badge"
              className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
            >
              Unpriced
            </span>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground" data-testid="summary-no-fake-total">
            {stickyPricingCopy(pricingState)}
          </p>
        </div>
      ) : null}
      {selectedMeta ? (
        <div className="mt-3">
          <OccupancySoftWarn
            adults={adults}
            childCount={children}
            maxOccupancy={selectedMeta.maxOccupancy}
            testId="summary-occupancy-warn"
          />
        </div>
      ) : null}
      <div className="mt-3" data-testid="summary-packages">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Packages</p>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="summary-packages-honesty">
          {stickyPackagesCopy()}
        </p>
      </div>
    </section>
  );

  const typeWarn = (
    <AlertDialog open={pendingType !== null} onOpenChange={(open) => !open && setPendingType(null)}>
      <AlertDialogContent className="z-[70]" data-testid="type-change-warn">
        <AlertDialogHeader>
          <AlertDialogTitle>Change reservation type?</AlertDialogTitle>
          <AlertDialogDescription>{CREATE_RESERVATION_TYPE_CHANGE_WARN}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep current type</AlertDialogCancel>
          <AlertDialogAction onClick={applyTypeChange}>Switch type</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <CreateWorkflowStepper
          steps={CREATE_WORKFLOW_STEPS}
          current={workflowStep}
          onSelect={setWorkflowStep}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-[3]">{mainContent}</div>
          <aside
            className="min-w-0 flex-1 space-y-4 xl:sticky xl:top-4 xl:max-w-[28%]"
            data-testid="create-reservation-summary"
          >
            {summaryCard}
          </aside>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-white px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            {workflowStep > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWorkflowStep((step) => step - 1)}
              >
                ← Back
              </Button>
            ) : null}
          </div>
          {workflowStep < CREATE_WORKFLOW_STEPS.length - 1 ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              onClick={() => setWorkflowStep((step) => step + 1)}
            >
              {currentStep.continueLabel} →
            </Button>
          ) : (
            actions
          )}
        </div>
        {typeWarn}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        {mainContent}
        <div className="xl:hidden">{actions}</div>
      </div>
      <aside
        className="space-y-4 xl:sticky xl:top-4 xl:w-80"
        data-testid="create-reservation-summary"
      >
        {summaryCard}
        <div className="hidden xl:block">{actions}</div>
      </aside>
      {typeWarn}
    </div>
  );
}

function WorkspaceCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
      {children}
    </section>
  );
}

function CreateWorkflowStepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly { id: string; label: string; continueLabel: string | null }[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav
      className="shrink-0 overflow-x-auto border-b border-[#DDD4C5] bg-white px-4 py-3"
      aria-label="Create reservation workflow"
      data-testid="create-reservation-stepper"
    >
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((step, index) => {
          const active = index === current;
          const completed = index < current;
          return (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 ? <span className="h-px w-8 bg-[#DDD4C5]" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => onSelect(index)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2 py-1 text-sm",
                  active ? "font-medium text-[#251605]" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[11px]",
                    active || completed
                      ? "bg-[#C89933] text-[#251605]"
                      : "bg-[#EFE8DC] text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className={cn(active && "border-b-2 border-[#C89933] pb-0.5")}>
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
