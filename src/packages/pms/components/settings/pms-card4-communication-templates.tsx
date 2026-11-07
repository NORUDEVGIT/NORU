import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlignLeft,
  Bold,
  Filter,
  Italic,
  Link as LinkIcon,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Underline,
} from "lucide-react";
import { toast } from "sonner";

import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { FieldShell } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  deletePmsCard4CommunicationTemplate,
  getPmsCard4CommunicationTemplates,
  previewPmsCard4CommunicationTemplate,
  savePmsCard4CommunicationTemplate,
  setPmsCard4CommunicationTemplateActive,
  testPmsCard4CommunicationTemplate,
} from "@/packages/pms/lib/communication-templates-card4.functions";
import { getPmsCard4NotificationEvents } from "@/packages/pms/lib/notification-events-card4.functions";
import {
  COMMUNICATION_TEMPLATE_CATEGORIES,
  COMMUNICATION_TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_MESSAGE_MAX,
  communicationTemplateChannelLabel,
  communicationTemplateToDraft,
  duplicateTemplateCode,
  emptyCommunicationTemplateDraft,
  eventsForCategory,
  renderTemplateText,
  sanitizeTemplateHtml,
  stripTemplateHtml,
  templateLanguageOptions,
  validateCommunicationTemplateDraft,
  variablesForCategory,
  type CommunicationTemplateCategory,
  type CommunicationTemplateDraft,
  type CommunicationTemplateRecord,
} from "@/packages/pms/lib/communication-templates-card4.server";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_TYPES,
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

const PAGE_SIZE = 8;
type StatusFilter = "all" | "active" | "inactive";

function applyEditorCommand(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function PmsCard4CommunicationTemplates({
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
  const load = useServerFn(getPmsCard4CommunicationTemplates);
  const save = useServerFn(savePmsCard4CommunicationTemplate);
  const setActive = useServerFn(setPmsCard4CommunicationTemplateActive);
  const remove = useServerFn(deletePmsCard4CommunicationTemplate);
  const preview = useServerFn(previewPmsCard4CommunicationTemplate);
  const sendTest = useServerFn(testPmsCard4CommunicationTemplate);
  const loadEvents = useServerFn(getPmsCard4NotificationEvents);
  const queryKey = ["pms-card4-communication-templates", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const templates = useMemo(() => query.data?.templates ?? [], [query.data?.templates]);
  const eventsQuery = useQuery({
    queryKey: ["pms-card4-notification-events", restaurantId],
    queryFn: () => loadEvents({ data: { restaurantId } }),
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryTab, setCategoryTab] = useState<"all" | CommunicationTemplateCategory>("all");
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CommunicationTemplateDraft>(emptyCommunicationTemplateDraft());
  const [dirty, setDirty] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunicationTemplateRecord | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);
  const thenNextRef = useRef(false);


  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== draft.message) {
      editorRef.current.innerHTML = draft.message || "";
    }
  }, [draft.id, draft.message, creating]);

  const errors = validateCommunicationTemplateDraft(draft, templates);
  const errorFor = (field: string) =>
    attemptedSave ? (errors.find((row) => row.field === field)?.message ?? null) : null;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((row) => {
      if (categoryTab !== "all" && row.category !== categoryTab) return false;
      if (statusFilter === "active" && !row.active) return false;
      if (statusFilter === "inactive" && row.active) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        COMMUNICATION_TEMPLATE_CATEGORY_LABELS[row.category].toLowerCase().includes(term) ||
        communicationTemplateChannelLabel(row.channelType).toLowerCase().includes(term)
      );
    });
  }, [templates, search, statusFilter, categoryTab]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const payload = {
    restaurantId,
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    code: draft.code,
    category: draft.category,
    eventTrigger: draft.eventTrigger,
    channelType: draft.channelType,
    language: draft.language,
    subject: draft.subject,
    message: draft.message,
    active: draft.active,
    allowManualSending: draft.allowManualSending,
    attachPdf: draft.attachPdf,
  };

  const saveMutation = useMutation({
    mutationFn: () => save({ data: payload }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      setCreating(false);
      setDirty(false);
      setEditorOpen(false);
      setAttemptedSave(false);
      toast.success("Communication template saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save communication template."),
  });
  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Template activated." : "Template deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDeleteTarget(null);
      setDirty(false);
      setCreating(false);
      setEditorOpen(false);
      toast.success("Communication template deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const previewMutation = useMutation({
    mutationFn: () =>
      preview({
        data: {
          restaurantId,
          name: draft.name,
          code: draft.code,
          category: draft.category,
          eventTrigger: draft.eventTrigger,
          channelType: draft.channelType,
          language: draft.language,
          subject: draft.subject,
          message: draft.message,
        },
      }),
    onError: (error: Error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: () => sendTest({ data: { ...payload, restaurantId } }),
    onSuccess: (outcome) => {
      if (outcome.result === "sent") toast.success(outcome.message);
      else if (outcome.result === "unsupported") toast.warning(outcome.message);
      else toast.error(outcome.message);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to send a test."),
  });

  const busy =
    saveMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    testMutation.isPending;
  useEffect(() => {
    onSavingChange(
      busy,
      canEdit &&
        Boolean(query.data) &&
        !busy &&
        (!editorOpen || errors.length === 0),
    );
  }, [busy, canEdit, query.data, editorOpen, errors.length, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !query.data) {
      toast.error("Unable to save communication templates.");
      return;
    }
    if (!editorOpen || (!creating && !dirty)) {
      toast.success("Communication templates saved successfully.");
      onSaved(thenNextRef.current);
      return;
    }
    if (errors.length > 0) {
      setAttemptedSave(true);
      toast.error(errors[0]?.message ?? "Fix the template before saving.");
      return;
    }
    saveMutation.mutate(undefined, { onSuccess: () => onSaved(thenNextRef.current) });
  }, [saveRequest, canEdit, query.data, editorOpen, creating, dirty, errors, onSaved, saveMutation]);

  function mark<K extends keyof CommunicationTemplateDraft>(
    key: K,
    value: CommunicationTemplateDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function selectTemplate(row: CommunicationTemplateRecord) {
    setCreating(false);
    setDraft(communicationTemplateToDraft(row));
    setDirty(false);
    setAttemptedSave(false);
    setEditorOpen(true);
  }

  function startAdd() {
    setCreating(true);
    setDraft(emptyCommunicationTemplateDraft());
    setDirty(true);
    setAttemptedSave(false);
    setEditorOpen(true);
  }

  function startDuplicate(row: CommunicationTemplateRecord) {
    setCreating(true);
    setDraft({
      ...communicationTemplateToDraft(row),
      id: null,
      name: `${row.name} copy`,
      code: duplicateTemplateCode(row.code, templates),
      active: false,
    });
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

  function submitTemplate() {
    setAttemptedSave(true);
    if (!canEdit || errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the template before saving.");
      return;
    }
    saveMutation.mutate();
  }

  function insertVariable(token: string) {
    const snippet = `{{${token}}}`;
    const editor = editorRef.current;
    if (editor && document.activeElement === editor) {
      document.execCommand("insertText", false, snippet);
      mark("message", editor.innerHTML);
      return;
    }
    const subjectEl = document.getElementById("template-subject");
    if (subjectEl && document.activeElement === subjectEl) {
      mark("subject", `${draft.subject}${draft.subject ? " " : ""}${snippet}`);
      return;
    }
    if (editor) {
      editor.focus();
      document.execCommand("insertText", false, snippet);
      mark("message", editor.innerHTML);
    } else {
      mark("message", `${draft.message}${snippet}`);
    }
  }

  const languages = templateLanguageOptions(draft.language);
  const events = useMemo(() => {
    const base = eventsForCategory(draft.category);
    const extras = (eventsQuery.data?.events ?? [])
      .filter(
        (row) =>
          row.category === draft.category && !base.some((item) => item.id === row.code),
      )
      .map((row) => ({ id: row.code, category: row.category, label: row.name }));
    return [...base, ...extras];
  }, [draft.category, eventsQuery.data?.events]);
  const variables = variablesForCategory(draft.category);
  const previewSubject = renderTemplateText(draft.subject);
  const previewBody = renderTemplateText(stripTemplateHtml(draft.message));

  return (
    <div className="space-y-3" data-testid="card4-communication-templates">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[#251605]">Communication Templates</h2>
          <Button
            type="button"
            size="sm"
            onClick={startAdd}
            disabled={!canEdit}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Template
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#CCCCCC] p-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                className="pl-9"
                placeholder="Search templates..."
                aria-label="Search templates"
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
              <DropdownMenuContent align="end">
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
                      ? "All statuses"
                      : status === "active"
                        ? "Active"
                        : "Inactive"}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Tabs
            value={categoryTab}
            onValueChange={(value) => {
              setCategoryTab(value as typeof categoryTab);
              setPage(1);
            }}
            className="px-3 pt-3"
          >
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {COMMUNICATION_TEMPLATE_CATEGORIES.map((category) => (
                <TabsTrigger key={category} value={category}>
                  {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[category]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {query.isLoading ? (
            <div className="space-y-2 p-6">
              {["a", "b", "c"].map((row) => (
                <div key={row} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-6">
              <p className="text-sm text-destructive">Unable to load communication templates.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-[#251605]">No communication templates configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a template to reuse later for notifications.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No templates match the current filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="py-2 font-medium text-[#251605]">
                          <div>{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.code}</div>
                        </TableCell>
                        <TableCell className="py-2">
                          {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[row.category]}
                        </TableCell>
                        <TableCell className="py-2">{row.eventTrigger}</TableCell>
                        <TableCell className="py-2">
                          {communicationTemplateChannelLabel(row.channelType)}
                        </TableCell>
                        <TableCell className="py-2">{row.language}</TableCell>
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
                                <DropdownMenuItem onSelect={() => selectTemplate(row)}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit}
                                  onSelect={() => startDuplicate(row)}
                                >
                                  Duplicate
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
        title={draft.id ? "Edit Communication Template" : "Add Communication Template"}
        onClose={requestClose}
        onSubmit={submitTemplate}
        submitLabel={draft.id ? "Save Changes" : "Add Template"}
        pending={saveMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-[960px]"
        className="max-h-[88vh]"
        footerJustify="between"
      >
        <p className="text-sm font-medium text-[#251605]">Template</p>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldShell
            id="template-name"
            label="Template Name"
            required
            error={errorFor("name") ?? undefined}
          >
            <Input
              id="template-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) => mark("name", event.target.value)}
            />
          </FieldShell>
          <FieldShell
            id="template-code"
            label="Template Code"
            required
            error={errorFor("code") ?? undefined}
          >
            <Input
              id="template-code"
              value={draft.code}
              placeholder="RES-001"
              disabled={!canEdit}
              onChange={(event) => mark("code", event.target.value.toUpperCase())}
            />
          </FieldShell>
          <FieldShell
            id="template-category"
            label="Category"
            required
            error={errorFor("category") ?? undefined}
          >
            <Select
              value={draft.category}
              disabled={!canEdit}
              onValueChange={(value) => {
                const category = value as CommunicationTemplateCategory;
                const nextEvent = eventsForCategory(category)[0]?.id ?? "";
                setDraft((current) => ({ ...current, category, eventTrigger: nextEvent }));
                setDirty(true);
              }}
            >
              <SelectTrigger id="template-category">
                <SelectValue />
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
            id="template-event"
            label="Event Trigger"
            required
            error={errorFor("eventTrigger") ?? undefined}
          >
            <Select
              value={draft.eventTrigger}
              disabled={!canEdit}
              onValueChange={(value) => mark("eventTrigger", value)}
            >
              <SelectTrigger id="template-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <FieldShell
            id="template-channel"
            label="Channel"
            required
            error={errorFor("channelType") ?? undefined}
          >
            <Select
              value={draft.channelType}
              disabled={!canEdit}
              onValueChange={(value) =>
                mark("channelType", value as CommunicationTemplateDraft["channelType"])
              }
            >
              <SelectTrigger id="template-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMUNICATION_CHANNEL_TYPES.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {COMMUNICATION_CHANNEL_LABELS[channel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
          <FieldShell
            id="template-language"
            label="Language"
            required
            error={errorFor("language") ?? undefined}
          >
            <Select
              value={draft.language}
              disabled={!canEdit}
              onValueChange={(value) => mark("language", value)}
            >
              <SelectTrigger id="template-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.id} value={language.id}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldShell>
        </div>
        <p className="text-sm font-medium text-[#251605]">Message</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <FieldShell
              id="template-subject"
              label="Subject"
              required
              error={errorFor("subject") ?? undefined}
            >
              <Input
                id="template-subject"
                value={draft.subject}
                placeholder="Your reservation at {{property.name}}"
                disabled={!canEdit}
                onChange={(event) => mark("subject", event.target.value)}
              />
            </FieldShell>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="template-message">
              Message <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-[#CCCCCC] bg-muted/30 p-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => applyEditorCommand("bold")}
              >
                <Bold className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => applyEditorCommand("italic")}
              >
                <Italic className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => applyEditorCommand("underline")}
              >
                <Underline className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => applyEditorCommand("insertUnorderedList")}
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => applyEditorCommand("justifyLeft")}
              >
                <AlignLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit}
                onClick={() => {
                  const href = window.prompt("Link URL");
                  if (href) applyEditorCommand("createLink", href);
                }}
              >
                <LinkIcon className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" disabled={!canEdit}>
                    Variables
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {variables.map((variable) => (
                    <DropdownMenuItem
                      key={variable.token}
                      onSelect={() => insertVariable(variable.token)}
                    >
                      {`{{${variable.token}}}`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div
              id="template-message"
              ref={editorRef}
              contentEditable={canEdit}
              className="min-h-40 rounded-b-lg border border-[#CCCCCC] p-3 text-sm outline-none"
              onInput={() =>
                mark("message", sanitizeTemplateHtml(editorRef.current?.innerHTML ?? ""))
              }
            />
            {errorFor("message") ? (
              <p className="text-xs text-destructive">{errorFor("message")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {draft.message.length}/{TEMPLATE_MESSAGE_MAX} characters
              </p>
            )}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => setShowVariables((value) => !value)}
            >
              {showVariables ? "Hide Available Variables" : "Show Available Variables"}
            </Button>
            {showVariables ? (
              <ul className="rounded-xl border border-dashed p-3 text-sm">
                {variables.map((variable) => (
                  <li key={variable.token}>
                    <button
                      type="button"
                      className="text-[#251605] underline-offset-2 hover:underline"
                      onClick={() => insertVariable(variable.token)}
                    >
                      {`{{${variable.token}}}`}
                    </button>
                    <span className="ml-2 text-muted-foreground">{variable.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <p className="text-sm font-medium text-[#251605]">Testing</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? "Previewing…" : "Preview"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? "Sending…" : "Send Test"}
          </Button>
        </div>
        {previewSubject || previewBody ? (
          <div className="rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] p-3 text-sm">
            <p className="font-medium">{previewSubject || "Untitled subject"}</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {previewBody || "Message preview appears here."}
            </p>
          </div>
        ) : null}

        <details className="rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[#251605]">
            Advanced Settings
          </summary>
          <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="template-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Available for normal notification use.
              </p>
            </div>
            <Switch
              id="template-active"
              checked={draft.active}
              disabled={!canEdit}
              onCheckedChange={(value) => mark("active", value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="template-manual">Allow manual sending</Label>
              <p className="text-xs text-muted-foreground">
                Can be selected later by supported workflows.
              </p>
            </div>
            <Switch
              id="template-manual"
              checked={draft.allowManualSending}
              disabled={!canEdit}
              onCheckedChange={(value) => mark("allowManualSending", value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="template-pdf">Attach PDF (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Stored for later delivery. PDF files are not generated here.
              </p>
            </div>
            <Switch
              id="template-pdf"
              checked={draft.attachPdf}
              disabled={!canEdit}
              onCheckedChange={(value) => mark("attachPdf", value)}
            />
          </div>
          </div>
        </details>
      </Card3OverlapSheet>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>
              Discard them to close this template form?
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
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.name} (${deleteTarget.code}) will be removed from this property. Historical messages are not deleted.`
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
