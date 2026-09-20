import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  FieldShell,
  SecretInput,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  getPmsCard4SenderSettings,
  savePmsCard4SenderSettings,
  testPmsCard4SenderSettings,
} from "@/packages/pms/lib/sender-settings-card4.functions";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_TYPES,
  communicationProvider,
  communicationProviders,
  emptySenderSettingsDraft,
  sanitizeCommunicationProviderConfig,
  senderProviderFields,
  senderSettingToDraft,
  validateSenderSettingsDraft,
  type SenderSettingsDraft,
  type SenderSettingsRecord,
} from "@/packages/pms/lib/sender-settings-card4.server";
import {
  INTEGRATION_AUTH_METHOD_LABELS,
  type IntegrationAuthMethod,
  type IntegrationField,
} from "@/packages/pms/lib/integrations-catalog";
import type { CommunicationChannelType } from "@/packages/pms/lib/communication-channels-card4.server";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";

function isInternalChannel(channelType: CommunicationChannelType) {
  return channelType === "guest_portal" || channelType === "pms_in_app";
}

export function PmsCard4SenderSettings({
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
  const load = useServerFn(getPmsCard4SenderSettings);
  const save = useServerFn(savePmsCard4SenderSettings);
  const testConnection = useServerFn(testPmsCard4SenderSettings);
  const queryKey = ["pms-card4-sender-settings", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const settings = useMemo(() => query.data?.settings ?? [], [query.data?.settings]);
  const [channelType, setChannelType] = useState<CommunicationChannelType>("email");
  const [draft, setDraft] = useState<SenderSettingsDraft>(emptySenderSettingsDraft("email"));
  const [dirty, setDirty] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<CommunicationChannelType | null>(null);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  const selected = settings.find((row) => row.channelType === channelType) ?? settings[0] ?? null;

  useEffect(() => {
    if (!selected || dirty) return;
    setChannelType(selected.channelType);
    setDraft(senderSettingToDraft(selected));
  }, [selected, dirty]);

  const errors = validateSenderSettingsDraft(draft, settings);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  function mark<K extends keyof SenderSettingsDraft>(key: K, value: SenderSettingsDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateProviderValue(id: string, value: string | number | boolean) {
    mark("providerValues", { ...draft.providerValues, [id]: value });
  }

  function applyChannel(nextType: CommunicationChannelType) {
    const row = settings.find((item) => item.channelType === nextType);
    setChannelType(nextType);
    setDraft(row ? senderSettingToDraft(row) : emptySenderSettingsDraft(nextType));
    setDirty(false);
    setPendingChannel(null);
  }

  function chooseChannel(nextType: CommunicationChannelType) {
    if (nextType === channelType) return;
    if (dirty) {
      setPendingChannel(nextType);
      return;
    }
    applyChannel(nextType);
  }

  function chooseProvider(provider: string) {
    const definition = communicationProvider(draft.channelType, provider);
    setDirty(true);
    setDraft((current) => ({
      ...current,
      provider,
      authMethod: definition?.authMethods[0] ?? "none",
      providerValues: {},
    }));
  }

  function renderProviderField(field: IntegrationField) {
    const id = `sender-provider-${field.id}`;
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
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-communication-channels", restaurantId],
      });
      setDirty(false);
      toast.success("Sender settings saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save sender settings."),
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
    onError: (error: Error) => toast.error(error.message || "Unable to test sender settings."),
  });

  const busy = saveMutation.isPending || testMutation.isPending;
  const canSave = canEdit && Boolean(query.data) && !busy && errors.length === 0;
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || errors.length > 0) {
      if (errors[0]?.message) toast.error(errors[0].message);
      return;
    }
    if (!dirty) {
      onSaved(thenNextRef.current);
      return;
    }
    saveMutation.mutate(undefined, {
      onSuccess: () => onSaved(thenNextRef.current),
    });
  }, [saveRequest, canEdit, errors, dirty, onSaved, saveMutation]);

  const fields = senderProviderFields(draft);
  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";
  const internal = isInternalChannel(draft.channelType);

  return (
    <div className="space-y-5" data-testid="card4-sender-settings">
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Sender Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the From identity and provider for each communication channel. Credentials are
            used only for this test session and are never saved.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
      </section>

      {query.isLoading ? (
        <div className="space-y-2 rounded-2xl border border-[#CCCCCC] bg-white p-6">
          {["a", "b", "c"].map((row) => (
            <div key={row} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-[#CCCCCC] bg-white p-6">
          <p className="text-sm text-destructive">Unable to load sender settings.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <Tabs
          value={channelType}
          onValueChange={(value) => chooseChannel(value as CommunicationChannelType)}
          className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {COMMUNICATION_CHANNEL_TYPES.map((type) => (
              <TabsTrigger key={type} value={type}>
                {COMMUNICATION_CHANNEL_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={channelType} className="space-y-4 pt-4">
            {internal ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                {COMMUNICATION_CHANNEL_LABELS[channelType]} uses the built-in Noru PMS
                infrastructure. No SMTP or API credentials are required.
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell
                id="sender-name"
                label="Sender Name"
                required
                error={errorFor("senderName") ?? undefined}
              >
                <Input
                  id="sender-name"
                  value={draft.senderName}
                  disabled={!canEdit}
                  onChange={(event) => mark("senderName", event.target.value)}
                />
              </FieldShell>
              {draft.channelType === "email" ? (
                <>
                  <FieldShell
                    id="sender-email"
                    label="Sender Email"
                    required={draft.active}
                    error={errorFor("senderEmail") ?? undefined}
                  >
                    <Input
                      id="sender-email"
                      type="email"
                      value={draft.senderEmail}
                      disabled={!canEdit}
                      onChange={(event) => mark("senderEmail", event.target.value)}
                    />
                  </FieldShell>
                  <FieldShell
                    id="reply-to-email"
                    label="Reply-To"
                    error={errorFor("replyToEmail") ?? undefined}
                  >
                    <Input
                      id="reply-to-email"
                      type="email"
                      value={draft.replyToEmail}
                      disabled={!canEdit}
                      onChange={(event) => mark("replyToEmail", event.target.value)}
                    />
                  </FieldShell>
                </>
              ) : null}
              {internal ? null : (
                <FieldShell
                  id="sender-provider"
                  label="Provider"
                  required
                  error={errorFor("provider") ?? undefined}
                >
                  <Select value={draft.provider} disabled={!canEdit} onValueChange={chooseProvider}>
                    <SelectTrigger id="sender-provider">
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
              )}
            </div>

            {draft.channelType === "email" ? (
              <FieldShell
                id="sender-signature"
                label="Signature"
                error={errorFor("signature") ?? undefined}
              >
                <Textarea
                  id="sender-signature"
                  rows={6}
                  maxLength={4000}
                  value={draft.signature}
                  disabled={!canEdit}
                  placeholder="Enter the signature appended to email from this property."
                  onChange={(event) => mark("signature", event.target.value)}
                />
              </FieldShell>
            ) : null}

            {internal ? null : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Credentials are used only for this test session and are never saved. Leave a
                  secret empty to leave it unchanged — NORU still does not store it.
                </p>
                {communicationProvider(draft.channelType, draft.provider)?.authMethods.length ? (
                  <FieldShell
                    id="sender-auth-method"
                    label="Authentication"
                    required
                    error={errorFor("authMethod") ?? undefined}
                  >
                    <Select
                      value={draft.authMethod}
                      disabled={!canEdit}
                      onValueChange={(value) => mark("authMethod", value as IntegrationAuthMethod)}
                    >
                      <SelectTrigger id="sender-auth-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          communicationProvider(draft.channelType, draft.provider)?.authMethods ??
                          []
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
                    This provider has no additional non-secret fields.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-[#CCCCCC] p-3">
              <div>
                <Label htmlFor="sender-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Active sender settings are written through to the matching channel.
                </p>
              </div>
              <Switch
                id="sender-active"
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
        </Tabs>
      )}

      <AlertDialog
        open={pendingChannel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChannel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved sender settings</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this channel. Discard them to switch tabs?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingChannel) applyChannel(pendingChannel);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Card4SenderSettingsGuide({
  settings,
}: {
  settings: readonly SenderSettingsRecord[];
}) {
  const email = settings.find((row) => row.channelType === "email");
  const active = settings.filter((row) => row.active).length;
  return (
    <>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
          <li>Open each channel tab</li>
          <li>Set the sender name and email</li>
          <li>Complete non-secret provider fields</li>
          <li>Enter credentials only to test the connection</li>
          <li>Save Draft or Save & Next</li>
        </ol>
        <p className="mt-3 text-sm text-[#251605]">
          {active} of {settings.length} sender channels active
        </p>
      </section>
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-[#251605]">Email sender</p>
        {email ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>{email.senderName || "Not set"}</p>
            <p className="text-muted-foreground">{email.senderEmail || "No sender email yet"}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Configure Channels first so sender settings can be created.
          </p>
        )}
      </section>
    </>
  );
}
