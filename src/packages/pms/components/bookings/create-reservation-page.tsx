import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
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
import {
  CreateReservationPoliciesGuarantee,
  EMPTY_CREATE_RESERVATION_POLICIES,
  stayPolicyLabel,
} from "@/packages/pms/components/bookings/create-reservation-policies-guarantee";
import { CreateReservationConfirmation } from "@/packages/pms/components/bookings/create-reservation-confirmation";
import { CreateReservationBookingDetails } from "@/packages/pms/components/bookings/create-reservation-booking-details";
import { CreateReservationReview } from "@/packages/pms/components/bookings/create-reservation-review";

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
  toPickedGuest,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { CreateReservationStay } from "@/packages/pms/components/bookings/create-reservation-stay";
import { CreateReservationSearchCriteria } from "@/packages/pms/components/bookings/create-reservation-search-criteria";
import { CreateReservationAlternatives } from "@/packages/pms/components/bookings/create-reservation-alternatives";
import {
  getGuest,
  getGuestReservationPreferenceDefaults,
  getGuestsAccess,
} from "@/packages/pms/lib/guests.functions";
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
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { getCurrencyCard3 } from "@/packages/pms/lib/currency-card3.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getPmsSet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest.functions";
import { getPmsPolish1Snapshot } from "@/packages/pms/lib/pms-polish1-payment-admin.functions";
import { getPaymentsCard3 } from "@/packages/pms/lib/payments-card3.functions";
import {
  activeDepositPolicies,
  computeDepositRequirementAmount,
  defaultActiveDepositPolicy,
  defaultDepositPolicyHint,
  formatQuotedPolicySummary,
  quotedNonRefundable,
  resolveDepositTenderCode,
} from "@/packages/pms/lib/create-reservation-step4";
import {
  getGuestAccount,
  listGuestAccountLinks,
} from "@/packages/pms/lib/guest-accounts.functions";
import {
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_MIN_NIGHTS,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
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
  canAdvanceFromBookingDetails,
  resolveSalesChannelOptions,
} from "@/packages/pms/lib/create-reservation-step3";
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
import { useRestaurantTimezone } from "@/core/state/property-format";
import { formatMoney } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";

const UNASSIGNED = "unassigned";

/* Source-lock identifiers remain in this file:
   CREATE_RESERVATION_SECTION1_SCOPE CREATE_RESERVATION_SECTION2_SCOPE CREATE_RESERVATION_SECTION2A_SCOPE
   CREATE_RESERVATION_SECTION3_SCOPE CREATE_RESERVATION_SECTION5_SCOPE CREATE_RESERVATION_SECTION6_SCOPE
   CREATE_RESERVATION_SECTION7_SCOPE CREATE_RESERVATION_SECTION8_SCOPE
*/
const CREATE_WORKFLOW_STEPS = [
  { id: "guest-stay", label: "Guest & Stay", continueLabel: "Search Availability" },
  { id: "availability", label: "Availability", continueLabel: "Continue to Booking Details" },
  { id: "details", label: "Booking Details", continueLabel: "Continue to Policies & Guarantee" },
  { id: "policies", label: "Policies & Guarantee", continueLabel: "Continue to Review & Confirm" },
  { id: "review", label: "Review & Confirm", continueLabel: null },
] as const;

export function CreateReservationPage({
  membership,
  embedded = false,
  initialGuestId = null,
  initialCompanyMasterId = null,
  initialTravelAgentMasterId = null,
  initialGroupMasterId = null,
  pmsGroupId = null,
  pmsGroupBlockId = null,
  returnToLabel,
  onCancel,
  onCreated,
  onOpenCreatedReservation,
  onReturnToDesk,
}: {
  membership: RestaurantMembership;
  embedded?: boolean;
  initialGuestId?: string | null;
  initialCompanyMasterId?: string | null;
  initialTravelAgentMasterId?: string | null;
  initialGroupMasterId?: string | null;
  pmsGroupId?: string | null;
  pmsGroupBlockId?: string | null;
  returnToLabel?: string | undefined;
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
  const fetchGuest = useServerFn(getGuest);
  const fetchGuestPrefDefaults = useServerFn(getGuestReservationPreferenceDefaults);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const fetchSet3 = useServerFn(getPmsSet3Snapshot);
  const fetchPolish1 = useServerFn(getPmsPolish1Snapshot);
  const fetchPaymentsCard3 = useServerFn(getPaymentsCard3);
  const fetchGuestLinks = useServerFn(listGuestAccountLinks);
  const fetchGuestAccount = useServerFn(getGuestAccount);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitReservation = useServerFn(createReservation);
  const fetchQuotes = useServerFn(quoteStay);
  const fetchRoomTypes = useServerFn(listRoomTypes);
  const fetchCurrencies = useServerFn(getCurrencyCard3);
  const queryClient = useQueryClient();

  const [reservationType, setReservationType] = useState<ReservationTypeMode>("individual");
  const [pendingType, setPendingType] = useState<ReservationTypeMode | null>(null);
  const [bookingSource, setBookingSource] = useState("");
  const [marketSegment, setMarketSegment] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [guest, setGuest] = useState<PickedReservationGuest | null>(null);
  const [companyMaster, setCompanyMaster] = useState<PickedReservationMaster | null>(null);
  const [travelAgentMaster, setTravelAgentMaster] = useState<PickedReservationMaster | null>(null);
  const [groupMaster, setGroupMaster] = useState<PickedReservationMaster | null>(null);
  const [companyOverride, setCompanyOverride] = useState(false);
  const [travelAgentOverride, setTravelAgentOverride] = useState(false);
  const [groupOverride, setGroupOverride] = useState(false);
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [roomsRequested, setRoomsRequested] = useState(1);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState<SelectedRoomTypeMeta | null>(null);
  const [roomId, setRoomId] = useState(UNASSIGNED);
  const [selectedAssignedRoom, setSelectedAssignedRoom] = useState<AssignedRoomView | null>(null);
  const [specialRequests, setSpecialRequests] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"pending" | "confirmed">("pending");
  const [ratePlanId, setRatePlanId] = useState("");
  const [guaranteeMethod, setGuaranteeMethod] = useState("");
  const [step4Policies, setStep4Policies] = useState(EMPTY_CREATE_RESERVATION_POLICIES);
  const [createdView, setCreatedView] = useState<CreatedReservationConfirmation | null>(null);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [searchRoomTypeFilter, setSearchRoomTypeFilter] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [salesChannel, setSalesChannel] = useState("");
  const [purposeOfStay, setPurposeOfStay] = useState("");
  const [billingRuleId, setBillingRuleId] = useState("");
  const [companyContactId, setCompanyContactId] = useState("");
  const [travelAgentContactId, setTravelAgentContactId] = useState("");
  const [sameAsGuest, setSameAsGuest] = useState(true);
  const [linkedGroupId, setLinkedGroupId] = useState<string | null>(pmsGroupId);
  const [linkedBlockId, setLinkedBlockId] = useState<string | null>(pmsGroupBlockId);

  useEffect(() => {
    setLinkedGroupId(pmsGroupId);
    setLinkedBlockId(pmsGroupBlockId);
  }, [pmsGroupId, pmsGroupBlockId]);

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

  const initialGuestQuery = useQuery({
    queryKey: ["initial-reservation-guest", restaurantId, initialGuestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: initialGuestId! } }),
    enabled: canManage && Boolean(initialGuestId) && !guest,
    staleTime: 60_000,
  });

  const initialCompanyQuery = useQuery({
    queryKey: ["initial-reservation-company", restaurantId, initialCompanyMasterId],
    queryFn: () => fetchGuestAccount({ data: { restaurantId, accountId: initialCompanyMasterId! } }),
    enabled: canManage && Boolean(initialCompanyMasterId) && !companyMaster && !companyOverride,
    staleTime: 60_000,
  });

  const initialTravelAgentQuery = useQuery({
    queryKey: ["initial-reservation-travel-agent", restaurantId, initialTravelAgentMasterId],
    queryFn: () => fetchGuestAccount({ data: { restaurantId, accountId: initialTravelAgentMasterId! } }),
    enabled: canManage && Boolean(initialTravelAgentMasterId) && !travelAgentMaster && !travelAgentOverride,
    staleTime: 60_000,
  });

  const initialGroupQuery = useQuery({
    queryKey: ["initial-reservation-group", restaurantId, initialGroupMasterId],
    queryFn: () => fetchGuestAccount({ data: { restaurantId, accountId: initialGroupMasterId! } }),
    enabled: canManage && Boolean(initialGroupMasterId) && !groupMaster && !groupOverride,
    staleTime: 60_000,
  });

  const initialPrefQuery = useQuery({
    queryKey: ["initial-guest-preferences", restaurantId, guest?.id],
    queryFn: () => fetchGuestPrefDefaults({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && Boolean(guest?.id),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (initialGuestQuery.data?.guest && !guest) {
      setGuest(toPickedGuest(initialGuestQuery.data.guest));
    }
  }, [initialGuestQuery.data, guest]);

  useEffect(() => {
    if (!initialCompanyMasterId || companyOverride || companyMaster) return;
    const rawAccount = initialCompanyQuery.data;
    if (!rawAccount) return;
    const account: Omit<NonNullable<typeof rawAccount>, "accountStatus"> & {
      accountStatus: string;
    } = rawAccount;

    const isCompanyType = account.accountType === "company";
    const isNotAnonymized = !account.anonymisedAt;
    const isOperational = account.accountStatus !== "deleted";

    if (isCompanyType && isNotAnonymized && isOperational) {
      setCompanyMaster(toPickedReservationMaster(account));
      setReservationType((prev) => (prev === "individual" ? "corporate" : prev));
    }
  }, [
    initialCompanyMasterId,
    companyOverride,
    companyMaster,
    initialCompanyQuery.data,
  ]);

  useEffect(() => {
    if (!initialTravelAgentMasterId || travelAgentOverride || travelAgentMaster) return;
    const rawAccount = initialTravelAgentQuery.data;
    if (!rawAccount) return;
    const account: Omit<NonNullable<typeof rawAccount>, "accountStatus"> & {
      accountStatus: string;
    } = rawAccount;

    const isTravelAgentType = account.accountType === "travel_agent";
    const isNotAnonymized = !account.anonymisedAt;
    const isOperational = account.accountStatus !== "deleted";

    if (isTravelAgentType && isNotAnonymized && isOperational) {
      setTravelAgentMaster(toPickedReservationMaster(account));
      setReservationType((prev) => (prev === "individual" ? "travel_agency" : prev));
    }
  }, [
    initialTravelAgentMasterId,
    travelAgentOverride,
    travelAgentMaster,
    initialTravelAgentQuery.data,
  ]);

  useEffect(() => {
    if (!initialGroupMasterId || groupOverride || groupMaster) return;
    const rawAccount = initialGroupQuery.data;
    if (!rawAccount) return;
    const account: Omit<NonNullable<typeof rawAccount>, "accountStatus"> & {
      accountStatus: string;
    } = rawAccount;

    const isGroupType = account.accountType === "group";
    const isNotAnonymized = !account.anonymisedAt;
    const isOperational = account.accountStatus !== "deleted" && account.accountStatus !== "inactive";

    if (isGroupType && isNotAnonymized && isOperational) {
      setGroupMaster(toPickedReservationMaster(account));
    }
  }, [
    initialGroupMasterId,
    groupOverride,
    groupMaster,
    initialGroupQuery.data,
  ]);

  useEffect(() => {
    if (initialPrefQuery.data?.applyToFutureReservations && initialPrefQuery.data.specialRequests) {
      setSpecialRequests((prev) => (prev ? prev : (initialPrefQuery.data.specialRequests ?? "")));
    }
  }, [initialPrefQuery.data]);

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
  const salesChannelOptions = resolveSalesChannelOptions(set6Query.data?.snapshot.salesChannels);

  const polish1Query = useQuery({
    queryKey: ["pms-polish1-snapshot", restaurantId, "create-reservation-guarantee"],
    queryFn: () => fetchPolish1({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const paymentsCard3Query = useQuery({
    queryKey: ["pms-payments-card3", restaurantId, "create-reservation-deposit-hint"],
    queryFn: () => fetchPaymentsCard3({ data: { restaurantId } }),
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
    queryKey: [
      "stay-quotes",
      restaurantId,
      roomTypeId,
      arrival,
      departure,
      roomsRequested,
      adults,
      children,
      infants,
      quoteCurrency,
    ],
    queryFn: () =>
      fetchQuotes({
        data: {
          restaurantId,
          roomTypeId,
          arrival,
          departure,
          rooms: roomsRequested,
          adults,
          children,
          infants,
          quoteCurrency: quoteCurrency || null,
        },
      }),
    enabled: canManage && datesValid && !!roomTypeId,
    retry: false,
  });
  const quotes = quotesQuery.data ?? [];
  const selectedQuote = quotes.find((q) => q.plan.id === ratePlanId) ?? null;
  const roomCatalogQuery = useQuery({
    queryKey: ["create-reservation-room-catalog", restaurantId],
    queryFn: () => fetchRoomTypes({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const currencyQuery = useQuery({
    queryKey: ["create-reservation-currencies", restaurantId],
    queryFn: () => fetchCurrencies({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const catalogQuoteQueries = useQueries({
    queries: (availabilityQuery.data ?? []).map((row) => ({
      queryKey: [
        "stay-quotes",
        restaurantId,
        row.roomTypeId,
        arrival,
        departure,
        roomsRequested,
        adults,
        children,
        infants,
        quoteCurrency,
      ],
      queryFn: () =>
        fetchQuotes({
          data: {
            restaurantId,
            roomTypeId: row.roomTypeId,
            arrival,
            departure,
            rooms: roomsRequested,
            adults,
            children,
            infants,
            quoteCurrency: quoteCurrency || null,
          },
        }),
      enabled: canManage && datesValid,
      retry: false,
    })),
  });
  const roomTypeCatalog = useMemo(() => {
    const map: Record<
      string,
      {
        description: string | null;
        bedType: string | null;
        roomSize: string | null;
        roomView: string | null;
        coverUrl: string | null;
      }
    > = {};
    for (const type of roomCatalogQuery.data ?? []) {
      map[type.id] = {
        description: type.description,
        bedType: type.beds[0]?.bedType ?? type.bedType,
        roomSize: type.roomSize,
        roomView: type.roomView,
        coverUrl: type.coverUrl,
      };
    }
    return map;
  }, [roomCatalogQuery.data]);
  const propertyCurrencyCode =
    currencyQuery.data?.snapshot.inherited.baseCurrency || membership.restaurant.currencyCode;
  const depositPolicyHint = defaultDepositPolicyHint(
    paymentsCard3Query.data?.snapshot.depositPolicies,
    paymentsCard3Query.data?.snapshot.currencyCode || propertyCurrencyCode,
  );
  const depositPolicyOptions = activeDepositPolicies(
    paymentsCard3Query.data?.snapshot.depositPolicies,
  );
  const selectedDepositPolicy =
    depositPolicyOptions.find((row) => row.id === step4Policies.depositPolicyId) ?? null;

  useEffect(() => {
    const fallback = defaultActiveDepositPolicy(paymentsCard3Query.data?.snapshot.depositPolicies);
    if (!fallback) return;
    setStep4Policies((current) =>
      current.depositPolicyId ? current : { ...current, depositPolicyId: fallback.id },
    );
  }, [paymentsCard3Query.data?.snapshot.depositPolicies]);
  const currencyOptions = useMemo(() => {
    const extras = (currencyQuery.data?.snapshot.currencies ?? [])
      .filter((row) => row.active)
      .map((row) => ({ code: row.code, name: row.name }));
    const options = [...extras];
    if (propertyCurrencyCode && !options.some((row) => row.code === propertyCurrencyCode)) {
      options.unshift({ code: propertyCurrencyCode, name: propertyCurrencyCode });
    }
    return options;
  }, [currencyQuery.data, propertyCurrencyCode]);
  const displayCurrencyCode = quoteCurrency || propertyCurrencyCode;
  const money = useMemo(
    () => (value: number) => formatMoney(value, displayCurrencyCode || propertyCurrencyCode),
    [displayCurrencyCode, propertyCurrencyCode],
  );
  const selectedCurrencyName =
    currencyOptions.find((row) => row.code === displayCurrencyCode)?.name ?? displayCurrencyCode;
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
          infants,
          rooms: roomsRequested,
          quoteCurrency: null,
          specialRequests: specialRequests.trim() || null,
          notes: notes.trim() || null,
          status: nextStatus,
          ratePlanId: ratePlanId || null,
          companyMasterId: boundMasters.companyMasterId,
          travelAgentMasterId: boundMasters.travelAgentMasterId,
          groupAccountMasterId: groupMaster?.id ?? (initialGroupMasterId || null),
          commercialBookingSource: bookingSource.trim() || null,
          marketSegment: marketSegment.trim() || null,
          externalReference: externalReference.trim() || null,
          guaranteeMethod: guaranteeMethod.trim() || null,
          requireGuarantee: nextStatus === "confirmed",
          reservationType,
          pmsGroupId: linkedGroupId,
          pmsGroupBlockId: linkedBlockId,
          commercialSalesChannel: salesChannel.trim() || null,
          purposeOfStay: purposeOfStay.trim() || null,
          billingRuleId: billingRuleId || null,
          companyContactId: companyContactId || null,
          travelAgentContactId: travelAgentContactId || null,
          bookerGuestId: sameAsGuest && guest?.id ? guest.id : null,
          depositPolicyId: step4Policies.depositPolicyId || null,
          depositTenderCode: resolveDepositTenderCode({
            selected: step4Policies.depositPaymentMethod,
            guaranteeMethod,
          }),
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
        returnToLabel={returnToLabel}
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
  const detailsQuoteIdentity = {
    roomTypeId,
    arrival,
    departure,
    rooms: roomsRequested,
    adults,
    children,
    infants,
    quoteCurrency: displayCurrencyCode,
    ratePlanId,
  };
  const quotedIdentity = selectedQuote?.quote
    ? {
        roomTypeId,
        arrival,
        departure,
        rooms: roomsRequested,
        adults,
        children,
        infants,
        quoteCurrency: selectedQuote.quote.currency || displayCurrencyCode,
        ratePlanId: selectedQuote.quote.ratePlanId,
      }
    : null;
  const canContinueBookingDetails = canAdvanceFromBookingDetails({
    quotesFetching: quotesQuery.isFetching,
    roomTypeId,
    occupancyOk,
    priced,
    canCreateUnpriced,
    submitted: detailsQuoteIdentity,
    quoted: quotedIdentity,
  });
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
  const catalogRow = roomTypeId ? (roomTypeCatalog[roomTypeId] ?? null) : null;
  const summaryAvailability = stickyAvailability({
    roomTypeId,
    datesValid,
    loading: availabilityQuery.isLoading || availabilityQuery.isFetching,
    live: selectedType,
  });

  function applyRoomType(type: RoomTypeAvailability) {
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
  }

  function selectRoomType(type: RoomTypeAvailability) {
    applyRoomType(type);
    setRatePlanId("");
  }

  function selectRoomAndRate(type: RoomTypeAvailability, planId: string) {
    if (type.roomTypeId !== roomTypeId) applyRoomType(type);
    setRatePlanId(planId);
  }

  function quotesForRoomType(id: string) {
    if (id === roomTypeId) return quotes;
    const index = availability.findIndex((row) => row.roomTypeId === id);
    return catalogQuoteQueries[index]?.data ?? [];
  }

  function quotesLoadingForRoomType(id: string) {
    if (id === roomTypeId) return quotesQuery.isLoading || quotesQuery.isFetching;
    const index = availability.findIndex((row) => row.roomTypeId === id);
    const query = catalogQuoteQueries[index];
    return Boolean(query?.isLoading || query?.isFetching);
  }

  function quotesErrorForRoomType(id: string) {
    if (id === roomTypeId) return quotesQuery.isError;
    const index = availability.findIndex((row) => row.roomTypeId === id);
    return Boolean(catalogQuoteQueries[index]?.isError);
  }

  function modifyAvailabilitySearch() {
    void queryClient.invalidateQueries({ queryKey: ["room-type-availability", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["stay-quotes", restaurantId] });
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
    setCompanyContactId("");
    setTravelAgentContactId("");
    setCompanyOverride(false);
    setTravelAgentOverride(false);
    setPendingType(null);
  }

  function handleCompanyMasterChange(next: PickedReservationMaster | null) {
    setCompanyMaster(next);
    setCompanyOverride(true);
    setCompanyContactId("");
  }

  function handleTravelAgentMasterChange(next: PickedReservationMaster | null) {
    setTravelAgentMaster(next);
    setTravelAgentOverride(true);
    setTravelAgentContactId("");
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

  const preferenceExtras = (
    <>
      <div className="min-w-0 space-y-1">
        <label className="text-sm font-medium" htmlFor="room-type-preference">
          Room Type Preference
        </label>
        <select
          id="room-type-preference"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={roomTypeId}
          disabled={!datesValid || availability.length === 0}
          onChange={(event) => {
            const next = availability.find((row) => row.roomTypeId === event.target.value);
            if (next) selectRoomType(next);
          }}
        >
          <option value="">Select room type</option>
          {availability.map((row) => (
            <option key={row.roomTypeId} value={row.roomTypeId}>
              {row.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 space-y-1">
        <label className="text-sm font-medium" htmlFor="rate-preference">
          Rate Preference
        </label>
        <select
          id="rate-preference"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={ratePlanId}
          disabled={!roomTypeId || quotes.length === 0}
          onChange={(event) => setRatePlanId(event.target.value)}
        >
          <option value="">Select rate plan</option>
          {quotes.map((row) => (
            <option key={row.plan.id} value={row.plan.id} disabled={!row.quote}>
              {row.plan.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const staySection = (
    <WorkspaceCard>
      <CreateReservationStay
        title="Stay request"
        arrival={arrival}
        departure={departure}
        nights={nights}
        datesValid={datesValid}
        adults={adults}
        children={children}
        rooms={roomsRequested}
        onRoomsChange={setRoomsRequested}
        requestExtras={preferenceExtras}
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
        infants={infants}
        onInfantsChange={setInfants}
        onSpecialRequestsChange={setSpecialRequests}
        onNotesChange={setNotes}
        showNotes={false}
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

  const roomsAndRates = (
    <CreateReservationRoomType
      datesValid={datesValid}
      loading={availabilityQuery.isLoading}
      availability={availability}
      roomTypeId={roomTypeId}
      adults={adults}
      childCount={children}
      selectedMaxOccupancy={selectedMeta?.maxOccupancy}
      catalog={roomTypeCatalog}
      filterRoomTypeId={searchRoomTypeFilter}
      currencyCode={displayCurrencyCode}
      currencyName={selectedCurrencyName}
      currencyOptions={currencyOptions}
      onCurrencyChange={setQuoteCurrency}
      onSelect={selectRoomType}
      renderRates={(type) => (
        <CreateReservationRate
          datesValid={datesValid}
          roomTypeId={type.roomTypeId}
          loading={quotesLoadingForRoomType(type.roomTypeId)}
          error={quotesErrorForRoomType(type.roomTypeId)}
          quotes={quotesForRoomType(type.roomTypeId)}
          ratePlanId={type.roomTypeId === roomTypeId ? ratePlanId : ""}
          canCreateUnpriced={canCreateUnpriced}
          money={money}
          nights={nights}
          onSelect={(planId) => {
            if (!planId) {
              setRatePlanId("");
              return;
            }
            selectRoomAndRate(type, planId);
          }}
        />
      )}
    />
  );

  const roomSection = <div className="space-y-4">{roomsAndRates}</div>;

  const policiesSection = (
    <CreateReservationPoliciesGuarantee
      guarantee={
        <CreateReservationGuarantee
          guaranteeMethod={guaranteeMethod}
          options={guaranteeOptions}
          catalogueWarning={guaranteeWarning}
          persistApplied={persistApplied}
          companyName={companyMaster?.name ?? null}
          companyTerms={companyMaster?.paymentTerms ?? null}
          travelAgentName={travelAgentMaster?.name ?? null}
          travelAgentTerms={travelAgentMaster?.paymentTerms ?? null}
          guestName={guest?.fullName ?? null}
          cardHolderName={step4Policies.cardHolderName}
          cardNumber={step4Policies.cardNumber}
          cardExpiry={step4Policies.cardExpiry}
          onGuaranteeMethodChange={setGuaranteeMethod}
          onCardHolderNameChange={(value) =>
            setStep4Policies((current) => ({ ...current, cardHolderName: value }))
          }
          onCardNumberChange={(value) =>
            setStep4Policies((current) => ({ ...current, cardNumber: value }))
          }
          onCardExpiryChange={(value) =>
            setStep4Policies((current) => ({ ...current, cardExpiry: value }))
          }
        />
      }
      policies={step4Policies}
      onPoliciesChange={(patch) =>
        setStep4Policies((current) => ({ ...current, ...patch }))
      }
      notes={notes}
      onNotesChange={setNotes}
      money={money}
      hotelCancelSummary={formatQuotedPolicySummary(
        selectedQuote?.cancellationLabel,
        selectedQuote?.refundabilityLabel,
      )}
      depositPaymentOptions={guaranteeOptions}
      depositPolicies={depositPolicyOptions}
      depositPolicyHint={depositPolicyHint}
      depositQuote={
        selectedQuote?.quote
          ? {
              subtotal: selectedQuote.quote.subtotal,
              nightly: selectedQuote.quote.nightly,
              currency: selectedQuote.quote.currency,
            }
          : null
      }
      quotedNonRefundable={quotedNonRefundable(selectedQuote?.refundabilityKind)}
    />
  );

  const reviewSection = (
    <CreateReservationReview
      guestName={guest?.fullName ?? null}
      guestVip={guest?.vipStatus === true}
      profileNumber={guest?.profileNumber ?? null}
      phone={guest?.phone ?? null}
      email={guest?.email ?? null}
      nationality={guest?.nationality ?? null}
      idDocumentNumber={guest?.idDocumentNumber ?? null}
      bookedBy={sameAsGuest ? "Same as guest" : "—"}
      companyName={companyMaster?.name ?? null}
      travelAgentName={travelAgentMaster?.name ?? null}
      groupName={groupMaster?.name ?? null}
      arrivalLabel={datesValid ? formatStayDate(arrival) : "—"}
      departureLabel={datesValid ? formatStayDate(departure) : "—"}
      nights={nights}
      rooms={roomsRequested}
      adults={adults}
      children={children}
      infants={infants}
      purposeOfStay={purposeOfStay.trim() || null}
      coverUrl={catalogRow?.coverUrl ?? null}
      roomName={stickyRoomTypeLabel(selectedMeta)}
      ratePlan={
        pricingState.kind === "priced"
          ? pricingState.quote.ratePlanName || pricingState.quote.ratePlanCode
          : (selectedQuote?.plan.name ?? "—")
      }
      ratePerNight={
        pricingState.kind === "priced" && fromNightlyRate(pricingState.quote) != null
          ? money(fromNightlyRate(pricingState.quote)!)
          : "—"
      }
      stayTotal={pricingState.kind === "priced" ? money(pricingState.quote.subtotal) : "—"}
      breakfastLabel={selectedQuote?.breakfastLabel ?? "—"}
      cancellationLabel={selectedQuote?.cancellationLabel ?? "—"}
      bookingSource={
        sourceOptions.find((row) => row.value === bookingSource)?.label ?? bookingSource
      }
      salesChannel={
        salesChannelOptions.find((row) => row.value === salesChannel)?.label ?? salesChannel
      }
      marketSegment={
        segmentOptions.find((row) => row.value === marketSegment)?.label ?? marketSegment
      }
      internalNotes={notes.trim() || null}
      guaranteeRequired={guaranteeMethod.trim() ? "Yes" : "No"}
      guaranteeType={
        guaranteeOptions.find((row) => row.value === guaranteeMethod)?.label ?? guaranteeMethod
      }
      cardHolderName={step4Policies.cardHolderName.trim() || guest?.fullName || null}
      cardNumber={step4Policies.cardNumber}
      cardExpiry={step4Policies.cardExpiry.trim() || null}
      guaranteeMethod={guaranteeMethod}
      depositRequired={
        selectedDepositPolicy == null ? "—" : selectedDepositPolicy.required ? "Yes" : "No"
      }
      depositAmount={
        selectedDepositPolicy
          ? (() => {
              const amount = computeDepositRequirementAmount(
                selectedDepositPolicy,
                selectedQuote?.quote
                  ? {
                      subtotal: selectedQuote.quote.subtotal,
                      nightly: selectedQuote.quote.nightly,
                      currency: selectedQuote.quote.currency,
                    }
                  : null,
              );
              return amount > 0 ? money(amount) : "—";
            })()
          : "—"
      }
      depositDueDate={step4Policies.depositDueDate.trim() || null}
      depositPaymentMethod={
        step4Policies.depositPaymentMethod === "same_as_guarantee"
          ? "Same as Guarantee"
          : guaranteeOptions.find((row) => row.value === step4Policies.depositPaymentMethod)
              ?.label ?? step4Policies.depositPaymentMethod
      }
      noShowPolicy={stayPolicyLabel(step4Policies.noShowPolicy)}
      earlyDeparturePolicy={stayPolicyLabel(step4Policies.earlyDeparturePolicy)}
      specialRequests={specialRequests.trim() || null}
      ackInformed={step4Policies.ackInformed}
      ackConsent={step4Policies.ackConsent}
      ackNonRefundable={step4Policies.ackNonRefundable}
      ackSpecialTerms={step4Policies.ackSpecialTerms}
      quotedNonRefundable={quotedNonRefundable(selectedQuote?.refundabilityKind)}
      onAckChange={(patch) => setStep4Policies((current) => ({ ...current, ...patch }))}
      onEdit={setWorkflowStep}
      packagesSlot={
        <CreateReservationPackages
          loading={set3Query.isLoading || set3Query.isFetching}
          error={set3Query.isError}
          packagesAvailable={set3Query.data?.snapshot.packagesAvailable ?? false}
          activePackageCount={activePackageCountFromRows(set3Query.data?.snapshot.packages ?? [])}
          canEditSet3={set3Query.data?.canEdit ?? false}
          operational
        />
      }
    />
  );

  const guestOnly = (
    <WorkspaceCard>
      <CreateReservationGuest
        restaurantId={restaurantId}
        canCreateGuest={guestAccessQuery.data?.canManage ?? false}
        guest={guest}
        onGuestChange={setGuest}
      />
    </WorkspaceCard>
  );

  const availabilitySection = (
    <div className="space-y-4">
      <CreateReservationSearchCriteria
        arrival={arrival}
        departure={departure}
        nights={nights}
        rooms={roomsRequested}
        adults={adults}
        children={children}
        roomTypeFilter={searchRoomTypeFilter}
        roomTypes={availability}
        onArrivalChange={handleArrivalChange}
        onDepartureChange={handleDepartureChange}
        onNightsChange={handleNightsChange}
        onRoomsChange={setRoomsRequested}
        onAdultsChange={setAdults}
        onChildrenChange={setChildren}
        infants={infants}
        onInfantsChange={setInfants}
        onRoomTypeFilterChange={setSearchRoomTypeFilter}
        onModifySearch={modifyAvailabilitySearch}
      />
      {roomsAndRates}
      {availability.length === 0 ? (
        <CreateReservationRate
          datesValid={datesValid}
          roomTypeId={roomTypeId}
          loading={quotesQuery.isLoading || quotesQuery.isFetching}
          error={quotesQuery.isError}
          quotes={quotes}
          ratePlanId={ratePlanId}
          canCreateUnpriced={canCreateUnpriced}
          money={money}
          nights={nights}
          onSelect={setRatePlanId}
        />
      ) : null}
      <CreateReservationAlternatives />
    </div>
  );

  const guestStaySection = (
    <div className="space-y-4">
      {staySection}
      {guestOnly}
    </div>
  );

  const bookingDetailsSection = (
    <CreateReservationBookingDetails
      restaurantId={restaurantId}
      canCreateMaster={guestAccessQuery.data?.canManage ?? false}
      guest={guest}
      bookingSource={bookingSource}
      onBookingSourceChange={setBookingSource}
      sourceOptions={sourceOptions}
      marketSegment={marketSegment}
      onMarketSegmentChange={setMarketSegment}
      segmentOptions={segmentOptions}
      externalReference={externalReference}
      onExternalReferenceChange={setExternalReference}
      companyMaster={companyMaster}
      onCompanyMasterChange={handleCompanyMasterChange}
      travelAgentMaster={travelAgentMaster}
      onTravelAgentMasterChange={handleTravelAgentMasterChange}
      linkedGroupId={linkedGroupId}
      linkedBlockId={linkedBlockId}
      salesChannel={salesChannel}
      onSalesChannelChange={setSalesChannel}
      salesChannelOptions={salesChannelOptions}
      purposeOfStay={purposeOfStay}
      onPurposeOfStayChange={setPurposeOfStay}
      billingRuleId={billingRuleId}
      onBillingRuleIdChange={setBillingRuleId}
      companyContactId={companyContactId}
      onCompanyContactIdChange={setCompanyContactId}
      travelAgentContactId={travelAgentContactId}
      onTravelAgentContactIdChange={setTravelAgentContactId}
      sameAsGuest={sameAsGuest}
      onSameAsGuestChange={setSameAsGuest}
      onGuestChange={setGuest}
      onApplyRatePlan={setRatePlanId}
      onLinkedGroupChange={(groupId, blockId) => {
        setLinkedGroupId(groupId);
        setLinkedBlockId(blockId);
      }}
      quoteCurrency={displayCurrencyCode}
      ratePlanId={ratePlanId}
      roomTypeId={roomTypeId}
      roomTypeName={stickyRoomTypeLabel(selectedMeta)}
      roomTypeCode={selectedMeta?.code ?? null}
      catalog={catalogRow}
      adultCapacity={selectedMeta?.adultCapacity ?? null}
      assignedRoomLabel={stickyRoomAssignmentLabel({
        roomTypeId,
        roomId,
        unassignedValue: UNASSIGNED,
        room: selectedAssignedRoom,
      })}
      roomAssignment={
        <CreateReservationRoomAssignment
          compact
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
      }
      selectedQuote={selectedQuote}
      money={money}
      nights={nights}
      onChangeRoomRate={() => setWorkflowStep(1)}
      arrival={arrival}
      departure={departure}
      datesValid={datesValid}
      roomsRequested={roomsRequested}
      adults={adults}
      children={children}
      infants={infants}
      roomUnassigned={roomId === UNASSIGNED}
      onArrivalChange={handleArrivalChange}
      onDepartureChange={handleDepartureChange}
      onNightsChange={handleNightsChange}
      onRoomsChange={setRoomsRequested}
      onAdultsChange={setAdults}
      onChildrenChange={setChildren}
      onInfantsChange={setInfants}
      onKeepUnassigned={(unassigned) => {
        if (unassigned) handleRoomChange(UNASSIGNED);
      }}
      specialRequests={specialRequests}
      onSpecialRequestsChange={setSpecialRequests}
    />
  );

  const stepSections = [
    guestStaySection,
    availabilitySection,
    bookingDetailsSection,
    policiesSection,
    reviewSection,
  ];
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
      {guestOnly}
      {guestSection}
      {roomSection}
      {policiesSection}
    </div>
  );

  const summaryCard = (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <h2 className="font-display text-lg">Reservation Summary</h2>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Guest Information
          </p>
          <p className="mt-1">{guest?.fullName ?? "—"}</p>
          {guest?.profileNumber ? (
            <p className="text-xs text-muted-foreground">{guest.profileNumber}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">{guest?.phone || "—"}</p>
          <p className="text-xs text-muted-foreground">{guest?.email || "—"}</p>
          {guest?.nationality ? (
            <p className="text-xs text-muted-foreground">{guest.nationality}</p>
          ) : null}
          {guest?.vipStatus ? (
            <span className="mt-1 inline-flex rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">
              VIP
            </span>
          ) : null}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Stay Information
          </p>
          <dl className="mt-1 space-y-1">
            <div data-testid="summary-stay">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Stay</dt>
              <dd data-testid="summary-stay-dates">
                {datesValid ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}` : "—"}
              </dd>
            </div>
            {datesValid ? (
              <div data-testid="summary-stay-nights">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Nights
                </dt>
                <dd>{nights}</dd>
              </div>
            ) : null}
            <div data-testid="summary-stay-occupancy">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Occupancy
              </dt>
              <dd>
                {formatStayOccupancySummary(adults, children)} · {roomsRequested} room
                {roomsRequested === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Room & Rate Information
          </p>
          {catalogRow?.coverUrl ? (
            <img
              src={catalogRow.coverUrl}
              alt=""
              className="mt-2 h-16 w-full rounded-md object-cover"
            />
          ) : (
            <div className="mt-2 h-12 rounded-md bg-[#EFE8DC]" aria-hidden />
          )}
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Room type
              </dt>
              <dd data-testid="summary-room-type">{stickyRoomTypeLabel(selectedMeta)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Availability
              </dt>
              <dd data-testid="summary-availability">
                {stickyAvailabilityCopy(summaryAvailability)}
              </dd>
            </div>
            <div data-testid="summary-room">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Room</dt>
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
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Rate
                  </dt>
                  <dd data-testid="summary-rate-code">
                    {pricingState.quote.ratePlanCode}
                    {pricingState.quote.ratePlanName ? ` · ${pricingState.quote.ratePlanName}` : ""}
                  </dd>
                </div>
                <div data-testid="summary-rate-and-total">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Stay total
                  </dt>
                  <dd>
                    {money(pricingState.quote.subtotal)}
                    {pricingState.quote.currency ? ` ${pricingState.quote.currency}` : ""}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Additional Information
          </p>
          <dl className="mt-1 space-y-1">
            {reservationType === "individual" && (companyMaster || travelAgentMaster) ? (
              <div data-testid="summary-associations">
                <dt className="sr-only">Associations</dt>
                <dd className="space-y-1">
                  <p data-testid="summary-company">
                    <span className="text-muted-foreground">Company · </span>
                    {companyMaster?.name ?? "—"}
                  </p>
                  <p data-testid="summary-ta">
                    <span className="text-muted-foreground">Travel Agent · </span>
                    {travelAgentMaster?.name ?? "—"}
                  </p>
                </dd>
              </div>
            ) : null}
            {reservationType === "corporate" ? (
              <div data-testid="summary-company">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Company
                </dt>
                <dd>{companyMaster?.name ?? "—"}</dd>
              </div>
            ) : null}
            {reservationType === "travel_agency" ? (
              <div data-testid="summary-ta">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Travel Agent
                </dt>
                <dd>{travelAgentMaster?.name ?? "—"}</dd>
              </div>
            ) : null}
            {reservationType === "individual" && !companyMaster && !travelAgentMaster ? (
              <>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Company
                  </dt>
                  <dd>—</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Travel Agent
                  </dt>
                  <dd>—</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Group</dt>
              <dd>{pmsGroupId ?? "—"}</dd>
            </div>
            <div data-testid="summary-source">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</dt>
              <dd>
                {sourceOptions.find((row) => row.value === bookingSource)?.label ??
                  (bookingSource || "—")}
              </dd>
            </div>
            {marketSegment ? (
              <div data-testid="summary-segment">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Market segment
                </dt>
                <dd>
                  {segmentOptions.find((row) => row.value === marketSegment)?.label ??
                    (marketSegment || "—")}
                </dd>
              </div>
            ) : null}
            {externalReference.trim() ? (
              <div data-testid="summary-external-ref">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  External reference
                </dt>
                <dd>{externalReference.trim()}</dd>
              </div>
            ) : null}
            {guaranteeMethod ? (
              <div data-testid="summary-guarantee">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Guarantee
                </dt>
                <dd>
                  {guaranteeOptions.find((row) => row.value === guaranteeMethod)?.label ??
                    (guaranteeMethod || "—")}
                </dd>
              </div>
            ) : null}
            {paymentTermsReviewCopy({
              companyName: companyMaster?.name ?? null,
              companyTerms: companyMaster?.paymentTerms ?? null,
              travelAgentName: travelAgentMaster?.name ?? null,
              travelAgentTerms: travelAgentMaster?.paymentTerms ?? null,
            }) ? (
              <div data-testid="summary-payment-terms">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Payment terms
                </dt>
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
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Cancellation Policy
          </p>
          <p className="mt-1 text-sm" data-testid="summary-cancellation">
            {selectedQuote?.cancellationLabel && selectedQuote.cancellationLabel !== "—"
              ? selectedQuote.cancellationLabel
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Special Requests
          </p>
          <p className="mt-1 text-sm">{specialRequests.trim() || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Estimated Total
          </p>
          <p className="mt-1 font-medium text-[#251605]">
            {pricingState.kind === "priced"
              ? `${money(pricingState.quote.subtotal)}${pricingState.quote.currency ? ` ${pricingState.quote.currency}` : ""}`
              : "—"}
          </p>
        </div>
      </div>
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
            className={
              summaryOpen
                ? "min-w-0 w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[320px]"
                : "xl:sticky xl:top-4 xl:block xl:w-14"
            }
            data-testid="create-reservation-summary"
          >
            {summaryOpen ? (
              <>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSummaryOpen(false)}
                  >
                    <ChevronRight className="size-4" />
                    Collapse summary
                  </Button>
                </div>
                {summaryCard}
              </>
            ) : (
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#DDD4C5] bg-white text-[#251605]"
                onClick={() => setSummaryOpen(true)}
                aria-label="Show summary"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
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
              disabled={
                (workflowStep === 1 &&
                  !(
                    roomTypeId &&
                    occupancyOk &&
                    (priced || canCreateUnpriced) &&
                    (selectedType?.available ?? 0) > 0
                  )) ||
                (workflowStep === 2 && !canContinueBookingDetails)
              }
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
