import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, ChevronRight } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  GUEST_CREATE_COPY,
  GUEST_CREATE_DRAFT_SAVED,
  GUEST_CREATE_HOLD_DEBOUNCE_MS,
  GUEST_CREATE_LOYALTY_UNAVAILABLE,
  GUEST_CREATE_NO_DOC_TYPES,
  GUEST_CREATE_NO_PREFERENCES,
  GUEST_CREATE_PROGRESS_KEPT,
  GUEST_CREATE_START_OVER,
  GUEST_CREATE_START_OVER_COPY,
  GUEST_CREATE_STEPS,
  GUEST_CREATE_TITLE,
  applyCreateDefaults,
  clearGuestCreateHold,
  createFieldRules,
  emptyGuestCreateDraft,
  guestCreateCompletion,
  guestCreateHasChanges,
  guestCreateStepErrors,
  guestDisplayName,
  readGuestCreateHold,
  writeGuestCreateHold,
  type GuestCreateDocumentDraft,
  type GuestCreateDraft,
  type GuestCreateStepId,
} from "@/packages/pms/lib/guest-create-workspace";
import {
  deleteGuestCreateDraft,
  getGuestCreateContext,
  saveGuestCreateDraft,
} from "@/packages/pms/lib/guest-create.functions";
import {
  createGuest,
  createGuestDocumentUpload,
  createGuestPhotoUpload,
  findGuestDuplicates,
  saveGuestConsent,
  saveGuestDocument,
  saveGuestDocumentImage,
  saveGuestPhoto,
  saveGuestPreferenceWorkspace,
  type GuestSummary,
} from "@/packages/pms/lib/guests.functions";
import { addGuestNote } from "@/packages/pms/lib/guests.functions";
import { linkGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { kindFromTypeCode } from "@/packages/pms/lib/guest-identity-documents";
import {
  GUEST_GENDER_LABELS,
  GUEST_GENDERS,
  GUEST_TITLE_LABELS,
  GUEST_TITLES,
} from "@/packages/pms/lib/guest-profile-individual";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_TIME_LABELS,
  PREFERRED_CONTACT_TIMES,
} from "@/packages/pms/lib/guest-profile-overview";
import { GUEST_CONSENT_STATES } from "@/packages/pms/lib/guest-profile-wave2";
import { GuestFormStagedLinks } from "@/packages/pms/components/guests/guest-form-staged-links";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";

export function GuestCreateWorkspace({
  restaurantId,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  onCreated?: (guestId: string) => void;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGuestCreateContext);
  const saveDraft = useServerFn(saveGuestCreateDraft);
  const clearDraft = useServerFn(deleteGuestCreateDraft);
  const create = useServerFn(createGuest);
  const checkDuplicates = useServerFn(findGuestDuplicates);
  const persistDoc = useServerFn(saveGuestDocument);
  const startDocUpload = useServerFn(createGuestDocumentUpload);
  const attachDocImage = useServerFn(saveGuestDocumentImage);
  const persistPrefs = useServerFn(saveGuestPreferenceWorkspace);
  const persistLink = useServerFn(linkGuestAccount);
  const persistNote = useServerFn(addGuestNote);
  const persistConsent = useServerFn(saveGuestConsent);
  const startPhoto = useServerFn(createGuestPhotoUpload);
  const persistPhoto = useServerFn(saveGuestPhoto);

  const localHold = useMemo(() => readGuestCreateHold(restaurantId), [restaurantId]);
  const [step, setStep] = useState<GuestCreateStepId>(() => localHold?.step ?? "basic");
  const [draft, setDraft] = useState<GuestCreateDraft>(() => localHold?.draft ?? emptyGuestCreateDraft());
  const [touched] = useState(() => new Set<string>());
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [docFiles, setDocFiles] = useState<Record<string, File | undefined>>({});
  const [duplicates, setDuplicates] = useState<GuestSummary[] | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; profileNumber: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");

  const context = useQuery({
    queryKey: ["guest-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!context.data || defaultsApplied) return;
    const local = readGuestCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else {
      setDraft(applyCreateDefaults(emptyGuestCreateDraft(context.data.profileType?.defaults), context.data.profileType?.defaults, touched));
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, restaurantId, touched]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    writeGuestCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, restaurantId, step, draft]);

  useEffect(() => {
    if (!defaultsApplied || created) return;
    if (!guestCreateHasChanges(draft, context.data?.profileType?.defaults)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraft({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [context.data?.profileType?.defaults, created, defaultsApplied, draft, restaurantId, saveDraft, step]);

  const rules = useMemo(
    () => createFieldRules(context.data?.fields ?? [], context.data?.profileType ?? null),
    [context.data?.fields, context.data?.profileType],
  );
  const completion = guestCreateCompletion(draft, rules);
  const requiredPrefs = (context.data?.preferenceTypes ?? []).filter((row) => row.active && row.required).map((row) => row.id);
  const visible = (code: string) => rules.find((rule) => rule.code === code)?.visible !== false;
  const required = (code: string) => Boolean(rules.find((rule) => rule.code === code)?.required);
  const stepIndex = GUEST_CREATE_STEPS.findIndex((item) => item.id === step);

  function set<K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) {
    touched.add(String(key));
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestCreateStepId) {
    setStep(next);
  }

  function validateCurrent(): boolean {
    const errors = guestCreateStepErrors(step, draft, {
      rules,
      set3: context.data?.set3 ?? null,
      requiredPreferenceTypeIds: requiredPrefs,
      dataProcessingRequired: Boolean(context.data?.dataProcessingRequired),
    });
    if (errors.length) {
      toast.error(errors[0]);
      return false;
    }
    return true;
  }

  const draftMutation = useMutation({
    mutationFn: () => saveDraft({ data: { restaurantId, payload: { step, draft } as never } }),
    onSuccess: () => {
      writeGuestCreateHold(restaurantId, { step, draft });
      setHoldState("saved");
      toast.success(GUEST_CREATE_DRAFT_SAVED);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: () =>
      checkDuplicates({
        data: {
          restaurantId,
          email: draft.email || null,
          phone: draft.phone || null,
          firstName: draft.firstName || null,
          lastName: draft.lastName || null,
          dateOfBirth: draft.dateOfBirth || null,
          documentNumber: draft.documents[0]?.documentNumber || null,
        },
      }),
    onSuccess: (matches) => {
      setDuplicates(matches);
      if (matches.length === 0) toast.success("No matching profiles found.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const errors = guestCreateStepErrors("review", draft, {
        rules,
        set3: context.data?.set3 ?? null,
        requiredPreferenceTypeIds: requiredPrefs,
        dataProcessingRequired: Boolean(context.data?.dataProcessingRequired),
      });
      if (errors.length) throw new Error(errors[0]);
      const matches = draft.acknowledgeDuplicates
        ? []
        : await checkDuplicates({
            data: {
              restaurantId,
              email: draft.email || null,
              phone: draft.phone || null,
              firstName: draft.firstName || null,
              lastName: draft.lastName || null,
              dateOfBirth: draft.dateOfBirth || null,
              documentNumber: draft.documents[0]?.documentNumber || null,
            },
          });
      if (matches.length > 0) {
        setDuplicates(matches);
        throw new Error("Review possible matching profiles before creating this guest.");
      }
      const firstDoc = draft.documents[0];
      const createdGuest = await create({
        data: {
          restaurantId,
          guest: {
            firstName: draft.firstName,
            lastName: draft.lastName || null,
            phone: draft.phone || null,
            email: draft.email || null,
            nationality: draft.nationality || null,
            language: draft.language || null,
            dateOfBirth: draft.dateOfBirth || null,
            addressLine1: draft.addressLine1 || null,
            addressLine2: draft.addressLine2 || null,
            city: draft.city || null,
            region: draft.region || null,
            country: draft.country || null,
            postalCode: draft.postalCode || null,
            title: draft.title || null,
            middleName: draft.middleName || null,
            preferredName: draft.preferredName || null,
            gender: draft.gender || null,
            phoneAlt: draft.phoneAlt || null,
            emailAlt: draft.emailAlt || null,
            preferredContactMethod: draft.preferredContactMethod || null,
            preferredContactTime: draft.preferredContactTime || null,
            position: draft.position || null,
            department: draft.department || null,
            sourceOfBusiness: draft.sourceOfBusiness || null,
            notes: draft.notes || null,
            vipStatus: draft.vipStatus,
            guestStatus: draft.guestStatus,
            restricted: draft.restricted,
            blacklisted: draft.blacklisted,
            restrictionSeverity: draft.restrictionSeverity || null,
            restrictionReason: draft.restrictionReason || null,
            restrictionUntil: draft.restrictionUntil || null,
            emergencyContacts: draft.emergencyContacts,
            idDocumentNumber: firstDoc?.documentNumber || null,
            idDocumentExpiry: firstDoc?.expiryDate || null,
          },
        },
      });
      for (const document of draft.documents) {
        const saved = await persistDoc({
          data: {
            restaurantId,
            guestId: createdGuest.id,
            idTypeId: document.idTypeId,
            documentNumber: document.documentNumber || null,
            issuingCountry: document.issuingCountry || null,
            issueDate: document.issueDate || null,
            expiryDate: document.expiryDate || null,
            issuingAuthority: document.issuingAuthority || null,
            notes: document.notes || null,
          },
        });
        if (!saved.ok) throw new Error(saved.message);
        for (const side of ["front", "back"] as const) {
          const file = docFiles[`${document.key}-${side}`];
          if (!file) continue;
          const ticket = await startDocUpload({
            data: {
              restaurantId,
              guestId: createdGuest.id,
              contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
              size: file.size,
            },
          });
          if (!ticket.ok) throw new Error(ticket.message);
          const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(ticket.path, ticket.token, file);
          if (uploaded.error) throw uploaded.error;
          const attached = await attachDocImage({
            data: {
              restaurantId,
              guestId: createdGuest.id,
              documentId: saved.documentId,
              side,
              storagePath: ticket.path,
              mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
              size: file.size,
            },
          });
          if (!attached.ok) throw new Error(attached.message);
        }
      }
      if ((context.data?.preferenceTypes ?? []).length > 0) {
        await persistPrefs({
          data: {
            restaurantId,
            guestId: createdGuest.id,
            applyToFutureReservations: false,
            answers: draft.preferenceAnswers,
            contactDefaults: {
              language: draft.language,
              preferredContactMethod: draft.preferredContactMethod,
              preferredContactTime: draft.preferredContactTime,
            },
          },
        });
      }
      for (const link of draft.links) {
        await persistLink({
          data: { restaurantId, guestId: createdGuest.id, accountId: link.masterId, role: link.role },
        });
      }
      if (draft.stagedNote.trim()) {
        await persistNote({ data: { restaurantId, guestId: createdGuest.id, note: draft.stagedNote.trim() } });
      }
      await persistConsent({
        data: {
          restaurantId,
          guestId: createdGuest.id,
          dataProcessing: draft.dataProcessingConsent,
          marketing: draft.marketingConsent,
        },
      });
      if (photoFile) {
        const started = await startPhoto({
          data: {
            restaurantId,
            guestId: createdGuest.id,
            contentType: photoFile.type as "image/jpeg" | "image/png" | "image/webp",
            size: photoFile.size,
          },
        });
        if (!started.ok) throw new Error(started.message);
        const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(started.path, started.token, photoFile);
        if (uploaded.error) throw uploaded.error;
        await persistPhoto({ data: { restaurantId, guestId: createdGuest.id, path: started.path } });
      }
      clearGuestCreateHold(restaurantId);
      await clearDraft({ data: { restaurantId } }).catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ["guest-create-context", restaurantId] });
      return createdGuest;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      setCreated({ id: result.id, name: guestDisplayName(draft), profileNumber: null });
      toast.success("Guest created.");
      onCreated?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function leave() {
    if (!created) writeGuestCreateHold(restaurantId, { step, draft });
    if (!created && guestCreateHasChanges(draft, context.data?.profileType?.defaults)) {
      toast.success(GUEST_CREATE_PROGRESS_KEPT);
    }
    if (onCancel) {
      onCancel();
      return;
    }
    void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "individual" }) });
  }

  function resetForm() {
    const next = applyCreateDefaults(
      emptyGuestCreateDraft(context.data?.profileType?.defaults),
      context.data?.profileType?.defaults,
      new Set(),
    );
    setDraft(next);
    setStep("basic");
    setPhotoFile(null);
    setPhotoPreview(null);
    setDocFiles({});
    setDuplicates(null);
    setHoldState("idle");
    clearGuestCreateHold(restaurantId);
  }

  const startOverMutation = useMutation({
    mutationFn: () => clearDraft({ data: { restaurantId } }),
    onSettled: () => {
      resetForm();
      setStartOverOpen(false);
      queryClient.setQueryData(["guest-create-context", restaurantId], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, draft: null };
      });
      void queryClient.invalidateQueries({ queryKey: ["guest-create-context", restaurantId] });
      toast.success("Form cleared. You can start a new guest.");
    },
  });

  if (context.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading guest creation…</p>;
  }
  if (context.error) {
    return (
      <div className="p-6">
        <p className="font-display text-lg">Could not load guest creation settings.</p>
        <p className="mt-2 text-sm text-muted-foreground">{(context.error as Error).message}</p>
      </div>
    );
  }

  if (created && !onCreated) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6" data-testid="guest-create-success">
        <h1 className="font-display text-2xl">Guest created</h1>
        <p className="text-sm text-muted-foreground">
          {created.name}
          {created.profileNumber ? ` · ${created.profileNumber}` : ""}
        </p>
        <p className="text-sm">Individual Guest</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void navigate({ to: GUEST_PROFILE_DETAIL_PATH, params: { guestId: created.id }, search: guestProfileSearch({ type: "individual" }) })}>
            View Guest Profile
          </Button>
          <Button variant="outline" onClick={() => void navigate({ to: "/restaurant/bookings/new" })}>
            Create Reservation
          </Button>
          <Button variant="outline" onClick={() => { resetForm(); setCreated(null); }}>
            Add Another Guest
          </Button>
          <Button variant="ghost" onClick={leave}>Return to Guest List</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="guest-create-workspace">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <p className="text-xs text-muted-foreground">
          <Link to={GUEST_PROFILE_DIRECTORY_PATH} search={guestProfileSearch({ type: "individual" })} className="hover:underline">
            Guest Profile
          </Link>
          {" > "}
          Create New Guest
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">{GUEST_CREATE_TITLE}</h1>
            <p className="text-sm text-muted-foreground">{GUEST_CREATE_COPY}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
            Check for Duplicates
          </Button>
        </div>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GUEST_CREATE_STEPS.map((item, index) => {
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
          {duplicates && duplicates.length > 0 ? (
            <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Possible Matching Profiles</p>
              <ul className="mt-3 space-y-2 text-sm">
                {duplicates.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <span>
                      <span className="font-medium">{row.fullName}</span>
                      <span className="ml-2 text-muted-foreground">{[row.profileNumber, row.phone, row.email].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => void navigate({ to: GUEST_PROFILE_DETAIL_PATH, params: { guestId: row.id }, search: guestProfileSearch({ type: "individual" }) })}>
                      View Profile
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDuplicates(null)}>Not a Duplicate</Button>
                <Button size="sm" onClick={() => { setDraft((current) => ({ ...current, acknowledgeDuplicates: true })); setDuplicates(null); }}>
                  Keep Separate
                </Button>
              </div>
            </section>
          ) : null}

          {step === "basic" ? (
            <BasicStep draft={draft} set={set} visible={visible} required={required} photoPreview={photoPreview} onPhoto={(file) => {
              setPhotoFile(file);
              setPhotoPreview(file ? URL.createObjectURL(file) : null);
            }} />
          ) : null}
          {step === "identity" ? (
            <IdentityStep
              draft={draft}
              setDraft={setDraft}
              types={(context.data?.documentTypes ?? []).filter((row) => row.active)}
              profileTypeId={context.data?.profileType?.id ?? null}
              docFiles={docFiles}
              setDocFiles={setDocFiles}
            />
          ) : null}
          {step === "preferences" ? (
            <PreferencesStep
              draft={draft}
              setDraft={setDraft}
              categories={context.data?.preferenceCategories ?? []}
              types={context.data?.preferenceTypes ?? []}
            />
          ) : null}
          {step === "business" ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-lg">Business / Company Relationship</h2>
              <GuestFormStagedLinks
                restaurantId={restaurantId}
                links={draft.links}
                onChange={(links) => set("links", links)}
              />
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                {GUEST_CREATE_LOYALTY_UNAVAILABLE}
              </div>
            </div>
          ) : null}
          {step === "additional" ? (
            <AdditionalStep draft={draft} set={set} dataProcessingRequired={Boolean(context.data?.dataProcessingRequired)} />
          ) : null}
          {step === "review" ? (
            <ReviewStep draft={draft} rules={rules} completion={completion} onEdit={go} />
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Profile Preview</h3>
            <div className="mt-3 flex items-center gap-3">
              {photoPreview ? <img src={photoPreview} alt="" className="h-14 w-14 rounded-full object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><Camera className="size-5 text-muted-foreground" /></div>}
              <div>
                <p className="font-medium">{guestDisplayName(draft) || "Guest name"}</p>
                <p className="text-xs text-muted-foreground">{context.data?.profileType?.name ?? "Individual Guest"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm">{draft.phone || "No phone"}</p>
            <p className="text-sm">{draft.email || "No email"}</p>
            <p className="text-sm text-muted-foreground">{[draft.city, draft.country].filter(Boolean).join(", ") || "No location"}</p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Quick Actions</h3>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" onClick={() => go("identity")}>Upload ID</Button>
              <Button type="button" variant="outline" onClick={() => go("business")}>Add to Company</Button>
              <Button type="button" variant="outline" disabled title={GUEST_CREATE_LOYALTY_UNAVAILABLE}>Add to Loyalty</Button>
              <Button type="button" variant="outline" onClick={() => go("additional")}>Add Note</Button>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base">Data Completion</h3>
            <p className="mt-1 text-2xl font-semibold">{completion.percent}%</p>
            <ul className="mt-2 space-y-1 text-sm">
              {completion.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <button type="button" className="text-left hover:underline" onClick={() => go(item.step)}>{item.label}</button>
                  <span>{item.requiredRemaining ? "!" : item.complete ? "✓" : "—"}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-muted-foreground">Required fields and document types come from Property Setup → Guest Profile Rules.</p>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={stepIndex === 0} onClick={() => go(GUEST_CREATE_STEPS[stepIndex - 1].id)}>Back</Button>
          <Button type="button" variant="ghost" onClick={leave}>Cancel</Button>
          <Button
            type="button"
            variant="outline"
            data-testid="guest-create-start-over"
            onClick={() => setStartOverOpen(true)}
            disabled={!guestCreateHasChanges(draft, context.data?.profileType?.defaults)}
          >
            {GUEST_CREATE_START_OVER}
          </Button>
          {holdState === "saving" ? <span className="text-xs text-muted-foreground">Saving progress…</span> : null}
          {holdState === "saved" && guestCreateHasChanges(draft, context.data?.profileType?.defaults) ? (
            <span className="text-xs text-muted-foreground">Progress saved</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending}>Save as Draft</Button>
          {step === "review" ? (
            <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="create-guest-final">
              Create Guest
            </Button>
          ) : (
            <Button type="button" onClick={() => { if (validateCurrent()) go(GUEST_CREATE_STEPS[stepIndex + 1].id); }}>
              Next <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      </footer>

      {startOverOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <p className="font-display text-lg">{GUEST_CREATE_START_OVER}?</p>
            <p className="mt-2 text-sm text-muted-foreground">{GUEST_CREATE_START_OVER_COPY}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStartOverOpen(false)}>Keep Progress</Button>
              <Button
                variant="destructive"
                data-testid="guest-create-start-over-confirm"
                disabled={startOverMutation.isPending}
                onClick={() => startOverMutation.mutate()}
              >
                {GUEST_CREATE_START_OVER}
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
      <Label>{label}{isRequired ? " *" : ""}</Label>
      {children}
    </div>
  );
}

function BasicStep({
  draft,
  set,
  visible,
  required,
  photoPreview,
  onPhoto,
}: {
  draft: GuestCreateDraft;
  set: <K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) => void;
  visible: (code: string) => boolean;
  required: (code: string) => boolean;
  photoPreview: string | null;
  onPhoto: (file: File | null) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Personal Information</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Profile Type">
            <Input value="Individual Guest" disabled />
          </Field>
          <Field label="Title">
            <Select value={draft.title || "__none"} onValueChange={(value) => set("title", value === "__none" ? "" : value as GuestCreateDraft["title"])}>
              <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {GUEST_TITLES.map((title) => <SelectItem key={title} value={title}>{GUEST_TITLE_LABELS[title]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="First Name" required>
            <Input
              value={draft.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              data-testid="guest-create-first-name"
              autoComplete="given-name"
            />
          </Field>
          <Field label="Middle Name">
            <Input value={draft.middleName} onChange={(event) => set("middleName", event.target.value)} />
          </Field>
          {visible("LAST_NAME") ? (
            <Field label="Last Name" required={required("LAST_NAME")}>
              <Input value={draft.lastName} onChange={(event) => set("lastName", event.target.value)} />
            </Field>
          ) : null}
          <Field label="Preferred Name">
            <Input value={draft.preferredName} onChange={(event) => set("preferredName", event.target.value)} />
          </Field>
          {visible("DATE_OF_BIRTH") ? (
            <Field label="Date of Birth" required={required("DATE_OF_BIRTH")}>
              <Input type="date" value={draft.dateOfBirth} onChange={(event) => set("dateOfBirth", event.target.value)} />
            </Field>
          ) : null}
          <Field label="Gender">
            <Select value={draft.gender || "__none"} onValueChange={(value) => set("gender", value === "__none" ? "" : value as GuestCreateDraft["gender"])}>
              <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {GUEST_GENDERS.map((gender) => <SelectItem key={gender} value={gender}>{GUEST_GENDER_LABELS[gender]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {visible("NATIONALITY") ? (
            <Field label="Nationality" required={required("NATIONALITY")}>
              <Input value={draft.nationality} onChange={(event) => set("nationality", event.target.value)} />
            </Field>
          ) : null}
          <Field label="Language">
            <Input value={draft.language} onChange={(event) => set("language", event.target.value)} />
          </Field>
          <Field label="Photo">
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onPhoto(event.target.files?.[0] ?? null)} />
            {photoPreview ? <img src={photoPreview} alt="" className="mt-2 h-16 w-16 rounded-xl object-cover" /> : null}
          </Field>
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Contact Information</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {visible("PHONE") ? (
            <Field label="Mobile Phone" required={required("PHONE")}>
              <Input value={draft.phone} onChange={(event) => set("phone", event.target.value)} />
            </Field>
          ) : null}
          <Field label="Alternative Phone">
            <Input value={draft.phoneAlt} onChange={(event) => set("phoneAlt", event.target.value)} />
          </Field>
          {visible("EMAIL") ? (
            <Field label="Email" required={required("EMAIL")}>
              <Input value={draft.email} onChange={(event) => set("email", event.target.value)} />
            </Field>
          ) : null}
          <Field label="Alternative Email">
            <Input value={draft.emailAlt} onChange={(event) => set("emailAlt", event.target.value)} />
          </Field>
          <Field label="Preferred Contact Method">
            <Select value={draft.preferredContactMethod || "__none"} onValueChange={(value) => set("preferredContactMethod", value === "__none" ? "" : value as GuestCreateDraft["preferredContactMethod"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {PREFERRED_CONTACT_METHODS.map((method) => <SelectItem key={method} value={method}>{PREFERRED_CONTACT_METHOD_LABELS[method]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preferred Contact Time">
            <Select value={draft.preferredContactTime || "__none"} onValueChange={(value) => set("preferredContactTime", value === "__none" ? "" : value as GuestCreateDraft["preferredContactTime"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {PREFERRED_CONTACT_TIMES.map((time) => <SelectItem key={time} value={time}>{PREFERRED_CONTACT_TIME_LABELS[time]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>
      {visible("ADDRESS") ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Address Information</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Country" required={required("ADDRESS")}>
              <Input value={draft.country} onChange={(event) => set("country", event.target.value)} />
            </Field>
            <Field label="Region / State">
              <Input value={draft.region} onChange={(event) => set("region", event.target.value)} />
            </Field>
            <Field label="City" required={required("ADDRESS")}>
              <Input value={draft.city} onChange={(event) => set("city", event.target.value)} />
            </Field>
            <Field label="Street">
              <Input value={draft.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} />
            </Field>
            <Field label="House / Building">
              <Input value={draft.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} />
            </Field>
            <Field label="Postal Code">
              <Input value={draft.postalCode} onChange={(event) => set("postalCode", event.target.value)} />
            </Field>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function IdentityStep({
  draft,
  setDraft,
  types,
  profileTypeId,
  docFiles,
  setDocFiles,
}: {
  draft: GuestCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuestCreateDraft>>;
  types: Array<{
    id: string;
    name: string;
    active: boolean;
    issuingCountryRequired: boolean;
    expiryDateRequired: boolean;
    documentNumberRequired: boolean;
    scanImageAllowed: boolean;
    validForProfileTypeIds: string[];
  }>;
  profileTypeId: string | null;
  docFiles: Record<string, File | undefined>;
  setDocFiles: React.Dispatch<React.SetStateAction<Record<string, File | undefined>>>;
}) {
  const available = types.filter((type) => type.active && (type.validForProfileTypeIds.length === 0 || !profileTypeId || type.validForProfileTypeIds.includes(profileTypeId)));
  function add() {
    if (available.length === 0) return;
    const next: GuestCreateDocumentDraft = {
      key: crypto.randomUUID(),
      idTypeId: available[0].id,
      documentNumber: "",
      issuingCountry: "",
      issueDate: "",
      expiryDate: "",
      issuingAuthority: "",
      notes: "",
      hasFront: false,
      hasBack: false,
    };
    setDraft((current) => ({ ...current, documents: [...current.documents, next] }));
  }
  if (available.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{GUEST_CREATE_NO_DOC_TYPES}</p>;
  }
  return (
    <div className="space-y-4">
      {draft.documents.map((document) => {
        const type = available.find((row) => row.id === document.idTypeId) ?? types.find((row) => row.id === document.idTypeId);
        return (
          <section key={document.key} className="rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Document Type" required>
                <Select value={document.idTypeId} onValueChange={(value) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, idTypeId: value } : row) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {available.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Document Number" required={type?.documentNumberRequired}>
                <Input value={document.documentNumber} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, documentNumber: event.target.value } : row) }))} />
              </Field>
              {type?.issuingCountryRequired !== false ? (
                <Field label="Issuing Country" required={type?.issuingCountryRequired}>
                  <Input value={document.issuingCountry} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, issuingCountry: event.target.value } : row) }))} />
                </Field>
              ) : null}
              <Field label="Issue Date">
                <Input type="date" value={document.issueDate} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, issueDate: event.target.value } : row) }))} />
              </Field>
              <Field label="Expiry Date" required={type?.expiryDateRequired}>
                <Input type="date" value={document.expiryDate} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, expiryDate: event.target.value } : row) }))} />
              </Field>
              <Field label="Issuing Authority">
                <Input value={document.issuingAuthority} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, issuingAuthority: event.target.value } : row) }))} />
              </Field>
              {type?.scanImageAllowed ? (
                <>
                  <Field label="Front Image">
                    <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
                      const file = event.target.files?.[0];
                      setDocFiles((current) => ({ ...current, [`${document.key}-front`]: file }));
                      setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, hasFront: Boolean(file) } : row) }));
                    }} />
                  </Field>
                  <Field label="Back Image">
                    <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
                      const file = event.target.files?.[0];
                      setDocFiles((current) => ({ ...current, [`${document.key}-back`]: file }));
                      setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, hasBack: Boolean(file) } : row) }));
                    }} />
                  </Field>
                </>
              ) : null}
              <Field label="Notes">
                <Textarea value={document.notes} onChange={(event) => setDraft((current) => ({ ...current, documents: current.documents.map((row) => row.key === document.key ? { ...row, notes: event.target.value } : row) }))} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Staged as {kindFromTypeCode(type?.name)} until the guest is created.</p>
          </section>
        );
      })}
      <Button type="button" variant="outline" onClick={add}>Add identity document</Button>
    </div>
  );
}

function PreferencesStep({
  draft,
  setDraft,
  categories,
  types,
}: {
  draft: GuestCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuestCreateDraft>>;
  categories: Array<{ id: string; name: string; active: boolean }>;
  types: Array<{ id: string; categoryId: string; name: string; valueType: string; required: boolean; active: boolean; options: Array<{ label: string; value: string; active: boolean }> }>;
}) {
  const activeCategories = categories.filter((category) => category.active);
  if (activeCategories.length === 0 || types.filter((type) => type.active).length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{GUEST_CREATE_NO_PREFERENCES}</p>;
  }
  function valuesFor(typeId: string) {
    return draft.preferenceAnswers.find((row) => row.typeId === typeId)?.values ?? [];
  }
  function setValues(typeId: string, values: string[]) {
    setDraft((current) => ({
      ...current,
      preferenceAnswers: [
        ...current.preferenceAnswers.filter((row) => row.typeId !== typeId),
        { typeId, values },
      ],
    }));
  }
  return (
    <div className="space-y-4">
      {activeCategories.map((category) => {
        const categoryTypes = types.filter((type) => type.categoryId === category.id && type.active);
        if (categoryTypes.length === 0) return null;
        return (
          <section key={category.id} className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-lg">{category.name}</h2>
            <div className="mt-3 space-y-3">
              {categoryTypes.map((type) => {
                const values = valuesFor(type.id);
                return (
                  <Field key={type.id} label={type.name} required={type.required}>
                    {type.valueType === "yes_no" ? (
                      <Switch checked={values[0] === "yes"} onCheckedChange={(checked) => setValues(type.id, [checked ? "yes" : "no"])} />
                    ) : type.valueType === "multi" ? (
                      <div className="space-y-1">
                        {type.options.filter((option) => option.active).map((option) => (
                          <label key={option.value} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={values.includes(option.value)}
                              onCheckedChange={(checked) => setValues(type.id, checked ? [...values, option.value] : values.filter((value) => value !== option.value))}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : type.valueType === "text" || type.valueType === "number" ? (
                      <Input type={type.valueType === "number" ? "number" : "text"} value={values[0] ?? ""} onChange={(event) => setValues(type.id, event.target.value ? [event.target.value] : [])} />
                    ) : (
                      <Select value={values[0] || "__none"} onValueChange={(value) => setValues(type.id, value === "__none" ? [] : [value])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">None</SelectItem>
                          {type.options.filter((option) => option.active).map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AdditionalStep({
  draft,
  set,
  dataProcessingRequired,
}: {
  draft: GuestCreateDraft;
  set: <K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) => void;
  dataProcessingRequired: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Employment & Source</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Position"><Input value={draft.position} onChange={(event) => set("position", event.target.value)} /></Field>
          <Field label="Department"><Input value={draft.department} onChange={(event) => set("department", event.target.value)} /></Field>
          <Field label="Source of Business"><Input value={draft.sourceOfBusiness} onChange={(event) => set("sourceOfBusiness", event.target.value)} /></Field>
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Emergency Contacts</h2>
        {draft.emergencyContacts.map((contact, index) => (
          <div key={index} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={contact.name} onChange={(event) => set("emergencyContacts", draft.emergencyContacts.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /></Field>
            <Field label="Relationship"><Input value={contact.relationship} onChange={(event) => set("emergencyContacts", draft.emergencyContacts.map((row, i) => i === index ? { ...row, relationship: event.target.value } : row))} /></Field>
            <Field label="Phone"><Input value={contact.phone} onChange={(event) => set("emergencyContacts", draft.emergencyContacts.map((row, i) => i === index ? { ...row, phone: event.target.value } : row))} /></Field>
            <Field label="Email"><Input value={contact.email} onChange={(event) => set("emergencyContacts", draft.emergencyContacts.map((row, i) => i === index ? { ...row, email: event.target.value } : row))} /></Field>
          </div>
        ))}
        <Button type="button" variant="outline" className="mt-3" onClick={() => set("emergencyContacts", [...draft.emergencyContacts, { name: "", relationship: "", phone: "", email: "" }])}>
          Add emergency contact
        </Button>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Notes & Restrictions</h2>
        <Field label="Profile Notes"><Textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
        <Field label="Staged note"><Textarea value={draft.stagedNote} onChange={(event) => set("stagedNote", event.target.value)} /></Field>
        <label className="mt-3 flex items-center gap-2 text-sm"><Checkbox checked={draft.restricted} onCheckedChange={(checked) => set("restricted", Boolean(checked))} /> Restricted</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.blacklisted} onCheckedChange={(checked) => set("blacklisted", Boolean(checked))} /> Blacklisted</label>
        <Field label="Restriction reason"><Textarea value={draft.restrictionReason} onChange={(event) => set("restrictionReason", event.target.value)} /></Field>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Privacy & Consent</h2>
        <Field label="Data processing" required={dataProcessingRequired}>
          <Select value={draft.dataProcessingConsent} onValueChange={(value) => set("dataProcessingConsent", value as GuestCreateDraft["dataProcessingConsent"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GUEST_CONSENT_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Marketing">
          <Select value={draft.marketingConsent} onValueChange={(value) => set("marketingConsent", value as GuestCreateDraft["marketingConsent"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GUEST_CONSENT_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </section>
    </div>
  );
}

function ReviewStep({
  draft,
  rules,
  completion,
  onEdit,
}: {
  draft: GuestCreateDraft;
  rules: ReturnType<typeof createFieldRules>;
  completion: ReturnType<typeof guestCreateCompletion>;
  onEdit: (step: GuestCreateStepId) => void;
}) {
  const remaining = completion.items.filter((item) => item.requiredRemaining);
  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-medium">{remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining</p>
          <ul className="mt-2 space-y-1 text-sm">
            {remaining.map((item) => (
              <li key={item.id}>
                {item.label}{" "}
                <button type="button" className="underline" onClick={() => onEdit(item.step)}>Go to step</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {[
        ["Personal Information", `${guestDisplayName(draft) || "—"}`, "basic"],
        ["Contact Information", [draft.phone, draft.email].filter(Boolean).join(" · ") || "—", "basic"],
        ["Address", [draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—", "basic"],
        ["Identity Documents", draft.documents.length ? `${draft.documents.length} staged` : "None", "identity"],
        ["Preferences", draft.preferenceAnswers.length ? `${draft.preferenceAnswers.length} answered` : "None", "preferences"],
        ["Business", draft.links.map((row) => row.masterName).join(", ") || "None", "business"],
        ["Additional Information", draft.notes || draft.stagedNote || "No notes", "additional"],
        ["Privacy & Consent", `Processing ${draft.dataProcessingConsent} · Marketing ${draft.marketingConsent}`, "additional"],
      ].map(([title, value, step]) => (
        <section key={title} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg">{title}</h2>
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(step as GuestCreateStepId)}>Edit</Button>
          </div>
          <p className="mt-2 text-sm">{value}</p>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{rules.filter((rule) => rule.required).length} configured required fields from Property Setup.</p>
    </div>
  );
}

