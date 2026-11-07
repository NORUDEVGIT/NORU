import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { FieldShell } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { getPmsCard4CommunicationChannels } from "@/packages/pms/lib/communication-channels-card4.functions";
import {
  COMMUNICATION_CHANNEL_LABELS,
  type CommunicationChannelRecord,
  type CommunicationChannelType,
} from "@/packages/pms/lib/communication-channels-card4.server";
import { getPmsCard4CommunicationTemplates } from "@/packages/pms/lib/communication-templates-card4.functions";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_CATEGORY_LABELS,
  type CommunicationTemplateRecord,
} from "@/packages/pms/lib/communication-templates-card4.server";
import {
  deletePmsCard4NotificationEvent,
  getPmsCard4NotificationEvents,
  savePmsCard4NotificationEvent,
  setPmsCard4NotificationEventActive,
  testPmsCard4NotificationEvent,
} from "@/packages/pms/lib/notification-events-card4.functions";
import {
  NOTIFICATION_EVENT_MODULE_LABELS,
  NOTIFICATION_EVENT_MODULES,
  type NotificationEventModule,
  type NotificationEventRecord,
} from "@/packages/pms/lib/notification-events-card4.server";
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
import { Textarea } from "@/shared/components/ui/textarea";

const PAGE_SIZE = 8;

type StatusFilter = "all" | "active" | "inactive";

type NotificationEventDraft = {
  id: string | null;
  code: string;
  name: string;
  module: NotificationEventModule;
  category: (typeof COMMUNICATION_TEMPLATE_CATEGORIES)[number];
  description: string;
  defaultChannelType: CommunicationChannelType | "";
  defaultTemplateId: string;
  active: boolean;
  isSystem: boolean;
};

function isSystemEvent(row: NotificationEventRecord): boolean {
  return row.isSystem === true;
}

function emptyDraft(channels: readonly CommunicationChannelRecord[]): NotificationEventDraft {
  return {
    id: null,
    code: "",
    name: "",
    module: "reservations",
    category: "reservation",
    description: "",
    defaultChannelType: channels.find((row) => row.active)?.channelType ?? "email",
    defaultTemplateId: "",
    active: false,
    isSystem: false,
  };
}

function eventToDraft(row: NotificationEventRecord): NotificationEventDraft {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    module: row.module,
    category: row.category,
    description: row.description,
    defaultChannelType: row.defaultChannelType ?? "",
    defaultTemplateId: row.defaultTemplateId ?? "",
    active: row.active,
    isSystem: isSystemEvent(row),
  };
}

function validateDraft(draft: NotificationEventDraft): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  if (!draft.name.trim()) errors.push({ field: "name", message: "Event name is required." });
  else if (draft.name.trim().length > 80) {
    errors.push({ field: "name", message: "Event name must be 80 characters or fewer." });
  }
  if (!draft.module) errors.push({ field: "module", message: "Choose a module." });
  if (!draft.category) errors.push({ field: "category", message: "Choose a category." });
  if (draft.description.length > 500) {
    errors.push({
      field: "description",
      message: "Description must be 500 characters or fewer.",
    });
  }
  if (!draft.defaultChannelType) {
    errors.push({ field: "defaultChannelType", message: "Choose a default channel." });
  }
  if (draft.active && !draft.defaultTemplateId) {
    errors.push({ field: "defaultTemplateId", message: "Choose a template before activating this event." });
  }
  return errors;
}

function channelLabel(channelType: CommunicationChannelType | null): string {
  return channelType ? COMMUNICATION_CHANNEL_LABELS[channelType] : "Not set";
}

function templateLabel(
  id: string | null,
  templates: readonly CommunicationTemplateRecord[],
): string {
  if (!id) return "Not set";
  return templates.find((row) => row.id === id)?.name ?? "Unavailable template";
}

export function PmsCard4NotificationEvents({
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
  const loadEvents = useServerFn(getPmsCard4NotificationEvents);
  const loadChannels = useServerFn(getPmsCard4CommunicationChannels);
  const loadTemplates = useServerFn(getPmsCard4CommunicationTemplates);
  const save = useServerFn(savePmsCard4NotificationEvent);
  const setActive = useServerFn(setPmsCard4NotificationEventActive);
  const remove = useServerFn(deletePmsCard4NotificationEvent);
  const sendTest = useServerFn(testPmsCard4NotificationEvent);
  const eventsQueryKey = ["pms-card4-notification-events", restaurantId];
  const eventsQuery = useQuery({
    queryKey: eventsQueryKey,
    queryFn: () => loadEvents({ data: { restaurantId } }),
    retry: false,
  });
  const channelsQuery = useQuery({
    queryKey: ["pms-card4-communication-channels", restaurantId],
    queryFn: () => loadChannels({ data: { restaurantId } }),
    retry: false,
  });
  const templatesQuery = useQuery({
    queryKey: ["pms-card4-communication-templates", restaurantId],
    queryFn: () => loadTemplates({ data: { restaurantId } }),
    retry: false,
  });
  const events = useMemo(() => eventsQuery.data?.events ?? [], [eventsQuery.data?.events]);
  const channels = useMemo(
    () => channelsQuery.data?.channels ?? [],
    [channelsQuery.data?.channels],
  );
  const templates = useMemo(
    () => templatesQuery.data?.templates ?? [],
    [templatesQuery.data?.templates],
  );
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState<CommunicationChannelType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NotificationEventDraft>(() => emptyDraft([]));
  const [dirty, setDirty] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotificationEventRecord | null>(null);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);
  const thenNextRef = useRef(false);

  const errors = validateDraft(draft);
  const errorFor = (field: string) =>
    attemptedSave ? (errors.find((row) => row.field === field)?.message ?? null) : null;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((row) => {
      if (moduleFilter !== "all" && row.module !== moduleFilter) return false;
      if (channelFilter !== "all" && row.defaultChannelType !== channelFilter) return false;
      if (statusFilter === "active" && !row.active) return false;
      if (statusFilter === "inactive" && row.active) return false;
      if (!term) return true;
      const channel = channelLabel(row.defaultChannelType).toLowerCase();
      const template = templateLabel(row.defaultTemplateId, templates).toLowerCase();
      return (
        row.name.toLowerCase().includes(term) ||
        NOTIFICATION_EVENT_MODULE_LABELS[row.module].toLowerCase().includes(term) ||
        COMMUNICATION_TEMPLATE_CATEGORY_LABELS[row.category].toLowerCase().includes(term) ||
        channel.includes(term) ||
        template.includes(term)
      );
    });
  }, [events, search, moduleFilter, channelFilter, statusFilter, templates]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const matchingTemplates = useMemo(() => {
    if (!draft.defaultChannelType) return [];
    return templates
      .filter((row) => row.channelType === draft.defaultChannelType)
      .sort((left, right) => {
        const leftMatches = draft.code && left.eventTrigger === draft.code ? 1 : 0;
        const rightMatches = draft.code && right.eventTrigger === draft.code ? 1 : 0;
        return rightMatches - leftMatches || left.name.localeCompare(right.name);
      });
  }, [templates, draft.defaultChannelType, draft.code]);

  const payload = {
    restaurantId,
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    code: draft.code,
    module: draft.module,
    category: draft.category,
    description: draft.description,
    defaultChannelType: draft.defaultChannelType as CommunicationChannelType,
    defaultTemplateId: draft.defaultTemplateId || null,
    active: draft.active,
  };
  const saveMutation = useMutation({
    mutationFn: () => save({ data: payload }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: eventsQueryKey });
      setCreating(false);
      setDirty(false);
      setEditorOpen(false);
      setAttemptedSave(false);
      toast.success("Notification event saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save notification event."),
  });
  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: eventsQueryKey });
      toast.success(input.active ? "Notification event activated." : "Notification event deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsQueryKey });
      setDeleteTarget(null);
      setCreating(false);
      setDirty(false);
      setEditorOpen(false);
      toast.success("Notification event deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: (id: string) => sendTest({ data: { restaurantId, id } }),
    onSuccess: (outcome) => {
      if (outcome.result === "sent" || outcome.result === "verified") {
        toast.success(outcome.message);
      } else if (outcome.result === "unsupported") {
        toast.warning(outcome.message);
      } else {
        toast.error(outcome.message);
      }
    },
    onError: (error: Error) => toast.error(error.message || "Unable to test notification event."),
  });

  const busy =
    saveMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    testMutation.isPending;
  const dataReady = Boolean(eventsQuery.data && channelsQuery.data && templatesQuery.data);
  const canSave = canEdit && dataReady && !busy && (!editorOpen || errors.length === 0);
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !dataReady) {
      toast.error("Unable to save notification events.");
      return;
    }
    if (!editorOpen || (!creating && !dirty)) {
      toast.success("Notification events saved successfully.");
      onSaved(thenNextRef.current);
      return;
    }
    if (errors.length > 0) {
      setAttemptedSave(true);
      toast.error(errors[0]?.message ?? "Fix the notification event before saving.");
      return;
    }
    saveMutation.mutate(undefined, {
      onSuccess: () => onSaved(thenNextRef.current),
    });
  }, [
    saveRequest,
    canEdit,
    dataReady,
    editorOpen,
    creating,
    dirty,
    errors,
    onSaved,
    saveMutation,
  ]);

  function mark<K extends keyof NotificationEventDraft>(
    key: K,
    value: NotificationEventDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function selectEvent(row: NotificationEventRecord) {
    setCreating(false);
    setDraft(eventToDraft(row));
    setDirty(false);
    setAttemptedSave(false);
    setEditorOpen(true);
  }

  function startAdd() {
    setCreating(true);
    setDraft(emptyDraft(channels));
    setDirty(true);
    setAttemptedSave(false);
    setEditorOpen(true);
  }

  function requestClose() {
    if (dirty) setPendingClose(true);
    else {
      setEditorOpen(false);
      setCreating(false);
    }
  }

  function submitEvent() {
    setAttemptedSave(true);
    if (!canEdit || errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the notification event before saving.");
      return;
    }
    saveMutation.mutate();
  }

  const loading = eventsQuery.isLoading || channelsQuery.isLoading || templatesQuery.isLoading;
  const loadError = eventsQuery.isError || channelsQuery.isError || templatesQuery.isError;
  return (
    <div className="space-y-3" data-testid="card4-notification-events">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[#251605]">Notification Events</h2>
          <Button
            type="button"
            size="sm"
            onClick={startAdd}
            disabled={!canEdit || loading}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Event
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#CCCCCC] p-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                className="pl-9"
                placeholder="Search events..."
                aria-label="Search events"
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
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Module</p>
                <DropdownMenuCheckboxItem
                  checked={moduleFilter === "all"}
                  onCheckedChange={() => {
                    setModuleFilter("all");
                    setPage(1);
                  }}
                >
                  All Modules
                </DropdownMenuCheckboxItem>
                {NOTIFICATION_EVENT_MODULES.map((module) => (
                  <DropdownMenuCheckboxItem
                    key={module}
                    checked={moduleFilter === module}
                    onCheckedChange={() => {
                      setModuleFilter(module);
                      setPage(1);
                    }}
                  >
                    {NOTIFICATION_EVENT_MODULE_LABELS[module]}
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
                    key={channel.id}
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

          {loading ? (
            <div className="space-y-2 p-6">
              {["a", "b", "c"].map((row) => (
                <div key={row} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : loadError ? (
            <div className="p-6">
              <p className="text-sm text-destructive">Unable to load notification events.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void eventsQuery.refetch();
                  void channelsQuery.refetch();
                  void templatesQuery.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-[#251605]">No notification events configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add an event to connect a channel and communication template.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No events match the current filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Default Channel</TableHead>
                      <TableHead>Default Template</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="py-2 font-medium text-[#251605]">{row.name}</TableCell>
                        <TableCell className="py-2">{NOTIFICATION_EVENT_MODULE_LABELS[row.module]}</TableCell>
                        <TableCell className="py-2">
                          {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[row.category]}
                        </TableCell>
                        <TableCell className="py-2">{channelLabel(row.defaultChannelType)}</TableCell>
                        <TableCell className="py-2">{templateLabel(row.defaultTemplateId, templates)}</TableCell>
                        <TableCell className="py-2">
                          <Switch
                            checked={row.active}
                            disabled={!canEdit || toggleMutation.isPending}
                            aria-label={`${row.active ? "Deactivate" : "Activate"} ${row.name}`}
                            onCheckedChange={(active) =>
                              toggleMutation.mutate({ id: row.id, active })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-2 text-right">
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
                                <DropdownMenuItem onSelect={() => selectEvent(row)}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit || testMutation.isPending}
                                  onSelect={() => testMutation.mutate(row.id)}
                                >
                                  Test Event
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit}
                                  onSelect={() =>
                                    toggleMutation.mutate({ id: row.id, active: !row.active })
                                  }
                                >
                                  {row.active ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                {!isSystemEvent(row) ? (
                                  <DropdownMenuItem
                                    disabled={!canEdit}
                                    onSelect={() => setDeleteTarget(row)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <Card3OverlapSheet
        open={editorOpen}
        title={draft.id ? "Edit Notification Event" : "Add Notification Event"}
        onClose={requestClose}
        onSubmit={submitEvent}
        submitLabel={draft.id ? "Save Changes" : "Add Event"}
        pending={saveMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-[880px]"
        className="max-h-[88vh]"
        footerJustify="between"
      >
        {draft.isSystem ? (
          <p className="text-xs text-muted-foreground">
            System events keep their module and category. Other fields remain editable.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <FieldShell
            id="notification-event-name"
            label="Event Name"
            required
            error={errorFor("name") ?? undefined}
          >
            <Input
              id="notification-event-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) => mark("name", event.target.value)}
            />
          </FieldShell>
          <FieldShell
            id="notification-event-module"
            label="Module"
            required
            error={errorFor("module") ?? undefined}
          >
            <Select
              value={draft.module}
              disabled={!canEdit || draft.isSystem}
              onValueChange={(value) => mark("module", value as NotificationEventModule)}
            >
              <SelectTrigger id="notification-event-module">
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_EVENT_MODULES.map((module) => (
                  <SelectItem key={module} value={module}>
                    {NOTIFICATION_EVENT_MODULE_LABELS[module]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <FieldShell
            id="notification-event-category"
            label="Category"
            required
            error={errorFor("category") ?? undefined}
          >
            <Select
              value={draft.category}
              disabled={!canEdit || draft.isSystem}
              onValueChange={(value) =>
                mark("category", value as (typeof COMMUNICATION_TEMPLATE_CATEGORIES)[number])
              }
            >
              <SelectTrigger id="notification-event-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {COMMUNICATION_TEMPLATE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <FieldShell
            id="notification-event-channel"
            label="Default Channel"
            required
            error={errorFor("defaultChannelType") ?? undefined}
          >
            <Select
              value={draft.defaultChannelType}
              disabled={!canEdit}
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  defaultChannelType: value as CommunicationChannelType,
                  defaultTemplateId:
                    templates.find(
                      (row) =>
                        row.id === current.defaultTemplateId && row.channelType === value,
                    )?.id ?? "",
                }));
                setDirty(true);
              }}
            >
              <SelectTrigger id="notification-event-channel">
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.channelType}>
                    {COMMUNICATION_CHANNEL_LABELS[channel.channelType]}
                    {!channel.active ? " (Inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <div className="md:col-span-2">
            <FieldShell
              id="notification-event-description"
              label="Description"
              error={errorFor("description") ?? undefined}
            >
              <Textarea
                id="notification-event-description"
                rows={4}
                maxLength={500}
                value={draft.description}
                disabled={!canEdit}
                placeholder="Describe when this event occurs."
                onChange={(event) => mark("description", event.target.value)}
              />
            </FieldShell>
          </div>
          <div className="md:col-span-2">
            <FieldShell
              id="notification-event-template"
              label="Default Template"
              error={errorFor("defaultTemplateId") ?? undefined}
              help={
                draft.defaultChannelType
                  ? "Templates use the selected channel; matching event templates appear first."
                  : "Select a default channel first."
              }
            >
              <Select
                value={draft.defaultTemplateId || "none"}
                disabled={!canEdit || !draft.defaultChannelType}
                onValueChange={(value) => mark("defaultTemplateId", value === "none" ? "" : value)}
              >
                <SelectTrigger id="notification-event-template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {matchingTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {draft.code && template.eventTrigger === draft.code ? " · Event match" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] p-4">
          <div>
            <Label htmlFor="notification-event-active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Active events can trigger notifications through their default channel.
            </p>
          </div>
          <Switch
            id="notification-event-active"
            checked={draft.active}
            disabled={!canEdit}
            onCheckedChange={(active) => mark("active", active)}
          />
        </div>

        {draft.id ? (
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || testMutation.isPending}
            onClick={() => testMutation.mutate(draft.id as string)}
          >
            {testMutation.isPending ? "Testing…" : "Test Event"}
          </Button>
        ) : null}
      </Card3OverlapSheet>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>
              Discard them to close this notification event form?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setEditorOpen(false);
                setCreating(false);
                setDirty(false);
                setAttemptedSave(false);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.name} will be removed from this property. Existing notification history is not deleted.`
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
