import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Filter, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  getPmsCard4CommunicationChannels,
  savePmsCard4CommunicationChannel,
  setPmsCard4CommunicationChannelActive,
  testPmsCard4CommunicationChannel,
} from "@/packages/pms/lib/communication-channels-card4.functions";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_TYPES,
  communicationChannelToDraft,
  communicationProvider,
  communicationProviderLabel,
  communicationProviders,
  emptyCommunicationChannelDraft,
  providerFields,
  sanitizeCommunicationProviderConfig,
  validateCommunicationChannelDraft,
  type CommunicationChannelDraft,
  type CommunicationChannelRecord,
  type CommunicationChannelType,
} from "@/packages/pms/lib/communication-channels-card4.server";
import {
  INTEGRATION_AUTH_METHOD_LABELS,
  type IntegrationAuthMethod,
  type IntegrationField,
} from "@/packages/pms/lib/integrations-catalog";
import {
  FieldShell,
  SecretInput,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
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
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type StatusFilter = "all" | "active" | "inactive";

function configurationSummary(row: CommunicationChannelRecord): string {
  if (row.channelType === "email" && row.senderEmail) return row.senderEmail;
  const configured = Object.keys(row.providerConfig).length;
  if (configured > 0) {
    return `${configured} provider ${configured === 1 ? "setting" : "settings"}`;
  }
  return row.active ? "Configuration required" : "Not configured";
}

export function PmsCard4CommunicationChannels({
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
  const load = useServerFn(getPmsCard4CommunicationChannels);
  const save = useServerFn(savePmsCard4CommunicationChannel);
  const setActive = useServerFn(setPmsCard4CommunicationChannelActive);
  const testConnection = useServerFn(testPmsCard4CommunicationChannel);
  const queryKey = ["pms-card4-communication-channels", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const channels = useMemo(() => query.data?.channels ?? [], [query.data?.channels]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommunicationChannelDraft>(emptyCommunicationChannelDraft());
  const [dirty, setDirty] = useState(false);
  const [detailsTab, setDetailsTab] = useState("general");
  const [pendingSelection, setPendingSelection] = useState<CommunicationChannelRecord | null>(null);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  useEffect(() => {
    if (channels.length === 0 || dirty) return;
    const selected = channels.find((row) => row.id === selectedId) ?? channels[0];
    if (!selected) return;
    setSelectedId(selected.id);
    setDraft(communicationChannelToDraft(selected));
  }, [channels, selectedId, dirty]);

  const errors = validateCommunicationChannelDraft(draft, channels);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return channels.filter((row) => {
      if (statusFilter === "active" && !row.active) return false;
      if (statusFilter === "inactive" && row.active) return false;
      if (!term) return true;
      return (
        COMMUNICATION_CHANNEL_LABELS[row.channelType].toLowerCase().includes(term) ||
        communicationProviderLabel(row).toLowerCase().includes(term) ||
        configurationSummary(row).toLowerCase().includes(term)
      );
    });
  }, [channels, search, statusFilter]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          channelType: draft.channelType,
          provider: draft.provider,
          authMethod: draft.authMethod,
          senderName: draft.senderName,
          senderEmail: draft.senderEmail,
          replyToEmail: draft.replyToEmail,
          signature: draft.signature,
          providerConfig: sanitizeCommunicationProviderConfig(
            draft.channelType,
            draft.provider,
            draft.providerValues,
          ),
          active: draft.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDirty(false);
      toast.success("Communication channel saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save communication channel."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        input.active ? "Communication channel activated." : "Communication channel deactivated.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      testConnection({
        data: {
          restaurantId,
          channelType: draft.channelType,
          provider: draft.provider,
          authMethod: draft.authMethod,
          senderName: draft.senderName,
          senderEmail: draft.senderEmail,
          replyToEmail: draft.replyToEmail,
          signature: draft.signature,
          sessionValues: draft.providerValues,
        },
      }),
    onSuccess: (outcome) => {
      if (outcome.result === "verified") toast.success(outcome.message);
      else if (outcome.result === "unsupported") toast.warning(outcome.message);
      else toast.error(outcome.message);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to test this channel."),
  });

  const busy = saveMutation.isPending || toggleMutation.isPending || testMutation.isPending;
  const canSave = canEdit && Boolean(query.data) && !busy && errors.length === 0;
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !query.data) {
      toast.error("Unable to save communication channels.");
      return;
    }
    if (errors.length > 0) {
      setDetailsTab(
        errors.some((row) => providerFields(draft).some((field) => field.id === row.field))
          ? "provider"
          : "general",
      );
      toast.error(errors[0]?.message ?? "Fix the communication channel before saving.");
      return;
    }
    if (dirty) {
      saveMutation.mutate(undefined, {
        onSuccess: () => onSaved(thenNextRef.current),
      });
      return;
    }
    toast.success("Communication channels saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, query.data, errors, dirty, draft, onSaved, saveMutation]);

  function mark<K extends keyof CommunicationChannelDraft>(
    key: K,
    value: CommunicationChannelDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateProviderValue(id: string, value: string | number | boolean) {
    mark("providerValues", { ...draft.providerValues, [id]: value });
  }

  function selectChannel(row: CommunicationChannelRecord) {
    if (dirty && row.id !== selectedId) {
      setPendingSelection(row);
      return;
    }
    setSelectedId(row.id);
    setDraft(communicationChannelToDraft(row));
    setDetailsTab("general");
    setDirty(false);
  }

  function chooseProvider(provider: string) {
    const definition = communicationProvider(draft.channelType, provider);
    mark("provider", provider);
    setDraft((current) => ({
      ...current,
      provider,
      authMethod: definition?.authMethods[0] ?? "none",
      providerValues: {},
    }));
  }

  function chooseChannelType(channelType: CommunicationChannelType) {
    const row = channels.find((channel) => channel.channelType === channelType);
    if (row) selectChannel(row);
  }

  function startAdd() {
    const candidate = channels.find((row) => !row.active) ?? channels[0];
    if (candidate) selectChannel(candidate);
  }

  function renderProviderField(field: IntegrationField) {
    const id = `communication-provider-${field.id}`;
    const value = draft.providerValues[field.id];
    const error = errorFor(field.id);
    const shell = {
      id,
      label: field.label,
      required: field.required,
      help: field.help,
      error: error ?? undefined,
    };
    if (field.type === "secret") {
      return (
        <FieldShell key={field.id} {...shell}>
          <SecretInput
            id={id}
            value={String(value ?? "")}
            placeholder={field.placeholder ?? "Enter for this test session"}
            disabled={!canEdit}
            invalid={Boolean(error)}
            onChange={(next) => updateProviderValue(field.id, next)}
          />
        </FieldShell>
      );
    }
    if (field.type === "select") {
      return (
        <FieldShell key={field.id} {...shell}>
          <Select
            value={String(value ?? "") || undefined}
            disabled={!canEdit}
            onValueChange={(next) => updateProviderValue(field.id, next)}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      );
    }
    if (field.type === "toggle") {
      return (
        <div
          key={field.id}
          className="flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div>
            <Label htmlFor={id}>{field.label}</Label>
            {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          </div>
          <Switch
            id={id}
            checked={value === true}
            disabled={!canEdit}
            onCheckedChange={(next) => updateProviderValue(field.id, next)}
          />
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <FieldShell key={field.id} {...shell}>
          <Textarea
            id={id}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            disabled={!canEdit}
            onChange={(event) => updateProviderValue(field.id, event.target.value)}
          />
        </FieldShell>
      );
    }
    return (
      <FieldShell key={field.id} {...shell}>
        <Input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          disabled={!canEdit}
          min={field.min}
          max={field.max}
          onChange={(event) =>
            updateProviderValue(
              field.id,
              field.type === "number" && event.target.value !== ""
                ? Number(event.target.value)
                : event.target.value,
            )
          }
        />
      </FieldShell>
    );
  }

  const fields = providerFields(draft);
  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-communication-channels">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-[#251605]">Communication Channels</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure how this property communicates with guests and staff.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
          </div>
          <Button
            type="button"
            onClick={startAdd}
            disabled={!canEdit || channels.length === 0}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Channel
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
          <div className="flex flex-wrap gap-2 border-b border-[#CCCCCC] p-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                className="pl-9"
                placeholder="Search channel..."
                aria-label="Search channel"
                onChange={(event) => setSearch(event.target.value)}
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
                    onCheckedChange={() => setStatusFilter(status)}
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
          {query.isLoading ? (
            <div className="space-y-2 p-6">
              {["a", "b", "c"].map((row) => (
                <div key={row} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-6">
              <p className="text-sm text-destructive">Unable to load communication channels.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : channels.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-[#251605]">No communication channels configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add one of the supported property communication channels.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          visible.length > 0 &&
                          visible.every((row) => selectedRows.includes(row.id))
                        }
                        aria-label="Select all visible channels"
                        onCheckedChange={(checked) =>
                          setSelectedRows(
                            checked
                              ? Array.from(
                                  new Set([...selectedRows, ...visible.map((row) => row.id)]),
                                )
                              : selectedRows.filter((id) => !visible.some((row) => row.id === id)),
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(selectedId === row.id && "bg-[#C89933]/5")}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.includes(row.id)}
                          aria-label={`Select ${COMMUNICATION_CHANNEL_LABELS[row.channelType]}`}
                          onCheckedChange={(checked) =>
                            setSelectedRows((current) =>
                              checked
                                ? Array.from(new Set([...current, row.id]))
                                : current.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-[#251605]">
                        {COMMUNICATION_CHANNEL_LABELS[row.channelType]}
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
                      <TableCell>{communicationProviderLabel(row)}</TableCell>
                      <TableCell>{configurationSummary(row)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => selectChannel(row)}
                          >
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${COMMUNICATION_CHANNEL_LABELS[row.channelType]}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => selectChannel(row)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canEdit}
                                onSelect={() =>
                                  toggleMutation.mutate({
                                    id: row.id,
                                    active: !row.active,
                                  })
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
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
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-[#251605]">Channel Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure the selected property communication channel.
            </p>
          </div>
          <div className="min-w-[14rem] space-y-1">
            <Label htmlFor="channel-details-selector">Channel</Label>
            <Select
              value={draft.channelType}
              disabled={channels.length === 0}
              onValueChange={(value) => chooseChannelType(value as CommunicationChannelType)}
            >
              <SelectTrigger id="channel-details-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((row) => (
                  <SelectItem key={row.id} value={row.channelType}>
                    {COMMUNICATION_CHANNEL_LABELS[row.channelType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={detailsTab} onValueChange={setDetailsTab} className="mt-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="provider">Provider Settings</TabsTrigger>
            <TabsTrigger value="message">Message Settings</TabsTrigger>
            <TabsTrigger value="signature">Signature</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-3">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell
                id="channel-sender-name"
                label="Sender Name"
                required
                error={errorFor("senderName") ?? undefined}
              >
                <Input
                  id="channel-sender-name"
                  value={draft.senderName}
                  disabled={!canEdit}
                  onChange={(event) => mark("senderName", event.target.value)}
                />
              </FieldShell>
              <FieldShell
                id="channel-provider"
                label="Provider"
                required
                error={errorFor("provider") ?? undefined}
              >
                <Select value={draft.provider} disabled={!canEdit} onValueChange={chooseProvider}>
                  <SelectTrigger id="channel-provider">
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {communicationProviders(draft.channelType).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
              {draft.channelType === "email" ? (
                <>
                  <FieldShell
                    id="channel-sender-email"
                    label="Sender Email"
                    required={draft.active}
                    error={errorFor("senderEmail") ?? undefined}
                  >
                    <Input
                      id="channel-sender-email"
                      type="email"
                      value={draft.senderEmail}
                      disabled={!canEdit}
                      onChange={(event) => mark("senderEmail", event.target.value)}
                    />
                  </FieldShell>
                  <FieldShell
                    id="channel-reply-email"
                    label="Reply-To Email"
                    error={errorFor("replyToEmail") ?? undefined}
                  >
                    <Input
                      id="channel-reply-email"
                      type="email"
                      value={draft.replyToEmail}
                      disabled={!canEdit}
                      onChange={(event) => mark("replyToEmail", event.target.value)}
                    />
                  </FieldShell>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[#CCCCCC] p-3">
              <div>
                <Label htmlFor="channel-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Active channels can be selected for normal communication.
                </p>
              </div>
              <Switch
                id="channel-active"
                checked={draft.active}
                disabled={!canEdit}
                onCheckedChange={(active) => mark("active", active)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? "Testing…" : "Test Connection"}
            </Button>
          </TabsContent>

          <TabsContent value="provider" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              Credentials are used only for this test session and are never saved.
            </p>
            {communicationProvider(draft.channelType, draft.provider)?.authMethods.length ? (
              <FieldShell
                id="channel-auth-method"
                label="Authentication"
                required
                error={errorFor("authMethod") ?? undefined}
              >
                <Select
                  value={draft.authMethod}
                  disabled={!canEdit}
                  onValueChange={(value) => mark("authMethod", value as IntegrationAuthMethod)}
                >
                  <SelectTrigger id="channel-auth-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      communicationProvider(draft.channelType, draft.provider)?.authMethods ?? []
                    ).map((method) => (
                      <SelectItem key={method} value={method}>
                        {INTEGRATION_AUTH_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            ) : null}
            {fields.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">{fields.map(renderProviderField)}</div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                This built-in channel requires no external provider settings.
              </p>
            )}
          </TabsContent>

          <TabsContent value="message" className="pt-3">
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No channel-level message settings are required for this provider. Templates and
              notification events are configured in later phases.
            </p>
          </TabsContent>

          <TabsContent value="signature" className="space-y-2 pt-3">
            <Label htmlFor="channel-signature">Signature</Label>
            <Textarea
              id="channel-signature"
              rows={7}
              maxLength={4000}
              value={draft.signature}
              disabled={!canEdit}
              placeholder="Enter the signature appended to messages from this channel."
              onChange={(event) => mark("signature", event.target.value)}
            />
            {errorFor("signature") ? (
              <p className="text-xs text-destructive">{errorFor("signature")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {draft.signature.length}/4000 characters
              </p>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="pt-3">
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No advanced channel controls are available in this phase.
            </p>
          </TabsContent>
        </Tabs>
      </section>

      <AlertDialog
        open={Boolean(pendingSelection)}
        onOpenChange={(open) => !open && setPendingSelection(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>
              Discard them before editing another communication channel?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingSelection;
                setPendingSelection(null);
                setDirty(false);
                if (next) {
                  setSelectedId(next.id);
                  setDraft(communicationChannelToDraft(next));
                  setDetailsTab("general");
                }
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Card4CommunicationChannelsGuide({
  channels,
}: {
  channels: readonly CommunicationChannelRecord[];
}) {
  const active = channels.filter((row) => row.active).length;
  const example = channels.find((row) => row.active) ?? channels[0];
  return (
    <>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
          <li>Choose a communication channel</li>
          <li>Confirm its provider</li>
          <li>Complete the channel details</li>
          <li>Test the configuration</li>
          <li>Activate the channel</li>
        </ol>
        <p className="mt-3 text-sm text-[#251605]">
          {active} of {channels.length} channels active
        </p>
      </section>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Channel Example</p>
        {example ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>{COMMUNICATION_CHANNEL_LABELS[example.channelType]}</p>
            <p className="text-muted-foreground">
              {example.senderName} · {communicationProviderLabel(example)}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Select a channel to see an example.</p>
        )}
      </section>
    </>
  );
}
