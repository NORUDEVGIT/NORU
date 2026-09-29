import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  User,
  X,
} from "lucide-react";

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
  guestCreateFieldIssues,
  guestCreateHasChanges,
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
  addGuestNote,
} from "@/packages/pms/lib/guests.functions";
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
import { GuestFormStagedLinks } from "@/packages/pms/components/guests/guest-form-staged-links";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { formatCreateIssuesByStep, issuesBeforeStep } from "@/packages/pms/lib/guest-create-step-issues";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import {
  resolveGuestFieldRules,
  resolveIndividualProfileType,
  type GuestFieldContext,
} from "@/packages/pms/lib/guest-field-rules";
import { saveGuestCustomFieldValues } from "@/packages/pms/lib/guest-custom-fields.functions";
import {
  ISO_COUNTRIES,
  countryCodeFromInput,
  countryNameFromInput,
  regionsForCountry,
  addressLayoutForCountry,
  isRegionValidForCountry,
} from "@/packages/pms/lib/pms-geography";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";

const MODAL_CONTROL_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#FAF8F5]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

const MODAL_TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const MODAL_TEST_ID = "guest-create-modal";

function hasNestedModalLayer(): boolean {
  if (typeof document === "undefined") return false;
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return [...nodes].some((node) => node.dataset["testid"] !== MODAL_TEST_ID);
}

export function GuestCreateModal({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
  onCancel,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (guestId: string) => void;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGuestCreateContext);
  const loadConfig = useServerFn(getGuestWorkspaceConfig);
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
  const saveCustomValues = useServerFn(saveGuestCustomFieldValues);

  const localHold = useMemo(() => (open ? readGuestCreateHold(restaurantId) : null), [open, restaurantId]);
  const [step, setStep] = useState<GuestCreateStepId>(() => localHold?.step ?? "basic");
  const [draft, setDraft] = useState<GuestCreateDraft>(() => localHold?.draft ?? emptyGuestCreateDraft());
  const [touched] = useState(() => new Set<string>());
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [docFiles, setDocFiles] = useState<Record<string, File | undefined>>({});
  const [duplicates, setDuplicates] = useState<GuestSummary[] | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; profileNumber: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());

  // Card 4 dynamic custom values
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});

  const context = useQuery({
    queryKey: ["guest-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    enabled: open,
  });

  const configQuery = useQuery({
    queryKey: ["guest-workspace-config", restaurantId],
    queryFn: () => loadConfig({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });

  const individualType = resolveIndividualProfileType(configQuery.data);
  const isIndividualActive = !configQuery.data?.available || individualType?.active !== false;

  const card4Context: GuestFieldContext = "profile_create";
  const dynamicFieldRules = useMemo(
    () => resolveGuestFieldRules(configQuery.data, individualType, card4Context),
    [configQuery.data, individualType],
  );

  useEffect(() => {
    if (!open) return;
    if (!context.data || defaultsApplied) return;
    const local = readGuestCreateHold(restaurantId);
    if (local) {
      setDraft(local.draft);
      setStep(local.step);
    } else if (context.data.draft) {
      setDraft(context.data.draft.payload);
      setStep(context.data.draft.step);
    } else {
      const initial = applyCreateDefaults(
        emptyGuestCreateDraft(context.data.profileType?.defaults),
        context.data.profileType?.defaults,
        touched,
      );
      initial.dataProcessingConsent = "granted";
      setDraft(initial);
    }
    setDefaultsApplied(true);
  }, [context.data, defaultsApplied, open, restaurantId, touched]);

  useEffect(() => {
    if (!open || !defaultsApplied || created) return;
    writeGuestCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, draft, open, restaurantId, step]);

  useEffect(() => {
    if (!open || !defaultsApplied || created) return;
    if (!guestCreateHasChanges(draft, context.data?.profileType?.defaults)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraft({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [context.data?.profileType?.defaults, created, defaultsApplied, draft, open, restaurantId, saveDraft, step]);

  const rules = useMemo(
    () => createFieldRules(context.data?.fields ?? [], context.data?.profileType ?? null),
    [context.data?.fields, context.data?.profileType],
  );
  const completion = guestCreateCompletion(draft, rules);
  const requiredPrefs = (context.data?.preferenceTypes ?? [])
    .filter((row) => row.active && row.required)
    .map((row) => row.id);
  const visible = (code: string) => rules.find((rule) => rule.code === code)?.visible !== false;
  const required = (code: string) => Boolean(rules.find((rule) => rule.code === code)?.required);
  const stepIndex = GUEST_CREATE_STEPS.findIndex((item) => item.id === step);

  const fieldIssues = guestCreateFieldIssues(draft, {
    rules,
    set3: context.data?.set3 ?? null,
    requiredPreferenceTypeIds: requiredPrefs,
    dataProcessingRequired: false,
  });

  // Also check Card 4 required custom fields (only for visible company field)
  const missingCustomFields = dynamicFieldRules
    .filter((f) => f.category === "custom_value" && f.requiredForContext && isCompanyField(f))
    .filter((f) => {
      const val =
        customValues[f.id] ??
        customValues[f.code] ??
        (f.code ? customValues[f.code.toLowerCase()] : undefined);
      return val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
    });

  function markAttempted(...ids: string[]) {
    setAttemptedSteps((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function fieldError(key: string, stepId: GuestCreateStepId = step) {
    if (!attemptedSteps.has(stepId) && !attemptedSteps.has("review")) return undefined;
    return fieldIssues.find((issue) => issue.key === key)?.message;
  }

  function set<K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) {
    touched.add(String(key));
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestCreateStepId) {
    const blockers = issuesBeforeStep(fieldIssues, GUEST_CREATE_STEPS, next);
    if (blockers.length) {
      markAttempted(step, ...blockers.map((issue) => issue.step));
      toast.error(formatCreateIssuesByStep(blockers, GUEST_CREATE_STEPS));
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
      toast.error(formatCreateIssuesByStep(current, GUEST_CREATE_STEPS));
      return false;
    }
    if (step === "additional" && missingCustomFields.length > 0) {
      toast.error(`${missingCustomFields[0].label} is required.`);
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
      if (!isIndividualActive) {
        throw new Error("Individual guest profile type is inactive in Property Setup.");
      }
      if (missingCustomFields.length > 0) {
        throw new Error(`${missingCustomFields[0].label} is required.`);
      }

      const issues = guestCreateFieldIssues(draft, {
        rules,
        set3: context.data?.set3 ?? null,
        requiredPreferenceTypeIds: requiredPrefs,
        dataProcessingRequired: Boolean(context.data?.dataProcessingRequired),
      });
      if (issues.length) throw new Error(formatCreateIssuesByStep(issues, GUEST_CREATE_STEPS));

      if (!draft.acknowledgeDuplicates) {
        const matches = await checkDuplicates({
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
          throw new Error("Matching profiles found. Review potential duplicates before creating.");
        }
      }

      const createdGuest = await create({
        data: {
          restaurantId,
          guest: {
            title: draft.title || null,
            firstName: draft.firstName,
            middleName: draft.middleName,
            lastName: draft.lastName,
            preferredName: draft.preferredName,
            gender: draft.gender || null,
            dateOfBirth: draft.dateOfBirth,
            nationality: draft.nationality,
            language: draft.language,
            vipStatus: draft.vipStatus,
            guestStatus: draft.guestStatus,
            phone: draft.phone,
            phoneAlt: draft.phoneAlt,
            email: draft.email,
            emailAlt: draft.emailAlt,
            preferredContactMethod: draft.preferredContactMethod || null,
            preferredContactTime: draft.preferredContactTime || null,
            addressLine1: draft.addressLine1,
            addressLine2: draft.addressLine2,
            city: draft.city,
            region: draft.region,
            country: draft.country,
            postalCode: draft.postalCode,
            position: draft.position,
            department: draft.department,
            notes: draft.notes,
            sourceOfBusiness: draft.sourceOfBusiness,
            restricted: draft.restricted,
            blacklisted: draft.blacklisted,
            restrictionSeverity: draft.restrictionSeverity || null,
            restrictionReason: draft.restrictionReason,
            restrictionUntil: draft.restrictionUntil,
            emergencyContacts: draft.emergencyContacts,
          },
        },
      });

      // Save Card 4 dynamic custom fields
      if (Object.keys(customValues).length > 0) {
        try {
          await saveCustomValues({
            data: { restaurantId, guestId: createdGuest.id, values: customValues },
          });
        } catch {
          toast.warning("Guest created, but some custom fields failed to save.");
        }
      }

      for (const document of draft.documents) {
        const type = (context.data?.documentTypes ?? []).find((row) => row.id === document.idTypeId);
        const saved = await persistDoc({
          data: {
            restaurantId,
            guestId: createdGuest.id,
            documentTypeId: document.idTypeId,
            documentNumber: document.documentNumber,
            issuingCountry: document.issuingCountry || null,
            issueDate: document.issueDate || null,
            expiryDate: document.expiryDate || null,
            issuingAuthority: document.issuingAuthority || null,
            notes: document.notes || null,
          },
        });
        const front = docFiles[`${document.key}-front`];
        const back = docFiles[`${document.key}-back`];
        if (type?.scanImageAllowed && (front || back)) {
          for (const [side, file] of [["front", front], ["back", back]] as const) {
            if (!file) continue;
            const started = await startDocUpload({
              data: {
                restaurantId,
                guestId: createdGuest.id,
                kind: kindFromTypeCode(type.name),
                contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
                size: file.size,
              },
            });
            if (!started.ok) throw new Error(started.message);
            const uploaded = await supabase.storage.from("property-images").uploadToSignedUrl(started.path, started.token, file);
            if (uploaded.error) throw uploaded.error;
            await attachDocImage({
              data: {
                restaurantId,
                guestId: createdGuest.id,
                documentId: saved.id,
                side,
                filePath: started.path,
                mimeType: file.type,
                byteSize: file.size,
              },
            });
          }
        }
      }

      if (draft.preferenceAnswers.length > 0) {
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
      onOpenChange(false);
      if (onCreated) {
        onCreated(result.id);
      } else {
        void navigate({
          to: GUEST_PROFILE_DETAIL_PATH,
          params: { guestId: result.id },
          search: guestProfileSearch({ type: "individual" }),
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleActualClose() {
    if (!created) writeGuestCreateHold(restaurantId, { step, draft });
    if (!created && guestCreateHasChanges(draft, context.data?.profileType?.defaults)) {
      toast.success(GUEST_CREATE_PROGRESS_KEPT);
    }
    onOpenChange(false);
    if (onCancel) {
      onCancel();
    } else {
      void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH, search: guestProfileSearch({ type: "individual" }) });
    }
  }

  function handleAttemptClose() {
    if (guestCreateHasChanges(draft, context.data?.profileType?.defaults) && !created) {
      setDiscardConfirmOpen(true);
    } else {
      handleActualClose();
    }
  }

  function resetForm() {
    const next = applyCreateDefaults(
      emptyGuestCreateDraft(context.data?.profileType?.defaults),
      context.data?.profileType?.defaults,
      new Set(),
    );
    next.dataProcessingConsent = "granted";
    setDraft(next);
    setStep("basic");
    setPhotoFile(null);
    setPhotoPreview(null);
    setDocFiles({});
    setDuplicates(null);
    setCustomValues({});
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
          data-testid="guest-create-modal"
          className={cn(
            "z-50 flex h-[min(92vh,960px)] w-[min(98vw,1550px)] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0",
            "rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] shadow-2xl",
          )}
          onEscapeKeyDown={(e) => {
            if (hasNestedModalLayer()) {
              e.preventDefault();
              return;
            }
            if (guestCreateHasChanges(draft, context.data?.profileType?.defaults) && !created) {
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
                  {GUEST_CREATE_TITLE}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-[#756A5B]">
                  {GUEST_CREATE_COPY}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[#DDD4C5] text-xs text-[#251605]"
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
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
            <ol className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E8E4DC] pt-3" data-testid="guest-create-stepper">
              {GUEST_CREATE_STEPS.map((item, index) => {
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
              {duplicates && duplicates.length > 0 ? (
                <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <p className="flex items-center gap-2 font-medium text-amber-900">
                    <AlertTriangle className="size-4" /> Possible Matching Profiles
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {duplicates.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2"
                      >
                        <span>
                          <span className="font-medium">{row.fullName}</span>
                          <span className="ml-2 text-muted-foreground">
                            {[row.profileNumber, row.phone, row.email].filter(Boolean).join(" · ")}
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
                              search: guestProfileSearch({ type: "individual" }),
                            });
                          }}
                        >
                          View Profile
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDuplicates(null)}>
                      Not a Duplicate
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDraft((current) => ({ ...current, acknowledgeDuplicates: true }));
                        setDuplicates(null);
                      }}
                    >
                      Keep Separate
                    </Button>
                  </div>
                </section>
              ) : null}

              {step === "basic" ? (
                <BasicStep
                  draft={draft}
                  set={set}
                  visible={visible}
                  required={required}
                  fieldError={fieldError}
                  photoPreview={photoPreview}
                  onPhoto={(file) => {
                    setPhotoFile(file);
                    setPhotoPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
              ) : null}

              {step === "identity" ? (
                <IdentityStep
                  draft={draft}
                  setDraft={setDraft}
                  types={(context.data?.documentTypes ?? []).filter((row) => row.active)}
                  profileTypeId={context.data?.profileType?.id ?? null}
                  docFiles={docFiles}
                  setDocFiles={setDocFiles}
                  error={fieldError("IDENTITY_DOCUMENT", "identity")}
                />
              ) : null}

              {step === "preferences" ? (
                <PreferencesStep
                  draft={draft}
                  setDraft={setDraft}
                  categories={context.data?.preferenceCategories ?? []}
                  types={context.data?.preferenceTypes ?? []}
                  fieldError={fieldError}
                />
              ) : null}

              {step === "business" ? (
                <div className="space-y-4 rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#251605]">
                      Business / Company Relationship
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Link this guest to a corporate or travel agency master account.
                    </p>
                  </div>
                  <GuestFormStagedLinks
                    restaurantId={restaurantId}
                    links={draft.links}
                    onChange={(links) => set("links", links)}
                  />
                  {fieldError("COMPANY", "business") ? (
                    <p className="text-xs text-destructive">{fieldError("COMPANY", "business")}</p>
                  ) : null}
                  <div className="rounded-[6px] border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-muted-foreground">
                    {GUEST_CREATE_LOYALTY_UNAVAILABLE}
                  </div>
                </div>
              ) : null}

              {step === "additional" ? (
                <AdditionalStep
                  draft={draft}
                  set={set}
                  fieldError={fieldError}
                  dynamicFields={dynamicFieldRules}
                  customValues={customValues}
                  onCustomValueChange={(fieldId, val) =>
                    setCustomValues((prev) => ({ ...prev, [fieldId]: val }))
                  }
                />
              ) : null}

              {step === "review" ? (
                <ReviewStep
                  draft={draft}
                  rules={rules}
                  completion={completion}
                  issues={fieldIssues}
                  customValues={customValues}
                  dynamicFields={dynamicFieldRules}
                  onEdit={go}
                />
              ) : null}
            </div>

            {/* Right: Contextual Profile Preview & Completion Panel */}
            <aside className="hidden space-y-4 xl:block">
              {/* Profile Preview Card */}
              <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="guest-create-profile-preview">
                <h3 className="font-display text-sm font-semibold text-[#251605]">Profile Preview</h3>
                <div className="mt-3 flex items-center gap-3">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="size-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-full bg-[#EFE8DC] text-[#756A5B]">
                      <User className="size-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#251605]">
                      {guestDisplayName(draft) || "Guest Name"}
                    </p>
                    <span className="inline-block rounded bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#765719]">
                      Individual Guest
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-[#E8E4DC] pt-3 text-xs text-[#756A5B]">
                  <p className="truncate">{draft.phone || "No phone recorded"}</p>
                  <p className="truncate">{draft.email || "No email recorded"}</p>
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
                      <span className={item.complete ? "text-emerald-700" : item.requiredRemaining ? "text-destructive font-bold" : "text-muted-foreground"}>
                        {item.requiredRemaining ? "Required" : item.complete ? "✓" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-[11px] leading-relaxed text-[#756A5B]">
                <p className="font-medium text-[#251605]">Property Setup Controlled</p>
                <p className="mt-0.5">Required fields, document types, and dynamic categories come from Property Setup.</p>
              </div>
            </aside>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-white px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleAttemptClose} className="border-[#DDD4C5]">
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#DDD4C5]"
                data-testid="guest-create-start-over"
                onClick={() => setStartOverOpen(true)}
                disabled={!guestCreateHasChanges(draft, context.data?.profileType?.defaults)}
              >
                {GUEST_CREATE_START_OVER}
              </Button>
              {holdState === "saving" ? (
                <span className="text-xs text-muted-foreground">Saving progress…</span>
              ) : null}
              {holdState === "saved" && guestCreateHasChanges(draft, context.data?.profileType?.defaults) ? (
                <span className="text-xs text-muted-foreground">Progress saved</span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#DDD4C5]"
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending}
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#DDD4C5]"
                disabled={stepIndex === 0}
                onClick={() => go(GUEST_CREATE_STEPS[stepIndex - 1].id)}
              >
                ← Back
              </Button>

              {step === "review" ? (
                <Button
                  type="button"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold shadow-sm"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !isIndividualActive}
                  data-testid="create-guest-final"
                >
                  {createMutation.isPending ? "Creating Guest…" : "Create Guest"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-medium shadow-sm"
                  onClick={() => {
                    if (validateCurrent()) go(GUEST_CREATE_STEPS[stepIndex + 1].id);
                  }}
                >
                  Next <ChevronRight className="ml-1 size-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent className="rounded-2xl border border-[#DDD4C5] bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-[#251605]">Discard new guest?</AlertDialogTitle>
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
                {GUEST_CREATE_START_OVER}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                {GUEST_CREATE_START_OVER_COPY}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStartOverOpen(false)}>Keep Progress</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="guest-create-start-over-confirm"
                disabled={startOverMutation.isPending}
                onClick={() => startOverMutation.mutate()}
              >
                {GUEST_CREATE_START_OVER}
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
      <Label className={cn("text-xs font-medium text-[#251605]", error ? "text-destructive" : undefined)}>
        {label}
        {isRequired ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div
        className={
          error
            ? "[&_input]:border-destructive [&_button]:border-destructive [&_textarea]:border-destructive"
            : undefined
        }
      >
        {children}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function BasicStep({
  draft,
  set,
  visible,
  required,
  fieldError,
  photoPreview,
  onPhoto,
}: {
  draft: GuestCreateDraft;
  set: <K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) => void;
  visible: (code: string) => boolean;
  required: (code: string) => boolean;
  fieldError: (key: string, stepId?: GuestCreateStepId) => string | undefined;
  photoPreview: string | null;
  onPhoto: (file: File | null) => void;
}) {
  const countryOptions = useMemo(
    () => ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name })),
    [],
  );
  const countryCode = countryCodeFromInput(draft.country) || (draft.country ? draft.country : "");
  const nationalityCode = countryCodeFromInput(draft.nationality) || (draft.nationality ? draft.nationality : "");
  const availableRegions = regionsForCountry(draft.country);
  const regionOptions = useMemo(
    () => availableRegions.map((region) => ({ value: region, label: region })),
    [availableRegions],
  );
  const layout = addressLayoutForCountry(draft.country);

  return (
    <div className="space-y-4">
      {/* Personal Details */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Personal Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Profile Type">
            <Input value="Individual Guest" disabled className={cn(MODAL_CONTROL_CLASS, "font-medium")} />
          </Field>
          <Field label="Title">
            <Select
              value={draft.title || "__none"}
              onValueChange={(value) =>
                set("title", value === "__none" ? "" : (value as GuestCreateDraft["title"]))
              }
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Title" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {GUEST_TITLES.map((title) => (
                  <SelectItem key={title} value={title}>
                    {GUEST_TITLE_LABELS[title]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="First Name" required error={fieldError("FIRST_NAME", "basic")}>
            <Input
              value={draft.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              data-testid="guest-create-first-name"
              autoComplete="given-name"
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Middle Name">
            <Input
              value={draft.middleName}
              onChange={(event) => set("middleName", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          {visible("LAST_NAME") ? (
            <Field label="Last Name" required={required("LAST_NAME")} error={fieldError("LAST_NAME", "basic")}>
              <Input
                value={draft.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
          ) : null}
          <Field label="Preferred Name">
            <Input
              value={draft.preferredName}
              onChange={(event) => set("preferredName", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          {visible("DATE_OF_BIRTH") ? (
            <Field label="Date of Birth" required={required("DATE_OF_BIRTH")} error={fieldError("DATE_OF_BIRTH", "basic")}>
              <Input
                type="date"
                value={draft.dateOfBirth}
                onChange={(event) => set("dateOfBirth", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
          ) : null}
          <Field label="Gender">
            <Select
              value={draft.gender || "__none"}
              onValueChange={(value) =>
                set("gender", value === "__none" ? "" : (value as GuestCreateDraft["gender"]))
              }
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {GUEST_GENDERS.map((gender) => (
                  <SelectItem key={gender} value={gender}>
                    {GUEST_GENDER_LABELS[gender]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {visible("NATIONALITY") ? (
            <Field label="Nationality" required={required("NATIONALITY")} error={fieldError("NATIONALITY", "basic")}>
              <SearchableSelect
                id="guest-create-nationality"
                value={nationalityCode}
                options={countryOptions}
                placeholder="Select nationality"
                searchPlaceholder="Search countries..."
                className={MODAL_SELECT_TRIGGER_CLASS}
                onChange={(code) => {
                  const name = countryNameFromInput(code);
                  set("nationality", name);
                }}
              />
            </Field>
          ) : null}
          <Field label="Language">
            <Input
              value={draft.language}
              onChange={(event) => set("language", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <div className="flex h-10 items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3">
            <Label htmlFor="guest-vip-modal" className="text-xs font-medium text-[#251605]">VIP Guest</Label>
            <Switch
              id="guest-vip-modal"
              checked={draft.vipStatus}
              onCheckedChange={(checked) => set("vipStatus", checked)}
            />
          </div>
          <Field label="Guest Photo">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
                className={cn(MODAL_CONTROL_CLASS, "file:mr-2 file:h-7 file:rounded-[4px] file:border-0 file:bg-[#FAF8F5] file:px-2 file:text-xs file:font-medium file:text-[#251605]")}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="" className="size-9 shrink-0 rounded-[6px] border border-[#CCCCCC] object-cover" />
              ) : null}
            </div>
          </Field>
        </div>
      </section>

      {/* Contact Details */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Contact Information</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible("PHONE") ? (
            <Field label="Mobile Phone" required={required("PHONE")} error={fieldError("PHONE", "basic")}>
              <Input
                value={draft.phone}
                onChange={(event) => set("phone", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
          ) : null}
          <Field label="Alternative Phone">
            <Input
              value={draft.phoneAlt}
              onChange={(event) => set("phoneAlt", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          {visible("EMAIL") ? (
            <Field label="Email Address" required={required("EMAIL")} error={fieldError("EMAIL", "basic")}>
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => set("email", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
          ) : null}
          <Field label="Alternative Email">
            <Input
              type="email"
              value={draft.emailAlt}
              onChange={(event) => set("emailAlt", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Preferred Contact Method">
            <Select
              value={draft.preferredContactMethod || "__none"}
              onValueChange={(value) =>
                set(
                  "preferredContactMethod",
                  value === "__none" ? "" : (value as GuestCreateDraft["preferredContactMethod"]),
                )
              }
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Not recorded" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not recorded</SelectItem>
                {PREFERRED_CONTACT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PREFERRED_CONTACT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preferred Contact Time">
            <Select
              value={draft.preferredContactTime || "__none"}
              onValueChange={(value) =>
                set(
                  "preferredContactTime",
                  value === "__none" ? "" : (value as GuestCreateDraft["preferredContactTime"]),
                )
              }
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Not recorded" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not recorded</SelectItem>
                {PREFERRED_CONTACT_TIMES.map((time) => (
                  <SelectItem key={time} value={time}>
                    {PREFERRED_CONTACT_TIME_LABELS[time]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      {/* Address Details */}
      {visible("ADDRESS") ? (
        <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold text-[#251605]">Address Information</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Country" required={required("ADDRESS")} error={fieldError("ADDRESS", "basic")}>
              <SearchableSelect
                id="guest-create-country"
                value={countryCode}
                options={countryOptions}
                placeholder="Select country"
                searchPlaceholder="Search countries..."
                className={MODAL_SELECT_TRIGGER_CLASS}
                onChange={(code) => {
                  const name = countryNameFromInput(code);
                  set("country", name);
                  if (!isRegionValidForCountry(name, draft.region)) {
                    set("region", "");
                  }
                }}
              />
            </Field>
            <Field label={layout.regionLabel || "Region / State"}>
              {availableRegions.length > 0 ? (
                <SearchableSelect
                  id="guest-create-region"
                  value={draft.region}
                  options={regionOptions}
                  placeholder={`Select ${(layout.regionLabel || "region").toLowerCase()}`}
                  searchPlaceholder={`Search ${(layout.regionLabel || "regions").toLowerCase()}...`}
                  className={MODAL_SELECT_TRIGGER_CLASS}
                  onChange={(val) => set("region", val)}
                />
              ) : (
                <Input
                  id="guest-create-region"
                  value={draft.region}
                  placeholder={layout.regionLabel || "Region / State / Province"}
                  onChange={(event) => set("region", event.target.value)}
                  className={MODAL_CONTROL_CLASS}
                />
              )}
            </Field>
            <Field label="City" required={required("ADDRESS")}>
              <Input
                value={draft.city}
                onChange={(event) => set("city", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
            <Field label="Street Address Line 1">
              <Input
                value={draft.addressLine1}
                onChange={(event) => set("addressLine1", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
            <Field label="House / Building Line 2">
              <Input
                value={draft.addressLine2}
                onChange={(event) => set("addressLine2", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </Field>
            <Field label="Postal Code">
              <Input
                value={draft.postalCode}
                onChange={(event) => set("postalCode", event.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
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
  error,
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
  error?: string;
}) {
  const available = types.filter(
    (type) =>
      type.active &&
      (type.validForProfileTypeIds.length === 0 || !profileTypeId || type.validForProfileTypeIds.includes(profileTypeId)),
  );

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
    return (
      <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white p-6 text-center text-xs text-muted-foreground">
        {GUEST_CREATE_NO_DOC_TYPES}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {draft.documents.map((document, docIdx) => {
        const type =
          available.find((row) => row.id === document.idTypeId) ?? types.find((row) => row.id === document.idTypeId);
        return (
          <section key={document.key} className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-2">
              <h3 className="font-display text-sm font-semibold text-[#251605]">
                Document #{docIdx + 1}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() =>
                  setDraft((curr) => ({
                    ...curr,
                    documents: curr.documents.filter((d) => d.key !== document.key),
                  }))
                }
              >
                Remove
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Document Type" required>
                <Select
                  value={document.idTypeId}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.map((row) =>
                        row.key === document.key ? { ...row, idTypeId: value } : row,
                      ),
                    }))
                  }
                >
                  <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {available.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Document Number" required={type?.documentNumberRequired}>
                <Input
                  value={document.documentNumber}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.map((row) =>
                        row.key === document.key ? { ...row, documentNumber: event.target.value } : row,
                      ),
                    }))
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              {type?.issuingCountryRequired !== false ? (
                <Field label="Issuing Country" required={type?.issuingCountryRequired}>
                  <SearchableSelect
                    id={`doc-issuing-country-${document.key}`}
                    value={countryCodeFromInput(document.issuingCountry) || document.issuingCountry}
                    options={ISO_COUNTRIES.map((row) => ({ value: row.code, label: row.name }))}
                    placeholder="Select issuing country"
                    searchPlaceholder="Search countries..."
                    className={MODAL_SELECT_TRIGGER_CLASS}
                    onChange={(code) => {
                      const name = countryNameFromInput(code);
                      setDraft((current) => ({
                        ...current,
                        documents: current.documents.map((row) =>
                          row.key === document.key ? { ...row, issuingCountry: name } : row,
                        ),
                      }));
                    }}
                  />
                </Field>
              ) : null}
              <Field label="Issue Date">
                <Input
                  type="date"
                  value={document.issueDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.map((row) =>
                        row.key === document.key ? { ...row, issueDate: event.target.value } : row,
                      ),
                    }))
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              <Field label="Expiry Date" required={type?.expiryDateRequired}>
                <Input
                  type="date"
                  value={document.expiryDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.map((row) =>
                        row.key === document.key ? { ...row, expiryDate: event.target.value } : row,
                      ),
                    }))
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              <Field label="Issuing Authority">
                <Input
                  value={document.issuingAuthority}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      documents: current.documents.map((row) =>
                        row.key === document.key ? { ...row, issuingAuthority: event.target.value } : row,
                      ),
                    }))
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              {type?.scanImageAllowed ? (
                <>
                  <Field label="Front Scan/Image">
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        setDocFiles((current) => ({ ...current, [`${document.key}-front`]: file }));
                        setDraft((current) => ({
                          ...current,
                          documents: current.documents.map((row) =>
                            row.key === document.key ? { ...row, hasFront: Boolean(file) } : row,
                          ),
                        }));
                      }}
                      className={cn(MODAL_CONTROL_CLASS, "file:mr-2 file:h-7 file:rounded-[4px] file:border-0 file:bg-[#FAF8F5] file:px-2 file:text-xs file:font-medium file:text-[#251605]")}
                    />
                  </Field>
                  <Field label="Back Scan/Image">
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        setDocFiles((current) => ({ ...current, [`${document.key}-back`]: file }));
                        setDraft((current) => ({
                          ...current,
                          documents: current.documents.map((row) =>
                            row.key === document.key ? { ...row, hasBack: Boolean(file) } : row,
                          ),
                        }));
                      }}
                      className={cn(MODAL_CONTROL_CLASS, "file:mr-2 file:h-7 file:rounded-[4px] file:border-0 file:bg-[#FAF8F5] file:px-2 file:text-xs file:font-medium file:text-[#251605]")}
                    />
                  </Field>
                </>
              ) : null}
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Notes">
                  <Textarea
                    rows={2}
                    value={document.notes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        documents: current.documents.map((row) =>
                          row.key === document.key ? { ...row, notes: event.target.value } : row,
                        ),
                      }))
                    }
                    className={MODAL_TEXTAREA_CLASS}
                  />
                </Field>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Staged as {kindFromTypeCode(type?.name)} until guest creation completes.
            </p>
          </section>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={add} className="border-[#DDD4C5]">
        + Add Identity Document
      </Button>
    </div>
  );
}

function PreferencesStep({
  draft,
  setDraft,
  categories,
  types,
  fieldError,
}: {
  draft: GuestCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuestCreateDraft>>;
  categories: Array<{ id: string; name: string; active: boolean }>;
  types: Array<{
    id: string;
    categoryId: string;
    name: string;
    valueType: string;
    required: boolean;
    active: boolean;
    options: Array<{ label: string; value: string; active: boolean }>;
  }>;
  fieldError: (key: string, stepId?: GuestCreateStepId) => string | undefined;
}) {
  const activeCategories = categories.filter((category) => category.active);
  if (activeCategories.length === 0 || types.filter((type) => type.active).length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white p-6 text-center text-xs text-muted-foreground">
        {GUEST_CREATE_NO_PREFERENCES}
      </div>
    );
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
          <section key={category.id} className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold text-[#251605]">{category.name}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {categoryTypes.map((type) => {
                const values = valuesFor(type.id);
                return (
                  <Field
                    key={type.id}
                    label={type.name}
                    required={type.required}
                    error={fieldError(`PREF:${type.id}`, "preferences")}
                  >
                    {type.valueType === "yes_no" ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={values[0] === "yes"}
                          onCheckedChange={(checked) => setValues(type.id, [checked ? "yes" : "no"])}
                        />
                        <span className="text-xs text-muted-foreground">
                          {values[0] === "yes" ? "Yes" : "No"}
                        </span>
                      </div>
                    ) : type.valueType === "multi" ? (
                      <div className="space-y-1.5 pt-1">
                        {type.options
                          .filter((option) => option.active)
                          .map((option) => (
                            <label key={option.value} className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={values.includes(option.value)}
                                onCheckedChange={(checked) =>
                                  setValues(
                                    type.id,
                                    checked
                                      ? [...values, option.value]
                                      : values.filter((value) => value !== option.value),
                                  )
                                }
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                      </div>
                    ) : type.valueType === "text" || type.valueType === "number" ? (
                      <Input
                        type={type.valueType === "number" ? "number" : "text"}
                        value={values[0] ?? ""}
                        onChange={(event) =>
                          setValues(type.id, event.target.value ? [event.target.value] : [])
                        }
                        className={MODAL_CONTROL_CLASS}
                      />
                    ) : (
                      <Select
                        value={values[0] || "__none"}
                        onValueChange={(value) => setValues(type.id, value === "__none" ? [] : [value])}
                      >
                        <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Not recorded" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Not recorded</SelectItem>
                          {type.options
                            .filter((option) => option.active)
                            .map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
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

function isCompanyField(f: { code?: string | null; label?: string | null }): boolean {
  const code = f.code?.toUpperCase();
  if (code === "COMPANY_NAME" || code === "COMPANY") return true;
  const text = (f.label ?? "").toLowerCase();
  return text === "company name" || text === "company";
}

function AdditionalStep({
  draft,
  set,
  fieldError,
  dynamicFields,
  customValues,
  onCustomValueChange,
}: {
  draft: GuestCreateDraft;
  set: <K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) => void;
  fieldError: (key: string, stepId?: GuestCreateStepId) => string | undefined;
  dynamicFields: ReturnType<typeof resolveGuestFieldRules>;
  customValues: Record<string, unknown>;
  onCustomValueChange: (fieldIdOrCode: string, value: unknown) => void;
}) {
  const companyField = dynamicFields.find(isCompanyField);

  const companyName =
    (customValues[companyField?.id ?? ""] as string) ??
    (customValues["COMPANY_NAME"] as string) ??
    (customValues["company_name"] as string) ??
    "";

  function handleCompanyChange(val: string) {
    onCustomValueChange("COMPANY_NAME", val);
    if (companyField) {
      onCustomValueChange(companyField.id, val);
    }
  }

  return (
    <div className="space-y-4">
      {/* Employment & Source */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Employment & Source</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Position">
            <Input
              value={draft.position}
              onChange={(event) => set("position", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Department">
            <Input
              value={draft.department}
              onChange={(event) => set("department", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Source of Business">
            <Input
              value={draft.sourceOfBusiness}
              onChange={(event) => set("sourceOfBusiness", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Company Name">
            <Input
              id="guest-create-company-name"
              value={companyName}
              onChange={(event) => handleCompanyChange(event.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. Acme Corporation"
            />
          </Field>
        </div>
      </section>

      {/* Emergency Contacts */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-2">
          <h2 className="font-display text-base font-semibold text-[#251605]">Emergency Contacts</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-[#DDD4C5]"
            onClick={() =>
              set("emergencyContacts", [
                ...draft.emergencyContacts,
                { name: "", relationship: "", phone: "", email: "" },
              ])
            }
          >
            + Add Contact
          </Button>
        </div>
        <div className="mt-3 space-y-3">
          {draft.emergencyContacts.map((contact, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-[#E8E4DC] p-3 sm:grid-cols-4">
              <Field label="Name">
                <Input
                  value={contact.name}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              <Field label="Relationship">
                <Input
                  value={contact.relationship}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, relationship: event.target.value } : row,
                      ),
                    )
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={contact.phone}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, phone: event.target.value } : row,
                      ),
                    )
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={contact.email}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, email: event.target.value } : row,
                      ),
                    )
                  }
                  className={MODAL_CONTROL_CLASS}
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      {/* Notes & Restrictions */}
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Notes & Restrictions</h2>
        <div className="mt-3 space-y-3">
          <Field label="Profile Notes">
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(event) => set("notes", event.target.value)}
              className={MODAL_TEXTAREA_CLASS}
            />
          </Field>
          <Field label="Staged Note">
            <Textarea
              rows={2}
              value={draft.stagedNote}
              onChange={(event) => set("stagedNote", event.target.value)}
              className={MODAL_TEXTAREA_CLASS}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-[#251605]">
              <Checkbox
                checked={draft.restricted}
                onCheckedChange={(checked) => set("restricted", Boolean(checked))}
              />
              <span>Restricted Profile</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-[#251605]">
              <Checkbox
                checked={draft.blacklisted}
                onCheckedChange={(checked) => set("blacklisted", Boolean(checked))}
              />
              <span>Blacklisted</span>
            </label>
          </div>
          {(draft.restricted || draft.blacklisted) ? (
            <Field label="Restriction Reason" error={fieldError("restrictionReason", "additional")}>
              <Textarea
                rows={2}
                value={draft.restrictionReason}
                onChange={(event) => set("restrictionReason", event.target.value)}
                className={MODAL_TEXTAREA_CLASS}
              />
            </Field>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReviewStep({
  draft,
  rules,
  completion,
  issues,
  customValues,
  dynamicFields,
  onEdit,
}: {
  draft: GuestCreateDraft;
  rules: ReturnType<typeof createFieldRules>;
  completion: ReturnType<typeof guestCreateCompletion>;
  issues: Array<{ key: string; message: string; step: GuestCreateStepId }>;
  customValues: Record<string, unknown>;
  dynamicFields: ReturnType<typeof resolveGuestFieldRules>;
  onEdit: (step: GuestCreateStepId) => void;
}) {
  const remaining = issues.length
    ? issues
    : completion.items
        .filter((item) => item.requiredRemaining)
        .map((item) => ({
          key: item.id,
          message: item.label,
          step: item.step,
        }));


  const companyField = dynamicFields.find(isCompanyField);
  const companyName =
    (customValues[companyField?.id ?? ""] as string) ??
    (customValues["COMPANY_NAME"] as string) ??
    (customValues["company_name"] as string) ??
    "";

  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {remaining.map((item) => (
              <li key={`${item.step}-${item.key}`}>
                <span className="text-destructive">
                  {GUEST_CREATE_STEPS.find((step) => step.id === item.step)?.title}: {item.message}
                </span>{" "}
                <button type="button" className="underline font-semibold" onClick={() => onEdit(item.step)}>
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {[
        {
          title: "Personal Details",
          step: "basic" as GuestCreateStepId,
          content: `${guestDisplayName(draft) || "No name recorded"} · ${draft.gender ? GUEST_GENDER_LABELS[draft.gender as keyof typeof GUEST_GENDER_LABELS] : "Gender not specified"} · ${draft.nationality || "No nationality"}`,
        },
        {
          title: "Contact & Address",
          step: "basic" as GuestCreateStepId,
          content: [draft.phone, draft.email, [draft.city, draft.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No contact or address recorded",
        },
        {
          title: "Identity Documents",
          step: "identity" as GuestCreateStepId,
          content: draft.documents.length
            ? `${draft.documents.length} document${draft.documents.length === 1 ? "" : "s"} staged`
            : "No identity documents staged",
        },
        {
          title: "Preferences",
          step: "preferences" as GuestCreateStepId,
          content: draft.preferenceAnswers.length
            ? `${draft.preferenceAnswers.length} preference answer${draft.preferenceAnswers.length === 1 ? "" : "s"} recorded`
            : "No preferences answered",
        },
        {
          title: "Business & Membership",
          step: "business" as GuestCreateStepId,
          content: draft.links.length
            ? draft.links.map((row) => `${row.masterName} (${row.role})`).join(", ")
            : "No business or corporate account linked",
        },
        {
          title: "Employment & Source",
          step: "additional" as GuestCreateStepId,
          content:
            [
              companyName ? `Company: ${companyName}` : null,
              draft.position ? `Position: ${draft.position}` : null,
              draft.department ? `Department: ${draft.department}` : null,
              draft.sourceOfBusiness ? `Source: ${draft.sourceOfBusiness}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No employment details recorded",
        },
        {
          title: "Emergency Contacts & Notes",
          step: "additional" as GuestCreateStepId,
          content:
            [
              draft.emergencyContacts.filter((c) => c.name.trim()).length
                ? `${draft.emergencyContacts.filter((c) => c.name.trim()).length} contact(s)`
                : null,
              draft.notes ? "Notes recorded" : null,
              draft.restricted ? "Restricted" : null,
              draft.blacklisted ? "Blacklisted" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No additional contacts or notes recorded",
        },
      ].map(({ title, step: sectionStep, content }) => (
        <section key={title} className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-[#E8E4DC] pb-2">
            <h3 className="font-display text-sm font-semibold text-[#251605]">{title}</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs border-[#DDD4C5]"
              onClick={() => onEdit(sectionStep)}
            >
              Edit
            </Button>
          </div>
          <p className="mt-2 text-xs text-[#756A5B]">{content}</p>
        </section>
      ))}

      <p className="text-[11px] text-muted-foreground">
        {rules.filter((rule) => rule.required).length} required field rule(s) verified from Property Setup.
      </p>
    </div>
  );
}
