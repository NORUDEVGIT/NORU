import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";

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
import { cn } from "@/shared/lib/utils";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { COMPANY_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-company";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
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
  GUEST_COMPANY_CREATE_PROGRESS_KEPT,
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
  filled,
  FIELD_CODE_BY_COMPANY_PROP,
  FIELD_CODES_BY_COMPANY_PROP,
  FIELD_ALIASES_MAP,
  matchCompanyFieldIssue,
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
  type CompanyContractDraft,
} from "@/packages/pms/lib/guest-company-create-workspace";
import {
  deleteCompanyCreateDraft,
  getCompanyCreateContext,
  getNextCorporateContractCode,
  persistCompanyCreate,
  saveCompanyCreateDraft,
  type CompanyCreateContext,
} from "@/packages/pms/lib/guest-company-create.functions";
import {
  getCompanyContractCreateConfig,
  type CompanyContractCreateConfig,
} from "@/packages/pms/lib/corporate-contracts.functions";
import {
  getCompanyBillingCreditCreateConfig,
  type CompanyBillingCreditCreateConfig,
} from "@/packages/pms/lib/guest-company-create.functions";
import { CompanyContractsStep } from "@/packages/pms/components/guests/company-contracts-step";
import { CompanyBillingStep } from "@/packages/pms/components/guests/company-billing-step";
import {
  paymentTimingLabel,
  creditStatusLabel,
} from "@/packages/pms/lib/guest-company-create-workspace";

export function GuestCompanyCreateWorkspace({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getCompanyCreateContext);
  const saveDraftHold = useServerFn(saveCompanyCreateDraft);
  const clearDraft = useServerFn(deleteCompanyCreateDraft);
  const persist = useServerFn(persistCompanyCreate);
  const fetchDuplicates = useServerFn(findCompanyDuplicates);
  const fetchContractConfig = useServerFn(getCompanyContractCreateConfig);
  const fetchNextContractCode = useServerFn(getNextCorporateContractCode);
  const fetchBillingCreditConfig = useServerFn(getCompanyBillingCreditCreateConfig);

  const localHold = useMemo(() => readGuestCompanyCreateHold(restaurantId), [restaurantId]);
  const [step, setStep] = useState<GuestCompanyCreateStepId>(() => (localHold?.step === "basic" ? "details" : (localHold?.step === "business" ? "contracts" : (localHold?.step ?? "details"))));
  const [draft, setDraft] = useState<GuestCompanyCreateDraft>(() => localHold?.draft ?? emptyGuestCompanyCreateDraft());
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());

  const context = useQuery({
    queryKey: ["company-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const contractConfig = useQuery({
    queryKey: ["company-contract-create-config", restaurantId],
    queryFn: () => fetchContractConfig({ data: { restaurantId } }),
  });

  const billingCreditConfig = useQuery({
    queryKey: ["company-billing-credit-create-config", restaurantId],
    queryFn: () => fetchBillingCreditConfig({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!restaurantId || draft.contract.code) return;
    void fetchNextContractCode({ data: { restaurantId } })
      .then((res) => {
        if (res?.code) {
          setDraft((curr) => (curr.contract.code ? curr : { ...curr, contract: { ...curr.contract, code: res.code } }));
        }
      })
      .catch(() => undefined);
  }, [restaurantId, draft.contract.code, fetchNextContractCode]);

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

  useEffect(() => {
    if (!context.data || defaultsApplied) return;
    const local = readGuestCompanyCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step === "basic" ? "details" : (local.step === "business" ? "contracts" : local.step));
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step === "basic" ? "details" : (context.data.draft.step === "business" ? "contracts" : context.data.draft.step));
    } else {
      if (context.data.defaultCurrency) {
        setDraft((current) => (current.currency ? current : { ...current, currency: context.data.defaultCurrency }));
      }
      if (context.data.defaultBusinessTypeId) {
        setDraft((current) => (current.businessProfileTypeId ? current : { ...current, businessProfileTypeId: context.data.defaultBusinessTypeId }));
      }
      if (context.data.autoApproval === false) {
        setDraft((current) => (current.accountStatus === "active" ? { ...current, accountStatus: "pending" } : current));
      }
      if (context.data.nextCompanyCode) {
        setDraft((current) => (current.code && current.code !== "COM-0001" ? current : { ...current, code: context.data.nextCompanyCode }));
      }
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, restaurantId]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    writeGuestCompanyCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, restaurantId, step, draft]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    if (!guestCompanyCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [created, defaultsApplied, draft, restaurantId, saveDraftHold, step]);

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
      setCreated({ id: result.id!, name: draft.name, code: draft.code || null });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function leave() {
    if (!created) writeGuestCompanyCreateHold(restaurantId, { step, draft });
    if (!created && guestCompanyCreateHasChanges(draft)) toast.success(GUEST_COMPANY_CREATE_PROGRESS_KEPT);
    void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "company" }) });
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

  if (context.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading company creation…</p>;
  }
  if (context.error) {
    return (
      <div className="p-6">
        <p className="font-display text-lg">Could not load company creation settings.</p>
        <p className="mt-2 text-sm text-muted-foreground">{(context.error as Error).message}</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="company-create-success">
        <h1 className="font-display text-2xl">Company created</h1>
        <p className="text-sm text-muted-foreground">
          {created.name}
          {created.code ? ` · ${created.code}` : ""}
        </p>
        <p className="text-sm">Company</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              void navigate({
                to: GUEST_PROFILE_DETAIL_PATH,
                params: { guestId: created.id },
                search: guestProfileSearch({ type: "company", nav: "overview" }),
              })
            }
          >
            View Company
          </Button>
          <Button
            variant="outline"
            onClick={() => void navigate({ to: "/restaurant/bookings/new", search: { companyMasterId: created.id } })}
          >
            Create Reservation
          </Button>
          <Button variant="outline" onClick={resetForm}>
            Add Another Company
          </Button>
          <Button variant="ghost" onClick={leave}>
            Return to Company List
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="company-create-workspace">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          <Link to={GUEST_PROFILE_DIRECTORY_PATH} search={guestProfileSearch({ type: "company" })} className="hover:underline">
            Guest Profile
          </Link>
          {" > "}
          Register New Company
        </p>
        <div className="mt-2">
          <h1 className="font-display text-2xl">{GUEST_COMPANY_CREATE_TITLE}</h1>
          <p className="text-sm text-muted-foreground">{GUEST_COMPANY_CREATE_COPY}</p>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GUEST_COMPANY_CREATE_STEPS.map((item, index) => {
            const current = item.id === step;
            const done = index < stepIndex;
            const invalid = fieldIssues.some((issue) => issue.step === item.id) && (attemptedSteps.has(item.id) || attemptedSteps.has("review"));
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    current && "border-primary bg-primary text-primary-foreground",
                    done && !invalid && "border-primary/40 text-foreground",
                    !current && !done && !invalid && "border-border text-muted-foreground",
                    invalid && "border-destructive text-destructive",
                  )}
                >
                  {done ? <Check className="mr-1 inline size-3" /> : `${item.number} `}
                  {item.title}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="grid min-h-0 flex-1 items-start gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,20rem)] sm:p-6">
        <div className="min-w-0 space-y-4">
          {step === "details" ? (
            <DetailsStep
              draft={draft}
              set={set}
              catalogues={catalogues}
              duplicates={(duplicates.data ?? []).filter((row) => !row.blocking)}
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

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Company Summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <SummaryRow label="Company Name" value={draft.name || "—"} />
              <SummaryRow label="Type" value={optionLabel(catalogues?.businessTypes ?? [], draft.businessProfileTypeId) || "—"} />
              <SummaryRow label="Status" value={ACCOUNT_CREATE_STATUS_LABELS[draft.accountStatus]} />
              <SummaryRow label="Primary contact" value={primary?.name || "—"} />
              <SummaryRow label="Code" value={draft.code || "Optional"} />
            </dl>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Data Completion</h3>
            <p className="mt-1 text-2xl font-semibold">{completion.percent}%</p>
            <ul className="mt-2 space-y-1 text-sm">
              {completion.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <button type="button" className="text-left hover:underline" onClick={() => go(item.step)}>
                    {item.label}
                  </button>
                  <span>{item.requiredRemaining ? "!" : item.complete ? "✓" : "—"}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={() => go(GUEST_COMPANY_CREATE_STEPS[stepIndex - 1].id)}>
            ← Previous
          </Button>
          <Button type="button" variant="ghost" onClick={leave}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="company-create-start-over"
            onClick={() => setStartOverOpen(true)}
            disabled={!guestCompanyCreateHasChanges(draft)}
          >
            {GUEST_COMPANY_CREATE_START_OVER}
          </Button>
          {holdState === "saving" ? <span className="text-xs text-muted-foreground">Saving progress…</span> : null}
          {holdState === "saved" && guestCompanyCreateHasChanges(draft) ? (
            <span className="text-xs text-muted-foreground">Progress saved</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="company-create-save-draft"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending || completeMutation.isPending}
          >
            Save as Draft
          </Button>
          {step === "review" ? (
            <Button
              type="button"
              data-testid="company-create-complete"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              Create Company
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                if (validateCurrent()) go(GUEST_COMPANY_CREATE_STEPS[stepIndex + 1].id);
              }}
            >
              Next <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      </footer>

      {startOverOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <p className="font-display text-lg">{GUEST_COMPANY_CREATE_START_OVER}?</p>
            <p className="mt-2 text-sm text-muted-foreground">{GUEST_COMPANY_CREATE_START_OVER_COPY}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartOverOpen(false)}>
                Keep Progress
              </Button>
              <Button variant="destructive" disabled={startOverMutation.isPending} onClick={() => startOverMutation.mutate()}>
                {GUEST_COMPANY_CREATE_START_OVER}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, required: isRequired, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className={cn(error ? "!text-destructive font-semibold" : undefined)}>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function NoneSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; active?: boolean }>;
  placeholder: string;
}) {
  return (
    <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {options
          .filter((row) => row.active !== false || row.id === value)
          .map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.name}
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
  duplicates,
  fieldError,
  nextCompanyCode,
  visible = () => true,
  required = () => false,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
  duplicates: Array<{ id: string; name: string }>;
  fieldError: (key: string, stepId?: GuestCompanyCreateStepId) => string | undefined;
  nextCompanyCode?: string;
  visible?: (code: string) => boolean;
  required?: (code: string) => boolean;
}) {
  const types = (catalogues?.businessTypes ?? []).filter((row) => row.active !== false || row.id === draft.businessProfileTypeId);

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Company Details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" required error={fieldError("name", "details")}>
            <Input data-testid="company-create-name" value={draft.name} onChange={(event) => set("name", event.target.value)} />
          </Field>
          <Field label="Company type" required error={fieldError("businessProfileTypeId", "details")}>
            <Select value={draft.businessProfileTypeId} onValueChange={(value) => set("businessProfileTypeId", value)}>
              <SelectTrigger data-testid="company-create-type">
                <SelectValue placeholder={types.length ? "Select type" : "Configure company types in settings"} />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Company code" required={required("COMPANY_CODE")} error={fieldError("code", "details")}>
            <Input
              value={draft.code || nextCompanyCode || "COM-0001"}
              readOnly
              disabled
              placeholder={nextCompanyCode || "COM-0001"}
              className="bg-muted text-muted-foreground font-mono"
            />
          </Field>
          <Field label="Status" required={required("ACCOUNT_STATUS")} error={fieldError("accountStatus", "details")}>
            <Select value={draft.accountStatus} onValueChange={(value) => set("accountStatus", value as GuestCompanyCreateDraft["accountStatus"])}>
              <SelectTrigger>
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
          <Field label="Industry" required={required("INDUSTRY")} error={fieldError("industry", "details")}>
            <Input value={draft.industry} onChange={(event) => set("industry", event.target.value)} />
          </Field>
          <Field label="TIN Number" required={required("TAX_ID")} error={fieldError("taxId", "details")}>
            <Input value={draft.taxId} onChange={(event) => set("taxId", event.target.value)} placeholder="e.g. 0012345678" />
          </Field>
          <Field label="Registration number" required={required("REGISTRATION_NUMBER")} error={fieldError("registrationNumber", "details")}>
            <Input value={draft.registrationNumber} onChange={(event) => set("registrationNumber", event.target.value)} />
          </Field>
          <Field label="Website" required={required("WEBSITE")} error={fieldError("website", "details")}>
            <Input value={draft.website} onChange={(event) => set("website", event.target.value)} />
          </Field>
        </div>
        <Field label="Notes" required={required("NOTES")} error={fieldError("notes", "details")}>
          <Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        {duplicates.length > 0 ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>A company with a similar name already exists: {duplicates.map((row) => row.name).join(", ")}.</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.acknowledgeNameDuplicate}
                onChange={(event) => set("acknowledgeNameDuplicate", event.target.checked)}
              />
              Continue with this name
            </label>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Company Address</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Country" required={required("COUNTRY")} error={fieldError("country", "details")}>
            <NoneSelect
              value={draft.country}
              onChange={(value) => set("country", value)}
              options={ISO_COUNTRIES.map((row) => ({ id: row.code, name: row.name }))}
              placeholder="Select country"
            />
          </Field>
          <Field label="Region" required={required("REGION")} error={fieldError("region", "details")}>
            <Input value={draft.region} onChange={(event) => set("region", event.target.value)} />
          </Field>
          <Field label="City" required={required("CITY")} error={fieldError("city", "details")}>
            <Input value={draft.city} onChange={(event) => set("city", event.target.value)} />
          </Field>
          <Field label="Address line 1" required={required("ADDRESS_LINE1")} error={fieldError("addressLine1", "details")}>
            <Input value={draft.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} />
          </Field>
          <Field label="Address line 2" required={required("ADDRESS_LINE2")} error={fieldError("addressLine2", "details")}>
            <Input value={draft.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} />
          </Field>
          <Field label="Postal code" required={required("POSTAL_CODE")} error={fieldError("postalCode", "details")}>
            <Input value={draft.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
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
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className={contactsError ? "font-display text-lg text-destructive" : "font-display text-lg"}>Contacts</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => set("contacts", [...draft.contacts, emptyAccountCreateContact()])}>
            <Plus className="mr-1 size-3" /> Add contact
          </Button>
        </div>
        {contactsError ? <p className="text-xs text-destructive">{contactsError}</p> : null}
        {draft.contacts.map((contact, index) => {
          const phoneErr = contact.phone ? validateCompanyPhone(contact.phone) : null;
          return (
            <div key={contact.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
              <Field
                label="Name"
                required={required("CONTACT_NAME")}
                error={!contact.name && required("CONTACT_NAME") ? (fieldError("CONTACT_NAME", "contacts") || "Name is required") : undefined}
              >
                <Input
                  value={contact.name}
                  onChange={(event) =>
                    set(
                      "contacts",
                      draft.contacts.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <Field
                label="Job title"
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
                />
              </Field>
              <Field
                label="Email"
                required={required("CONTACT_EMAIL")}
                error={!contact.email && required("CONTACT_EMAIL") ? (fieldError("CONTACT_EMAIL", "contacts") || "Email is required") : undefined}
              >
                <Input
                  value={contact.email}
                  onChange={(event) =>
                    set(
                      "contacts",
                      draft.contacts.map((row, i) => (i === index ? { ...row, email: event.target.value } : row)),
                    )
                  }
                />
              </Field>
              <Field
                label="Phone"
                required={required("CONTACT_PHONE")}
                error={phoneErr || (!contact.phone && required("CONTACT_PHONE") ? (fieldError("CONTACT_PHONE", "contacts") || "Phone is required") : undefined)}
              >
                <Input
                  value={contact.phone}
                  onChange={(event) =>
                    set(
                      "contacts",
                      draft.contacts.map((row, i) => (i === index ? { ...row, phone: event.target.value } : row)),
                    )
                  }
                  placeholder="+251 9... or 09... / 07..."
                />
              </Field>
              <Field
                label="WhatsApp"
                required={required("CONTACT_WHATSAPP")}
                error={!contact.whatsapp && required("CONTACT_WHATSAPP") ? (fieldError("CONTACT_WHATSAPP", "contacts") || "WhatsApp is required") : undefined}
              >
                <Input
                  value={contact.whatsapp}
                  onChange={(event) =>
                    set(
                      "contacts",
                      draft.contacts.map((row, i) => (i === index ? { ...row, whatsapp: event.target.value } : row)),
                    )
                  }
                  placeholder="+251 9... or 09... / 07..."
                />
              </Field>
              <Field
                label="Preferred method"
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
                  placeholder="Optional"
                />
              </Field>
              <Field
                label="Role"
                required={required("CONTACT_ROLE")}
                error={(!contact.roleIds || contact.roleIds.length === 0) && required("CONTACT_ROLE") ? (fieldError("CONTACT_ROLE", "contacts") || "Role is required") : undefined}
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
                  placeholder="Contact role"
                />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
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
                  />
                  Primary
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => set("contacts", draft.contacts.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
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
        <section className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {remaining.map((item) => (
              <li key={`${item.step}-${item.key}`}>
                <span className="text-destructive">
                  {GUEST_COMPANY_CREATE_STEPS.find((step) => step.id === item.step)?.title}: {item.message}
                </span>{" "}
                <button type="button" className="underline" onClick={() => onEdit(item.step)}>
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ReviewCard title="Company Information" onEdit={() => onEdit("details")}>
        <p>Name: {draft.name || "—"}</p>
        <p>Type: {optionLabel(catalogues?.businessTypes ?? [], draft.businessProfileTypeId) || "—"}</p>
        <p>Code: {draft.code || "—"}</p>
        <p>Status: {ACCOUNT_CREATE_STATUS_LABELS[draft.accountStatus]}</p>
        <p>TIN Number: {draft.taxId || "—"}</p>
        <p>Registration: {draft.registrationNumber || "—"}</p>
        <p>Address: {[draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Contacts" onEdit={() => onEdit("contacts")}>
        <p>Primary: {primary?.name || "—"} · {primary?.email || "—"} · {primary?.phone || "—"}</p>
        <p>Total contacts: {draft.contacts.filter((row) => filled(row.name)).length}</p>
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
          <div className="border-t border-border pt-1.5">
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
          <div className="border-t border-border pt-1.5">
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
            <div className="border-t border-border pt-1.5">
              <p className="font-semibold text-[#8A641A]">Billing Instructions</p>
              <p className="italic">{draft.billingInstruction}</p>
            </div>
          ) : null}
        </div>
      </ReviewCard>
      <ReviewCard title="Contracts & Agreements" onEdit={() => onEdit("contracts")}>
        <p>Contract Type: {contractType?.name || "—"}</p>
        <p>Contract Name: {contract.name || "—"}</p>
        <p>Contract Code: {contract.code || "—"}</p>
        <p>Validity: {contract.validFrom || "—"} to {contract.validTo || "—"}</p>
        <p>Status: {contract.status}</p>
        <p>Currency: {contract.currencyCode || "—"}</p>
        <div className="mt-2 rounded border border-border p-2">
          <p className="font-semibold">Pricing: {contract.pricingMethod === "rate_plan" ? "Method A (Existing Plan)" : contract.pricingMethod === "rate_plan_discount" ? "Method B (Plan Discount)" : "Method C (Contracted Rates)"}</p>
          {contract.pricingMethod === "rate_plan" && (
            <p>
              Scope:{" "}
              {contract.ratePlanScope === "all"
                ? `All Active Rate Plans (${contractConfig?.ratePlans.length ?? 0} plans)`
                : contract.ratePlanIds?.length
                ? `${contract.ratePlanIds.length} plan(s) (${contract.ratePlanIds
                    .map((id) => contractConfig?.ratePlans.find((p) => p.id === id)?.name || id)
                    .join(", ")})`
                : selectedPlan?.name || contract.ratePlanId || "—"}
            </p>
          )}
          {contract.pricingMethod === "rate_plan_discount" && (
            <div className="space-y-0.5">
              <p>
                Scope:{" "}
                {contract.ratePlanScope === "all"
                  ? `All Active Rate Plans (${contractConfig?.ratePlans.length ?? 0} plans)`
                  : contract.ratePlanIds?.length
                  ? `${contract.ratePlanIds.length} plan(s) (${contract.ratePlanIds
                      .map((id) => contractConfig?.ratePlans.find((p) => p.id === id)?.name || id)
                      .join(", ")})`
                  : selectedPlan?.name || contract.ratePlanId || "—"}
              </p>
              <p>
                {contract.discountApplication === "custom"
                  ? `Discounts: Separate per plan (${contract.ratePlanDiscounts?.length ?? 0} configured)`
                  : `Discount: Uniform ${contract.discountValue}${contract.discountType === "percent" ? "%" : ` ${contract.currencyCode || ""}`}`}
              </p>
            </div>
          )}
          {contract.pricingMethod === "contracted_rates" && <p>{contract.contractRates.length} negotiated rate(s) configured</p>}
        </div>
        <p>Guarantee: {guaranteePolicy?.name || "None"}</p>
        <p>Cancellation: {cancellationPolicy?.name || "None"}</p>
        <p>No-Show: {noShowPolicy?.name || "None"}</p>
        <p>Documents: {contract.documents.length} uploaded</p>
        {missingRequiredDocs.length > 0 && contract.status === "active" && (
          <p className="text-destructive font-semibold">Missing required documents: {missingRequiredDocs.map((d) => d.name).join(", ")}</p>
        )}
        {contract.notes ? <p>Notes: {contract.notes}</p> : null}
      </ReviewCard>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">{title}</h2>
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </section>
  );
}
