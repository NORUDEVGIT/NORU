import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgePercent,
  BedDouble,
  Bell,
  Briefcase,
  Building,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Hash,
  Languages,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  SlidersHorizontal,
  Upload,
  User,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
  resolveGuestCreateSteps,
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
  deleteGuestDocument,
  findGuestDuplicates,
  getGuestDocument,
  listGuestDocuments,
  saveGuestConsent,
  saveGuestDocument,
  saveGuestDocumentImage,
  saveGuestPhoto,
  saveGuestPreferenceWorkspace,
  type GuestSummary,
  type GuestProfile,
  type GuestDocument,
  updateGuest,
  addGuestNote,
} from "@/packages/pms/lib/guests.functions";
import { linkGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { kindFromTypeCode } from "@/packages/pms/lib/guest-identity-documents";
import {
  GUEST_TITLE_LABELS,
  GUEST_TITLES,
} from "@/packages/pms/lib/guest-profile-individual";
import { GUEST_RELATIONSHIP_ROLE_LABELS } from "@/packages/pms/lib/guest-profile-wave4";
import {
  PREFERRED_CONTACT_METHOD_LABELS,
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_TIME_LABELS,
  PREFERRED_CONTACT_TIMES,
} from "@/packages/pms/lib/guest-profile-overview";
import { GuestFormStagedLinks } from "@/packages/pms/components/guests/guest-form-staged-links";
import { invalidateGuestWorkspaceQueries } from "@/packages/pms/lib/guest-profile-listing";
import { identityDocumentDateIssue } from "@/packages/pms/lib/guest-identity-documents";
import { propertyToday } from "@/shared/lib/property-dates";
import { useRestaurantTimezone } from "@/core/state/property-format";
import { formatCreateIssuesByStep, issuesBeforeStep } from "@/packages/pms/lib/guest-create-step-issues";
import { GUEST_NATIONALITY_OPTIONS, nationalityValueForStored } from "@/packages/pms/lib/guest-nationalities";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { getGuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import {
  resolveGuestFieldRules,
  resolveIndividualProfileType,
  type GuestFieldContext,
} from "@/packages/pms/lib/guest-field-rules";
import {
  listGuestCustomFieldValues,
  saveGuestCustomFieldValues,
} from "@/packages/pms/lib/guest-custom-fields.functions";
import {
  ISO_COUNTRIES,
  countryCodeFromInput,
  countryNameFromInput,
  regionsForCountry,
  addressLayoutForCountry,
  isRegionValidForCountry,
} from "@/packages/pms/lib/pms-geography";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import {
  isCompanyFieldCode,
  isTravelAgencyFieldCode,
  isGroupFieldCode,
} from "@/packages/pms/lib/guest-creation-field-definitions";

const MODAL_CONTROL_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none transition-colors placeholder:text-[#8C7E72] hover:border-[#8A641A] focus-visible:border-[#8A641A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8A641A] disabled:cursor-not-allowed disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus:border-[#8A641A] focus:ring-1 focus:ring-[#8A641A]";

const GUEST_CREATE_GENDER_OPTIONS = [
  ["male", "Male"],
  ["female", "Female"],
  ["unspecified", "Prefer not to say"],
] as const;

const PHONE_GROUP =
  "h-9 gap-0 overflow-hidden rounded-[6px] border border-[#CCCCCC] bg-white";
const PHONE_TRIGGER = "h-9 w-[7.75rem] rounded-none border-0 bg-white shadow-none hover:bg-white";
const PHONE_INPUT = "h-9 rounded-none border-0 bg-white shadow-none focus-visible:ring-0";

const MODAL_TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const MODAL_TEST_ID = "guest-create-modal";

function hasNestedModalLayer(): boolean {
  if (typeof document === "undefined") return false;
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return [...nodes].some(
    (node) =>
      node.dataset["testid"] !== MODAL_TEST_ID &&
      node.dataset["testid"] !== "fo-ci-v2-workspace" &&
      !node.closest('[data-testid="fo-ci-v2-workspace"]'),
  );
}

function guestProfileToCreateDraft(
  guest: GuestProfile,
  docTypes?: Array<{ id: string; code: string; name: string }>,
): GuestCreateDraft {
  const base = emptyGuestCreateDraft();
  let emergencyContacts: GuestCreateEmergencyDraft[] = [];
  if (Array.isArray(guest.emergencyContacts)) {
    emergencyContacts = (guest.emergencyContacts as any[]).map((c) => ({
      name: c?.name ?? "",
      relationship: c?.relationship ?? "",
      phone: c?.phone ?? "",
      email: c?.email ?? "",
    }));
  }

  let documents: GuestCreateDocumentDraft[] = [];
  if (guest.idDocumentNumber || guest.idDocumentType) {
    const norm = (guest.idDocumentType ?? "").toLowerCase();
    const matched = docTypes?.find((t) => {
      const code = (t.code ?? "").toLowerCase();
      const name = (t.name ?? "").toLowerCase();
      if (norm === "passport") return code.includes("pas") || name.includes("passport");
      if (norm === "national_id") return code.includes("nid") || name.includes("national");
      if (norm === "driving_licence") return code.includes("dl") || name.includes("driv");
      return false;
    }) ?? docTypes?.[0];

    documents.push({
      key: "initial-guest-doc",
      idTypeId: matched?.id ?? "",
      documentNumber: guest.idDocumentNumber ?? "",
      issuingCountry: guest.country ?? "",
      issueDate: "",
      expiryDate: guest.idDocumentExpiry ?? "",
      issuingAuthority: "",
      notes: "",
      hasFront: false,
      hasBack: false,
    });
  }

  return {
    ...base,
    title: (guest.title?.toLowerCase() as any) ?? "",
    firstName: guest.firstName ?? "",
    middleName: guest.middleName ?? "",
    lastName: guest.lastName ?? "",
    preferredName: guest.preferredName ?? "",
    dateOfBirth: guest.dateOfBirth ?? "",
    gender: (guest.gender?.toLowerCase() as any) ?? "",
    nationality: guest.nationality ?? "",
    language: guest.language ?? "",
    country: guest.country ?? "",
    region: guest.region ?? "",
    city: guest.city ?? "",
    addressLine1: guest.addressLine1 ?? "",
    addressLine2: guest.addressLine2 ?? "",
    postalCode: guest.postalCode ?? "",
    phone: guest.phone ?? "",
    phoneAlt: guest.phoneAlt ?? "",
    email: guest.email ?? "",
    emailAlt: guest.emailAlt ?? "",
    preferredContactMethod: (guest.preferredContactMethod?.toLowerCase() as any) ?? "",
    preferredContactTime: (guest.preferredContactTime?.toLowerCase() as any) ?? "",
    vipStatus: Boolean(guest.vipStatus),
    guestStatus: (guest.guestStatus as any) ?? "active",
    position: guest.position ?? "",
    department: guest.department ?? "",
    sourceOfBusiness: guest.sourceOfBusiness ?? "",
    notes: guest.notes ?? "",
    restricted: Boolean(guest.restricted),
    blacklisted: Boolean(guest.blacklisted),
    restrictionSeverity: (guest.restrictionSeverity as any) ?? "",
    restrictionReason: guest.restrictionReason ?? "",
    restrictionUntil: guest.restrictionUntil ?? "",
    emergencyContacts,
    documents,
  };
}

export function GuestCreateModal({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
  onCancel,
  mode = "create",
  guest = null,
  onSaved,
  ignoreDraft = false,
  overlayClassName,
  contentClassName,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (guestId: string) => void;
  onCancel?: () => void;
  mode?: "create" | "edit";
  guest?: GuestProfile | null;
  onSaved?: (guestId: string) => void;
  ignoreDraft?: boolean;
  overlayClassName?: string;
  contentClassName?: string;
}) {
  const isEdit = mode === "edit" || Boolean(guest);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getGuestCreateContext);
  const loadConfig = useServerFn(getGuestWorkspaceConfig);
  const saveDraft = useServerFn(saveGuestCreateDraft);
  const clearDraft = useServerFn(deleteGuestCreateDraft);
  const create = useServerFn(createGuest);
  const updateGuestFn = useServerFn(updateGuest);
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
  const loadCustomValues = useServerFn(listGuestCustomFieldValues);
  const loadDocs = useServerFn(listGuestDocuments);
  const loadDocDetail = useServerFn(getGuestDocument);
  const deleteDoc = useServerFn(deleteGuestDocument);
  const propertyTimezone = useRestaurantTimezone();
  const documentToday = propertyToday(propertyTimezone);

  const localHold = useMemo(
    () => (ignoreDraft ? null : (!isEdit && open ? readGuestCreateHold(restaurantId) : null)),
    [isEdit, open, restaurantId, ignoreDraft],
  );
  const [step, setStep] = useState<GuestCreateStepId>(() => localHold?.step ?? "basic");
  const [draft, setDraft] = useState<GuestCreateDraft>(() => {
    if (isEdit && guest) return guestProfileToCreateDraft(guest);
    return localHold?.draft ?? emptyGuestCreateDraft();
  });
  const [touched] = useState(() => new Set<string>());
  const [defaultsApplied, setDefaultsApplied] = useState(
    () => (!ignoreDraft && Boolean(localHold)) || (isEdit && Boolean(guest)),
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(() => (isEdit && guest ? (guest.photoUrl ?? null) : null));
  const [docFiles, setDocFiles] = useState<Record<string, File | undefined>>({});
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
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

  const card4Context: GuestFieldContext = isEdit ? "profile_edit" : "profile_create";
  const dynamicFieldRules = useMemo(
    () => resolveGuestFieldRules(configQuery.data, individualType, card4Context),
    [configQuery.data, individualType, card4Context],
  );

  useEffect(() => {
    if (!open) return;
    if (isEdit && guest) {
      setDraft(guestProfileToCreateDraft(guest, context.data?.documentTypes));
      setStep("basic");
      setDefaultsApplied(true);
      setDeletedDocIds([]);
      setPhotoFile(null);
      setPhotoPreview(guest.photoUrl ?? null);
      setAttemptedSteps(new Set());
      void loadCustomValues({ data: { restaurantId, guestId: guest.id } })
        .then((items) => {
          const initial: Record<string, unknown> = {};
          for (const item of items) {
            initial[item.fieldId] = item.value;
          }
          setCustomValues(initial);
        })
        .catch(() => undefined);

      void loadDocs({ data: { restaurantId, guestId: guest.id } })
        .then(async (res) => {
          if (!res.available || !res.documents || res.documents.length === 0) return;
          const detailed = await Promise.all(
            res.documents.map(async (doc) => {
              try {
                const detailRes = await loadDocDetail({
                  data: { restaurantId, guestId: guest.id, documentId: doc.id },
                });
                if (detailRes.ok && detailRes.document) {
                  return detailRes.document;
                }
              } catch {
                // fallback
              }
              return doc;
            }),
          );
          const mappedDocs: GuestCreateDocumentDraft[] = detailed.map((doc) => {
            const docNum =
              ("documentNumber" in doc && doc.documentNumber)
                ? doc.documentNumber
                : (doc.documentNumberMasked ?? guest.idDocumentNumber ?? "");
            return {
              key: doc.id,
              existingDocumentId: doc.id,
              idTypeId: doc.idTypeId ?? (context.data?.documentTypes?.[0]?.id ?? ""),
              documentNumber: docNum,
              issuingCountry: doc.issuingCountry ?? "",
              issueDate: doc.issueDate ?? "",
              expiryDate: doc.expiryDate ?? "",
              issuingAuthority: doc.issuingAuthority ?? "",
              notes: doc.notes ?? "",
              hasFront: Boolean(doc.url || doc.storagePath),
              hasBack: Boolean(doc.backUrl || doc.backStoragePath),
              frontImageUrl: doc.url ?? null,
              backImageUrl: doc.backUrl ?? null,
            };
          });
          setDraft((curr) => ({
            ...curr,
            documents: mappedDocs,
          }));
        })
        .catch(() => undefined);

      return;
    }
    if (!context.data || defaultsApplied) return;
    if (ignoreDraft) {
      const initial = applyCreateDefaults(
        emptyGuestCreateDraft(context.data.profileType?.defaults),
        context.data.profileType?.defaults,
        touched,
      );
      initial.dataProcessingConsent = "granted";
      setDraft(initial);
      setStep("basic");
      setDefaultsApplied(true);
      return;
    }
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
  }, [context.data, defaultsApplied, isEdit, guest, open, restaurantId, touched, loadCustomValues, ignoreDraft]);

  useEffect(() => {
    if (ignoreDraft) return;
    if (!open || !defaultsApplied || created || isEdit) return;
    writeGuestCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, draft, isEdit, open, restaurantId, step, ignoreDraft]);

  useEffect(() => {
    if (ignoreDraft) return;
    if (!open || !defaultsApplied || created || isEdit) return;
    if (!guestCreateHasChanges(draft, context.data?.profileType?.defaults)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraft({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [context.data?.profileType?.defaults, created, defaultsApplied, draft, isEdit, open, restaurantId, saveDraft, step]);

  // Determine whether the identity-document feature is active for this property
  const identityField = context.data?.fields?.find((f) => f.code === "IDENTITY_DOCUMENT");
  const identityActive = identityField ? Boolean(identityField.active) : true;
  const activeSteps = useMemo(() => resolveGuestCreateSteps(identityActive), [identityActive]);
  const stepIndex = activeSteps.findIndex((item) => item.id === step);

  // Redirect away from the identity step when documents are disabled
  useEffect(() => {
    if (!identityActive && step === "identity") {
      setStep("basic");
    }
  }, [identityActive, step]);

  // Automatically open the identity document section when on the identity step
  useEffect(() => {
    if (step === "identity" && identityActive && draft.documents.length === 0) {
      const available = (context.data?.documentTypes ?? []).filter(
        (type) =>
          type.active &&
          (type.validForProfileTypeIds.length === 0 ||
            !context.data?.profileType?.id ||
            type.validForProfileTypeIds.includes(context.data.profileType.id)),
      );
      if (available.length > 0) {
        setDraft((current) => ({
          ...current,
          documents: [
            {
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
            },
          ],
        }));
      }
    }
  }, [step, identityActive, draft.documents.length, context.data?.documentTypes, context.data?.profileType?.id]);

  const rules = useMemo(
    () => createFieldRules(context.data?.fields ?? [], context.data?.profileType ?? null),
    [context.data?.fields, context.data?.profileType],
  );
  const completion = guestCreateCompletion(draft, rules, {
    documentTypes: context.data?.documentTypes ?? [],
    docFiles,
    identityActive,
    today: documentToday,
  });
  const allowedPrefTypes = useMemo(() => {
    const all = context.data?.preferenceTypes ?? [];
    const prefIds = context.data?.profileType?.preferenceTypeIds;
    if (!prefIds || prefIds.length === 0) return all;
    const allowedSet = new Set(prefIds);
    return all.filter((t) => allowedSet.has(t.id));
  }, [context.data?.preferenceTypes, context.data?.profileType?.preferenceTypeIds]);

  const requiredPrefs = allowedPrefTypes
    .filter((row) => row.active && row.required)
    .map((row) => row.id);
  const visible = (code: string) => rules.find((rule) => rule.code === code)?.visible !== false;
  const required = (code: string) => Boolean(rules.find((rule) => rule.code === code)?.required);

  const fieldIssues = guestCreateFieldIssues(draft, {
    rules,
    set3: context.data?.set3 ?? null,
    requiredPreferenceTypeIds: requiredPrefs,
    dataProcessingRequired: false,
    hasPhoto: Boolean(photoPreview || photoFile),
    documentTypes: context.data?.documentTypes ?? [],
    docFiles,
    identityActive,
    today: documentToday,
  });

  // Also check Card 4 required custom fields (only individual fields, never company or travel agency)
  const missingCustomFields = dynamicFieldRules
    .filter(
      (f) =>
        f.category === "custom_value" &&
        f.requiredForContext &&
        !isCompanyFieldCode(f.code) &&
        !isTravelAgencyFieldCode(f.code) &&
        !isGroupFieldCode(f.code),
    )
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
    if (stepId !== "identity" && !attemptedSteps.has(stepId) && !attemptedSteps.has("review")) return undefined;
    return fieldIssues.find((issue) => issue.key === key)?.message;
  }

  function set<K extends keyof GuestCreateDraft>(key: K, value: GuestCreateDraft[K]) {
    touched.add(String(key));
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestCreateStepId) {
    if (isEdit) {
      setStep(next);
      return;
    }
    const targetIndex = activeSteps.findIndex((s) => s.id === next);
    const currentIndex = activeSteps.findIndex((s) => s.id === step);
    if (targetIndex > currentIndex) {
      if (!validateCurrent()) return;
    }
    const blockers = issuesBeforeStep(fieldIssues, activeSteps, next);
    if (blockers.length) {
      markAttempted(step, ...blockers.map((issue) => issue.step));
      toast.error(formatCreateIssuesByStep(blockers, activeSteps));
      const first = blockers[0];
      if (first && first.step !== step) setStep(first.step);
      return;
    }
    if (next === "identity" && identityActive && draft.documents.length === 0) {
      const available = (context.data?.documentTypes ?? []).filter(
        (type) =>
          type.active &&
          (type.validForProfileTypeIds.length === 0 ||
            !context.data?.profileType?.id ||
            type.validForProfileTypeIds.includes(context.data.profileType.id)),
      );
      if (available.length > 0) {
        setDraft((current) => ({
          ...current,
          documents: [
            {
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
            },
          ],
        }));
      }
    }
    setStep(next);
  }

  function validateCurrent(): boolean {
    const current = fieldIssues.filter((issue) => issue.step === step);
    if (current.length) {
      markAttempted(step);
      toast.error(formatCreateIssuesByStep(current, activeSteps));
      return false;
    }
    if (step === "additional" && missingCustomFields.length > 0) {
      markAttempted("additional");
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
        hasPhoto: Boolean(photoPreview || photoFile),
        documentTypes: context.data?.documentTypes ?? [],
        docFiles,
        identityActive,
        today: documentToday,
      });
      if (issues.length) throw new Error(formatCreateIssuesByStep(issues, activeSteps));

      // Only validate documents when identity feature is active
      if (identityActive) {
        const docTypes = context.data?.documentTypes ?? [];
        for (let i = 0; i < draft.documents.length; i++) {
          const doc = draft.documents[i];
          const docType = docTypes.find((t) => t.id === doc.idTypeId);
          if (!docType) continue;
          if (docType.documentNumberActive !== false && docType.documentNumberRequired && !doc.documentNumber.trim()) {
            throw new Error(`Document #${i + 1}: Document number is required.`);
          }
          if (docType.issuingCountryActive !== false && docType.issuingCountryRequired && !doc.issuingCountry.trim()) {
            throw new Error(`Document #${i + 1}: Issuing country is required.`);
          }
          if (docType.issueDateActive !== false && docType.issueDateRequired && !doc.issueDate.trim()) {
            throw new Error(`Document #${i + 1}: Issue date is required.`);
          }
          if (docType.expiryDateActive !== false && docType.expiryDateRequired && !doc.expiryDate.trim()) {
            throw new Error(`Document #${i + 1}: Expiry date is required.`);
          }
          const dates = identityDocumentDateIssue({
            expiryDateActive: docType.expiryDateActive,
            issueDate: doc.issueDate,
            expiryDate: doc.expiryDate,
            today: documentToday,
          });
          if (dates.expiry) throw new Error(`Document #${i + 1}: ${dates.expiry}`);
          if (dates.issue) throw new Error(`Document #${i + 1}: ${dates.issue}`);
          if (docType.issuingAuthorityActive !== false && docType.issuingAuthorityRequired && !doc.issuingAuthority.trim()) {
            throw new Error(`Document #${i + 1}: Issuing authority is required.`);
          }
          if (docType.scanImageAllowed && docType.scanImageRequired && !doc.hasFront && !docFiles[`${doc.key}-front`]) {
            throw new Error(`Document #${i + 1}: Front document scan/image is required.`);
          }
        }
      }

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
        const docId = saved.documentId;
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
                documentId: docId,
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

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!guest) throw new Error("No guest selected to edit.");
      if (!draft.firstName.trim()) throw new Error("First name is required.");
      if (!draft.lastName.trim()) throw new Error("Last name is required.");

      // Validate documents if identity feature is active
      if (identityActive) {
        const docTypes = context.data?.documentTypes ?? [];
        for (let i = 0; i < draft.documents.length; i++) {
          const doc = draft.documents[i];
          const docType = docTypes.find((t) => t.id === doc.idTypeId);
          if (!docType) continue;
          if (docType.documentNumberActive !== false && docType.documentNumberRequired && !doc.documentNumber.trim()) {
            throw new Error(`Document #${i + 1}: Document number is required.`);
          }
          if (docType.issuingCountryActive !== false && docType.issuingCountryRequired && !doc.issuingCountry.trim()) {
            throw new Error(`Document #${i + 1}: Issuing country is required.`);
          }
          if (docType.issueDateActive !== false && docType.issueDateRequired && !doc.issueDate.trim()) {
            throw new Error(`Document #${i + 1}: Issue date is required.`);
          }
          if (docType.expiryDateActive !== false && docType.expiryDateRequired && !doc.expiryDate.trim()) {
            throw new Error(`Document #${i + 1}: Expiry date is required.`);
          }
          const dates = identityDocumentDateIssue({
            expiryDateActive: docType.expiryDateActive,
            issueDate: doc.issueDate,
            expiryDate: doc.expiryDate,
            today: documentToday,
          });
          if (dates.expiry) throw new Error(`Document #${i + 1}: ${dates.expiry}`);
          if (dates.issue) throw new Error(`Document #${i + 1}: ${dates.issue}`);
          if (docType.issuingAuthorityActive !== false && docType.issuingAuthorityRequired && !doc.issuingAuthority.trim()) {
            throw new Error(`Document #${i + 1}: Issuing authority is required.`);
          }
          if (docType.scanImageAllowed && docType.scanImageRequired && !doc.hasFront && !docFiles[`${doc.key}-front`]) {
            throw new Error(`Document #${i + 1}: Front document scan/image is required.`);
          }
        }
      }

      const firstDoc = draft.documents[0];
      const firstDocType = firstDoc
        ? (context.data?.documentTypes ?? []).find((t) => t.id === firstDoc.idTypeId)
        : null;

      const updated = await updateGuestFn({
        data: {
          restaurantId,
          guestId: guest.id,
          guest: {
            title: draft.title || null,
            firstName: draft.firstName.trim(),
            middleName: draft.middleName.trim() || null,
            lastName: draft.lastName.trim(),
            preferredName: draft.preferredName.trim() || null,
            gender: draft.gender || null,
            dateOfBirth: draft.dateOfBirth || null,
            nationality: draft.nationality || null,
            language: draft.language || null,
            vipStatus: draft.vipStatus,
            phone: draft.phone || null,
            phoneAlt: draft.phoneAlt || null,
            email: draft.email || null,
            emailAlt: draft.emailAlt || null,
            preferredContactMethod: draft.preferredContactMethod || null,
            preferredContactTime: draft.preferredContactTime || null,
            addressLine1: draft.addressLine1 || null,
            addressLine2: draft.addressLine2 || null,
            city: draft.city || null,
            region: draft.region || null,
            country: draft.country || null,
            postalCode: draft.postalCode || null,
            position: draft.position || null,
            department: draft.department || null,
            sourceOfBusiness: draft.sourceOfBusiness || null,
            notes: draft.notes || null,
            restricted: draft.restricted,
            blacklisted: draft.blacklisted,
            restrictionSeverity: draft.restrictionSeverity || null,
            restrictionReason: draft.restrictionReason || null,
            restrictionUntil: draft.restrictionUntil || null,
            emergencyContacts: draft.emergencyContacts,
            idDocumentNumber: firstDoc?.documentNumber || null,
            idDocumentExpiry: firstDoc?.expiryDate || null,
            idDocumentType: firstDocType ? (kindFromTypeCode(firstDocType.name) as any) : null,
          },
        },
      });

      // Delete removed existing documents
      for (const delId of deletedDocIds) {
        try {
          await deleteDoc({ data: { restaurantId, guestId: guest.id, documentId: delId } });
        } catch {
          // ignore if already deleted
        }
      }

      // Persist documents in draft
      for (const document of draft.documents) {
        if (!document.idTypeId) continue;
        const type = (context.data?.documentTypes ?? []).find((row) => row.id === document.idTypeId);
        const saved = await persistDoc({
          data: {
            restaurantId,
            guestId: guest.id,
            documentId: document.existingDocumentId,
            idTypeId: document.idTypeId,
            documentNumber: document.documentNumber || null,
            issuingCountry: document.issuingCountry || null,
            issueDate: document.issueDate || null,
            expiryDate: document.expiryDate || null,
            issuingAuthority: document.issuingAuthority || null,
            notes: document.notes || null,
          },
        });
        if (!saved.ok) {
          throw new Error(saved.message || "Failed to save identity document.");
        }
        const docId = saved.documentId;
        const front = docFiles[`${document.key}-front`];
        const back = docFiles[`${document.key}-back`];
        if (type?.scanImageAllowed && (front || back)) {
          for (const [side, file] of [["front", front], ["back", back]] as const) {
            if (!file) continue;
            const started = await startDocUpload({
              data: {
                restaurantId,
                guestId: guest.id,
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
                guestId: guest.id,
                documentId: docId,
                side,
                filePath: started.path,
                mimeType: file.type,
                byteSize: file.size,
              },
            });
          }
        }
      }

      if (Object.keys(customValues).length > 0) {
        await saveCustomValues({
          data: {
            restaurantId,
            guestId: guest.id,
            values: customValues,
          },
        });
      }

      return updated;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest", guest?.id] });
      void queryClient.invalidateQueries({ queryKey: ["guest-documents", restaurantId, guest?.id] });
      toast.success("Guest updated successfully.");
      onOpenChange(false);
      onSaved?.(result.id ?? guest?.id ?? "");
    },
    onError: (err: any) => {
      toast.error(err instanceof Error ? err.message : "Failed to update guest.");
    },
  });

  function handleActualClose() {
    if (isEdit) {
      onOpenChange(false);
      onCancel?.();
      return;
    }
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
    if (isEdit) {
      handleActualClose();
      return;
    }
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
          overlayClassName={overlayClassName ?? "z-[80]"}
          className={cn(
            "z-[80] flex h-[92vh] max-h-[92vh] w-[min(90vw,1440px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
            "rounded-lg border border-[#3A2A16] bg-[#FBF7F1] shadow-2xl",
            "[&>button]:hidden",
            contentClassName,
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
          <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="font-display text-sm font-semibold text-[#F3E9D8]">
                {isEdit ? `Edit Guest — ${guestDisplayName(draft) || "Guest"}` : GUEST_CREATE_TITLE}
              </DialogTitle>
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
                {completion.percent}% complete
              </span>
              <DialogDescription className="sr-only">{GUEST_CREATE_COPY}</DialogDescription>
              <span className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
                >
                  Check for Duplicates
                </Button>
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
                        data-testid="guest-create-start-over"
                        disabled={!guestCreateHasChanges(draft, context.data?.profileType?.defaults)}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setStartOverOpen(true)}
                      >
                        {GUEST_CREATE_START_OVER}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
                  onClick={handleAttemptClose}
                  aria-label="Close dialog"
                >
                  <X className="size-4" />
                </Button>
              </span>
            </div>
          </header>
          <nav
            aria-label="Create guest steps"
            className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
            data-testid="guest-create-stepper"
          >
            <ol className="flex min-w-0 items-stretch">
              {activeSteps.map((item, index) => {
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

          {/* Main Body Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F1] p-4">
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

              {step === "identity" && identityActive ? (
                <IdentityStep
                  draft={draft}
                  setDraft={setDraft}
                  types={context.data?.documentTypes ?? []}
                  profileTypeId={context.data?.profileType?.id ?? null}
                  docFiles={docFiles}
                  setDocFiles={setDocFiles}
                  error={fieldError("IDENTITY_DOCUMENT", "identity")}
                  fieldError={fieldError}
                  today={documentToday}
                  onRemoveExistingDoc={(id) => setDeletedDocIds((prev) => [...prev, id])}
                />
              ) : null}

              {step === "preferences" ? (
                <PreferencesStep
                  draft={draft}
                  setDraft={setDraft}
                  categories={context.data?.preferenceCategories ?? []}
                  types={allowedPrefTypes}
                  fieldError={fieldError}
                  isLoading={context.isLoading}
                />
              ) : null}

              {step === "business" ? (
                <div className="space-y-4 rounded-lg border border-[#DDD4C5] bg-white p-5 shadow-sm">
                  <div>
                    <h2 className="font-display text-base font-semibold text-[#251605]">
                      Business & Membership
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Link this guest to a company, group, or travel agency.
                    </p>
                  </div>
                  <GuestFormStagedLinks
                    restaurantId={restaurantId}
                    links={draft.links}
                    onChange={(links) => set("links", links)}
                    intro="Search for the account, choose the relationship, then add it. The link is saved when you create the guest."
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
                  identityActive={identityActive}
                  documentTypes={context.data?.documentTypes ?? []}
                  preferenceTypes={allowedPrefTypes}
                  activeSteps={activeSteps}
                  onEdit={go}
                />
              ) : null}
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#E8DFD0] bg-white px-4 py-2">
            {isEdit ? (
              <>
                <Button type="button" variant="outline" onClick={handleAttemptClose} className="border-[#DDD4C5]">
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold shadow-sm"
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                    data-testid="edit-guest-save-btn"
                  >
                    {saveEditMutation.isPending ? "Saving Changes…" : "Save Changes"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {stepIndex === 0 ? (
                    <Button type="button" variant="outline" onClick={handleAttemptClose} className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]">
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                      onClick={() => go(activeSteps[stepIndex - 1].id)}
                    >
                      Back
                    </Button>
                  )}
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
                    className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                    onClick={() => draftMutation.mutate()}
                    disabled={draftMutation.isPending}
                  >
                    Save as Draft
                  </Button>
                  {step === "review" ? (
                    <Button
                      type="button"
                      className={SHELL_PRIMARY_BUTTON}
                      onClick={() => {
                        if (missingCustomFields.length > 0) {
                          markAttempted("additional", "review");
                          toast.error(`${missingCustomFields[0].label} is required.`);
                          return;
                        }
                        const issues = guestCreateFieldIssues(draft, {
                          rules,
                          set3: context.data?.set3 ?? null,
                          requiredPreferenceTypeIds: requiredPrefs,
                          dataProcessingRequired: Boolean(context.data?.dataProcessingRequired),
                          hasPhoto: Boolean(photoPreview || photoFile),
                          documentTypes: context.data?.documentTypes ?? [],
                          docFiles,
                          identityActive,
                          today: documentToday,
                        });
                        if (issues.length) {
                          markAttempted("review", ...issues.map((issue) => issue.step));
                          toast.error(formatCreateIssuesByStep(issues, activeSteps));
                          return;
                        }
                        createMutation.mutate();
                      }}
                      disabled={createMutation.isPending || !isIndividualActive}
                      data-testid="create-guest-final"
                    >
                      {createMutation.isPending ? "Creating Guest…" : "Create Guest"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className={SHELL_PRIMARY_BUTTON}
                      disabled={step === "identity" && fieldIssues.some((issue) => issue.step === "identity")}
                      onClick={() => {
                        if (validateCurrent()) go(activeSteps[stepIndex + 1].id);
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
        <AlertDialogContent className="z-[90] rounded-2xl border border-[#DDD4C5] bg-white">
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
          <AlertDialogContent className="z-[90] rounded-2xl border border-[#DDD4C5] bg-white">
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

function IconInput({
  icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8C7E72]">{icon}</span>
      <Input {...props} className={cn(MODAL_CONTROL_CLASS, "pl-9", className)} />
    </div>
  );
}

function UploadControl({
  accept,
  label,
  onFile,
}: {
  accept: string;
  label: string;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#8C7E72] hover:border-[#8A641A]">
      <Upload className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs font-medium text-[#8A641A]">Browse</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </label>
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
  const availableRegions = regionsForCountry(draft.country);
  const regionOptions = useMemo(
    () => availableRegions.map((region) => ({ value: region, label: region })),
    [availableRegions],
  );
  const layout = addressLayoutForCountry(draft.country);

  return (
    <div className="space-y-4">
      {/* Personal Details */}
      <section className="rounded-lg border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Personal Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Profile Type">
            <div className="flex h-9 items-center gap-2 rounded-[6px] border border-[#E8E1D7] bg-[#FAF8F5] px-3 text-sm text-[#6B5E4E]">
              <Lock className="size-3.5 shrink-0" />
              <span className="truncate">Individual Guest</span>
            </div>
          </Field>
          <Field label="Title" required={required("TITLE")} error={fieldError("TITLE", "basic")}>
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
            <IconInput
              icon={<User className="size-4" />}
              value={draft.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              data-testid="guest-create-first-name"
              autoComplete="given-name"
              placeholder="Enter first name"
            />
          </Field>
          <Field label="Middle Name" required={required("MIDDLE_NAME")} error={fieldError("MIDDLE_NAME", "basic")}>
            <Input
              value={draft.middleName}
              onChange={(event) => set("middleName", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          {visible("LAST_NAME") ? (
            <Field label="Last Name" required={required("LAST_NAME")} error={fieldError("LAST_NAME", "basic")}>
              <IconInput
                icon={<User className="size-4" />}
                value={draft.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                placeholder="Enter last name"
              />
            </Field>
          ) : null}
          <Field label="Preferred Name" required={required("PREFERRED_NAME")} error={fieldError("PREFERRED_NAME", "basic")}>
            <Input
              value={draft.preferredName}
              onChange={(event) => set("preferredName", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          {visible("DATE_OF_BIRTH") ? (
            <Field label="Date of Birth" required={required("DATE_OF_BIRTH")} error={fieldError("DATE_OF_BIRTH", "basic")}>
              <IconInput
                icon={<Calendar className="size-4" />}
                type="date"
                value={draft.dateOfBirth}
                onChange={(event) => set("dateOfBirth", event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Gender" required={required("GENDER")} error={fieldError("GENDER", "basic")}>
            <Select
              value={draft.gender === "male" || draft.gender === "female" || draft.gender === "unspecified" ? draft.gender : "__none"}
              onValueChange={(value) =>
                set("gender", value === "__none" ? "" : (value as GuestCreateDraft["gender"]))
              }
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS}><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select gender</SelectItem>
                {GUEST_CREATE_GENDER_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {visible("NATIONALITY") ? (
            <Field label="Nationality" required={required("NATIONALITY")} error={fieldError("NATIONALITY", "basic")}>
              <SearchableSelect
                id="guest-create-nationality"
                value={nationalityValueForStored(draft.nationality)}
                options={GUEST_NATIONALITY_OPTIONS}
                placeholder="Select nationality"
                searchPlaceholder="Search nationality..."
                className={MODAL_SELECT_TRIGGER_CLASS}
                onChange={(value) => set("nationality", value)}
              />
            </Field>
          ) : null}
          <Field label="Language" required={required("LANGUAGE")} error={fieldError("LANGUAGE", "basic")}>
            <Input
              value={draft.language}
              onChange={(event) => set("language", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <div className="flex h-9 items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3">
            <Label htmlFor="guest-vip-modal" className="text-xs font-medium text-[#251605]">VIP Guest</Label>
            <Switch
              id="guest-vip-modal"
              checked={draft.vipStatus}
              onCheckedChange={(checked) => set("vipStatus", checked)}
            />
          </div>
          <Field label="Guest Photo" required={required("GUEST_PHOTO")} error={fieldError("GUEST_PHOTO", "basic")}>
            <div className="flex items-center gap-2">
              <UploadControl
                accept="image/jpeg,image/png,image/webp"
                label={photoPreview ? "Photo selected" : "Upload guest photo"}
                onFile={onPhoto}
              />
              {photoPreview ? (
                <img src={photoPreview} alt="" className="size-9 shrink-0 rounded-[6px] border border-[#CCCCCC] object-cover" />
              ) : null}
            </div>
          </Field>
        </div>
      </section>

      {/* Contact Details */}
      <section className="rounded-lg border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Contact Information</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible("PHONE") ? (
            <Field label="Mobile Phone" required={required("PHONE")} error={fieldError("PHONE", "basic")}>
              <CanonicalPhoneInput
                value={draft.phone}
                onChange={(phone) => set("phone", phone)}
                error={Boolean(fieldError("PHONE", "basic"))}
                placeholder="Enter phone number"
                containerClassName={PHONE_GROUP}
                triggerClassName={PHONE_TRIGGER}
                className={PHONE_INPUT}
                popoverClassName="z-[90]"
              />
            </Field>
          ) : null}
          <Field label="Alternative Phone" required={required("PHONE_ALT")} error={fieldError("PHONE_ALT", "basic")}>
            <CanonicalPhoneInput
              value={draft.phoneAlt}
              onChange={(phoneAlt) => set("phoneAlt", phoneAlt)}
              error={Boolean(fieldError("PHONE_ALT", "basic"))}
              placeholder="Enter phone number"
              containerClassName={PHONE_GROUP}
              triggerClassName={PHONE_TRIGGER}
              className={PHONE_INPUT}
              popoverClassName="z-[90]"
            />
          </Field>
          {visible("EMAIL") ? (
            <Field label="Email Address" required={required("EMAIL")} error={fieldError("EMAIL", "basic")}>
              <IconInput
                icon={<Mail className="size-4" />}
                type="email"
                value={draft.email}
                onChange={(event) => set("email", event.target.value)}
                placeholder="Enter email address"
              />
            </Field>
          ) : null}
          <Field label="Alternative Email" required={required("EMAIL_ALT")} error={fieldError("EMAIL_ALT", "basic")}>
            <Input
              type="email"
              value={draft.emailAlt}
              onChange={(event) => set("emailAlt", event.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>
          <Field label="Preferred Contact Method" required={required("PREFERRED_CONTACT_METHOD")} error={fieldError("PREFERRED_CONTACT_METHOD", "basic")}>
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
          <Field label="Preferred Contact Time" required={required("PREFERRED_CONTACT_TIME")} error={fieldError("PREFERRED_CONTACT_TIME", "basic")}>
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
        <section className="rounded-lg border border-[#DDD4C5] bg-white p-4 shadow-sm">
          <h2 className="font-display text-base font-semibold text-[#251605]">Address Information</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Country" required={required("COUNTRY") || required("ADDRESS")} error={fieldError("COUNTRY", "basic") || fieldError("ADDRESS", "basic")}>
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
            <Field label={layout.regionLabel || "Region / State"} required={required("REGION")} error={fieldError("REGION", "basic")}>
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
            <Field label="City" required={required("CITY") || required("ADDRESS")} error={fieldError("CITY", "basic")}>
              <IconInput
                icon={<MapPin className="size-4" />}
                value={draft.city}
                onChange={(event) => set("city", event.target.value)}
                placeholder="Enter city"
              />
            </Field>
            <Field label="Street Address Line 1" required={required("ADDRESS_LINE1")} error={fieldError("ADDRESS_LINE1", "basic")}>
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
            <Field label="Postal Code" required={required("POSTAL_CODE")} error={fieldError("POSTAL_CODE", "basic")}>
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
  fieldError,
  today,
  onRemoveExistingDoc,
}: {
  draft: GuestCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuestCreateDraft>>;
  types: Array<{
    id: string;
    name: string;
    active: boolean;
    documentNumberActive?: boolean;
    documentNumberRequired: boolean;
    issuingCountryActive?: boolean;
    issuingCountryRequired: boolean;
    issueDateActive?: boolean;
    issueDateRequired?: boolean;
    expiryDateActive?: boolean;
    expiryDateRequired: boolean;
    issuingAuthorityActive?: boolean;
    issuingAuthorityRequired?: boolean;
    scanImageAllowed: boolean;
    scanImageRequired?: boolean;
    validForProfileTypeIds: string[];
  }>;
  profileTypeId: string | null;
  docFiles: Record<string, File | undefined>;
  setDocFiles: React.Dispatch<React.SetStateAction<Record<string, File | undefined>>>;
  error?: string;
  fieldError?: (key: string, stepId?: GuestCreateStepId) => string | undefined;
  today: string;
  onRemoveExistingDoc?: (id: string) => void;
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

  useEffect(() => {
    if (available.length > 0 && draft.documents.length === 0) {
      add();
    }
  }, [available.length, draft.documents.length]);

  if (available.length === 0 && draft.documents.length === 0) {
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
        const dates = identityDocumentDateIssue({
          expiryDateActive: type?.expiryDateActive,
          issueDate: document.issueDate,
          expiryDate: document.expiryDate,
          today,
        });
        return (
          <section key={document.key} className="rounded-lg border border-[#DDD4C5] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-2">
              <h3 className="font-display text-sm font-semibold text-[#251605]">
                {draft.documents.length > 1 ? `Document #${docIdx + 1}` : "Identity Document"}
              </h3>
              {draft.documents.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (document.existingDocumentId) {
                      onRemoveExistingDoc?.(document.existingDocumentId);
                    }
                    setDraft((curr) => ({
                      ...curr,
                      documents: curr.documents.filter((d) => d.key !== document.key),
                    }));
                  }}
                >
                  Remove
                </Button>
              ) : null}
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
                    {type && !available.some((row) => row.id === type.id) ? (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name} (Inactive)
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
              {type?.documentNumberActive !== false ? (
                <Field
                  label="Document Number"
                  required={type?.documentNumberRequired}
                  error={fieldError?.(`DOC_${document.key}_documentNumber`, "identity")}
                >
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
              ) : null}
              {type?.issuingCountryActive !== false ? (
                <Field
                  label="Issuing Country"
                  required={type?.issuingCountryRequired}
                  error={fieldError?.(`DOC_${document.key}_issuingCountry`, "identity")}
                >
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
              {type?.issueDateActive !== false ? (
                <Field
                  label="Issue Date"
                  required={type?.issueDateRequired}
                  error={dates.issue || fieldError?.(`DOC_${document.key}_issueDate`, "identity")}
                >
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
              ) : null}
              {type?.expiryDateActive !== false ? (
                <Field
                  label="Expiry Date"
                  required={type?.expiryDateRequired}
                  error={dates.expiry || fieldError?.(`DOC_${document.key}_expiryDate`, "identity")}
                >
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
              ) : null}
              {type?.issuingAuthorityActive !== false ? (
                <Field
                  label="Issuing Authority"
                  required={type?.issuingAuthorityRequired}
                  error={fieldError?.(`DOC_${document.key}_issuingAuthority`, "identity")}
                >
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
              ) : null}
              {type?.scanImageAllowed ? (
                <>
                  <Field
                    label="Front Scan/Image"
                    required={type?.scanImageRequired && !document.hasFront}
                    error={fieldError?.(`DOC_${document.key}_scan`, "identity")}
                  >
                    <UploadControl
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      label={docFiles[`${document.key}-front`]?.name || (document.hasFront ? "Front scan on file" : "Upload front scan")}
                      onFile={(file) => {
                        setDocFiles((current) => ({ ...current, [`${document.key}-front`]: file ?? undefined }));
                        setDraft((current) => ({
                          ...current,
                          documents: current.documents.map((row) =>
                            row.key === document.key ? { ...row, hasFront: Boolean(file) } : row,
                          ),
                        }));
                      }}
                    />
                    {document.hasFront ? (
                      <p className="mt-1 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                        <span>✓ Front scan on file</span>
                        {document.frontImageUrl ? (
                          <a
                            href={document.frontImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-emerald-800 hover:text-emerald-950"
                          >
                            (View)
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Back Scan/Image">
                    <UploadControl
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      label={docFiles[`${document.key}-back`]?.name || (document.hasBack ? "Back scan on file" : "Upload back scan")}
                      onFile={(file) => {
                        setDocFiles((current) => ({ ...current, [`${document.key}-back`]: file ?? undefined }));
                        setDraft((current) => ({
                          ...current,
                          documents: current.documents.map((row) =>
                            row.key === document.key ? { ...row, hasBack: Boolean(file) } : row,
                          ),
                        }));
                      }}
                    />
                    {document.hasBack ? (
                      <p className="mt-1 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                        <span>✓ Back scan on file</span>
                        {document.backImageUrl ? (
                          <a
                            href={document.backImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-emerald-800 hover:text-emerald-950"
                          >
                            (View)
                          </a>
                        ) : null}
                      </p>
                    ) : null}
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
    </div>
  );
}

function preferenceFieldIcon(type: { code?: string; valueType: string }) {
  const code = (type.code ?? "").toUpperCase();
  const className = "size-3.5";
  if (code.includes("ROOM") || code.includes("BED")) return <BedDouble className={className} />;
  if (code.includes("RATE")) return <BadgePercent className={className} />;
  if (code.includes("MEAL") || code.includes("DIET")) return <UtensilsCrossed className={className} />;
  if (code.includes("LANG") || code.includes("COMM")) return <Languages className={className} />;
  if (code.includes("FLOOR")) return <Building2 className={className} />;
  if (code.includes("WAKE") || code.includes("SERVICE")) return <Bell className={className} />;
  if (type.valueType === "number") return <Hash className={className} />;
  return <SlidersHorizontal className={className} />;
}

function preferenceTypeConfigured(type: {
  active: boolean;
  required: boolean;
  valueType: string;
  options: Array<{ active: boolean }>;
}) {
  if (!type.active) return false;
  if (type.required || type.valueType === "text" || type.valueType === "number" || type.valueType === "yes_no") {
    return true;
  }
  return type.options.some((option) => option.active);
}

function PreferencesStep({
  draft,
  setDraft,
  categories,
  types,
  fieldError,
  isLoading,
}: {
  draft: GuestCreateDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuestCreateDraft>>;
  categories: Array<{ id: string; name: string; active: boolean; displayOrder?: number }>;
  types: Array<{
    id: string;
    categoryId: string;
    name: string;
    code?: string;
    valueType: string;
    required: boolean;
    active: boolean;
    displayOrder?: number;
    options: Array<{ label: string; value: string; active: boolean }>;
  }>;
  fieldError: (key: string, stepId?: GuestCreateStepId) => string | undefined;
  isLoading?: boolean;
}) {
  const [customTypeOrder, setCustomTypeOrder] = useState<Record<string, string[]>>({});

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse space-y-2 rounded-lg border border-[#DDD4C5] bg-white px-3 py-2.5">
            <div className="h-4 w-36 rounded bg-[#EBE5DA]" />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="h-14 rounded-[6px] border border-[#EBE5DA] bg-[#FAF8F5]" />
              <div className="h-14 rounded-[6px] border border-[#EBE5DA] bg-[#FAF8F5]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const activeCategories = [...categories]
    .filter((category) => category.active)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  if (activeCategories.length === 0 || !types.some(preferenceTypeConfigured)) {
    return (
      <div className="rounded-xl border border-dashed border-[#DDD4C5] bg-white p-6 text-center text-xs text-muted-foreground">
        {GUEST_CREATE_NO_PREFERENCES}
      </div>
    );
  }

  function getCategoryTypes(categoryId: string) {
    const raw = types.filter((type) => type.categoryId === categoryId && preferenceTypeConfigured(type));
    const order = customTypeOrder[categoryId];
    if (!order || order.length === 0) {
      return [...raw].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name),
      );
    }
    return [...raw].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    });
  }

  function moveTypeInCategory(categoryId: string, index: number, direction: "up" | "down") {
    const currentTypes = getCategoryTypes(categoryId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentTypes.length) return;
    const reordered = [...currentTypes];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const newIds = reordered.map((t) => t.id);
    setCustomTypeOrder((prev) => ({ ...prev, [categoryId]: newIds }));

    setDraft((current) => {
      const answers = [...current.preferenceAnswers];
      answers.sort((a, b) => {
        const posA = newIds.indexOf(a.typeId);
        const posB = newIds.indexOf(b.typeId);
        if (posA !== -1 && posB !== -1) return posA - posB;
        return 0;
      });
      return { ...current, preferenceAnswers: answers };
    });
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
    <div className="space-y-2">
      <p className="text-[11px] text-[#8C7E72]">Reorder preferences to specify priority.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {activeCategories.map((category) => {
        const categoryTypes = getCategoryTypes(category.id);
        if (categoryTypes.length === 0) return null;
        const canReorder = categoryTypes.length > 1;
        return (
          <section
            key={category.id}
            className={cn(
              "rounded-lg border border-[#DDD4C5] bg-white px-3 py-2.5",
              canReorder && "sm:col-span-2",
            )}
          >
            <h2 className="font-display text-sm font-semibold text-[#251605]">{category.name}</h2>
            <div className={cn("mt-2 grid grid-cols-1 gap-x-3 gap-y-2", canReorder && "sm:grid-cols-2")}>
              {categoryTypes.map((type, index) => {
                const values = valuesFor(type.id);
                const preferenceError = fieldError(`PREF:${type.id}`, "preferences");
                const emptyLabel = type.required ? "Select preference" : "No preference";
                const icon = preferenceFieldIcon(type);
                const activeOptions = type.options.filter((option) => option.active);

                return (
                  <div key={type.id} className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <Label className="min-w-0 truncate text-xs font-medium text-[#251605]">
                        <span className="mr-1 text-[10px] font-normal tabular-nums text-[#C4B8A8]">{index + 1}</span>
                        {type.name}
                        {type.required ? <span className="text-destructive"> *</span> : null}
                      </Label>
                      {canReorder ? (
                        <div className="flex shrink-0 items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-5 text-[#C4B8A8] hover:bg-transparent hover:text-[#8C7E72]"
                            disabled={index === 0}
                            onClick={() => moveTypeInCategory(category.id, index, "up")}
                            aria-label={`Move ${type.name} up in priority`}
                            title="Move up in priority"
                          >
                            <ChevronUp className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-5 text-[#C4B8A8] hover:bg-transparent hover:text-[#8C7E72]"
                            disabled={index === categoryTypes.length - 1}
                            onClick={() => moveTypeInCategory(category.id, index, "down")}
                            aria-label={`Move ${type.name} down in priority`}
                            title="Move down in priority"
                          >
                            <ChevronDown className="size-3" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {type.valueType === "yes_no" ? (
                      <div className="flex h-9 items-center gap-2 rounded-[6px] border border-[#CCCCCC] bg-white px-2.5">
                        <span className="text-[#8C7E72]">{icon}</span>
                        <Switch
                          checked={values[0] === "yes"}
                          onCheckedChange={(checked) => setValues(type.id, [checked ? "yes" : "no"])}
                        />
                        <span className="text-xs text-[#8C7E72]">{values[0] === "yes" ? "Yes" : "No"}</span>
                      </div>
                    ) : type.valueType === "multi" ? (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-[6px] border border-[#CCCCCC] bg-white px-2.5 py-1.5">
                        {activeOptions.map((option) => (
                          <label key={option.value} className="flex min-w-0 items-center gap-1.5 text-xs text-[#251605]">
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
                            <span className="truncate">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : type.valueType === "text" || type.valueType === "number" ? (
                      <IconInput
                        icon={icon}
                        type={type.valueType === "number" ? "number" : "text"}
                        value={values[0] ?? ""}
                        onChange={(event) => setValues(type.id, event.target.value ? [event.target.value] : [])}
                        placeholder={emptyLabel}
                        className="pl-8"
                      />
                    ) : (
                      <Select
                        value={values[0] || "__none"}
                        onValueChange={(value) => setValues(type.id, value === "__none" ? [] : [value])}
                      >
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[#8C7E72]">
                            {icon}
                          </span>
                          <SelectTrigger className={cn(MODAL_SELECT_TRIGGER_CLASS, "pl-8")}>
                            <SelectValue placeholder={emptyLabel} />
                          </SelectTrigger>
                        </div>
                        <SelectContent>
                          <SelectItem value="__none">{emptyLabel}</SelectItem>
                          {activeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {preferenceError ? <p className="mt-1 text-[11px] text-destructive">{preferenceError}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      </div>
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
      <section className="rounded-lg border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Employment & Source</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Position">
            <IconInput
              icon={<Briefcase className="size-3.5" />}
              value={draft.position}
              onChange={(event) => set("position", event.target.value)}
              placeholder="Position"
              className="pl-8"
            />
          </Field>
          <Field label="Department">
            <IconInput
              icon={<Building2 className="size-3.5" />}
              value={draft.department}
              onChange={(event) => set("department", event.target.value)}
              placeholder="Department"
              className="pl-8"
            />
          </Field>
          <Field label="Source of Business">
            <IconInput
              icon={<Compass className="size-3.5" />}
              value={draft.sourceOfBusiness}
              onChange={(event) => set("sourceOfBusiness", event.target.value)}
              placeholder="Source of business"
              className="pl-8"
            />
          </Field>
          <Field label="Employer / Company Name">
            <IconInput
              id="guest-create-company-name"
              icon={<Building className="size-3.5" />}
              value={companyName}
              onChange={(event) => handleCompanyChange(event.target.value)}
              placeholder="Employer or company"
              className="pl-8"
            />
          </Field>
        </div>
      </section>

      {/* Emergency Contacts */}
      <section className="rounded-lg border border-[#DDD4C5] bg-white p-5 shadow-sm">
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
                <IconInput
                  icon={<User className="size-3.5" />}
                  value={contact.name}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Contact name"
                  className="pl-8"
                />
              </Field>
              <Field label="Relationship">
                <IconInput
                  icon={<Users className="size-3.5" />}
                  value={contact.relationship}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, relationship: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Relationship"
                  className="pl-8"
                />
              </Field>
              <Field label="Phone">
                <CanonicalPhoneInput
                  value={contact.phone}
                  onChange={(phone) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, phone } : row,
                      ),
                    )
                  }
                  placeholder="Enter phone number"
                  containerClassName={PHONE_GROUP}
                  triggerClassName={PHONE_TRIGGER}
                  className={PHONE_INPUT}
                  popoverClassName="z-[90]"
                />
              </Field>
              <Field label="Email">
                <IconInput
                  icon={<Mail className="size-3.5" />}
                  value={contact.email}
                  onChange={(event) =>
                    set(
                      "emergencyContacts",
                      draft.emergencyContacts.map((row, i) =>
                        i === index ? { ...row, email: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Email"
                  className="pl-8"
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold text-[#251605]">Notes</h2>
        <div className="mt-3 space-y-3">
          <Field label="Profile Notes">
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Notes kept on the guest profile"
              className={MODAL_TEXTAREA_CLASS}
            />
          </Field>
          <Field label="Guest note">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] text-[#8C7E72]">
                <NotebookPen className="size-3.5" />
                Added to this guest when the profile is created.
              </p>
              <Textarea
                rows={2}
                value={draft.stagedNote}
                onChange={(event) => set("stagedNote", event.target.value)}
                placeholder="Optional note"
                className={MODAL_TEXTAREA_CLASS}
              />
            </div>
          </Field>
        </div>
      </section>
    </div>
  );
}

function reviewValue(value: string) {
  const trimmed = value.trim();
  return trimmed || "None";
}

function ReviewStep({
  draft,
  rules,
  completion,
  issues,
  customValues,
  dynamicFields,
  identityActive,
  documentTypes,
  preferenceTypes,
  activeSteps,
  onEdit,
}: {
  draft: GuestCreateDraft;
  rules: ReturnType<typeof createFieldRules>;
  completion: ReturnType<typeof guestCreateCompletion>;
  issues: Array<{ key: string; message: string; step: GuestCreateStepId }>;
  customValues: Record<string, unknown>;
  dynamicFields: ReturnType<typeof resolveGuestFieldRules>;
  identityActive: boolean;
  documentTypes: Array<{ id: string; name: string }>;
  preferenceTypes: Array<{
    id: string;
    name: string;
    options: Array<{ label: string; value: string }>;
  }>;
  activeSteps: ReturnType<typeof resolveGuestCreateSteps>;
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
                  {activeSteps.find((step) => step.id === item.step)?.title}: {item.message}
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
          rows: [
            ["Name", guestDisplayName(draft) || "—"],
            ["Gender", draft.gender === "unspecified" ? "Prefer not to say" : draft.gender === "male" ? "Male" : draft.gender === "female" ? "Female" : "—"],
            ["Nationality", nationalityValueForStored(draft.nationality) || "—"],
            ["Profile type", "Individual Guest"],
            ["VIP", draft.vipStatus ? "Yes" : "No"],
          ],
        },
        {
          title: "Contact & Address",
          step: "basic" as GuestCreateStepId,
          rows: [
            ["Phone", draft.phone || "—"],
            ["Email", draft.email || "—"],
            ["Country", draft.country || "—"],
            ["City", draft.city || "—"],
          ],
        },
        ...(identityActive
          ? [
              {
                title: "Identity Documents",
                step: "identity" as GuestCreateStepId,
                rows: draft.documents.length
                  ? draft.documents.map((document, index) => {
                      const typeName =
                        documentTypes.find((type) => type.id === document.idTypeId)?.name || "Identity document";
                      const detail = [
                        document.documentNumber.trim(),
                        document.expiryDate.trim() ? `Expires ${document.expiryDate.trim()}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return [
                        draft.documents.length > 1 ? `Document ${index + 1}` : "Identity document",
                        reviewValue([typeName, detail].filter(Boolean).join(" · ")),
                      ];
                    })
                  : [["Identity document", "None"]],
              },
            ]
          : []),
        {
          title: "Preferences",
          step: "preferences" as GuestCreateStepId,
          rows: (() => {
            const answered = draft.preferenceAnswers.filter((answer) => answer.values.some((value) => value.trim()));
            if (answered.length === 0) return [["Preferences", "None"]];
            return answered.map((answer) => {
              const type = preferenceTypes.find((row) => row.id === answer.typeId);
              const labels = answer.values
                .filter((value) => value.trim())
                .map((value) => {
                  if (value === "yes") return "Yes";
                  if (value === "no") return "No";
                  return type?.options.find((option) => option.value === value)?.label || value;
                });
              return [type?.name || "Preference", reviewValue(labels.join(", "))];
            });
          })(),
        },
        {
          title: "Business & Membership",
          step: "business" as GuestCreateStepId,
          rows: draft.links.length
            ? draft.links.map((row) => [
                GUEST_RELATIONSHIP_ROLE_LABELS[row.role] ?? "Relationship",
                reviewValue(row.masterName),
              ])
            : [["Relationships", "None"]],
        },
        {
          title: "Employment & Source",
          step: "additional" as GuestCreateStepId,
          rows: [
            ["Employer / Company Name", reviewValue(companyName)],
            ["Position", reviewValue(draft.position)],
            ["Department", reviewValue(draft.department)],
            ["Source of Business", reviewValue(draft.sourceOfBusiness)],
          ],
        },
        {
          title: "Emergency Contacts & Notes",
          step: "additional" as GuestCreateStepId,
          rows: [
            [
              "Emergency contacts",
              reviewValue(
                draft.emergencyContacts
                  .filter((contact) => contact.name.trim() || contact.phone.trim() || contact.email.trim())
                  .map((contact) =>
                    [contact.name, contact.relationship, contact.phone, contact.email].filter((part) => part.trim()).join(" · "),
                  )
                  .join("; "),
              ),
            ],
            ["Profile notes", reviewValue(draft.notes)],
            ["Guest note", reviewValue(draft.stagedNote)],
          ],
        },
      ].map(({ title, step: sectionStep, rows }) => (
        <section key={title} className="rounded-lg border border-[#DDD4C5] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-[#E8DFD0] pb-2">
            <h3 className="font-display text-sm font-semibold text-[#251605]">{title}</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] font-medium text-[#8C7E72] hover:bg-[#F7F4EE] hover:text-[#251605]"
              onClick={() => onEdit(sectionStep)}
            >
              Edit
            </Button>
          </div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {rows.map(([label, value], index) => (
              <div key={`${label}-${index}`} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#756A5B]">{label}</dt>
                <dd className="text-sm text-[#251605]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="text-[11px] text-muted-foreground">
        {rules.filter((rule) => rule.required).length} required field rule(s) verified from Property Setup.
      </p>
    </div>
  );
}
