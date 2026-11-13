import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
  billingArrangementLabel,
  clearGuestGroupCreateHold,
  emptyGroupCreateMember,
  emptyGuestGroupCreateDraft,
  filled,
  guestGroupCreateCompletion,
  guestGroupCreateHasChanges,
  groupCreateDraftErrorsForSave,
  groupCreateFieldIssues,
  groupCreateMemberCounts,
  optionLabel,
  readGuestGroupCreateHold,
  stageGroupMemberImport,
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
import { validateCompanyPhone } from "@/packages/pms/lib/guest-company-create-workspace";

const MODAL_CONTROL_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none transition-colors placeholder:text-[#8C7E72] hover:border-[#8A641A] focus-visible:border-[#8A641A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8A641A] disabled:cursor-not-allowed disabled:bg-[#FAF8F5] disabled:text-[#8C7E72]";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus:border-[#8A641A] focus:ring-1 focus:ring-[#8A641A]";

const PHONE_GROUP = "h-9 gap-0 overflow-hidden rounded-[6px] border border-[#CCCCCC] bg-white";
const PHONE_TRIGGER = "h-9 w-[7.75rem] rounded-none border-0 bg-white shadow-none hover:bg-white";
const PHONE_INPUT = "h-9 rounded-none border-0 bg-white shadow-none focus-visible:ring-0";

function IconInput({
  icon,
  className,
  ...props
}: ComponentProps<typeof Input> & { icon: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8C7E72]">{icon}</span>
      <Input {...props} className={cn(MODAL_CONTROL_CLASS, "pl-9", className)} />
    </div>
  );
}

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
  promptCreateBlock = true,
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
  /** When false, the caller selects the new profile immediately. Guest Profile shows Create Group / Block. */
  promptCreateBlock?: boolean;
  mode?: "create" | "edit";
  groupId?: string | null;
  group?: any | null;
  onSaved?: (groupId: string) => void;
}) {
  const isEdit = mode === "edit" || Boolean(groupId) || Boolean(group);
  const navigate = useNavigate();
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
      if (!promptCreateBlock && onCreated) {
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

  if (created && !isEdit && promptCreateBlock) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleCloseRequest();
        }}
      >
        <DialogContent
          className="max-w-lg rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605]"
          data-testid="guest-group-create-modal"
        >
          <DialogTitle className="font-display text-lg text-[#251605]">Group profile registered</DialogTitle>
          <DialogDescription className="text-sm text-[#756A5B]">
            {created.name}
            {created.code ? ` · ${created.code}` : ""}
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="group-create-done"
              onClick={() => {
                if (onCreated) onCreated(created.id);
                else onOpenChange(false);
              }}
            >
              Done
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
              data-testid="create-group-block-from-profile"
              onClick={() => {
                void navigate({
                  to: "/restaurant/pms/reservations",
                  search: { tab: "groups", createGroupProfile: created.id },
                });
              }}
            >
              Create Group / Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        modal={!discardConfirmOpen && !startOverOpen}
        onOpenChange={(next) => {
          if (!next && !discardConfirmOpen && !startOverOpen) handleCloseRequest();
        }}
      >
        <DialogContent
          className="z-[80] flex h-[92vh] max-h-[92vh] w-[min(90vw,1440px)] max-w-none flex-col gap-0 overflow-hidden rounded-lg border border-[#3A2A16] bg-[#FBF7F1] p-0 text-[#251605] shadow-2xl outline-none sm:max-w-none [&>button]:hidden"
          data-testid="guest-group-create-modal"
          aria-describedby="guest-group-create-description"
          onPointerDownOutside={(event) => {
            if (discardConfirmOpen || startOverOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (discardConfirmOpen || startOverOpen) event.preventDefault();
          }}
        >
          <header className="shrink-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="font-display text-sm font-semibold text-[#F3E9D8]">
                {isEdit ? `Edit Group — ${draft.name || "Group"}` : GUEST_GROUP_CREATE_TITLE}
              </DialogTitle>
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
                {completion.percent}% complete
              </span>
              <DialogDescription id="guest-group-create-description" className="sr-only">
                {isEdit ? "Update group profile and save changes directly." : GUEST_GROUP_CREATE_COPY}
              </DialogDescription>
              <span className="ml-auto flex items-center gap-1.5">
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
                        data-testid="group-create-start-over"
                        disabled={!guestGroupCreateHasChanges(draft)}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setStartOverOpen(true)}
                      >
                        {GUEST_GROUP_CREATE_START_OVER}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
                  onClick={handleCloseRequest}
                  aria-label="Close"
                >
                  <X className="size-4" />
                </Button>
              </span>
            </div>
          </header>
          <nav
            data-testid="guest-group-create-stepper"
            aria-label="Create group steps"
            className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-[#DDD4C5] bg-white px-2"
          >
            <ol className="flex min-w-0 items-stretch">
              {GUEST_GROUP_CREATE_STEPS.map((item, index) => {
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

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F1] p-4">
            <div className="min-w-0 space-y-4">
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
                        fieldError={fieldError}
                      />
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


          {/* Sticky Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#E8DFD0] bg-white px-4 py-2">
            {isEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleActualClose}
                  className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={SHELL_PRIMARY_BUTTON}
                  onClick={() => saveEditMutation.mutate()}
                  disabled={saveEditMutation.isPending}
                  data-testid="edit-group-save-btn"
                >
                  {saveEditMutation.isPending ? "Saving Changes…" : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {stepIndex === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseRequest}
                      className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => go(GUEST_GROUP_CREATE_STEPS[stepIndex - 1].id)}
                      className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                    >
                      Back
                    </Button>
                  )}
                  {holdState === "saving" ? (
                    <span className="text-xs text-muted-foreground">Saving progress…</span>
                  ) : null}
                  {holdState === "saved" && guestGroupCreateHasChanges(draft) ? (
                    <span className="text-xs text-muted-foreground">Progress saved</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="group-create-save-draft"
                    onClick={() => draftMutation.mutate()}
                    disabled={isSavingDraft}
                    className="h-9 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
                  >
                    {isSavingDraft ? "Saving…" : "Save as Draft"}
                  </Button>
                  {step !== "review" ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (validateCurrent()) go(GUEST_GROUP_CREATE_STEPS[stepIndex + 1].id);
                      }}
                      className={SHELL_PRIMARY_BUTTON}
                    >
                      Continue <ChevronRight className="ml-1 size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      data-testid="group-create-complete"
                      onClick={() => completeMutation.mutate()}
                      disabled={isCompleting}
                      className={SHELL_PRIMARY_BUTTON}
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
        <AlertDialogContent className="z-[100] rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605]">
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
        <AlertDialogContent className="z-[100] rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] text-[#251605]">
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
      {/* Main Group Identity Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Group Details</h2>
          <p className="text-xs text-[#756A5B]">Basic identification, group classification, and code assignment.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ModalField label="Group Name" required error={fieldError("name", "details")}>
            <IconInput
              icon={<Users className="size-4" />}
              data-testid="group-create-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Europe Heritage Tour"
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

          <ModalField label="Default Market Segment">
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
            <ModalField label="Contact Phone" error={validateCompanyPhone(draft.contactPhone) ?? undefined}>
              <CanonicalPhoneInput
                value={draft.contactPhone}
                onChange={(phone) => set("contactPhone", phone)}
                error={Boolean(validateCompanyPhone(draft.contactPhone))}
                placeholder="Enter phone number"
                maxDigits={9}
                containerClassName={PHONE_GROUP}
                triggerClassName={PHONE_TRIGGER}
                className={PHONE_INPUT}
                popoverClassName="z-[90]"
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
          <ModalField label="Special requests">
            <Textarea
              value={draft.specialRequests}
              onChange={(e) => set("specialRequests", e.target.value)}
              className="mt-2 rounded-[6px] border border-[#CCCCCC] bg-white p-2.5 text-xs text-[#251605] shadow-none"
              placeholder="Reusable requests for this group profile"
              rows={3}
            />
          </ModalField>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-white px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-medium text-[#756A5B]">Group Template</span>
            <p className="text-[11px] text-[#8C7E72]">Optional. {GROUP_TEMPLATE_COPY}</p>
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
              Members are optional. Add the people who belong to this group profile.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#FAF8F5] border border-[#EDE6D8] px-3 py-1 text-xs text-[#756A5B]">
              Members: <strong className="text-[#8A641A]">{counts.registered}</strong>
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
          <ModalField label="Phone" error={validateCompanyPhone(memberDraft.phone) ?? undefined}>
            <CanonicalPhoneInput
              value={memberDraft.phone}
              onChange={(phone) => onMemberDraft({ ...memberDraft, phone })}
              error={Boolean(validateCompanyPhone(memberDraft.phone))}
              placeholder="Enter phone number"
              maxDigits={9}
              containerClassName={PHONE_GROUP}
              triggerClassName={PHONE_TRIGGER}
              className={PHONE_INPUT}
              popoverClassName="z-[90]"
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
  fieldError: (key: string, stepId?: GuestGroupCreateStepId) => string | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Billing defaults</h2>
          <p className="text-xs text-[#756A5B]">
            Reusable settlement defaults for this group profile. Rate plans, packages, deposits, and due dates belong to the reservation block.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
          <ModalField label="Payment Terms">
            <Input
              value={draft.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. 30 days net"
            />
          </ModalField>
        </div>

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
  draft: GuestGroupCreateDraft;
  catalogues?: GroupCreateContext["catalogues"];
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
          <div><span className="text-[#756A5B]">Default Market Segment:</span> {optionLabel(catalogues?.marketSegments ?? [], draft.marketSegmentId) || "—"}</div>
          <div><span className="text-[#756A5B]">Company Partner:</span> {draft.companyMasterName || "—"}</div>
          <div><span className="text-[#756A5B]">Travel Agency:</span> {draft.travelAgentMasterName || "—"}</div>
          <div className="col-span-2"><span className="text-[#756A5B]">Contact:</span> {draft.primaryContactName || "—"} {draft.contactEmail ? `· ${draft.contactEmail}` : ""} {draft.contactPhone ? `· ${draft.contactPhone}` : ""}</div>
          {draft.notes ? <div className="col-span-2"><span className="text-[#756A5B]">Notes:</span> {draft.notes}</div> : null}
          {draft.specialRequests ? <div className="col-span-2"><span className="text-[#756A5B]">Special requests:</span> {draft.specialRequests}</div> : null}
        </div>
      </ReviewCard>

      <ReviewCard title="Guest Information" onEdit={() => onEdit("guests")}>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <span className="text-[#756A5B]">Members:</span>{" "}
            {draft.members.length
              ? draft.members.map((m) => m.guestName || m.firstName).join(", ")
              : "None"}
          </div>
        </div>
      </ReviewCard>

      <ReviewCard title="Financial & Billing" onEdit={() => onEdit("billing")}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-[#756A5B]">Billing:</span> {billingArrangementLabel(draft.billingArrangement) || "—"}</div>
          <div><span className="text-[#756A5B]">Currency:</span> {draft.currency || "—"}</div>
          <div><span className="text-[#756A5B]">Payment method:</span> {optionLabel(catalogues?.paymentMethods ?? [], draft.paymentMethodId) || "—"}</div>
          <div><span className="text-[#756A5B]">Payment terms:</span> {draft.paymentTerms || "—"}</div>
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
