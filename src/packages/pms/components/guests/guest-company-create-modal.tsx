import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
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
import { COMPANY_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-company";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import {
  ISO_COUNTRIES,
  addressLayoutForCountry,
  countryCodeFromInput,
  countryNameFromInput,
  isRegionValidForCountry,
  regionsForCountry,
} from "@/packages/pms/lib/pms-geography";
import { findCompanyDuplicates } from "@/packages/pms/lib/guest-companies.functions";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { formatCreateIssuesByStep, issuesBeforeStep } from "@/packages/pms/lib/guest-create-step-issues";
import {
  ACCOUNT_BILLING_ARRANGEMENTS,
  ACCOUNT_CREATE_STATUS_LABELS,
  COMPANY_CREATE_CONTRACT_COPY,
  COMPANY_CREATE_CREDIT_COPY,
  COMPANY_CREATE_TAX_COPY,
  COMPANY_TYPES,
  CONTACT_PREFERRED_METHODS,
  GUEST_COMPANY_CREATE_COPY,
  GUEST_COMPANY_CREATE_DRAFT_SAVED,
  GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS,
  GUEST_COMPANY_CREATE_START_OVER,
  GUEST_COMPANY_CREATE_START_OVER_COPY,
  GUEST_COMPANY_CREATE_STEPS,
  GUEST_COMPANY_CREATE_TITLE,
  billingArrangementLabel,
  clearGuestCompanyCreateHold,
  companyCreateDraftErrorsForSave,
  companyCreateFieldIssues,
  companyTypeLabel,
  createCompanyFieldRules,
  emptyAccountCreateContact,
  emptyGuestCompanyCreateDraft,
  FIELD_CODE_BY_COMPANY_PROP,
  FIELD_CODES_BY_COMPANY_PROP,
  FIELD_ALIASES_MAP,
  matchCompanyFieldIssue,
  filled,
  guestCompanyCreateCompletion,
  guestCompanyCreateHasChanges,
  optionLabel,
  primaryCompanyContact,
  readGuestCompanyCreateHold,
  validateCompanyPhone,
  writeGuestCompanyCreateHold,
  type CompanyCreateFieldRule,
  type GuestCompanyCreateDraft,
  type GuestCompanyCreateStepId,
} from "@/packages/pms/lib/guest-company-create-workspace";
import {
  deleteCompanyCreateDraft,
  getCompanyCreateContext,
  getCompanyEditDraft,
  persistCompanyCreate,
  saveCompanyCreateDraft,
  getNextCorporateContractCode,
  type CompanyCreateContext,
} from "@/packages/pms/lib/guest-company-create.functions";
import { getGuestAccount, type GuestAccountProfile } from "@/packages/pms/lib/guest-accounts.functions";
import {
  getCompanyContractCreateConfig,
  type CompanyContractCreateConfig,
} from "@/packages/pms/lib/corporate-contracts.functions";
import {
  getCompanyBillingCreditCreateConfig,
  type CompanyBillingCreditCreateConfig,
} from "@/packages/pms/lib/guest-company-create.functions";
import { CompanyContractsStep } from "./company-contracts-step";
import { CompanyBillingStep } from "./company-billing-step";
import { CanonicalPhoneInput } from "./canonical-phone-input";
import {
  paymentTimingLabel,
  creditStatusLabel,
} from "@/packages/pms/lib/guest-company-create-workspace";
import type { CompanyContractDraft } from "@/packages/pms/lib/guest-company-create-workspace";

const MODAL_CONTROL_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#FAF8F5]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

const MODAL_TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const MODAL_TEST_ID = "guest-company-create-modal";

function hasNestedModalLayer(): boolean {
  if (typeof document === "undefined") return false;
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return [...nodes].some((node) => node.dataset["testid"] !== MODAL_TEST_ID);
}

function companyProfileToCreateDraft(account: GuestAccountProfile): GuestCompanyCreateDraft {
  const base = emptyGuestCompanyCreateDraft();
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
      roleIds: Array.isArray(c?.roleIds) ? c.roleIds : [],
      isPrimary: Boolean(c?.isPrimary),
      preferredMethod: c?.preferredMethod ?? "",
      notes: c?.notes ?? "",
    }));
  }
  return {
    ...base,
    accountId: account.id,
    name: account.name ?? "",
    tradeName: (account as any).tradeName ?? (account as any).trade_name ?? "",
    code: account.code ?? "",
    businessProfileTypeId: account.businessProfileTypeId ?? "",
    companyType: (account as any).companyType ?? (account as any).company_type ?? "",
    companyTypeOther: (account as any).companyTypeOther ?? "",
    accountStatus: (account.accountStatus as any) ?? "active",
    industry: (account as any).industry ?? "",
    taxId: (account as any).taxId ?? "",
    registrationNumber: (account as any).businessRegistrationNumber ?? (account as any).registrationNumber ?? "",
    website: (account as any).website ?? "",
    notes: account.notes ?? "",
    acknowledgeNameDuplicate: false,
    contacts,
    addressLine1: account.addressLine1 ?? "",
    addressLine2: account.addressLine2 ?? "",
    city: account.city ?? "",
    region: account.region ?? "",
    postalCode: account.postalCode ?? "",
    country: account.country ? countryCodeFromInput(account.country) : "",
    marketSegmentId: (account as any).marketSegmentId ?? "",
    sourceCodeId: (account as any).sourceCodeId ?? "",
    sourceOfBusiness: (account as any).sourceOfBusiness ?? "",
    accountManagerId: (account as any).accountManagerId ?? "",
    contractReference: (account as any).corporateAccountReference ?? (account as any).contractReference ?? "",
    contractStartDate: (account as any).contractStartDate ?? "",
    contractEndDate: (account as any).contractEndDate ?? "",
    ratePlanId: (account as any).ratePlanId ?? "",
    packageId: (account as any).packageId ?? "",
    mealPlanId: (account as any).mealPlanId ?? "",
    billingArrangement: (account as any).billingArrangement ?? "",
    billingContactName: (account as any).billingContactName ?? "",
    billingEmail: (account as any).billingEmail ?? "",
    paymentMethodId: (account as any).paymentMethodId ?? "",
    currency: (account as any).currency ?? "",
    paymentTerms: (account as any).paymentTerms ?? "",
    billingInstruction: (account as any).billingInstruction ?? "",
    creditAccountEnabled: Boolean(account.creditAccountEnabled),
    creditLimitNote: (account as any).creditLimitNote ?? "",
    taxExemptionNote: (account as any).taxExemptionNote ?? "",
    taxNote: (account as any).taxNote ?? "",
  };
}

export function GuestCompanyCreateModal({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
  onCancel,
  mode = "create",
  companyId = null,
  company = null,
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (companyId: string) => void;
  onCancel?: () => void;
  mode?: "create" | "edit";
  companyId?: string | null;
  company?: GuestAccountProfile | null;
  onSaved?: (companyId: string) => void;
}) {
  const isEdit = mode === "edit" || Boolean(companyId) || Boolean(company);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getCompanyCreateContext);
  const fetchAccount = useServerFn(getGuestAccount);
  const saveDraftHold = useServerFn(saveCompanyCreateDraft);
  const clearDraft = useServerFn(deleteCompanyCreateDraft);
  const persist = useServerFn(persistCompanyCreate);
  const loadEditDraft = useServerFn(getCompanyEditDraft);
  const fetchDuplicates = useServerFn(findCompanyDuplicates);
  const fetchContractConfig = useServerFn(getCompanyContractCreateConfig);
  const fetchNextContractCode = useServerFn(getNextCorporateContractCode);
  const fetchBillingCreditConfig = useServerFn(getCompanyBillingCreditCreateConfig);

  const contractConfig = useQuery({
    queryKey: ["company-contract-create-config", restaurantId],
    queryFn: () => fetchContractConfig({ data: { restaurantId } }),
    enabled: open,
  });

  const billingCreditConfig = useQuery({
    queryKey: ["company-billing-credit-create-config", restaurantId],
    queryFn: () => fetchBillingCreditConfig({ data: { restaurantId } }),
    enabled: open,
  });

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, companyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: companyId! } }),
    enabled: open && isEdit && Boolean(companyId) && !company,
    retry: false,
  });
  const currentCompany = company ?? accountQuery.data ?? null;

  const localHold = useMemo(() => (!isEdit && open ? readGuestCompanyCreateHold(restaurantId) : null), [isEdit, open, restaurantId]);
  const [step, setStep] = useState<GuestCompanyCreateStepId>(() => (localHold?.step === "basic" ? "details" : (localHold?.step === "business" ? "contracts" : (localHold?.step ?? "details"))));
  const [draft, setDraft] = useState<GuestCompanyCreateDraft>(() => {
    if (isEdit && currentCompany) return companyProfileToCreateDraft(currentCompany);
    return localHold?.draft ?? emptyGuestCompanyCreateDraft();
  });
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold) || (isEdit && Boolean(currentCompany)));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());
  const editHydratedFor = useRef<string | null>(null);

  const editDraftQuery = useQuery({
    queryKey: ["company-edit-draft", restaurantId, companyId],
    queryFn: () => loadEditDraft({ data: { restaurantId, companyId: companyId! } }),
    enabled: open && isEdit && Boolean(companyId),
    retry: false,
  });

  const context = useQuery({
    queryKey: ["company-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!open) {
      editHydratedFor.current = null;
      return;
    }
    if (!isEdit || !companyId) return;
    if (editHydratedFor.current === companyId) return;
    if (editDraftQuery.data) {
      setDraft(editDraftQuery.data);
      setStep("details");
      setDefaultsApplied(true);
      editHydratedFor.current = companyId;
      return;
    }
    if (editDraftQuery.isError && currentCompany) {
      setDraft(companyProfileToCreateDraft(currentCompany));
      setStep("details");
      setDefaultsApplied(true);
      editHydratedFor.current = companyId;
    }
  }, [companyId, currentCompany, editDraftQuery.data, editDraftQuery.isError, isEdit, open]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (!context.data || defaultsApplied) return;
    const local = readGuestCompanyCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else {
      setDraft((current) => {
        const next = { ...current };
        if (context.data?.defaultCurrency) {
          if (!next.currency) {
            next.currency = context.data.defaultCurrency;
          }
          if (!next.contract?.currencyCode) {
            next.contract = { ...next.contract, currencyCode: context.data.defaultCurrency };
          }
        }
        if (context.data?.defaultBusinessTypeId && !next.businessProfileTypeId) {
          next.businessProfileTypeId = context.data.defaultBusinessTypeId;
        }
        if (context.data?.autoApproval === false && next.accountStatus === "active") {
          next.accountStatus = "pending";
        }
        if (context.data?.nextCompanyCode && !next.accountId && (!next.code || next.code === "COM-0001")) {
          next.code = context.data.nextCompanyCode;
        }
        return next;
      });
    }
    setDefaultsApplied(true);
  }, [context.data, currentCompany, defaultsApplied, isEdit, open, restaurantId]);

  useEffect(() => {
    if (!open || !defaultsApplied || created || isEdit) return;
    writeGuestCompanyCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, draft, isEdit, open, restaurantId, step]);

  useEffect(() => {
    if (!open || !defaultsApplied || created || isEdit) return;
    if (!guestCompanyCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [created, defaultsApplied, draft, isEdit, open, restaurantId, saveDraftHold, step]);

  useEffect(() => {
    if (!open || !restaurantId || draft.contract.code) return;
    void fetchNextContractCode({ data: { restaurantId } })
      .then((res) => {
        if (res?.code) {
          setDraft((curr) => (curr.contract.code ? curr : { ...curr, contract: { ...curr.contract, code: res.code } }));
        }
      })
      .catch(() => undefined);
  }, [open, restaurantId, draft.contract.code, fetchNextContractCode]);

  useEffect(() => {
    if (!contractConfig.data) return;
    const settingCurrency =
      contractConfig.data.baseCurrency ||
      contractConfig.data.currencies.find((c) => c.isBase)?.code ||
      context.data?.defaultCurrency ||
      "";
    setDraft((curr) => {
      const nextContract = { ...curr.contract };
      let changed = false;
      if (!nextContract.currencyCode && settingCurrency) {
        nextContract.currencyCode = settingCurrency;
        changed = true;
      }
      const defaultDeposit = contractConfig.data.guaranteePolicies.find((p) => p.isDefault)?.id;
      if (!nextContract.depositPolicyId && defaultDeposit) {
        nextContract.depositPolicyId = defaultDeposit;
        changed = true;
      }
      const defaultCancel = contractConfig.data.cancellationPolicies.find((p) => p.isDefault)?.id;
      if (!nextContract.cancellationPolicyId && defaultCancel) {
        nextContract.cancellationPolicyId = defaultCancel;
        changed = true;
      }
      const defaultNoShow = contractConfig.data.noShowPolicies.find((p) => p.isDefault)?.id;
      if (!nextContract.noShowPolicyId && defaultNoShow) {
        nextContract.noShowPolicyId = defaultNoShow;
        changed = true;
      }
      return changed ? { ...curr, contract: nextContract } : curr;
    });
  }, [contractConfig.data, context.data?.defaultCurrency]);

  const catalogues = context.data?.catalogues;
  const selectedType = (catalogues?.businessTypes ?? []).find((row) => row.id === draft.businessProfileTypeId);

  const rules = useMemo(
    () =>
      createCompanyFieldRules(
        context.data?.fields ?? [],
        context.data?.profileType ?? null,
        selectedType ?? null,
      ),
    [context.data?.fields, context.data?.profileType, selectedType],
  );

  const resolveRule = (code: string) => {
    if (!code) return undefined;
    const c = code.toUpperCase();
    const stripped = c.startsWith("COMPANY_") ? c.slice(8) : c;
    const canonical = c.startsWith("COMPANY_") ? c : `COMPANY_${c}`;

    const propAliases = FIELD_CODES_BY_COMPANY_PROP[code] ?? [];
    const singleMapped = FIELD_CODE_BY_COMPANY_PROP[code];
    const mapList = FIELD_ALIASES_MAP[c] ?? FIELD_ALIASES_MAP[canonical] ?? [];

    const candidates = new Set<string>([
      c,
      canonical,
      stripped,
      ...(singleMapped ? [singleMapped.toUpperCase()] : []),
      ...propAliases.map((a) => a.toUpperCase()),
      ...mapList.map((a) => a.toUpperCase()),
    ]);

    for (const [prop, codes] of Object.entries(FIELD_CODES_BY_COMPANY_PROP)) {
      if (
        codes.some(
          (alias) =>
            alias.toUpperCase() === c ||
            alias.toUpperCase() === canonical ||
            alias.toUpperCase() === stripped,
        )
      ) {
        candidates.add(prop.toUpperCase());
        for (const alias of codes) candidates.add(alias.toUpperCase());
      }
    }

    return rules.find((item) => candidates.has(item.code.toUpperCase()));
  };

  const visible = (code: string) => {
    const r = resolveRule(code);
    return r ? r.visible !== false : true;
  };
  const required = (code: string) => {
    const r = resolveRule(code);
    return Boolean(r?.required);
  };

  const catalogueIds = {
    rules,
    businessProfileTypeIds: (catalogues?.businessTypes ?? []).map((row) => row.id),
    paymentMethodIds: (billingCreditConfig.data?.paymentMethods ?? catalogues?.paymentMethods ?? []).map((row) => row.id),
    currencyCodes: billingCreditConfig.data?.currencies.map((c) => c.code) ?? contractConfig.data?.currencies.map((c) => c.code) ?? catalogues?.currencies ?? [],
    creditAccountAllowed: selectedType?.creditAccountAllowed,
    contractDocumentTypes: contractConfig.data?.contractDocumentTypes,
    billingRuleIds: billingCreditConfig.data?.billingRules.map((r) => r.id),
    taxExemptionRules: billingCreditConfig.data?.taxExemptionRules,
  };
  const completion = guestCompanyCreateCompletion(draft, { rules });
  const stepIndex = GUEST_COMPANY_CREATE_STEPS.findIndex((item) => item.id === step);
  const primary = primaryCompanyContact(draft);

  const duplicates = useQuery({
    queryKey: ["company-create-duplicates", restaurantId, draft.name, draft.taxId, draft.accountId],
    queryFn: () =>
      fetchDuplicates({
        data: {
          restaurantId,
          name: draft.name,
          taxId: draft.taxId || null,
          businessRegistrationNumber: draft.registrationNumber || null,
          excludeId: draft.accountId || undefined,
        },
      }),
    enabled: filled(draft.name) && (step === "details" || step === "review"),
  });

  const duplicateMutation = useMutation({
    mutationFn: () =>
      fetchDuplicates({
        data: {
          restaurantId,
          name: draft.name,
          taxId: draft.taxId || null,
          businessRegistrationNumber: draft.registrationNumber || null,
          excludeId: draft.accountId || undefined,
        },
      }),
    onSuccess: (rows) => {
      if (rows && rows.length > 0) {
        toast.info(`Found ${rows.length} potential matching company profiles.`);
      } else {
        toast.success("No duplicate company profiles found.");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fieldIssues = companyCreateFieldIssues(draft, catalogueIds);

  function markAttempted(...ids: string[]) {
    setAttemptedSteps((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function fieldError(key: string, stepId: GuestCompanyCreateStepId = step) {
    if (!attemptedSteps.has(stepId) && !attemptedSteps.has("review")) return undefined;
    return matchCompanyFieldIssue(fieldIssues, key)?.message;
  }

  function setContract<K extends keyof CompanyContractDraft>(
    keyOrPatch: K | Partial<CompanyContractDraft> | ((prev: CompanyContractDraft) => CompanyContractDraft),
    possibleValue?: CompanyContractDraft[K],
  ) {
    setDraft((curr) => {
      const existingContract: CompanyContractDraft =
        curr.contract && typeof curr.contract === "object" && !Array.isArray(curr.contract)
          ? curr.contract
          : emptyCompanyContractDraft();

      if (typeof keyOrPatch === "function") {
        return {
          ...curr,
          contract: keyOrPatch(existingContract),
        };
      }
      if (typeof keyOrPatch === "string") {
        return {
          ...curr,
          contract: {
            ...existingContract,
            [keyOrPatch]: possibleValue,
          },
        };
      }
      if (typeof keyOrPatch === "object" && keyOrPatch !== null) {
        return {
          ...curr,
          contract: {
            ...existingContract,
            ...keyOrPatch,
          },
        };
      }
      return curr;
    });
  }

  function set<K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestCompanyCreateStepId) {
    if (isEdit) {
      setStep(next);
      return;
    }
    const blockers = issuesBeforeStep(fieldIssues, GUEST_COMPANY_CREATE_STEPS, next);
    if (blockers.length) {
      markAttempted(step, ...blockers.map((issue) => issue.step));
      toast.error(formatCreateIssuesByStep(blockers, GUEST_COMPANY_CREATE_STEPS));
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
      toast.error(formatCreateIssuesByStep(current, GUEST_COMPANY_CREATE_STEPS));
      return false;
    }
    return true;
  }

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!draft.name?.trim()) throw new Error("Company name is required.");
      if (!draft.businessProfileTypeId) throw new Error("Company type is required.");
      const targetId = companyId ?? currentCompany?.id ?? draft.accountId;
      const payloadDraft = { ...draft, accountId: targetId };
      const saved = await persist({ data: { restaurantId, draft: payloadDraft, mode: "complete" } });
      if (saved.error) throw new Error(saved.error);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["company-workspace"] });
      const targetId = companyId ?? currentCompany?.id ?? draft.accountId ?? result.id;
      void queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, targetId] });
      void queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, targetId] });
      toast.success("Company updated successfully.");
      onOpenChange(false);
      onSaved?.(targetId ?? "");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleActualClose() {
    onOpenChange(false);
    onCancel?.();
  }

  function handleAttemptClose() {
    if (isEdit) {
      handleActualClose();
      return;
    }
    if (guestCompanyCreateHasChanges(draft) && !created) {
      setDiscardConfirmOpen(true);
    } else {
      handleActualClose();
    }
  }

  function resetForm() {
    const next = emptyGuestCompanyCreateDraft();
    if (context.data?.defaultCurrency) next.currency = context.data.defaultCurrency;
    if (context.data?.nextCompanyCode) next.code = context.data.nextCompanyCode;
    setDraft(next);
    setStep("basic");
    setHoldState("idle");
    setCreated(null);
    setAttemptedSteps(new Set());
    clearGuestCompanyCreateHold(restaurantId);
  }

  const draftMutation = useMutation({
    mutationFn: async () => {
      const errors = companyCreateDraftErrorsForSave(draft);
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
      toast.success(GUEST_COMPANY_CREATE_DRAFT_SAVED);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (fieldIssues.length) {
        markAttempted("review", ...fieldIssues.map((issue) => issue.step));
        const first = fieldIssues[0];
        if (first) setStep(first.step);
        throw new Error(formatCreateIssuesByStep(fieldIssues, GUEST_COMPANY_CREATE_STEPS));
      }
      if ((duplicates.data ?? []).some((row) => !row.blocking) && !draft.acknowledgeNameDuplicate) {
        throw new Error("A company with a similar name already exists. Open it or confirm to continue.");
      }
      const saved = await persist({ data: { restaurantId, draft, mode: "complete" } });
      if (saved.id) setDraft((current) => ({ ...current, accountId: saved.id, contacts: saved.contacts }));
      if (!saved.id) throw new Error("Company could not be created.");
      if (saved.error) throw new Error(saved.error);
      clearGuestCompanyCreateHold(restaurantId);
      await clearDraft({ data: { restaurantId } }).catch(() => undefined);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success("Company created.");
      setCreated({ id: result.id!, name: draft.name, code: result.code || draft.code || null });
      if (onCreated && result.id) {
        onCreated(result.id);
      } else if (result.id) {
        onOpenChange(false);
        void navigate({
          to: GUEST_PROFILE_DETAIL_PATH,
          params: { guestId: result.id },
          search: guestProfileSearch({ type: "company", nav: "overview" }),
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startOverMutation = useMutation({
    mutationFn: () => clearDraft({ data: { restaurantId } }),
    onSettled: () => {
      resetForm();
      setStartOverOpen(false);
      queryClient.setQueryData(["company-create-context", restaurantId], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, draft: null };
      });
      toast.success("Form cleared. You can start a new company.");
    },
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            if (hasNestedModalLayer()) return;
            handleAttemptClose();
          } else {
            onOpenChange(true);
          }
        }}
      >
        <DialogContent
          data-testid="guest-company-create-modal"
          className={cn(
            "z-50 flex h-[min(92vh,960px)] w-[min(98vw,1550px)] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0",
            "rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] shadow-2xl",
            "[&>button]:hidden",
          )}
          onEscapeKeyDown={(e) => {
            if (hasNestedModalLayer()) {
              e.preventDefault();
              return;
            }
            if (guestCompanyCreateHasChanges(draft) && !created) {
              e.preventDefault();
              setDiscardConfirmOpen(true);
            }
          }}
          onPointerDownOutside={(e) => {
            if (hasNestedModalLayer()) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (hasNestedModalLayer()) e.preventDefault();
          }}
        >
          {/* Header */}
          <div className="shrink-0 border-b border-[#DDD4C5] bg-white px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="font-display text-xl font-bold text-[#251605]">
                  {isEdit ? `Edit Company — ${draft.name || "Company"}` : "Create Company"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#756A5B]">
                  {isEdit
                    ? "Update company profile and save changes directly."
                    : "Create a new company profile and commercial account."}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[#DDD4C5] text-xs text-[#251605]"
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending || !filled(draft.name)}
                >
                  Check for Duplicates
                </Button>
                <button
                  type="button"
                  onClick={handleAttemptClose}
                  aria-label="Close dialog"
                  className="rounded-full p-1.5 text-[#756A5B] hover:bg-[#F7F4EE] hover:text-[#251605]"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Stepper Navigation */}
            <ol
              className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E8E4DC] pt-3"
              data-testid="guest-company-create-stepper"
            >
              {GUEST_COMPANY_CREATE_STEPS.map((item, index) => {
                const current = item.id === step;
                const done = index < stepIndex;
                const invalid =
                  fieldIssues.some((issue) => issue.step === item.id) &&
                  (attemptedSteps.has(item.id) || attemptedSteps.has("review"));
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    {index > 0 ? <span className="h-px w-4 bg-[#DDD4C5]" aria-hidden /> : null}
                    <button
                      type="button"
                      onClick={() => go(item.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        current && "bg-[#251605] text-[#F7F4EE] shadow-sm",
                        done && !invalid && "border border-[#C89933]/50 bg-[#C89933]/10 text-[#765719]",
                        !current && !done && !invalid && "border border-[#DDD4C5] bg-white text-[#756A5B] hover:bg-[#F7F4EE]",
                        invalid && "border border-destructive bg-destructive/10 text-destructive",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-4 place-items-center rounded-full text-[10px]",
                          current ? "bg-[#C89933] text-[#251605]" : "bg-transparent",
                        )}
                      >
                        {done ? <Check className="size-3" /> : item.number}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Main Body Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-5 overflow-y-auto p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            {/* Left: Step Form Content */}
            <div className="min-w-0 space-y-4">
              {isEdit && editDraftQuery.isLoading ? (
                <p className="rounded-xl border border-[#EDE6D8] bg-white px-4 py-3 text-sm text-[#756A5B]">
                  Loading saved contacts, billing, and contract…
                </p>
              ) : null}
              {duplicates.data && duplicates.data.length > 0 ? (
                <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="flex items-center gap-2 font-medium text-amber-900">
                    <AlertTriangle className="size-4" /> Possible Matching Profiles
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {duplicates.data.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2"
                      >
                        <span>
                          <span className="font-medium">{row.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {row.tradeName || row.code || "Registered Company"}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onOpenChange(false);
                            void navigate({
                              to: GUEST_PROFILE_DETAIL_PATH,
                              params: { guestId: row.id },
                              search: guestProfileSearch({ type: "company" }),
                            });
                          }}
                        >
                          View Company
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-950">
                    <input
                      type="checkbox"
                      checked={draft.acknowledgeNameDuplicate}
                      onChange={(event) => set("acknowledgeNameDuplicate", event.target.checked)}
                      className="rounded border-[#DDD4C5]"
                    />
                    Acknowledge similarity and continue with this name
                  </label>
                </section>
              ) : null}

              {step === "details" ? (
                <DetailsStep
                  draft={draft}
                  set={set}
                  catalogues={catalogues}
                  fieldError={fieldError}
                  nextCompanyCode={context.data?.nextCompanyCode}
                  visible={visible}
                  required={required}
                />
              ) : null}

              {step === "contacts" ? (
                <ContactsStep
                  draft={draft}
                  set={set}
                  catalogues={catalogues}
                  fieldError={fieldError}
                  visible={visible}
                  required={required}
                />
              ) : null}

              {step === "billing" ? (
                // Step 3: CompanyBillingStep (replaces legacy draft.billingArrangement and draft.paymentMethodId with structured defaults)
                <CompanyBillingStep
                  draft={draft}
                  set={set}
                  config={billingCreditConfig.data}
                  creditAllowed={selectedType?.creditAccountAllowed}
                  fieldError={fieldError}
                  isLoadingConfig={billingCreditConfig.isLoading}
                  required={required}
                  isRuleRequired={required}
                  visible={visible}
                />
              ) : null}

              {step === "contracts" ? (
                <CompanyContractsStep
                  draft={draft}
                  setContract={setContract}
                  config={contractConfig.data}
                  catalogues={catalogues}
                  isLoadingConfig={contractConfig.isLoading}
                  configError={contractConfig.error instanceof Error ? contractConfig.error.message : null}
                  fieldError={fieldError}
                  required={required}
                  isRuleRequired={required}
                  visible={visible}
                />
              ) : null}

              {step === "review" ? (
                <ReviewStep
                  draft={draft}
                  catalogues={catalogues}
                  contractConfig={contractConfig.data}
                  billingCreditConfig={billingCreditConfig.data}
                  issues={fieldIssues}
                  onEdit={go}
                />
              ) : null}
            </div>

            {/* Right: Contextual Profile Preview & Completion Panel */}
            <aside className="hidden space-y-4 xl:block">
              {/* Profile Preview Card */}
              <section
                className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
                data-testid="company-create-profile-preview"
              >
                <h3 className="font-display text-sm font-semibold text-[#251605]">Profile Preview</h3>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[#EFE8DC] text-[#756A5B]">
                    <Building2 className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#251605]">
                      {draft.name || "Company Name"}
                    </p>
                    <span className="inline-block rounded bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#765719]">
                      Company (COM)
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-[#E8E4DC] pt-3 text-xs text-[#756A5B]">
                  <p className="truncate">
                    {primary?.name ? `Contact: ${primary.name}` : "No primary contact"}
                  </p>
                  <p className="truncate">{primary?.phone || "No phone recorded"}</p>
                  <p className="truncate">{primary?.email || "No email recorded"}</p>
                  <p className="truncate text-muted-foreground">
                    {[draft.city, draft.country].filter(Boolean).join(", ") || "No location recorded"}
                  </p>
                </div>
              </section>

              {/* Data Completion Card */}
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-[#251605]">Data Completion</h3>
                  <span className="font-mono text-sm font-bold text-[#8A641A]">{completion.percent}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[#EFE8DC]">
                  <div
                    className="h-1.5 rounded-full bg-[#C89933] transition-all"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {completion.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-left text-[#756A5B] hover:text-[#251605] hover:underline"
                        onClick={() => go(item.step)}
                      >
                        {item.label}
                      </button>
                      <span
                        className={
                          item.complete
                            ? "text-emerald-700"
                            : item.requiredRemaining
                              ? "font-bold text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {item.requiredRemaining ? "Required" : item.complete ? "✓" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Step Guidance Card */}
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
                <h3 className="font-display text-sm font-semibold text-[#251605]">Step Guidance</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#756A5B]">
                  {step === "details" && "Enter the company's identification information, auto-generated code, and address."}
                  {step === "contacts" && "Add primary and secondary contact persons for this corporate account."}
                  {step === "billing" && "Configure billing arrangements, payment methods, and credit limits."}
                  {step === "contracts" && "Set up corporate agreements, commercial pricing terms, policies, and contract documents."}
                  {step === "review" && "Review and confirm the company profile and corporate agreement before creating."}
                </p>
              </section>

              <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-[11px] leading-relaxed text-[#756A5B]">
                <p className="font-medium text-[#251605]">Property Setup Controlled</p>
                <p className="mt-0.5">
                  Company types, contact roles, commercial defaults, and payment methods come from Property Setup.
                </p>
              </div>
            </aside>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-white px-6 py-3">
            {isEdit ? (
              <>
                <Button type="button" variant="outline" onClick={handleAttemptClose} className="border-[#DDD4C5]">
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B3882E] font-semibold shadow-sm"
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                    data-testid="edit-company-save-btn"
                  >
                    {saveEditMutation.isPending ? "Saving Changes…" : "Save Changes"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={handleAttemptClose} className="border-[#DDD4C5]">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#DDD4C5]"
                    data-testid="company-create-start-over"
                    onClick={() => setStartOverOpen(true)}
                    disabled={!guestCompanyCreateHasChanges(draft)}
                  >
                    {GUEST_COMPANY_CREATE_START_OVER}
                  </Button>
                  {holdState === "saving" ? (
                    <span className="text-xs text-muted-foreground">Saving progress…</span>
                  ) : null}
                  {holdState === "saved" && guestCompanyCreateHasChanges(draft) ? (
                    <span className="text-xs text-muted-foreground">Progress saved</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#DDD4C5]"
                    data-testid="company-create-save-draft"
                    onClick={() => draftMutation.mutate()}
                    disabled={draftMutation.isPending || completeMutation.isPending}
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#DDD4C5]"
                    disabled={stepIndex === 0}
                    onClick={() => go(GUEST_COMPANY_CREATE_STEPS[stepIndex - 1].id)}
                  >
                    ← Back
                  </Button>

                  {step === "review" ? (
                    <Button
                      type="button"
                      className="bg-[#C89933] font-semibold text-[#251605] shadow-sm hover:bg-[#B98B2D]"
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      data-testid="create-company-final"
                    >
                      {completeMutation.isPending ? "Creating Company…" : "Create Company"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="bg-[#C89933] font-medium text-[#251605] shadow-sm hover:bg-[#B98B2D]"
                      onClick={() => {
                        if (validateCurrent()) go(GUEST_COMPANY_CREATE_STEPS[stepIndex + 1].id);
                      }}
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
        <AlertDialogContent className="rounded-2xl border border-[#DDD4C5] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-[#251605]">
              Discard new company?
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
          <AlertDialogContent className="rounded-2xl border border-[#DDD4C5] bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-lg text-[#251605]">
                {GUEST_COMPANY_CREATE_START_OVER}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {GUEST_COMPANY_CREATE_START_OVER_COPY}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStartOverOpen(false)}>Keep Progress</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="company-create-start-over-confirm"
                disabled={startOverMutation.isPending}
                onClick={() => startOverMutation.mutate()}
              >
                {GUEST_COMPANY_CREATE_START_OVER}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

function Field({
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
      <Label className={cn("text-xs font-medium text-[#251605]", error && "!text-destructive font-semibold")}>
        {label}
        {isRequired ? <span className="text-destructive font-bold"> *</span> : null}
      </Label>
      <div
        className={
          error
            ? "[&_input]:!border-destructive [&_input]:ring-1 [&_input]:!ring-destructive/30 [&_button]:!border-destructive [&_button]:ring-1 [&_button]:!ring-destructive/30 [&_textarea]:!border-destructive [&_textarea]:ring-1 [&_textarea]:!ring-destructive/30"
            : undefined
        }
      >
        {children}
      </div>
      {error ? <p className="text-xs font-medium text-destructive mt-1">{error}</p> : null}
    </div>
  );
}

function NoneSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  dataTestId,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string | null; active?: boolean }>;
  placeholder: string;
  disabled?: boolean;
  dataTestId?: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => onChange(next === "__none" ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS} data-testid={dataTestId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">None</SelectItem>
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

function DetailsStep({
  draft,
  set,
  catalogues,
  fieldError,
  nextCompanyCode,
  visible = () => true,
  required = () => false,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
  fieldError: (key: string, stepId?: GuestCompanyCreateStepId) => string | undefined;
  nextCompanyCode?: string;
  visible?: (code: string) => boolean;
  required?: (code: string) => boolean;
}) {
  const types = (catalogues?.businessTypes ?? []).filter(
    (row) => row.active !== false || row.id === draft.businessProfileTypeId,
  );

  const countryOptions = useMemo(
    () => ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name })),
    [],
  );
  const countryCode = countryCodeFromInput(draft.country) || (draft.country ? draft.country : "");
  const availableRegions = regionsForCountry(draft.country);
  const regionOptions = useMemo(
    () => availableRegions.map((region) => ({ value: region, label: region })),
    [availableRegions],
  );
  const layout = addressLayoutForCountry(draft.country);

  return (
    <div className="space-y-4">
      {/* Company Details Card */}
      <section className="space-y-4 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">Company Details</h2>
          <p className="text-xs text-muted-foreground">
            Enter the company&apos;s legal identification and commercial classification.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Profile Type">
            <Input
              value="Company (COM)"
              disabled
              readOnly
              className={cn(MODAL_CONTROL_CLASS, "font-medium text-[#765719]")}
            />
          </Field>
          <Field label="Company Name" required error={fieldError("name", "details")}>
            <Input
              data-testid="company-create-name"
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Official company name"
            />
          </Field>
          <Field label="Company Type" required error={fieldError("businessProfileTypeId", "details")}>
            <Select
              value={draft.businessProfileTypeId || undefined}
              onValueChange={(val) => set("businessProfileTypeId", val === "__none" ? "" : val)}
            >
              <SelectTrigger data-testid="company-create-type" className={MODAL_SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder={types.length ? "Select company type" : "Configure company types in settings"} />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code && row.code !== row.name ? `${row.code} — ${row.name}` : row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Company Code" required={required("COMPANY_CODE")} error={fieldError("code", "details")}>
            <div className="relative">
              <Input
                value={draft.code || nextCompanyCode || "COM-0001"}
                readOnly
                disabled
                className={cn(MODAL_CONTROL_CLASS, "bg-[#FAF8F5] font-mono text-[#765719] pr-24")}
                placeholder={nextCompanyCode || "COM-0001"}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-medium text-[#765719]">
                Auto-generated
              </span>
            </div>
          </Field>
          <Field label="Account Status" required={required("ACCOUNT_STATUS")} error={fieldError("accountStatus", "details")}>
            <Select
              value={draft.accountStatus}
              onValueChange={(value) => set("accountStatus", value as GuestCompanyCreateDraft["accountStatus"])}
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUEST_ACCOUNT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ACCOUNT_CREATE_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="TIN Number" required={required("TAX_ID")} error={fieldError("taxId", "details")}>
            <Input
              value={draft.taxId}
              onChange={(event) => set("taxId", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. 0012345678"
            />
          </Field>
          <Field label="Registration Number" required={required("REGISTRATION_NUMBER")} error={fieldError("registrationNumber", "details")}>
            <Input
              value={draft.registrationNumber}
              onChange={(event) => set("registrationNumber", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Business registry code"
            />
          </Field>
          <Field label="Industry" required={required("INDUSTRY")} error={fieldError("industry", "details")}>
            <Input
              value={draft.industry}
              onChange={(event) => set("industry", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. Technology, Finance"
            />
          </Field>
          <Field label="Website" required={required("WEBSITE")} error={fieldError("website", "details")}>
            <Input
              value={draft.website}
              onChange={(event) => set("website", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="https://example.com"
            />
          </Field>
        </div>

        <Field label="Notes" required={required("NOTES")} error={fieldError("notes", "details")}>
          <Textarea
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            className={MODAL_TEXTAREA_CLASS}
            rows={3}
            placeholder="General internal notes for this company account"
          />
        </Field>
      </section>

      {/* Company Address */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">Company Address</h2>
          <p className="text-xs text-muted-foreground">Registered address and regional location details.</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Country" required={required("COUNTRY")} error={fieldError("country", "details")}>
            <SearchableSelect
              id="company-create-country"
              value={countryCode}
              options={countryOptions}
              placeholder="Select country"
              searchPlaceholder="Search countries..."
              className={MODAL_SELECT_TRIGGER_CLASS}
              error={fieldError("country", "details")}
              onChange={(code) => {
                const name = countryNameFromInput(code);
                set("country", name);
                if (!isRegionValidForCountry(name, draft.region)) {
                  set("region", "");
                }
              }}
            />
          </Field>
          <Field label={layout.regionLabel || "Region / State"} required={required("REGION")} error={fieldError("region", "details")}>
            {availableRegions.length > 0 ? (
              <SearchableSelect
                id="company-create-region"
                value={draft.region}
                options={regionOptions}
                placeholder={`Select ${(layout.regionLabel || "region").toLowerCase()}`}
                searchPlaceholder={`Search ${(layout.regionLabel || "regions").toLowerCase()}...`}
                className={MODAL_SELECT_TRIGGER_CLASS}
                error={fieldError("region", "details")}
                onChange={(val) => set("region", val)}
              />
            ) : (
              <Input
                id="company-create-region"
                value={draft.region}
                placeholder={layout.regionLabel || "Region / State / Province"}
                onChange={(event) => set("region", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            )}
          </Field>
          <Field label="City" required={required("CITY")} error={fieldError("city", "details")}>
            <Input
              value={draft.city}
              onChange={(event) => set("city", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="City or locality"
            />
          </Field>
          <Field label="Address Line 1" required={required("ADDRESS_LINE1")} error={fieldError("addressLine1", "details")}>
            <Input
              value={draft.addressLine1}
              onChange={(event) => set("addressLine1", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Street and building number"
            />
          </Field>
          <Field label="Address Line 2" required={required("ADDRESS_LINE2")} error={fieldError("addressLine2", "details")}>
            <Input
              value={draft.addressLine2}
              onChange={(event) => set("addressLine2", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Suite, floor, unit"
            />
          </Field>
          <Field label="Postal Code" required={required("POSTAL_CODE")} error={fieldError("postalCode", "details")}>
            <Input
              value={draft.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="ZIP or postal code"
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function ContactsStep({
  draft,
  set,
  catalogues,
  fieldError,
  visible = () => true,
  required = () => false,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
  fieldError: (key: string, stepId?: GuestCompanyCreateStepId) => string | undefined;
  visible?: (code: string) => boolean;
  required?: (code: string) => boolean;
}) {
  const contactsError = fieldError("contacts", "contacts");

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-[#E8E4DC] pb-3">
          <div>
            <h2 className={cn("font-display text-base font-semibold", contactsError ? "text-destructive" : "text-[#251605]")}>
              Contact Information
            </h2>
            <p className="text-xs text-muted-foreground">
              Add primary and secondary contact persons for this corporate account.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[#DDD4C5] text-xs"
            onClick={() => set("contacts", [...draft.contacts, emptyAccountCreateContact()])}
          >
            <Plus className="mr-1 size-3.5" /> Add Contact
          </Button>
        </div>

        {contactsError ? <p className="text-xs font-medium text-destructive">{contactsError}</p> : null}

        <div className="space-y-3">
          {draft.contacts.map((contact, index) => {
            const phoneError = contact.phone ? validateCompanyPhone(contact.phone) : null;
            return (
              <div
                key={contact.key}
                className="rounded-lg border border-[#E8E4DC] bg-[#FAF8F5]/50 p-4 transition-colors hover:border-[#DDD4C5]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#251605]">
                    <input
                      type="checkbox"
                      checked={contact.isPrimary}
                      onChange={(event) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => ({
                            ...row,
                            isPrimary: event.target.checked ? i === index : i === index ? false : row.isPrimary,
                          })),
                        )
                      }
                      className="rounded border-[#CCCCCC]"
                    />
                    Primary Contact
                  </label>

                  {draft.contacts.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-[#756A5B] hover:text-destructive"
                      onClick={() => set("contacts", draft.contacts.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    label="Full Name"
                    required={required("CONTACT_NAME")}
                    error={!contact.name && required("CONTACT_NAME") ? (fieldError("CONTACT_NAME", "contacts") || "Full name is required") : undefined}
                  >
                    <Input
                      value={contact.name}
                      onChange={(event) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)),
                        )
                      }
                      className={MODAL_CONTROL_CLASS}
                      placeholder="Contact person name"
                    />
                  </Field>
                  <Field
                    label="Job Title / Position"
                    required={required("CONTACT_POSITION")}
                    error={!contact.position && required("CONTACT_POSITION") ? (fieldError("CONTACT_POSITION", "contacts") || "Position is required") : undefined}
                  >
                    <Input
                      value={contact.position}
                      onChange={(event) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, position: event.target.value } : row)),
                        )
                      }
                      className={MODAL_CONTROL_CLASS}
                      placeholder="e.g. Travel Manager"
                    />
                  </Field>
                  <Field
                    label="Email"
                    required={required("CONTACT_EMAIL")}
                    error={!contact.email && required("CONTACT_EMAIL") ? (fieldError("CONTACT_EMAIL", "contacts") || "Email is required") : undefined}
                  >
                    <Input
                      type="email"
                      value={contact.email}
                      onChange={(event) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, email: event.target.value } : row)),
                        )
                      }
                      className={MODAL_CONTROL_CLASS}
                      placeholder="name@company.com"
                    />
                  </Field>
                  <Field
                    label="Phone"
                    required={required("CONTACT_PHONE")}
                    error={phoneError || (!contact.phone && required("CONTACT_PHONE") ? (fieldError("CONTACT_PHONE", "contacts") || "Phone is required") : undefined)}
                  >
                    <CanonicalPhoneInput
                      value={contact.phone}
                      onChange={(phone) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, phone } : row)),
                        )
                      }
                      error={Boolean(phoneError || (!contact.phone && required("CONTACT_PHONE")))}
                      placeholder="e.g. 911 234 567"
                    />
                    {/* Format: +251 9... or 09... / 07... */}
                  </Field>
                  <Field
                    label="WhatsApp"
                    required={required("CONTACT_WHATSAPP")}
                    error={!contact.whatsapp && required("CONTACT_WHATSAPP") ? (fieldError("CONTACT_WHATSAPP", "contacts") || "WhatsApp is required") : undefined}
                  >
                    <CanonicalPhoneInput
                      value={contact.whatsapp}
                      onChange={(whatsapp) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, whatsapp } : row)),
                        )
                      }
                      error={Boolean(!contact.whatsapp && required("CONTACT_WHATSAPP"))}
                      placeholder="e.g. 911 234 567"
                    />
                  </Field>
                  <Field
                    label="Preferred Method"
                    required={required("CONTACT_PREFERRED_METHOD")}
                    error={!contact.preferredMethod && required("CONTACT_PREFERRED_METHOD") ? (fieldError("CONTACT_PREFERRED_METHOD", "contacts") || "Preferred method is required") : undefined}
                  >
                    <NoneSelect
                      value={contact.preferredMethod}
                      onChange={(value) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, preferredMethod: value } : row)),
                        )
                      }
                      options={CONTACT_PREFERRED_METHODS.map((row) => ({ id: row.id, name: row.label }))}
                      placeholder="Select method"
                    />
                  </Field>
                  <Field
                    label="Contact Role"
                    required={required("CONTACT_ROLE")}
                    error={(!contact.roleIds || contact.roleIds.length === 0) && required("CONTACT_ROLE") ? (fieldError("CONTACT_ROLE", "contacts") || "Contact role is required") : undefined}
                  >
                    <NoneSelect
                      value={contact.roleIds[0] ?? ""}
                      onChange={(value) =>
                        set(
                          "contacts",
                          draft.contacts.map((row, i) => (i === index ? { ...row, roleIds: value ? [value] : [] } : row)),
                        )
                      }
                      options={catalogues?.contactRoles ?? []}
                      placeholder="Select contact role"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


function ReviewStep({
  draft,
  catalogues,
  contractConfig,
  billingCreditConfig,
  issues,
  onEdit,
}: {
  draft: GuestCompanyCreateDraft;
  catalogues?: CompanyCreateContext["catalogues"];
  contractConfig?: CompanyContractCreateConfig;
  billingCreditConfig?: CompanyBillingCreditCreateConfig | null;
  issues: Array<{ key: string; message: string; step: GuestCompanyCreateStepId }>;
  onEdit: (step: GuestCompanyCreateStepId) => void;
}) {
  const remaining = issues.length
    ? issues
    : guestCompanyCreateCompletion(draft).items.filter((item) => item.requiredRemaining).map((item) => ({
        key: item.id,
        message: item.label,
        step: item.step,
      }));
  const primary = primaryCompanyContact(draft);
  const contract = draft.contract;

  const contractType = contractConfig?.contractTypes.find((t) => t.id === contract.contractTypeId);
  const selectedPlan = contractConfig?.ratePlans.find((p) => p.id === contract.ratePlanId);
  const guaranteePolicy = contractConfig?.guaranteePolicies.find((p) => p.id === contract.depositPolicyId);
  const cancellationPolicy = contractConfig?.cancellationPolicies.find((p) => p.id === contract.cancellationPolicyId);
  const noShowPolicy = contractConfig?.noShowPolicies.find((p) => p.id === contract.noShowPolicyId);

  const selectedBillingRule = billingCreditConfig?.billingRules.find((r) => r.id === draft.defaultBillingRuleId);
  const selectedPaymentMethod = billingCreditConfig?.paymentMethods.find((m) => m.id === draft.defaultPaymentMethodId);
  const selectedExemptionRule = billingCreditConfig?.taxExemptionRules.find((r) => r.id === draft.taxExemptionRuleId);

  const missingRequiredDocs = (contractConfig?.contractDocumentTypes ?? [])
    .filter((dt) => dt.required && dt.active)
    .filter((dt) => !contract.documents.some((d) => d.documentTypeId === dt.id));

  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-semibold text-destructive">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {remaining.map((item) => (
              <li key={`${item.step}-${item.key}`} className="flex items-center justify-between">
                <span className="text-destructive">
                  {GUEST_COMPANY_CREATE_STEPS.find((s) => s.id === item.step)?.title}: {item.message}
                </span>
                <button
                  type="button"
                  className="font-medium text-destructive underline hover:opacity-80"
                  onClick={() => onEdit(item.step)}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReviewCard title="Company Information" onEdit={() => onEdit("details")}>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p><span className="text-muted-foreground">Name:</span> {draft.name || "—"}</p>
          <p><span className="text-muted-foreground">Type:</span> {optionLabel(catalogues?.businessTypes ?? [], draft.businessProfileTypeId) || "—"}</p>
          <p><span className="text-muted-foreground">Code:</span> {draft.code || "—"}</p>
          <p><span className="text-muted-foreground">Status:</span> {ACCOUNT_CREATE_STATUS_LABELS[draft.accountStatus]}</p>
          <p><span className="text-muted-foreground">TIN Number:</span> {draft.taxId || "—"}</p>
          <p><span className="text-muted-foreground">Registration:</span> {draft.registrationNumber || "—"}</p>
          <p><span className="text-muted-foreground">Industry:</span> {draft.industry || "—"}</p>
          <p><span className="text-muted-foreground">Website:</span> {draft.website || "—"}</p>
          <p className="sm:col-span-2">
            <span className="text-muted-foreground">Address:</span>{" "}
            {[draft.addressLine1, draft.city, draft.region, draft.country].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
      </ReviewCard>

      <ReviewCard title="Contacts" onEdit={() => onEdit("contacts")}>
        <div className="space-y-2 text-xs">
          <p>
            <span className="text-muted-foreground">Primary Contact:</span>{" "}
            {primary?.name ? `${primary.name} · ${primary.email || "No email"} · ${primary.phone || "No phone"}` : "None"}
          </p>
          <p>
            <span className="text-muted-foreground">Total Contacts:</span>{" "}
            {draft.contacts.filter((row) => filled(row.name)).length}
          </p>
        </div>
      </ReviewCard>

      <ReviewCard title="Billing & Credit" onEdit={() => onEdit("billing")}>
        <div className="space-y-2 text-xs">
          <div>
            <p className="font-semibold text-[#8A641A]">Billing Configuration</p>
            <p>Billing Rule: {selectedBillingRule?.name || draft.defaultBillingRuleId || "—"}</p>
            <p>Settlement Method: {selectedPaymentMethod?.name || "No preference"}</p>
            <p>Billing Currency: {draft.billingCurrencyCode || "—"}</p>
            <p>Payment Timing: {paymentTimingLabel(draft.paymentTiming)}</p>
          </div>
          <div className="border-t border-[#E8E4DC] pt-1.5">
            <p className="font-semibold text-[#8A641A]">Credit Facility</p>
            <p>Credit: {draft.creditAccountEnabled ? "Enabled" : "Off"}</p>
            {draft.creditAccountEnabled ? (
              <>
                <p>
                  Limit:{" "}
                  {draft.creditLimitAmount != null
                    ? `${draft.creditLimitAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${draft.billingCurrencyCode || ""}`
                    : "None (Uncapped)"}
                </p>
                <p>Days / Terms: {draft.creditDays != null ? `${draft.creditDays} Days` : "—"}</p>
                <p>Status: {creditStatusLabel(draft.creditStatus)}</p>
              </>
            ) : null}
          </div>
          <div className="border-t border-[#E8E4DC] pt-1.5">
            <p className="font-semibold text-[#8A641A]">Tax Exemption</p>
            <p>Status: {draft.taxExempt ? "Exempt" : "Standard (Non-Exempt)"}</p>
            {draft.taxExempt ? (
              <>
                <p>Rule: {selectedExemptionRule?.name || "—"}</p>
                {draft.taxExemptionCertificateNumber ? (
                  <p>Certificate / Reference: {draft.taxExemptionCertificateNumber}</p>
                ) : null}
                {draft.taxExemptionValidTo ? <p>Valid Until: {draft.taxExemptionValidTo}</p> : null}
              </>
            ) : null}
          </div>
          {draft.billingInstruction ? (
            <div className="border-t border-[#E8E4DC] pt-1.5">
              <p className="font-semibold text-[#8A641A]">Billing Instructions</p>
              <p className="italic">{draft.billingInstruction}</p>
            </div>
          ) : null}
        </div>
      </ReviewCard>

      <ReviewCard title="Contracts & Agreements" onEdit={() => onEdit("contracts")}>
        <div className="space-y-3 text-xs">
          {/* Contract Setup */}
          <div className="grid gap-2 sm:grid-cols-2">
            <p><span className="text-muted-foreground">Contract Type:</span> {contractType?.name || "—"}</p>
            <p><span className="text-muted-foreground">Contract Name:</span> {contract.name || "—"}</p>
            <p><span className="text-muted-foreground">Contract Code:</span> {contract.code || "—"}</p>
            {contract.contractNumber ? (
              <p><span className="text-muted-foreground">Ext Reference:</span> {contract.contractNumber}</p>
            ) : null}
            <p><span className="text-muted-foreground">Validity:</span> {contract.validFrom || "—"} to {contract.validTo || "—"}</p>
            <p><span className="text-muted-foreground">Currency:</span> {contract.currencyCode || "—"}</p>
            <p><span className="text-muted-foreground">Status:</span> <span className="font-semibold capitalize">{contract.status}</span></p>
          </div>

          {/* Commercial Pricing */}
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FAF8F5] p-2.5">
            <p className="font-semibold text-[#251605]">Commercial Pricing</p>
            <div className="mt-0.5 text-muted-foreground">
              {contract.pricingMethod === "rate_plan" ? (
                <p>
                  <span className="font-medium text-[#251605]">Method A (Use Existing Rate Plan):</span>{" "}
                  {contract.ratePlanScope === "all"
                    ? `All Active Rate Plans (${contractConfig?.ratePlans.length ?? 0} plans)`
                    : contract.ratePlanIds?.length
                    ? `${contract.ratePlanIds.length} plan(s) (${contract.ratePlanIds
                        .map((id) => contractConfig?.ratePlans.find((p) => p.id === id)?.name || id)
                        .join(", ")})`
                    : selectedPlan ? `${selectedPlan.name} — ${selectedPlan.roomTypeName || "Standard"}` : contract.ratePlanId || "—"}
                </p>
              ) : contract.pricingMethod === "rate_plan_discount" ? (
                <div className="space-y-0.5">
                  <p>
                    <span className="font-medium text-[#251605]">Method B (Discount From Rate Plan):</span>{" "}
                    {contract.ratePlanScope === "all"
                      ? `All Active Rate Plans (${contractConfig?.ratePlans.length ?? 0} plans)`
                      : contract.ratePlanIds?.length
                      ? `${contract.ratePlanIds.length} plan(s) (${contract.ratePlanIds
                          .map((id) => contractConfig?.ratePlans.find((p) => p.id === id)?.name || id)
                          .join(", ")})`
                      : selectedPlan ? `${selectedPlan.name} — ${selectedPlan.roomTypeName || "Standard"}` : contract.ratePlanId || "—"}
                  </p>
                  <p>
                    {contract.discountApplication === "custom"
                      ? `Discounts: Separate per plan (${contract.ratePlanDiscounts?.length ?? 0} configured)`
                      : `Discount: Uniform ${contract.discountValue}${contract.discountType === "percent" ? "%" : ` ${contract.currencyCode || ""}`}`}
                  </p>
                </div>
              ) : (
                <p>
                  <span className="font-medium text-[#251605]">Method C (Contracted Room Rates):</span>{" "}
                  {contract.contractRates.length} room rate(s) configured
                </p>
              )}
            </div>
            {contract.pricingMethod === "contracted_rates" && contract.contractRates.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[11px]">
                {contract.contractRates.map((r, i) => {
                  const room = (contractConfig?.roomTypes ?? []).find((rt) => rt.id === r.roomTypeId);
                  return (
                    <li key={r.roomTypeId || i} className="flex justify-between border-t border-[#E8E4DC] pt-1">
                      <span>{room?.name || r.roomTypeId}</span>
                      <span className="font-mono font-medium text-[#8A641A]">{contract.currencyCode} {r.amount}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* Booking Conditions */}
          <div className="grid gap-2 sm:grid-cols-3">
            <p><span className="text-muted-foreground">Guarantee:</span> {guaranteePolicy?.name || "None"}</p>
            <p><span className="text-muted-foreground">Cancellation:</span> {cancellationPolicy?.name || "None"}</p>
            <p><span className="text-muted-foreground">No-Show:</span> {noShowPolicy?.name || "None"}</p>
          </div>

          {/* Documents */}
          <div>
            <p><span className="text-muted-foreground">Documents:</span> {contract.documents.length} uploaded</p>
            {missingRequiredDocs.length > 0 && contract.status === "active" ? (
              <p className="mt-1 text-xs font-semibold text-destructive">
                Missing required: {missingRequiredDocs.map((d) => d.name).join(", ")}
              </p>
            ) : null}
          </div>

          {/* Notes */}
          {contract.notes ? (
            <p><span className="text-muted-foreground">Contract Notes:</span> {contract.notes}</p>
          ) : null}
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
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-[#E8E4DC] pb-2">
        <h3 className="font-display text-sm font-semibold text-[#251605]">{title}</h3>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-[#8A641A] hover:text-[#251605]" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
