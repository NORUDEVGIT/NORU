import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  Plus,
  Trash2,
  Users,
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
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
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
  groupCreateDraftErrorsForSave,
  groupCreateFieldIssues,
  groupCreateMemberCounts,
  groupCreateNights,
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
import { formatCreateIssuesByStep, issuesBeforeStep } from "@/packages/pms/lib/guest-create-step-issues";
import { applyGroupTemplateToDraft, GROUP_TEMPLATE_COPY, listGroupTemplates } from "@/packages/pms/lib/guest-group-templates";
import { getGroupDetailWorkspace } from "@/packages/pms/lib/guest-group-detail.functions";
import { CanonicalPhoneInput } from "@/packages/pms/components/guests/canonical-phone-input";

const MODAL_CONTROL_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933] justify-between";

function groupDetailToDraft(group: any): GuestGroupCreateDraft {
  const base = emptyGuestGroupCreateDraft();
  let members: any[] = [];
  if (Array.isArray(group.members)) {
    members = group.members.map((m: any) => ({
      key: m.key ?? m.id ?? Math.random().toString(),
      id: m.id ?? null,
      guestId: m.guestId ?? null,
      guestName: m.guestName ?? m.name ?? "",
      firstName: m.firstName ?? "",
      lastName: m.lastName ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      roomTypeId: m.roomTypeId ?? "",
      ratePlanId: m.ratePlanId ?? "",
      departureDate: m.departureDate ?? "",
      notes: m.notes ?? "",
      specialRequests: m.specialRequests ?? "",
      isLeader: Boolean(m.isLeader),
    }));
  }
  const ops = group.groupOperations ?? group.group_operations ?? {};
  return {
    ...base,
    groupId: group.id,
    code: group.code ?? "",
    codeManual: Boolean(group.code),
    name: group.name ?? "",
    groupTypeId: group.groupTypeId ?? group.group_type_id ?? "",
    marketSegmentId: group.marketSegmentId ?? group.market_segment_id ?? "",
    companyMasterId: group.companyMasterId ?? group.company_master_id ?? "",
    companyMasterName: group.companyMasterName ?? "",
    travelAgentMasterId: group.travelAgentMasterId ?? group.travel_agent_master_id ?? "",
    travelAgentMasterName: group.travelAgentMasterName ?? "",
    primaryContactGuestId: group.primaryContactGuestId ?? group.primary_contact_guest_id ?? "",
    primaryContactName: group.primaryContactName ?? group.primary_contact_name ?? "",
    contactEmail: group.email ?? group.contactEmail ?? "",
    contactPhone: group.phone ?? group.contactPhone ?? "",
    notes: group.notes ?? "",
    specialRequests: group.specialRequests ?? group.special_requests ?? "",
    arrivalDate: group.arrivalDate ?? group.arrival_date ?? "",
    departureDate: group.departureDate ?? group.departure_date ?? "",
    expectedPax: group.expectedPax != null ? String(group.expectedPax) : (group.expected_pax != null ? String(group.expected_pax) : ""),
    expectedRooms: group.expectedRooms != null ? String(group.expectedRooms) : (group.expected_rooms != null ? String(group.expected_rooms) : ""),
    sourceCodeId: group.sourceCodeId ?? group.source_code_id ?? "",
    channelId: group.channelId ?? group.channel_id ?? "",
    members,
    arrivalTime: ops.arrivalTime ?? "",
    departureTime: ops.departureTime ?? "",
    arrivalMethod: ops.arrivalMethod ?? "",
    arrivalFrom: ops.arrivalFrom ?? "",
    arrivalTo: ops.arrivalTo ?? "",
    departureMethod: ops.departureMethod ?? "",
    departureTo: ops.departureTo ?? "",
    destinations: Array.isArray(ops.destinations) ? ops.destinations : [],
    stayNotes: ops.stayNotes ?? "",
    roomNeeds: Array.isArray(ops.roomNeeds) ? ops.roomNeeds : [],
    ratePlanId: ops.ratePlanId ?? group.ratePlanId ?? "",
    packageId: ops.packageId ?? group.packageId ?? "",
    mealPlanId: ops.mealPlanId ?? group.mealPlanId ?? "",
    currency: ops.currency ?? group.currency ?? "",
    paymentMethodId: ops.paymentMethodId ?? group.paymentMethodId ?? "",
    billingArrangement: ops.billingArrangement ?? group.billingArrangement ?? "",
    depositRequired: Boolean(ops.depositRequired),
    depositAmount: ops.depositAmount != null ? String(ops.depositAmount) : "",
    depositPercent: ops.depositPercent != null ? String(ops.depositPercent) : "",
    depositDueDate: ops.depositDueDate ?? "",
    balanceDueDate: ops.balanceDueDate ?? "",
    paymentTerms: ops.paymentTerms ?? group.paymentTerms ?? "",
  };
}

export function GuestGroupCreateModal({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
  onCancel,
  mode = "create",
  groupId = null,
  group = null,
  onSaved,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
  mode?: "create" | "edit";
  groupId?: string | null;
  group?: any | null;
  onSaved?: (groupId: string) => void;
}) {
  const isEdit = mode === "edit" || Boolean(groupId) || Boolean(group);
  const queryClient = useQueryClient();
  const load = useServerFn(getGroupCreateContext);
  const fetchGroupWorkspace = useServerFn(getGroupDetailWorkspace);
  const saveDraftHold = useServerFn(saveGroupCreateDraft);
  const clearDraft = useServerFn(deleteGroupCreateDraft);
  const persist = useServerFn(persistGroupCreate);
  const searchPartners = useServerFn(searchGroupPartners);
  const searchGuests = useServerFn(searchGuestsForGroup);
  const loadCredit = useServerFn(loadGroupCreateCredit);

  const groupQuery = useQuery({
    queryKey: ["group-detail", restaurantId, groupId],
    queryFn: () => fetchGroupWorkspace({ data: { restaurantId, groupId: groupId! } }),
    enabled: open && isEdit && Boolean(groupId) && !group,
    retry: false,
  });
  const currentGroup = group ?? groupQuery.data?.group ?? null;

  const localHold = useMemo(() => (!isEdit && open ? readGuestGroupCreateHold(restaurantId) : null), [isEdit, open, restaurantId]);
  const [step, setStep] = useState<GuestGroupCreateStepId>(() => localHold?.step ?? "details");
  const [draft, setDraft] = useState<GuestGroupCreateDraft>(() => {
    if (isEdit && currentGroup) return groupDetailToDraft(currentGroup);
    return localHold?.draft ?? emptyGuestGroupCreateDraft();
  });
  const [defaultsApplied, setDefaultsApplied] = useState(() => Boolean(localHold) || (isEdit && Boolean(currentGroup)));
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [holdState, setHoldState] = useState<"idle" | "saving" | "saved">(localHold ? "saved" : "idle");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<string>>(new Set());

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
    enabled: open,
  });

  const context = useQuery({
    queryKey: ["group-create-context", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      if (currentGroup) {
        setDraft(groupDetailToDraft(currentGroup));
        setStep("details");
        setDefaultsApplied(true);
      }
      return;
    }
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
  }, [context.data, currentGroup, defaultsApplied, isEdit, open, restaurantId]);

  useEffect(() => {
    if (isEdit || !open || !defaultsApplied || created) return;
    writeGuestGroupCreateHold(restaurantId, { step, draft });
  }, [created, defaultsApplied, isEdit, open, restaurantId, step, draft]);

  useEffect(() => {
    if (isEdit || !open || !defaultsApplied || created) return;
    if (!guestGroupCreateHasChanges(draft)) return;
    setHoldState("saving");
    const handle = window.setTimeout(() => {
      void saveDraftHold({ data: { restaurantId, payload: { step, draft } as never } })
        .then(() => setHoldState("saved"))
        .catch(() => setHoldState("idle"));
    }, GUEST_GROUP_CREATE_HOLD_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [created, defaultsApplied, draft, isEdit, open, restaurantId, saveDraftHold, step]);

  const catalogues = context.data?.catalogues;
  const companiesQuery = useQuery({
    queryKey: ["group-create-companies", restaurantId, companyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "company", q: companyQuery } }),
    enabled: open && (step === "details" || step === "review"),
  });
  const agenciesQuery = useQuery({
    queryKey: ["group-create-agencies", restaurantId, agencyQuery],
    queryFn: () => searchPartners({ data: { restaurantId, accountType: "travel_agent", q: agencyQuery } }),
    enabled: open && (step === "details" || step === "review"),
  });
  const contactsQuery = useQuery({
    queryKey: ["group-create-contacts", restaurantId, contactQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: contactQuery } }),
    enabled: open && step === "details",
  });
  const guestsQuery = useQuery({
    queryKey: ["group-create-guests", restaurantId, guestQuery],
    queryFn: () => searchGuests({ data: { restaurantId, q: guestQuery } }),
    enabled: open && step === "guests",
  });
  const creditMasterId = draft.companyMasterId || draft.travelAgentMasterId;
  const creditQuery = useQuery({
    queryKey: ["group-create-credit", restaurantId, creditMasterId],
    queryFn: () => loadCredit({ data: { restaurantId, masterId: creditMasterId } }),
    enabled: open && Boolean(creditMasterId) && (step === "billing" || step === "review"),
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

  const fieldIssues = groupCreateFieldIssues(draft, catalogueIds);

  function markAttempted(...ids: string[]) {
    setAttemptedSteps((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function fieldError(key: string, stepId: GuestGroupCreateStepId = step) {
    if (!attemptedSteps.has(stepId) && !attemptedSteps.has("review")) return undefined;
    return fieldIssues.find((issue) => issue.key === key)?.message;
  }

  function set<K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function go(next: GuestGroupCreateStepId) {
    if (isEdit) {
      setStep(next);
      return;
    }
    const blockers = issuesBeforeStep(fieldIssues, GUEST_GROUP_CREATE_STEPS, next);
    if (blockers.length) {
      markAttempted(step, ...blockers.map((issue) => issue.step));
      toast.error(formatCreateIssuesByStep(blockers, GUEST_GROUP_CREATE_STEPS));
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
      toast.error(formatCreateIssuesByStep(current, GUEST_GROUP_CREATE_STEPS));
      return false;
    }
    if (step === "guests" && counts.expected > 0 && counts.registered !== counts.expected) {
      toast.message(`Registered members (${counts.registered}) differ from expected guests (${counts.expected}). You can continue.`);
    }
    return true;
  }

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!draft.name?.trim()) throw new Error("Group name is required.");
      if (!draft.groupTypeId) throw new Error("Group type is required.");
      const targetId = groupId ?? currentGroup?.id ?? draft.groupId;
      const payloadDraft = { ...draft, groupId: targetId };
      const saved = await persist({ data: { restaurantId, draft: payloadDraft } });
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      void queryClient.invalidateQueries({ queryKey: ["guest-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["group-accounts"] });
      const targetId = groupId ?? currentGroup?.id ?? draft.groupId ?? result.id;
      void queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, targetId] });
      toast.success("Group updated successfully.");
      onOpenChange(false);
      onSaved?.(targetId ?? "");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
      if (fieldIssues.length) {
        markAttempted("review", ...fieldIssues.map((issue) => issue.step));
        const first = fieldIssues[0];
        if (first) setStep(first.step);
        throw new Error(formatCreateIssuesByStep(fieldIssues, GUEST_GROUP_CREATE_STEPS));
      }
      const saved = await persist({ data: { restaurantId, draft } });
      clearGuestGroupCreateHold(restaurantId);
      await clearDraft({ data: { restaurantId } }).catch(() => undefined);
      return saved;
    },
    onSuccess: (result) => {
      invalidateGuestWorkspaceQueries(queryClient, restaurantId);
      toast.success("Group created.");
      setCreated({ id: result.id, name: draft.name, code: result.code || draft.code || null });
      if (onCreated) {
        onCreated(result.id);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function resetForm() {
    const next = emptyGuestGroupCreateDraft();
    if (context.data?.defaultCurrency) next.currency = context.data.defaultCurrency;
    setDraft(next);
    setStep("details");
    setHoldState("idle");
    setCreated(null);
    setAttemptedSteps(new Set());
    setImportCsv("");
    setMemberDraft(emptyGroupCreateMember());
    setTemplateId("");
    clearGuestGroupCreateHold(restaurantId);
  }

  const startOverMutation = useMutation({
    mutationFn: () => clearDraft({ data: { restaurantId } }),
    onSettled: () => {
      resetForm();
      setStartOverOpen(false);
      queryClient.setQueryData(["group-create-context", restaurantId], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...(current as Record<string, unknown>), draft: null };
      });
      toast.success("Form reset to blank.");
    },
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
    if (guestGroupCreateHasChanges(draft) && !created) {
      setDiscardConfirmOpen(true);
    } else {
      handleActualClose();
    }
  }

  function handleConfirmDiscard() {
    setDiscardConfirmOpen(false);
    if (!created && guestGroupCreateHasChanges(draft)) {
      writeGuestGroupCreateHold(restaurantId, { step, draft });
      toast.success(GUEST_GROUP_CREATE_PROGRESS_KEPT);
    }
    handleActualClose();
  }

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

  const isSavingDraft = draftMutation.isPending || holdMutation.isPending;
  const isCompleting = completeMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={handleCloseRequest}>
        <DialogContent
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(98vw,1550px)] h-[min(92vh,960px)] max-w-none rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605] shadow-2xl p-0 flex flex-col overflow-hidden outline-none [&>button]:hidden"
          data-testid="guest-group-create-modal"
          aria-describedby="guest-group-create-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#EDE6D8] bg-[#FDFBF7] px-7 py-4">
            <div>
              <DialogTitle className="font-display text-xl font-semibold text-[#251605]">
                {isEdit ? `Edit Group — ${draft.name || "Group"}` : GUEST_GROUP_CREATE_TITLE}
              </DialogTitle>
              <DialogDescription id="guest-group-create-description" className="text-xs text-[#756A5B]">
                {isEdit
                  ? "Update group profile and save changes directly."
                  : GUEST_GROUP_CREATE_COPY}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex rounded-[4px] bg-[#FAF8F5] border border-[#EDE6D8] px-2 py-0.5 text-xs font-semibold text-[#8A641A]">
                Profile Type: Group (GRP)
              </span>
              <Button
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
              data-testid="guest-group-create-stepper"
              className="flex items-center gap-1.5 overflow-x-auto text-xs"
            >
              {GUEST_GROUP_CREATE_STEPS.map((item, index) => {
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
                    {index < GUEST_GROUP_CREATE_STEPS.length - 1 ? (
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
                    Loading group creation settings…
                  </div>
                ) : context.error ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
                    Could not load group creation settings: {(context.error as Error).message}
                  </div>
                ) : (
                  <>
                    {step === "details" ? (
                      <DetailsStep
                        draft={draft}
                        set={set}
                        setDraft={setDraft}
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
                        templateId={templateId}
                        setTemplateId={setTemplateId}
                        templates={templates.data ?? []}
                        fieldError={fieldError}
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
                        fieldError={fieldError}
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
                        error={fieldError("members", "guests")}
                      />
                    ) : null}
                    {step === "billing" ? (
                      <BillingStep
                        draft={draft}
                        set={set}
                        catalogues={catalogues}
                        credit={creditQuery.data ?? null}
                        estimate={estimate}
                        fieldError={fieldError}
                      />
                    ) : null}
                    {step === "review" ? (
                      <ReviewStep
                        draft={draft}
                        catalogues={catalogues}
                        counts={counts}
                        nights={nights}
                        estimate={estimate}
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
              {/* Group Preview Card */}
              <div
                data-testid="group-create-profile-preview"
                className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
                  <Users className="size-3.5" />
                  <span>Group Preview</span>
                </div>
                <div className="mt-3 space-y-2 border-t border-[#EDE6D8] pt-3 text-xs">
                  <div>
                    <span className="text-[#756A5B]">Group Name:</span>
                    <p className="font-semibold text-[#251605] break-words">{draft.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Profile Type:</span>
                    <p className="font-medium text-[#251605]">Group (GRP)</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Group Type:</span>
                    <p className="font-medium text-[#251605]">
                      {optionLabel(catalogues?.groupTypes ?? [], draft.groupTypeId) || "—"}
                    </p>
                  </div>
                  {draft.companyMasterName || draft.travelAgentMasterName ? (
                    <div>
                      <span className="text-[#756A5B]">Linked Partner:</span>
                      <p className="font-medium text-[#251605] break-words">
                        {draft.companyMasterName || draft.travelAgentMasterName}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-[#756A5B]">Status:</span>
                    <p className="font-medium text-[#251605]">{GROUP_STATUS_LABELS.pending}</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Travel Dates:</span>
                    <p className="font-medium text-[#251605]">
                      {draft.arrivalDate && draft.departureDate
                        ? `${draft.arrivalDate} → ${draft.departureDate} (${nights ?? 0} nts)`
                        : "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EDE6D8]/60">
                    <div>
                      <span className="text-[#756A5B]">Expected Pax:</span>
                      <p className="font-medium text-[#251605]">{draft.expectedPax || "0"}</p>
                    </div>
                    <div>
                      <span className="text-[#756A5B]">Expected Rms:</span>
                      <p className="font-medium text-[#251605]">{draft.expectedRooms || "0"}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Registered Members:</span>
                    <p className="font-medium text-[#251605]">{counts.registered}</p>
                  </div>
                  <div>
                    <span className="text-[#756A5B]">Group Code:</span>
                    <p className="font-mono text-[11px] text-[#251605]">
                      {draft.code || "Assigned on save"}
                    </p>
                  </div>
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
                  {step === "details" && "Set the group identity, type, linked account, and primary contact."}
                  {step === "stay" && "Define the group's stay, travel details, and room-type requirements."}
                  {step === "guests" && "Add or link group members and stage the rooming-list information."}
                  {step === "billing" && "Configure rate, payment, deposit, billing, and linked-account credit details."}
                  {step === "review" && "Review the group setup before completing registration."}
                </p>
                <div className="pt-2 border-t border-[#EDE6D8] text-[11px] text-[#A89F91]">
                  Property Setup Controlled
                </div>
              </div>
            </aside>
          </div>

          {/* Sticky Footer */}
          <div className="border-t border-[#EDE6D8] bg-[#FDFBF7] px-7 py-3 flex items-center justify-between">
            {isEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleActualClose}
                  className="border-[#DDD4C5] text-xs text-[#251605]"
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold text-xs shadow-sm"
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                    data-testid="edit-group-save-btn"
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
                    onClick={handleCloseRequest}
                    className="text-xs text-[#756A5B] hover:text-[#251605] hover:bg-[#F2ECE1]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="group-create-start-over"
                    onClick={() => setStartOverOpen(true)}
                    disabled={!guestGroupCreateHasChanges(draft)}
                    className="text-xs border-[#E6E1D8] text-[#756A5B] hover:bg-[#FAF8F5]"
                  >
                    {GUEST_GROUP_CREATE_START_OVER}
                  </Button>
                  {holdState === "saving" ? (
                    <span className="text-xs text-[#A89F91]">Saving progress…</span>
                  ) : null}
                  {holdState === "saved" && guestGroupCreateHasChanges(draft) ? (
                    <span className="text-xs text-[#8A641A] font-medium">Progress saved</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="group-create-save-draft"
                    onClick={() => draftMutation.mutate()}
                    disabled={isSavingDraft}
                    className="text-xs border-[#E6E1D8] text-[#251605] hover:bg-[#FAF8F5]"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </Button>

                  {stepIndex > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => go(GUEST_GROUP_CREATE_STEPS[stepIndex - 1].id)}
                      className="text-xs border-[#E6E1D8] text-[#251605] hover:bg-[#FAF8F5]"
                    >
                      Back
                    </Button>
                  ) : null}

                  {step !== "review" ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (validateCurrent()) go(GUEST_GROUP_CREATE_STEPS[stepIndex + 1].id);
                      }}
                      className="bg-[#251605] text-[#FAF8F5] hover:bg-[#3D2C1D] text-xs font-medium"
                    >
                      <span>Continue</span>
                      <ChevronRight className="ml-1 size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      data-testid="group-create-complete"
                      onClick={() => completeMutation.mutate()}
                      disabled={isCompleting}
                      className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] font-semibold text-xs shadow-sm"
                    >
                      {isCompleting ? "Registering…" : "Complete Registration"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Alert */}
      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent className="rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-[#251605]">
              Discard new group?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#756A5B]">
              You have unsaved changes in this group profile. Closing will save your progress locally so you can resume later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#DDD4C5] bg-white text-xs hover:bg-[#FAF8F5]">
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-[#251605] text-[#FAF8F5] text-xs hover:bg-[#3D2C1D]"
            >
              Close & Keep Progress
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start Over Confirmation Alert */}
      <AlertDialog open={startOverOpen} onOpenChange={setStartOverOpen}>
        <AlertDialogContent className="rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-[#251605]">
              {GUEST_GROUP_CREATE_START_OVER}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[#756A5B]">
              {GUEST_GROUP_CREATE_START_OVER_COPY}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#DDD4C5] bg-white text-xs hover:bg-[#FAF8F5]">
              Keep Progress
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={startOverMutation.isPending}
              onClick={() => startOverMutation.mutate()}
              className="bg-destructive text-destructive-foreground text-xs hover:bg-destructive/90"
            >
              {startOverMutation.isPending ? "Resetting…" : GUEST_GROUP_CREATE_START_OVER}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ModalField({
  label,
  required,
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
      <Label className="text-xs font-medium text-[#251605]">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
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

function DetailsStep({
  draft,
  set,
  setDraft,
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
  templateId,
  setTemplateId,
  templates,
  fieldError,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  setDraft: React.Dispatch<React.SetStateAction<GuestGroupCreateDraft>>;
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
  templateId: string;
  setTemplateId: (value: string) => void;
  templates: Array<{ id: string; name: string; active: boolean; payload: unknown }>;
  fieldError: (key: string, stepId?: GuestGroupCreateStepId) => string | undefined;
}) {
  const types = (catalogues?.groupTypes ?? []).filter(
    (row) => row.active !== false || row.id === draft.groupTypeId,
  );
  const [isCustomContact, setIsCustomContact] = useState(
    () => Boolean(draft.primaryContactName && !draft.primaryContactGuestId),
  );

  return (
    <div className="space-y-4">
      {/* Template Selection Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#251605]">Group Template</span>
            <p className="text-[11px] text-[#756A5B]">{GROUP_TEMPLATE_COPY}</p>
          </div>
          <div className="w-full sm:w-64">
            <Select
              value={templateId || "none"}
              onValueChange={(value) => {
                if (value === "none") {
                  setTemplateId("");
                  return;
                }
                const template = templates.find((row) => row.id === value);
                setTemplateId(value);
                if (template) {
                  setDraft((current) => ({
                    ...applyGroupTemplateToDraft(template.payload),
                    name: current.name,
                    currency: current.currency,
                  }));
                }
              }}
            >
              <SelectTrigger className={MODAL_SELECT_TRIGGER_CLASS} data-testid="group-template-select">
                <SelectValue placeholder="Start from template (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Blank)</SelectItem>
                {templates
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
      </div>

      {/* Main Group Identity Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Group Details</h2>
          <p className="text-xs text-[#756A5B]">Basic identification, group classification, and code assignment.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Group Name" required error={fieldError("name", "details")}>
            <Input
              data-testid="group-create-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Europe Heritage Tour"
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Group Code">
            <Input
              value={draft.code}
              onChange={(e) => {
                set("code", e.target.value);
                set("codeManual", Boolean(e.target.value.trim()));
              }}
              placeholder="Assigned on save"
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Group Type" required error={fieldError("groupTypeId", "details")}>
            <Select value={draft.groupTypeId} onValueChange={(val) => set("groupTypeId", val)}>
              <SelectTrigger
                data-testid="group-create-type"
                className={cn(MODAL_SELECT_TRIGGER_CLASS, fieldError("groupTypeId", "details") && "border-destructive")}
              >
                <SelectValue placeholder={types.length ? "Select type" : "Configure group types in settings"} />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code && row.code !== row.name ? `${row.code} — ${row.name}` : row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ModalField>

          <ModalField label="Market Segment">
            <ModalSelect
              value={draft.marketSegmentId}
              onChange={(val) => set("marketSegmentId", val)}
              options={catalogues?.marketSegments ?? []}
              placeholder="Select market segment"
            />
          </ModalField>
        </div>

        {/* Linked Accounts */}
        <div className="pt-2 border-t border-[#EDE6D8] space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Company Partner">
              <SearchableSelect
                id="group-company-partner"
                value={draft.companyMasterId}
                placeholder={draft.companyMasterName || "Select linked company (optional)"}
                searchPlaceholder="Search companies..."
                emptyText="No companies found."
                options={[
                  { value: "", label: "None (No company partner)" },
                  ...companies.map((row) => ({
                    value: row.id,
                    label: row.code && row.code !== row.name ? `${row.name} (${row.code})` : row.name,
                  })),
                  ...(draft.companyMasterId && !companies.some((c) => c.id === draft.companyMasterId)
                    ? [{ value: draft.companyMasterId, label: draft.companyMasterName || draft.companyMasterId }]
                    : []),
                ]}
                onSearchChange={onCompanyQuery}
                onChange={(val) => {
                  if (!val || val === "none") {
                    set("companyMasterId", "");
                    set("companyMasterName", "");
                    return;
                  }
                  const selected = companies.find((row) => row.id === val);
                  set("companyMasterId", val);
                  set("companyMasterName", selected?.name ?? draft.companyMasterName);
                }}
                className={MODAL_SELECT_TRIGGER_CLASS}
              />
            </ModalField>

            <ModalField label="Travel Agency / Tour Operator">
              <SearchableSelect
                id="group-travel-agency"
                value={draft.travelAgentMasterId}
                placeholder={draft.travelAgentMasterName || "Select linked agency (optional)"}
                searchPlaceholder="Search agencies..."
                emptyText="No agencies found."
                options={[
                  { value: "", label: "None (No travel agency)" },
                  ...agencies.map((row) => ({
                    value: row.id,
                    label: row.code && row.code !== row.name ? `${row.name} (${row.code})` : row.name,
                  })),
                  ...(draft.travelAgentMasterId && !agencies.some((a) => a.id === draft.travelAgentMasterId)
                    ? [{ value: draft.travelAgentMasterId, label: draft.travelAgentMasterName || draft.travelAgentMasterId }]
                    : []),
                ]}
                onSearchChange={onAgencyQuery}
                onChange={(val) => {
                  if (!val || val === "none") {
                    set("travelAgentMasterId", "");
                    set("travelAgentMasterName", "");
                    return;
                  }
                  const selected = agencies.find((row) => row.id === val);
                  set("travelAgentMasterId", val);
                  set("travelAgentMasterName", selected?.name ?? draft.travelAgentMasterName);
                }}
                className={MODAL_SELECT_TRIGGER_CLASS}
              />
              <p className="mt-1 text-[11px] text-[#756A5B]">{GROUP_TOUR_OPERATOR_COPY}</p>
            </ModalField>
          </div>
        </div>

        {/* Primary Contact */}
        <div className="pt-2 border-t border-[#EDE6D8] space-y-3">
          <div>
            <div className="flex items-center justify-between pb-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Primary Contact Person
              </Label>
              <button
                type="button"
                onClick={() => {
                  const next = !isCustomContact;
                  setIsCustomContact(next);
                  if (next) {
                    set("primaryContactGuestId", "");
                  }
                }}
                className="text-[11px] font-medium text-[#8A641A] hover:underline"
              >
                {isCustomContact ? "Search guest database" : "Write custom name"}
              </button>
            </div>

            {isCustomContact ? (
              <Input
                id="group-primary-contact"
                value={draft.primaryContactName}
                onChange={(e) => {
                  set("primaryContactName", e.target.value);
                  set("primaryContactGuestId", "");
                }}
                placeholder="Enter contact person name (e.g. Abebe Bekele)"
                className={MODAL_CONTROL_CLASS}
              />
            ) : (
              <SearchableSelect
                id="group-primary-contact"
                value={draft.primaryContactGuestId || draft.primaryContactName}
                placeholder={draft.primaryContactName || "Select from guest database or type name"}
                searchPlaceholder="Search guests or type contact name..."
                emptyText="No registered guests found. Click 'Write custom name' above or type name to add."
                allowCustomValue
                options={[
                  { value: "", label: "None (No primary contact)" },
                  ...contacts.map((row) => ({
                    value: row.id,
                    label: [row.name, row.phone, row.email].filter(Boolean).join(" · "),
                  })),
                  ...(draft.primaryContactGuestId && !contacts.some((c) => c.id === draft.primaryContactGuestId)
                    ? [{ value: draft.primaryContactGuestId, label: draft.primaryContactName || draft.primaryContactGuestId }]
                    : []),
                ]}
                onSearchChange={onContactQuery}
                onChange={(val) => {
                  if (!val || val === "none") {
                    set("primaryContactGuestId", "");
                    set("primaryContactName", "");
                    return;
                  }
                  const selected = contacts.find((row) => row.id === val);
                  if (selected) {
                    set("primaryContactGuestId", selected.id);
                    set("primaryContactName", selected.name);
                    if (selected.email) set("contactEmail", selected.email);
                    if (selected.phone) set("contactPhone", selected.phone);
                  } else {
                    set("primaryContactGuestId", "");
                    set("primaryContactName", val);
                  }
                }}
                className={MODAL_SELECT_TRIGGER_CLASS}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ModalField label="Contact Email">
              <Input
                type="email"
                value={draft.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                className={MODAL_CONTROL_CLASS}
                placeholder="contact@group.com"
              />
            </ModalField>
            <ModalField label="Contact Phone">
              <CanonicalPhoneInput
                value={draft.contactPhone}
                onChange={(phone) => set("contactPhone", phone)}
                placeholder="e.g. 911 234 567"
              />
            </ModalField>
          </div>
        </div>

        {/* Notes */}
        <div className="pt-2 border-t border-[#EDE6D8]">
          <ModalField label="Group Notes">
            <Textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 text-xs text-[#251605] shadow-none"
              placeholder="Additional internal notes regarding this group"
              rows={3}
            />
          </ModalField>
        </div>
      </div>
    </div>
  );
}

function StayStep({
  draft,
  set,
  nights,
  catalogues,
  destinationInput,
  onDestinationInput,
  fieldError,
}: {
  draft: GuestGroupCreateDraft;
  set: <K extends keyof GuestGroupCreateDraft>(key: K, value: GuestGroupCreateDraft[K]) => void;
  nights: number | null;
  catalogues?: GroupCreateContext["catalogues"];
  destinationInput: string;
  onDestinationInput: (value: string) => void;
  fieldError: (key: string, stepId?: GuestGroupCreateStepId) => string | undefined;
}) {
  return (
    <div className="space-y-4">
      {/* Travel & Stay Details Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Travel & Stay Schedule</h2>
          <p className="text-xs text-[#756A5B]">Arrival and departure dates, headcount expectations, and travel methods.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Arrival Date" required error={fieldError("arrivalDate", "stay")}>
            <Input
              type="date"
              value={draft.arrivalDate}
              onChange={(e) => set("arrivalDate", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Departure Date" required error={fieldError("departureDate", "stay")}>
            <Input
              type="date"
              value={draft.departureDate}
              onChange={(e) => set("departureDate", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Arrival Time">
            <Input
              type="time"
              value={draft.arrivalTime}
              onChange={(e) => set("arrivalTime", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Departure Time">
            <Input
              type="time"
              value={draft.departureTime}
              onChange={(e) => set("departureTime", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>

          <ModalField label="Total Nights">
            <Input
              value={nights == null ? "" : `${nights} night${nights === 1 ? "" : "s"}`}
              readOnly
              className={cn(MODAL_CONTROL_CLASS, "bg-[#FAF8F5]")}
              placeholder="Calculated from dates"
            />
          </ModalField>

          <ModalField label="Expected Pax" required error={fieldError("expectedPax", "stay")}>
            <Input
              type="number"
              min={1}
              value={draft.expectedPax}
              onChange={(e) => set("expectedPax", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. 20"
            />
          </ModalField>

          <ModalField label="Expected Rooms" error={fieldError("expectedRooms", "stay")}>
            <Input
              type="number"
              min={0}
              value={draft.expectedRooms}
              onChange={(e) => set("expectedRooms", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. 10"
            />
          </ModalField>

          <ModalField label="Arrival Method">
            <ModalSelect
              value={draft.arrivalMethod}
              onChange={(val) => set("arrivalMethod", val)}
              options={GROUP_TRAVEL_METHODS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select arrival method"
            />
          </ModalField>

          <ModalField label="Arrival From">
            <Input
              value={draft.arrivalFrom}
              onChange={(e) => set("arrivalFrom", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="City or airport origin"
            />
          </ModalField>

          <ModalField label="Arrival To">
            <Input
              value={draft.arrivalTo}
              onChange={(e) => set("arrivalTo", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Hotel location or terminal"
            />
          </ModalField>

          <ModalField label="Departure Method">
            <ModalSelect
              value={draft.departureMethod}
              onChange={(val) => set("departureMethod", val)}
              options={GROUP_TRAVEL_METHODS.map((row) => ({ id: row.id, name: row.label }))}
              placeholder="Select departure method"
            />
          </ModalField>

          <ModalField label="Departure To">
            <Input
              value={draft.departureTo}
              onChange={(e) => set("departureTo", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="Next destination"
            />
          </ModalField>

          <ModalField label="Source">
            <ModalSelect
              value={draft.sourceCodeId}
              onChange={(val) => set("sourceCodeId", val)}
              options={catalogues?.sourceCodes ?? []}
              placeholder="Select source"
            />
          </ModalField>

          <ModalField label="Channel">
            <ModalSelect
              value={draft.channelId}
              onChange={(val) => set("channelId", val)}
              options={catalogues?.channels ?? []}
              placeholder="Select channel"
            />
          </ModalField>
        </div>

        {/* Destinations Multi-Item Tag Input */}
        <div className="pt-2 border-t border-[#EDE6D8]">
          <ModalField label="Destinations">
            <div className="flex gap-2">
              <Input
                value={destinationInput}
                onChange={(e) => onDestinationInput(e.target.value)}
                placeholder="Add destination (e.g. Lalibela, Gondar)"
                className={MODAL_CONTROL_CLASS}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
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
                className="h-9 border-[#EDE6D8] px-3 text-xs text-[#251605] hover:bg-[#FAF8F5]"
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
            {draft.destinations.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.destinations.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FAF8F5] border border-[#EDE6D8] px-2.5 py-0.5 text-xs text-[#251605]"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      className="text-[#A89F91] hover:text-destructive text-sm leading-none"
                      onClick={() => set("destinations", draft.destinations.filter((row) => row !== item))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </ModalField>
        </div>

        {/* Special Requests & Stay Notes */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[#EDE6D8]">
          <ModalField label="Special Requests">
            <Textarea
              value={draft.specialRequests}
              onChange={(e) => set("specialRequests", e.target.value)}
              className="rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 text-xs text-[#251605] shadow-none"
              placeholder="Allergies, VIP reception, luggage assistance"
              rows={2}
            />
          </ModalField>
          <ModalField label="Stay Notes">
            <Textarea
              value={draft.stayNotes}
              onChange={(e) => set("stayNotes", e.target.value)}
              className="rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 text-xs text-[#251605] shadow-none"
              placeholder="Internal schedule notes"
              rows={2}
            />
          </ModalField>
        </div>
      </div>

      {/* Room Requirements (Demand by Room Type) Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#251605]">Room Requirements (Demand by Type)</h2>
            <p className="text-xs text-[#756A5B]">{GROUP_CREATE_NO_PHYSICAL_ROOMS}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set("roomNeeds", [...draft.roomNeeds, emptyGroupCreateRoomNeed()])}
            className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
          >
            <Plus className="mr-1 size-3.5" /> Add room type
          </Button>
        </div>

        {fieldError("roomNeeds", "stay") ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {fieldError("roomNeeds", "stay")}
          </div>
        ) : null}

        {draft.roomNeeds.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#756A5B] bg-[#FAF8F5] rounded-xl border border-dashed border-[#EDE6D8]">
            No room type requirements specified. Click "+ Add room type" to reserve room demand.
          </div>
        ) : (
          <div className="space-y-3">
            {draft.roomNeeds.map((need, index) => (
              <div
                key={need.key}
                className="grid gap-3 rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/60 p-4 sm:grid-cols-6 items-end"
              >
                <div className="sm:col-span-2">
                  <ModalField label="Room Type">
                    <ModalSelect
                      value={need.roomTypeId}
                      onChange={(val) =>
                        set(
                          "roomNeeds",
                          draft.roomNeeds.map((row, i) => (i === index ? { ...row, roomTypeId: val } : row)),
                        )
                      }
                      options={catalogues?.roomTypes ?? []}
                      placeholder="Select room type"
                    />
                  </ModalField>
                </div>

                <div>
                  <ModalField label="Rooms">
                    <Input
                      type="number"
                      min={0}
                      value={need.rooms}
                      onChange={(e) =>
                        set(
                          "roomNeeds",
                          draft.roomNeeds.map((row, i) => (i === index ? { ...row, rooms: Number(e.target.value) || 0 } : row)),
                        )
                      }
                      className={MODAL_CONTROL_CLASS}
                    />
                  </ModalField>
                </div>

                <div>
                  <ModalField label="Pax">
                    <Input
                      type="number"
                      min={0}
                      value={need.pax}
                      onChange={(e) =>
                        set(
                          "roomNeeds",
                          draft.roomNeeds.map((row, i) => (i === index ? { ...row, pax: Number(e.target.value) || 0 } : row)),
                        )
                      }
                      className={MODAL_CONTROL_CLASS}
                    />
                  </ModalField>
                </div>

                <div>
                  <ModalField label="Meal Plan">
                    <ModalSelect
                      value={need.mealPlanId}
                      onChange={(val) =>
                        set(
                          "roomNeeds",
                          draft.roomNeeds.map((row, i) => (i === index ? { ...row, mealPlanId: val } : row)),
                        )
                      }
                      options={catalogues?.mealPlans ?? []}
                      placeholder="Meal plan"
                    />
                  </ModalField>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <ModalField label="Rate Plan">
                      <ModalSelect
                        value={need.ratePlanId}
                        onChange={(val) =>
                          set(
                            "roomNeeds",
                            draft.roomNeeds.map((row, i) => (i === index ? { ...row, ratePlanId: val } : row)),
                          )
                        }
                        options={catalogues?.ratePlans ?? []}
                        placeholder="Rate plan"
                      />
                    </ModalField>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set("roomNeeds", draft.roomNeeds.filter((_, i) => i !== index))}
                    className="size-8 text-[#756A5B] hover:text-destructive shrink-0 mb-0.5"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
  error,
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
  error?: string;
}) {
  return (
    <div className="space-y-4">
      {/* Headcount Stat Header Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#251605]">Guest Information & Staging</h2>
            <p className="text-xs text-[#756A5B]">
              Members are optional at creation. Group can be initialized with expected pax only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#FAF8F5] border border-[#EDE6D8] px-3 py-1 text-xs text-[#756A5B]">
              Expected: <strong className="text-[#251605]">{counts.expected}</strong>
            </span>
            <span className="rounded-full bg-[#FAF8F5] border border-[#EDE6D8] px-3 py-1 text-xs text-[#756A5B]">
              Registered: <strong className="text-[#8A641A]">{counts.registered}</strong>
            </span>
            <span className="rounded-full bg-[#FAF8F5] border border-[#EDE6D8] px-3 py-1 text-xs text-[#756A5B]">
              Remaining: <strong className="text-[#251605]">{counts.remaining}</strong>
            </span>
          </div>
        </div>
        {error ? (
          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}
      </div>

      {/* Select Existing Guest Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-3 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-2">
          <h3 className="text-xs font-semibold text-[#251605] uppercase tracking-wider">
            Link Existing Guest Profile
          </h3>
          <p className="text-xs text-[#756A5B]">Search and attach guests already registered in NORU PMS.</p>
        </div>
        <Input
          placeholder="Search by name, phone, email, or profile ID"
          value={guestQuery}
          onChange={(e) => onGuestQuery(e.target.value)}
          className={MODAL_CONTROL_CLASS}
        />
        {guests.length > 0 ? (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {guests.map((guest) => (
              <li
                key={guest.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#EDE6D8] bg-[#FAF8F5]/50 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#251605]">{guest.name}</span>
                  <span className="ml-2 text-[#756A5B]">
                    {[guest.phone, guest.email].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAddExisting(guest)}
                  className="h-7 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
                >
                  <Plus className="mr-1 size-3" /> Add
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Stage New Guest Profile Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-3 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-2">
          <h3 className="text-xs font-semibold text-[#251605] uppercase tracking-wider">
            Stage New Member Profile
          </h3>
          <p className="text-xs text-[#756A5B]">Quickly stage new guest profiles to be saved with the group.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="First name" required>
            <Input
              value={memberDraft.firstName}
              onChange={(e) => onMemberDraft({ ...memberDraft, firstName: e.target.value })}
              className={MODAL_CONTROL_CLASS}
              placeholder="First name"
            />
          </ModalField>
          <ModalField label="Last name">
            <Input
              value={memberDraft.lastName}
              onChange={(e) => onMemberDraft({ ...memberDraft, lastName: e.target.value })}
              className={MODAL_CONTROL_CLASS}
              placeholder="Last name"
            />
          </ModalField>
          <ModalField label="Email">
            <Input
              type="email"
              value={memberDraft.email}
              onChange={(e) => onMemberDraft({ ...memberDraft, email: e.target.value })}
              className={MODAL_CONTROL_CLASS}
              placeholder="guest@example.com"
            />
          </ModalField>
          <ModalField label="Phone">
            <CanonicalPhoneInput
              value={memberDraft.phone}
              onChange={(phone) => onMemberDraft({ ...memberDraft, phone })}
              placeholder="e.g. 911 234 567"
            />
          </ModalField>
          <ModalField label="Room type preference">
            <ModalSelect
              value={memberDraft.roomTypeId}
              onChange={(val) => onMemberDraft({ ...memberDraft, roomTypeId: val })}
              options={catalogues?.roomTypes ?? []}
              placeholder="Optional preference"
            />
          </ModalField>
          <ModalField label="Bed preference">
            <Input
              value={memberDraft.bedPreference}
              onChange={(e) => onMemberDraft({ ...memberDraft, bedPreference: e.target.value })}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. King, Twin"
            />
          </ModalField>
        </div>

        <ModalField label="Special requests">
          <Textarea
            value={memberDraft.specialRequests}
            onChange={(e) => onMemberDraft({ ...memberDraft, specialRequests: e.target.value })}
            className="rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 text-xs text-[#251605] shadow-none"
            placeholder="Dietary, mobility, floor preference"
            rows={2}
          />
        </ModalField>

        <Button
          type="button"
          variant="outline"
          onClick={onAddNew}
          className="h-8 border-[#C89933]/50 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
        >
          <Plus className="mr-1 size-3.5" /> Stage new member
        </Button>
      </div>

      {/* CSV Import Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-3 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-2">
          <h3 className="text-xs font-semibold text-[#251605] uppercase tracking-wider">
            Import Members from CSV
          </h3>
          <p className="text-xs text-[#756A5B]">{GROUP_CREATE_IMPORT_STRUCTURE}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Filename">
            <Input
              value={draft.importFilename}
              onChange={(e) => set("importFilename", e.target.value)}
              placeholder="members.csv"
              className={MODAL_CONTROL_CLASS}
            />
          </ModalField>
        </div>
        <Textarea
          value={importCsv}
          onChange={(e) => onImportCsv(e.target.value)}
          rows={3}
          placeholder="first_name,last_name,email,phone,special_requests"
          className="rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 font-mono text-xs text-[#251605] shadow-none"
        />
        <Button
          type="button"
          variant="outline"
          data-testid="group-create-import"
          onClick={onImport}
          className="h-8 border-[#EDE6D8] text-xs text-[#251605] hover:bg-[#FAF8F5]"
        >
          Stage import
        </Button>
      </div>

      {/* Staged Members Review List */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-3 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#251605] uppercase tracking-wider">
            Staged Group Members ({draft.members.length})
          </h3>
          <span className="text-[11px] text-[#756A5B]">Saved with group registration</span>
        </div>
        {draft.members.length === 0 ? (
          <p className="py-4 text-center text-xs text-[#756A5B]">No members staged yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {draft.members.map((member) => (
              <li
                key={member.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#EDE6D8] bg-[#FAF8F5]/60 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#251605]">
                    {member.guestName || member.firstName} {member.lastName}
                  </span>
                  <span className="ml-2 text-[#756A5B]">
                    {member.guestId ? "Existing profile" : "New profile"} · {member.status}
                    {member.phone || member.email ? ` · ${[member.phone, member.email].filter(Boolean).join(" · ")}` : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => set("members", draft.members.filter((row) => row.key !== member.key))}
                  className="size-7 text-[#756A5B] hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BillingStep({
  draft,
  set,
  catalogues,
  credit,
  estimate,
  fieldError,
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
  fieldError: (key: string, stepId?: GuestGroupCreateStepId) => string | undefined;
}) {
  const depositAmount = Number(draft.depositAmount);
  const exceeded =
    credit?.creditLimitAmount != null &&
    draft.depositRequired &&
    !Number.isNaN(depositAmount) &&
    depositAmount > credit.creditLimitAmount;

  return (
    <div className="space-y-4">
      {/* Financial Defaults Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Financial & Billing Settings</h2>
          <p className="text-xs text-[#756A5B]">Group rate plan, settlement arrangement, payment methods, and deposits.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Rate Plan">
            <ModalSelect
              value={draft.ratePlanId}
              onChange={(val) => set("ratePlanId", val)}
              options={catalogues?.ratePlans ?? []}
              placeholder="Select rate plan"
            />
          </ModalField>

          <ModalField label="Package">
            <ModalSelect
              value={draft.packageId}
              onChange={(val) => set("packageId", val)}
              options={catalogues?.packages ?? []}
              placeholder="Select package"
            />
          </ModalField>

          <ModalField label="Meal Plan">
            <ModalSelect
              value={draft.mealPlanId}
              onChange={(val) => set("mealPlanId", val)}
              options={catalogues?.mealPlans ?? []}
              placeholder="Select meal plan"
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

          <ModalField label="Payment Method" error={fieldError("paymentMethodId", "billing")}>
            <ModalSelect
              value={draft.paymentMethodId}
              onChange={(val) => set("paymentMethodId", val)}
              options={catalogues?.paymentMethods ?? []}
              placeholder="Select payment method"
            />
          </ModalField>

          <ModalField label="Billing Arrangement" required error={fieldError("billingArrangement", "billing")}>
            <Select value={draft.billingArrangement} onValueChange={(val) => set("billingArrangement", val)}>
              <SelectTrigger
                data-testid="group-create-billing"
                className={cn(MODAL_SELECT_TRIGGER_CLASS, fieldError("billingArrangement", "billing") && "border-destructive")}
              >
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
          </ModalField>
        </div>

        {/* Deposit Policy */}
        <div className="pt-2 border-t border-[#EDE6D8] space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[#EDE6D8] bg-[#FAF8F5] px-4 py-2.5">
            <div>
              <Label className="text-xs font-semibold text-[#251605]">Deposit Required</Label>
              <p className="text-[11px] text-[#756A5B]">Require upfront deposit guarantee for this group booking.</p>
            </div>
            <Switch
              checked={draft.depositRequired}
              onCheckedChange={(checked) => set("depositRequired", Boolean(checked))}
            />
          </div>

          {draft.depositRequired ? (
            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <ModalField label="Deposit Amount" error={fieldError("depositAmount", "billing")}>
                <Input
                  type="number"
                  min={0}
                  value={draft.depositAmount}
                  onChange={(e) => set("depositAmount", e.target.value)}
                  className={MODAL_CONTROL_CLASS}
                  placeholder="0.00"
                />
              </ModalField>

              <ModalField label="Deposit Percentage (%)" error={fieldError("depositPercent", "billing")}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.depositPercent}
                  onChange={(e) => set("depositPercent", e.target.value)}
                  className={MODAL_CONTROL_CLASS}
                  placeholder="e.g. 50"
                />
              </ModalField>

              <ModalField label="Deposit Due Date">
                <Input
                  type="date"
                  value={draft.depositDueDate}
                  onChange={(e) => set("depositDueDate", e.target.value)}
                  className={MODAL_CONTROL_CLASS}
                />
              </ModalField>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <ModalField label="Balance Due Date">
              <Input
                type="date"
                value={draft.balanceDueDate}
                onChange={(e) => set("balanceDueDate", e.target.value)}
                className={MODAL_CONTROL_CLASS}
              />
            </ModalField>
            <ModalField label="Payment Terms">
              <Input
                value={draft.paymentTerms}
                onChange={(e) => set("paymentTerms", e.target.value)}
                className={MODAL_CONTROL_CLASS}
                placeholder="e.g. 30 days net"
              />
            </ModalField>
          </div>
        </div>

        {/* Live Credit Information Card */}
        {credit ? (
          <div className="rounded-xl border border-[#EDE6D8] bg-[#FAF8F5] p-4 text-xs space-y-1.5">
            <span className="font-semibold text-[#8A641A] uppercase tracking-wider text-[11px]">
              Linked Partner Credit Status
            </span>
            <p className="text-[#251605]">
              {credit.creditAccountEnabled ? "Credit account is enabled on master." : "Credit account flag is not enabled."}
              {credit.creditLimitNote ? ` ${credit.creditLimitNote}` : ""}
              {credit.creditLimitAmount != null ? ` Stored Limit: ${credit.creditLimitAmount}.` : " No numeric credit-limit engine is applied here."}
              {credit.paymentTerms && !draft.paymentTerms ? ` Stored terms: ${credit.paymentTerms}.` : ""}
            </p>
            {exceeded ? (
              <p className="text-amber-700 font-medium">
                Deposit is above the stored credit limit. This uses the company/account figure — it does not create a new credit rule.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Estimated Financial Summary Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-2 shadow-none">
        <h3 className="text-sm font-semibold text-[#251605]">Estimated Financial Summary</h3>
        <p className="text-xs text-[#756A5B]">{estimate.copy}</p>
      </div>
    </div>
  );
}

function ReviewStep({
  draft,
  catalogues,
  counts,
  nights,
  estimate,
  issues,
  onEdit,
}: {
  draft: GuestGroupCreateDraft;
  catalogues?: GroupCreateContext["catalogues"];
  counts: { expected: number; registered: number; remaining: number };
  nights: number | null;
  estimate: ReturnType<typeof estimateGroupCreationCharges>;
  issues: Array<{ key: string; message: string; step: GuestGroupCreateStepId }>;
  onEdit: (step: GuestGroupCreateStepId) => void;
}) {
  const remaining = issues.length
    ? issues
    : guestGroupCreateCompletion(draft).items.filter((item) => item.requiredRemaining).map((item) => ({
        key: item.id,
        message: item.label,
        step: item.step,
      }));

  return (
    <div className="space-y-4">
      {remaining.length > 0 ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-semibold text-xs text-destructive">
            {remaining.length} required item{remaining.length === 1 ? "" : "s"} remaining before registration
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {remaining.map((item) => (
              <li key={`${item.step}-${item.key}`} className="flex items-center justify-between">
                <span className="text-destructive">
                  {GUEST_GROUP_CREATE_STEPS.find((s) => s.id === item.step)?.title}: {item.message}
                </span>
                <button
                  type="button"
                  className="font-semibold text-[#8A641A] hover:underline"
                  onClick={() => onEdit(item.step)}
                >
                  Go to step
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ReviewCard title="Group Information" onEdit={() => onEdit("details")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Name:</span> <strong className="text-[#251605]">{draft.name || "—"}</strong></div>
          <div><span className="text-[#756A5B]">Code:</span> <strong className="text-[#251605]">{draft.code || "Assigned on save"}</strong></div>
          <div><span className="text-[#756A5B]">Type:</span> {optionLabel(catalogues?.groupTypes ?? [], draft.groupTypeId) || "—"}</div>
          <div><span className="text-[#756A5B]">Market:</span> {optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</div>
          <div className="col-span-2"><span className="text-[#756A5B]">Linked Partner:</span> {draft.companyMasterName || draft.travelAgentMasterName || "—"}</div>
          <div className="col-span-2"><span className="text-[#756A5B]">Contact:</span> {draft.primaryContactName || "—"} {draft.contactEmail ? `· ${draft.contactEmail}` : ""} {draft.contactPhone ? `· ${draft.contactPhone}` : ""}</div>
          {draft.notes ? <div className="col-span-2"><span className="text-[#756A5B]">Notes:</span> {draft.notes}</div> : null}
        </div>
      </ReviewCard>

      <ReviewCard title="Travel & Stay" onEdit={() => onEdit("stay")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Arrival:</span> {draft.arrivalDate || "—"} {draft.arrivalTime}</div>
          <div><span className="text-[#756A5B]">Departure:</span> {draft.departureDate || "—"} {draft.departureTime}</div>
          <div><span className="text-[#756A5B]">Total Nights:</span> {nights ?? "—"}</div>
          <div><span className="text-[#756A5B]">Expected Pax:</span> {draft.expectedPax || "—"}</div>
          <div><span className="text-[#756A5B]">Expected Rooms:</span> {draft.expectedRooms || "—"}</div>
          <div><span className="text-[#756A5B]">Arrival Method:</span> {travelMethodLabel(draft.arrivalMethod) || "—"}</div>
          <div><span className="text-[#756A5B]">Destinations:</span> {draft.destinations.join(", ") || "—"}</div>
          <div><span className="text-[#756A5B]">Room Requirements:</span> {draft.roomNeeds.length} type(s) configured</div>
        </div>
      </ReviewCard>

      <ReviewCard title="Guest Information" onEdit={() => onEdit("guests")}>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Expected:</span> {counts.expected}</div>
          <div><span className="text-[#756A5B]">Registered:</span> {counts.registered}</div>
          <div><span className="text-[#756A5B]">Remaining:</span> {counts.remaining}</div>
          <div className="col-span-3 pt-1 border-t border-[#EDE6D8]">
            <span className="text-[#756A5B]">Members:</span>{" "}
            {draft.members.length
              ? draft.members.map((m) => m.guestName || m.firstName).join(", ")
              : "None (Registration can proceed with expected pax)"}
          </div>
        </div>
      </ReviewCard>

      <ReviewCard title="Financial & Billing" onEdit={() => onEdit("billing")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Rate Plan:</span> {optionLabel(catalogues?.ratePlans ?? [], draft.ratePlanId) || "—"}</div>
          <div><span className="text-[#756A5B]">Package:</span> {optionLabel(catalogues?.packages ?? [], draft.packageId) || "—"}</div>
          <div><span className="text-[#756A5B]">Meal Plan:</span> {optionLabel(catalogues?.mealPlans ?? [], draft.mealPlanId) || "—"}</div>
          <div><span className="text-[#756A5B]">Billing:</span> {billingArrangementLabel(draft.billingArrangement) || "—"}</div>
          <div><span className="text-[#756A5B]">Currency:</span> {draft.currency || "—"}</div>
          <div><span className="text-[#756A5B]">Deposit:</span> {draft.depositRequired ? [draft.depositAmount, draft.depositPercent && `${draft.depositPercent}%`, draft.depositDueDate].filter(Boolean).join(" · ") : "Not required"}</div>
          <div className="col-span-2"><span className="text-[#756A5B]">Pricing Estimate:</span> {estimate.available ? String(estimate.total) : "Unavailable (Reservation rate service)"}</div>
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
    <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none">
      <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2 mb-2">
        <h3 className="text-xs font-semibold text-[#8A641A] uppercase tracking-wider">{title}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="h-6 px-2 text-[11px] border-[#C89933]/50 text-[#8A641A] hover:bg-[#FAF8F5]"
        >
          Edit
        </Button>
      </div>
      {children}
    </div>
  );
}
