import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  MoreHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
import { cn } from "@/shared/lib/utils";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { AGENCY_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-travel-agency";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import {
  ISO_COUNTRIES,
  addressLayoutForCountry,
  countryCodeFromInput,
  countryNameFromInput,
  isRegionValidForCountry,
  regionsForCountry,
} from "@/packages/pms/lib/pms-geography";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { formatCreateIssuesByStep, issuesBeforeStep } from "@/packages/pms/lib/guest-create-step-issues";
import {
  ACCOUNT_BILLING_ARRANGEMENTS,
  ACCOUNT_CREATE_STATUS_LABELS,
  AGENCY_TYPES,
  CONTACT_PREFERRED_METHODS,
  GUEST_TRAVEL_AGENT_CREATE_COPY,
  GUEST_TRAVEL_AGENT_CREATE_DRAFT_SAVED,
  GUEST_TRAVEL_AGENT_CREATE_HOLD_DEBOUNCE_MS,
  GUEST_TRAVEL_AGENT_CREATE_START_OVER,
  GUEST_TRAVEL_AGENT_CREATE_START_OVER_COPY,
  GUEST_TRAVEL_AGENT_CREATE_STEPS,
  GUEST_TRAVEL_AGENT_CREATE_TITLE,
  TA_COMMISSION_PLAN_TYPES,
  TA_COMMISSION_REFERENCE_COPY,
  TRAVEL_AGENT_CREATE_CONTRACT_COPY,
  TRAVEL_AGENT_CREATE_CREDIT_COPY,
  agencyTypeLabel,
  billingArrangementLabel,
  clearGuestTravelAgentCreateHold,
  createTravelAgencyFieldRules,
  emptyAccountCreateContact,
  emptyGuestTravelAgentCreateDraft,
  filled,
  nextAgencyCode,
  guestTravelAgentCreateCompletion,
  guestTravelAgentCreateHasChanges,
  isTravelAgencyRuleRequired,
  matchTravelAgencyFieldIssue,
  optionLabel,
  primaryTravelAgentContact,
  readGuestTravelAgentCreateHold,
  travelAgentCreateDraftErrorsForSave,
  travelAgentCreateFieldIssues,
  writeGuestTravelAgentCreateHold,
  type GuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateStepId,
  type TravelAgencyCreateFieldRule,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import {
  deleteTravelAgentCreateDraft,
  getTravelAgentCreateContext,
  persistTravelAgentCreate,
  saveTravelAgentCreateDraft,
  type TravelAgentCreateContext,
} from "@/packages/pms/lib/guest-travel-agent-create.functions";
import { getGuestAccount, type GuestAccountProfile } from "@/packages/pms/lib/guest-accounts.functions";
import { listTravelAgentContacts } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { BasicInfoStep, ContactsStep } from "./guest-travel-agency-basic-info-step";
import {
  GuestTravelAgencyCommissionRatesStep,
} from "./guest-travel-agency-commission-rates-step";
import { getTravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.functions";
import type { TravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.server";
import {
  GuestTravelAgencyPaymentRulesStep,
} from "./guest-travel-agency-payment-rules-step";
import { getTravelAgencyStep4Config } from "@/packages/pms/lib/guest-travel-agency-step4.functions";
import type { TravelAgencyStep4Config } from "@/packages/pms/lib/guest-travel-agency-step4.server";

const MODAL_CONTROL_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#FAF8F5]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

const MODAL_TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const MODAL_TEST_ID = "guest-travel-agency-create-modal";

function hasNestedModalLayer(): boolean {
  if (typeof document === "undefined") return false;
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return [...nodes].some((node) => node.dataset["testid"] !== MODAL_TEST_ID);
}

function agencyProfileToCreateDraft(account: GuestAccountProfile): GuestTravelAgentCreateDraft {
  const base = emptyGuestTravelAgentCreateDraft();
  let contacts: any[] = [];
  if (Array.isArray((account as any).contacts)) {
    contacts = (account as any).contacts.map((c: any) => ({
      key: c?.id ?? Math.random().toString(),
      id: c?.id ?? null,
      name: c?.name ?? "",
      position: c?.position ?? "",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      whatsapp: c?.whatsapp ?? "",
      isPrimary: Boolean(c?.isPrimary),
      preferredMethod: c?.preferredMethod ?? "",
      notes: c?.notes ?? "",
    }));
  }
  if (!contacts.length) {
    if (account.primaryContactName || (account as any).email || (account as any).phone) {
      contacts.push({
        key: "primary-contact",
        id: null,
        name: account.primaryContactName ?? "",
        position: (account as any).primaryContactTitle ?? "",
        email: (account as any).email ?? "",
        phone: (account as any).phone ?? "",
        whatsapp: "",
        isPrimary: true,
        preferredMethod: "",
        notes: "",
      });
    } else {
      contacts.push(emptyAccountCreateContact(true));
    }
  }
  return {
    ...base,
    accountId: account.id,
    name: account.name ?? "",
    tradeName: (account as any).tradeName ?? (account as any).trade_name ?? "",
    code: account.code ?? "",
    agencyType: (account as any).agencyType ?? (account as any).agency_type ?? "",
    agencyTypeOther: (account as any).agencyTypeOther ?? "",
    accountStatus: (account.accountStatus as any) ?? "active",
    iataLicenseNumber: (account as any).iataLicenseNumber ?? "",
    licenseExpiryDate: (account as any).licenseExpiryDate ?? "",
    website: (account as any).website ?? "",
    notes: account.notes ?? "",
    contacts,
    addressLine1: account.addressLine1 ?? "",
    addressLine2: (account as any).addressLine2 ?? "",
    city: account.city ?? "",
    region: (account as any).region ?? "",
    postalCode: (account as any).postalCode ?? "",
    country: account.country ? countryCodeFromInput(account.country) : "",
    taxId: (account as any).taxId ?? "",
    registrationNumber: (account as any).businessRegistrationNumber ?? (account as any).registrationNumber ?? "",
    marketSegmentId: (account as any).marketSegmentId ?? "",
    sourceCodeId: (account as any).sourceCodeId ?? "",
    sourceOfBusiness: (account as any).sourceOfBusiness ?? "",
    accountManagerId: (account as any).accountManagerId ?? "",
    ratePlanId: (account as any).ratePlanId ?? "",
    packageId: (account as any).packageId ?? "",
    mealPlanId: (account as any).mealPlanId ?? "",
    contractReference: (account as any).contractReference ?? "",
    contractStartDate: (account as any).contractStartDate ?? "",
    contractEndDate: (account as any).contractEndDate ?? "",
    billingArrangement: (account as any).billingArrangement ?? "",
    billingContactName: (account as any).billingContactName ?? "",
    billingEmail: (account as any).billingEmail ?? "",
    paymentMethodId: (account as any).paymentMethodId ?? "",
    currency: (account as any).currency ?? "",
    paymentTerms: (account as any).paymentTerms ?? "",
    billingInstruction: (account as any).billingInstruction ?? "",
    creditLimitAmount: (account as any).creditLimitAmount != null ? String((account as any).creditLimitAmount) : "",
    creditLimitNote: (account as any).creditLimitNote ?? "",
    commissionEnabled: Boolean((account as any).commissionEnabled ?? (account as any).commissionType),
    commissionType: (account as any).commissionType ?? "",
    commissionValue: (account as any).commissionValue != null ? String((account as any).commissionValue) : "",
    commissionCurrency: (account as any).commissionCurrency ?? "",
    commissionEffectiveOn: (account as any).commissionEffectiveOn ?? "",
    commissionExpiresOn: (account as any).commissionExpiresOn ?? "",
    commissionNotes: (account as any).commissionNotes ?? "",
  };
}

function hydrateAgencyEditDraft(
  account: GuestAccountProfile,
  step3: TravelAgencyCommissionRatesConfig,
  step4: TravelAgencyStep4Config,
  savedContacts: Array<{
    id: string;
    name: string;
    position?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    isPrimary?: boolean;
    notes?: string | null;
  }>,
): GuestTravelAgentCreateDraft {
  const base = agencyProfileToCreateDraft(account);
  const contacts = savedContacts
    .filter((row) => row.name?.trim())
    .map((row) => ({
      key: row.id,
      id: row.id,
      name: row.name,
      roleId: null,
      position: row.position ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      whatsapp: row.whatsapp ?? "",
      isPrimary: Boolean(row.isPrimary),
      preferredMethod: "",
      notes: row.notes ?? "",
    }));
  const billing = step4.existingValues;
  const agreement = step3.existingAgreement;
  const plan = step3.currentCommissionPlan;
  const rules = step3.commissionRules ?? [];
  const allRule = rules.find((row) => row.scopeType === "all");
  const hasSpecificRules = rules.some((row) => row.scopeType !== "all");
  const netRatePlan = agreement?.ratePlanId
    ? step3.ratePlans.find((row) => row.id === agreement.ratePlanId)
    : null;
  const commercialFields: Partial<GuestTravelAgentCreateDraft> = agreement
    ? {
        commercialModel: "net_rate",
        commissionEnabled: false,
        netPricingMethod: agreement.pricingMethod,
        netRoomTypeId:
          netRatePlan?.roomTypeId ??
          (agreement.contractedRates.length === 1 ? agreement.contractedRates[0]?.roomTypeId ?? null : null),
        netRatePlanId: agreement.ratePlanId,
        netDiscountType: agreement.discountType,
        netDiscountValue: agreement.discountValue == null ? "" : String(agreement.discountValue),
        netCurrencyCode: agreement.currencyCode || step3.baseCurrency,
        netValidFrom: agreement.validFrom,
        netValidUntil: agreement.validTo,
        contractedRates: agreement.contractedRates.map((row) => ({
          roomTypeId: row.roomTypeId,
          amount: String(row.amount),
        })),
      }
    : {
        commercialModel: "commissionable",
        commissionEnabled: true,
        commissionType: allRule?.commissionType ?? plan?.commissionType ?? "percent",
        commissionValue: String(allRule?.commissionValue ?? plan?.rateValue ?? 0),
        allCommissionType: allRule?.commissionType ?? plan?.commissionType ?? "percent",
        allCommissionValue: String(allRule?.commissionValue ?? plan?.rateValue ?? 0),
        commissionCurrency: plan?.currency || step3.baseCurrency,
        commissionEffectiveOn: plan?.effectiveOn ?? "",
        commissionExpiresOn: plan?.expiresOn ?? "",
        commissionNotes: plan?.notes ?? "",
        commissionApplicationMode: hasSpecificRules ? "specific" : "all",
        commissionRules: rules.map((row) => ({
          id: row.id,
          scopeType: row.scopeType,
          roomTypeId: row.roomTypeId,
          ratePlanId: row.ratePlanId,
          commissionType: row.commissionType,
          commissionValue: String(row.commissionValue),
        })),
        agencyRateDefaults: step3.agencyRateDefaults ?? [],
      };
  return {
    ...base,
    ...commercialFields,
    contacts: contacts.length > 0 ? contacts : base.contacts,
    billingCurrencyCode: billing?.billingCurrencyCode || base.billingCurrencyCode || step4.baseCurrency,
    currency: billing?.billingCurrencyCode || base.currency || step4.baseCurrency,
    defaultPaymentMethodId: billing?.defaultPaymentMethodId ?? null,
    paymentMethodId: billing?.defaultPaymentMethodId ?? base.paymentMethodId,
    paymentTiming:
      billing?.paymentTiming === "due_on_arrival" ||
      billing?.paymentTiming === "due_on_departure" ||
      billing?.paymentTiming === "prepaid" ||
      billing?.paymentTiming === "credit_terms"
        ? billing.paymentTiming
        : base.paymentTiming,
    defaultBillingRuleId: billing?.defaultBillingRuleId ?? null,
    billingInstruction: billing?.billingInstruction ?? "",
    allowCredit: Boolean(billing?.creditAccountEnabled),
    creditLimitAmount:
      billing?.creditLimitAmount == null ? base.creditLimitAmount : String(billing.creditLimitAmount),
    creditDays: billing?.creditDays ?? base.creditDays,
    creditDaysPreset: billing?.creditDays == null ? base.creditDaysPreset : String(billing.creditDays),
    creditStatus:
      billing?.creditStatus === "approved" ||
      billing?.creditStatus === "suspended" ||
      billing?.creditStatus === "pending_approval"
        ? billing.creditStatus
        : base.creditStatus,
    defaultDepositPolicyId: billing?.defaultDepositPolicyId ?? null,
    defaultCancellationPolicyId: billing?.defaultCancellationPolicyId ?? null,
    defaultNoShowPolicyId: billing?.defaultNoShowPolicyId ?? null,
    bookingNotes: billing?.bookingNotes ?? "",
  };
}

export function GuestTravelAgencyCreateModal({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
  onCancel,
  mode = "create",
  agencyId = null,
  agency = null,
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (agencyId: string) => void;
  onCancel?: () => void;
  mode?: "create" | "edit";
  agencyId?: string | null;
  agency?: GuestAccountProfile | null;
  onSaved?: (agencyId: string) => void;
}) {
  const isEdit = mode === "edit" || Boolean(agencyId) || Boolean(agency);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getTravelAgentCreateContext);
  const fetchAccount = useServerFn(getGuestAccount);
  const saveDraftHold = useServerFn(saveTravelAgentCreateDraft);
  const clearDraft = useServerFn(deleteTravelAgentCreateDraft);
  const persist = useServerFn(persistTravelAgentCreate);
  const loadStep3Config = useServerFn(getTravelAgencyCommissionRatesConfig);
  const loadContacts = useServerFn(listTravelAgentContacts);

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, agencyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: agencyId! } }),
    enabled: open && isEdit && Boolean(agencyId) && !agency,
    retry: false,
  });
  const currentAgency = agency ?? accountQuery.data ?? null;

  const localHold = useMemo(() => (!isEdit && open ? readGuestTravelAgentCreateHold(restaurantId) : null), [isEdit, open, restaurantId]);
  const [step, setStep] = useState<GuestTravelAgentCreateStepId>(() => localHold?.step ?? "basic_info");
  const [draft, setDraft] = useState<GuestTravelAgentCreateDraft>(() => {
    if (isEdit && currentAgency) return agencyProfileToCreateDraft(currentAgency);
    return localHold?.draft ?? emptyGuestTravelAgentCreateDraft();
  });
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold) || (isEdit && Boolean(currentAgency)));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());
  const editHydratedFor = useRef<string | null>(null);

  const context = useQuery({
    queryKey: ["travel-agent-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const step3ConfigQuery = useQuery({
    queryKey: ["travel-agency-step3-config", restaurantId, agencyId ?? draft.accountId],
    queryFn: () =>
      loadStep3Config({
        data: {
          restaurantId,
          agencyId: (agencyId ?? draft.accountId) || undefined,
        },
      }),
    enabled: open,
  });

  const loadStep4Config = useServerFn(getTravelAgencyStep4Config);

  const step4ConfigQuery = useQuery({
    queryKey: ["travel-agency-step4-config", restaurantId, agencyId ?? draft.accountId],
    queryFn: () =>
      loadStep4Config({
        data: {
          restaurantId,
          agencyId: (agencyId ?? draft.accountId) || undefined,
        },
      }),
    enabled: open,
  });

  const editContactsQuery = useQuery({
    queryKey: ["travel-agent-edit-contacts", restaurantId, agencyId],
    queryFn: () =>
      loadContacts({
        data: { restaurantId, agencyId: agencyId!, status: "all", limit: 50 },
      }),
    enabled: open && isEdit && Boolean(agencyId),
    retry: false,
  });

  useEffect(() => {
    if (!open) {
      editHydratedFor.current = null;
      return;
    }
    if (!isEdit || !agencyId || editHydratedFor.current === agencyId) return;
    if (
      currentAgency &&
      step3ConfigQuery.data &&
      step4ConfigQuery.data &&
      editContactsQuery.data
    ) {
      setDraft(
        hydrateAgencyEditDraft(
          currentAgency,
          step3ConfigQuery.data,
          step4ConfigQuery.data,
          editContactsQuery.data.items,
        ),
      );
      setStep("basic_info");
      setDefaultsApplied(true);
      editHydratedFor.current = agencyId;
    }
  }, [
    agencyId,
    currentAgency,
    editContactsQuery.data,
    isEdit,
    open,
    step3ConfigQuery.data,
    step4ConfigQuery.data,
  ]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (!context.data || defaultsApplied) return;
    const local = readGuestTravelAgentCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else if (context.data.defaultCurrency || context.data.usedAgencyCodes) {
      setDraft((current) => {
        const nextCode =
          !current.accountId && (!current.code || current.code === "TA-001")
            ? nextAgencyCode("TA", context.data.usedAgencyCodes ?? [])
            : current.code;
        return {
          ...current,
          code: nextCode,
          currency: current.currency || context.data.defaultCurrency,
          billingCurrencyCode: current.billingCurrencyCode || context.data.defaultCurrency,
          commissionCurrency: current.commissionCurrency || context.data.defaultCurrency,
        };
      });
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, isEdit, open, restaurantId]);

  useEffect(() => {
    if (isEdit || !defaultsApplied || created) return;
    writeGuestTravelAgentCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, isEdit, restaurantId, step, draft]);

  useEffect(() => {
    if (isEdit || !defaultsApplied || created) return;
    if (!guestTravelAgentCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_TRAVEL_AGENT_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [created, defaultsApplied, draft, isEdit, restaurantId, saveDraftHold, step]);

  const rules = useMemo(
    () =>
      createTravelAgencyFieldRules(
        context.data?.fields ?? [],
        context.data?.profileType ?? null,
      ),
    [context.data?.fields, context.data?.profileType],
  );

  const isRuleRequired = (code: string) => isTravelAgencyRuleRequired(rules, code);

  const catalogues = context.data?.catalogues;
  const catalogueIds = {
    rules,
    paymentMethodIds: (catalogues?.paymentMethods ?? []).map((row) => row.id),
    currencyCodes: catalogues?.currencies ?? [],
  };
  const completion = guestTravelAgentCreateCompletion(draft);
  const stepIndex = GUEST_TRAVEL_AGENT_CREATE_STEPS.findIndex((item) => item.id === step);
  const primary = primaryTravelAgentContact(draft);

  const fieldIssues = travelAgentCreateFieldIssues(draft, catalogueIds);

  function markAttempted(...ids: string[]) {
    setAttemptedSteps((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function fieldError(key: string, stepId: GuestTravelAgentCreateStepId = step) {
    if (!attemptedSteps.has(stepId) && !attemptedSteps.has("review")) return undefined;
    const stepFiltered = stepId ? fieldIssues.filter((issue) => issue.step === stepId) : fieldIssues;
    const matched = matchTravelAgencyFieldIssue(stepFiltered, key) ?? matchTravelAgencyFieldIssue(fieldIssues, key);
    return matched?.message;
  }

  function set<K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestTravelAgentCreateStepId) {
    if (isEdit) {
      setStep(next);
      return;
    }
    const blockers = issuesBeforeStep(fieldIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS, next);
    if (blockers.length) {
      markAttempted(step, ...blockers.map((issue) => issue.step));
      toast.error(formatCreateIssuesByStep(blockers, GUEST_TRAVEL_AGENT_CREATE_STEPS));
      const first = blockers[0];
      if (first && first.step !== step) setStep(first.step);
      return;
    }
    setStep(next);
  }

  function validateCurrent(): boolean {
    const current = fieldIssues.filter((issue) => issue.step === step);
    if (current.length) {
      markAttempted(step);
      toast.error(formatCreateIssuesByStep(current, GUEST_TRAVEL_AGENT_CREATE_STEPS));
      return false;
    }
    return true;
  }

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!draft.name?.trim()) throw new Error("Travel agency name is required.");
      if (!draft.agencyType) throw new Error("Agency type is required.");
      const targetId = agencyId ?? currentAgency?.id ?? draft.accountId;
      const payloadDraft = { ...draft, accountId: targetId };
      const saved = await persist({ data: { restaurantId, draft: payloadDraft, mode: "complete" } });
      if (saved.error) throw new Error(saved.error);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["travel-agent-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["travel-agent-workspace-summary"] });
      const targetId = agencyId ?? currentAgency?.id ?? draft.accountId ?? result.id;
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, targetId] });
      void queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, targetId] });
      toast.success("Travel agency updated successfully.");
      onOpenChange(false);
      onSaved?.(targetId ?? "");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const draftMutation = useMutation({
    mutationFn: async () => {
      const errors = travelAgentCreateDraftErrorsForSave(draft);
      if (errors.length) throw new Error(errors[0]);
      const saved = await persist({ data: { restaurantId, draft, mode: "draft" } });
      const next = { ...draft, accountId: saved.id ?? draft.accountId, contacts: saved.contacts };
      setDraft(next);
      await saveDraftHold({ data: { restaurantId, payload: { step, draft: next } as never } });
      if (saved.error) throw new Error(saved.error);
      return saved;
    },
    onSuccess: () => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success(GUEST_TRAVEL_AGENT_CREATE_DRAFT_SAVED);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (fieldIssues.length) {
        markAttempted("review", ...fieldIssues.map((issue) => issue.step));
        const first = fieldIssues[0];
        if (first) setStep(first.step);
        throw new Error(formatCreateIssuesByStep(fieldIssues, GUEST_TRAVEL_AGENT_CREATE_STEPS));
      }
      const requiredDocs = (step4ConfigQuery.data?.documentTypes ?? []).filter((d) => d.required && d.active !== false);
      if (requiredDocs.length > 0) {
        const uploadedIds = new Set((draft.documents || []).map((d) => d.documentTypeId));
        const missing = requiredDocs.filter((d) => !uploadedIds.has(d.id));
        if (missing.length > 0) {
          markAttempted("payment_rules");
          setStep("payment_rules");
          throw new Error(
            `Upload required documents before creating agency: ${missing.map((d) => d.name).join(", ")}`,
          );
        }
      }
      const saved = await persist({ data: { restaurantId, draft, mode: "complete" } });
      if (saved.id) setDraft((current) => ({ ...current, accountId: saved.id, contacts: saved.contacts }));
      if (!saved.id) throw new Error("Travel agency could not be created.");
      if (saved.error) throw new Error(saved.error);
      clearGuestTravelAgentCreateHold(restaurantId);
      await clearDraft({ data: { restaurantId } }).catch(() => undefined);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success("Travel agency created.");
      setCreated({ id: result.id!, name: draft.name, code: result.code || draft.code || null });
      if (onCreated && result.id) {
        onCreated(result.id);
      } else if (result.id) {
        void navigate({
          to: GUEST_PROFILE_DETAIL_PATH,
          params: { guestId: result.id },
          search: guestProfileSearch({ type: "travel-agent", nav: "overview" }),
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleActualClose() {
    onOpenChange(false);
    onCancel?.();
  }

  function handleCloseRequest() {
    if (isEdit) {
      handleActualClose();
      return;
    }
    if (guestTravelAgentCreateHasChanges(draft) && !created) {
      setDiscardConfirmOpen(true);
    } else {
      handleActualClose();
    }
  }

  useEffect(() => {
    if (step3ConfigQuery.data?.baseCurrency) {
      setDraft((current) => {
        const updates: Partial<GuestTravelAgentCreateDraft> = {};
        if (!current.commissionCurrency) updates.commissionCurrency = step3ConfigQuery.data.baseCurrency;
        if (!current.netCurrencyCode) updates.netCurrencyCode = step3ConfigQuery.data.baseCurrency;
        if (Object.keys(updates).length > 0) return { ...current, ...updates };
        return current;
      });
    }
  }, [step3ConfigQuery.data?.baseCurrency]);

  function resetForm() {
    const next = emptyGuestTravelAgentCreateDraft();
    const curr = step3ConfigQuery.data?.baseCurrency || context.data?.defaultCurrency;
    if (curr) {
      next.currency = curr;
      next.commissionCurrency = curr;
      next.netCurrencyCode = curr;
    }
    setDraft(next);
    setStep("basic_info");
    setHoldState("idle");
    setCreated(null);
    setAttemptedSteps(new Set());
    clearGuestTravelAgentCreateHold(restaurantId);
  }

  const startOverMutation = useMutation({
    mutationFn: () => clearDraft({ data: { restaurantId } }),
    onSettled: () => {
      resetForm();
      setStartOverOpen(false);
      queryClient.setQueryData(["travel-agent-create-context", restaurantId], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, draft: null };
      });
      toast.success("Form cleared. You can start a new travel agency.");
    },
  });

  return (
    <>
      <Dialog
        open={open}
        modal={!discardConfirmOpen && !startOverOpen}
        onOpenChange={(next) => {
          if (!next) {
            if (discardConfirmOpen || startOverOpen) return;
            handleCloseRequest();
          } else {
            onOpenChange(true);
          }
        }}
      >
        <DialogContent
          data-testid="guest-travel-agency-create-modal"
          aria-describedby="travel-agency-create-dialog-description"
          onPointerDownOutside={(e) => {
            e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (discardConfirmOpen || startOverOpen || hasNestedModalLayer()) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (hasNestedModalLayer() || discardConfirmOpen || startOverOpen) return;
            e.preventDefault();
            handleCloseRequest();
          }}
          className={cn(
            "z-[80] flex h-[92vh] max-h-[92vh] w-[min(90vw,1440px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
            "rounded-lg border border-[#3A2A16] bg-[#FBF7F1] shadow-2xl",
            "[&>button]:hidden",
          )}
        >
          <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="font-display text-sm font-semibold text-[#F3E9D8]">
                {isEdit ? `Edit Travel Agency — ${draft.name || "Agency"}` : GUEST_TRAVEL_AGENT_CREATE_TITLE}
              </DialogTitle>
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
                {completion.percent}% complete
              </span>
              <DialogDescription id="travel-agency-create-dialog-description" className="sr-only">
                {isEdit
                  ? "Update travel agency profile and save changes directly."
                  : GUEST_TRAVEL_AGENT_CREATE_COPY}
              </DialogDescription>
              <span className="ml-auto flex items-center gap-1.5">
                {isEdit ? null : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[90]">
                      <DropdownMenuItem
                        data-testid="travel-agency-create-start-over"
                        disabled={!guestTravelAgentCreateHasChanges(draft)}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setStartOverOpen(true)}
                      >
                        {GUEST_TRAVEL_AGENT_CREATE_START_OVER}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
                  onClick={handleCloseRequest}
                  aria-label="Close"
                >
                  <X className="size-4" />
                </Button>
              </span>
            </div>
          </header>
          <nav
            aria-label="Create travel agency steps"
            data-testid="guest-travel-agency-create-stepper"
            className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
          >
            <ol className="flex min-w-0 items-stretch">
              {GUEST_TRAVEL_AGENT_CREATE_STEPS.map((item, index) => {
                const current = item.id === step;
                const done = index < stepIndex;
                const invalid =
                  fieldIssues.some((issue) => issue.step === item.id) &&
                  (attemptedSteps.has(item.id) || attemptedSteps.has("review"));
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => go(item.id)}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "relative flex h-full items-center gap-1 px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                        done && !invalid && "text-[#436436]",
                        current && "text-[#251605]",
                        !current && !done && "text-muted-foreground",
                        invalid && "text-destructive",
                      )}
                    >
                      {done && !invalid ? <Check className="size-3" /> : <span className="tabular-nums">{item.number}</span>}
                      <span className="whitespace-nowrap">{item.title}</span>
                      {done && !invalid ? (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#436436]" />
                      ) : null}
                      {current ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" /> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F1] p-4">
            <div className="min-w-0 space-y-4">
                {context.isLoading ? (
                  <div className="p-12 text-center text-sm text-[#756A5B]">
                    Loading travel agency creation settings…
                  </div>
                ) : context.error ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
                    Could not load travel agency creation settings: {(context.error as Error).message}
                  </div>
                ) : (
                  <>
                    {step === "basic_info" ? (
                      <BasicInfoStep
                        draft={draft}
                        set={set}
                        catalogues={catalogues}
                        fieldError={fieldError}
                        step="basic_info"
                        isRuleRequired={isRuleRequired}
                        usedAgencyCodes={context.data?.usedAgencyCodes}
                      />
                    ) : null}
                    {step === "contacts" ? (
                      <ContactsStep
                        draft={draft}
                        set={set}
                        catalogues={catalogues}
                        fieldError={fieldError}
                        isRuleRequired={isRuleRequired}
                      />
                    ) : null}
                    {step === "commission_rates" || step === "billing" ? (
                      <GuestTravelAgencyCommissionRatesStep
                        draft={draft}
                        set={set}
                        config={step3ConfigQuery.data}
                        fieldError={fieldError}
                        isRuleRequired={isRuleRequired}
                      />
                    ) : null}
                    {step === "payment_rules" || step === "booking_operations" ? (
                      <GuestTravelAgencyPaymentRulesStep
                        draft={draft}
                        set={set}
                        config={step4ConfigQuery.data}
                        fieldError={fieldError}
                        restaurantId={restaurantId}
                        isRuleRequired={isRuleRequired}
                      />
                    ) : null}
                    {step === "review" ? (
                      <ReviewStep
                        draft={draft}
                        catalogues={catalogues}
                        config={step3ConfigQuery.data}
                        step4Config={step4ConfigQuery.data}
                        issues={fieldIssues}
                        onEdit={go}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>


          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#E8DFD0] bg-white px-4 py-2">
            {isEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleActualClose}
                  className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={SHELL_PRIMARY_BUTTON}
                  onClick={() => saveEditMutation.mutate()}
                  disabled={saveEditMutation.isPending}
                  data-testid="edit-travel-agency-save-btn"
                >
                  {saveEditMutation.isPending ? "Saving Changes…" : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {stepIndex === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseRequest}
                      className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex - 1].id)}
                      className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                    >
                      Back
                    </Button>
                  )}
                  {holdState === "saving" ? (
                    <span className="text-xs text-muted-foreground">Saving progress…</span>
                  ) : null}
                  {holdState === "saved" && guestTravelAgentCreateHasChanges(draft) ? (
                    <span className="text-xs text-muted-foreground">Progress saved</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="travel-agency-create-save-draft"
                    onClick={() => draftMutation.mutate()}
                    disabled={draftMutation.isPending || completeMutation.isPending}
                    className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                  >
                    Save as Draft
                  </Button>
                  {step === "review" ? (
                    <Button
                      type="button"
                      data-testid="create-travel-agency-final"
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      className={SHELL_PRIMARY_BUTTON}
                    >
                      {completeMutation.isPending ? "Creating Travel Agency…" : "Create Travel Agency"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        if (validateCurrent()) go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex + 1].id);
                      }}
                      className={SHELL_PRIMARY_BUTTON}
                    >
                      Next <ChevronRight className="ml-1 size-4" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent className="z-[100] rounded-2xl border border-[#DDD4C5] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-[#251605]">
              Discard new travel agency?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Your entered information will be lost if not saved as a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardConfirmOpen(false)}>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDiscardConfirmOpen(false);
                handleActualClose();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start Over Confirmation Dialog */}
      {startOverOpen ? (
        <AlertDialog open={startOverOpen} onOpenChange={setStartOverOpen}>
          <AlertDialogContent className="z-[100] rounded-2xl border border-[#DDD4C5] bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-lg text-[#251605]">
                {GUEST_TRAVEL_AGENT_CREATE_START_OVER}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {GUEST_TRAVEL_AGENT_CREATE_START_OVER_COPY}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStartOverOpen(false)}>Keep Progress</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="travel-agency-create-start-over-confirm"
                disabled={startOverMutation.isPending}
                onClick={() => startOverMutation.mutate()}
              >
                {startOverMutation.isPending ? "Clearing…" : GUEST_TRAVEL_AGENT_CREATE_START_OVER}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

function ModalField({
  label,
  required: isRequired,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className={cn("text-xs font-medium text-[#251605]", error && "text-destructive")}>
        {label}
        {isRequired ? " *" : ""}
      </Label>
      <div className={error ? "[&_input]:border-destructive [&_button]:border-destructive [&_textarea]:border-destructive" : undefined}>
        {children}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function ModalSelect({
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string | null; active?: boolean }>;
  placeholder: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(next) => onChange(next === "none" ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={cn(MODAL_SELECT_TRIGGER_CLASS, error && "border-destructive")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {options
          .filter((row) => row.active !== false || row.id === value)
          .map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.code && row.code !== row.name ? `${row.code} — ${row.name}` : row.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}






function ReviewStep({
  draft,
  catalogues,
  config,
  step4Config,
  issues,
  onEdit,
}: {
  draft: GuestTravelAgentCreateDraft;
  catalogues?: TravelAgentCreateContext["catalogues"];
  config?: TravelAgencyCommissionRatesConfig;
  step4Config?: TravelAgencyStep4Config;
  issues: Array<{ key: string; message: string; step: GuestTravelAgentCreateStepId }>;
  onEdit: (step: GuestTravelAgentCreateStepId) => void;
}) {
  const remaining = issues.length
    ? issues
    : guestTravelAgentCreateCompletion(draft).items.filter((item) => item.requiredRemaining).map((item) => ({
        key: item.id,
        message: item.label,
        step: item.step,
      }));
  const primary = primaryTravelAgentContact(draft);

  const requiredDocTypes = (step4Config?.documentTypes ?? []).filter((d) => d.required && d.active !== false);
  const uploadedDocTypeIds = new Set((draft.documents || []).map((d) => d.documentTypeId));
  const missingRequiredDocs = requiredDocTypes.filter((d) => !uploadedDocTypeIds.has(d.id));

  const selectedRule = step4Config?.billingRules.find((r) => r.id === draft.defaultBillingRuleId);
  const selectedMethod = step4Config?.paymentMethods.find(
    (m) => m.id === (draft.defaultPaymentMethodId || draft.paymentMethodId),
  );
  const depositPolicy = step4Config?.depositPolicies.find((p) => p.id === draft.defaultDepositPolicyId);
  const cancellationPolicy = step4Config?.cancellationPolicies.find((p) => p.id === draft.defaultCancellationPolicyId);
  const noShowPolicy = step4Config?.noShowPolicies.find((p) => p.id === draft.defaultNoShowPolicyId);

  return (
    <div className="space-y-4" data-testid="travel-agency-review-step">
      {remaining.length > 0 ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-semibold text-xs text-destructive">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {remaining.map((item) => (
              <li key={`${item.step}-${item.key}`} className="flex items-center justify-between">
                <span className="text-destructive">
                  {GUEST_TRAVEL_AGENT_CREATE_STEPS.find((s) => s.id === item.step)?.title}: {item.message}
                </span>
                <button
                  type="button"
                  className="font-medium underline text-destructive hover:text-destructive/80"
                  onClick={() => onEdit(item.step)}
                >
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missingRequiredDocs.length > 0 ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
            <AlertCircle className="size-4 shrink-0" />
            <span>Missing Required Documents ({missingRequiredDocs.length})</span>
          </div>
          <p className="text-xs text-destructive/90">
            The following mandatory document(s) must be uploaded before creating the agency:
          </p>
          <ul className="list-disc pl-5 text-xs text-destructive space-y-0.5">
            {missingRequiredDocs.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
          <button
            type="button"
            className="text-xs font-semibold underline text-destructive hover:text-destructive/80 pt-1"
            onClick={() => onEdit("payment_rules")}
          >
            Go to Documents (Step 4) &rarr;
          </button>
        </div>
      ) : null}

      {/* Review Cards for each step */}
      <ReviewCard title="1. Basic Information" onEdit={() => onEdit("basic_info")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Agency Name:</span> <span className="font-medium text-[#251605]">{draft.name || "—"}</span></div>
          <div><span className="text-[#756A5B]">Type:</span> <span className="font-medium text-[#251605]">{agencyTypeLabel(draft.agencyType) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Code:</span> <span className="font-medium text-[#251605]">{draft.code || "—"}</span></div>
          <div><span className="text-[#756A5B]">Status:</span> <span className="font-medium text-[#251605]">{draft.accountStatus === "inactive" ? "Inactive" : "Active"}</span></div>
          <div><span className="text-[#756A5B]">Licence #:</span> <span className="font-medium text-[#251605]">{draft.iataLicenseNumber || "—"}</span></div>
          <div><span className="text-[#756A5B]">TIN #:</span> <span className="font-medium text-[#251605]">{draft.taxId || "—"}</span></div>
          <div><span className="text-[#756A5B]">Location:</span> <span className="font-medium text-[#251605]">{[draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—"}</span></div>
          <div><span className="text-[#756A5B]">Market Segment:</span> <span className="font-medium text-[#251605]">{optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Source:</span> <span className="font-medium text-[#251605]">{draft.sourceOfBusiness || optionLabel(catalogues?.sourceCodes ?? [], draft.sourceCodeId) || "—"}</span></div>
        </div>
      </ReviewCard>

      <ReviewCard title="2. Agency Contacts" onEdit={() => onEdit("contacts")}>
        <div className="space-y-1.5 text-xs">
          <div><span className="text-[#756A5B]">Primary Contact:</span> <span className="font-semibold text-[#251605]">{primary?.name ? `${primary.name}${primary.position ? ` (${primary.position})` : ""}` : "—"}</span></div>
          {primary?.email && <div><span className="text-[#756A5B]">Email:</span> <span className="font-medium text-[#251605]">{primary.email}</span></div>}
          {primary?.phone && <div><span className="text-[#756A5B]">Phone:</span> <span className="font-medium text-[#251605]">{primary.phone}</span></div>}
          <div className="pt-1 text-[#756A5B]">{draft.contacts.length} total contact{draft.contacts.length === 1 ? "" : "s"} registered</div>
        </div>
      </ReviewCard>

      <ReviewCard title="3. Commission & Rates" onEdit={() => onEdit("commission_rates")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Commercial Model:</span> <span className="font-semibold text-[#251605] capitalize">{draft.commercialModel === "net_rate" ? "Net Rate (Confidential Wholesale)" : "Commissionable"}</span></div>
          {draft.commercialModel === "commissionable" ? (
            <>
              <div><span className="text-[#756A5B]">Commission Currency:</span> <span className="font-medium text-[#251605]">{draft.commissionCurrency || "ETB"}</span></div>
              <div><span className="text-[#756A5B]">Commission Basis:</span> <span className="font-medium text-[#251605]">Room Subtotal (excl. tax)</span></div>
              <div><span className="text-[#756A5B]">Validity:</span> <span className="font-medium text-[#251605]">{draft.commissionEffectiveOn || "Today"} {draft.commissionExpiresOn ? `to ${draft.commissionExpiresOn}` : "(Indefinite)"}</span></div>
              <div>
                <span className="text-[#756A5B]">Commission Rule:</span>{" "}
                <span className="font-semibold text-[#251605]">
                  {draft.commissionApplicationMode === "all"
                    ? `${draft.allCommissionValue || draft.commissionValue || "10"}${draft.allCommissionType === "percent" ? "%" : " " + (draft.commissionCurrency || "ETB")} (Apply to All)`
                    : `${draft.commissionRules?.length ?? 0} Specific Rule(s)`}
                </span>
                {draft.commissionApplicationMode !== "all" && (draft.commissionRules ?? []).length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {draft.commissionRules.map((rule, index) => (
                      <li key={rule.id || index}>
                        {(rule.scopeType === "room_type" ? "Room type" : rule.scopeType === "rate_plan" ? "Rate plan" : "All stays")}:{" "}
                        {rule.commissionValue || "—"}
                        {rule.commissionType === "percent" ? "%" : ` ${draft.commissionCurrency || "ETB"}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div><span className="text-[#756A5B]">Pricing Method:</span> <span className="font-semibold text-[#251605] capitalize">{draft.netPricingMethod === "rate_plan" ? "Linked Rate Plan" : draft.netPricingMethod === "rate_plan_discount" ? `Discount (${draft.netDiscountValue}${draft.netDiscountType === "percent" ? "%" : ""})` : "Contracted Net Rates"}</span></div>
              <div><span className="text-[#756A5B]">Settlement Currency:</span> <span className="font-medium text-[#251605]">{draft.netCurrencyCode || "ETB"}</span></div>
              <div><span className="text-[#756A5B]">Validity:</span> <span className="font-medium text-[#251605]">{draft.netValidFrom || "Today"} {draft.netValidUntil ? `to ${draft.netValidUntil}` : ""}</span></div>
              <div><span className="text-[#756A5B]">Contracted Rates:</span> <span className="font-medium text-[#251605]">{draft.contractedRates?.length ?? 0} Room Rate(s)</span></div>
            </>
          )}
          {draft.commercialNotes && (
            <div className="col-span-2 pt-1 border-t border-[#EDE6D8]"><span className="text-[#756A5B]">Commercial Notes:</span> <span className="text-[#251605]">{draft.commercialNotes}</span></div>
          )}
        </div>
      </ReviewCard>

      {/* 4. Payment, Credit & Reservation Rules */}
      <ReviewCard title="4. Payment, Credit & Reservation Rules" onEdit={() => onEdit("payment_rules")}>
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-semibold text-[#8A641A] mb-1">Payment &amp; Billing</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[#756A5B]">Billing Currency:</span>{" "}
                <span className="font-medium text-[#251605]">{draft.billingCurrencyCode || draft.currency || "ETB"}</span>
              </div>
              <div>
                <span className="text-[#756A5B]">Settlement Method:</span>{" "}
                <span className="font-medium text-[#251605]">
                  {selectedMethod?.name || "No preference"}
                </span>
              </div>
              <div>
                <span className="text-[#756A5B]">Payment Timing:</span>{" "}
                <span className="font-medium text-[#251605] capitalize">
                  {draft.paymentTiming?.replace(/_/g, " ") || "Due on Departure"}
                </span>
              </div>
              <div>
                <span className="text-[#756A5B]">Billing Rule:</span>{" "}
                <span className="font-medium text-[#251605]">
                  {selectedRule?.name || "—"}
                </span>
              </div>
              {draft.billingInstruction ? (
                <div className="col-span-2 pt-1">
                  <span className="text-[#756A5B]">Billing Instruction:</span>{" "}
                  <span className="text-[#251605] italic">{draft.billingInstruction}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[#EDE6D8] pt-2">
            <p className="font-semibold text-[#8A641A] mb-1">Credit Arrangement</p>
            {draft.allowCredit ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[#756A5B]">Credit Facility:</span>{" "}
                  <span className="font-medium text-emerald-700">Enabled</span>
                </div>
                <div>
                  <span className="text-[#756A5B]">Credit Status:</span>{" "}
                  <span className="font-medium text-[#251605] capitalize">
                    {draft.creditStatus?.replace(/_/g, " ") || "Pending Approval"}
                  </span>
                </div>
                <div>
                  <span className="text-[#756A5B]">Credit Limit:</span>{" "}
                  <span className="font-medium text-[#251605]">
                    {draft.creditLimitAmount
                      ? `${draft.creditLimitAmount} ${draft.billingCurrencyCode || "ETB"}`
                      : "No limit specified"}
                  </span>
                </div>
                <div>
                  <span className="text-[#756A5B]">Credit Days:</span>{" "}
                  <span className="font-medium text-[#251605]">
                    {draft.creditDays ? `Net ${draft.creditDays} Days` : "—"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[#756A5B]">Credit Facility: Disabled (Direct folio settlement upon arrival/departure)</p>
            )}
          </div>

          <div className="border-t border-[#EDE6D8] pt-2">
            <p className="font-semibold text-[#8A641A] mb-1">Reservation Policy Defaults</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[#756A5B]">Guarantee Policy:</span>{" "}
                <span className="font-medium text-[#251605]">
                  {depositPolicy?.name || "Property Default"}
                </span>
              </div>
              <div>
                <span className="text-[#756A5B]">Cancellation Policy:</span>{" "}
                <span className="font-medium text-[#251605]">
                  {cancellationPolicy?.name || "Property Default"}
                </span>
              </div>
              <div>
                <span className="text-[#756A5B]">No-Show Policy:</span>{" "}
                <span className="font-medium text-[#251605]">
                  {noShowPolicy?.name || "Property Default"}
                </span>
              </div>
              {draft.bookingNotes ? (
                <div className="col-span-2 pt-1">
                  <span className="text-[#756A5B]">Booking Notes:</span>{" "}
                  <span className="text-[#251605]">{draft.bookingNotes}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </ReviewCard>

      {/* 5. Documents & Compliance */}
      <ReviewCard title="5. Documents & Verification" onEdit={() => onEdit("payment_rules")}>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[#756A5B]">Documents Uploaded:</span>
            <span className="font-semibold text-[#251605]">
              {draft.documents?.length || 0} file(s)
            </span>
          </div>

          {missingRequiredDocs.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-destructive space-y-1">
              <p className="font-semibold text-[11px]">
                {missingRequiredDocs.length} Required Document(s) Missing:
              </p>
              <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                {missingRequiredDocs.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
              <p className="text-[10px] text-destructive/80 pt-0.5">
                Upload required compliance documents in Step 4 before creating this travel agency.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <span>All mandatory document types verified</span>
            </div>
          )}

          {draft.documents && draft.documents.length > 0 && (
            <ul className="pt-1 space-y-1 border-t border-[#EDE6D8]">
              {draft.documents.map((doc, idx) => (
                <li key={`${doc.documentTypeId}-${idx}`} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#251605] truncate max-w-[260px] font-medium">{doc.name}</span>
                  <span className="text-[#756A5B]">
                    {step4Config?.documentTypes.find((d) => d.id === doc.documentTypeId)?.name || "Uploaded Document"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ReviewCard>
    </div>
  );
}

function ReviewCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 space-y-2 shadow-none">
      <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
        <h3 className="text-xs font-semibold text-[#251605]">{title}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="h-7 border-[#C89933]/50 text-[11px] text-[#8A641A] hover:bg-[#FAF8F5]"
        >
          Edit
        </Button>
      </div>
      {children}
    </div>
  );
}
