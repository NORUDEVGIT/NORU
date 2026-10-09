import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueries } from "@tanstack/react-query";
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
import {
  CreateReservationBookingDetails,
  type CreateServiceSelection,
} from "@/packages/pms/components/bookings/create-reservation-booking-details";
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
import {
  CreateReservationGuest,
  CreateReservationGuestSearch,
  CreateReservationGuestSelected,
  toPickedGuest,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { CreateReservationStay } from "@/packages/pms/components/bookings/create-reservation-stay";
import { CreateReservationSelectedRoom } from "@/packages/pms/components/bookings/create-reservation-selected-room";
import { PMS_OP_LABEL, PMS_OP_SELECT_TRIGGER } from "@/packages/pms/lib/pms-operational-surface";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { CreateReservationAlternatives } from "@/packages/pms/components/bookings/create-reservation-alternatives";
import {
  createGuestServiceRequest,
  getGuest,
  getGuestReservationPreferenceDefaults,
  getGuestsAccess,
  listGuestPreferenceWorkspace,
  listGuestServiceWorkspace,
} from "@/packages/pms/lib/guests.functions";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import { resolveIndividualProfileType } from "@/packages/pms/lib/guest-field-rules";
import { savedPreferencesForProfileType } from "@/packages/pms/lib/guest-preferences-workspace";
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
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import {
  buildAvailablePackageCards,
  canBindCreatePackage,
  selectedCreatePackageRows,
} from "@/packages/pms/lib/reservation-detail-packages";
import { listEligiblePackageActivations } from "@/packages/pms/lib/revenue/commercial-package.functions";
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
  canAdvanceFromGuestStayAvailability,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  canAdvanceFromBookingDetails,
  resolveSalesChannelOptions,
} from "@/packages/pms/lib/create-reservation-step3";
import {
  availabilitySearchIsCurrent,
  CREATE_RESERVATION_AVAILABILITY_IDLE,
  CREATE_RESERVATION_AVAILABILITY_STALE,
  occupancySoftWarn,
  stickyRoomTypeLabel,
  type AvailabilitySearchCriteria,
  type SelectedRoomTypeMeta,
} from "@/packages/pms/lib/create-reservation-phase1-section4";
import {
  canCreateUnpricedPending,
  canSubmitCreateReservation,
  fromNightlyRate,
  resolveCreatePricingState,
  shouldClearStaleRatePlan,
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
import { activePackageCountFromRows } from "@/packages/pms/lib/create-reservation-phase1-section8";
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
  {
    id: "guest-stay-availability",
    label: "Guest, Stay & Availability",
    continueLabel: "Continue to Booking Details",
  },
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
  const fetchPreferenceWorkspace = useServerFn(listGuestPreferenceWorkspace);
  const fetchGuestConfig = useServerFn(getGuestWorkspaceConfig);
  const fetchServiceWorkspace = useServerFn(listGuestServiceWorkspace);
  const submitServiceRequest = useServerFn(createGuestServiceRequest);
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
  const fetchMealsCard3 = useServerFn(getMealsCard3);
  const fetchEligiblePackages = useServerFn(listEligiblePackageActivations);
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
  const [searchRoomTypeFilter, setSearchRoomTypeFilter] = useState("");
  const [ratePreference, setRatePreference] = useState("");
  const [availabilitySearchCommitted, setAvailabilitySearchCommitted] =
    useState<AvailabilitySearchCriteria | null>(null);
  const ratePreferenceOptionsRef = useRef<Array<{ id: string; name: string }>>([]);
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [salesChannel, setSalesChannel] = useState("");
  const [purposeOfStay, setPurposeOfStay] = useState("");
  const [billingRuleId, setBillingRuleId] = useState("");
  const [companyContactId, setCompanyContactId] = useState("");
  const [travelAgentContactId, setTravelAgentContactId] = useState("");
  const [sameAsGuest] = useState(true);
  const [packageActivationIds, setPackageActivationIds] = useState<string[]>([]);
  const [selectedServiceRequests, setSelectedServiceRequests] = useState<CreateServiceSelection[]>(
    [],
  );
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
    queryFn: () =>
      fetchGuestAccount({ data: { restaurantId, accountId: initialCompanyMasterId! } }),
    enabled: canManage && Boolean(initialCompanyMasterId) && !companyMaster && !companyOverride,
    staleTime: 60_000,
  });

  const initialTravelAgentQuery = useQuery({
    queryKey: ["initial-reservation-travel-agent", restaurantId, initialTravelAgentMasterId],
    queryFn: () =>
      fetchGuestAccount({ data: { restaurantId, accountId: initialTravelAgentMasterId! } }),
    enabled:
      canManage &&
      Boolean(initialTravelAgentMasterId) &&
      !travelAgentMaster &&
      !travelAgentOverride,
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
  const preferenceWorkspaceQuery = useQuery({
    queryKey: ["guest-preference-workspace", restaurantId, guest?.id, "create"],
    queryFn: () => fetchPreferenceWorkspace({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && Boolean(guest?.id),
    retry: false,
  });
  const guestConfigQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId, "create-reservation"],
    queryFn: () => fetchGuestConfig({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const serviceCatalogueQuery = useQuery({
    queryKey: ["guest-service-workspace", restaurantId, guest?.id, "create"],
    queryFn: () => fetchServiceWorkspace({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && Boolean(guest?.id),
    retry: false,
  });
  const activeServiceTypes = useMemo(
    () => (serviceCatalogueQuery.data?.types ?? []).filter((row) => row.active),
    [serviceCatalogueQuery.data?.types],
  );

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
  }, [initialCompanyMasterId, companyOverride, companyMaster, initialCompanyQuery.data]);

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
    const isOperational =
      account.accountStatus !== "deleted" && account.accountStatus !== "inactive";

    if (isGroupType && isNotAnonymized && isOperational) {
      setGroupMaster(toPickedReservationMaster(account));
    }
  }, [initialGroupMasterId, groupOverride, groupMaster, initialGroupQuery.data]);

  useEffect(() => {
    if (initialPrefQuery.data?.applyToFutureReservations && initialPrefQuery.data.specialRequests) {
      setSpecialRequests((prev) => (prev ? prev : (initialPrefQuery.data.specialRequests ?? "")));
    }
    if (initialPrefQuery.data?.applyToFutureReservations && initialPrefQuery.data.roomTypeId) {
      const nextRoomTypeId = initialPrefQuery.data.roomTypeId;
      setRoomTypeId((current) => current || nextRoomTypeId);
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
  const createActivePackageCount = activePackageCountFromRows(
    set3Query.data?.snapshot.packages ?? [],
  );
  const createPackageMerchContextReady = datesValid && !!roomTypeId && !!ratePlanId;
  const createPackageMerchEnabled =
    canManage &&
    createPackageMerchContextReady &&
    (set3Query.data?.snapshot.packagesAvailable ?? false) &&
    createActivePackageCount > 0;
  const mealsCard3MerchQuery = useQuery({
    queryKey: ["meals-card3", restaurantId, "create-reservation-merch"],
    queryFn: () => fetchMealsCard3({ data: { restaurantId } }),
    enabled: createPackageMerchEnabled,
    retry: false,
  });
  const eligiblePackagesMerchQuery = useQuery({
    queryKey: [
      "eligible-packages",
      restaurantId,
      ratePlanId,
      roomTypeId,
      arrival,
      departure,
      "create-merch",
    ],
    queryFn: () =>
      fetchEligiblePackages({
        data: {
          restaurantId,
          ratePlanId,
          roomTypeId,
          arrivalDate: arrival,
          departureDate: departure,
        },
      }),
    enabled: createPackageMerchEnabled && mealsCard3MerchQuery.isSuccess,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const createPackageMerchandiseCards = useMemo(() => {
    if (!mealsCard3MerchQuery.data) return [];
    return buildAvailablePackageCards({
      catalogue: mealsCard3MerchQuery.data.snapshot.packages,
      components: mealsCard3MerchQuery.data.snapshot.components,
      eligible: eligiblePackagesMerchQuery.data ?? [],
      roomTypeId,
      ratePlanId,
    });
  }, [eligiblePackagesMerchQuery.data, mealsCard3MerchQuery.data, ratePlanId, roomTypeId]);
  useEffect(() => {
    if (!eligiblePackagesMerchQuery.isSuccess) return;
    const allowed = new Set(
      createPackageMerchandiseCards.flatMap((card) =>
        canBindCreatePackage(card) && card.activationId ? [card.activationId] : [],
      ),
    );
    setPackageActivationIds((current) => {
      const next = current.filter((id) => allowed.has(id));
      return next.length === current.length ? current : next;
    });
  }, [createPackageMerchandiseCards, eligiblePackagesMerchQuery.isSuccess]);
  const selectedCreatePackages = useMemo(
    () => selectedCreatePackageRows(createPackageMerchandiseCards, packageActivationIds),
    [createPackageMerchandiseCards, packageActivationIds],
  );

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

  const availabilityDraft: AvailabilitySearchCriteria = {
    arrival,
    departure,
    rooms: roomsRequested,
    adults,
    children,
    infants,
    roomTypePreference: searchRoomTypeFilter,
    ratePreference,
  };
  const availabilitySearchActive =
    datesValid && availabilitySearchIsCurrent(availabilitySearchCommitted, availabilityDraft);

  const availabilityQuery = useQuery({
    queryKey: ["room-type-availability", restaurantId, arrival, departure],
    queryFn: () => fetchAvailability({ data: { restaurantId, arrival, departure } }),
    enabled: canManage && datesValid && availabilitySearchActive,
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
    enabled: canManage && datesValid && !!roomTypeId && availabilitySearchActive,
    retry: false,
  });
  const quotes = useMemo(
    () => (availabilitySearchActive ? (quotesQuery.data ?? []) : []),
    [availabilitySearchActive, quotesQuery.data],
  );
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
      enabled: canManage && datesValid && availabilitySearchActive,
      retry: false,
    })),
  });
  const observedRatePlans = new Map<string, string>();
  for (const row of quotesQuery.data ?? []) {
    if (row.plan.id) observedRatePlans.set(row.plan.id, row.plan.name);
  }
  for (const query of catalogQuoteQueries) {
    for (const row of query.data ?? []) {
      if (row.plan.id) observedRatePlans.set(row.plan.id, row.plan.name);
    }
  }
  const observedRatePlanOptions = [...observedRatePlans].map(([id, name]) => ({ id, name }));
  if (observedRatePlanOptions.length > 0) {
    ratePreferenceOptionsRef.current = observedRatePlanOptions;
  }
  const ratePreferenceOptions =
    observedRatePlanOptions.length > 0 ? observedRatePlanOptions : ratePreferenceOptionsRef.current;
  const savedPreferenceRows = useMemo(() => {
    if (!guestConfigQuery.data || !preferenceWorkspaceQuery.data) return [];
    return savedPreferencesForProfileType({
      categories: preferenceWorkspaceQuery.data.categories,
      preferenceTypeIds:
        resolveIndividualProfileType(guestConfigQuery.data)?.preferenceTypeIds ?? [],
      roomTypes: (roomCatalogQuery.data ?? []).map((row) => ({ id: row.id, label: row.name })),
      ratePlans: ratePreferenceOptions.map((row) => ({ id: row.id, label: row.name })),
    });
  }, [
    guestConfigQuery.data,
    preferenceWorkspaceQuery.data,
    ratePreferenceOptions,
    roomCatalogQuery.data,
  ]);
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
        quotesReady:
          availabilitySearchActive &&
          !quotesQuery.isLoading &&
          !quotesQuery.isFetching &&
          !quotesQuery.isError,
        quotes: quotes.map((row) => ({ planId: row.plan.id, hasQuote: row.quote != null })),
      })
    ) {
      setRatePlanId("");
    }
  }, [
    availabilitySearchActive,
    quotes,
    quotesQuery.isError,
    quotesQuery.isFetching,
    quotesQuery.isLoading,
    ratePlanId,
  ]);

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
          packageActivationIds:
            selectedCreatePackages.length > 0
              ? selectedCreatePackages.flatMap((card) =>
                  card.activationId ? [card.activationId] : [],
                )
              : undefined,
          bookerGuestId: sameAsGuest && guest?.id ? guest.id : null,
          depositPolicyId: step4Policies.depositPolicyId || null,
          depositTenderCode: resolveDepositTenderCode({
            selected: step4Policies.depositPaymentMethod,
            guaranteeMethod,
          }),
        },
      }),
    onSuccess: async (result, nextStatus) => {
      const createdServiceNames: string[] = [];
      if (guest?.id) {
        for (const row of selectedServiceRequests) {
          const created = await submitServiceRequest({
            data: {
              restaurantId,
              guestId: guest.id,
              serviceTypeId: row.serviceTypeId,
              priority: "normal",
              description: row.description.trim() || row.name,
              reservationId: result.id,
            },
          });
          if (created.ok) createdServiceNames.push(row.name);
          else toast.error(created.message);
        }
      }
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
        stayTotal: selectedQuote?.quote ? money(selectedQuote.quote.subtotal) : null,
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
        selectedPackageLines: selectedCreatePackages.map(
          (card) => `${card.name} — ${card.price == null ? "—" : money(card.price)}`,
        ),
        selectedServiceLines: createdServiceNames,
        savedPreferenceLines: savedPreferenceRows.map((row) => `${row.label}: ${row.value}`),
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

  const availability = availabilitySearchActive ? (availabilityQuery.data ?? []) : [];
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
  const canContinueGuestStayAvailability =
    availabilitySearchActive &&
    (!searchRoomTypeFilter || roomTypeId === searchRoomTypeFilter) &&
    (!ratePreference || ratePlanId === ratePreference) &&
    canAdvanceFromGuestStayAvailability({
      datesValid,
      hasGuest: !!guest,
      roomTypeId,
      occupancyOk,
      priced,
      canCreateUnpriced,
      available: selectedType?.available ?? 0,
    });
  const canContinueBookingDetails =
    canAdvanceFromBookingDetails({
      quotesFetching: quotesQuery.isFetching,
      roomTypeId,
      occupancyOk,
      priced,
      canCreateUnpriced,
      submitted: detailsQuoteIdentity,
      quoted: quotedIdentity,
    }) &&
    bookingSource.trim().length > 0 &&
    salesChannel.trim().length > 0;
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
    const rows =
      id === roomTypeId
        ? quotes
        : (catalogQuoteQueries[availability.findIndex((row) => row.roomTypeId === id)]?.data ?? []);
    if (!ratePreference) return rows;
    return rows.filter((row) => row.plan.id === ratePreference);
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

  function commitAvailabilitySearch() {
    if (!datesValid) return;
    setAvailabilitySearchCommitted({
      arrival,
      departure,
      rooms: roomsRequested,
      adults,
      children,
      infants,
      roomTypePreference: searchRoomTypeFilter,
      ratePreference,
    });
    void availabilityQuery.refetch();
    if (roomTypeId) void quotesQuery.refetch();
    for (const query of catalogQuoteQueries) void query.refetch();
  }

  const roomTypePreferenceOptions = (roomCatalogQuery.data ?? []).map((type) => ({
    id: type.id,
    name: type.name,
  }));
  const availabilityStatusMessage =
    availabilitySearchCommitted == null
      ? CREATE_RESERVATION_AVAILABILITY_IDLE
      : availabilitySearchActive
        ? null
        : CREATE_RESERVATION_AVAILABILITY_STALE;

  const preferenceExtras = (
    <>
      <div className="min-w-0 space-y-1">
        <Label htmlFor="room-type-preference" className={PMS_OP_LABEL}>
          Preferred Room Type
        </Label>
        <Select
          value={searchRoomTypeFilter || "any"}
          onValueChange={(value) => {
            setSearchRoomTypeFilter(value === "any" ? "" : value);
          }}
        >
          <SelectTrigger
            id="room-type-preference"
            className={cn(PMS_OP_SELECT_TRIGGER, "!h-9")}
            data-testid="room-type-preference"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {roomTypePreferenceOptions.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor="rate-preference" className={PMS_OP_LABEL}>
          Rate Preference
        </Label>
        <Select
          value={ratePreference || "any"}
          onValueChange={(value) => {
            setRatePreference(value === "any" ? "" : value);
          }}
        >
          <SelectTrigger
            id="rate-preference"
            className={cn(PMS_OP_SELECT_TRIGGER, "!h-9")}
            data-testid="rate-preference"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            {ratePreferenceOptions.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const staySection = (
    <CreateReservationStay
      title="Stay Information"
      arrival={arrival}
      departure={departure}
      nights={nights}
      datesValid={datesValid}
      adults={adults}
      children={children}
      rooms={roomsRequested}
      onRoomsChange={setRoomsRequested}
      requestExtras={preferenceExtras}
      actions={
        <Button
          type="button"
          data-testid="check-availability"
          className="h-9 !rounded-[6px] bg-[#C89933] px-3 text-sm font-medium text-[#251605] !shadow-none hover:bg-[#B98B2D]"
          disabled={!datesValid}
          onClick={commitAvailabilitySearch}
        >
          Check Availability
        </Button>
      }
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
  );

  const roomsAndRates = (
    <CreateReservationRoomType
      datesValid={datesValid}
      loading={availabilityQuery.isLoading || availabilityQuery.isFetching}
      availability={availability}
      statusMessage={availabilityStatusMessage}
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
      ratePlanOptions={ratePreferenceOptions}
      selectedPlanId={ratePlanId}
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
      headerSummary={
        datesValid ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="availability-stay-summary">
            {formatStayDate(arrival)} → {formatStayDate(departure)} · {nights}{" "}
            {nights === 1 ? "night" : "nights"} · {roomsRequested}{" "}
            {roomsRequested === 1 ? "room" : "rooms"} · {adults} {adults === 1 ? "adult" : "adults"}{" "}
            · {children} {children === 1 ? "child" : "children"}
          </p>
        ) : null
      }
      onModifySearch={() => {
        document.getElementById("create-reservation-stay-information")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }}
    />
  );

  const noSuitableAvailability =
    availabilitySearchActive &&
    datesValid &&
    !availabilityQuery.isLoading &&
    !availabilityQuery.isFetching &&
    availability.every((row) => row.available <= 0);

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
      onPoliciesChange={(patch) => setStep4Policies((current) => ({ ...current, ...patch }))}
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
          : (guaranteeOptions.find((row) => row.value === step4Policies.depositPaymentMethod)
              ?.label ?? step4Policies.depositPaymentMethod)
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
      savedPreferences={savedPreferenceRows}
      selectedServiceRequests={selectedServiceRequests}
      selectedPackages={selectedCreatePackages.map((card) => ({
        key: card.activationId ?? card.id,
        name: card.name,
        category: card.category,
        priceLabel: card.price == null ? "—" : money(card.price),
        chargeBasisLabel: card.chargeType,
        inclusions: card.components.join(", "),
      }))}
    />
  );

  const guestStayAvailabilitySection = (
    <CreateReservationGuest
      restaurantId={restaurantId}
      canCreateGuest={guestAccessQuery.data?.canManage ?? false}
      guest={guest}
      onGuestChange={setGuest}
      listEnabled={workflowStep === 0}
    >
      <div
        className="min-w-0 space-y-3"
        data-testid="create-reservation-step-guest-stay-availability"
      >
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]">
          <CreateReservationGuestSearch />
          <CreateReservationGuestSelected />
          <div className="h-full min-w-0 md:col-span-2 lg:col-span-1">{staySection}</div>
        </div>
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-3">
            {roomsAndRates}
            {availabilitySearchActive && availability.length === 0 ? (
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
            {noSuitableAvailability ? <CreateReservationAlternatives /> : null}
          </div>
          <CreateReservationSelectedRoom
            selectedRoomType={selectedMeta}
            available={selectedType?.available ?? null}
            coverUrl={catalogRow?.coverUrl ?? selectedType?.coverUrl ?? null}
            catalog={catalogRow}
            selectedQuote={selectedQuote}
            nights={nights}
            money={money}
            statusMessage={
              availabilitySearchCommitted != null && !availabilitySearchActive
                ? CREATE_RESERVATION_AVAILABILITY_STALE
                : null
            }
            onChange={() => {
              document.getElementById("create-reservation-availability")?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }}
          />
        </div>
      </div>
    </CreateReservationGuest>
  );

  const bookingDetailsSection = (
    <div data-testid="create-reservation-booking-details-step">
      <CreateReservationBookingDetails
        restaurantId={restaurantId}
        canCreateMaster={guestAccessQuery.data?.canManage ?? false}
        guest={guest}
        reservationType={reservationType}
        onRequestTypeChange={requestTypeChange}
        bookingAgentName={bookingAgentName}
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
        onApplyRatePlan={setRatePlanId}
        onLinkedGroupChange={(groupId, blockId) => {
          setLinkedGroupId(groupId);
          setLinkedBlockId(blockId);
        }}
        ratePlanId={ratePlanId}
        roomTypeId={roomTypeId}
        ratePlanLabel={
          selectedQuote?.quote?.ratePlanName ||
          selectedQuote?.plan.name ||
          selectedQuote?.plan.code ||
          "—"
        }
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
        arrival={arrival}
        specialRequests={specialRequests}
        onSpecialRequestsChange={setSpecialRequests}
        notes={notes}
        onNotesChange={setNotes}
        savedPreferences={savedPreferenceRows}
        savedPreferencesLoading={
          Boolean(guest) && (preferenceWorkspaceQuery.isLoading || guestConfigQuery.isLoading)
        }
        serviceTypes={activeServiceTypes}
        serviceTypesLoading={Boolean(guest) && serviceCatalogueQuery.isLoading}
        selectedServiceRequests={selectedServiceRequests}
        onSelectedServiceRequestsChange={setSelectedServiceRequests}
        packagesSlot={
          <CreateReservationPackages
            loading={set3Query.isLoading || set3Query.isFetching}
            error={set3Query.isError}
            packagesAvailable={set3Query.data?.snapshot.packagesAvailable ?? false}
            activePackageCount={createActivePackageCount}
            canEditSet3={set3Query.data?.canEdit ?? false}
            operational
            merchandiseContextReady={createPackageMerchContextReady}
            merchandiseCards={createPackageMerchandiseCards}
            merchandiseCurrency={displayCurrencyCode || propertyCurrencyCode}
            money={money}
            selectedActivationIds={packageActivationIds}
            onToggleActivation={(activationId) =>
              setPackageActivationIds((current) =>
                current.includes(activationId)
                  ? current.filter((id) => id !== activationId)
                  : [...current, activationId],
              )
            }
          />
        }
      />
    </div>
  );

  const stepSections = [
    guestStayAvailabilitySection,
    bookingDetailsSection,
    policiesSection,
    reviewSection,
  ];
  const currentStep = CREATE_WORKFLOW_STEPS[workflowStep] ?? CREATE_WORKFLOW_STEPS[0];
  const mainContent = stepSections[workflowStep];

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

  return (
    <div className={cn(embedded ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4 p-4")}>
      {!embedded ? (
        <div>
          <h1 className="font-display text-2xl">New Reservation</h1>
          <p className="text-sm text-muted-foreground">
            Create a stay for {membership.restaurant.name}. Check availability after the stay
            details are set.
          </p>
        </div>
      ) : null}
      <CreateWorkflowStepper
        steps={CREATE_WORKFLOW_STEPS}
        current={workflowStep}
        onSelect={setWorkflowStep}
      />
      <div
        className={cn("min-w-0", embedded && "min-h-0 flex-1 overflow-y-auto p-4")}
        data-testid="create-reservation-workspace"
      >
        {mainContent}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-3 border-[#DDD4C5] bg-white px-4 py-3",
          embedded ? "border-t" : "rounded-xl border",
        )}
      >
        <div className="flex flex-wrap gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : !embedded ? (
            <Button asChild variant="outline">
              <Link to="/restaurant/pms/reservations">Cancel</Link>
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
              (workflowStep === 0 && !canContinueGuestStayAvailability) ||
              (workflowStep === 1 && !canContinueBookingDetails)
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
