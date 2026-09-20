import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { FieldShell } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { PropertySetupRemoveButton } from "@/packages/pms/components/settings/setup-kit";
import {
  deletePmsCard4AutomationRule,
  getPmsCard4AutomationRules,
  savePmsCard4AutomationRule,
  setPmsCard4AutomationRuleActive,
  testPmsCard4AutomationRule,
} from "@/packages/pms/lib/automation-rules-card4.functions";
import {
  AUTOMATION_CONDITION_FIELD_LABELS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_CONDITION_OPERATOR_LABELS,
  AUTOMATION_CONDITION_OPERATORS,
  AUTOMATION_RECIPIENT_KINDS,
  AUTOMATION_SCHEDULE_MODE_LABELS,
  AUTOMATION_SCHEDULE_MODES,
  automationRuleToDraft,
  emptyAutomationCondition,
  emptyAutomationRecipient,
  emptyAutomationRuleDraft,
  summarizeAutomationCondition,
  summarizeAutomationRecipient,
  summarizeAutomationSchedule,
  validateAutomationRuleDraft,
  type AutomationCondition,
  type AutomationRecipient,
  type AutomationRecipientKind,
  type AutomationRuleDraft,
  type AutomationRuleRecord,
  type AutomationSchedule,
  type AutomationScheduleMode,
} from "@/packages/pms/lib/automation-rules-card4.server";
import {
  COMMUNICATION_CHANNEL_LABELS,
  type CommunicationChannelType,
} from "@/packages/pms/lib/communication-channels-card4.server";
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
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/shared/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 8;
type StatusFilter = "all" | "active" | "inactive";
type PendingAction = AutomationRuleRecord | "new" | "reset" | null;

export function PmsCard4AutomationRules({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4AutomationRules);
  const save = useServerFn(savePmsCard4AutomationRule);
  const setActive = useServerFn(setPmsCard4AutomationRuleActive);
  const remove = useServerFn(deletePmsCard4AutomationRule);
  const sendTest = useServerFn(testPmsCard4AutomationRule);
  const queryKey = ["pms-card4-automation-rules", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const rules = useMemo(() => query.data?.rules ?? [], [query.data?.rules]);
  const events = useMemo(() => query.data?.events ?? [], [query.data?.events]);
  const channels = useMemo(() => query.data?.channels ?? [], [query.data?.channels]);
  const templates = useMemo(() => query.data?.templates ?? [], [query.data?.templates]);
  const departments = useMemo(() => query.data?.departments ?? [], [query.data?.departments]);
  const profileTypes = useMemo(() => query.data?.profileTypes ?? [], [query.data?.profileTypes]);
  const roles = useMemo(() => query.data?.roles ?? [], [query.data?.roles]);
  const catalogues = useMemo(
    () => ({ events, channels, templates, departments, profileTypes }),
    [events, channels, templates, departments, profileTypes],
  );

  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState<CommunicationChannelType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AutomationRuleDraft>(emptyAutomationRuleDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRuleRecord | null>(null);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  useEffect(() => {
    if (dirty || creating) return;
    if (rules.length === 0) {
      setSelectedId(null);
      setDraft(emptyAutomationRuleDraft(channels.find((row) => row.active)?.channelType));
      return;
    }
    const selected = rules.find((row) => row.id === selectedId) ?? rules[0];
    if (!selected) return;
    setSelectedId(selected.id);
    setDraft(automationRuleToDraft(selected));
  }, [rules, selectedId, dirty, creating, channels]);

  const errors = validateAutomationRuleDraft(draft, catalogues, false);
  const completeErrors = validateAutomationRuleDraft(draft, catalogues, true);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rules.filter((row) => {
      if (eventFilter !== "all" && row.eventId !== eventFilter) return false;
      if (channelFilter !== "all" && row.channelType !== channelFilter) return false;
      if (statusFilter === "active" && !row.active) return false;
      if (statusFilter === "inactive" && row.active) return false;
      if (!term) return true;
      const eventName = events.find((item) => item.id === row.eventId)?.name ?? "";
      const templateName = templates.find((item) => item.id === row.templateId)?.name ?? "";
      const condition = row.conditions
        .map((item) => summarizeAutomationCondition(item, profileTypes))
        .join(" ");
      const recipient = row.recipients
        .map((item) => summarizeAutomationRecipient(item, departments))
        .join(" ");
      return (
        row.name.toLowerCase().includes(term) ||
        eventName.toLowerCase().includes(term) ||
        templateName.toLowerCase().includes(term) ||
        COMMUNICATION_CHANNEL_LABELS[row.channelType].toLowerCase().includes(term) ||
        condition.toLowerCase().includes(term) ||
        recipient.toLowerCase().includes(term)
      );
    });
  }, [
    rules,
    search,
    eventFilter,
    channelFilter,
    statusFilter,
    events,
    templates,
    profileTypes,
    departments,
  ]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const matchingTemplates = useMemo(() => {
    const eventCode = events.find((row) => row.id === draft.eventId)?.code;
    return templates
      .filter((row) => row.channelType === draft.channelType)
      .sort((left, right) => {
        const leftMatch = eventCode && left.eventTrigger === eventCode ? 1 : 0;
        const rightMatch = eventCode && right.eventTrigger === eventCode ? 1 : 0;
        return rightMatch - leftMatch || left.name.localeCompare(right.name);
      });
  }, [templates, draft.channelType, draft.eventId, events]);

  const payload = {
    restaurantId,
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    eventId: draft.eventId,
    conditions: draft.conditions,
    recipients: draft.recipients,
    channelType: draft.channelType,
    templateId: draft.templateId,
    schedule: draft.schedule,
    active: draft.active,
  };
  const saveMutation = useMutation({
    mutationFn: () => save({ data: payload }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      setCreating(false);
      setDirty(false);
      if (result.id) setSelectedId(result.id);
      toast.success("Automation rule saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save automation rule."),
  });
  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Automation rule activated." : "Automation rule deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDeleteTarget(null);
      setCreating(false);
      setDirty(false);
      setSelectedId(null);
      toast.success("Automation rule deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: (id: string) => sendTest({ data: { restaurantId, id } }),
    onSuccess: (outcome) => {
      if (outcome.result === "sent") toast.success(outcome.message);
      else if (outcome.result === "unsupported") toast.warning(outcome.message);
      else toast.error(outcome.message);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to test automation rule."),
  });

  const busy =
    saveMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    testMutation.isPending;
  const dataReady = Boolean(query.data);
  const canSave = canEdit && dataReady && !busy && errors.length === 0;
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !dataReady) {
      toast.error("Unable to save automation rules.");
      return;
    }
    if (!creating && !dirty) {
      toast.success("Automation rules saved successfully.");
      onSaved(thenNextRef.current);
      return;
    }
    const blocking = thenNextRef.current ? completeErrors : errors;
    if (blocking.length > 0) {
      toast.error(blocking[0]?.message ?? "Fix the automation rule before saving.");
      return;
    }
    saveMutation.mutate(undefined, { onSuccess: () => onSaved(thenNextRef.current) });
  }, [
    saveRequest,
    canEdit,
    dataReady,
    creating,
    dirty,
    errors,
    completeErrors,
    onSaved,
    saveMutation,
  ]);

  function mark<K extends keyof AutomationRuleDraft>(key: K, value: AutomationRuleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function selectRule(row: AutomationRuleRecord) {
    if ((dirty || creating) && row.id !== selectedId) {
      setPendingAction(row);
      return;
    }
    setCreating(false);
    setSelectedId(row.id);
    setDraft(automationRuleToDraft(row));
    setDirty(false);
  }

  function startAdd() {
    if (dirty || creating) {
      setPendingAction("new");
      return;
    }
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyAutomationRuleDraft(channels.find((row) => row.active)?.channelType));
    setDirty(true);
  }

  function resetDraft() {
    if (creating) {
      setCreating(false);
      const selected = rules.find((row) => row.id === selectedId) ?? rules[0];
      setSelectedId(selected?.id ?? null);
      setDraft(
        selected
          ? automationRuleToDraft(selected)
          : emptyAutomationRuleDraft(channels.find((row) => row.active)?.channelType),
      );
    } else {
      const selected = rules.find((row) => row.id === selectedId);
      if (selected) setDraft(automationRuleToDraft(selected));
    }
    setDirty(false);
  }

  function discardAndContinue() {
    const next = pendingAction;
    setPendingAction(null);
    setDirty(false);
    if (next === "new") {
      setCreating(true);
      setSelectedId(null);
      setDraft(emptyAutomationRuleDraft(channels.find((row) => row.active)?.channelType));
      setDirty(true);
      return;
    }
    if (next === "reset") {
      resetDraft();
      return;
    }
    if (next) {
      setCreating(false);
      setSelectedId(next.id);
      setDraft(automationRuleToDraft(next));
    }
  }

  function updateCondition(index: number, patch: Partial<AutomationCondition>) {
    mark(
      "conditions",
      draft.conditions.map((row, current) => (current === index ? { ...row, ...patch } : row)),
    );
  }

  function updateRecipient(index: number, patch: Partial<AutomationRecipient>) {
    mark(
      "recipients",
      draft.recipients.map((row, current) => (current === index ? { ...row, ...patch } : row)),
    );
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-automation-rules">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-[#251605]">Automation Rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect events, conditions, recipients, and templates. Rules do not send until a later
              delivery phase.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
          </div>
          <Button
            type="button"
            onClick={startAdd}
            disabled={!canEdit || query.isLoading}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Rule
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#CCCCCC] p-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                className="pl-9"
                placeholder="Search rules..."
                aria-label="Search rules"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <Filter className="mr-1 size-4" /> Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Event</p>
                <DropdownMenuCheckboxItem
                  checked={eventFilter === "all"}
                  onCheckedChange={() => {
                    setEventFilter("all");
                    setPage(1);
                  }}
                >
                  All Events
                </DropdownMenuCheckboxItem>
                {events.map((event) => (
                  <DropdownMenuCheckboxItem
                    key={event.id}
                    checked={eventFilter === event.id}
                    onCheckedChange={() => {
                      setEventFilter(event.id);
                      setPage(1);
                    }}
                  >
                    {event.name}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Channel</p>
                <DropdownMenuCheckboxItem
                  checked={channelFilter === "all"}
                  onCheckedChange={() => {
                    setChannelFilter("all");
                    setPage(1);
                  }}
                >
                  All Channels
                </DropdownMenuCheckboxItem>
                {channels.map((channel) => (
                  <DropdownMenuCheckboxItem
                    key={channel.channelType}
                    checked={channelFilter === channel.channelType}
                    onCheckedChange={() => {
                      setChannelFilter(channel.channelType);
                      setPage(1);
                    }}
                  >
                    {COMMUNICATION_CHANNEL_LABELS[channel.channelType]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Status</p>
                {(["all", "active", "inactive"] as const).map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter === status}
                    onCheckedChange={() => {
                      setStatusFilter(status);
                      setPage(1);
                    }}
                  >
                    {status === "all"
                      ? "All Statuses"
                      : status === "active"
                        ? "Active"
                        : "Inactive"}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {query.isLoading ? (
            <div className="space-y-2 p-6">
              {["a", "b", "c"].map((row) => (
                <div key={row} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-6">
              <p className="text-sm text-destructive">Unable to load automation rules.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-[#251605]">No automation rules configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a rule to connect an event, channel, and template.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No rules match the current filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            paged.length > 0 && paged.every((row) => selectedRows.includes(row.id))
                          }
                          aria-label="Select all visible rules"
                          onCheckedChange={(checked) =>
                            setSelectedRows(
                              checked
                                ? Array.from(
                                    new Set([...selectedRows, ...paged.map((row) => row.id)]),
                                  )
                                : selectedRows.filter((id) => !paged.some((row) => row.id === id)),
                            )
                          }
                        />
                      </TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(selectedId === row.id && !creating && "bg-[#C89933]/5")}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.includes(row.id)}
                            aria-label={`Select ${row.name}`}
                            onCheckedChange={(checked) =>
                              setSelectedRows((current) =>
                                checked
                                  ? Array.from(new Set([...current, row.id]))
                                  : current.filter((id) => id !== row.id),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                        <TableCell>
                          {events.find((item) => item.id === row.eventId)?.name ??
                            "Unavailable event"}
                        </TableCell>
                        <TableCell>
                          {row.conditions.length === 0
                            ? "None"
                            : row.conditions
                                .map((item) => summarizeAutomationCondition(item, profileTypes))
                                .join("; ")}
                        </TableCell>
                        <TableCell>{COMMUNICATION_CHANNEL_LABELS[row.channelType]}</TableCell>
                        <TableCell>
                          {row.recipients.length === 0
                            ? "None"
                            : row.recipients
                                .map((item) => summarizeAutomationRecipient(item, departments))
                                .join("; ")}
                        </TableCell>
                        <TableCell>
                          {templates.find((item) => item.id === row.templateId)?.name ?? "Not set"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              row.active
                                ? "border-[#436436]/40 bg-[#436436]/10 text-[#436436]"
                                : "border-[#CCCCCC] bg-muted/40 text-muted-foreground",
                            )}
                          >
                            {row.active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => selectRule(row)}
                            >
                              Edit
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${row.name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => selectRule(row)}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit || testMutation.isPending}
                                  onSelect={() => testMutation.mutate(row.id)}
                                >
                                  Test Rule
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit}
                                  onSelect={() =>
                                    toggleMutation.mutate({ id: row.id, active: !row.active })
                                  }
                                >
                                  {row.active ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit}
                                  onSelect={() => setDeleteTarget(row)}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination className="border-t border-[#CCCCCC] py-3">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((current) => Math.max(1, current - 1));
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-sm text-muted-foreground">
                      {page} / {pageCount}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((current) => Math.min(pageCount, current + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-[#251605]">Rule Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select event, set conditions, choose recipients, then channel and template.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldShell
            id="automation-rule-name"
            label="Rule Name"
            required
            error={errorFor("name") ?? undefined}
          >
            <Input
              id="automation-rule-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) => mark("name", event.target.value)}
            />
          </FieldShell>
          <FieldShell
            id="automation-rule-event"
            label="Event"
            required
            error={errorFor("eventId") ?? undefined}
          >
            <Select
              value={draft.eventId}
              disabled={!canEdit}
              onValueChange={(value) => mark("eventId", value)}
            >
              <SelectTrigger id="automation-rule-event">
                <SelectValue placeholder="Select an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                    {event.active === false ? " (Inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#251605]">Conditions</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEdit}
              onClick={() => mark("conditions", [...draft.conditions, emptyAutomationCondition()])}
            >
              Add Condition
            </Button>
          </div>
          {draft.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No conditions. The rule applies to all matching events.
            </p>
          ) : (
            draft.conditions.map((condition, index) => (
              <div
                key={`${condition.field}-${index}`}
                className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <Select
                  value={condition.field}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    updateCondition(index, { field: value as AutomationCondition["field"] })
                  }
                >
                  <SelectTrigger aria-label={`Condition field ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_CONDITION_FIELDS.map((field) => (
                      <SelectItem key={field} value={field}>
                        {AUTOMATION_CONDITION_FIELD_LABELS[field]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    updateCondition(index, {
                      operator: value as AutomationCondition["operator"],
                    })
                  }
                >
                  <SelectTrigger aria-label={`Condition operator ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_CONDITION_OPERATORS.map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {AUTOMATION_CONDITION_OPERATOR_LABELS[operator]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.value}
                  disabled={!canEdit}
                  onValueChange={(value) => updateCondition(index, { value })}
                >
                  <SelectTrigger aria-label={`Condition value ${index + 1}`}>
                    <SelectValue placeholder="Select a guest type" />
                  </SelectTrigger>
                  <SelectContent>
                    {profileTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PropertySetupRemoveButton
                  disabled={!canEdit}
                  label="Remove condition"
                  onClick={() =>
                    mark(
                      "conditions",
                      draft.conditions.filter((_, current) => current !== index),
                    )
                  }
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#251605]">Recipients</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEdit}
              onClick={() => mark("recipients", [...draft.recipients, emptyAutomationRecipient()])}
            >
              Add Recipient
            </Button>
          </div>
          {errorFor("recipients") ? (
            <p className="text-xs text-destructive">{errorFor("recipients")}</p>
          ) : null}
          {draft.recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a department or role before activating the rule.
            </p>
          ) : (
            draft.recipients.map((recipient, index) => (
              <div
                key={`${recipient.kind}-${index}`}
                className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
              >
                <Select
                  value={recipient.kind}
                  disabled={!canEdit}
                  onValueChange={(value) => {
                    const kind = value as AutomationRecipientKind;
                    updateRecipient(index, {
                      kind,
                      id:
                        kind === "role"
                          ? "manager"
                          : (departments.find((row) => row.active)?.id ?? ""),
                    });
                  }}
                >
                  <SelectTrigger aria-label={`Recipient type ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_RECIPIENT_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {kind === "department" ? "Department" : "Role"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={recipient.id}
                  disabled={!canEdit}
                  onValueChange={(value) => updateRecipient(index, { id: value })}
                >
                  <SelectTrigger aria-label={`Recipient ${index + 1}`}>
                    <SelectValue placeholder="Select a recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipient.kind === "role"
                      ? roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))
                      : departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name}
                            {department.active === false ? " (Inactive)" : ""}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <PropertySetupRemoveButton
                  disabled={!canEdit}
                  label="Remove recipient"
                  onClick={() =>
                    mark(
                      "recipients",
                      draft.recipients.filter((_, current) => current !== index),
                    )
                  }
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <FieldShell
            id="automation-rule-channel"
            label="Channel"
            required
            error={errorFor("channelType") ?? undefined}
          >
            <Select
              value={draft.channelType}
              disabled={!canEdit}
              onValueChange={(value) => {
                const channelType = value as CommunicationChannelType;
                setDraft((current) => ({
                  ...current,
                  channelType,
                  templateId:
                    templates.find(
                      (row) => row.id === current.templateId && row.channelType === channelType,
                    )?.id ?? null,
                }));
                setDirty(true);
              }}
            >
              <SelectTrigger id="automation-rule-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.channelType} value={channel.channelType}>
                    {COMMUNICATION_CHANNEL_LABELS[channel.channelType]}
                    {!channel.active ? " (Inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <FieldShell
            id="automation-rule-template"
            label="Template"
            error={errorFor("templateId") ?? undefined}
          >
            <Select
              value={draft.templateId || "none"}
              disabled={!canEdit}
              onValueChange={(value) => mark("templateId", value === "none" ? null : value)}
            >
              <SelectTrigger id="automation-rule-template">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {matchingTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                    {!template.active ? " (Inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <FieldShell id="automation-rule-schedule" label="Schedule">
            <Select
              value={draft.schedule.mode}
              disabled={!canEdit}
              onValueChange={(value) => {
                const mode = value as AutomationScheduleMode;
                const next: AutomationSchedule =
                  mode === "delay"
                    ? { mode: "delay", delayMinutes: 15 }
                    : mode === "time_of_day"
                      ? { mode: "time_of_day", timeOfDay: "09:00" }
                      : { mode: "immediate" };
                mark("schedule", next);
              }}
            >
              <SelectTrigger id="automation-rule-schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_SCHEDULE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {AUTOMATION_SCHEDULE_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          {draft.schedule.mode === "delay" ? (
            <FieldShell
              id="automation-rule-delay"
              label="Delay (minutes)"
              error={errorFor("schedule.delayMinutes") ?? undefined}
            >
              <Input
                id="automation-rule-delay"
                type="number"
                min={1}
                max={10080}
                value={draft.schedule.delayMinutes}
                disabled={!canEdit}
                onChange={(event) =>
                  mark("schedule", {
                    mode: "delay",
                    delayMinutes: Number(event.target.value),
                  })
                }
              />
            </FieldShell>
          ) : draft.schedule.mode === "time_of_day" ? (
            <FieldShell
              id="automation-rule-time"
              label={`Time of day (${query.data?.timezone ?? "property timezone"})`}
              error={errorFor("schedule.timeOfDay") ?? undefined}
            >
              <Input
                id="automation-rule-time"
                type="time"
                value={draft.schedule.timeOfDay}
                disabled={!canEdit}
                onChange={(event) =>
                  mark("schedule", { mode: "time_of_day", timeOfDay: event.target.value })
                }
              />
            </FieldShell>
          ) : (
            <p className="self-end text-sm text-muted-foreground">
              {summarizeAutomationSchedule(draft.schedule)}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] p-4">
          <div>
            <Label htmlFor="automation-rule-active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Active rules may execute later. Inactive rules stay configured and do not send.
            </p>
          </div>
          <Switch
            id="automation-rule-active"
            checked={draft.active}
            disabled={!canEdit}
            onCheckedChange={(active) => mark("active", active)}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {draft.id ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || testMutation.isPending}
              onClick={() => testMutation.mutate(draft.id as string)}
            >
              {testMutation.isPending ? "Testing…" : "Test Rule"}
            </Button>
          ) : null}
          {(dirty || creating) && canEdit ? (
            <Button type="button" variant="outline" onClick={() => setPendingAction("reset")}>
              Cancel Changes
            </Button>
          ) : null}
        </div>
      </section>

      <AlertDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>
              Discard them before continuing with another automation rule?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndContinue}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.name} will be removed from this property. No notification history is deleted.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Card4AutomationRulesGuide({ rules }: { rules: readonly AutomationRuleRecord[] }) {
  const active = rules.filter((row) => row.active).length;
  return (
    <>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
          <li>Select a notification event</li>
          <li>Add optional guest-type conditions</li>
          <li>Choose departments or roles</li>
          <li>Pick a matching channel and template</li>
          <li>Test and activate the rule</li>
        </ol>
        <p className="mt-3 text-sm text-[#251605]">
          {active} of {rules.length} rules active
        </p>
      </section>
    </>
  );
}
