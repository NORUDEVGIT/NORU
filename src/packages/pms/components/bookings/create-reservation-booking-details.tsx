import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ClipboardList, FileText, Package, Radio, RefreshCw, Users } from "lucide-react";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import {
  type ContextPickOption,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import { type PickedReservationGuest } from "@/packages/pms/components/bookings/create-reservation-guest";
import { getBillingCard3 } from "@/packages/pms/lib/billing-card3.functions";
import {
  activeCommissionPlan,
  agencyRateDisplayLabel,
  commissionPercentLabel,
  companyContactOptionLabel,
  formatCompanyContractRate,
} from "@/packages/pms/lib/create-reservation-step3";
import { listCompanyContacts } from "@/packages/pms/lib/guest-company-detail.functions";
import {
  listTravelAgentCommissionPlans,
  listTravelAgentContacts,
} from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import {
  getGuestReservationPreferenceDefaults,
  type GuestServiceTypeOption,
} from "@/packages/pms/lib/guests.functions";
import {
  applyPreferenceDefaults,
  mergeSpecialRequests,
  preferenceApplyText,
  type SavedPreferenceDisplay,
} from "@/packages/pms/lib/guest-preferences-workspace";
import { getGroup, listGroups } from "@/packages/pms/lib/groups.functions";
import { listAccountRatePlanHints } from "@/packages/pms/lib/rates.functions";
import {
  PMS_OP_INPUT,
  PMS_OP_LABEL,
  PMS_OP_PANEL,
  PMS_OP_SELECT_TRIGGER,
  PMS_OP_TEXTAREA,
} from "@/packages/pms/lib/pms-operational-surface";
import { Checkbox } from "@/shared/components/ui/checkbox";
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

const SPECIAL_REQUEST_MAX = 500;
const SUMMARY_NONE = "__summary_none__";
const NORU_MENU = "z-[80] max-h-60 rounded-[6px] border-[#CCCCCC] bg-white text-sm text-[#251605]";

export type CreateServiceSelection = {
  serviceTypeId: string;
  name: string;
  description: string;
};

const CONTROL = PMS_OP_INPUT;
const SELECT_CONTROL = PMS_OP_SELECT_TRIGGER;

export function CreateReservationBookingDetails({
  restaurantId,
  canCreateMaster,
  guest,
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
  roomAssignment,
  arrival,
  specialRequests,
  onSpecialRequestsChange,
  notes,
  onNotesChange,
  savedPreferences,
  savedPreferencesLoading,
  serviceTypes,
  serviceTypesLoading,
  selectedServiceRequests,
  onSelectedServiceRequestsChange,
  packagesSlot,
  relationTab: relationTabProp,
  onRelationTabChange,
  holdCommercialDefaults = false,
  onCommercialDefaultsHeld,
  showAdHocGroupNote = false,
  showLinkedGroupCaption = false,
  leadGuestPreferences = false,
  salesChannel,
  onSalesChannelChange,
  salesChannelOptions,
  channelEnabled = true,
  channelRequired = true,
  channelEmptyMessage = null,
  purposeOfStay: _purposeOfStay,
  onPurposeOfStayChange: _onPurposeOfStayChange,
  billingRuleId,
  onBillingRuleIdChange,
  companyContactId,
  onCompanyContactIdChange,
  travelAgentContactId,
  onTravelAgentContactIdChange,
  onApplyRatePlan,
  onLinkedGroupChange,
  ratePlanId,
  ratePlanLabel,
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
  channelEnabled?: boolean;
  channelRequired?: boolean;
  channelEmptyMessage?: string | null;
  purposeOfStay: string;
  onPurposeOfStayChange: (value: string) => void;
  billingRuleId: string;
  onBillingRuleIdChange: (value: string) => void;
  companyContactId: string;
  onCompanyContactIdChange: (value: string) => void;
  travelAgentContactId: string;
  onTravelAgentContactIdChange: (value: string) => void;
  onApplyRatePlan: (ratePlanId: string) => void;
  onLinkedGroupChange: (groupId: string | null, blockId: string | null) => void;
  ratePlanId: string;
  ratePlanLabel: string;
  roomTypeId: string;
  roomAssignment: ReactNode;
  arrival: string;
  specialRequests: string;
  onSpecialRequestsChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  savedPreferences: SavedPreferenceDisplay[];
  savedPreferencesLoading: boolean;
  serviceTypes: GuestServiceTypeOption[];
  serviceTypesLoading: boolean;
  selectedServiceRequests: CreateServiceSelection[];
  onSelectedServiceRequestsChange: (next: CreateServiceSelection[]) => void;
  packagesSlot: ReactNode;
  relationTab?: "company" | "travel_agent" | "group";
  onRelationTabChange?: (tab: "company" | "travel_agent" | "group") => void;
  holdCommercialDefaults?: boolean;
  onCommercialDefaultsHeld?: () => void;
  showAdHocGroupNote?: boolean;
  showLinkedGroupCaption?: boolean;
  leadGuestPreferences?: boolean;
}) {
  const loadBilling = useServerFn(getBillingCard3);
  const loadCompanyContacts = useServerFn(listCompanyContacts);
  const loadAgentContacts = useServerFn(listTravelAgentContacts);
  const loadCommissionPlans = useServerFn(listTravelAgentCommissionPlans);
  const loadGroups = useServerFn(listGroups);
  const loadGroup = useServerFn(getGroup);
  const loadPrefDefaults = useServerFn(getGuestReservationPreferenceDefaults);
  const loadCompanyHints = useServerFn(listAccountRatePlanHints);
  const [localRelationTab, setLocalRelationTab] = useState<"company" | "travel_agent" | "group">(
    "company",
  );
  const relationTab = relationTabProp ?? localRelationTab;
  const setRelationTab = onRelationTabChange ?? setLocalRelationTab;
  const [groupQuery, setGroupQuery] = useState("");
  const [prefilledGuestId, setPrefilledGuestId] = useState<string | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const groupSearchRef = useRef<HTMLInputElement>(null);
  const focusGroupSearch = useRef(false);

  const billingQuery = useQuery({
    queryKey: ["billing-card3", restaurantId, "create-reservation"],
    queryFn: () => loadBilling({ data: { restaurantId } }),
    enabled: Boolean(companyMaster?.id),
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
    queryKey: ["account-rate-hints", restaurantId, companyMaster?.id, arrival],
    queryFn: () =>
      loadCompanyHints({
        data: {
          restaurantId,
          accountId: companyMaster!.id,
          ...(arrival ? { arrival } : {}),
        },
      }),
    enabled: Boolean(companyMaster?.id),
    retry: false,
  });
  const agencyHintsQuery = useQuery({
    queryKey: ["account-rate-hints", restaurantId, travelAgentMaster?.id, arrival, roomTypeId],
    queryFn: () =>
      loadCompanyHints({
        data: {
          restaurantId,
          accountId: travelAgentMaster!.id,
          ...(arrival ? { arrival } : {}),
          ...(roomTypeId ? { roomTypeId } : {}),
        },
      }),
    enabled: Boolean(travelAgentMaster?.id),
    retry: false,
  });

  const groupsQuery = useQuery({
    queryKey: ["pms-groups-search", restaurantId, groupQuery],
    queryFn: () => loadGroups({ data: { restaurantId, search: groupQuery } }),
    enabled: groupQuery.trim().length >= 2,
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

  const appliedCompanyDefaultsFor = useRef<string | null>(null);
  useEffect(() => {
    const companyId = companyMaster?.id ?? null;
    if (!companyId) {
      appliedCompanyDefaultsFor.current = null;
      return;
    }
    const defaults = companyHintsQuery.data;
    if (!defaults || appliedCompanyDefaultsFor.current === companyId) return;
    appliedCompanyDefaultsFor.current = companyId;
    if (holdCommercialDefaults) {
      onCommercialDefaultsHeld?.();
      return;
    }
    onBillingRuleIdChange(defaults.defaultBillingRuleId ?? "");
    const planId = defaults.hints.find((row) => row.planId)?.planId;
    if (planId) onApplyRatePlan(planId);
  }, [
    companyHintsQuery.data,
    companyMaster?.id,
    holdCommercialDefaults,
    onApplyRatePlan,
    onBillingRuleIdChange,
    onCommercialDefaultsHeld,
  ]);

  const appliedCompanyContactFor = useRef<string | null>(null);
  useEffect(() => {
    const companyId = companyMaster?.id ?? null;
    if (!companyId) {
      appliedCompanyContactFor.current = null;
      return;
    }
    if (companyContacts.length === 0 || appliedCompanyContactFor.current === companyId) return;
    appliedCompanyContactFor.current = companyId;
    if (companyContactId && companyContacts.some((row) => row.id === companyContactId)) return;
    const primary = companyContacts.find((row) => row.isPrimary) ?? companyContacts[0];
    if (primary) onCompanyContactIdChange(primary.id);
  }, [companyContactId, companyContacts, companyMaster?.id, onCompanyContactIdChange]);

  const appliedAgencyDefaultsFor = useRef<string | null>(null);
  useEffect(() => {
    const agencyId = travelAgentMaster?.id ?? null;
    if (!agencyId || relationTab !== "travel_agent") {
      if (!agencyId) appliedAgencyDefaultsFor.current = null;
      return;
    }
    const defaults = agencyHintsQuery.data;
    if (!defaults || appliedAgencyDefaultsFor.current === agencyId) return;
    appliedAgencyDefaultsFor.current = agencyId;
    if (holdCommercialDefaults) {
      onCommercialDefaultsHeld?.();
      return;
    }
    const planId = defaults.hints.find((row) => row.planId)?.planId;
    if (planId) onApplyRatePlan(planId);
  }, [
    agencyHintsQuery.data,
    holdCommercialDefaults,
    onApplyRatePlan,
    onCommercialDefaultsHeld,
    relationTab,
    travelAgentMaster?.id,
  ]);

  const appliedAgencyContactFor = useRef<string | null>(null);
  useEffect(() => {
    const agencyId = travelAgentMaster?.id ?? null;
    if (!agencyId) {
      appliedAgencyContactFor.current = null;
      return;
    }
    if (agentContacts.length === 0 || appliedAgencyContactFor.current === agencyId) return;
    appliedAgencyContactFor.current = agencyId;
    if (travelAgentContactId && agentContacts.some((row) => row.id === travelAgentContactId))
      return;
    const primary = agentContacts.find((row) => row.isPrimary) ?? agentContacts[0];
    if (primary) onTravelAgentContactIdChange(primary.id);
  }, [agentContacts, onTravelAgentContactIdChange, travelAgentContactId, travelAgentMaster?.id]);

  const appliedGroupRateFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedGroup?.id || !selectedGroup.ratePlanId) return;
    if (appliedGroupRateFor.current === selectedGroup.id) return;
    appliedGroupRateFor.current = selectedGroup.id;
    if (holdCommercialDefaults) {
      onCommercialDefaultsHeld?.();
      return;
    }
    onApplyRatePlan(selectedGroup.ratePlanId);
  }, [
    holdCommercialDefaults,
    onApplyRatePlan,
    onCommercialDefaultsHeld,
    selectedGroup?.id,
    selectedGroup?.ratePlanId,
  ]);

  useEffect(() => {
    if (linkedGroupId || !focusGroupSearch.current) return;
    groupSearchRef.current?.focus();
    focusGroupSearch.current = false;
  }, [linkedGroupId]);

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

  const companyHints = companyHintsQuery.data?.hints ?? [];
  const contractRates = companyHintsQuery.data?.contractRates ?? [];
  const matchedContractRate =
    contractRates.find((row) => row.roomTypeId === roomTypeId) ?? contractRates[0] ?? null;
  const selectedCompanyHint = companyHints.find((row) => row.planId && row.planId === ratePlanId);
  const openAgreementHint = companyHints.find((row) => !row.planId);
  const usingRateLabel =
    (matchedContractRate ? formatCompanyContractRate(matchedContractRate) : "") ||
    selectedCompanyHint?.label ||
    openAgreementHint?.label ||
    ratePlanLabel.trim() ||
    "—";
  const agencyHints = agencyHintsQuery.data?.hints ?? [];
  const agencyContractRates = agencyHintsQuery.data?.contractRates ?? [];
  const matchedAgencyRate =
    agencyContractRates.find((row) => row.roomTypeId === roomTypeId) ??
    agencyContractRates[0] ??
    null;
  const selectedAgencyHint = agencyHints.find((row) => row.planId && row.planId === ratePlanId);
  const openAgencyHint = agencyHints.find((row) => !row.planId);
  const agencyRateLabel = agencyRateDisplayLabel({
    contractLabel: matchedAgencyRate ? formatCompanyContractRate(matchedAgencyRate) : "",
    selectedHint: selectedAgencyHint?.label,
    openHint: openAgencyHint?.label,
    ratePlanLabel,
    appliesToAll: Boolean(activePlan?.appliesToAll),
  });
  const billingHint = billingRules.find((row) => row.id === billingRuleId);
  const selectedCompanyContact = companyContacts.find((row) => row.id === companyContactId) ?? null;
  const selectedAgentContact = agentContacts.find((row) => row.id === travelAgentContactId) ?? null;
  const companyContactSummary = contactSummary(selectedCompanyContact);
  const agentContactSummary = contactSummary(selectedAgentContact);
  const companyRateSummary = splitSummary(usingRateLabel);
  const agencyRateSummary = splitSummary(agencyRateLabel);
  const requestLength = specialRequests.length;
  const commissionTypeLabel = activePlan?.commissionType
    ? activePlan.commissionType
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "—";
  const commissionValue =
    activePlan?.commissionType === "percent" && commissionDisplay
      ? `${commissionDisplay}%`
      : commissionDisplay || "—";
  void _purposeOfStay;
  void _onPurposeOfStayChange;

  return (
    <div
      className="flex flex-col gap-3 pb-24 lg:grid lg:grid-cols-2 lg:items-start"
      data-testid="create-reservation-booking-details"
    >
      <div
        className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3"
        data-testid="booking-details-left-column"
      >
        <BookingCard
          className="order-1 lg:order-none"
          icon={<Radio className="size-3.5" aria-hidden />}
          testId="booking-details-source-channel"
          title="Source & Channel"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Source" required>
              <Select value={bookingSource || undefined} onValueChange={onBookingSourceChange}>
                <SelectTrigger className={SELECT_CONTROL} data-testid="booking-details-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent className={NORU_MENU}>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Channel" required={channelRequired}>
              <Select
                value={salesChannel || undefined}
                onValueChange={onSalesChannelChange}
                disabled={!channelEnabled}
              >
                <SelectTrigger
                  className={SELECT_CONTROL}
                  aria-label="Channel"
                  data-testid="booking-details-channel"
                >
                  <SelectValue placeholder={channelEnabled ? "Select channel" : "—"} />
                </SelectTrigger>
                <SelectContent className={NORU_MENU}>
                  {salesChannelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {channelEmptyMessage ? (
              <p className="text-xs text-[#9B3A3A] sm:col-span-2" data-testid="ota-channel-empty">
                {channelEmptyMessage}
              </p>
            ) : null}
            <Field label="Market Segment">
              <Select value={marketSegment || undefined} onValueChange={onMarketSegmentChange}>
                <SelectTrigger className={SELECT_CONTROL} data-testid="booking-details-segment">
                  <SelectValue placeholder="Select segment" />
                </SelectTrigger>
                <SelectContent className={NORU_MENU}>
                  {segmentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="sm:col-span-2">
              <Field label="Campaign / Reference">
                <Input
                  className={CONTROL}
                  data-testid="booking-details-external-ref"
                  value={externalReference}
                  maxLength={120}
                  onChange={(event) => onExternalReferenceChange(event.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </div>
        </BookingCard>

        <BookingCard
          className="order-3 lg:order-none"
          icon={<Package className="size-3.5" aria-hidden />}
          testId="booking-details-packages"
          title="Packages & Add-ons"
        >
          {packagesSlot}
        </BookingCard>
      </div>

      <div
        className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3"
        data-testid="booking-details-right-column"
      >
        <BookingCard
          className="order-2 lg:order-none"
          icon={<Building2 className="size-3.5" aria-hidden />}
          testId="booking-details-company-agent-group"
          title="Company / Agent / Group"
        >
          <div
            className="mb-3 grid grid-cols-3 overflow-hidden rounded-[6px] border border-[#CCCCCC]"
            role="tablist"
            aria-label="Relationship"
          >
            {(
              [
                ["company", "Company"],
                ["travel_agent", "Travel Agent / Agency"],
                ["group", "Group / Block"],
              ] as const
            ).map(([id, label], index) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={relationTab === id}
                data-testid={`booking-details-relation-tab-${id}`}
                onClick={() => setRelationTab(id)}
                className={cn(
                  "min-h-10 border-[#CCCCCC] px-2 text-xs",
                  index > 0 && "border-l",
                  relationTab === id
                    ? "bg-[#FBF6EE] font-medium text-[#251605] shadow-[inset_0_-2px_0_#C89933]"
                    : "bg-white text-[#6B5E4E]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {relationTab === "company" ? (
            <div className="space-y-2" data-testid="booking-details-company-tab">
              <CreateReservationMasterPicker
                restaurantId={restaurantId}
                kind="company"
                canCreate={canCreateMaster}
                hideCreate
                compact
                master={companyMaster}
                onMasterChange={onCompanyMasterChange}
              />
              {companyMaster ? (
                <div
                  className="mt-3 space-y-3 border-t border-[#E7E0D4] pt-3"
                  data-testid="booking-details-company-details"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryChoice
                      label="Company Contact"
                      ariaLabel="Company Contact"
                      primary={companyContactSummary.primary}
                      detail={companyContactSummary.detail}
                      value={companyContactId}
                      options={[
                        { value: "", label: "—" },
                        ...companyContacts.map((row) => ({
                          value: row.id,
                          label: companyContactOptionLabel(row),
                        })),
                      ]}
                      onChange={onCompanyContactIdChange}
                    />
                    <SummaryChoice
                      label="Corporate Rate"
                      ariaLabel="Corporate Rate"
                      primary={companyRateSummary.primary}
                      detail={companyRateSummary.detail}
                      value={ratePlanId || ""}
                      options={[
                        { value: ratePlanId || "", label: usingRateLabel },
                        ...contractRates
                          .filter((row) => row.roomTypeId !== matchedContractRate?.roomTypeId)
                          .map((row) => ({
                            value: `contract:${row.roomTypeId}`,
                            label: formatCompanyContractRate(row),
                          })),
                        ...companyHints
                          .filter((row) => row.planId && row.planId !== ratePlanId)
                          .map((row) => ({ value: row.planId!, label: row.label })),
                      ]}
                      onChange={(value) => {
                        if (value && !value.startsWith("contract:")) onApplyRatePlan(value);
                      }}
                    />
                  </div>
                  <div className="border-t border-[#E7E0D4] pt-3">
                    <SummaryChoice
                      label="Billing Arrangement"
                      ariaLabel="Billing Arrangement"
                      primary={billingHint?.name || "—"}
                      detail={billingHint?.payerKindLabel || ""}
                      icon={<FileText className="size-3.5" aria-hidden />}
                      value={billingRuleId}
                      options={[
                        { value: "", label: "—" },
                        ...billingRules.map((row) => ({ value: row.id, label: row.name })),
                      ]}
                      onChange={onBillingRuleIdChange}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {relationTab === "travel_agent" ? (
            <div className="space-y-2" data-testid="booking-details-travel-agent-tab">
              <CreateReservationMasterPicker
                restaurantId={restaurantId}
                kind="travel_agent"
                canCreate={canCreateMaster}
                hideCreate
                compact
                master={travelAgentMaster}
                onMasterChange={onTravelAgentMasterChange}
              />
              {travelAgentMaster ? (
                <div
                  className="mt-3 grid gap-3 border-t border-[#E7E0D4] pt-3 sm:grid-cols-2"
                  data-testid="booking-details-travel-agent-details"
                >
                  <SummaryChoice
                    label="Contact Person"
                    ariaLabel="Contact Person"
                    primary={agentContactSummary.primary}
                    detail={agentContactSummary.detail}
                    value={travelAgentContactId}
                    options={[
                      { value: "", label: "—" },
                      ...agentContacts.map((row) => ({
                        value: row.id,
                        label: companyContactOptionLabel(row),
                      })),
                    ]}
                    onChange={onTravelAgentContactIdChange}
                  />
                  <SummaryChoice
                    label="Agency Rate"
                    ariaLabel="Agency Rate"
                    primary={agencyRateSummary.primary}
                    detail={agencyRateSummary.detail}
                    value={ratePlanId || ""}
                    options={[
                      { value: ratePlanId || "", label: agencyRateLabel },
                      ...agencyContractRates
                        .filter((row) => row.roomTypeId !== matchedAgencyRate?.roomTypeId)
                        .map((row) => ({
                          value: `contract:${row.roomTypeId}`,
                          label: formatCompanyContractRate(row),
                        })),
                      ...agencyHints
                        .filter((row) => row.planId && row.planId !== ratePlanId)
                        .map((row) => ({ value: row.planId!, label: row.label })),
                    ]}
                    onChange={(value) => {
                      if (value && !value.startsWith("contract:")) onApplyRatePlan(value);
                    }}
                  />
                  <MetaValue
                    label="Commission Type"
                    value={commissionTypeLabel}
                    ariaLabel="Commission Type"
                  />
                  <MetaValue label="Commission" value={commissionValue} ariaLabel="Commission" />
                </div>
              ) : null}
            </div>
          ) : null}

          {relationTab === "group" ? (
            <div className="space-y-2" data-testid="booking-details-group-tab">
              {linkedGroupId ? (
                <div data-testid="booking-details-group-details">
                  {showLinkedGroupCaption ? (
                    <p
                      className="mb-2 text-xs text-[#6B5E4E]"
                      data-testid="linked-group-block-caption"
                    >
                      Linked Group / Block. This stays separate from the Group Reservation.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
                      <Users className="size-4" aria-hidden />
                    </span>
                    <p className="min-w-0 flex-1 break-words text-sm font-medium text-[#251605]">
                      {selectedGroup?.name ?? "Group"}
                      {selectedGroup?.code ? (
                        <span className="font-normal text-[#6B5E4E]">{` · ${selectedGroup.code}`}</span>
                      ) : null}
                    </p>
                    <span className="shrink-0 rounded-full bg-[#FBF6EE] px-2 py-0.5 text-[10px] font-medium text-[#8A6A24]">
                      Group
                    </span>
                    <button
                      type="button"
                      data-testid="change-group"
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-[#E4D3A8] bg-white px-2 text-xs font-medium text-[#8A6A24]"
                      onClick={() => {
                        focusGroupSearch.current = true;
                        onLinkedGroupChange(null, null);
                        setGroupQuery("");
                      }}
                    >
                      <RefreshCw className="size-3" aria-hidden />
                      Change Group
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 border-t border-[#E7E0D4] pt-3 sm:grid-cols-2">
                    <SummaryChoice
                      label="Block"
                      ariaLabel="Block"
                      primary={selectedBlock?.roomTypeName ?? "—"}
                      value={linkedBlockId ?? ""}
                      options={[
                        { value: "", label: "—" },
                        ...selectedBlocks.map((row) => ({
                          value: row.id,
                          label: row.roomTypeName ?? "Block",
                        })),
                      ]}
                      onChange={(value) => onLinkedGroupChange(linkedGroupId, value || null)}
                    />
                    <MetaValue
                      label="Group Rate"
                      value={selectedGroup?.ratePlanId ? usingRateLabel : "—"}
                    />
                    <MetaValue label="Cut-off Date" value={cutoffDate || "—"} />
                  </div>
                  <div className="mt-3">
                    <p className="text-[11px] leading-4 text-[#6B5E4E]">Pickup</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E7E0D4]">
                      <div
                        className="h-full rounded-full bg-[#C89933]"
                        style={{ width: `${pickupPct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[#251605]">
                      {`${pickupPicked} of ${pickupBlocked || "—"} rooms picked up`}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {showAdHocGroupNote ? (
                    <p className="text-xs text-[#6B5E4E]" data-testid="group-block-optional-note">
                      Optional. A Group Reservation can stay ad hoc, or link to an existing Group /
                      Block.
                    </p>
                  ) : null}
                  <Field label="Group">
                    <Input
                      ref={groupSearchRef}
                      className={CONTROL}
                      data-testid="group-search"
                      value={groupQuery}
                      onChange={(event) => setGroupQuery(event.target.value)}
                      placeholder="Search group"
                      aria-label="Group"
                    />
                    {groupQuery.trim().length >= 2 ? (
                      <div className="mt-1 max-h-24 overflow-auto rounded border border-[#E7E0D4] bg-white">
                        {(groupsQuery.data?.groups ?? []).map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            className="block w-full px-2 py-1 text-left text-[11px] hover:bg-[#F6F3EC]"
                            onClick={() => {
                              onLinkedGroupChange(row.id, null);
                              setGroupQuery("");
                            }}
                          >
                            {row.name}
                          </button>
                        ))}
                        {groupsQuery.data && groupsQuery.data.groups.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-muted-foreground">
                            No matching groups.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </Field>
                </>
              )}
            </div>
          ) : null}
        </BookingCard>

        <BookingCard
          className="order-4 lg:order-none"
          icon={<ClipboardList className="size-3.5" aria-hidden />}
          testId="booking-details-guest-requests"
          title="Guest Requests & Preferences"
          action={
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[6px] border border-[#E4D3A8] bg-white px-2.5 text-xs font-medium text-[#8A6A24] disabled:opacity-40"
              data-testid="apply-saved-preferences"
              disabled={savedPreferences.length === 0}
              onClick={() => {
                if (!specialRequests.trim()) {
                  onSpecialRequestsChange(
                    mergeSpecialRequests(
                      "",
                      preferenceApplyText(savedPreferences),
                      SPECIAL_REQUEST_MAX,
                    ),
                  );
                  return;
                }
                setApplyConfirmOpen(true);
              }}
            >
              Apply to this reservation
            </button>
          }
        >
          <div className="space-y-2" data-testid="booking-details-saved-preferences">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
              Saved Preferences
            </p>
            {leadGuestPreferences ? (
              <p className="text-xs text-[#6B5E4E]" data-testid="lead-guest-preferences">
                Primary Guest / Booker. Room guest preferences are managed per guest profile.
              </p>
            ) : null}
            {!guest ? (
              <p className="text-xs text-muted-foreground">
                Select a guest to load saved preferences.
              </p>
            ) : savedPreferencesLoading ? (
              <p className="text-xs text-muted-foreground">Loading saved preferences…</p>
            ) : savedPreferences.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved preferences for this guest.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {savedPreferences.map((row) => (
                  <span
                    key={row.typeId}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-[#CCCCCC] bg-white px-2 py-0.5 text-xs text-[#251605]"
                    data-testid="saved-preference-chip"
                  >
                    <span className="text-[#6B5E4E]">{row.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium">{row.value}</span>
                  </span>
                ))}
              </div>
            )}
            {applyConfirmOpen ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-[#CCCCCC] bg-white px-2 py-1.5">
                <p className="text-[11px] text-muted-foreground">
                  Special requests already has text. Append the saved preferences?
                </p>
                <button
                  type="button"
                  className="text-[11px] font-medium text-[#8A6A24]"
                  data-testid="confirm-apply-preferences"
                  onClick={() => {
                    onSpecialRequestsChange(
                      mergeSpecialRequests(
                        specialRequests,
                        preferenceApplyText(savedPreferences),
                        SPECIAL_REQUEST_MAX,
                      ),
                    );
                    setApplyConfirmOpen(false);
                  }}
                >
                  Append
                </button>
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground"
                  onClick={() => setApplyConfirmOpen(false)}
                >
                  Keep current text
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="mt-3 space-y-1 border-t border-[#CCCCCC] pt-3"
            data-testid="booking-details-service-requests"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
              Service Requests
            </p>
            {!guest ? (
              <p className="text-xs text-muted-foreground">
                Select a guest to choose service types.
              </p>
            ) : serviceTypesLoading ? (
              <p className="text-xs text-muted-foreground">Loading service types…</p>
            ) : serviceTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No service types configured.</p>
            ) : (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto pr-1">
                {serviceTypes.map((row) => {
                  const selected = selectedServiceRequests.find(
                    (item) => item.serviceTypeId === row.id,
                  );
                  return (
                    <li key={row.id} className="grid gap-1">
                      <label className="flex items-center gap-2 text-xs text-[#251605]">
                        <Checkbox
                          checked={Boolean(selected)}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              onSelectedServiceRequestsChange([
                                ...selectedServiceRequests,
                                { serviceTypeId: row.id, name: row.name, description: "" },
                              ]);
                              return;
                            }
                            onSelectedServiceRequestsChange(
                              selectedServiceRequests.filter(
                                (item) => item.serviceTypeId !== row.id,
                              ),
                            );
                          }}
                        />
                        <span className="min-w-0 flex-1 font-medium">{row.name}</span>
                        <span className="shrink-0 rounded-full bg-[#F3EDE3] px-2 py-0.5 text-[11px] font-medium text-[#4A4034]">
                          {row.categoryName}
                        </span>
                      </label>
                      {selected ? (
                        <Input
                          className={cn(CONTROL, "ml-6")}
                          value={selected.description}
                          placeholder={row.name}
                          aria-label={`Description for ${row.name}`}
                          data-testid="selected-service-description"
                          onChange={(event) =>
                            onSelectedServiceRequestsChange(
                              selectedServiceRequests.map((item) =>
                                item.serviceTypeId === row.id
                                  ? { ...item, description: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-3 grid items-stretch gap-3 border-t border-[#CCCCCC] pt-3 lg:grid-cols-2">
            <Field label="Special Requests">
              <Textarea
                className={cn(PMS_OP_TEXTAREA, "min-h-24 resize-none text-sm")}
                maxLength={SPECIAL_REQUEST_MAX}
                value={specialRequests}
                onChange={(event) =>
                  onSpecialRequestsChange(event.target.value.slice(0, SPECIAL_REQUEST_MAX))
                }
                placeholder="e.g. High floor, extra bed, airport pickup..."
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Reservation-specific guest requests
                </p>
                <p className="shrink-0 text-[10px] text-muted-foreground">
                  {requestLength}/{SPECIAL_REQUEST_MAX}
                </p>
              </div>
            </Field>
            <Field label="Internal Notes">
              <Textarea
                className={cn(PMS_OP_TEXTAREA, "min-h-24 resize-none text-sm")}
                data-testid="booking-details-internal-notes"
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Staff-only notes for this draft"
              />
              <p className="text-[10px] text-muted-foreground">Staff-only notes</p>
            </Field>
          </div>
          {roomAssignment}
        </BookingCard>
      </div>
    </div>
  );
}

function BookingCard({
  icon,
  testId,
  title,
  className,
  action,
  children,
}: {
  icon: ReactNode;
  testId?: string;
  title: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        PMS_OP_PANEL,
        "!rounded-[6px] !border-[#CCCCCC] !shadow-none h-fit min-w-0 p-4",
        className,
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
            {icon}
          </span>
          <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SummaryChoice({
  label,
  ariaLabel,
  primary,
  detail,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  ariaLabel: string;
  primary: string;
  detail?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  icon?: ReactNode;
}) {
  const interactive = options.filter((option) => option.value).length > 1;
  const menuOptions = options.filter(
    (option, index, list) =>
      list.findIndex((row) => (row.value || SUMMARY_NONE) === (option.value || SUMMARY_NONE)) ===
      index,
  );
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-4 text-[#6B5E4E]">{label}</p>
      <div className="relative mt-0.5 flex min-w-0 items-start gap-2">
        {icon ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {interactive ? (
            <Select
              value={value || SUMMARY_NONE}
              onValueChange={(next) => onChange(next === SUMMARY_NONE ? "" : next)}
            >
              <SelectTrigger
                aria-label={ariaLabel}
                className="!h-auto min-h-0 w-full justify-between gap-1 !rounded-[6px] !border-0 !bg-transparent !px-0 py-0 text-left text-sm font-medium text-[#251605] !shadow-none focus:ring-1 focus:ring-[#C89933]"
              >
                <span className="min-w-0 break-words">{primary || "—"}</span>
              </SelectTrigger>
              <SelectContent className={NORU_MENU}>
                {menuOptions.map((option, index) => (
                  <SelectItem key={`${option.value}-${index}`} value={option.value || SUMMARY_NONE}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm font-medium leading-5 text-[#251605]" aria-label={ariaLabel}>
              <span className="min-w-0 break-words">{primary || "—"}</span>
            </p>
          )}
          {detail ? <p className="text-xs leading-4 text-[#8A7B68]">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function contactSummary(
  contact: {
    name: string;
    phone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  } | null,
) {
  if (!contact) return { primary: "—", detail: "" };
  const reach = [contact.phone, contact.whatsapp, contact.email]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return { primary: contact.name.trim() || "—", detail: [...new Set(reach)].join(" · ") };
}

function splitSummary(label: string) {
  const text = label.trim();
  const splitAt = text.indexOf(" · ");
  if (splitAt < 0) return { primary: text || "—", detail: "" };
  return { primary: text.slice(0, splitAt).trim() || "—", detail: text.slice(splitAt + 3).trim() };
}

function MetaValue({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string;
  ariaLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-4 text-[#6B5E4E]">{label}</p>
      <p
        className="mt-0.5 break-words text-sm font-medium leading-5 text-[#251605]"
        aria-label={ariaLabel ?? label}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <p className={cn(PMS_OP_LABEL, "text-[11px] text-[#6B5E4E]")}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </p>
      {children}
    </div>
  );
}
