import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Search } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CreateReservationRoomType,
  OccupancySoftWarn,
  OverbookingDecision,
} from "@/packages/pms/components/bookings/create-reservation-room-type";
import { CreateReservationRate } from "@/packages/pms/components/bookings/create-reservation-rate";
import { CreateReservationRoomAssignment } from "@/packages/pms/components/bookings/create-reservation-room-assignment";
import {
  type ExtraRoomDraft,
  type ExtraRoomQuote,
} from "@/packages/pms/components/bookings/create-reservation-extra-rooms";
import {
  CreateReservationRoomingList,
  type RoomingRateLabel,
} from "@/packages/pms/components/bookings/create-reservation-rooming-list";
import { CreateReservationPackages } from "@/packages/pms/components/bookings/create-reservation-packages";
import { packageChargeFigures } from "@/packages/pms/lib/room-charge-guest-total";
import { usePackageChargeRules } from "@/packages/pms/lib/use-package-charge-rules";
import { CreateReservationRoomingSummary } from "@/packages/pms/components/bookings/create-reservation-rooming-summary";
import { CreateReservationGuarantee } from "@/packages/pms/components/bookings/create-reservation-guarantee";
import {
  CreateReservationPoliciesGuarantee,
  EMPTY_CREATE_RESERVATION_POLICIES,
} from "@/packages/pms/components/bookings/create-reservation-policies-guarantee";
import { CreateReservationPriceReminder } from "@/packages/pms/components/bookings/create-reservation-price-reminder";
import {
  earlyDeparturePenaltySummary,
  earlyDepartureReviewLabel,
} from "@/packages/pms/lib/early-departure-policy";
import { CreateReservationConfirmation } from "@/packages/pms/components/bookings/create-reservation-confirmation";
import {
  CreateReservationBookingDetails,
  type CreateServiceSelection,
} from "@/packages/pms/components/bookings/create-reservation-booking-details";
import { CreateReservationReview } from "@/packages/pms/components/bookings/create-reservation-review";
import { reviewIncludedItems } from "@/packages/pms/lib/create-reservation-review";
import { formatPropertyContactAddress } from "@/packages/pms/lib/reservation-print-document";

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
  nightsBetween,
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
import { startWalkInCheckIn } from "@/packages/pms/lib/fo-check-in.functions";
import {
  getOverbookingBoard,
  getOverbookingControls,
} from "@/packages/pms/lib/overbooking.functions";
import { createReservationRoomUnitPayload } from "@/packages/pms/lib/reservation-room-units";
import type { ReservationMode } from "@/packages/pms/lib/reservation-mode";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { getCurrencyCard3 } from "@/packages/pms/lib/currency-card3.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getPmsSet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest.functions";
import { getPmsPolish1Snapshot } from "@/packages/pms/lib/pms-polish1-payment-admin.functions";
import { getGroup } from "@/packages/pms/lib/groups.functions";
import { getPaymentsCard3 } from "@/packages/pms/lib/payments-card3.functions";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import {
  buildAvailablePackageCards,
  canBindCreatePackage,
  selectedCreatePackageRows,
} from "@/packages/pms/lib/reservation-detail-packages";
import { listEligiblePackageActivations } from "@/packages/pms/lib/revenue/commercial-package.functions";
import {
  compactRoomOccupancy,
  groupDepositPresentation,
  groupRoomTotal,
  packageBookingNote,
  roomingSummary,
  roomPolicyFromLabels,
  sharedPolicyNote,
  stayPoliciesAreShared,
  type RoomPolicyValues,
} from "@/packages/pms/lib/create-reservation-group-step23";
import {
  computeDepositRequirementAmount,
  noShowPenaltySummary,
  quotedNonRefundable,
  resolveDepositTenderCode,
} from "@/packages/pms/lib/create-reservation-step4";
import { parseCreateReceiptInput } from "@/packages/pms/lib/reservation-create-money";
import {
  clearCreateReservationDraft,
  createReservationDraftIsMeaningful,
  readCreateReservationDraft,
  shouldDropMissingRoomType,
  writeCreateReservationDraft,
  type CreateReservationDraft,
} from "@/packages/pms/lib/create-reservation-draft";
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
  resolveMarketSegmentOptions,
  toPickedReservationMaster,
  canAdvanceFromGuestStayAvailability,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import { canAdvanceFromBookingDetails } from "@/packages/pms/lib/create-reservation-step3";
import { getReservationCreateSourceChannel } from "@/packages/pms/lib/reservation-source-channel.functions";
import {
  OTA_CHANNEL_EMPTY_MESSAGE,
  reservationCreateChannelForm,
} from "@/packages/pms/lib/reservation-source-channel";
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
  quotedGuestTotal,
  rateCopyFromQuote,
  resolveCreatePricingState,
  shouldClearStaleRatePlan,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import {
  activateRoom,
  addGroupRoom,
  applyActiveRoomSelection,
  applyRoomOccupancy,
  assignExtraOccupant,
  removeGroupRoom,
  buildGroupRoomGuestAssignments,
  confirmSingleDowngrade,
  formatRoomOccupancy,
  groupStayTotals,
  groupStep1Issue,
  selectReservationMode,
  type Step1RoomingState,
} from "@/packages/pms/lib/create-reservation-rooming";
import {
  CreateReservationGroupContext,
  CreateReservationUnitBlockSelect,
} from "@/packages/pms/components/bookings/create-reservation-group-context";
import {
  defaultBlockIdForUnit,
  headerBlockIdForCreate,
  stayFitsBlockDates,
  unitBlockReviewCopy,
} from "@/packages/pms/lib/groups-reservation-prelink";
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
import {
  isWalkInCreateMode,
  walkInCreateDefaults,
  type ReservationCreateMode,
} from "@/packages/pms/lib/walk-in-reservation-context";
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
  { id: "details", label: "Booking Details", continueLabel: "Continue to Policies & Payment" },
  { id: "policies", label: "Policies & Payment", continueLabel: "Continue to Review & Confirm" },
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
  lockOperationalGroup = false,
  returnToLabel,
  mode = "standard",
  businessDate = null,
  onCancel,
  onCreated,
  onOpenCreatedReservation,
  onContinueToCheckIn,
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
  lockOperationalGroup?: boolean;
  returnToLabel?: string | undefined;
  mode?: ReservationCreateMode;
  /** Property business date. Used only when mode is walk-in. */
  businessDate?: string | null;
  onCancel?: () => void;
  onCreated?: (reservationId: string) => void;
  onOpenCreatedReservation?: (reservationId: string) => void;
  onContinueToCheckIn?: (created: {
    id: string;
    confirmationNumber: string;
    guestName: string;
  }) => void;
  onReturnToDesk?: () => void;
}) {
  const restaurantId = membership.restaurant.id;
  const packageChargeRules = usePackageChargeRules(restaurantId);
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);
  const walkInMode = isWalkInCreateMode(mode);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchGuestAccess = useServerFn(getGuestsAccess);
  const fetchGuest = useServerFn(getGuest);
  const fetchGuestPrefDefaults = useServerFn(getGuestReservationPreferenceDefaults);
  const fetchPreferenceWorkspace = useServerFn(listGuestPreferenceWorkspace);
  const fetchGuestConfig = useServerFn(getGuestWorkspaceConfig);
  const fetchServiceWorkspace = useServerFn(listGuestServiceWorkspace);
  const submitServiceRequest = useServerFn(createGuestServiceRequest);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const fetchSourceChannel = useServerFn(getReservationCreateSourceChannel);
  const fetchSet3 = useServerFn(getPmsSet3Snapshot);
  const fetchPolish1 = useServerFn(getPmsPolish1Snapshot);
  const fetchPaymentsCard3 = useServerFn(getPaymentsCard3);
  const fetchGroup = useServerFn(getGroup);
  const fetchGuestLinks = useServerFn(listGuestAccountLinks);
  const fetchGuestAccount = useServerFn(getGuestAccount);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitReservation = useServerFn(createReservation);
  const startWalkIn = useServerFn(startWalkInCheckIn);
  const fetchQuotes = useServerFn(quoteStay);
  const fetchRoomTypes = useServerFn(listRoomTypes);
  const fetchCurrencies = useServerFn(getCurrencyCard3);
  const fetchMealsCard3 = useServerFn(getMealsCard3);
  const fetchEligiblePackages = useServerFn(listEligiblePackageActivations);
  const [reservationType, setReservationType] = useState<ReservationTypeMode>("individual");
  const [reservationMode, setReservationMode] = useState<ReservationMode>("single");
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  const [pendingSingleMode, setPendingSingleMode] = useState(false);
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
  const [extraRoomUnits, setExtraRoomUnits] = useState<ExtraRoomDraft[]>([]);
  const [extraRoomQuotes, setExtraRoomQuotes] = useState<Record<string, ExtraRoomQuote | null>>({});
  const [roomTypeId, setRoomTypeId] = useState("");
  const [overbookingReason, setOverbookingReason] = useState("");
  const [overbookingArmed, setOverbookingArmed] = useState(false);
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
  const [relationTab, setRelationTab] = useState<"company" | "travel_agent" | "group">("company");
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [holdCommercialDefaults, setHoldCommercialDefaults] = useState(false);
  const draftClosed = useRef(false);
  const stayDatesTouched = useRef(false);
  const walkInStatusApplied = useRef(false);
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
  const sourceChannelQuery = useQuery({
    queryKey: ["reservation-create-source-channel", restaurantId],
    queryFn: () => fetchSourceChannel({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const channelForm = sourceChannelQuery.data
    ? reservationCreateChannelForm({
        sources: sourceChannelQuery.data.sources,
        channels: sourceChannelQuery.data.channels,
        bookingSource,
        salesChannel,
      })
    : null;
  const sourceOptions = (channelForm?.sourceOptions ?? []).map((row) => ({
    value: row.value,
    label: row.label,
    origin:
      sourceChannelQuery.data?.sources.find((source) => source.id === row.value)?.origin ??
      ("default" as const),
  }));
  const salesChannelOptions = (channelForm?.channelOptions ?? []).map((row) => ({
    value: row.value,
    label: row.label,
    origin: "set6" as const,
  }));
  const segmentOptions = resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments);
  useEffect(() => {
    if (!channelForm || channelForm.salesChannel === salesChannel) return;
    setSalesChannel(channelForm.salesChannel);
  }, [channelForm, salesChannel]);

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
  const linkedGroupQuery = useQuery({
    queryKey: ["pms-group", restaurantId, linkedGroupId],
    queryFn: () => fetchGroup({ data: { restaurantId, groupId: linkedGroupId! } }),
    enabled: canManage && Boolean(linkedGroupId),
    retry: false,
  });
  const launchBlock =
    linkedGroupQuery.data?.blocks.find((block) => block.id === pmsGroupBlockId) ?? null;
  const preferredRateApplied = useRef(false);

  useEffect(() => {
    if (!pmsGroupId || stayDatesTouched.current || !linkedGroupQuery.data) return;
    if (launchBlock) {
      setArrival(launchBlock.startDate);
      setDeparture(launchBlock.endDate);
      return;
    }
    const group = linkedGroupQuery.data.group;
    if (group.arrivalDate && group.departureDate) {
      setArrival(group.arrivalDate);
      setDeparture(group.departureDate);
    }
  }, [launchBlock, linkedGroupQuery.data, pmsGroupId]);

  useEffect(() => {
    if (!pmsGroupId || preferredRateApplied.current) return;
    const planId = linkedGroupQuery.data?.group.ratePlanId;
    if (!planId) return;
    preferredRateApplied.current = true;
    setRatePlanId((current) => current || planId);
  }, [linkedGroupQuery.data?.group.ratePlanId, pmsGroupId]);

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
    stayDatesTouched.current = true;
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
    stayDatesTouched.current = true;
    if (!arrival) return;
    const stay = linkedStayFromNights(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  function handleDepartureChange(next: string) {
    stayDatesTouched.current = true;
    const stay = linkedStayFromDeparture(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  const groupMode = reservationMode === "group";
  const activeExtra =
    groupMode && activeRoomIndex > 0 ? (extraRoomUnits[activeRoomIndex - 1] ?? null) : null;
  const quoteAdults = activeExtra?.adults ?? adults;
  const quoteChildren = activeExtra?.children ?? children;
  const quoteInfants = activeExtra?.infants ?? infants;
  const activeRoomTypeId = activeExtra ? activeExtra.roomTypeId : roomTypeId;
  const activeRatePlanId = activeExtra ? (activeExtra.ratePlanId ?? "") : ratePlanId;
  const availabilityDraft: AvailabilitySearchCriteria = {
    arrival,
    departure,
    rooms: 1,
    adults: quoteAdults,
    children: quoteChildren,
    infants: quoteInfants,
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
      1,
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
          rooms: 1,
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
        1,
        quoteAdults,
        quoteChildren,
        quoteInfants,
        quoteCurrency,
      ],
      queryFn: () =>
        fetchQuotes({
          data: {
            restaurantId,
            roomTypeId: row.roomTypeId,
            arrival,
            departure,
            rooms: 1,
            adults: quoteAdults,
            children: quoteChildren,
            infants: quoteInfants,
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
  const ratePlanDepositPolicy =
    (paymentsCard3Query.data?.snapshot.depositPolicies ?? []).find(
      (row) => row.id === selectedQuote?.depositPolicyId,
    ) ?? null;
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

  const roomUnitPayload = useMemo(
    () =>
      createReservationRoomUnitPayload({
        roomTypeId,
        adults,
        children,
        infants,
        ratePlanId: ratePlanId || null,
        roomsRequested,
        extraUnits:
          reservationMode === "group"
            ? extraRoomUnits.map((unit) => ({
                roomTypeId: unit.roomTypeId,
                adults: unit.adults,
                children: unit.children,
                infants: unit.infants,
                ratePlanId: unit.ratePlanId,
                pmsGroupBlockId: unit.pmsGroupBlockId ?? null,
              }))
            : [],
        pmsGroupBlockId: linkedBlockId,
      }),
    [
      adults,
      children,
      extraRoomUnits,
      infants,
      linkedBlockId,
      ratePlanId,
      reservationMode,
      roomTypeId,
      roomsRequested,
    ],
  );
  const rememberExtraRoomQuote = useCallback((key: string, quote: ExtraRoomQuote | null) => {
    setExtraRoomQuotes((current) => {
      const previous = current[key] ?? null;
      if (
        previous?.typeName === quote?.typeName &&
        previous?.ratePlan === quote?.ratePlan &&
        previous?.total === quote?.total &&
        previous?.nightly === quote?.nightly &&
        previous?.guestTotal === quote?.guestTotal &&
        previous?.subtotal === quote?.subtotal &&
        previous?.policy?.cancellation === quote?.policy?.cancellation &&
        previous?.policy?.noShow === quote?.policy?.noShow &&
        previous?.policy?.earlyDeparture === quote?.policy?.earlyDeparture &&
        previous?.policy?.refundability === quote?.policy?.refundability &&
        previous?.policy?.depositName === quote?.policy?.depositName &&
        previous?.policy?.depositType === quote?.policy?.depositType &&
        previous?.policy?.depositValue === quote?.policy?.depositValue &&
        previous?.policy?.depositRequired === quote?.policy?.depositRequired
      ) {
        return current;
      }
      return { ...current, [key]: quote };
    });
  }, []);

  useEffect(() => {
    if (!groupMode) return;
    setAvailabilitySearchCommitted((current) => {
      if (!current) return current;
      if (current.arrival !== arrival || current.departure !== departure) return current;
      if (
        current.rooms === 1 &&
        current.adults === quoteAdults &&
        current.children === quoteChildren &&
        current.infants === quoteInfants
      ) {
        return current;
      }
      return {
        ...current,
        rooms: 1,
        adults: quoteAdults,
        children: quoteChildren,
        infants: quoteInfants,
      };
    });
  }, [arrival, departure, groupMode, quoteAdults, quoteChildren, quoteInfants]);

  useEffect(() => {
    if (!activeExtra?.key || !activeExtra.roomTypeId || !activeExtra.ratePlanId) return;
    const rows = availabilityQuery.data ?? [];
    const index = rows.findIndex((row) => row.roomTypeId === activeExtra.roomTypeId);
    const quote = catalogQuoteQueries[index]?.data?.find(
      (row) => row.plan.id === activeExtra.ratePlanId,
    );
    if (!quote) return;
    const copy = rateCopyFromQuote(quote, money);
    const deposit = (paymentsCard3Query.data?.snapshot.depositPolicies ?? []).find(
      (row) => row.id === quote.depositPolicyId,
    );
    rememberExtraRoomQuote(activeExtra.key, {
      typeName: rows[index]?.name ?? "Room",
      ratePlan: copy.ratePlanLabel,
      total: copy.totalAmount,
      nightly: copy.ratePerNight,
      subtotal: quote.quote?.subtotal ?? null,
      guestTotal: quote.quote ? quotedGuestTotal(quote.quote) : null,
      nightlyRates: quote.quote?.nightly.map((night) => night.rate) ?? [],
      policy: roomPolicyFromLabels({
        cancellationName: quote.plan.cancellationName,
        cancellationLabel: quote.cancellationLabel,
        noShowName: quote.noShowPolicyName,
        noShowPenalty: noShowPenaltySummary(
          quote.noShowPenaltyType,
          quote.noShowPenaltyValue,
          quote.quote?.currency || quote.plan.currency,
        ),
        earlyDepartureName: quote.earlyDeparturePolicyName,
        earlyDeparturePenalty: earlyDeparturePenaltySummary(
          quote.earlyDeparturePenaltyType,
          quote.earlyDeparturePenaltyValue,
        ),
        refundabilityKind: quote.refundabilityKind,
        refundabilityLabel: quote.refundabilityLabel,
        depositName: deposit?.name || quote.depositPolicyName,
        depositType: deposit?.depositType ?? null,
        depositValue: deposit?.depositValue ?? null,
        depositRequired: deposit?.required ?? null,
      }),
    });
  }, [
    activeExtra?.key,
    activeExtra?.ratePlanId,
    activeExtra?.roomTypeId,
    availabilityQuery.data,
    catalogQuoteQueries,
    money,
    paymentsCard3Query.data?.snapshot.depositPolicies,
    rememberExtraRoomQuote,
  ]);

  function currentRooming(): Step1RoomingState {
    return {
      reservationMode,
      activeRoomIndex,
      guestId: guest?.id ?? null,
      arrival,
      departure,
      room1: {
        roomTypeId,
        adults,
        children,
        infants,
        ratePlanId: ratePlanId || null,
        pmsGroupBlockId: linkedBlockId,
      },
      extras: extraRoomUnits.map((unit) => ({
        key: unit.key,
        roomTypeId: unit.roomTypeId,
        adults: unit.adults,
        children: unit.children,
        infants: unit.infants,
        ratePlanId: unit.ratePlanId,
        occupant: unit.occupant ?? null,
        pmsGroupBlockId: unit.pmsGroupBlockId ?? null,
      })),
    };
  }

  function commitRooming(next: Step1RoomingState) {
    setReservationMode(next.reservationMode);
    setActiveRoomIndex(next.activeRoomIndex);
    setAdults(next.room1.adults);
    setChildren(next.room1.children);
    setInfants(next.room1.infants);
    setRoomTypeId(next.room1.roomTypeId);
    setRatePlanId(next.room1.ratePlanId ?? "");
    setLinkedBlockId(next.room1.pmsGroupBlockId ?? null);
    setExtraRoomUnits(next.extras);
    setRoomsRequested(1);
  }

  const availability = availabilitySearchActive ? (availabilityQuery.data ?? []) : [];
  const selectedType = availability.find((row) => row.roomTypeId === roomTypeId);
  const requestedRoomsForType = (typeId: string) => {
    if (!roomUnitPayload.roomUnits) return typeId === roomTypeId ? 1 : 0;
    return roomUnitPayload.roomUnits.filter((unit) => unit.roomTypeId === typeId).length;
  };
  const overbookShortage = availability.reduce(
    (sum, row) => sum + Math.max(0, requestedRoomsForType(row.roomTypeId) - row.available),
    0,
  );
  const shortRoomTypes = availability.filter(
    (row) => requestedRoomsForType(row.roomTypeId) > row.available,
  );
  const loadOverbookingControls = useServerFn(getOverbookingControls);
  const overbookingControls = useQuery({
    queryKey: ["overbooking-controls", restaurantId],
    queryFn: () => loadOverbookingControls({ data: { restaurantId } }),
  });
  const approvalRequired = overbookingControls.data?.managerApprovalRequired !== false;
  const reasonRequired = overbookingControls.data?.reasonRequired !== false;
  const canAuthorizeOverbook =
    !approvalRequired || actorRole === "owner" || actorRole === "manager";
  const overbookReady =
    overbookShortage > 0 &&
    canAuthorizeOverbook &&
    overbookingArmed &&
    (!reasonRequired || overbookingReason.trim().length > 0);
  const loadOverbookingBoard = useServerFn(getOverbookingBoard);
  const overbookBoardQuery = useQuery({
    queryKey: ["create-overbooking-board", restaurantId, arrival, departure],
    enabled: canAuthorizeOverbook && overbookShortage > 0 && datesValid,
    queryFn: () =>
      loadOverbookingBoard({
        data: { restaurantId, start: arrival, end: addDays(departure, -1) },
      }),
  });
  function tightestOverbookingFor(typeId: string) {
    const rows = (overbookBoardQuery.data?.nights ?? []).flatMap((night) => {
      const row = night.roomTypes.find((type) => type.roomTypeId === typeId);
      return row ? [row] : [];
    });
    return rows.reduce<(typeof rows)[number] | null>(
      (best, row) => (!best || row.overbookingRemaining < best.overbookingRemaining ? row : best),
      null,
    );
  }

  const create = useMutation({
    mutationFn: (nextStatus: "pending" | "confirmed") => {
      if (!channelForm?.accepted) {
        throw new Error(channelForm?.message ?? "Source is required to continue.");
      }
      const paymentReceived = parseCreateReceiptInput({
        amount: step4Policies.paymentReceivedAmount,
        tender: step4Policies.paymentReceivedTender,
        reference: step4Policies.paymentReceivedReference,
        idempotencyKey: crypto.randomUUID(),
      });
      const guestDeposit = parseCreateReceiptInput({
        amount: step4Policies.guestDepositAmount,
        tender: step4Policies.guestDepositTender,
        reference: step4Policies.guestDepositReference,
        idempotencyKey: crypto.randomUUID(),
      });
      return submitReservation({
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
          rooms: roomUnitPayload.rooms,
          roomUnits: roomUnitPayload.roomUnits ?? undefined,
          quoteCurrency: null,
          specialRequests: specialRequests.trim() || null,
          notes: notes.trim() || null,
          status: nextStatus,
          ratePlanId: ratePlanId || null,
          companyMasterId: boundMasters.companyMasterId,
          travelAgentMasterId: boundMasters.travelAgentMasterId,
          groupAccountMasterId: groupMaster?.id ?? (initialGroupMasterId || null),
          commercialBookingSource: channelForm.commercialBookingSource,
          marketSegment: marketSegment.trim() || null,
          externalReference: externalReference.trim() || null,
          guaranteeMethod: guaranteeMethod.trim() || null,
          requireGuarantee: nextStatus === "confirmed",
          reservationType,
          ...(reservationMode === "group"
            ? {
                reservationMode: "group" as const,
                roomGuestAssignments: buildGroupRoomGuestAssignments(currentRooming()),
              }
            : {}),
          pmsGroupId: linkedGroupId,
          pmsGroupBlockId:
            extraRoomUnits.length > 0
              ? headerBlockIdForCreate([
                  linkedBlockId,
                  ...extraRoomUnits.map((unit) => unit.pmsGroupBlockId ?? null),
                ])
              : linkedBlockId,
          commercialSalesChannel: channelForm.commercialSalesChannel,
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
          ...(walkInMode ? { source: walkInCreateDefaults(businessDate || arrival).source } : {}),
          bookerGuestId: sameAsGuest && guest?.id ? guest.id : null,
          depositTenderCode: resolveDepositTenderCode({
            selected: step4Policies.depositPaymentMethod,
            guaranteeMethod,
          }),
          ...(overbookReady
            ? { overbookingRequested: true, overbookingReason: overbookingReason.trim() }
            : {}),
          paymentReceivedAmount: paymentReceived.amount,
          paymentReceivedTender: paymentReceived.tender,
          paymentReceivedReference: paymentReceived.reference,
          paymentReceivedIdempotencyKey: paymentReceived.idempotencyKey,
          guestDepositAmount: guestDeposit.amount,
          guestDepositTender: guestDeposit.tender,
          guestDepositReference: guestDeposit.reference,
          guestDepositIdempotencyKey: guestDeposit.idempotencyKey,
        },
      });
    },
    onSuccess: async (result, nextStatus) => {
      if (result.paymentError) toast.error(result.paymentError);
      if (result.guestDepositError) toast.error(result.guestDepositError);
      draftClosed.current = true;
      if (walkInMode) {
        try {
          await startWalkIn({ data: { restaurantId, reservationId: result.id } });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not mark this walk-in for check-in.",
          );
        }
      }
      if (!walkInMode && accessQuery.data?.membershipId) {
        clearCreateReservationDraft(restaurantId, accessQuery.data.membershipId);
      }
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
        stayTotal: selectedQuote?.quote ? money(quotedGuestTotal(selectedQuote.quote)) : null,
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
        selectedPackageLines: selectedCreatePackages.map((card) => {
          const total =
            card.price == null
              ? null
              : packageChargeFigures(card.price, packageChargeRules.data).total;
          return `${card.name} — ${total == null ? "—" : money(total)}`;
        }),
        selectedServiceLines: createdServiceNames,
        savedPreferenceLines: savedPreferenceRows.map((row) => `${row.label}: ${row.value}`),
        operationalGroupName: linkedGroupQuery.data?.group.name ?? null,
        operationalGroupCode:
          linkedGroupQuery.data?.group.confirmationNumber ??
          linkedGroupQuery.data?.group.code ??
          null,
        operationalUnitLines: linkedGroupQuery.data
          ? [
              (() => {
                const copy = unitBlockReviewCopy({
                  roomTypeName: selectedRoomType?.name || "Room",
                  blockLabel:
                    linkedGroupQuery.data.blocks.find((block) => block.id === linkedBlockId)
                      ?.roomTypeName ?? null,
                  contributesToPickup: Boolean(linkedBlockId),
                });
                return `Room 1 · ${copy.block} · Pickup ${copy.pickup}`;
              })(),
              ...extraRoomUnits.map((unit, index) => {
                const copy = unitBlockReviewCopy({
                  roomTypeName: extraRoomQuotes[unit.key]?.typeName || "Room",
                  blockLabel:
                    linkedGroupQuery.data?.blocks.find(
                      (block) => block.id === unit.pmsGroupBlockId,
                    )?.roomTypeName ?? null,
                  contributesToPickup: Boolean(unit.pmsGroupBlockId),
                });
                return `Room ${index + 2} · ${copy.block} · Pickup ${copy.pickup}`;
              }),
            ]
          : undefined,
      });
      onCreated?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const membershipScope = accessQuery.data?.membershipId ?? "";
  const draftSnapshot = useMemo<CreateReservationDraft>(
    () => ({
      version: 1,
      workflowStep,
      reservationType,
      reservationMode,
      activeRoomIndex,
      guest,
      arrival,
      departure,
      adults,
      children,
      infants,
      roomsRequested,
      extraRoomUnits: extraRoomUnits.map((unit) => ({
        key: unit.key,
        roomTypeId: unit.roomTypeId,
        adults: unit.adults,
        children: unit.children,
        infants: unit.infants,
        ratePlanId: unit.ratePlanId,
        occupant: unit.occupant ?? null,
      })),
      roomTypeId,
      selectedRoomType,
      roomId,
      ratePlanId,
      ratePreference,
      searchRoomTypeFilter,
      availabilitySearchCommitted,
      quoteCurrency,
      specialRequests,
      notes,
      bookingSource,
      salesChannel,
      marketSegment,
      externalReference,
      purposeOfStay,
      relationTab,
      companyMaster,
      travelAgentMaster,
      groupMaster,
      companyOverride,
      travelAgentOverride,
      groupOverride,
      linkedGroupId,
      linkedBlockId,
      companyContactId,
      travelAgentContactId,
      billingRuleId,
      packageActivationIds,
      selectedServiceRequests,
      guaranteeMethod,
      depositReference: step4Policies.depositReference,
      depositPaymentMethod: step4Policies.depositPaymentMethod,
      depositDueDate: step4Policies.depositDueDate,
      paymentReceivedAmount: step4Policies.paymentReceivedAmount,
      paymentReceivedTender: step4Policies.paymentReceivedTender,
      paymentReceivedReference: step4Policies.paymentReceivedReference,
      guestDepositAmount: step4Policies.guestDepositAmount,
      guestDepositTender: step4Policies.guestDepositTender,
      guestDepositReference: step4Policies.guestDepositReference,
    }),
    [
      adults,
      arrival,
      activeRoomIndex,
      availabilitySearchCommitted,
      billingRuleId,
      bookingSource,
      children,
      companyContactId,
      companyMaster,
      companyOverride,
      departure,
      extraRoomUnits,
      externalReference,
      groupMaster,
      groupOverride,
      guaranteeMethod,
      guest,
      infants,
      linkedBlockId,
      linkedGroupId,
      marketSegment,
      notes,
      packageActivationIds,
      purposeOfStay,
      quoteCurrency,
      ratePlanId,
      ratePreference,
      relationTab,
      reservationMode,
      reservationType,
      roomId,
      roomTypeId,
      roomsRequested,
      salesChannel,
      searchRoomTypeFilter,
      selectedRoomType,
      selectedServiceRequests,
      specialRequests,
      step4Policies.depositDueDate,
      step4Policies.depositPaymentMethod,
      step4Policies.depositReference,
      step4Policies.paymentReceivedAmount,
      step4Policies.paymentReceivedTender,
      step4Policies.paymentReceivedReference,
      step4Policies.guestDepositAmount,
      step4Policies.guestDepositTender,
      step4Policies.guestDepositReference,
      travelAgentContactId,
      travelAgentMaster,
      travelAgentOverride,
      workflowStep,
    ],
  );
  const draftMeaningful = walkInMode
    ? false
    : createReservationDraftIsMeaningful(draftSnapshot, {
        arrival: today,
        departure: addDays(today, 1),
        unassignedRoomId: UNASSIGNED,
      });

  useEffect(() => {
    if (!walkInMode || walkInStatusApplied.current) return;
    setStatus(walkInCreateDefaults(businessDate || today).status);
    walkInStatusApplied.current = true;
  }, [businessDate, today, walkInMode]);

  useEffect(() => {
    if (!walkInMode || !businessDate || stayDatesTouched.current) return;
    const next = walkInCreateDefaults(businessDate);
    setArrival(next.arrival);
    setDeparture(next.departure);
  }, [businessDate, walkInMode]);

  useEffect(() => {
    if (walkInMode) {
      setDraftReady(true);
      return;
    }
    if (!membershipScope || draftReady) return;
    const stored = readCreateReservationDraft(restaurantId, membershipScope);
    if (stored) {
      setWorkflowStep(stored.workflowStep);
      setReservationType(stored.reservationType);
      setReservationMode(stored.reservationMode);
      setGuest(stored.guest as typeof guest);
      setArrival(stored.arrival || today);
      setDeparture(stored.departure || addDays(today, 1));
      setAdults(stored.adults);
      setChildren(stored.children);
      setInfants(stored.infants);
      setRoomsRequested(1);
      setExtraRoomUnits(stored.reservationMode === "group" ? stored.extraRoomUnits : []);
      setActiveRoomIndex(
        stored.reservationMode === "group"
          ? Math.min(stored.activeRoomIndex, stored.extraRoomUnits.length)
          : 0,
      );
      setRoomTypeId(stored.roomTypeId);
      setSelectedRoomType(stored.selectedRoomType);
      setRoomId(stored.roomId || UNASSIGNED);
      setRatePlanId(stored.ratePlanId);
      setRatePreference(stored.ratePreference);
      setSearchRoomTypeFilter(stored.searchRoomTypeFilter);
      setAvailabilitySearchCommitted(stored.availabilitySearchCommitted);
      setQuoteCurrency(stored.quoteCurrency);
      setSpecialRequests(stored.specialRequests);
      setNotes(stored.notes);
      setBookingSource(stored.bookingSource);
      setSalesChannel(stored.salesChannel);
      setMarketSegment(stored.marketSegment);
      setExternalReference(stored.externalReference);
      setPurposeOfStay(stored.purposeOfStay);
      setRelationTab(stored.relationTab);
      setCompanyMaster(stored.companyMaster);
      setTravelAgentMaster(stored.travelAgentMaster);
      setGroupMaster(stored.groupMaster);
      setCompanyOverride(stored.companyOverride || Boolean(stored.companyMaster));
      setTravelAgentOverride(stored.travelAgentOverride || Boolean(stored.travelAgentMaster));
      setGroupOverride(stored.groupOverride || Boolean(stored.groupMaster));
      if (!pmsGroupId) {
        setLinkedGroupId(stored.linkedGroupId);
        setLinkedBlockId(stored.linkedBlockId);
      }
      setCompanyContactId(stored.companyContactId);
      setTravelAgentContactId(stored.travelAgentContactId);
      setBillingRuleId(stored.billingRuleId);
      setPackageActivationIds(stored.packageActivationIds);
      setSelectedServiceRequests(stored.selectedServiceRequests);
      setGuaranteeMethod(stored.guaranteeMethod);
      setStep4Policies((current) => ({
        ...current,
        depositReference: stored.depositReference || "",
        depositPaymentMethod: stored.depositPaymentMethod || "",
        depositDueDate: stored.depositDueDate || "",
        paymentReceivedAmount: stored.paymentReceivedAmount || "",
        paymentReceivedTender: stored.paymentReceivedTender || "",
        paymentReceivedReference: stored.paymentReceivedReference || "",
        guestDepositAmount: stored.guestDepositAmount || "",
        guestDepositTender: stored.guestDepositTender || "",
        guestDepositReference: stored.guestDepositReference || "",
      }));
      setDraftRestored(true);
      setHoldCommercialDefaults(true);
    }
    setDraftReady(true);
  }, [draftReady, membershipScope, pmsGroupId, restaurantId, today, walkInMode]);

  useEffect(() => {
    if (!draftReady || !pmsGroupId) return;
    setReservationMode("group");
    setLinkedGroupId(pmsGroupId);
    setLinkedBlockId(pmsGroupBlockId);
  }, [draftReady, pmsGroupBlockId, pmsGroupId]);

  useEffect(() => {
    if (walkInMode) return;
    if (!membershipScope || !draftReady || draftClosed.current || createdView) return;
    if (draftMeaningful) writeCreateReservationDraft(restaurantId, membershipScope, draftSnapshot);
    else clearCreateReservationDraft(restaurantId, membershipScope);
  }, [
    createdView,
    draftMeaningful,
    draftReady,
    draftSnapshot,
    membershipScope,
    restaurantId,
    walkInMode,
  ]);

  useEffect(() => {
    if (
      !shouldDropMissingRoomType({
        roomTypeId,
        searchSettled:
          availabilitySearchActive &&
          !availabilityQuery.isLoading &&
          !availabilityQuery.isFetching &&
          !availabilityQuery.isError,
        availableRoomTypeIds: (availabilityQuery.data ?? []).map((row) => row.roomTypeId),
      })
    ) {
      return;
    }
    setRoomTypeId("");
    setSelectedRoomType(null);
    setRatePlanId("");
    setRoomId(UNASSIGNED);
  }, [
    availabilityQuery.data,
    availabilityQuery.isError,
    availabilityQuery.isFetching,
    availabilityQuery.isLoading,
    availabilitySearchActive,
    roomTypeId,
  ]);

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
        onContinueToCheckIn={
          walkInMode && onContinueToCheckIn
            ? () =>
                onContinueToCheckIn({
                  id: createdView.id,
                  confirmationNumber: createdView.confirmationNumber,
                  guestName: createdView.guestName,
                })
            : undefined
        }
        onReturnToDesk={onReturnToDesk}
        returnToLabel={returnToLabel}
        onCreateAnother={
          embedded
            ? () => {
                draftClosed.current = false;
                setCreatedView(null);
              }
            : undefined
        }
      />
    );
  }

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
  const groupIssue = groupMode
    ? groupStep1Issue({
        hasGuest: !!guest,
        datesValid,
        canCreateUnpriced,
        allowPhysicalShortage: overbookReady,
        room1: {
          roomTypeId,
          adults,
          children,
          infants,
          ratePlanId: ratePlanId || null,
          maxOccupancy: selectedType?.maxOccupancy ?? selectedRoomType?.maxOccupancy,
          available:
            availabilitySearchActive && roomTypeId ? (selectedType?.available ?? 0) : undefined,
        },
        extras: extraRoomUnits.map((unit) => {
          const row = availability.find((entry) => entry.roomTypeId === unit.roomTypeId);
          return {
            roomTypeId: unit.roomTypeId,
            adults: unit.adults,
            children: unit.children,
            infants: unit.infants,
            ratePlanId: unit.ratePlanId,
            occupantGuestId: unit.occupant?.guestId ?? null,
            maxOccupancy: row?.maxOccupancy,
            available:
              availabilitySearchActive && unit.roomTypeId ? (row?.available ?? 0) : undefined,
          };
        }),
      })
    : null;
  const selectedPickupBlocks = [
    linkedBlockId
      ? (linkedGroupQuery.data?.blocks.find((block) => block.id === linkedBlockId) ?? null)
      : null,
    ...extraRoomUnits.map((unit) =>
      unit.pmsGroupBlockId
        ? (linkedGroupQuery.data?.blocks.find((block) => block.id === unit.pmsGroupBlockId) ??
          null)
        : null,
    ),
  ].filter((block): block is NonNullable<typeof block> => Boolean(block));
  const blockDateIssue =
    datesValid &&
    selectedPickupBlocks.some((block) => !stayFitsBlockDates(arrival, departure, block));
  const canContinueGuestStayAvailability =
    availabilitySearchActive &&
    (!searchRoomTypeFilter || roomTypeId === searchRoomTypeFilter) &&
    (!ratePreference || ratePlanId === ratePreference) &&
    !groupIssue &&
    !blockDateIssue &&
    canAdvanceFromGuestStayAvailability({
      datesValid,
      hasGuest: !!guest,
      roomTypeId,
      occupancyOk,
      priced,
      canCreateUnpriced,
      available: overbookReady
        ? Math.max(selectedType?.available ?? 0, 1)
        : overbookShortage > 0
          ? 0
          : (selectedType?.available ?? 0),
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
    channelForm?.accepted === true &&
    !sourceChannelQuery.isError;
  const sourceChannelNotice = sourceChannelQuery.isError
    ? "Source and channel options could not be loaded."
    : !bookingSource.trim()
      ? "Source is required to continue."
      : (channelForm?.message ?? null);
  const extraRoomsComplete =
    reservationMode !== "group" ||
    extraRoomUnits.every((unit) => unit.roomTypeId.trim().length > 0 && !!unit.occupant?.guestId);
  const gateAvailable = overbookReady
    ? Math.max(submitInput.available, 1)
    : overbookShortage > 0
      ? 0
      : submitInput.available;
  const canSubmit =
    occupancyOk &&
    !groupIssue &&
    !blockDateIssue &&
    extraRoomsComplete &&
    channelForm?.accepted === true &&
    canSubmitCreateReservation({
      ...submitInput,
      available: gateAvailable,
      status: "pending",
    });
  const canSubmitConfirm =
    occupancyOk &&
    !groupIssue &&
    !blockDateIssue &&
    extraRoomsComplete &&
    channelForm?.accepted === true &&
    canSubmitConfirmReservation({
      ...submitInput,
      available: gateAvailable,
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
    if (linkedGroupId) {
      setLinkedBlockId(
        defaultBlockIdForUnit({
          blocks: linkedGroupQuery.data?.blocks ?? [],
          roomTypeId: type.roomTypeId,
          arrival,
          departure,
          preferredBlockId: pmsGroupBlockId,
        }),
      );
    }
  }

  function applyUnitBlockDefault(state: Step1RoomingState, typeId: string): Step1RoomingState {
    const nextId = defaultBlockIdForUnit({
      blocks: linkedGroupQuery.data?.blocks ?? [],
      roomTypeId: typeId,
      arrival: state.arrival,
      departure: state.departure,
      preferredBlockId: pmsGroupBlockId,
    });
    if (state.activeRoomIndex <= 0) {
      return { ...state, room1: { ...state.room1, pmsGroupBlockId: nextId } };
    }
    return {
      ...state,
      extras: state.extras.map((unit, index) =>
        index === state.activeRoomIndex - 1 ? { ...unit, pmsGroupBlockId: nextId } : unit,
      ),
    };
  }

  function selectRoomType(type: RoomTypeAvailability) {
    if (activeExtra) {
      commitRooming(
        applyUnitBlockDefault(
          applyActiveRoomSelection(currentRooming(), {
            roomTypeId: type.roomTypeId,
            ratePlanId: null,
          }),
          type.roomTypeId,
        ),
      );
      return;
    }
    applyRoomType(type);
    setRatePlanId("");
  }

  function selectRoomAndRate(type: RoomTypeAvailability, planId: string) {
    if (activeExtra) {
      commitRooming(
        applyUnitBlockDefault(
          applyActiveRoomSelection(currentRooming(), {
            roomTypeId: type.roomTypeId,
            ratePlanId: planId,
          }),
          type.roomTypeId,
        ),
      );
      return;
    }
    if (type.roomTypeId !== roomTypeId) applyRoomType(type);
    setRatePlanId(planId);
  }

  function requestReservationMode(next: ReservationMode) {
    const result = selectReservationMode(currentRooming(), next);
    if (result.status === "confirm") {
      setPendingSingleMode(true);
      return;
    }
    if (result.status === "applied") commitRooming(result.state);
  }

  function confirmGroupToSingle() {
    commitRooming(confirmSingleDowngrade(currentRooming()));
    setExtraRoomQuotes({});
    setPendingSingleMode(false);
  }

  function quotesForRoomType(id: string) {
    const rows =
      !activeExtra && id === roomTypeId
        ? quotes
        : (catalogQuoteQueries[availability.findIndex((row) => row.roomTypeId === id)]?.data ?? []);
    if (!ratePreference) return rows;
    return rows.filter((row) => row.plan.id === ratePreference);
  }

  function quotesLoadingForRoomType(id: string) {
    if (!activeExtra && id === roomTypeId) return quotesQuery.isLoading || quotesQuery.isFetching;
    const index = availability.findIndex((row) => row.roomTypeId === id);
    const query = catalogQuoteQueries[index];
    return Boolean(query?.isLoading || query?.isFetching);
  }

  function quotesErrorForRoomType(id: string) {
    if (!activeExtra && id === roomTypeId) return quotesQuery.isError;
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

  function requestCancel() {
    if (!onCancel) return;
    if (draftMeaningful) setDiscardOpen(true);
    else onCancel();
  }

  function confirmDiscard() {
    draftClosed.current = true;
    if (!walkInMode && membershipScope) clearCreateReservationDraft(restaurantId, membershipScope);
    setDiscardOpen(false);
    onCancel?.();
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
            : overbookReady
              ? "Save overbooked request"
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
            : overbookReady
              ? "Confirm overbooking"
              : CREATE_RESERVATION_CONFIRM_LABEL}
        </Button>
      </div>
      {embedded ? null : onCancel ? (
        <Button type="button" variant="outline" onClick={requestCancel}>
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

  const stayTotals = groupStayTotals(currentRooming());
  const staySection = (
    <CreateReservationStay
      title="Stay Information"
      titleNote={groupMode ? "(applies to all rooms)" : undefined}
      hideSpecialRequirement={groupMode}
      arrival={arrival}
      departure={departure}
      nights={nights}
      datesValid={datesValid}
      adults={groupMode ? stayTotals.adults : adults}
      children={groupMode ? stayTotals.children : children}
      rooms={groupMode ? stayTotals.rooms : 1}
      roomsReadOnly
      occupancyReadOnly={groupMode}
      requestExtras={preferenceExtras}
      actions={
        <Button
          type="button"
          data-testid="check-availability"
          className="h-9 !rounded-[6px] bg-[#C89933] px-3 text-sm font-medium text-[#251605] !shadow-none hover:bg-[#B98B2D] focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2"
          disabled={!datesValid}
          onClick={commitAvailabilitySearch}
        >
          <Search className="size-4" aria-hidden />
          Check Availability
        </Button>
      }
      specialRequests={specialRequests}
      notes={notes}
      occupancyWarn={
        groupMode ? null : selectedMeta ? (
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
      infants={groupMode ? stayTotals.infants : infants}
      onInfantsChange={setInfants}
      onSpecialRequestsChange={setSpecialRequests}
      onNotesChange={setNotes}
      showNotes={false}
    />
  );

  const roomsAndRates = (() => {
    const ratePlanId = activeRatePlanId;
    return (
      <CreateReservationRoomType
        datesValid={datesValid}
        loading={availabilityQuery.isLoading || availabilityQuery.isFetching}
        availability={availability}
        statusMessage={availabilityStatusMessage}
        roomTypeId={activeRoomTypeId}
        adults={quoteAdults}
        childCount={quoteChildren}
        selectedMaxOccupancy={
          (activeExtra
            ? availability.find((row) => row.roomTypeId === activeExtra.roomTypeId)?.maxOccupancy
            : selectedMeta?.maxOccupancy) ?? selectedMeta?.maxOccupancy
        }
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
            ratePlanId={type.roomTypeId === activeRoomTypeId ? activeRatePlanId : ""}
            canCreateUnpriced={canCreateUnpriced}
            money={money}
            nights={nights}
            onSelect={(planId) => {
              if (!planId) {
                if (activeExtra) {
                  commitRooming(
                    applyActiveRoomSelection(currentRooming(), {
                      roomTypeId: activeExtra.roomTypeId,
                      ratePlanId: null,
                    }),
                  );
                } else setRatePlanId("");
                return;
              }
              selectRoomAndRate(type, planId);
            }}
          />
        )}
        headerSummary={
          datesValid ? (
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="availability-stay-summary"
            >
              {groupMode ? (
                <>
                  Editing{" "}
                  <span className="font-medium text-[#C89933]">Room {activeRoomIndex + 1}</span>
                  {" · "}
                  {activeExtra?.occupant?.fullName || guest?.fullName || "No guest"}
                  {" · "}
                  {quoteAdults} {quoteAdults === 1 ? "Adult" : "Adults"} · {quoteChildren}{" "}
                  {quoteChildren === 1 ? "Child" : "Children"} · {quoteInfants}{" "}
                  {quoteInfants === 1 ? "Infant" : "Infants"}
                </>
              ) : (
                <>
                  {formatStayDate(arrival)} → {formatStayDate(departure)} · {nights}{" "}
                  {nights === 1 ? "night" : "nights"} · 1 room · {quoteAdults}{" "}
                  {quoteAdults === 1 ? "adult" : "adults"} · {quoteChildren}{" "}
                  {quoteChildren === 1 ? "child" : "children"}
                </>
              )}
            </p>
          ) : null
        }
        activeRoomLabel={groupMode ? `Room ${activeRoomIndex + 1}` : null}
        modifySearchLabel={groupMode ? `Edit Room ${activeRoomIndex + 1} Criteria` : undefined}
        allowExhaustedSelection={canAuthorizeOverbook}
        onModifySearch={() => {
          document.getElementById("create-reservation-stay-information")?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }}
      />
    );
  })();

  const noSuitableAvailability =
    availabilitySearchActive &&
    datesValid &&
    !availabilityQuery.isLoading &&
    !availabilityQuery.isFetching &&
    availability.every((row) => row.available <= 0);

  const room1Policy: RoomPolicyValues | null = selectedQuote
    ? roomPolicyFromLabels({
        cancellationName: selectedQuote.plan.cancellationName,
        cancellationLabel: selectedQuote.cancellationLabel,
        noShowName: selectedQuote.noShowPolicyName,
        noShowPenalty: noShowPenaltySummary(
          selectedQuote.noShowPenaltyType,
          selectedQuote.noShowPenaltyValue,
          selectedQuote.quote?.currency || selectedQuote.plan.currency,
        ),
        earlyDepartureName: selectedQuote.earlyDeparturePolicyName,
        earlyDeparturePenalty: earlyDeparturePenaltySummary(
          selectedQuote.earlyDeparturePenaltyType,
          selectedQuote.earlyDeparturePenaltyValue,
        ),
        refundabilityKind: selectedQuote.refundabilityKind,
        refundabilityLabel: selectedQuote.refundabilityLabel,
        depositName: ratePlanDepositPolicy?.name || selectedQuote.depositPolicyName,
        depositType: ratePlanDepositPolicy?.depositType ?? null,
        depositValue: ratePlanDepositPolicy?.depositValue ?? null,
        depositRequired: ratePlanDepositPolicy?.required ?? null,
      })
    : null;
  const groupPolicyRooms: Array<RoomPolicyValues | null> = groupMode
    ? [room1Policy, ...extraRoomUnits.map((unit) => extraRoomQuotes[unit.key]?.policy ?? null)]
    : [];
  const groupPoliciesShared = !groupMode || stayPoliciesAreShared(groupPolicyRooms);
  const groupDeposit = groupMode
    ? groupDepositPresentation({
        policies: groupPolicyRooms,
        currency: selectedQuote?.quote?.currency ?? null,
        rooms: [
          {
            subtotal: selectedQuote?.quote?.subtotal ?? null,
            nightlyRates: selectedQuote?.quote?.nightly.map((night) => night.rate) ?? [],
          },
          ...extraRoomUnits.map((unit) => ({
            subtotal: extraRoomQuotes[unit.key]?.subtotal ?? null,
            nightlyRates: extraRoomQuotes[unit.key]?.nightlyRates ?? [],
          })),
        ],
      })
    : null;
  const groupSummary = groupMode
    ? roomingSummary([
        {
          occupantName: guest?.fullName ?? null,
          roomTypeName: selectedMeta?.name || stickyRoomTypeLabel(selectedMeta),
          ratePlanName: selectedQuote?.plan.name || selectedQuote?.plan.code || "",
          adults,
          children,
          infants,
        },
        ...extraRoomUnits.map((unit) => ({
          occupantName: unit.occupant?.fullName ?? null,
          roomTypeName: extraRoomQuotes[unit.key]?.typeName || "",
          ratePlanName: extraRoomQuotes[unit.key]?.ratePlan || "",
          adults: unit.adults,
          children: unit.children,
          infants: unit.infants,
        })),
      ])
    : null;
  const groupPackageNote = packageBookingNote({
    group: groupMode,
    rooms: [
      { roomTypeId, ratePlanId: ratePlanId || null },
      ...extraRoomUnits.map((unit) => ({
        roomTypeId: unit.roomTypeId,
        ratePlanId: unit.ratePlanId,
      })),
    ],
  });

  const stepPolicyRooms =
    groupMode && !groupPoliciesShared
      ? groupPolicyRooms.map((policy, index) => {
          const extra = index === 0 ? null : extraRoomUnits[index - 1];
          const occupant =
            index === 0 ? (guest?.fullName ?? null) : (extra?.occupant?.fullName ?? null);
          const roomTypeName =
            index === 0
              ? selectedMeta?.name || stickyRoomTypeLabel(selectedMeta)
              : extraRoomQuotes[extra?.key ?? ""]?.typeName || "Not selected";
          const ratePlanName =
            index === 0
              ? selectedQuote?.plan.name || selectedQuote?.plan.code || "Not selected"
              : extraRoomQuotes[extra?.key ?? ""]?.ratePlan || "Not selected";
          return {
            title: `Room ${index + 1} · ${occupant?.trim() || "No guest"}`,
            detail: `${roomTypeName} · ${ratePlanName}`,
            cancellation: policy?.cancellation ?? "—",
            noShow: policy?.noShow ?? "—",
            earlyDeparture: policy?.earlyDeparture ?? "—",
            refundability: policy?.refundability ?? "—",
          };
        })
      : null;

  const guestRoomCharge = (() => {
    const selectedGuest = selectedQuote?.quote ? quotedGuestTotal(selectedQuote.quote) : null;
    if (!groupMode) {
      return pricingState.kind === "priced" ? quotedGuestTotal(pricingState.quote) : selectedGuest;
    }
    const parts = [
      selectedGuest,
      ...extraRoomUnits.map((unit) => {
        const quote = extraRoomQuotes[unit.key];
        return quote?.guestTotal ?? quote?.subtotal ?? null;
      }),
    ];
    const summed = groupRoomTotal(parts);
    return summed.complete && summed.total != null ? summed.total : selectedGuest;
  })();

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
          depositReference={step4Policies.depositReference}
          depositPaymentMethod={step4Policies.depositPaymentMethod}
          depositDueDate={step4Policies.depositDueDate}
          onDepositReferenceChange={(value) =>
            setStep4Policies((current) => ({ ...current, depositReference: value }))
          }
          onDepositPaymentMethodChange={(value) =>
            setStep4Policies((current) => ({ ...current, depositPaymentMethod: value }))
          }
          onDepositDueDateChange={(value) =>
            setStep4Policies((current) => ({ ...current, depositDueDate: value }))
          }
        />
      }
      priceReminder={
        <CreateReservationPriceReminder
          money={money}
          ratePlanName={
            selectedQuote?.plan.name || selectedQuote?.plan.code || "Standard Rate"
          }
          roomTypeName={
            groupMode
              ? `${stayTotals.rooms} rooms · ${selectedMeta?.name || "Group"}`
              : (selectedMeta?.name || stickyRoomTypeLabel(selectedMeta) || "Room")
          }
          ratePerNight={
            pricingState.kind === "priced" && fromNightlyRate(pricingState.quote) != null
              ? money(fromNightlyRate(pricingState.quote)!)
              : "—"
          }
          datesValid={datesValid}
          arrival={arrival}
          departure={departure}
          nights={nights}
          adults={groupMode ? stayTotals.adults : adults}
          children={groupMode ? stayTotals.children : children}
          infants={groupMode ? stayTotals.infants : infants}
          roomSubtotal={guestRoomCharge}
          isGroup={groupMode}
          totalRooms={groupMode ? stayTotals.rooms : 1}
          packages={selectedCreatePackages.map((card) => ({
            name: card.name,
            price:
              card.price == null
                ? null
                : packageChargeFigures(card.price, packageChargeRules.data).total,
            chargeBasis: card.chargeType,
          }))}
          mealPlanLabel={selectedQuote?.plan.mealPlanName ?? null}
          breakfastIncluded={Boolean(
            selectedQuote?.plan.breakfastIncluded ||
              (selectedQuote?.breakfastLabel &&
                selectedQuote.breakfastLabel !== "—" &&
                selectedQuote.breakfastLabel !== "Not included"),
          )}
          paymentReceivedAmount={step4Policies.paymentReceivedAmount}
          depositRequiredAmount={
            ratePlanDepositPolicy
              ? computeDepositRequirementAmount(
                  ratePlanDepositPolicy,
                  groupDeposit
                    ? groupDeposit.quote
                    : selectedQuote?.quote
                      ? {
                          subtotal: selectedQuote.quote.subtotal,
                          nightly: selectedQuote.quote.nightly,
                          currency: selectedQuote.quote.currency,
                        }
                      : null,
                )
              : null
          }
        />
      }
      money={money}
      cancellationName={selectedQuote?.plan.cancellationName}
      cancellationDetail={selectedQuote?.cancellationLabel}
      refundabilityLabel={selectedQuote?.refundabilityLabel}
      refundabilityKind={selectedQuote?.refundabilityKind ?? null}
      refundabilityNonRefundable={quotedNonRefundable(selectedQuote?.refundabilityKind)}
      ratePlanDepositPolicy={ratePlanDepositPolicy}
      ratePlanDepositLabel={selectedQuote?.depositPolicyName?.trim() || null}
      ratePlanNoShowLabel={selectedQuote?.noShowPolicyName?.trim() || null}
      ratePlanNoShowPenalty={noShowPenaltySummary(
        selectedQuote?.noShowPenaltyType,
        selectedQuote?.noShowPenaltyValue,
        selectedQuote?.quote?.currency || selectedQuote?.plan.currency,
      )}
      ratePlanEarlyDepartureName={selectedQuote?.earlyDeparturePolicyName?.trim() || null}
      ratePlanEarlyDeparturePenalty={earlyDeparturePenaltySummary(
        selectedQuote?.earlyDeparturePenaltyType,
        selectedQuote?.earlyDeparturePenaltyValue,
      )}
      depositQuote={
        groupDeposit
          ? groupDeposit.quote
          : selectedQuote?.quote
            ? {
                subtotal: selectedQuote.quote.subtotal,
                nightly: selectedQuote.quote.nightly,
                currency: selectedQuote.quote.currency,
              }
            : null
      }
      depositBasisNote={groupDeposit?.note ?? null}
      depositAmountKnown={groupDeposit ? groupDeposit.amountKnown : true}
      sharedPolicyNote={
        groupMode && groupPoliciesShared ? sharedPolicyNote(1 + extraRoomUnits.length) : null
      }
      roomPolicyRows={stepPolicyRooms}
      tenderOptions={guaranteeOptions}
      paymentReceivedAmount={step4Policies.paymentReceivedAmount}
      paymentReceivedTender={step4Policies.paymentReceivedTender}
      paymentReceivedReference={step4Policies.paymentReceivedReference}
      guestDepositAmount={step4Policies.guestDepositAmount}
      guestDepositTender={step4Policies.guestDepositTender}
      guestDepositReference={step4Policies.guestDepositReference}
      onPaymentReceivedAmountChange={(value) =>
        setStep4Policies((current) => ({ ...current, paymentReceivedAmount: value }))
      }
      onPaymentReceivedTenderChange={(value) =>
        setStep4Policies((current) => ({ ...current, paymentReceivedTender: value }))
      }
      onPaymentReceivedReferenceChange={(value) =>
        setStep4Policies((current) => ({ ...current, paymentReceivedReference: value }))
      }
      onGuestDepositAmountChange={(value) =>
        setStep4Policies((current) => ({ ...current, guestDepositAmount: value }))
      }
      onGuestDepositTenderChange={(value) =>
        setStep4Policies((current) => ({ ...current, guestDepositTender: value }))
      }
      onGuestDepositReferenceChange={(value) =>
        setStep4Policies((current) => ({ ...current, guestDepositReference: value }))
      }
    />
  );

  const groupReviewRooms = groupMode
    ? [
        {
          sequence: 1,
          occupantName: guest?.fullName?.trim() || "No guest",
          roomTypeName: selectedMeta?.name || stickyRoomTypeLabel(selectedMeta),
          occupancy: compactRoomOccupancy(adults, children, infants),
          ratePlanName: selectedQuote?.plan.name || selectedQuote?.plan.code || "Not selected",
          ratePerNight:
            pricingState.kind === "priced" && fromNightlyRate(pricingState.quote) != null
              ? money(fromNightlyRate(pricingState.quote)!)
              : "—",
          subtotal: selectedQuote?.quote ? quotedGuestTotal(selectedQuote.quote) : null,
          subtotalLabel:
            selectedQuote?.quote == null ? "—" : money(quotedGuestTotal(selectedQuote.quote)),
        },
        ...extraRoomUnits.map((unit, index) => {
          const quote = extraRoomQuotes[unit.key];
          return {
            sequence: index + 2,
            occupantName: unit.occupant?.fullName?.trim() || "No guest",
            roomTypeName: quote?.typeName || "Not selected",
            occupancy: compactRoomOccupancy(unit.adults, unit.children, unit.infants),
            ratePlanName: quote?.ratePlan || "Not selected",
            ratePerNight: quote?.nightly || "—",
            subtotal: quote?.guestTotal ?? quote?.subtotal ?? null,
            subtotalLabel:
              quote?.guestTotal != null
                ? money(quote.guestTotal)
                : quote?.subtotal == null
                  ? "—"
                  : money(quote.subtotal),
          };
        }),
      ]
    : null;
  const groupReviewTotal = groupReviewRooms
    ? groupRoomTotal(groupReviewRooms.map((row) => row.subtotal))
    : null;
  const linkedGroupRecord = linkedGroupQuery.data?.group ?? null;
  const linkedBlockRecord =
    linkedGroupQuery.data?.blocks?.find((block) => block.id === linkedBlockId) ?? null;

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
      rooms={groupMode ? stayTotals.rooms : (roomUnitPayload.roomUnits?.length ?? roomsRequested)}
      roomLines={
        roomUnitPayload.roomUnits && roomUnitPayload.roomUnits.length > 1
          ? [
              {
                label: "Room 1",
                typeName: selectedMeta?.name || stickyRoomTypeLabel(selectedMeta),
                occupancy: `${adults} adults, ${children} children, ${infants} infants`,
                ratePlan:
                  pricingState.kind === "priced"
                    ? pricingState.quote.ratePlanName || pricingState.quote.ratePlanCode
                    : (selectedQuote?.plan.name ?? "—"),
                total: pricingState.kind === "priced" ? money(quotedGuestTotal(pricingState.quote)) : "—",
              },
              ...extraRoomUnits.map((unit, index) => {
                const quote = extraRoomQuotes[unit.key];
                return {
                  label: `Room ${index + 2}`,
                  typeName: quote?.typeName || "Room",
                  occupancy: `${unit.adults} adults, ${unit.children} children, ${unit.infants} infants`,
                  ratePlan: quote?.ratePlan || "—",
                  total: quote?.total || "—",
                };
              }),
            ]
          : undefined
      }
      adults={groupMode ? stayTotals.adults : adults}
      children={groupMode ? stayTotals.children : children}
      infants={groupMode ? stayTotals.infants : infants}
      purposeOfStay={purposeOfStay.trim() || null}
      coverUrl={catalogRow?.coverUrl ?? null}
      roomName={selectedMeta?.name || stickyRoomTypeLabel(selectedMeta)}
      roomCode={selectedMeta?.code || null}
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
      stayTotal={pricingState.kind === "priced" ? money(quotedGuestTotal(pricingState.quote)) : "—"}
      includedItems={reviewIncludedItems([
        selectedQuote?.breakfastLabel,
        selectedQuote?.plan.mealPlanName,
        selectedQuote?.includedServicesLabel,
      ])}
      cancellationLabel={selectedQuote?.cancellationLabel ?? "—"}
      refundabilityLabel={selectedQuote?.refundabilityLabel ?? null}
      refundabilityKind={selectedQuote?.refundabilityKind ?? null}
      bookingSource={
        sourceOptions.find((row) => row.value === bookingSource)?.label ?? bookingSource
      }
      salesChannel={channelForm?.reviewChannel ?? ""}
      marketSegment={
        segmentOptions.find((row) => row.value === marketSegment)?.label ?? marketSegment
      }
      internalNotes={notes.trim() || null}
      paymentType={
        guaranteeOptions.find((row) => row.value === guaranteeMethod)?.label ?? guaranteeMethod
      }
      depositRequired={
        ratePlanDepositPolicy == null ? "—" : ratePlanDepositPolicy.required ? "Yes" : "No"
      }
      depositAmount={
        groupMode
          ? groupDeposit?.amountKnown && ratePlanDepositPolicy
            ? money(computeDepositRequirementAmount(ratePlanDepositPolicy, groupDeposit.quote))
            : "—"
          : ratePlanDepositPolicy
            ? (() => {
                const amount = computeDepositRequirementAmount(
                  ratePlanDepositPolicy,
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
          ? "Same as payment type"
          : (guaranteeOptions.find((row) => row.value === step4Policies.depositPaymentMethod)
              ?.label ?? step4Policies.depositPaymentMethod)
      }
      depositReference={step4Policies.depositReference.trim() || null}
      paymentReceivedSummary={
        step4Policies.paymentReceivedAmount.trim()
          ? `${step4Policies.paymentReceivedAmount.trim()}${
              step4Policies.paymentReceivedTender
                ? ` · ${
                    guaranteeOptions.find((row) => row.value === step4Policies.paymentReceivedTender)
                      ?.label ?? step4Policies.paymentReceivedTender
                  }`
                : ""
            }${
              step4Policies.paymentReceivedReference.trim()
                ? ` · Ref: ${step4Policies.paymentReceivedReference.trim()}`
                : ""
            }`
          : null
      }
      guestDepositSummary={
        step4Policies.guestDepositAmount.trim()
          ? `${step4Policies.guestDepositAmount.trim()}${
              step4Policies.guestDepositTender
                ? ` · ${
                    guaranteeOptions.find((row) => row.value === step4Policies.guestDepositTender)
                      ?.label ?? step4Policies.guestDepositTender
                  }`
                : ""
            }${
              step4Policies.guestDepositReference.trim()
                ? ` · Ref: ${step4Policies.guestDepositReference.trim()}`
                : ""
            }`
          : null
      }
      companyTerms={companyMaster?.paymentTerms ?? null}
      travelAgentTerms={travelAgentMaster?.paymentTerms ?? null}
      noShowPolicy={selectedQuote?.noShowPolicyName?.trim() || ""}
      noShowPenalty={noShowPenaltySummary(
        selectedQuote?.noShowPenaltyType,
        selectedQuote?.noShowPenaltyValue,
        selectedQuote?.quote?.currency || selectedQuote?.plan.currency,
      )}
      earlyDeparturePolicy={earlyDepartureReviewLabel({
        name: selectedQuote?.earlyDeparturePolicyName,
        penaltyType: selectedQuote?.earlyDeparturePenaltyType,
        penaltyValue: selectedQuote?.earlyDeparturePenaltyValue,
        description: selectedQuote?.earlyDepartureDescription,
      })}
      specialRequests={specialRequests.trim() || null}
      roomAssignment={
        roomId !== UNASSIGNED && selectedAssignedRoom
          ? stickyRoomAssignmentLabel({
              roomTypeId,
              roomId,
              unassignedValue: UNASSIGNED,
              room: selectedAssignedRoom,
            })
          : null
      }
      propertyName={membership.restaurant.name}
      propertyAddress={formatPropertyContactAddress([
        membership.restaurant.address,
        membership.restaurant.city,
        membership.restaurant.postcode,
        membership.restaurant.country,
      ])}
      propertyPhone={membership.restaurant.phone}
      propertyEmail={membership.restaurant.email}
      onEdit={setWorkflowStep}
      reservationKind={groupMode ? "group" : "single"}
      groupRooming={
        groupReviewRooms
          ? {
              rows: groupReviewRooms.map((row) => ({
                sequence: row.sequence,
                occupantName: row.occupantName,
                roomTypeName: row.roomTypeName,
                occupancy: row.occupancy,
                ratePlanName: row.ratePlanName,
                ratePerNight: row.ratePerNight,
                subtotal: row.subtotalLabel,
              })),
              totalLabel:
                groupReviewTotal?.complete && groupReviewTotal.total != null
                  ? money(groupReviewTotal.total)
                  : null,
              incomplete: !groupReviewTotal?.complete,
            }
          : null
      }
      linkedGroup={
        groupMode && linkedGroupRecord
          ? {
              name: linkedGroupRecord.name,
              code: linkedGroupRecord.confirmationNumber ?? linkedGroupRecord.code,
              block: linkedBlockRecord?.roomTypeName ?? null,
              units: [
                {
                  label: "Room 1",
                  roomTypeName: selectedMeta?.name || "Room",
                  ...unitBlockReviewCopy({
                    roomTypeName: selectedMeta?.name || "Room",
                    blockLabel: linkedBlockRecord?.roomTypeName ?? null,
                    contributesToPickup: Boolean(linkedBlockId),
                  }),
                },
                ...extraRoomUnits.map((unit, index) => {
                  const typeName = extraRoomQuotes[unit.key]?.typeName || "Room";
                  const copy = unitBlockReviewCopy({
                    roomTypeName: typeName,
                    blockLabel:
                      linkedGroupQuery.data?.blocks.find(
                        (block) => block.id === unit.pmsGroupBlockId,
                      )?.roomTypeName ?? null,
                    contributesToPickup: Boolean(unit.pmsGroupBlockId),
                  });
                  return {
                    label: `Room ${index + 2}`,
                    roomTypeName: typeName,
                    block: copy.block,
                    pickup: copy.pickup,
                  };
                }),
              ],
            }
          : null
      }
      depositNote={groupMode ? (groupDeposit?.note ?? null) : null}
      sharedPolicyNote={
        groupMode && groupPoliciesShared ? sharedPolicyNote(stayTotals.rooms) : null
      }
      policyRooms={stepPolicyRooms}
      leadGuestPreferences={groupMode}
      packageScopeNote={groupMode ? "Booking-level package" : null}
      savedPreferences={savedPreferenceRows}
      selectedServiceRequests={selectedServiceRequests}
      selectedPackages={selectedCreatePackages.map((card) => ({
        key: card.activationId ?? card.id,
        name: card.name,
        category: card.category,
        priceLabel:
          card.price == null
            ? "—"
            : money(packageChargeFigures(card.price, packageChargeRules.data).total),
        chargeBasisLabel: card.chargeType,
        inclusions: card.components.join(", "),
      }))}
    />
  );

  function roomRateLabel(
    typeId: string,
    typeName: string | null,
    liveQuote: Parameters<typeof rateCopyFromQuote>[0],
    stored: ExtraRoomQuote | null,
  ): RoomingRateLabel {
    const details = typeId ? roomTypeCatalog[typeId] : null;
    const roomTags = [details?.bedType, details?.roomView].filter((tag): tag is string =>
      Boolean(tag?.trim()),
    );
    const ratePlanTag = liveQuote?.plan.description?.trim() || null;
    if (liveQuote) {
      const copy = rateCopyFromQuote(liveQuote, money);
      return {
        roomTypeName: typeName || stored?.typeName || "",
        ratePlanName: copy.ratePlanLabel === "—" ? "" : copy.ratePlanLabel,
        nightlyLabel: copy.ratePerNight === "—" ? null : copy.ratePerNight,
        roomTags,
        ratePlanTag: ratePlanTag && ratePlanTag.length <= 40 ? ratePlanTag : null,
      };
    }
    const availabilityName = availability.find((row) => row.roomTypeId === typeId)?.name ?? "";
    const storedType = stored?.typeName && stored.typeName !== "Room" ? stored.typeName : "";
    return {
      roomTypeName: typeName || availabilityName || storedType,
      ratePlanName: stored?.ratePlan && stored.ratePlan !== "—" ? stored.ratePlan : "",
      nightlyLabel: stored?.nightly && stored.nightly !== "—" ? stored.nightly : null,
      roomTags,
    };
  }

  const guestStayAvailabilitySection = (
    <CreateReservationGuest
      restaurantId={restaurantId}
      canCreateGuest={guestAccessQuery.data?.canManage ?? false}
      guest={guest}
      onGuestChange={setGuest}
      listEnabled={workflowStep === 0}
      selectedPanelTitle={groupMode ? "Primary Guest / Booker" : "Selected Guest"}
    >
      <div
        className="min-w-0 space-y-3"
        data-testid="create-reservation-step-guest-stay-availability"
      >
        <div className="flex flex-wrap items-center gap-2" data-testid="reservation-type-selector">
          <span className="text-sm text-[#6B5E4E]">Reservation Type</span>
          <div className="inline-flex rounded-[6px] border border-[#CCCCCC] bg-white p-0.5">
            <button
              type="button"
              data-testid="reservation-mode-single"
              aria-pressed={reservationMode === "single"}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-xs font-medium",
                reservationMode === "single" ? "bg-[#C89933] text-[#251605]" : "text-[#6B5E4E]",
              )}
              onClick={() => requestReservationMode("single")}
            >
              Single Reservation
            </button>
            <button
              type="button"
              data-testid="reservation-mode-group"
              aria-pressed={reservationMode === "group"}
              className={cn(
                "rounded-[6px] px-2.5 py-1 text-xs font-medium",
                reservationMode === "group" ? "bg-[#C89933] text-[#251605]" : "text-[#6B5E4E]",
              )}
              onClick={() => requestReservationMode("group")}
            >
              Group Reservation
            </button>
          </div>
        </div>
        {linkedGroupQuery.data?.group ? (
          <CreateReservationGroupContext
            groupName={linkedGroupQuery.data.group.name}
            groupCode={
              linkedGroupQuery.data.group.confirmationNumber ?? linkedGroupQuery.data.group.code
            }
            groupStatus={linkedGroupQuery.data.group.status}
            block={launchBlock}
            hasActiveBlocks={(linkedGroupQuery.data.blocks ?? []).some(
              (block) => block.status === "active",
            )}
          />
        ) : null}
        {linkedGroupId && groupMode ? (
          <div className="grid gap-2 md:grid-cols-2" data-testid="create-reservation-unit-blocks">
            <CreateReservationUnitBlockSelect
              label="Room 1 block"
              roomTypeId={roomTypeId}
              arrival={arrival}
              departure={departure}
              blocks={linkedGroupQuery.data?.blocks ?? []}
              value={linkedBlockId}
              onChange={setLinkedBlockId}
            />
            {extraRoomUnits.map((unit, index) => (
              <CreateReservationUnitBlockSelect
                key={unit.key}
                label={`Room ${index + 2} block`}
                roomTypeId={unit.roomTypeId}
                arrival={arrival}
                departure={departure}
                blocks={linkedGroupQuery.data?.blocks ?? []}
                value={unit.pmsGroupBlockId ?? null}
                onChange={(blockId) =>
                  setExtraRoomUnits((current) =>
                    current.map((row) =>
                      row.key === unit.key ? { ...row, pmsGroupBlockId: blockId } : row,
                    ),
                  )
                }
              />
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]">
          <CreateReservationGuestSearch />
          <CreateReservationGuestSelected />
          <div className="h-full min-w-0 md:col-span-2 lg:col-span-1">{staySection}</div>
        </div>
        {reservationMode === "group" ? (
          <CreateReservationRoomingList
            restaurantId={restaurantId}
            canCreateGuest={guestAccessQuery.data?.canManage ?? false}
            leadGuestName={guest?.fullName ?? null}
            room1Adults={adults}
            room1Children={children}
            room1Infants={infants}
            room1Rate={roomRateLabel(roomTypeId, selectedMeta?.name ?? null, selectedQuote, null)}
            extras={extraRoomUnits}
            extraRates={Object.fromEntries(
              extraRoomUnits.map((unit) => [
                unit.key,
                roomRateLabel(
                  unit.roomTypeId,
                  availability.find((row) => row.roomTypeId === unit.roomTypeId)?.name ?? null,
                  unit.key === activeExtra?.key
                    ? (quotesForRoomType(unit.roomTypeId).find(
                        (row) => row.plan.id === unit.ratePlanId,
                      ) ?? null)
                    : null,
                  extraRoomQuotes[unit.key] ?? null,
                ),
              ]),
            )}
            activeRoomIndex={activeRoomIndex}
            onActivate={(index) =>
              setActiveRoomIndex(activateRoom(currentRooming(), index).activeRoomIndex)
            }
            onAdd={() => commitRooming(addGroupRoom(currentRooming(), crypto.randomUUID()))}
            onRemove={(key) => {
              commitRooming(removeGroupRoom(currentRooming(), key));
              setExtraRoomQuotes((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              });
            }}
            onRoom1Occupancy={(patch) =>
              commitRooming(applyRoomOccupancy(currentRooming(), 0, patch))
            }
            onExtraOccupancy={(key, patch) => {
              const index = extraRoomUnits.findIndex((unit) => unit.key === key) + 1;
              commitRooming(applyRoomOccupancy(currentRooming(), index, patch));
            }}
            onExtraOccupant={(key, occupant) =>
              commitRooming(assignExtraOccupant(currentRooming(), key, occupant))
            }
          />
        ) : null}
        {availabilitySearchCommitted != null ? (
          <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-3">
              {roomsAndRates}
              {shortRoomTypes.map((row, index) => {
                const tightest = tightestOverbookingFor(row.roomTypeId);
                return (
                  <OverbookingDecision
                    key={row.roomTypeId}
                    role={actorRole}
                    roomName={row.name}
                    requestedRooms={requestedRoomsForType(row.roomTypeId)}
                    physicalAvailable={row.available}
                    shortage={requestedRoomsForType(row.roomTypeId) - row.available}
                    allowance={tightest?.overbookingAllowance ?? null}
                    consumed={tightest?.overbookingConsumed ?? null}
                    remaining={tightest?.overbookingRemaining ?? null}
                    showControls={index === 0}
                    approvalRequired={approvalRequired}
                    reasonRequired={reasonRequired}
                    reason={overbookingReason}
                    armed={overbookingArmed}
                    onReason={setOverbookingReason}
                    onArm={setOverbookingArmed}
                  />
                );
              })}
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
            {(() => {
              const panelAvailability = activeExtra
                ? (availability.find((row) => row.roomTypeId === activeExtra.roomTypeId) ?? null)
                : selectedType;
              const selectedMeta = panelAvailability
                ? {
                    roomTypeId: panelAvailability.roomTypeId,
                    name: panelAvailability.name,
                    code: panelAvailability.code,
                    maxOccupancy: panelAvailability.maxOccupancy,
                    adultCapacity: panelAvailability.adultCapacity,
                    childCapacity: panelAvailability.childCapacity,
                  }
                : activeExtra
                  ? null
                  : selectedRoomType?.roomTypeId === roomTypeId
                    ? selectedRoomType
                    : null;
              const selectedQuote = activeExtra
                ? (quotesForRoomType(activeExtra.roomTypeId).find(
                    (row) => row.plan.id === (activeExtra.ratePlanId ?? ""),
                  ) ?? null)
                : (quotes.find((row) => row.plan.id === ratePlanId) ?? null);
              const catalogRow = selectedMeta?.roomTypeId
                ? (roomTypeCatalog[selectedMeta.roomTypeId] ?? null)
                : null;
              return (
                <CreateReservationSelectedRoom
                  selectedRoomType={selectedMeta}
                  available={panelAvailability?.available ?? null}
                  coverUrl={catalogRow?.coverUrl ?? panelAvailability?.coverUrl ?? null}
                  catalog={catalogRow}
                  selectedQuote={selectedQuote}
                  nights={nights}
                  money={money}
                  roomSequenceLabel={groupMode ? `Room ${activeRoomIndex + 1}` : null}
                  occupancyLabel={
                    groupMode ? formatRoomOccupancy(quoteAdults, quoteChildren, quoteInfants) : null
                  }
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
              );
            })()}
          </div>
        ) : null}
      </div>
    </CreateReservationGuest>
  );

  const bookingDetailsSection = (
    <div data-testid="create-reservation-booking-details-step">
      {groupSummary ? (
        <CreateReservationRoomingSummary
          headline={groupSummary.headline}
          lines={groupSummary.lines}
          onEditStep1={() => setWorkflowStep(0)}
        />
      ) : null}
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
        salesChannel={channelForm?.salesChannel ?? ""}
        onSalesChannelChange={setSalesChannel}
        salesChannelOptions={salesChannelOptions}
        channelEnabled={channelForm?.channelEnabled ?? false}
        channelRequired={channelForm?.channelRequired ?? false}
        channelEmptyMessage={
          channelForm?.message === OTA_CHANNEL_EMPTY_MESSAGE ? channelForm.message : null
        }
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
        showAdHocGroupNote={groupMode && !lockOperationalGroup}
        showLinkedGroupCaption={groupMode && Boolean(linkedGroupId)}
        lockOperationalGroup={lockOperationalGroup}
        unitBlockLines={
          linkedGroupId
            ? [
                `Room 1 · ${selectedMeta?.name || "Room"} · ${
                  unitBlockReviewCopy({
                    roomTypeName: selectedMeta?.name || "Room",
                    blockLabel:
                      linkedGroupQuery.data?.blocks.find((block) => block.id === linkedBlockId)
                        ?.roomTypeName ?? null,
                    contributesToPickup: Boolean(linkedBlockId),
                  }).block
                }`,
                ...extraRoomUnits.map((unit, index) => {
                  const typeName = extraRoomQuotes[unit.key]?.typeName || "Room";
                  const copy = unitBlockReviewCopy({
                    roomTypeName: typeName,
                    blockLabel:
                      linkedGroupQuery.data?.blocks.find((block) => block.id === unit.pmsGroupBlockId)
                        ?.roomTypeName ?? null,
                    contributesToPickup: Boolean(unit.pmsGroupBlockId),
                  });
                  return `Room ${index + 2} · ${typeName} · ${copy.block}`;
                }),
              ]
            : undefined
        }
        leadGuestPreferences={groupMode}
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
            title="Room Assignment (Optional)"
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
            bookingScopeNote={groupPackageNote}
            packageRules={packageChargeRules.data ?? null}
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
        relationTab={relationTab}
        onRelationTabChange={setRelationTab}
        holdCommercialDefaults={holdCommercialDefaults}
        onCommercialDefaultsHeld={() => setHoldCommercialDefaults(false)}
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

  const singleModeWarn = (
    <AlertDialog
      open={pendingSingleMode}
      onOpenChange={(open) => !open && setPendingSingleMode(false)}
    >
      <AlertDialogContent className="z-[70]" data-testid="group-to-single-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Switch to a single reservation?</AlertDialogTitle>
          <AlertDialogDescription>
            Room 1 stays. The other rooms and their occupants will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep group reservation</AlertDialogCancel>
          <AlertDialogAction onClick={confirmGroupToSingle}>Use Room 1 only</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

  const discardWarn = (
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialogContent className="z-[70]" data-testid="discard-reservation-draft">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this reservation draft?</AlertDialogTitle>
          <AlertDialogDescription>
            The in-progress reservation will be cleared. Closing the window keeps the draft.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDiscard}>Discard draft</AlertDialogAction>
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
      {draftRestored ? (
        <p className="px-4 pt-3 text-xs text-[#6B5E4E]" data-testid="reservation-draft-restored">
          Reservation draft restored
        </p>
      ) : null}
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
            <Button type="button" variant="outline" onClick={requestCancel}>
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
          <div className="flex flex-wrap items-center justify-end gap-3">
            {workflowStep === 0 && groupIssue ? (
              <p className="text-xs text-[#9B3A3A]" data-testid="group-step1-issue">
                {groupIssue}
              </p>
            ) : null}
            {workflowStep === 1 && !canContinueBookingDetails && sourceChannelNotice ? (
              <p className="text-xs text-[#9B3A3A]" data-testid="source-channel-required">
                {sourceChannelNotice}
              </p>
            ) : null}
            <Button
              className="!rounded-[6px] bg-[#C89933] text-[#251605] !shadow-none hover:bg-[#B98B2D] focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2"
              disabled={
                (workflowStep === 0 && !canContinueGuestStayAvailability) ||
                (workflowStep === 1 && !canContinueBookingDetails)
              }
              onClick={() => setWorkflowStep((step) => step + 1)}
            >
              {currentStep.continueLabel} →
            </Button>
          </div>
        ) : (
          actions
        )}
      </div>
      {typeWarn}
      {singleModeWarn}
      {discardWarn}
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
                  "flex items-center gap-2 rounded-full px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2",
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
