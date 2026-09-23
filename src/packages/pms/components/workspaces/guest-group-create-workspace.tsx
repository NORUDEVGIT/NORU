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
import { GROUP_TOUR_OPERATOR_COPY, GROUP_STATUS_LABELS } from "@/packages/pms/lib/guest-group-detail-workspace";
import { searchGroupPartners, searchGuestsForGroup } from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GUEST_GROUP_CREATE_COPY,
  GUEST_GROUP_CREATE_DRAFT_SAVED,
  GUEST_GROUP_CREATE_HOLD_DEBOUNCE_MS,
  GUEST_GROUP_CREATE_PROGRESS_KEPT,
  GUEST_GROUP_CREATE_START_OVER,
  GUEST_GROUP_CREATE_START_OVER_COPY,
  GUEST_GROUP_CREATE_STEPS,
  GUEST_GROUP_CREATE_TITLE,
  GROUP_BILLING_ARRANGEMENTS,
  GROUP_CREATE_IMPORT_STRUCTURE,
  GROUP_CREATE_NO_PHYSICAL_ROOMS,
  GROUP_CREATE_PRICING_UNAVAILABLE,
  GROUP_TRAVEL_METHODS,
  billingArrangementLabel,
  clearGuestGroupCreateHold,
  emptyGroupCreateMember,
  emptyGroupCreateRoomNeed,
  emptyGuestGroupCreateDraft,
  estimateGroupCreationCharges,
  filled,
  guestGroupCreateCompletion,
  guestGroupCreateHasChanges,
  groupCreateDraftErrors,
  groupCreateDraftErrorsForSave,
  groupCreateMemberCounts,
  groupCreateNights,
  groupCreateStepErrors,
  optionLabel,
  readGuestGroupCreateHold,
  stageGroupMemberImport,
  travelMethodLabel,
  writeGuestGroupCreateHold,
  type GuestGroupCreateDraft,
  type GuestGroupCreateStepId,
} from "@/packages/pms/lib/guest-group-create-workspace";
import {
  deleteGroupCreateDraft,
  getGroupCreateContext,
  loadGroupCreateCredit,
  persistGroupCreate,
  saveGroupCreateDraft,
  type GroupCreateContext,
} from "@/packages/pms/lib/guest-group-create.functions";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { applyGroupTemplateToDraft, GROUP_TEMPLATE_COPY, listGroupTemplates } from "@/packages/pms/lib/guest-group-templates";

export function GuestGroupCreateWorkspace({ restaurantId }: { restaurantId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGroupCreateContext);
  const saveDraftHold = useServerFn(saveGroupCreateDraft);
  const clearDraft = useServerFn(deleteGroupCreateDraft);
  const persist = useServerFn(persistGroupCreate);
  const searchPartners = useServerFn(searchGroupPartners);
  const searchGuests = useServerFn(searchGuestsForGroup);
  const loadCredit = useServerFn(loadGroupCreateCredit);

  const localHold = useMemo(() => readGuestGroupCreateHold(restaurantId), [restaurantId]);
  const [step, setStep] = useState<GuestGroupCreateStepId>(() => localHold?.step ?? "details");
  const [draft, setDraft] = useState<GuestGroupCreateDraft>(() => localHold?.draft ?? emptyGuestGroupCreateDraft());
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [companyQuery, setCompanyQuery] = useState("");
  const [agencyQuery, setAgencyQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [importCsv, setImportCsv] = useState("");
  const [memberDraft, setMemberDraft] = useState(emptyGroupCreateMember());
  const [templateId, setTemplateId] = useState("");
  const loadTemplates = useServerFn(listGroupTemplates);
  const templates = useQuery({
    queryKey: ["group-templates", restaurantId],
    queryFn: () => loadTemplates({ data: { restaurantId } }),
  });

  const context = useQuery({
    queryKey: ["group-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!context.data || defaultsApplied) return;
    const local = readGuestGroupCreateHold(restaurantId);
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
    writeGuestGroupCreateHold(restaurantId, { step, draft });
  }, [defaultsApplied, restaurantId, step, draft]);

  useEffect(() => {
    if (!defaultsApplied) return;
    if (!guestGroupCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_GROUP_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [defaultsApplied, draft, restaurantId, saveDraftHold, step]);

  const catalogues = context.data?.catalogues;
  const companiesQuery = useQuery({
    queryKey: ["group-create-companies", restaurantId, companyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "company", q: companyQuery } }),
    enabled: step === "details" || step === "review",
  });
  const agenciesQuery = useQuery({
    queryKey: ["group-create-agencies", restaurantId, agencyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "travel_agent", q: agencyQuery } }),
    enabled: step === "details" || step === "review",
  });
  const contactsQuery = useQuery({
    queryKey: ["group-create-contacts", restaurantId, contactQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: contactQuery } }),
    enabled: step === "details",
  });
  const guestsQuery = useQuery({
    queryKey: ["group-create-guests", restaurantId, guestQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: guestQuery } }),
    enabled: step === "guests",
  });
  const creditMasterId = draft.companyMasterId || draft.travelAgentMasterId;
  const creditQuery = useQuery({
    queryKey: ["group-create-credit", restaurantId, creditMasterId],
    queryFn: () => loadCredit({ data: { restaurantId, masterId: creditMasterId } }),
    enabled: Boolean(creditMasterId) && (step === "billing" || step === "review"),
  });

  const completion = guestGroupCreateCompletion(draft);
  const counts = groupCreateMemberCounts(draft);
  const nights = groupCreateNights(draft.arrivalDate, draft.departureDate);
  const estimate = estimateGroupCreationCharges();
  const stepIndex = GUEST_GROUP_CREATE_STEPS.findIndex((item) => item.id === step);
  const catalogueIds = {
    groupTypeIds: (catalogues?.groupTypes ?? []).map((row) => row.id),
    roomTypeIds: (catalogues?.roomTypes ?? []).map((row) => row.id),
    paymentMethodIds: (catalogues?.paymentMethods ?? []).map((row) => row.id),
    currencyCodes: catalogues?.currencies ?? [],
  };

  function set<K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestGroupCreateStepId) {
    setStep(next);
  }

  function validateCurrent(): boolean {
    const errors = groupCreateStepErrors(step, draft, catalogueIds);
    if (errors.length) {
      toast.error(errors[0]);
      return false;
    }
    if (step === "guests" && counts.expected > 0 && counts.registered !== counts.expected) {
      toast.message(`Registered members (${counts.registered}) differ from expected guests (${counts.expected}). You can continue.`);
    }
    return true;
  }

  const holdMutation = useMutation({
    mutationFn: () => saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } }),
    onSuccess: () => {
      setHoldState("saved");
      toast.success("Progress saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const draftMutation = useMutation({
    mutationFn: async () => {
      const errors = groupCreateDraftErrorsForSave(draft);
      if (errors.length) throw new Error(errors[0]);
      const saved = await persist({ data: { restaurantId, draft } });
      const next = { ...draft, groupId: saved.id, code: saved.code ?? draft.code, members: saved.members };
      setDraft(next);
      await saveDraftHold({ data: { restaurantId, payload: { step, draft: next } as never } });
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success(`${GUEST_GROUP_CREATE_DRAFT_SAVED} Code ${result.code ?? "assigned"}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const errors = groupCreateDraftErrors(draft, catalogueIds);
      if (errors.length) throw new Error(errors[0]);
      const saved = await persist({ data: { restaurantId, draft } });
      clearGuestGroupCreateHold(restaurantId);
      await clearDraft({ data: { restaurantId } }).catch(() => undefined);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success("Group created.");
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: result.id },
        search: guestProfileSearch({ type: "group", nav: "overview" }),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function leave() {
    writeGuestGroupCreateHold(restaurantId, { step, draft });
    if (guestGroupCreateHasChanges(draft)) toast.success(GUEST_GROUP_CREATE_PROGRESS_KEPT);
    void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "group" }) });
  }

  function resetForm() {
    const next = emptyGuestGroupCreateDraft();
    if (context.data?.defaultCurrency) next.currency = context.data.defaultCurrency;
    setDraft(next);
    setStep("details");
    setHoldState("idle");
    setImportCsv("");
    setMemberDraft(emptyGroupCreateMember());
    clearGuestGroupCreateHold(restaurantId);
  }

  const startOverMutation = useMutation({
    mutationFn: () => clearDraft({ data: { restaurantId } }),
    onSettled: () => {
      resetForm();
      setStartOverOpen(false);
      queryClient.setQueryData(["group-create-context", restaurantId], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, draft: null };
      });
      toast.success("Form cleared. You can start a new group.");
    },
  });

  function addExistingMember(guest: { id: string; name: string; email: string | null; phone: string | null }) {
    if (draft.members.some((row) => row.guestId === guest.id)) {
      toast.error("That guest is already a member of this group.");
      return;
    }
    set("members", [
      ...draft.members,
      {
        ...emptyGroupCreateMember(),
        guestId: guest.id,
        guestName: guest.name,
        email: guest.email ?? "",
        phone: guest.phone ?? "",
      },
    ]);
    setGuestQuery("");
  }

  function addNewMember() {
    if (!filled(memberDraft.firstName)) {
      toast.error("First name is required for a new guest.");
      return;
    }
    set("members", [
      ...draft.members,
      {
        ...memberDraft,
        guestName: [memberDraft.firstName, memberDraft.lastName].filter((value) => filled(value)).join(" ").trim(),
      },
    ]);
    setMemberDraft(emptyGroupCreateMember());
  }

  function stageImport() {
    if (/\.xlsx?$/i.test(draft.importFilename)) {
      toast.error("Upload a CSV file. Excel import is not available yet.");
      return;
    }
    const result = stageGroupMemberImport(importCsv, draft.members);
    set("members", result.members);
    set("importStagedCount", draft.importStagedCount + result.staged);
    if (result.errors.length) toast.error(result.errors[0]);
    else if (result.staged === 0) toast.error("No members were staged. Check the CSV structure.");
    else toast.success(`${result.staged} member${result.staged === 1 ? "" : "s"} staged. They are saved when the group is created.`);
  }

  if (context.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading group creation…</p>;
  }
  if (context.error) {
    return (
      <div className="p-6">
        <p className="font-display text-lg">Could not load group creation settings.</p>
        <p className="mt-2 text-sm text-muted-foreground">{(context.error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="group-create-workspace">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          <Link to={GUEST_PROFILE_DIRECTORY_PATH} search={guestProfileSearch({ type: "group" })} className="hover:underline">
            Guest Profile
          </Link>
          {" > "}
          Register New Group
        </p>
        <div className="mt-2">
          <h1 className="font-display text-2xl">{GUEST_GROUP_CREATE_TITLE}</h1>
          <p className="text-sm text-muted-foreground">{GUEST_GROUP_CREATE_COPY}</p>
          <div className="mt-3 max-w-sm">
            <p className="text-xs text-muted-foreground">{GROUP_TEMPLATE_COPY}</p>
            <Select
              value={templateId}
              onValueChange={(value) => {
                const template = (templates.data ?? []).find((row) => row.id === value);
                setTemplateId(value);
                if (template) {
                  setDraft((current) => ({ ...applyGroupTemplateToDraft(template.payload), name: current.name, currency: current.currency }));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Start from template (optional)" />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? [])
                  .filter((row) => row.active)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GUEST_GROUP_CREATE_STEPS.map((item, index) => {
            const current = item.id === step;
            const done = index < stepIndex;
            const reachable = index <= stepIndex;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => (reachable ? go(item.id) : undefined)}
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
              companies={companiesQuery.data ?? []}
              agencies={agenciesQuery.data ?? []}
              contacts={contactsQuery.data ?? []}
              companyQuery={companyQuery}
              agencyQuery={agencyQuery}
              contactQuery={contactQuery}
              onCompanyQuery={setCompanyQuery}
              onAgencyQuery={setAgencyQuery}
              onContactQuery={setContactQuery}
            />
          ) : null}
          {step === "stay" ? (
            <StayStep
              draft={draft}
              set={set}
              nights={nights}
              catalogues={catalogues}
              destinationInput={destinationInput}
              onDestinationInput={setDestinationInput}
            />
          ) : null}
          {step === "guests" ? (
            <GuestsStep
              draft={draft}
              set={set}
              counts={counts}
              catalogues={catalogues}
              guests={guestsQuery.data ?? []}
              guestQuery={guestQuery}
              onGuestQuery={setGuestQuery}
              memberDraft={memberDraft}
              onMemberDraft={setMemberDraft}
              importCsv={importCsv}
              onImportCsv={setImportCsv}
              onAddExisting={addExistingMember}
              onAddNew={addNewMember}
              onImport={stageImport}
            />
          ) : null}
          {step === "billing" ? (
            <BillingStep draft={draft} set={set} catalogues={catalogues} credit={creditQuery.data ?? null} estimate={estimate} />
          ) : null}
          {step === "review" ? (
            <ReviewStep
              draft={draft}
              catalogues={catalogues}
              counts={counts}
              nights={nights}
              estimate={estimate}
              onEdit={go}
            />
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Group Summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <SummaryRow label="Group Name" value={draft.name || "—"} />
              <SummaryRow label="Status" value={GROUP_STATUS_LABELS.pending} />
              <SummaryRow
                label="Travel Dates"
                value={draft.arrivalDate && draft.departureDate ? `${draft.arrivalDate} → ${draft.departureDate}` : "—"}
              />
              <SummaryRow label="Expected Guests" value={draft.expectedPax || "—"} />
              <SummaryRow label="Expected Rooms" value={draft.expectedRooms || "—"} />
              <SummaryRow label="Company / Agency" value={draft.companyMasterName || draft.travelAgentMasterName || "—"} />
              <SummaryRow label="Group Type" value={optionLabel(catalogues?.groupTypes ?? [], draft.groupTypeId) || "—"} />
              <SummaryRow label="Market Segment" value={optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"} />
              <SummaryRow label="Code" value={draft.code || "Assigned on save"} />
            </dl>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Estimated Financial Summary</h3>
            <p className="mt-2 text-sm text-muted-foreground">{GROUP_CREATE_PRICING_UNAVAILABLE}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <SummaryRow label="Room Charges" value="—" />
              <SummaryRow label="Package / Other" value="—" />
              <SummaryRow label="Taxes" value="—" />
              <SummaryRow label="Estimated Total" value="—" />
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
          <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={() => go(GUEST_GROUP_CREATE_STEPS[stepIndex - 1].id)}>
            ← Previous
          </Button>
          <Button type="button" variant="ghost" onClick={leave}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="group-create-start-over"
            onClick={() => setStartOverOpen(true)}
            disabled={!guestGroupCreateHasChanges(draft)}
          >
            {GUEST_GROUP_CREATE_START_OVER}
          </Button>
          {holdState === "saving" ? <span className="text-xs text-muted-foreground">Saving progress…</span> : null}
          {holdState === "saved" && guestGroupCreateHasChanges(draft) ? (
            <span className="text-xs text-muted-foreground">Progress saved</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="group-create-save-draft"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending || holdMutation.isPending}
          >
            Save as Draft
          </Button>
          {step === "review" ? (
            <Button
              type="button"
              data-testid="group-create-complete"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              Complete Registration
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                if (validateCurrent()) go(GUEST_GROUP_CREATE_STEPS[stepIndex + 1].id);
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
            <p className="font-display text-lg">{GUEST_GROUP_CREATE_START_OVER}?</p>
            <p className="mt-2 text-sm text-muted-foreground">{GUEST_GROUP_CREATE_START_OVER_COPY}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartOverOpen(false)}>
                Keep Progress
              </Button>
              <Button variant="destructive" disabled={startOverMutation.isPending} onClick={() => startOverMutation.mutate()}>
                {GUEST_GROUP_CREATE_START_OVER}
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
  companies,
  agencies,
  contacts,
  companyQuery,
  agencyQuery,
  contactQuery,
  onCompanyQuery,
  onAgencyQuery,
  onContactQuery,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  catalogues?: GroupCreateContext["catalogues"];
  companies: Array<{ id: string; name: string; code: string | null }>;
  agencies: Array<{ id: string; name: string; code: string | null }>;
  contacts: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  companyQuery: string;
  agencyQuery: string;
  contactQuery: string;
  onCompanyQuery: (value: string) => void;
  onAgencyQuery: (value: string) => void;
  onContactQuery: (value: string) => void;
}) {
  const types = (catalogues?.groupTypes ?? []).filter((row) => row.active !== false || row.id === draft.groupTypeId);
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Group Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Group Name" required>
          <Input data-testid="group-create-name" value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Europe Heritage Tour" />
        </Field>
        <Field label="Group Code">
          <Input
            value={draft.code}
            onChange={(event) => {
              set("code", event.target.value);
              set("codeManual", Boolean(event.target.value.trim()));
            }}
            placeholder="Assigned on save"
          />
        </Field>
        <Field label="Group Type" required>
          <Select value={draft.groupTypeId} onValueChange={(value) => set("groupTypeId", value)}>
            <SelectTrigger data-testid="group-create-type">
              <SelectValue placeholder={types.length ? "Select type" : "Configure group types in settings"} />
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
        <Field label="Market Segment">
          <NoneSelect
            value={draft.marketSegmentId}
            onChange={(value) => set("marketSegmentId", value)}
            options={catalogues?.marketSegments ?? []}
            placeholder="Select market segment"
          />
        </Field>
      </div>
      <Field label="Company">
        <Input placeholder="Search existing companies" value={companyQuery} onChange={(event) => onCompanyQuery(event.target.value)} />
        <Select
          value={draft.companyMasterId || "none"}
          onValueChange={(value) => {
            if (value === "none") {
              set("companyMasterId", "");
              set("companyMasterName", "");
              return;
            }
            const selected = companies.find((row) => row.id === value);
            set("companyMasterId", value);
            set("companyMasterName", selected?.name ?? draft.companyMasterName);
          }}
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Search existing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {companies.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Travel Agency / Tour Operator">
        <Input placeholder="Search existing agencies" value={agencyQuery} onChange={(event) => onAgencyQuery(event.target.value)} />
        <Select
          value={draft.travelAgentMasterId || "none"}
          onValueChange={(value) => {
            if (value === "none") {
              set("travelAgentMasterId", "");
              set("travelAgentMasterName", "");
              return;
            }
            const selected = agencies.find((row) => row.id === value);
            set("travelAgentMasterId", value);
            set("travelAgentMasterName", selected?.name ?? draft.travelAgentMasterName);
          }}
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Search existing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {agencies.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{GROUP_TOUR_OPERATOR_COPY}</p>
      </Field>
      <Field label="Contact Person">
        <Input placeholder="Search existing guests" value={contactQuery} onChange={(event) => onContactQuery(event.target.value)} />
        <Select
          value={draft.primaryContactGuestId || "none"}
          onValueChange={(value) => {
            if (value === "none") {
              set("primaryContactGuestId", "");
              return;
            }
            const selected = contacts.find((row) => row.id === value);
            set("primaryContactGuestId", value);
            set("primaryContactName", selected?.name ?? draft.primaryContactName);
            if (selected?.email) set("contactEmail", selected.email);
            if (selected?.phone) set("contactPhone", selected.phone);
          }}
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Select contact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {contacts.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="mt-2" placeholder="Or type a contact name" value={draft.primaryContactName} onChange={(event) => set("primaryContactName", event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact Email">
          <Input value={draft.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} />
        </Field>
        <Field label="Contact Phone">
          <Input value={draft.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} />
        </Field>
      </div>
      <Field label="Group Status">
        <Input value={GROUP_STATUS_LABELS.pending} readOnly />
      </Field>
      <Field label="Notes">
        <Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
      </Field>
    </section>
  );
}

function StayStep({
  draft,
  set,
  nights,
  catalogues,
  destinationInput,
  onDestinationInput,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  nights: number | null;
  catalogues?: GroupCreateContext["catalogues"];
  destinationInput: string;
  onDestinationInput: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Travel & Stay</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arrival Date" required>
            <Input type="date" value={draft.arrivalDate} onChange={(event) => set("arrivalDate", event.target.value)} />
          </Field>
          <Field label="Departure Date" required>
            <Input type="date" value={draft.departureDate} onChange={(event) => set("departureDate", event.target.value)} />
          </Field>
          <Field label="Arrival Time">
            <Input type="time" value={draft.arrivalTime} onChange={(event) => set("arrivalTime", event.target.value)} />
          </Field>
          <Field label="Departure Time">
            <Input type="time" value={draft.departureTime} onChange={(event) => set("departureTime", event.target.value)} />
          </Field>
          <Field label="Total Nights">
            <Input value={nights == null ? "" : String(nights)} readOnly placeholder="Calculated from dates" />
          </Field>
          <Field label="Expected Pax" required>
            <Input type="number" min={1} value={draft.expectedPax} onChange={(event) => set("expectedPax", event.target.value)} />
          </Field>
          <Field label="Expected Rooms">
            <Input type="number" min={0} value={draft.expectedRooms} onChange={(event) => set("expectedRooms", event.target.value)} />
          </Field>
          <Field label="Arrival Method">
            <NoneSelect
              value={draft.arrivalMethod}
              onChange={(value) => set("arrivalMethod", value)}
              options={GROUP_TRAVEL_METHODS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select method"
            />
          </Field>
          <Field label="Arrival From">
            <Input value={draft.arrivalFrom} onChange={(event) => set("arrivalFrom", event.target.value)} />
          </Field>
          <Field label="Arrival To">
            <Input value={draft.arrivalTo} onChange={(event) => set("arrivalTo", event.target.value)} />
          </Field>
          <Field label="Departure Method">
            <NoneSelect
              value={draft.departureMethod}
              onChange={(value) => set("departureMethod", value)}
              options={GROUP_TRAVEL_METHODS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select method"
            />
          </Field>
          <Field label="Departure To">
            <Input value={draft.departureTo} onChange={(event) => set("departureTo", event.target.value)} />
          </Field>
          <Field label="Source">
            <NoneSelect value={draft.sourceCodeId} onChange={(value) => set("sourceCodeId", value)} options={catalogues?.sourceCodes ?? []} placeholder="Select source" />
          </Field>
          <Field label="Channel">
            <NoneSelect value={draft.channelId} onChange={(value) => set("channelId", value)} options={catalogues?.channels ?? []} placeholder="Select channel" />
          </Field>
        </div>
        <Field label="Destinations">
          <div className="flex gap-2">
            <Input
              value={destinationInput}
              onChange={(event) => onDestinationInput(event.target.value)}
              placeholder="Addis Ababa"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (destinationInput.trim()) {
                    set("destinations", [...draft.destinations, destinationInput.trim()]);
                    onDestinationInput("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (destinationInput.trim()) {
                  set("destinations", [...draft.destinations, destinationInput.trim()]);
                  onDestinationInput("");
                }
              }}
            >
              Add
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.destinations.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-border px-2 py-0.5 text-xs"
                onClick={() => set("destinations", draft.destinations.filter((row) => row !== item))}
              >
                {item} ×
              </button>
            ))}
          </div>
        </Field>
        <Field label="Special Requests">
          <Textarea value={draft.specialRequests} onChange={(event) => set("specialRequests", event.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={draft.stayNotes} onChange={(event) => set("stayNotes", event.target.value)} />
        </Field>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg">Room Requirements</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => set("roomNeeds", [...draft.roomNeeds, emptyGroupCreateRoomNeed()])}>
            <Plus className="mr-1 size-3" /> Add room type
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{GROUP_CREATE_NO_PHYSICAL_ROOMS}</p>
        {draft.roomNeeds.map((need, index) => (
          <div key={need.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-6">
            <Field label="Room Type">
              <NoneSelect
                value={need.roomTypeId}
                onChange={(value) =>
                  set(
                    "roomNeeds",
                    draft.roomNeeds.map((row, i) => (i === index ? { ...row, roomTypeId: value } : row)),
                  )
                }
                options={catalogues?.roomTypes ?? []}
                placeholder="Room type"
              />
            </Field>
            <Field label="Rooms">
              <Input
                type="number"
                min={0}
                value={need.rooms}
                onChange={(event) =>
                  set(
                    "roomNeeds",
                    draft.roomNeeds.map((row, i) => (i === index ? { ...row, rooms: Number(event.target.value) || 0 } : row)),
                  )
                }
              />
            </Field>
            <Field label="Pax">
              <Input
                type="number"
                min={0}
                value={need.pax}
                onChange={(event) =>
                  set(
                    "roomNeeds",
                    draft.roomNeeds.map((row, i) => (i === index ? { ...row, pax: Number(event.target.value) || 0 } : row)),
                  )
                }
              />
            </Field>
            <Field label="Meal Plan">
              <NoneSelect
                value={need.mealPlanId}
                onChange={(value) =>
                  set(
                    "roomNeeds",
                    draft.roomNeeds.map((row, i) => (i === index ? { ...row, mealPlanId: value } : row)),
                  )
                }
                options={catalogues?.mealPlans ?? []}
                placeholder="Meal plan"
              />
            </Field>
            <Field label="Rate Plan">
              <NoneSelect
                value={need.ratePlanId}
                onChange={(value) =>
                  set(
                    "roomNeeds",
                    draft.roomNeeds.map((row, i) => (i === index ? { ...row, ratePlanId: value } : row)),
                  )
                }
                options={catalogues?.ratePlans ?? []}
                placeholder="Rate plan"
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set("roomNeeds", draft.roomNeeds.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function GuestsStep({
  draft,
  set,
  counts,
  catalogues,
  guests,
  guestQuery,
  onGuestQuery,
  memberDraft,
  onMemberDraft,
  importCsv,
  onImportCsv,
  onAddExisting,
  onAddNew,
  onImport,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  counts: { expected: number; registered: number; remaining: number };
  catalogues?: GroupCreateContext["catalogues"];
  guests: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  guestQuery: string;
  onGuestQuery: (value: string) => void;
  memberDraft: ReturnType<typeof emptyGroupCreateMember>;
  onMemberDraft: (value: ReturnType<typeof emptyGroupCreateMember>) => void;
  importCsv: string;
  onImportCsv: (value: string) => void;
  onAddExisting: (guest: { id: string; name: string; email: string | null; phone: string | null }) => void;
  onAddNew: () => void;
  onImport: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Guest Information</h2>
        <p className="mt-2 text-sm">
          Expected Guests: {counts.expected} · Registered Members: {counts.registered} · Remaining: {counts.remaining}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Members are optional. The group can be created with expected pax only.
        </p>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">Select existing Guest Profile</h3>
        <Input placeholder="Search by name, phone, email or ID" value={guestQuery} onChange={(event) => onGuestQuery(event.target.value)} />
        <ul className="space-y-2">
          {guests.map((guest) => (
            <li key={guest.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{guest.name}</span>
                <span className="ml-2 text-muted-foreground">{[guest.phone, guest.email].filter(Boolean).join(" · ")}</span>
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => onAddExisting(guest)}>
                Add
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">Create new Guest Profile</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <Input value={memberDraft.firstName} onChange={(event) => onMemberDraft({ ...memberDraft, firstName: event.target.value })} />
          </Field>
          <Field label="Last name">
            <Input value={memberDraft.lastName} onChange={(event) => onMemberDraft({ ...memberDraft, lastName: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={memberDraft.email} onChange={(event) => onMemberDraft({ ...memberDraft, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={memberDraft.phone} onChange={(event) => onMemberDraft({ ...memberDraft, phone: event.target.value })} />
          </Field>
          <Field label="Room type preference">
            <NoneSelect
              value={memberDraft.roomTypeId}
              onChange={(value) => onMemberDraft({ ...memberDraft, roomTypeId: value })}
              options={catalogues?.roomTypes ?? []}
              placeholder="Optional"
            />
          </Field>
          <Field label="Bed preference">
            <Input value={memberDraft.bedPreference} onChange={(event) => onMemberDraft({ ...memberDraft, bedPreference: event.target.value })} />
          </Field>
        </div>
        <Field label="Special requests">
          <Textarea value={memberDraft.specialRequests} onChange={(event) => onMemberDraft({ ...memberDraft, specialRequests: event.target.value })} />
        </Field>
        <Button type="button" variant="outline" onClick={onAddNew}>
          Stage new member
        </Button>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">Import Members</h3>
        <p className="text-xs text-muted-foreground">{GROUP_CREATE_IMPORT_STRUCTURE}</p>
        <Field label="Filename">
          <Input value={draft.importFilename} onChange={(event) => set("importFilename", event.target.value)} placeholder="members.csv" />
        </Field>
        <Textarea value={importCsv} onChange={(event) => onImportCsv(event.target.value)} rows={5} placeholder="first_name,last_name,email,phone,special_requests" />
        <Button type="button" variant="outline" data-testid="group-create-import" onClick={onImport}>
          Stage import
        </Button>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">Staged members</h3>
        {draft.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members staged yet.</p>
        ) : (
          <ul className="space-y-2">
            {draft.members.map((member) => (
              <li key={member.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{member.guestName || member.firstName}</span>
                  <span className="ml-2 text-muted-foreground">{member.guestId ? "Existing profile" : "New profile"} · {member.status}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => set("members", draft.members.filter((row) => row.key !== member.key))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BillingStep({
  draft,
  set,
  catalogues,
  credit,
  estimate,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  catalogues?: GroupCreateContext["catalogues"];
  credit: {
    paymentTerms: string | null;
    creditLimitNote: string | null;
    creditLimitAmount: number | null;
    creditAccountEnabled: boolean | null;
  } | null;
  estimate: ReturnType<typeof estimateGroupCreationCharges>;
}) {
  const depositAmount = Number(draft.depositAmount);
  const exceeded =
    credit?.creditLimitAmount != null &&
    draft.depositRequired &&
    !Number.isNaN(depositAmount) &&
    depositAmount > credit.creditLimitAmount;
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Financial & Billing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rate Plan">
            <NoneSelect value={draft.ratePlanId} onChange={(value) => set("ratePlanId", value)} options={catalogues?.ratePlans ?? []} placeholder="Select rate plan" />
          </Field>
          <Field label="Package">
            <NoneSelect value={draft.packageId} onChange={(value) => set("packageId", value)} options={catalogues?.packages ?? []} placeholder="Select package" />
          </Field>
          <Field label="Meal Plan">
            <NoneSelect value={draft.mealPlanId} onChange={(value) => set("mealPlanId", value)} options={catalogues?.mealPlans ?? []} placeholder="Select meal plan" />
          </Field>
          <Field label="Currency">
            <Select value={draft.currency || "none"} onValueChange={(value) => set("currency", value === "none" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Property currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(catalogues?.currencies ?? []).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Payment Method">
            <NoneSelect value={draft.paymentMethodId} onChange={(value) => set("paymentMethodId", value)} options={catalogues?.paymentMethods ?? []} placeholder="Select payment method" />
          </Field>
          <Field label="Billing Arrangement" required>
            <Select value={draft.billingArrangement} onValueChange={(value) => set("billingArrangement", value)}>
              <SelectTrigger data-testid="group-create-billing">
                <SelectValue placeholder="Select arrangement" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BILLING_ARRANGEMENTS.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
          <Label>Deposit Required</Label>
          <Switch checked={draft.depositRequired} onCheckedChange={(checked) => set("depositRequired", Boolean(checked))} />
        </div>
        {draft.depositRequired ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Deposit Amount">
              <Input type="number" min={0} value={draft.depositAmount} onChange={(event) => set("depositAmount", event.target.value)} />
            </Field>
            <Field label="Deposit Percentage">
              <Input type="number" min={0} max={100} value={draft.depositPercent} onChange={(event) => set("depositPercent", event.target.value)} />
            </Field>
            <Field label="Deposit Due Date">
              <Input type="date" value={draft.depositDueDate} onChange={(event) => set("depositDueDate", event.target.value)} />
            </Field>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Balance Due">
            <Input type="date" value={draft.balanceDueDate} onChange={(event) => set("balanceDueDate", event.target.value)} />
          </Field>
          <Field label="Payment Terms">
            <Input value={draft.paymentTerms} onChange={(event) => set("paymentTerms", event.target.value)} />
          </Field>
        </div>
        {credit ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-sm">
            <p className="font-medium">Company / Agency account</p>
            <p className="mt-1 text-muted-foreground">
              {credit.creditAccountEnabled ? "Credit account is enabled." : "Credit account flag is not enabled."}
              {credit.creditLimitNote ? ` ${credit.creditLimitNote}` : ""}
              {credit.creditLimitAmount != null ? ` Limit: ${credit.creditLimitAmount}.` : " No numeric credit-limit engine is applied here."}
              {credit.paymentTerms && !draft.paymentTerms ? ` Stored terms: ${credit.paymentTerms}.` : ""}
            </p>
            {exceeded ? <p className="mt-2 text-amber-700">Deposit is above the stored credit limit. This uses the company/account figure — it does not create a new credit rule.</p> : null}
          </div>
        ) : null}
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-medium">Estimated Summary</h3>
        <p className="mt-2 text-sm text-muted-foreground">{estimate.copy}</p>
      </section>
    </div>
  );
}

function ReviewStep({
  draft,
  catalogues,
  counts,
  nights,
  estimate,
  onEdit,
}: {
  draft: GuestGroupCreateDraft;
  catalogues?: GroupCreateContext["catalogues"];
  counts: { expected: number; registered: number; remaining: number };
  nights: number | null;
  estimate: ReturnType<typeof estimateGroupCreationCharges>;
  onEdit: (step: GuestGroupCreateStepId) => void;
}) {
  const remaining = guestGroupCreateCompletion(draft).items.filter((item) => item.requiredRemaining);
  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-medium">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {remaining.map((item) => (
              <li key={item.id}>
                {item.label}{" "}
                <button type="button" className="underline" onClick={() => onEdit(item.step)}>
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ReviewCard title="Group Information" onEdit={() => onEdit("details")}>
        <p>Group Name: {draft.name || "—"}</p>
        <p>Group Code: {draft.code || "Assigned on save"}</p>
        <p>Group Type: {optionLabel(catalogues?.groupTypes ?? [], draft.groupTypeId) || "—"}</p>
        <p>Market Segment: {optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</p>
        <p>Company / Agency: {draft.companyMasterName || draft.travelAgentMasterName || "—"}</p>
        <p>Contact: {draft.primaryContactName || "—"} · {draft.contactEmail || "—"} · {draft.contactPhone || "—"}</p>
        <p>Status: {GROUP_STATUS_LABELS.pending}</p>
        <p>Notes: {draft.notes || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Travel & Stay" onEdit={() => onEdit("stay")}>
        <p>Arrival: {draft.arrivalDate || "—"} {draft.arrivalTime}</p>
        <p>Departure: {draft.departureDate || "—"} {draft.departureTime}</p>
        <p>Nights: {nights ?? "—"}</p>
        <p>Expected Guests: {draft.expectedPax || "—"}</p>
        <p>Expected Rooms: {draft.expectedRooms || "—"}</p>
        <p>Arrival: {travelMethodLabel(draft.arrivalMethod) || "—"} {draft.arrivalFrom} {draft.arrivalTo}</p>
        <p>Departure: {travelMethodLabel(draft.departureMethod) || "—"} {draft.departureTo}</p>
        <p>Source: {optionLabel(catalogues?.sourceCodes ?? [], draft.sourceCodeId) || "—"}</p>
        <p>Channel: {optionLabel(catalogues?.channels ?? [], draft.channelId) || "—"}</p>
        <p>Destinations: {draft.destinations.join(", ") || "—"}</p>
        <p>Special Requests: {draft.specialRequests || "—"}</p>
      </ReviewCard>
      <ReviewCard title="Guest Information" onEdit={() => onEdit("guests")}>
        <p>Expected Guests: {counts.expected}</p>
        <p>Registered Members: {counts.registered}</p>
        <p>Remaining Members: {counts.remaining}</p>
        <p>Import staged: {draft.importStagedCount || 0}</p>
        <p>
          Members:{" "}
          {draft.members.length
            ? draft.members.map((row) => row.guestName || row.firstName).join(", ")
            : "None"}
        </p>
      </ReviewCard>
      <ReviewCard title="Financial & Billing" onEdit={() => onEdit("billing")}>
        <p>Rate Plan: {optionLabel(catalogues?.ratePlans ?? [], draft.ratePlanId) || "—"}</p>
        <p>Package: {optionLabel(catalogues?.packages ?? [], draft.packageId) || "—"}</p>
        <p>Meal Plan: {optionLabel(catalogues?.mealPlans ?? [], draft.mealPlanId) || "—"}</p>
        <p>Billing Arrangement: {billingArrangementLabel(draft.billingArrangement) || "—"}</p>
        <p>Payment Method: {optionLabel(catalogues?.paymentMethods ?? [], draft.paymentMethodId) || "—"}</p>
        <p>Deposit: {draft.depositRequired ? [draft.depositAmount, draft.depositPercent && `${draft.depositPercent}%`, draft.depositDueDate].filter(Boolean).join(" · ") : "Not required"}</p>
        <p>Currency: {draft.currency || "—"}</p>
        <p>Estimated Charges: {estimate.available ? String(estimate.total) : "Unavailable"}</p>
        <p>Estimated Total: {estimate.available ? String(estimate.total) : "—"}</p>
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
