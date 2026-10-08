import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Briefcase, Users } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import { StayCountInput } from "@/packages/pms/components/bookings/create-reservation-stay";
import { addDays } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CREATE_RESERVATION_MIN_NIGHTS,
  RESERVATION_TYPE_LABELS,
  RESERVATION_TYPE_MODES,
  type ContextPickOption,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import { type PickedReservationGuest } from "@/packages/pms/components/bookings/create-reservation-guest";
import {
  fromNightlyRate,
  type CreateRateQuoteRow,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { getBillingCard3 } from "@/packages/pms/lib/billing-card3.functions";
import { reservationBillingHintFromRule } from "@/packages/pms/lib/cashiering-billing-hint";
import {
  activeCommissionPlan,
  commissionPercentLabel,
  nationalitySelectCode,
  nationalitySelectOptions,
  nationalityStoredName,
} from "@/packages/pms/lib/create-reservation-step3";
import { listCompanyContacts } from "@/packages/pms/lib/guest-company-detail.functions";
import {
  listTravelAgentCommissionPlans,
  listTravelAgentContacts,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  getGuestReservationPreferenceDefaults,
  updateGuest,
} from "@/packages/pms/lib/guests.functions";
import { applyPreferenceDefaults } from "@/packages/pms/lib/guest-preferences-workspace";
import { getGroup, listGroups } from "@/packages/pms/lib/groups.functions";
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
import { listAccountRatePlanHints, quoteFlexibleStay } from "@/packages/pms/lib/rates.functions";
import {
  PMS_OP_INPUT,
  PMS_OP_LABEL,
  PMS_OP_PANEL,
  PMS_OP_SELECT_TRIGGER,
  PMS_OP_TEXTAREA,
} from "@/packages/pms/lib/pms-operational-surface";
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

const SPECIAL_REQUEST_MAX = 500;

const ROOM_PREFERENCE_OPTIONS = [
  { id: "high_floor", label: "High Floor" },
  { id: "non_smoking", label: "Non-Smoking" },
  { id: "quiet_room", label: "Quiet Room" },
  { id: "connecting_rooms", label: "Connecting Rooms" },
  { id: "late_check_in", label: "Late Check-In" },
  { id: "early_check_in", label: "Early Check-In" },
] as const;

const CONTROL = cn(PMS_OP_INPUT, "!h-8 px-2 py-1");
const SELECT_CONTROL = cn(PMS_OP_SELECT_TRIGGER, "!h-8 px-2 py-0 text-xs");

const SWITCH_GOLD = "data-[state=checked]:bg-[#B8954F] data-[state=unchecked]:bg-[#DDD4C5]";

export function CreateReservationBookingDetails({
  restaurantId,
  canCreateMaster,
  guest,
  reservationType,
  onRequestTypeChange,
  bookingAgentName,
  bookingSource,
  onBookingSourceChange,
  sourceOptions,
  marketSegment,
  onMarketSegmentChange,
  segmentOptions,
  externalReference,
  onExternalReferenceChange,
  companyMaster,
  onCompanyMasterChange,
  travelAgentMaster,
  onTravelAgentMasterChange,
  linkedGroupId,
  linkedBlockId,
  roomTypeName,
  roomTypeCode,
  catalog,
  adultCapacity,
  assignedRoomLabel,
  roomAssignment,
  selectedQuote,
  money,
  nights,
  onChangeRoomRate,
  arrival,
  departure,
  datesValid,
  roomsRequested,
  adults,
  children,
  infants,
  roomUnassigned,
  onArrivalChange,
  onDepartureChange,
  onNightsChange,
  onRoomsChange,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onKeepUnassigned,
  specialRequests,
  onSpecialRequestsChange,
  salesChannel,
  onSalesChannelChange,
  salesChannelOptions,
  purposeOfStay,
  onPurposeOfStayChange,
  billingRuleId,
  onBillingRuleIdChange,
  companyContactId,
  onCompanyContactIdChange,
  travelAgentContactId,
  onTravelAgentContactIdChange,
  sameAsGuest,
  onSameAsGuestChange,
  onGuestChange,
  onApplyRatePlan,
  onLinkedGroupChange,
  quoteCurrency,
  ratePlanId,
  roomTypeId,
}: {
  restaurantId: string;
  canCreateMaster: boolean;
  guest: PickedReservationGuest | null;
  reservationType: ReservationTypeMode;
  onRequestTypeChange: (next: ReservationTypeMode) => void;
  bookingAgentName: string;
  bookingSource: string;
  onBookingSourceChange: (value: string) => void;
  sourceOptions: ContextPickOption[];
  marketSegment: string;
  onMarketSegmentChange: (value: string) => void;
  segmentOptions: ContextPickOption[];
  externalReference: string;
  onExternalReferenceChange: (value: string) => void;
  companyMaster: PickedReservationMaster | null;
  onCompanyMasterChange: (master: PickedReservationMaster | null) => void;
  travelAgentMaster: PickedReservationMaster | null;
  onTravelAgentMasterChange: (master: PickedReservationMaster | null) => void;
  linkedGroupId: string | null;
  linkedBlockId: string | null;
  salesChannel: string;
  onSalesChannelChange: (value: string) => void;
  salesChannelOptions: ContextPickOption[];
  purposeOfStay: string;
  onPurposeOfStayChange: (value: string) => void;
  billingRuleId: string;
  onBillingRuleIdChange: (value: string) => void;
  companyContactId: string;
  onCompanyContactIdChange: (value: string) => void;
  travelAgentContactId: string;
  onTravelAgentContactIdChange: (value: string) => void;
  sameAsGuest: boolean;
  onSameAsGuestChange: (value: boolean) => void;
  onGuestChange: (guest: PickedReservationGuest) => void;
  onApplyRatePlan: (ratePlanId: string) => void;
  onLinkedGroupChange: (groupId: string | null, blockId: string | null) => void;
  quoteCurrency: string;
  ratePlanId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string | null;
  catalog: {
    description: string | null;
    bedType: string | null;
    roomSize: string | null;
    roomView: string | null;
    coverUrl: string | null;
  } | null;
  adultCapacity: number | null;
  assignedRoomLabel: string;
  roomAssignment: ReactNode;
  selectedQuote: CreateRateQuoteRow | null;
  money: (value: number) => string;
  nights: number;
  onChangeRoomRate: () => void;
  arrival: string;
  departure: string;
  datesValid: boolean;
  roomsRequested: number;
  adults: number;
  children: number;
  infants: number;
  roomUnassigned: boolean;
  onArrivalChange: (value: string) => void;
  onDepartureChange: (value: string) => void;
  onNightsChange: (nights: number) => void;
  onRoomsChange: (rooms: number) => void;
  onAdultsChange: (adults: number) => void;
  onChildrenChange: (children: number) => void;
  onInfantsChange: (infants: number) => void;
  onKeepUnassigned: (unassigned: boolean) => void;
  specialRequests: string;
  onSpecialRequestsChange: (value: string) => void;
}) {
  const loadPurpose = useServerFn(listPurposeOfStay);
  const loadBilling = useServerFn(getBillingCard3);
  const loadCompanyContacts = useServerFn(listCompanyContacts);
  const loadAgentContacts = useServerFn(listTravelAgentContacts);
  const loadCommissionPlans = useServerFn(listTravelAgentCommissionPlans);
  const loadGroups = useServerFn(listGroups);
  const loadGroup = useServerFn(getGroup);
  const loadPrefDefaults = useServerFn(getGuestReservationPreferenceDefaults);
  const loadCompanyHints = useServerFn(listAccountRatePlanHints);
  const loadFlexible = useServerFn(quoteFlexibleStay);
  const saveGuest = useServerFn(updateGuest);

  const [companyEnabled, setCompanyEnabled] = useState(Boolean(companyMaster));
  const [travelEnabled, setTravelEnabled] = useState(Boolean(travelAgentMaster));
  const [groupEnabled, setGroupEnabled] = useState(Boolean(linkedGroupId));
  const [groupQuery, setGroupQuery] = useState("");
  const [flexibleDates, setFlexibleDates] = useState(false);
  const [prefilledGuestId, setPrefilledGuestId] = useState<string | null>(null);

  useEffect(() => {
    setCompanyEnabled(Boolean(companyMaster));
  }, [companyMaster]);
  useEffect(() => {
    setTravelEnabled(Boolean(travelAgentMaster));
  }, [travelAgentMaster]);
  useEffect(() => {
    setGroupEnabled(Boolean(linkedGroupId));
  }, [linkedGroupId]);

  const purposeQuery = useQuery({
    queryKey: ["pms-purpose-of-stay", restaurantId, "create-reservation"],
    queryFn: () => loadPurpose({ data: { restaurantId } }),
    retry: false,
  });
  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);

  const billingQuery = useQuery({
    queryKey: ["billing-card3", restaurantId, "create-reservation"],
    queryFn: () => loadBilling({ data: { restaurantId } }),
    retry: false,
  });
  const billingRules = (billingQuery.data?.snapshot.billingRules ?? []).filter((row) => row.active);

  const companyContactsQuery = useQuery({
    queryKey: ["company-contacts", restaurantId, companyMaster?.id],
    queryFn: () =>
      loadCompanyContacts({
        data: { restaurantId, companyId: companyMaster!.id, status: "active", limit: 50 },
      }),
    enabled: Boolean(companyMaster?.id),
    retry: false,
  });
  const companyContacts = companyContactsQuery.data?.items ?? [];

  const agentContactsQuery = useQuery({
    queryKey: ["travel-agent-contacts", restaurantId, travelAgentMaster?.id],
    queryFn: () =>
      loadAgentContacts({
        data: { restaurantId, agencyId: travelAgentMaster!.id, status: "active", limit: 50 },
      }),
    enabled: Boolean(travelAgentMaster?.id),
    retry: false,
  });
  const agentContacts = agentContactsQuery.data?.items ?? [];

  const commissionQuery = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, travelAgentMaster?.id],
    queryFn: () => loadCommissionPlans({ data: { restaurantId, agencyId: travelAgentMaster!.id } }),
    enabled: Boolean(travelAgentMaster?.id),
    retry: false,
  });
  const activePlan = activeCommissionPlan(commissionQuery.data?.items ?? [], arrival);
  const commissionDisplay = commissionPercentLabel(activePlan);

  const companyHintsQuery = useQuery({
    queryKey: ["account-rate-hints", restaurantId, companyMaster?.id],
    queryFn: () => loadCompanyHints({ data: { restaurantId, accountId: companyMaster!.id } }),
    enabled: Boolean(companyMaster?.id),
    retry: false,
  });
  const agencyHintsQuery = useQuery({
    queryKey: ["account-rate-hints", restaurantId, travelAgentMaster?.id],
    queryFn: () => loadCompanyHints({ data: { restaurantId, accountId: travelAgentMaster!.id } }),
    enabled: Boolean(travelAgentMaster?.id),
    retry: false,
  });

  const groupsQuery = useQuery({
    queryKey: ["pms-groups-search", restaurantId, groupQuery],
    queryFn: () => loadGroups({ data: { restaurantId, search: groupQuery } }),
    enabled: groupEnabled && groupQuery.trim().length >= 2,
    retry: false,
  });
  const selectedGroupQuery = useQuery({
    queryKey: ["pms-group", restaurantId, linkedGroupId],
    queryFn: () => loadGroup({ data: { restaurantId, groupId: linkedGroupId! } }),
    enabled: Boolean(linkedGroupId),
    retry: false,
  });
  const selectedGroup = selectedGroupQuery.data?.group ?? null;
  const selectedBlocks = selectedGroupQuery.data?.blocks ?? [];
  const selectedBlock = selectedBlocks.find((row) => row.id === linkedBlockId) ?? null;
  const pickup = groupsQuery.data?.groups.find((row) => row.id === linkedGroupId) ?? null;
  const pickupBlocked =
    pickup?.blockedRooms ?? selectedBlocks.reduce((sum, row) => sum + row.totals.allotted, 0);
  const pickupPicked =
    pickup?.pickedUp ?? selectedBlocks.reduce((sum, row) => sum + row.totals.pickedUp, 0);
  const pickupPct =
    pickupBlocked > 0 ? Math.min(100, Math.round((pickupPicked / pickupBlocked) * 100)) : 0;
  const cutoffDate = selectedBlock?.cutoffDate ?? selectedGroup?.cutoffDate ?? "";

  const appliedGroupRateFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedGroup?.id || !selectedGroup.ratePlanId) return;
    if (appliedGroupRateFor.current === selectedGroup.id) return;
    appliedGroupRateFor.current = selectedGroup.id;
    onApplyRatePlan(selectedGroup.ratePlanId);
  }, [onApplyRatePlan, selectedGroup?.id, selectedGroup?.ratePlanId]);

  const prefQuery = useQuery({
    queryKey: ["guest-reservation-pref-defaults", restaurantId, guest?.id],
    queryFn: () => loadPrefDefaults({ data: { restaurantId, guestId: guest!.id } }),
    enabled: Boolean(guest?.id),
    retry: false,
  });
  useEffect(() => {
    if (!guest?.id || prefilledGuestId === guest.id) return;
    const text = applyPreferenceDefaults({
      currentSpecialRequests: specialRequests,
      defaults: prefQuery.data,
    });
    if (!text) return;
    if (!specialRequests.trim()) onSpecialRequestsChange(text);
    setPrefilledGuestId(guest.id);
  }, [
    guest?.id,
    onSpecialRequestsChange,
    prefQuery.data?.specialRequests,
    prefilledGuestId,
    specialRequests,
  ]);

  const flexibleQuery = useQuery({
    queryKey: [
      "flexible-stay-quote",
      restaurantId,
      roomTypeId,
      ratePlanId,
      arrival,
      departure,
      roomsRequested,
      adults,
      children,
      infants,
      quoteCurrency,
    ],
    queryFn: () =>
      loadFlexible({
        data: {
          restaurantId,
          roomTypeId,
          ratePlanId,
          arrival,
          departure,
          rooms: roomsRequested,
          adults,
          children,
          infants,
          quoteCurrency: quoteCurrency || null,
        },
      }),
    enabled: flexibleDates && Boolean(roomTypeId && ratePlanId && datesValid),
    retry: false,
  });

  const nationalityMut = useMutation({
    mutationFn: async (code: string) => {
      if (!guest) return;
      const stored = nationalityStoredName(code);
      await saveGuest({
        data: {
          restaurantId,
          guestId: guest.id,
          guest: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            nationality: stored,
          },
        },
      });
      onGuestChange({ ...guest, nationality: stored });
    },
  });

  const bookerDisabled = sameAsGuest;
  const displayContactName = sameAsGuest ? (guest?.fullName ?? "") : "";
  const displayContactPhone = sameAsGuest ? (guest?.phone ?? "") : "";
  const displayContactCompany = sameAsGuest ? (companyMaster?.name ?? "") : "";
  const displayContactEmail = sameAsGuest ? (guest?.email ?? "") : "";
  const classificationGroupLabel = linkedGroupId ? (selectedGroup?.name ?? linkedGroupId) : "—";
  const nationalityCode = nationalitySelectCode(guest?.nationality);
  const nationalityOptions = nationalitySelectOptions(guest?.nationality);
  const usingRateLabel = selectedQuote
    ? selectedQuote.quote?.ratePlanName || selectedQuote.plan.name || selectedQuote.plan.code
    : "—";
  const billingHint = billingRules.find((row) => row.id === billingRuleId);
  const billingHintCopy = billingHint
    ? `${billingHint.name} · ${billingHint.payerKindLabel} · ${reservationBillingHintFromRule(billingHint).paymentTerms}`
    : "";
  const requestLength = specialRequests.length;
  const rateCopy = rateCopyFromQuote(selectedQuote, money);

  return (
    <div className="space-y-3" data-testid="create-reservation-booking-details">
      <div className="grid gap-3 lg:grid-cols-2">
        <BookingCard
          testId="booking-details-guest-booker"
          title="Guest & Booker Information"
          subtitle="Review and update guest and booking information."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
                Guest Information
              </p>
              <Field label="Guest Name">
                <div className="flex gap-2">
                  <Input
                    className={CONTROL}
                    readOnly
                    data-testid="booking-details-guest-name"
                    value={guest?.fullName ?? "—"}
                    aria-label="Guest Name"
                  />
                  {guest ? (
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                    >
                      <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: guest.id }}>
                        View Profile
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled
                    >
                      View Profile
                    </Button>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Phone">
                  <Input
                    className={CONTROL}
                    readOnly
                    value={guest?.phone ?? "—"}
                    aria-label="Phone"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    className={CONTROL}
                    readOnly
                    value={guest?.email ?? "—"}
                    aria-label="Email"
                  />
                </Field>
                <Field label="ID / Passport No.">
                  <Input
                    className={CONTROL}
                    readOnly
                    value={guest?.idDocumentNumber ?? "—"}
                    aria-label="ID / Passport No."
                  />
                </Field>
                <Field label="Nationality">
                  <select
                    className={CONTROL}
                    value={nationalityCode || (guest?.nationality ? "__current" : "")}
                    disabled={!guest || nationalityMut.isPending}
                    aria-label="Nationality"
                    onChange={(event) => {
                      const code = event.target.value;
                      if (!code || code === "__current") return;
                      nationalityMut.mutate(code);
                    }}
                  >
                    <option value="">—</option>
                    {nationalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <div className="space-y-2 border-t border-[#E7E0D4] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
                  Booking Contact (if different)
                </p>
                <label className="flex items-center gap-2 text-[11px] text-[#251605]">
                  Same as guest
                  <Switch
                    className={SWITCH_GOLD}
                    checked={sameAsGuest}
                    onCheckedChange={onSameAsGuestChange}
                    aria-label="Same as guest"
                    data-testid="booker-same-as-guest"
                  />
                </label>
              </div>
              {!sameAsGuest ? (
                <p
                  className="text-[10px] leading-snug text-muted-foreground"
                  data-testid="booker-not-persisted-hint"
                >
                  Separate booker contact fields are display-only. Create saves a booker only when
                  Same as guest is on.
                </p>
              ) : null}
              <Field label="Contact Name">
                <Input
                  className={CONTROL}
                  disabled={bookerDisabled}
                  readOnly
                  value={displayContactName}
                  placeholder={
                    sameAsGuest ? undefined : "Select a guest profile to persist a booker"
                  }
                />
              </Field>
              <Field label="Phone">
                <Input
                  className={CONTROL}
                  disabled={bookerDisabled}
                  readOnly
                  value={displayContactPhone}
                />
              </Field>
              <Field label="Company">
                <Input
                  className={CONTROL}
                  disabled={bookerDisabled}
                  readOnly
                  value={displayContactCompany}
                />
              </Field>
              <Field label="Email">
                <Input
                  className={CONTROL}
                  disabled={bookerDisabled}
                  readOnly
                  value={displayContactEmail}
                />
              </Field>
            </div>
          </div>
        </BookingCard>

        <BookingCard
          testId="booking-details-source-classification"
          title="Booking Source & Classification"
          subtitle="Define how this reservation was made."
        >
          <div className="mb-3 space-y-1 border-b border-[#E7E0D4] pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
              Reservation type
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Reservation type">
              {RESERVATION_TYPE_MODES.map((mode) => {
                const selected = reservationType === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`reservation-type-${mode}`}
                    aria-pressed={selected}
                    onClick={() => onRequestTypeChange(mode)}
                    className={cn(
                      "!rounded-[6px] border px-3 py-1.5 text-xs transition-colors",
                      selected
                        ? "border-[#C89933] bg-[#F6F3EC] font-medium text-[#251605]"
                        : "border-[#CCCCCC] bg-white text-[#251605] hover:bg-[#F6F3EC]/60",
                    )}
                  >
                    {RESERVATION_TYPE_LABELS[mode]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Source">
              <Select value={bookingSource || undefined} onValueChange={onBookingSourceChange}>
                <SelectTrigger className={SELECT_CONTROL} data-testid="booking-details-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Market Segment">
              <Select value={marketSegment || undefined} onValueChange={onMarketSegmentChange}>
                <SelectTrigger className={SELECT_CONTROL} data-testid="booking-details-segment">
                  <SelectValue placeholder="Select segment" />
                </SelectTrigger>
                <SelectContent>
                  {segmentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Channel">
              <Select value={salesChannel || undefined} onValueChange={onSalesChannelChange}>
                <SelectTrigger className={SELECT_CONTROL} aria-label="Channel">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {salesChannelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Company">
              <Input
                className={CONTROL}
                readOnly
                data-testid="classification-company-summary"
                value={companyMaster?.name ?? "—"}
                aria-label="Company"
              />
            </Field>
            <Field label="Travel Agency">
              <Input
                className={CONTROL}
                readOnly
                data-testid="classification-travel-agent-summary"
                value={travelAgentMaster?.name ?? "—"}
                aria-label="Travel Agency"
              />
            </Field>
            <Field label="Group">
              <Input
                className={CONTROL}
                readOnly
                data-testid="classification-group-summary"
                value={classificationGroupLabel}
                aria-label="Group"
              />
            </Field>
            <Field label="Purpose of Stay">
              <Select value={purposeOfStay || undefined} onValueChange={onPurposeOfStayChange}>
                <SelectTrigger className={SELECT_CONTROL} aria-label="Purpose of Stay">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {purposeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="External Reference">
              <Input
                className={CONTROL}
                data-testid="booking-details-external-ref"
                value={externalReference}
                maxLength={120}
                onChange={(event) => onExternalReferenceChange(event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Booking Agent">
              <Input
                className={CONTROL}
                id="booking-agent"
                data-testid="booking-agent"
                value={bookingAgentName}
                readOnly
                aria-label="Booking agent"
              />
            </Field>
          </div>
        </BookingCard>
      </div>

      <BookingCard
        testId="booking-details-relationships"
        title="Booking Relationships (Optional)"
        subtitle="Link this reservation to a company, travel agent, or group for billing and reporting."
        icon={<Building2 className="size-4 text-[#B8954F]" />}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <RelationshipPanel
            title="Company / Corporate"
            icon={<Building2 className="size-3.5" />}
            tint="bg-[#F6F3EC]"
            enabled={companyEnabled}
            onEnabledChange={(next) => {
              setCompanyEnabled(next);
              if (!next) onCompanyMasterChange(null);
            }}
          >
            <CreateReservationMasterPicker
              restaurantId={restaurantId}
              kind="company"
              canCreate={canCreateMaster}
              hideCreate
              compact
              disabled={!companyEnabled}
              master={companyMaster}
              onMasterChange={onCompanyMasterChange}
            />
            <Field label="Company Contact">
              <select
                className={CONTROL}
                disabled={!companyEnabled}
                value={companyContactId}
                onChange={(event) => onCompanyContactIdChange(event.target.value)}
                aria-label="Company Contact"
              >
                <option value="">—</option>
                {companyContacts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Corporate Rate">
              <select
                className={CONTROL}
                disabled={!companyEnabled}
                value={ratePlanId}
                onChange={(event) => {
                  if (event.target.value) onApplyRatePlan(event.target.value);
                }}
                aria-label="Corporate Rate"
              >
                <option value={ratePlanId || ""}>{usingRateLabel}</option>
                {(companyHintsQuery.data?.hints ?? [])
                  .filter((row) => row.planId && row.planId !== ratePlanId)
                  .map((row) => (
                    <option key={row.planId} value={row.planId!}>
                      {row.label}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Billing Arrangement">
                <select
                  className={CONTROL}
                  disabled={!companyEnabled}
                  value={billingRuleId}
                  onChange={(event) => onBillingRuleIdChange(event.target.value)}
                  aria-label="Billing Arrangement"
                >
                  <option value="">—</option>
                  {billingRules.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                {billingHintCopy ? (
                  <p className="text-[10px] text-muted-foreground">
                    {billingHintCopy}. Folios post in Cashiering.
                  </p>
                ) : null}
              </Field>
              <Field label="Travel Purpose">
                <select
                  className={CONTROL}
                  disabled={!companyEnabled}
                  value={purposeOfStay}
                  onChange={(event) => onPurposeOfStayChange(event.target.value)}
                  aria-label="Travel Purpose"
                >
                  <option value="">—</option>
                  {purposeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </RelationshipPanel>

          <RelationshipPanel
            title="Travel Agent / Agency"
            icon={<Briefcase className="size-3.5" />}
            tint="bg-[#F4F1F6]"
            enabled={travelEnabled}
            onEnabledChange={(next) => {
              setTravelEnabled(next);
              if (!next) onTravelAgentMasterChange(null);
            }}
          >
            <CreateReservationMasterPicker
              restaurantId={restaurantId}
              kind="travel_agent"
              canCreate={canCreateMaster}
              hideCreate
              compact
              disabled={!travelEnabled}
              master={travelAgentMaster}
              onMasterChange={onTravelAgentMasterChange}
            />
            <Field label="Agent Contact">
              <select
                className={CONTROL}
                disabled={!travelEnabled}
                value={travelAgentContactId}
                onChange={(event) => onTravelAgentContactIdChange(event.target.value)}
                aria-label="Agent Contact"
              >
                <option value="">—</option>
                {agentContacts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Agency Rate">
              <select
                className={CONTROL}
                disabled={!travelEnabled}
                value={ratePlanId}
                onChange={(event) => {
                  if (event.target.value) onApplyRatePlan(event.target.value);
                }}
                aria-label="Agency Rate"
              >
                <option value={ratePlanId || ""}>{usingRateLabel}</option>
                {(agencyHintsQuery.data?.hints ?? [])
                  .filter((row) => row.planId && row.planId !== ratePlanId)
                  .map((row) => (
                    <option key={row.planId} value={row.planId!}>
                      {row.label}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Commission">
                <div className="relative">
                  <Input
                    className={cn(CONTROL, "pr-7")}
                    disabled
                    readOnly
                    value={travelEnabled ? commissionDisplay : ""}
                    placeholder="—"
                    aria-label="Commission"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
              <Field label="External Reference">
                <Input
                  className={CONTROL}
                  disabled={!travelEnabled}
                  value={externalReference}
                  maxLength={120}
                  onChange={(event) => onExternalReferenceChange(event.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </RelationshipPanel>

          <RelationshipPanel
            title="Group / Block"
            icon={<Users className="size-3.5" />}
            tint="bg-[#F3F4F1]"
            enabled={groupEnabled}
            onEnabledChange={(next) => {
              setGroupEnabled(next);
              if (!next) onLinkedGroupChange(null, null);
            }}
          >
            <Field label="Group">
              <Input
                className={CONTROL}
                disabled={!groupEnabled}
                value={linkedGroupId ? (selectedGroup?.name ?? linkedGroupId) : groupQuery}
                onChange={(event) => {
                  setGroupQuery(event.target.value);
                  if (linkedGroupId) onLinkedGroupChange(null, null);
                }}
                placeholder="Search group"
              />
              {groupEnabled && (groupsQuery.data?.groups ?? []).length > 0 && !linkedGroupId ? (
                <div className="mt-1 max-h-24 overflow-auto rounded border border-[#E7E0D4] bg-white">
                  {(groupsQuery.data?.groups ?? []).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="block w-full px-2 py-1 text-left text-[11px] hover:bg-[#F6F3EC]"
                      onClick={() => {
                        onLinkedGroupChange(row.id, null);
                        setGroupQuery(row.name);
                      }}
                    >
                      {row.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field label="Block">
              <select
                className={CONTROL}
                disabled={!groupEnabled || !linkedGroupId}
                value={linkedBlockId ?? ""}
                onChange={(event) => onLinkedGroupChange(linkedGroupId, event.target.value || null)}
                aria-label="Block"
              >
                <option value="">—</option>
                {selectedBlocks.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.roomTypeName ?? row.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Group Rate">
              <Input
                className={CONTROL}
                disabled
                readOnly
                value={selectedGroup?.ratePlanId ? usingRateLabel : ""}
                placeholder="Uses selected rate plan"
              />
            </Field>
            <Field label="Cut-off Date">
              <Input className={CONTROL} type="date" disabled readOnly value={cutoffDate} />
            </Field>
            <div className="rounded-md border border-[#E7E0D4] bg-white/70 px-2 py-2">
              <p className="text-[11px] font-medium text-[#6B5E4E]">Pickup Status</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E7E0D4]">
                <div
                  className="h-full rounded-full bg-[#B8954F]"
                  style={{ width: `${pickupPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {linkedGroupId ? `${pickupPicked} of ${pickupBlocked || "—"} rooms picked up` : "—"}
              </p>
            </div>
          </RelationshipPanel>
        </div>
      </BookingCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BookingCard
          testId="booking-details-room-rate"
          title="Room & Rate Details"
          subtitle="Selected room and rate from availability search."
        >
          <div className="flex gap-3">
            {catalog?.coverUrl ? (
              <img
                src={catalog.coverUrl}
                alt=""
                className="h-16 w-20 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="h-16 w-20 shrink-0 rounded-md bg-[#EFE8DC]" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="font-medium text-[#251605]">{roomTypeName}</p>
              {roomTypeCode ? (
                <p className="text-[11px] text-muted-foreground">{roomTypeCode}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[
                  adultCapacity != null ? `${adultCapacity} Adults` : null,
                  catalog?.bedType,
                  catalog?.roomSize,
                  catalog?.roomView,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              {catalog?.description ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {catalog.description}
                </p>
              ) : null}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-[11px] sm:grid-cols-3">
            <Metric label="Rate Plan" value={rateCopy.ratePlanLabel} />
            <Metric label="Rate Per Night" value={rateCopy.ratePerNight} />
            <Metric label="Nights" value={String(nights)} />
            <Metric label="Total Amount" value={rateCopy.totalAmount} />
            <Metric label="Cancellation Policy" value={rateCopy.cancellationPolicy} />
            <Metric label="Room" value={assignedRoomLabel} />
          </dl>
          <div className="mt-2">{roomAssignment}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8"
            onClick={onChangeRoomRate}
            data-testid="booking-details-change-room-rate"
          >
            Change Room / Rate
          </Button>
        </BookingCard>

        <BookingCard
          testId="booking-details-stay"
          title="Stay Details"
          subtitle="Update stay information if needed."
        >
          {/* TODO: stay edits already clear ratePlanId; backend re-quote/revalidation must complete before treating totals as confirmed. */}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Arrival Date">
              <Input
                className={CONTROL}
                type="date"
                value={arrival}
                onChange={(event) => onArrivalChange(event.target.value)}
              />
            </Field>
            <Field label="Departure Date">
              <Input
                className={CONTROL}
                type="date"
                min={arrival ? addDays(arrival, CREATE_RESERVATION_MIN_NIGHTS) : undefined}
                value={departure}
                onChange={(event) => onDepartureChange(event.target.value)}
              />
            </Field>
            <Field label="Nights">
              <StayCountInput
                id="booking-details-nights"
                value={nights}
                min={CREATE_RESERVATION_MIN_NIGHTS}
                onCommit={onNightsChange}
              />
            </Field>
            <Field label="Rooms">
              <StayCountInput
                id="booking-details-rooms"
                value={roomsRequested}
                min={1}
                max={20}
                onCommit={onRoomsChange}
              />
            </Field>
            <Field label="Adults">
              <StayCountInput
                id="booking-details-adults"
                value={adults}
                min={1}
                onCommit={onAdultsChange}
              />
            </Field>
            <Field label="Children">
              <StayCountInput
                id="booking-details-children"
                value={children}
                min={0}
                onCommit={onChildrenChange}
              />
            </Field>
            <Field label="Infants">
              <StayCountInput
                id="booking-details-infants"
                value={infants}
                min={0}
                onCommit={onInfantsChange}
              />
            </Field>
          </div>
          <div className="mt-3 space-y-2">
            <label
              className="flex items-center gap-2 text-sm text-[#251605]"
              data-testid="flexible-dates-toggle"
            >
              <Checkbox
                checked={flexibleDates}
                onCheckedChange={(value) => setFlexibleDates(value === true)}
              />
              Flexible Dates
            </label>
            {flexibleDates ? (
              <div className="space-y-1 rounded-md border border-[#E7E0D4] bg-white/70 p-2">
                {(flexibleQuery.data?.windows ?? []).map((window) => (
                  <button
                    key={`${window.arrival}-${window.departure}`}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-[#F6F3EC]"
                    disabled={!window.available}
                    onClick={() => {
                      onArrivalChange(window.arrival);
                      onDepartureChange(window.departure);
                    }}
                  >
                    <span>
                      {window.arrival} → {window.departure}
                    </span>
                    <span>
                      {window.available && window.subtotal != null
                        ? money(window.subtotal)
                        : "Unavailable"}
                    </span>
                  </button>
                ))}
                {flexibleQuery.isFetching ? (
                  <p className="text-[10px] text-muted-foreground">Loading adjacent dates…</p>
                ) : null}
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-[#251605]">
              <Checkbox
                checked={roomUnassigned}
                onCheckedChange={(value) => onKeepUnassigned(value === true)}
              />
              Keep room unassigned
            </label>
          </div>
          {!datesValid ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Set a valid arrival and departure range.
            </p>
          ) : null}
        </BookingCard>

        <BookingCard
          testId="booking-details-special-requests"
          title="Special Requests & Preferences"
          subtitle="Add guest preferences and special requests."
        >
          <Field label="Special Requests">
            <Textarea
              className={cn(PMS_OP_TEXTAREA, "min-h-[88px] resize-none text-sm")}
              maxLength={SPECIAL_REQUEST_MAX}
              value={specialRequests}
              onChange={(event) =>
                onSpecialRequestsChange(event.target.value.slice(0, SPECIAL_REQUEST_MAX))
              }
              placeholder="e.g. High floor, extra bed, airport pickup..."
            />
            <p className="text-right text-[10px] text-muted-foreground">
              {requestLength}/{SPECIAL_REQUEST_MAX}
            </p>
          </Field>
          <div className="mt-2" data-testid="room-preferences-ui-only">
            <p className="text-[11px] font-medium text-[#6B5E4E]">Room Preferences</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Reference only — not included in the reservation create payload.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ROOM_PREFERENCE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 text-[12px] text-[#251605] opacity-60"
                >
                  <Checkbox checked={false} disabled aria-label={option.label} />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </BookingCard>
      </div>
    </div>
  );
}

function rateCopyFromQuote(
  selectedQuote: CreateRateQuoteRow | null,
  money: (value: number) => string,
) {
  const quote = selectedQuote?.quote ?? null;
  return {
    ratePlanLabel: quote
      ? quote.ratePlanName || quote.ratePlanCode
      : selectedQuote?.plan.name || "—",
    ratePerNight: quote && fromNightlyRate(quote) != null ? money(fromNightlyRate(quote)!) : "—",
    totalAmount: quote
      ? `${money(quote.subtotal)}${quote.currency ? ` ${quote.currency}` : ""}`
      : "—",
    cancellationPolicy:
      selectedQuote?.cancellationLabel && selectedQuote.cancellationLabel !== "—"
        ? selectedQuote.cancellationLabel
        : "—",
  };
}

function BookingCard({
  testId,
  title,
  subtitle,
  icon,
  children,
}: {
  testId?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(PMS_OP_PANEL, "p-3")} data-testid={testId}>
      <div className="flex items-start gap-2">
        {icon}
        <div>
          <h2 className="font-display text-base text-[#251605]">{title}</h2>
          {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RelationshipPanel({
  title,
  icon,
  tint,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  icon: ReactNode;
  tint: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-md border border-[#DDD4C5] p-3", tint, !enabled && "opacity-70")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[#251605]">
          {icon}
          {title}
        </div>
        <Switch
          className={SWITCH_GOLD}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label={`${title} enabled`}
        />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className={cn(PMS_OP_LABEL, "text-[11px] text-[#6B5E4E]")}>{label}</p>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-[#251605]">{value}</dd>
    </div>
  );
}
