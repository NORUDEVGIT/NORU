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
  companyCreateDraftErrors,
  companyCreateDraftErrorsForSave,
  companyCreateStepErrors,
  companyTypeLabel,
  emptyAccountCreateContact,
  emptyGuestCompanyCreateDraft,
  filled,
  guestCompanyCreateCompletion,
  guestCompanyCreateHasChanges,
  optionLabel,
  primaryCompanyContact,
  readGuestCompanyCreateHold,
  writeGuestCompanyCreateHold,
  type GuestCompanyCreateDraft,
  type GuestCompanyCreateStepId,
} from "@/packages/pms/lib/guest-company-create-workspace";
import {
  deleteCompanyCreateDraft,
  getCompanyCreateContext,
  persistCompanyCreate,
  saveCompanyCreateDraft,
  type CompanyCreateContext,
} from "@/packages/pms/lib/guest-company-create.functions";

export function GuestCompanyCreateWorkspace({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getCompanyCreateContext);
  const saveDraftHold = useServerFn(saveCompanyCreateDraft);
  const clearDraft = useServerFn(deleteCompanyCreateDraft);
  const persist = useServerFn(persistCompanyCreate);
  const fetchDuplicates = useServerFn(findCompanyDuplicates);

  const localHold = useMemo(() => readGuestCompanyCreateHold(restaurantId), [restaurantId]);
  const [step, setStep] = useState<GuestCompanyCreateStepId>(() => localHold?.step ?? "details");
  const [draft, setDraft] = useState<GuestCompanyCreateDraft>(() => localHold?.draft ?? emptyGuestCompanyCreateDraft());
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");

  const context = useQuery({
    queryKey: ["company-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!context.data || defaultsApplied) return;
    const local = readGuestCompanyCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else if (context.data.defaultCurrency) {
      setDraft((current) => (current.currency ? current : { ...current, currency: context.data.defaultCurrency }));
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, restaurantId]);

  useEffect(() => {
    if (!defaultsApplied) return;
    writeGuestCompanyCreateHold(restaurantId, { step, draft });
  }, [defaultsApplied, restaurantId, step, draft]);

  useEffect(() => {
    if (!defaultsApplied) return;
    if (!guestCompanyCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_COMPANY_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [defaultsApplied, draft, restaurantId, saveDraftHold, step]);

  const catalogues = context.data?.catalogues;
  const selectedType = (catalogues?.businessTypes ?? []).find((row) => row.id === draft.businessProfileTypeId);
  const catalogueIds = {
    businessProfileTypeIds: (catalogues?.businessTypes ?? []).map((row) => row.id),
    paymentMethodIds: (catalogues?.paymentMethods ?? []).map((row) => row.id),
    currencyCodes: catalogues?.currencies ?? [],
    creditAccountAllowed: selectedType?.creditAccountAllowed,
  };
  const completion = guestCompanyCreateCompletion(draft);
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

  function set<K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestCompanyCreateStepId) {
    setStep(next);
  }

  function validateCurrent(): boolean {
    const errors = companyCreateStepErrors(step, draft, catalogueIds);
    if (errors.length) {
      toast.error(errors[0]);
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
      const errors = companyCreateDraftErrors(draft, catalogueIds);
      if (errors.length) throw new Error(errors[0]);
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
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: result.id! },
        search: guestProfileSearch({ type: "company", nav: "overview" }),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function leave() {
    writeGuestCompanyCreateHold(restaurantId, { step, draft });
    if (guestCompanyCreateHasChanges(draft)) toast.success(GUEST_COMPANY_CREATE_PROGRESS_KEPT);
    void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "company" }) });
  }

  function resetForm() {
    const next = emptyGuestCompanyCreateDraft();
    if (context.data?.defaultCurrency) next.currency = context.data.defaultCurrency;
    setDraft(next);
    setStep("details");
    setHoldState("idle");
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
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    current && "border-primary bg-primary text-primary-foreground",
                    done && "border-primary/40 text-foreground",
                    !current && !done && "border-border text-muted-foreground",
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
            />
          ) : null}
          {step === "contacts" ? <ContactsStep draft={draft} set={set} catalogues={catalogues} /> : null}
          {step === "business" ? <BusinessStep draft={draft} set={set} catalogues={catalogues} /> : null}
          {step === "billing" ? (
            <BillingStep draft={draft} set={set} catalogues={catalogues} creditAllowed={selectedType?.creditAccountAllowed} />
          ) : null}
          {step === "review" ? <ReviewStep draft={draft} catalogues={catalogues} onEdit={go} /> : null}
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

function Field({ label, required: isRequired, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {isRequired ? " *" : ""}
      </Label>
      {children}
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
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
  duplicates: Array<{ id: string; name: string }>;
}) {
  const types = (catalogues?.businessTypes ?? []).filter((row) => row.active !== false || row.id === draft.businessProfileTypeId);
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Company Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" required>
          <Input data-testid="company-create-name" value={draft.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Trade name">
          <Input value={draft.tradeName} onChange={(event) => set("tradeName", event.target.value)} />
        </Field>
        <Field label="Company type" required>
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
        <Field label="Legal form">
          <NoneSelect
            value={draft.companyType}
            onChange={(value) => set("companyType", value)}
            options={COMPANY_TYPES.map((id) => ({ id, name: COMPANY_TYPE_LABELS[id] }))}
            placeholder="Select legal form"
          />
        </Field>
        {draft.companyType === "other" ? (
          <Field label="Legal form description">
            <Input value={draft.companyTypeOther} onChange={(event) => set("companyTypeOther", event.target.value)} />
          </Field>
        ) : null}
        <Field label="Company code">
          <Input value={draft.code} onChange={(event) => set("code", event.target.value)} placeholder="Optional staff code" />
        </Field>
        <Field label="Status">
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
          <p className="text-xs text-muted-foreground">Complete still applies Card 4 auto-approval on first create.</p>
        </Field>
        <Field label="Industry">
          <Input value={draft.industry} onChange={(event) => set("industry", event.target.value)} />
        </Field>
        <Field label="Tax ID">
          <Input value={draft.taxId} onChange={(event) => set("taxId", event.target.value)} />
        </Field>
        <Field label="Registration number">
          <Input value={draft.registrationNumber} onChange={(event) => set("registrationNumber", event.target.value)} />
        </Field>
        <Field label="Website">
          <Input value={draft.website} onChange={(event) => set("website", event.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
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
  );
}

function ContactsStep({
  draft,
  set,
  catalogues,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">Contacts</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => set("contacts", [...draft.contacts, emptyAccountCreateContact()])}>
          <Plus className="mr-1 size-3" /> Add contact
        </Button>
      </div>
      {draft.contacts.map((contact, index) => (
        <div key={contact.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <Field label="Name">
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
          <Field label="Job title">
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
          <Field label="Email">
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
          <Field label="Phone">
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
          <Field label="WhatsApp">
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
          <Field label="Preferred method">
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
          <Field label="Role">
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
      ))}
    </section>
  );
}

function BusinessStep({
  draft,
  set,
  catalogues,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Business & Commercial</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address line 1">
          <Input value={draft.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} />
        </Field>
        <Field label="Address line 2">
          <Input value={draft.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} />
        </Field>
        <Field label="City">
          <Input value={draft.city} onChange={(event) => set("city", event.target.value)} />
        </Field>
        <Field label="Region">
          <Input value={draft.region} onChange={(event) => set("region", event.target.value)} />
        </Field>
        <Field label="Postal code">
          <Input value={draft.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
        </Field>
        <Field label="Country">
          <NoneSelect
            value={draft.country}
            onChange={(value) => set("country", value)}
            options={ISO_COUNTRIES.map((row) => ({ id: row.code, name: row.name }))}
            placeholder="Select country"
          />
        </Field>
        <Field label="Market segment">
          <NoneSelect value={draft.marketSegmentId} onChange={(value) => set("marketSegmentId", value)} options={catalogues?.marketSegments ?? []} placeholder="Select segment" />
        </Field>
        <Field label="Source">
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
        <Field label="Account manager">
          <NoneSelect value={draft.accountManagerId} onChange={(value) => set("accountManagerId", value)} options={catalogues?.staff ?? []} placeholder="Select staff" />
        </Field>
        <Field label="Contract reference">
          <Input value={draft.contractReference} onChange={(event) => set("contractReference", event.target.value)} />
        </Field>
        <Field label="Contract start">
          <Input type="date" value={draft.contractStartDate} onChange={(event) => set("contractStartDate", event.target.value)} />
        </Field>
        <Field label="Contract end">
          <Input type="date" value={draft.contractEndDate} onChange={(event) => set("contractEndDate", event.target.value)} />
        </Field>
        <Field label="Default rate plan">
          <NoneSelect value={draft.ratePlanId} onChange={(value) => set("ratePlanId", value)} options={catalogues?.ratePlans ?? []} placeholder="Select rate plan" />
        </Field>
        <Field label="Default package">
          <NoneSelect value={draft.packageId} onChange={(value) => set("packageId", value)} options={catalogues?.packages ?? []} placeholder="Select package" />
        </Field>
        <Field label="Default meal plan">
          <NoneSelect value={draft.mealPlanId} onChange={(value) => set("mealPlanId", value)} options={catalogues?.mealPlans ?? []} placeholder="Select meal plan" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{COMPANY_CREATE_CONTRACT_COPY}</p>
    </section>
  );
}

function BillingStep({
  draft,
  set,
  catalogues,
  creditAllowed,
}: {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  catalogues?: CompanyCreateContext["catalogues"];
  creditAllowed?: boolean;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Billing & Credit</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Billing arrangement">
          <NoneSelect
            value={draft.billingArrangement}
            onChange={(value) => set("billingArrangement", value)}
            options={ACCOUNT_BILLING_ARRANGEMENTS.map((row) => ({ id: row.id, name: row.label }))}
            placeholder="Select arrangement"
          />
        </Field>
        <Field label="Payment method">
          <NoneSelect value={draft.paymentMethodId} onChange={(value) => set("paymentMethodId", value)} options={catalogues?.paymentMethods ?? []} placeholder="Select method" />
        </Field>
        <Field label="Currency">
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
        <Field label="Billing email">
          <Input value={draft.billingEmail} onChange={(event) => set("billingEmail", event.target.value)} />
        </Field>
        <Field label="Payment terms">
          <Input value={draft.paymentTerms} onChange={(event) => set("paymentTerms", event.target.value)} />
        </Field>
      </div>
      <Field label="Billing instruction">
        <Textarea value={draft.billingInstruction} onChange={(event) => set("billingInstruction", event.target.value)} />
      </Field>
      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
        <Label>Credit account</Label>
        <Switch
          checked={draft.creditAccountEnabled}
          disabled={creditAllowed === false}
          onCheckedChange={(checked) => set("creditAccountEnabled", Boolean(checked))}
        />
      </div>
      <p className="text-xs text-muted-foreground">{COMPANY_CREATE_CREDIT_COPY}</p>
      <Field label="Credit limit note">
        <Input value={draft.creditLimitNote} onChange={(event) => set("creditLimitNote", event.target.value)} />
      </Field>
      <Field label="Tax exemption note">
        <Textarea value={draft.taxExemptionNote} onChange={(event) => set("taxExemptionNote", event.target.value)} />
      </Field>
      <p className="text-xs text-muted-foreground">{COMPANY_CREATE_TAX_COPY}</p>
    </section>
  );
}

function ReviewStep({
  draft,
  catalogues,
  onEdit,
}: {
  draft: GuestCompanyCreateDraft;
  catalogues?: CompanyCreateContext["catalogues"];
  onEdit: (step: GuestCompanyCreateStepId) => void;
}) {
  const remaining = guestCompanyCreateCompletion(draft).items.filter((item) => item.requiredRemaining);
  const primary = primaryCompanyContact(draft);
  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-medium">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
        </section>
      ) : null}
      <ReviewCard title="Company Details" onEdit={() => onEdit("details")}>
        <p>Name: {draft.name || "—"}</p>
        <p>Type: {optionLabel(catalogues?.businessTypes ?? [], draft.businessProfileTypeId) || "—"}</p>
        <p>Legal form: {companyTypeLabel(draft.companyType) || "—"}</p>
        <p>Code: {draft.code || "—"}</p>
        <p>Status: {ACCOUNT_CREATE_STATUS_LABELS[draft.accountStatus]}</p>
      </ReviewCard>
      <ReviewCard title="Contacts" onEdit={() => onEdit("contacts")}>
        <p>Primary: {primary?.name || "—"} · {primary?.email || "—"} · {primary?.phone || "—"}</p>
        <p>Contacts: {draft.contacts.filter((row) => filled(row.name)).length}</p>
      </ReviewCard>
      <ReviewCard title="Business & Commercial" onEdit={() => onEdit("business")}>
        <p>Address: {[draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—"}</p>
        <p>Market segment: {optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</p>
        <p>Contract: {draft.contractReference || "—"} {draft.contractStartDate} {draft.contractEndDate}</p>
        <p className="text-muted-foreground">{COMPANY_CREATE_CONTRACT_COPY}</p>
      </ReviewCard>
      <ReviewCard title="Billing & Credit" onEdit={() => onEdit("billing")}>
        <p>Arrangement: {billingArrangementLabel(draft.billingArrangement) || "—"}</p>
        <p>Credit: {draft.creditAccountEnabled ? "Enabled" : "Off"}</p>
        <p>Credit note: {draft.creditLimitNote || "—"}</p>
        <p className="text-muted-foreground">{COMPANY_CREATE_CREDIT_COPY}</p>
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
