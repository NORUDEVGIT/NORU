import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
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
  emptyAccountCreateContact,
  emptyGuestTravelAgentCreateDraft,
  filled,
  generateAgencyCode,
  guestTravelAgentCreateCompletion,
  guestTravelAgentCreateHasChanges,
  optionLabel,
  primaryTravelAgentContact,
  readGuestTravelAgentCreateHold,
  travelAgentCreateDraftErrorsForSave,
  travelAgentCreateFieldIssues,
  writeGuestTravelAgentCreateHold,
  type GuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateStepId,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import {
  deleteTravelAgentCreateDraft,
  getTravelAgentCreateContext,
  persistTravelAgentCreate,
  saveTravelAgentCreateDraft,
  type TravelAgentCreateContext,
} from "@/packages/pms/lib/guest-travel-agent-create.functions";
import { getGuestAccount, type GuestAccountProfile } from "@/packages/pms/lib/guest-accounts.functions";
import { BasicInfoStep } from "./guest-travel-agency-basic-info-step";

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

  const context = useQuery({
    queryKey: ["travel-agent-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      if (currentAgency) {
        setDraft(agencyProfileToCreateDraft(currentAgency));
        setStep("basic_info");
        setDefaultsApplied(true);
      }
      return;
    }
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
  }, [context.data, currentAgency, defaultsApplied, isEdit, open, restaurantId]);

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

  const catalogues = context.data?.catalogues;
  const catalogueIds = {
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
    return fieldIssues.find((issue) => issue.key === key)?.message;
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
      setCreated({ id: result.id!, name: draft.name, code: draft.code || null });
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
      performClose();
    }
  }

  function performClose() {
    if (!created) writeGuestTravelAgentCreateHold(restaurantId, { step, draft });
    if (!created && guestTravelAgentCreateHasChanges(draft)) {
      toast.success(GUEST_TRAVEL_AGENT_CREATE_PROGRESS_KEPT);
    }
    handleActualClose();
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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleCloseRequest();
          else onOpenChange(true);
        }}
      >
        <DialogContent
          data-testid="guest-travel-agency-create-modal"
          aria-describedby="travel-agency-create-dialog-description"
          onPointerDownOutside={(e) => {
            if (hasNestedModalLayer()) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (hasNestedModalLayer()) return;
            e.preventDefault();
            handleCloseRequest();
          }}
          className={cn(
            "flex flex-col gap-0 p-0 border-[#DDD4C5] bg-[#F7F4EE] shadow-2xl rounded-2xl overflow-hidden",
            "w-[min(98vw,1550px)] max-w-none h-[min(92vh,960px)]",
            "[&>button]:hidden",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#EDE6D8] bg-white px-7 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#C89933]/15 text-[#8A641A]">
                <Building2 className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-sans text-xl font-semibold tracking-tight text-[#251605]">
                  {isEdit ? `Edit Travel Agency — ${draft.name || "Agency"}` : GUEST_TRAVEL_AGENT_CREATE_TITLE}
                </DialogTitle>
                <DialogDescription
                  id="travel-agency-create-dialog-description"
                  className="font-sans text-xs text-[#756A5B]"
                >
                  {isEdit
                    ? "Update travel agency profile and save changes directly."
                    : GUEST_TRAVEL_AGENT_CREATE_COPY}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseRequest}
                className="size-8 rounded-full text-[#756A5B] hover:bg-[#F2ECE1] hover:text-[#251605]"
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Stepper Navigation */}
          <div className="border-b border-[#EDE6D8] bg-[#FDFBF7] px-7 py-3">
            <nav
              data-testid="guest-travel-agency-create-stepper"
              className="flex items-center gap-1.5 overflow-x-auto text-xs"
            >
              {GUEST_TRAVEL_AGENT_CREATE_STEPS.map((item, index) => {
                const current = item.id === step;
                const done = index < stepIndex;
                const invalid =
                  fieldIssues.some((issue) => issue.step === item.id) &&
                  (attemptedSteps.has(item.id) || attemptedSteps.has("review"));

                return (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => go(item.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full px-3.5 py-1.5 font-medium transition-colors whitespace-nowrap",
                        current && "bg-[#C89933] text-[#251605] font-semibold shadow-sm",
                        done && !invalid && "border border-[#C89933]/40 bg-white text-[#8A641A] hover:bg-[#FAF8F5]",
                        !current && !done && !invalid && "border border-[#E6E1D8] bg-white text-[#756A5B] hover:bg-[#FAF8F5]",
                        invalid && "border border-destructive bg-destructive/10 text-destructive font-semibold",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full text-[10px]",
                          current && "bg-[#251605] text-[#C89933]",
                          done && !invalid && "bg-[#C89933] text-white",
                          !current && !done && !invalid && "bg-[#E6E1D8] text-[#756A5B]",
                          invalid && "bg-destructive text-white",
                        )}
                      >
                        {done && !invalid ? <Check className="size-2.5 stroke-[3]" /> : item.number}
                      </span>
                      <span>{item.title}</span>
                    </button>
                    {index < GUEST_TRAVEL_AGENT_CREATE_STEPS.length - 1 ? (
                      <span className="text-[#C5BCAE] select-none">/</span>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Body Content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Main Form Scrollable Area */}
            <div className="flex-1 overflow-y-auto px-7 py-5">
              <div className="mx-auto max-w-4xl space-y-4">
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
                      <BasicInfoStep draft={draft} set={set} catalogues={catalogues} fieldError={fieldError} />
                    ) : null}
                    {step === "billing" ? (
                      <BillingStep draft={draft} set={set} catalogues={catalogues} fieldError={fieldError} />
                    ) : null}
                    {step === "review" ? (
                      <ReviewStep
                        draft={draft}
                        catalogues={catalogues}
                        issues={fieldIssues}
                        onEdit={go}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Right-side Preview & Guidance Panel */}
            <aside className="w-80 border-l border-[#EDE6D8] bg-[#FAF8F5] overflow-y-auto p-5 space-y-4 hidden lg:block">
              {/* Profile Preview Card */}
              <div
                data-testid="travel-agency-create-profile-preview"
                className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
                  <Building2 className="size-3.5" />
                  <span>Travel Agency Preview</span>
                </div>
                <div className="mt-3 space-y-2 border-t border-[#EDE6D8] pt-3 text-xs">
                  <div>
                    <span className="text-[#756A5B]">Agency Name:</span>
                    <p className="font-semibold text-[#251605] break-words">{draft.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Agency Code:</span>
                    <p className="font-mono font-medium text-[#251605]">{draft.code || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Profile Type:</span>
                    <p className="font-medium text-[#251605]">Travel Agency (TRA)</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Agency Type:</span>
                    <p className="font-medium text-[#251605]">
                      {agencyTypeLabel(draft.agencyType) || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Status:</span>
                    <p className="font-medium text-[#251605]">
                      {draft.accountStatus === "inactive" ? "Inactive" : "Active"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Primary Contact:</span>
                    <p className="font-medium text-[#251605] break-words">
                      {primary?.name ? `${primary.name}${primary.email ? ` · ${primary.email}` : ""}` : "—"}
                    </p>
                  </div>
                  {draft.iataLicenseNumber ? (
                    <div>
                      <span className="text-[#756A5B]">Licence #:</span>
                      <p className="font-medium text-[#251605]">{draft.iataLicenseNumber}</p>
                    </div>
                  ) : null}
                  {draft.taxId ? (
                    <div>
                      <span className="text-[#756A5B]">TIN #:</span>
                      <p className="font-medium text-[#251605]">{draft.taxId}</p>
                    </div>
                  ) : null}
                  {draft.city || draft.country ? (
                    <div>
                      <span className="text-[#756A5B]">Location:</span>
                      <p className="font-medium text-[#251605]">
                        {[draft.city, draft.country].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Data Completion Card */}
              <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#251605]">Data Completion</span>
                  <span className="text-xs font-bold text-[#8A641A]">{completion.percent}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EAE4D7]">
                  <div
                    className="h-full bg-[#C89933] transition-all duration-300"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-[#756A5B]">
                  {completion.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={() => go(item.step)}
                      >
                        {item.label}
                      </button>
                      <span
                        className={cn(
                          "font-mono text-[11px]",
                          item.requiredRemaining
                            ? "text-destructive font-bold"
                            : item.complete
                              ? "text-emerald-700"
                              : "text-[#A89F91]",
                        )}
                      >
                        {item.requiredRemaining ? "Required" : item.complete ? "✓" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Step Guidance Card */}
              <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none text-xs space-y-2">
                <span className="font-semibold text-[#251605] uppercase tracking-wider text-[11px]">
                  Step Guidance
                </span>
                <p className="text-[#756A5B] leading-relaxed">
                  {step === "basic_info"
                    ? "Enter legal identification, agency classification, contacts, address location, and market segmentation."
                    : step === "billing"
                      ? "Configure contracted rates, billing arrangements, credit allowance, and commission plan terms."
                      : "Verify all agency master information before completing creation and publishing the account."}
                </p>
                <div className="pt-2 border-t border-[#EDE6D8] text-[11px] text-[#A89F91]">
                  Property Setup Controlled
                </div>
              </div>
            </aside>
          </div>

          {/* Sticky Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDE6D8] bg-white px-7 py-3.5">
            {isEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleActualClose}
                  className="border-[#DDD4C5] text-xs text-[#251605]"
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold text-xs shadow-sm"
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                    data-testid="edit-travel-agency-save-btn"
                  >
                    {saveEditMutation.isPending ? "Saving Changes…" : "Save Changes"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseRequest}
                    className="text-xs text-[#756A5B] hover:text-[#251605]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="travel-agency-create-start-over"
                    onClick={() => setStartOverOpen(true)}
                    disabled={!guestTravelAgentCreateHasChanges(draft)}
                    className="text-xs border-[#DDD4C5] text-[#756A5B] hover:bg-[#FAF8F5]"
                  >
                    {GUEST_TRAVEL_AGENT_CREATE_START_OVER}
                  </Button>
                  {holdState === "saving" ? (
                    <span className="text-xs text-[#8A641A] font-medium ml-2">Saving progress…</span>
                  ) : null}
                  {holdState === "saved" && guestTravelAgentCreateHasChanges(draft) ? (
                    <span className="text-xs text-[#756A5B] ml-2">Progress saved</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="travel-agency-create-save-draft"
                    onClick={() => draftMutation.mutate()}
                    disabled={draftMutation.isPending || completeMutation.isPending}
                    className="text-xs border-[#C89933]/50 text-[#8A641A] hover:bg-[#FAF8F5]"
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={stepIndex === 0}
                    onClick={() => go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex - 1].id)}
                    className="text-xs border-[#DDD4C5] text-[#251605] hover:bg-[#FAF8F5]"
                  >
                    ← Back
                  </Button>

                  {step === "review" ? (
                    <Button
                      type="button"
                      size="sm"
                      data-testid="create-travel-agency-final"
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold text-xs shadow-sm"
                    >
                      {completeMutation.isPending ? "Creating Travel Agency…" : "Create Travel Agency"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (validateCurrent()) go(GUEST_TRAVEL_AGENT_CREATE_STEPS[stepIndex + 1].id);
                      }}
                      className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-medium text-xs shadow-sm"
                    >
                      Next <ChevronRight className="ml-1 size-3.5" />
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
        <AlertDialogContent className="border-[#DDD4C5] bg-[#F7F4EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#251605]">Discard new travel agency?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#756A5B]">
              You have unsaved changes. Closing will keep your progress stored as a draft, but you can discard it if preferred.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-[#DDD4C5] text-xs text-[#251605]"
              onClick={() => setDiscardConfirmOpen(false)}
            >
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] text-xs font-semibold"
              onClick={() => {
                setDiscardConfirmOpen(false);
                performClose();
              }}
            >
              Close & Keep Progress
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start Over Confirmation Dialog */}
      <AlertDialog open={startOverOpen} onOpenChange={setStartOverOpen}>
        <AlertDialogContent className="border-[#DDD4C5] bg-[#F7F4EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#251605]">
              {GUEST_TRAVEL_AGENT_CREATE_START_OVER}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#756A5B]">
              {GUEST_TRAVEL_AGENT_CREATE_START_OVER_COPY}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-[#DDD4C5] text-xs text-[#251605]"
              onClick={() => setStartOverOpen(false)}
            >
              Keep Progress
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={startOverMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90 text-xs font-semibold"
              onClick={() => startOverMutation.mutate()}
            >
              {startOverMutation.isPending ? "Clearing…" : GUEST_TRAVEL_AGENT_CREATE_START_OVER}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Commercial Defaults & Contracts</h2>
          <p className="text-xs text-[#756A5B]">Setup contracted rate plans, booking arrangements, and credit limit.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Default rate plan">
            <ModalSelect
              value={draft.ratePlanId}
              onChange={(val) => set("ratePlanId", val)}
              options={catalogues?.ratePlans ?? []}
              placeholder="Select rate plan"
            />
          </ModalField>

          <ModalField label="Default package">
            <ModalSelect
              value={draft.packageId}
              onChange={(val) => set("packageId", val)}
              options={catalogues?.packages ?? []}
              placeholder="Select package"
            />
          </ModalField>

          <ModalField label="Default meal plan">
            <ModalSelect
              value={draft.mealPlanId}
              onChange={(val) => set("mealPlanId", val)}
              options={catalogues?.mealPlans ?? []}
              placeholder="Select meal plan"
            />
          </ModalField>

          <ModalField label="Contract reference">
            <Input
              value={draft.contractReference}
              onChange={(e) => set("contractReference", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Reference number"
            />
          </ModalField>

          <ModalField label="Contract start" error={fieldError("contractStartDate", "billing")}>
            <Input
              type="date"
              value={draft.contractStartDate}
              onChange={(e) => set("contractStartDate", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Contract end" error={fieldError("contractEndDate", "billing")}>
            <Input
              type="date"
              value={draft.contractEndDate}
              onChange={(e) => set("contractEndDate", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Billing arrangement" error={fieldError("billingArrangement", "billing")}>
            <ModalSelect
              value={draft.billingArrangement}
              onChange={(val) => set("billingArrangement", val)}
              options={ACCOUNT_BILLING_ARRANGEMENTS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select arrangement"
            />
          </ModalField>

          <ModalField label="Payment method" error={fieldError("paymentMethodId", "billing")}>
            <ModalSelect
              value={draft.paymentMethodId}
              onChange={(val) => set("paymentMethodId", val)}
              options={catalogues?.paymentMethods ?? []}
              placeholder="Select payment method"
            />
          </ModalField>

          <ModalField label="Currency" error={fieldError("currency", "billing")}>
            <ModalSelect
              value={draft.currency}
              onChange={(val) => set("currency", val)}
              options={(catalogues?.currencies ?? []).map((code) => ({ id: code, name: code }))}
              placeholder="Property currency"
            />
          </ModalField>

          <ModalField label="Billing contact">
            <Input
              value={draft.billingContactName}
              onChange={(e) => set("billingContactName", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Invoice recipient"
            />
          </ModalField>

          <ModalField label="Credit limit amount" error={fieldError("creditLimitAmount", "billing")}>
            <Input
              type="number"
              min={0}
              value={draft.creditLimitAmount}
              onChange={(e) => set("creditLimitAmount", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="0.00"
            />
          </ModalField>

          <ModalField label="Credit limit note">
            <Input
              value={draft.creditLimitNote}
              onChange={(e) => set("creditLimitNote", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. 30-day payment term"
            />
          </ModalField>
        </div>

        <div className="pt-2 border-t border-[#EDE6D8] space-y-1 text-[11px] text-[#756A5B]">
          <p>{TRAVEL_AGENT_CREATE_CONTRACT_COPY}</p>
          <p>{TRAVEL_AGENT_CREATE_CREDIT_COPY}</p>
        </div>
      </div>

      {/* Commission Configuration Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#251605]">Commission Plan</h2>
            <p className="text-xs text-[#756A5B]">{TA_COMMISSION_REFERENCE_COPY}</p>
          </div>
          <Switch
            checked={draft.commissionEnabled}
            onCheckedChange={(checked) => set("commissionEnabled", Boolean(checked))}
          />
        </div>

        {draft.commissionEnabled ? (
          <div className="grid gap-3 pt-3 border-t border-[#EDE6D8] sm:grid-cols-2">
            <ModalField label="Commission type" error={fieldError("commissionType", "billing")}>
              <ModalSelect
                value={draft.commissionType}
                onChange={(val) => set("commissionType", val)}
                options={TA_COMMISSION_PLAN_TYPES.map((id) => ({ id, name: id === "percent" ? "Percent (%)" : "Fixed Amount" }))}
                placeholder="Select type"
              />
            </ModalField>

            <ModalField label="Commission value" error={fieldError("commissionValue", "billing")}>
              <Input
                type="number"
                min={0}
                value={draft.commissionValue}
                onChange={(e) => set("commissionValue", e.target.value)}
                className={MODAL_CONTROL_CLASS}
                placeholder={draft.commissionType === "percent" ? "e.g. 10 (%)" : "e.g. 25.00"}
              />
            </ModalField>

            <ModalField label="Currency">
              <Input
                value={draft.commissionCurrency}
                onChange={(e) => set("commissionCurrency", e.target.value.toUpperCase())}
                className={MODAL_CONTROL_CLASS}
                placeholder="ISO currency (e.g. USD)"
              />
            </ModalField>

            <ModalField label="Effective on">
              <Input
                type="date"
                value={draft.commissionEffectiveOn}
                onChange={(e) => set("commissionEffectiveOn", e.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </ModalField>

            <ModalField label="Expires on">
              <Input
                type="date"
                value={draft.commissionExpiresOn}
                onChange={(e) => set("commissionExpiresOn", e.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </ModalField>

            <ModalField label="Commission notes">
              <Input
                value={draft.commissionNotes}
                onChange={(e) => set("commissionNotes", e.target.value)}
                className={MODAL_CONTROL_CLASS}
                placeholder="Rate code eligibility, booking window rules..."
              />
            </ModalField>
          </div>
        ) : null}
      </div>
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

      <ReviewCard title="Basic Info & Contacts" onEdit={() => onEdit("basic_info")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Agency Name:</span> <span className="font-medium text-[#251605]">{draft.name || "—"}</span></div>
          <div><span className="text-[#756A5B]">Type:</span> <span className="font-medium text-[#251605]">{agencyTypeLabel(draft.agencyType) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Code:</span> <span className="font-medium text-[#251605]">{draft.code || "—"}</span></div>
          <div><span className="text-[#756A5B]">Status:</span> <span className="font-medium text-[#251605]">{draft.accountStatus === "inactive" ? "Inactive" : "Active"}</span></div>
          <div><span className="text-[#756A5B]">Licence #:</span> <span className="font-medium text-[#251605]">{draft.iataLicenseNumber || "—"}</span></div>
          <div><span className="text-[#756A5B]">TIN #:</span> <span className="font-medium text-[#251605]">{draft.taxId || "—"}</span></div>
          <div><span className="text-[#756A5B]">Location:</span> <span className="font-medium text-[#251605]">{[draft.addressLine1, draft.city, draft.country].filter(Boolean).join(", ") || "—"}</span></div>
          <div><span className="text-[#756A5B]">Primary Contact:</span> <span className="font-medium text-[#251605]">{primary?.name ? `${primary.name}${primary.position ? ` (${primary.position})` : ""}` : "—"}</span></div>
          <div><span className="text-[#756A5B]">Market Segment:</span> <span className="font-medium text-[#251605]">{optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Source:</span> <span className="font-medium text-[#251605]">{draft.sourceOfBusiness || optionLabel(catalogues?.sourceCodes ?? [], draft.sourceCodeId) || "—"}</span></div>
        </div>
      </ReviewCard>

      <ReviewCard title="Commercial & Billing" onEdit={() => onEdit("billing")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Billing Arrangement:</span> <span className="font-medium text-[#251605]">{billingArrangementLabel(draft.billingArrangement) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Payment Method:</span> <span className="font-medium text-[#251605]">{optionLabel(catalogues?.paymentMethods ?? [], draft.paymentMethodId) || "—"}</span></div>
          <div><span className="text-[#756A5B]">Credit Limit:</span> <span className="font-medium text-[#251605]">{draft.creditLimitAmount ? `${draft.creditLimitAmount} ${draft.currency}` : "—"}</span></div>
          <div><span className="text-[#756A5B]">Commission:</span> <span className="font-medium text-[#251605]">{draft.commissionEnabled ? `${draft.commissionType === "percent" ? `${draft.commissionValue}%` : `${draft.commissionValue} ${draft.commissionCurrency}`} (${draft.commissionType})` : "Disabled"}</span></div>
          <div><span className="text-[#756A5B]">Contract Ref:</span> <span className="font-medium text-[#251605]">{draft.contractReference || "—"}</span></div>
          <div><span className="text-[#756A5B]">Default Rate Plan:</span> <span className="font-medium text-[#251605]">{optionLabel(catalogues?.ratePlans ?? [], draft.ratePlanId) || "—"}</span></div>
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
