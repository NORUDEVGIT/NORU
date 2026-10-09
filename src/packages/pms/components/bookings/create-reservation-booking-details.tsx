import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import {
  type ContextPickOption,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import { type PickedReservationGuest } from "@/packages/pms/components/bookings/create-reservation-guest";
import { getBillingCard3 } from "@/packages/pms/lib/billing-card3.functions";
import { reservationBillingHintFromRule } from "@/packages/pms/lib/cashiering-billing-hint";
import {
  activeCommissionPlan,
  commissionPercentLabel,
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
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
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

export type CreateServiceSelection = {
  serviceTypeId: string;
  name: string;
  description: string;
};

const CONTROL = cn(PMS_OP_INPUT, "!h-8 px-2 py-1");
const SELECT_CONTROL = cn(PMS_OP_SELECT_TRIGGER, "!h-8 px-2 py-0 text-xs");

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
  onApplyRatePlan,
  onLinkedGroupChange,
  ratePlanId,
  ratePlanLabel,
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
  onApplyRatePlan: (ratePlanId: string) => void;
  onLinkedGroupChange: (groupId: string | null, blockId: string | null) => void;
  ratePlanId: string;
  ratePlanLabel: string;
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
  const [relationTab, setRelationTab] = useState<"company" | "travel_agent" | "group">("company");
  const [groupQuery, setGroupQuery] = useState("");
  const [prefilledGuestId, setPrefilledGuestId] = useState<string | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const groupSearchRef = useRef<HTMLInputElement>(null);
  const focusGroupSearch = useRef(false);

  const purposeQuery = useQuery({
    queryKey: ["pms-purpose-of-stay", restaurantId, "create-reservation"],
    queryFn: () => loadPurpose({ data: { restaurantId } }),
    enabled: Boolean(companyMaster?.id),
    retry: false,
  });
  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);

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

  const appliedGroupRateFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedGroup?.id || !selectedGroup.ratePlanId) return;
    if (appliedGroupRateFor.current === selectedGroup.id) return;
    appliedGroupRateFor.current = selectedGroup.id;
    onApplyRatePlan(selectedGroup.ratePlanId);
  }, [onApplyRatePlan, selectedGroup?.id, selectedGroup?.ratePlanId]);

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

  const usingRateLabel = ratePlanLabel.trim() || "—";
  const billingHint = billingRules.find((row) => row.id === billingRuleId);
  const billingHintCopy = billingHint
    ? `${billingHint.name} · ${billingHint.payerKindLabel} · ${reservationBillingHintFromRule(billingHint).paymentTerms}`
    : "";
  const requestLength = specialRequests.length;
  const commissionTypeLabel = activePlan?.commissionType
    ? activePlan.commissionType.replaceAll("_", " ")
    : "—";

  return (
    <div className="space-y-3" data-testid="create-reservation-booking-details">
      <div className="grid gap-3 lg:grid-cols-2">
        <BookingCard step={1} testId="booking-details-source-channel" title="Source & Channel">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Source" required>
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
            <Field label="Channel" required>
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
          step={2}
          testId="booking-details-company-agent-group"
          title="Company / Agent / Group"
        >
          <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Relationship">
            {(
              [
                ["company", "Company"],
                ["travel_agent", "Travel Agent / Agency"],
                ["group", "Group / Block"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={relationTab === id}
                data-testid={`booking-details-relation-tab-${id}`}
                onClick={() => setRelationTab(id)}
                className={cn(
                  "!rounded-[6px] border px-2.5 py-1 text-xs",
                  relationTab === id
                    ? "border-[#C89933] bg-[#F6F3EC] font-medium text-[#251605]"
                    : "border-[#CCCCCC] bg-white text-[#251605]",
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
                <div className="space-y-2" data-testid="booking-details-company-details">
                  <Field label="Company Contact">
                    <select
                      className={CONTROL}
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
                <div className="space-y-2" data-testid="booking-details-travel-agent-details">
                  <Field label="Contact Person">
                    <select
                      className={CONTROL}
                      value={travelAgentContactId}
                      onChange={(event) => onTravelAgentContactIdChange(event.target.value)}
                      aria-label="Contact Person"
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
                  <Field label="Agency Reference">
                    <Input
                      className={CONTROL}
                      value={externalReference}
                      maxLength={120}
                      onChange={(event) => onExternalReferenceChange(event.target.value)}
                      placeholder="Optional"
                      aria-label="Agency Reference"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Commission Type">
                      <Input
                        className={CONTROL}
                        disabled
                        readOnly
                        value={commissionTypeLabel}
                        placeholder="—"
                        aria-label="Commission Type"
                      />
                    </Field>
                    <Field label="Commission %">
                      <Input
                        className={CONTROL}
                        disabled
                        readOnly
                        value={commissionDisplay}
                        placeholder="—"
                        aria-label="Commission"
                      />
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {relationTab === "group" ? (
            <div className="space-y-2" data-testid="booking-details-group-tab">
              {linkedGroupId ? (
                <div className="space-y-2" data-testid="booking-details-group-details">
                  <div className="flex items-center justify-between gap-2 rounded-[6px] border border-[#E7E0D4] bg-white px-2 py-1.5">
                    <p className="min-w-0 truncate text-sm font-medium text-[#251605]">
                      {selectedGroup?.name ?? "Group"}
                    </p>
                    <button
                      type="button"
                      data-testid="change-group"
                      className="shrink-0 rounded-[6px] border border-[#CCCCCC] px-2 py-1 text-xs"
                      onClick={() => {
                        focusGroupSearch.current = true;
                        onLinkedGroupChange(null, null);
                        setGroupQuery("");
                      }}
                    >
                      Change Group
                    </button>
                  </div>
                  <Field label="Block">
                    <select
                      className={CONTROL}
                      value={linkedBlockId ?? ""}
                      onChange={(event) =>
                        onLinkedGroupChange(linkedGroupId, event.target.value || null)
                      }
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
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Group Rate">
                      <Input
                        className={CONTROL}
                        disabled
                        readOnly
                        value={selectedGroup?.ratePlanId ? usingRateLabel : "—"}
                        aria-label="Group Rate"
                      />
                    </Field>
                    <Field label="Cut-off Date">
                      <Input className={CONTROL} type="date" disabled readOnly value={cutoffDate} />
                    </Field>
                  </div>
                  <div className="rounded-[6px] border border-[#E7E0D4] bg-white px-2 py-2">
                    <p className="text-[11px] font-medium text-[#6B5E4E]">Pickup Status</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E7E0D4]">
                      <div
                        className="h-full rounded-full bg-[#B8954F]"
                        style={{ width: `${pickupPct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {`${pickupPicked} of ${pickupBlocked || "—"} rooms picked up`}
                    </p>
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          ) : null}
        </BookingCard>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <BookingCard step={3} testId="booking-details-packages" title="Packages & Add-ons">
          {packagesSlot}
        </BookingCard>

        <div className="grid content-start gap-3">
          <BookingCard
            step={4}
            testId="booking-details-guest-requests"
            title="Guest Requests & Preferences"
          >
            <div className="space-y-2" data-testid="booking-details-saved-preferences">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
                Saved Preferences
              </p>
              {!guest ? (
                <p className="text-xs text-muted-foreground">
                  Select a guest to load saved preferences.
                </p>
              ) : savedPreferencesLoading ? (
                <p className="text-xs text-muted-foreground">Loading saved preferences…</p>
              ) : savedPreferences.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No saved preferences for this guest.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {savedPreferences.map((row) => (
                    <span
                      key={row.typeId}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#CCCCCC] bg-white px-2 py-0.5 text-xs text-[#251605]"
                      data-testid="saved-preference-chip"
                    >
                      <span className="text-[#6B5E4E]">{row.label}:</span>
                      <span className="font-medium">{row.value}</span>
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-[11px] font-medium text-[#8A6A24] disabled:opacity-40"
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
                <ul className="max-h-40 space-y-1 overflow-y-auto">
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
                          <span className="text-[10px] text-[#8A7B68]">{row.categoryName}</span>
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
            <div className="mt-3 grid gap-3 border-t border-[#CCCCCC] pt-3 lg:grid-cols-2">
              <Field label="Special Requests">
                <Textarea
                  className={cn(PMS_OP_TEXTAREA, "min-h-[64px] resize-none text-sm")}
                  maxLength={SPECIAL_REQUEST_MAX}
                  value={specialRequests}
                  onChange={(event) =>
                    onSpecialRequestsChange(event.target.value.slice(0, SPECIAL_REQUEST_MAX))
                  }
                  placeholder="e.g. High floor, extra bed, airport pickup..."
                />
                <p className="text-[10px] text-muted-foreground">
                  Reservation-specific guest requests
                </p>
                <p className="text-right text-[10px] text-muted-foreground">
                  {requestLength}/{SPECIAL_REQUEST_MAX}
                </p>
              </Field>
              <Field label="Internal Notes">
                <Textarea
                  className={cn(PMS_OP_TEXTAREA, "min-h-[64px] resize-none text-sm")}
                  data-testid="booking-details-internal-notes"
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  placeholder="Staff-only notes for this draft"
                />
                <p className="text-[10px] text-muted-foreground">Staff-only notes</p>
              </Field>
            </div>
          </BookingCard>
          {roomAssignment}
        </div>
      </div>
    </div>
  );
}

function BookingCard({
  step,
  testId,
  title,
  children,
}: {
  step: number;
  testId?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(PMS_OP_PANEL, "p-3")} data-testid={testId}>
      <div className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-[6px] bg-[#F6F3EC] text-[11px] font-semibold text-[#8B6914]">
          {step}
        </span>
        <h2 className="font-display text-base text-[#251605]">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
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
