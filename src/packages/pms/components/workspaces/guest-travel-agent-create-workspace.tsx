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
import { AGENCY_TYPE_LABELS } from "@/packages/pms/lib/guest-profile-travel-agency";
import { GUEST_ACCOUNT_STATUSES } from "@/packages/pms/lib/guest-profile-wave4";
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
  GUEST_TRAVEL_AGENT_CREATE_PROGRESS_KEPT,
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
import {
  GuestTravelAgencyCommissionRatesStep,
  CommercialSummaryPanel,
} from "@/packages/pms/components/guests/guest-travel-agency-commission-rates-step";
import { getTravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.functions";
import { GuestTravelAgencyPaymentRulesStep } from "@/packages/pms/components/guests/guest-travel-agency-payment-rules-step";
import { getTravelAgencyStep4Config } from "@/packages/pms/lib/guest-travel-agency-step4.functions";

export function GuestTravelAgentCreateWorkspace({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getTravelAgentCreateContext);
  const loadStep3Config = useServerFn(getTravelAgencyCommissionRatesConfig);
  const loadStep4Config = useServerFn(getTravelAgencyStep4Config);
  const saveDraftHold = useServerFn(saveTravelAgentCreateDraft);
  const clearDraft = useServerFn(deleteTravelAgentCreateDraft);
  const persist = useServerFn(persistTravelAgentCreate);

  const localHold = useMemo(() => readGuestTravelAgentCreateHold(restaurantId), [restaurantId]);
  const [step, setStep] = useState<GuestTravelAgentCreateStepId>(() => localHold?.step ?? "basic_info");
  const [draft, setDraft] = useState<GuestTravelAgentCreateDraft>(
    () => localHold?.draft ?? emptyGuestTravelAgentCreateDraft(),
  );
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());

  const context = useQuery({
    queryKey: ["travel-agent-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  const step3ConfigQuery = useQuery({
    queryKey: ["travel-agency-step3-config", restaurantId],
    queryFn: () => loadStep3Config({ data: { restaurantId } }),
  });

  const step4ConfigQuery = useQuery({
    queryKey: ["travel-agency-step4-config", restaurantId],
    queryFn: () => loadStep4Config({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!context.data || defaultsApplied) return;
    const local = readGuestTravelAgentCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else if (context.data.defaultCurrency) {
      setDraft((current) =>
        current.currency
          ? current
          : { ...current, currency: context.data.defaultCurrency, commissionCurrency: context.data.defaultCurrency },
      );
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, restaurantId]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    writeGuestTravelAgentCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, restaurantId, step, draft]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    if (!guestTravelAgentCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_TRAVEL_AGENT_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [created, defaultsApplied, draft, restaurantId, saveDraftHold, step]);

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
    const norm = (id: string) => (id === "details" ? "basic_info" : id);
    if (!attemptedSteps.has(stepId) && !attemptedSteps.has(norm(stepId)) && !attemptedSteps.has("review")) return undefined;
    const stepFiltered = stepId ? fieldIssues.filter((issue) => norm(issue.step) === norm(stepId)) : fieldIssues;
    const matched = matchTravelAgencyFieldIssue(stepFiltered, key) ?? matchTravelAgencyFieldIssue(fieldIssues, key);
    return matched?.message;
  }

  function set<K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestTravelAgentCreateStepId) {
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
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function leave() {
    if (!created) writeGuestTravelAgentCreateHold(restaurantId, { step, draft });
    if (!created && guestTravelAgentCreateHasChanges(draft)) toast.success(GUEST_TRAVEL_AGENT_CREATE_PROGRESS_KEPT);
    void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "travel-agent" }) });
  }

  function resetForm() {
    const next = emptyGuestTravelAgentCreateDraft();
    if (context.data?.defaultCurrency) {
      next.currency = context.data.defaultCurrency;
      next.commissionCurrency = context.data.defaultCurrency;
    }
    setDraft(next);
    setStep("details");
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

  if (context.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading travel agency creation…</p>;
  }
  if (context.error) {
    return (
      <div className="p-6">
        <p className="font-display text-lg">Could not load travel agency creation settings.</p>
        <p className="mt-2 text-sm text-muted-foreground">{(context.error as Error).message}</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="travel-agent-create-success">
        <h1 className="font-display text-2xl">Travel agency created</h1>
        <p className="text-sm text-muted-foreground">
          {created.name}
          {created.code ? ` · ${created.code}` : ""}
        </p>
        <p className="text-sm">Travel Agency</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              void navigate({
                to: GUEST_PROFILE_DETAIL_PATH,
                params: { guestId: created.id },
                search: guestProfileSearch({ type: "travel-agent", nav: "overview" }),
              })
            }
          >
            View Travel Agency
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void navigate({ to: "/restaurant/bookings/new", search: { travelAgentMasterId: created.id } })
            }
          >
            Create Reservation
          </Button>
          <Button variant="outline" onClick={resetForm}>
            Add Another Travel Agency
          </Button>
          <Button variant="ghost" onClick={leave}>
            Return to Travel Agency List
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="travel-agent-create-workspace">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          <Link
            to={GUEST_PROFILE_DIRECTORY_PATH}
            search={guestProfileSearch({ type: "travel-agent" })}
            className="hover:underline"
          >
            Guest Profile
          </Link>
          {" > "}
          Register New Travel Agency
        </p>
        <div className="mt-2">
          <h1 className="font-display text-2xl">{GUEST_TRAVEL_AGENT_CREATE_TITLE}</h1>
          <p className="text-sm text-muted-foreground">{GUEST_TRAVEL_AGENT_CREATE_COPY}</p>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GUEST_TRAVEL_AGENT_CREATE_STEPS.map((item, index) => {
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
          {step === "basic_info" || step === "details" ? (
            <>
              <DetailsStep draft={draft} set={set} fieldError={fieldError} isRuleRequired={isRuleRequired} />
              <BusinessStep draft={draft} set={set} catalogues={catalogues} fieldError={fieldError} isRuleRequired={isRuleRequired} />
            </>
          ) : null}
          {step === "contacts" ? (
            <ContactsStep
              draft={draft}
              set={set}
              error={fieldError("contacts", "contacts")}
              fieldError={fieldError}
              catalogues={catalogues}
              isRuleRequired={isRuleRequired}
            />
          ) : null}
          {step === "commission_rates" || step === "business" ? (
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
          {step === "billing" ? <BillingStep draft={draft} set={set} catalogues={catalogues} fieldError={fieldError} /> : null}
          {step === "review" ? <ReviewStep draft={draft} catalogues={catalogues} issues={fieldIssues} onEdit={go} /> : null}
        </div>
        <aside className="space-y-4">
          {step === "commission_rates" ? (
            <CommercialSummaryPanel draft={draft} config={step3ConfigQuery.data} />
          ) : (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-display text-base">Agency Summary</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <SummaryRow label="Agency Name" value={draft.name || "—"} />
                <SummaryRow label="Type" value={agencyTypeLabel(draft.agencyType) || "—"} />
                <SummaryRow label="Status" value={ACCOUNT_CREATE_STATUS_LABELS[draft.accountStatus]} />
                <SummaryRow label="Primary contact" value={primary?.name || "—"} />
                <SummaryRow label="IATA / license" value={draft.iataLicenseNumber || "—"} />
              </dl>
            </section>
          )}
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
          <Button
            type="button"
            variant="outline"
            disabled={stepIndex === 0}
            onClick={() => go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex - 1].id)}
          >
            ← Previous
          </Button>
          <Button type="button" variant="ghost" onClick={leave}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="travel-agent-create-start-over"
            onClick={() => setStartOverOpen(true)}
            disabled={!guestTravelAgentCreateHasChanges(draft)}
          >
            {GUEST_TRAVEL_AGENT_CREATE_START_OVER}
          </Button>
          {holdState === "saving" ? <span className="text-xs text-muted-foreground">Saving progress…</span> : null}
          {holdState === "saved" && guestTravelAgentCreateHasChanges(draft) ? (
            <span className="text-xs text-muted-foreground">Progress saved</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="travel-agent-create-save-draft"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending || completeMutation.isPending}
          >
            Save as Draft
          </Button>
          {step === "review" ? (
            <Button
              type="button"
              data-testid="travel-agent-create-complete"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              Create Travel Agency
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                if (validateCurrent()) go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex + 1].id);
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
            <p className="font-display text-lg">{GUEST_TRAVEL_AGENT_CREATE_START_OVER}?</p>
            <p className="mt-2 text-sm text-muted-foreground">{GUEST_TRAVEL_AGENT_CREATE_START_OVER_COPY}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartOverOpen(false)}>
                Keep Progress
              </Button>
              <Button variant="destructive" disabled={startOverMutation.isPending} onClick={() => startOverMutation.mutate()}>
                {GUEST_TRAVEL_AGENT_CREATE_START_OVER}
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
      <Label className={error ? "text-destructive font-semibold" : undefined}>
        {label}
        {isRequired ? <span className="text-destructive font-bold"> *</span> : ""}
      </Label>
      <div className={error ? "[&_input]:border-destructive [&_button]:border-destructive [&_textarea]:border-destructive" : undefined}>
        {children}
      </div>
      {error ? <p className="text-xs text-destructive font-medium">{error}</p> : null}
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
  fieldError,
  isRuleRequired,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  fieldError: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
  isRuleRequired?: (code: string) => boolean;
}) {
  const req = (code: string, fallback = false) => (isRuleRequired ? isRuleRequired(code) : fallback);
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Agency Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agency name" required={req("TA_NAME", true)} error={fieldError("name", "basic_info")}>
          <Input data-testid="travel-agent-create-name" value={draft.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Trade name" required={req("TA_TRADE_NAME")} error={fieldError("tradeName", "basic_info")}>
          <Input value={draft.tradeName} onChange={(event) => set("tradeName", event.target.value)} />
        </Field>
        <Field label="Agency type" required={req("TA_AGENCY_TYPE", true)} error={fieldError("agencyType", "basic_info")}>
          <Select value={draft.agencyType} onValueChange={(value) => set("agencyType", value)}>
            <SelectTrigger data-testid="travel-agent-create-type">
              <SelectValue placeholder="Select agency type" />
            </SelectTrigger>
            <SelectContent>
              {AGENCY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {AGENCY_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {draft.agencyType === "other" ? (
          <Field label="Agency type description" error={fieldError("agencyTypeOther", "basic_info")}>
            <Input value={draft.agencyTypeOther} onChange={(event) => set("agencyTypeOther", event.target.value)} />
          </Field>
        ) : null}
        <Field label="Agency code" required={req("TA_CODE")} error={fieldError("code", "basic_info")}>
          <Input value={draft.code} onChange={(event) => set("code", event.target.value)} placeholder="Optional staff code" />
        </Field>
        <Field label="Status" required={req("TA_ACCOUNT_STATUS")} error={fieldError("accountStatus", "basic_info")}>
          <Select value={draft.accountStatus} onValueChange={(value) => set("accountStatus", value as GuestTravelAgentCreateDraft["accountStatus"])}>
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
          <p className="text-xs text-muted-foreground">Travel agency create stays pending. There is no auto-approval.</p>
        </Field>
        <Field label="IATA / license number" required={req("TA_IATA_NUMBER")} error={fieldError("iataLicenseNumber", "basic_info")}>
          <Input value={draft.iataLicenseNumber} onChange={(event) => set("iataLicenseNumber", event.target.value)} />
        </Field>
        <Field label="License expiry" required={req("TA_LICENSE_EXPIRY")} error={fieldError("licenseExpiryDate", "basic_info")}>
          <Input type="date" value={draft.licenseExpiryDate} onChange={(event) => set("licenseExpiryDate", event.target.value)} />
        </Field>
        <Field label="Website" required={req("TA_WEBSITE")} error={fieldError("website", "basic_info")}>
          <Input value={draft.website} onChange={(event) => set("website", event.target.value)} />
        </Field>
      </div>
      <Field label="Notes" required={req("TA_NOTES")} error={fieldError("notes", "basic_info")}>
        <Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
      </Field>
    </section>
  );
}

function ContactsStep({
  draft,
  set,
  error,
  fieldError,
  catalogues,
  isRuleRequired,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  error?: string;
  fieldError?: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
  catalogues?: TravelAgentCreateContext["catalogues"];
  isRuleRequired?: (code: string) => boolean;
}) {
  const req = (code: string) => (isRuleRequired ? isRuleRequired(code) : false);
  const err = (key: string) => (fieldError ? fieldError(key, "contacts") : undefined);
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className={error ? "font-display text-lg text-destructive" : "font-display text-lg"}>Contacts</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => set("contacts", [...draft.contacts, emptyAccountCreateContact()])}>
          <Plus className="mr-1 size-3" /> Add contact
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {draft.contacts.map((contact, index) => (
        <div key={contact.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <Field label="Name" required={req("TA_CONTACT_NAME")} error={!contact.name && req("TA_CONTACT_NAME") ? (err("contactName") || "Contact name is required") : undefined}>
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
          <Field label="Position" required={req("TA_CONTACT_POSITION")} error={!contact.position && req("TA_CONTACT_POSITION") ? (err("contactPosition") || "Position is required") : undefined}>
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
          <Field label="Email" required={req("TA_CONTACT_EMAIL")} error={!contact.email && req("TA_CONTACT_EMAIL") ? (err("contactEmail") || "Email is required") : undefined}>
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
          <Field label="Phone" required={req("TA_CONTACT_PHONE")} error={!contact.phone && req("TA_CONTACT_PHONE") ? (err("contactPhone") || "Phone is required") : undefined}>
            <Input
              value={contact.phone}
              onChange={(event) =>
                set(
                  "contacts",
                  draft.contacts.map((row, i) => (i === index ? { ...row, phone: event.target.value } : row)),
                )
              }
            />
          </Field>
          <Field label="WhatsApp" required={req("TA_CONTACT_WHATSAPP")} error={!contact.whatsapp && req("TA_CONTACT_WHATSAPP") ? (err("contactWhatsapp") || "WhatsApp is required") : undefined}>
            <Input
              value={contact.whatsapp}
              onChange={(event) =>
                set(
                  "contacts",
                  draft.contacts.map((row, i) => (i === index ? { ...row, whatsapp: event.target.value } : row)),
                )
              }
            />
          </Field>
          <Field label="Preferred method" required={req("TA_CONTACT_PREFERRED_METHOD")} error={!contact.preferredMethod && req("TA_CONTACT_PREFERRED_METHOD") ? (err("contactPreferredMethod") || "Preferred method is required") : undefined}>
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
            <Button type="button" size="icon" variant="ghost" onClick={() => set("contacts", draft.contacts.filter((_, i) => i !== index))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function BusinessStep({
  draft,
  set,
  catalogues,
  fieldError,
  isRuleRequired,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  catalogues?: TravelAgentCreateContext["catalogues"];
  fieldError?: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
  isRuleRequired?: (code: string) => boolean;
}) {
  const req = (code: string, fallback = false) => (isRuleRequired ? isRuleRequired(code) : fallback);
  const err = (key: string) => (fieldError ? fieldError(key, "basic_info") : undefined);
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Business & Registration</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address line 1" required={req("TA_ADDRESS_LINE1")} error={err("addressLine1")}>
          <Input value={draft.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} />
        </Field>
        <Field label="Address line 2" required={req("TA_ADDRESS_LINE2")} error={err("addressLine2")}>
          <Input value={draft.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} />
        </Field>
        <Field label="City" required={req("TA_CITY")} error={err("city")}>
          <Input value={draft.city} onChange={(event) => set("city", event.target.value)} />
        </Field>
        <Field label="Region" required={req("TA_REGION")} error={err("region")}>
          <Input value={draft.region} onChange={(event) => set("region", event.target.value)} />
        </Field>
        <Field label="Postal code" required={req("TA_POSTAL_CODE")} error={err("postalCode")}>
          <Input value={draft.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
        </Field>
        <Field label="Country" required={req("TA_COUNTRY")} error={err("country")}>
          <Input value={draft.country} onChange={(event) => set("country", event.target.value)} />
        </Field>
        <Field label="Tax ID" required={req("TA_TAX_ID")} error={err("taxId")}>
          <Input value={draft.taxId} onChange={(event) => set("taxId", event.target.value)} />
        </Field>
        <Field label="Registration number" required={req("TA_REGISTRATION_NUMBER")} error={err("registrationNumber")}>
          <Input value={draft.registrationNumber} onChange={(event) => set("registrationNumber", event.target.value)} />
        </Field>
        <Field label="Market segment" required={req("TA_MARKET_SEGMENT")} error={err("marketSegmentId")}>
          <NoneSelect value={draft.marketSegmentId} onChange={(value) => set("marketSegmentId", value)} options={catalogues?.marketSegments ?? []} placeholder="Select segment" />
        </Field>
        <Field label="Source" required={req("TA_SOURCE")} error={err("sourceCodeId")}>
          <NoneSelect
            value={draft.sourceCodeId}
            onChange={(value) => {
              const selected = (catalogues?.sourceCodes ?? []).find((row) => row.id === value);
              set("sourceCodeId", value);
              set("sourceOfBusiness", selected?.code || selected?.name || "");
            }}
            options={catalogues?.sourceCodes ?? []}
            placeholder="Select source"
          />
        </Field>
        <Field label="Account manager" required={req("TA_ACCOUNT_MANAGER")} error={err("accountManagerId")}>
          <NoneSelect value={draft.accountManagerId} onChange={(value) => set("accountManagerId", value)} options={catalogues?.staff ?? []} placeholder="Select staff" />
        </Field>
      </div>
    </section>
  );
}

function BookingOperationsStep({
  draft,
  set,
  catalogues,
  fieldError,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  catalogues?: TravelAgentCreateContext["catalogues"];
  fieldError: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
}) {
  return (
    <div className="space-y-4" data-testid="travel-agency-booking-operations-step">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Booking & Contracts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contract reference">
            <Input value={draft.contractReference} onChange={(event) => set("contractReference", event.target.value)} />
          </Field>
          <Field label="Contract start" error={fieldError("contractStartDate", "booking_operations")}>
            <Input type="date" value={draft.contractStartDate} onChange={(event) => set("contractStartDate", event.target.value)} />
          </Field>
          <Field label="Contract end" error={fieldError("contractEndDate", "booking_operations")}>
            <Input type="date" value={draft.contractEndDate} onChange={(event) => set("contractEndDate", event.target.value)} />
          </Field>
          <Field label="Default package">
            <NoneSelect value={draft.packageId} onChange={(value) => set("packageId", value)} options={catalogues?.packages ?? []} placeholder="Select package" />
          </Field>
          <Field label="Default meal plan">
            <NoneSelect value={draft.mealPlanId} onChange={(value) => set("mealPlanId", value)} options={catalogues?.mealPlans ?? []} placeholder="Select meal plan" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{TRAVEL_AGENT_CREATE_CONTRACT_COPY}</p>
      </section>
    </div>
  );
}

function BillingStep({
  draft,
  set,
  catalogues,
  fieldError,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  catalogues?: TravelAgentCreateContext["catalogues"];
  fieldError: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Commercial & Billing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default rate plan">
            <NoneSelect value={draft.ratePlanId} onChange={(value) => set("ratePlanId", value)} options={catalogues?.ratePlans ?? []} placeholder="Select rate plan" />
          </Field>
          <Field label="Default package">
            <NoneSelect value={draft.packageId} onChange={(value) => set("packageId", value)} options={catalogues?.packages ?? []} placeholder="Select package" />
          </Field>
          <Field label="Default meal plan">
            <NoneSelect value={draft.mealPlanId} onChange={(value) => set("mealPlanId", value)} options={catalogues?.mealPlans ?? []} placeholder="Select meal plan" />
          </Field>
          <Field label="Contract reference">
            <Input value={draft.contractReference} onChange={(event) => set("contractReference", event.target.value)} />
          </Field>
          <Field label="Contract start" error={fieldError("contractStartDate", "billing")}>
            <Input type="date" value={draft.contractStartDate} onChange={(event) => set("contractStartDate", event.target.value)} />
          </Field>
          <Field label="Contract end" error={fieldError("contractEndDate", "billing")}>
            <Input type="date" value={draft.contractEndDate} onChange={(event) => set("contractEndDate", event.target.value)} />
          </Field>
          <Field label="Billing arrangement" error={fieldError("billingArrangement", "billing")}>
            <NoneSelect
              value={draft.billingArrangement}
              onChange={(value) => set("billingArrangement", value)}
              options={ACCOUNT_BILLING_ARRANGEMENTS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select arrangement"
            />
          </Field>
          <Field label="Payment method" error={fieldError("paymentMethodId", "billing")}>
            <NoneSelect value={draft.paymentMethodId} onChange={(value) => set("paymentMethodId", value)} options={catalogues?.paymentMethods ?? []} placeholder="Select method" />
          </Field>
          <Field label="Currency" error={fieldError("currency", "billing")}>
            <NoneSelect
              value={draft.currency}
              onChange={(value) => set("currency", value)}
              options={(catalogues?.currencies ?? []).map((code) => ({ id: code, name: code }))}
              placeholder="Property currency"
            />
          </Field>
          <Field label="Billing contact">
            <Input value={draft.billingContactName} onChange={(event) => set("billingContactName", event.target.value)} />
          </Field>
          <Field label="Credit limit amount" error={fieldError("creditLimitAmount", "billing")}>
            <Input type="number" min={0} value={draft.creditLimitAmount} onChange={(event) => set("creditLimitAmount", event.target.value)} />
          </Field>
          <Field label="Credit limit note">
            <Input value={draft.creditLimitNote} onChange={(event) => set("creditLimitNote", event.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{TRAVEL_AGENT_CREATE_CONTRACT_COPY}</p>
        <p className="text-xs text-muted-foreground">{TRAVEL_AGENT_CREATE_CREDIT_COPY}</p>
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <Label>Commission plan</Label>
          <Switch checked={draft.commissionEnabled} onCheckedChange={(checked) => set("commissionEnabled", Boolean(checked))} />
        </div>
        <p className="text-xs text-muted-foreground">{TA_COMMISSION_REFERENCE_COPY}</p>
        {draft.commissionEnabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Commission type" error={fieldError("commissionType", "billing")}>
              <NoneSelect
                value={draft.commissionType}
                onChange={(value) => set("commissionType", value)}
                options={TA_COMMISSION_PLAN_TYPES.map((id) => ({ id, name: id === "percent" ? "Percent" : "Fixed" }))}
                placeholder="Select type"
              />
            </Field>
            <Field label="Value" error={fieldError("commissionValue", "billing")}>
              <Input type="number" min={0} value={draft.commissionValue} onChange={(event) => set("commissionValue", event.target.value)} />
            </Field>
            <Field label="Currency">
              <Input value={draft.commissionCurrency} onChange={(event) => set("commissionCurrency", event.target.value.toUpperCase())} />
            </Field>
            <Field label="Effective on">
              <Input type="date" value={draft.commissionEffectiveOn} onChange={(event) => set("commissionEffectiveOn", event.target.value)} />
            </Field>
            <Field label="Expires on">
              <Input type="date" value={draft.commissionExpiresOn} onChange={(event) => set("commissionExpiresOn", event.target.value)} />
            </Field>
            <Field label="Notes">
              <Input value={draft.commissionNotes} onChange={(event) => set("commissionNotes", event.target.value)} />
            </Field>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReviewStep({
  draft,
  catalogues,
  issues,
  onEdit,
}: {
  draft: GuestTravelAgentCreateDraft;
  catalogues?: TravelAgentCreateContext["catalogues"];
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
                  {GUEST_TRAVEL_AGENT_CREATE_STEPS.find((step) => step.id === item.step)?.title}: {item.message}
                </span>{" "}
                <button type="button" className="underline" onClick={() => onEdit(item.step)}>
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ReviewCard title="Agency Details" onEdit={() => onEdit("details")}>
        <p>Name: {draft.name || "—"}</p>
        <p>Type: {agencyTypeLabel(draft.agencyType) || "—"}</p>
        <p>Status: {ACCOUNT_CREATE_STATUS_LABELS.pending}</p>
        <p>IATA / license: {draft.iataLicenseNumber || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Contacts" onEdit={() => onEdit("contacts")}>
        <p>Primary: {primary?.name || "—"} · {primary?.email || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Business & Registration" onEdit={() => onEdit("business")}>
        <p>Address: {[draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—"}</p>
        <p>Market segment: {optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Commercial & Billing" onEdit={() => onEdit("billing")}>
        <p>Arrangement: {billingArrangementLabel(draft.billingArrangement) || "—"}</p>
        <p>Credit limit: {draft.creditLimitAmount || "—"}</p>
        <p>Commission: {draft.commissionEnabled ? `${draft.commissionType} ${draft.commissionValue}` : "Not set"}</p>
        <p className="text-muted-foreground">{TA_COMMISSION_REFERENCE_COPY}</p>
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
