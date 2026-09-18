import { useEffect, useMemo, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";
import { cn } from "@/shared/lib/utils";
import {
  CopyableReadOnlyField,
  FieldShell,
  IntegrationNotice,
  SecretInput,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { Card6TestConnectionDialog } from "@/packages/pms/components/settings/pms-card6-test-connection-dialog";
import {
  INTEGRATION_ENVIRONMENTS,
  SECRET_REENTRY_NOTICE,
  SECRET_STORAGE_NOTICE,
  integrationWebhookPath,
  integrationWebhookUrl,
  type IntegrationEnvironment,
  type IntegrationRecord,
} from "@/packages/pms/lib/integrations-card6.server";
import {
  INTEGRATION_AUTH_METHOD_LABELS,
  INTEGRATION_FIELD_SECTIONS,
  INTEGRATION_SECTION_LABELS,
  buildPersistedConfig,
  defaultAuthMethod,
  defaultIntegrationValues,
  integrationCategory,
  integrationProvider,
  simulateIntegrationTest,
  validateIntegrationDraft,
  visibleIntegrationFields,
  type IntegrationAuthMethod,
  type IntegrationDraft,
  type IntegrationDraftValues,
  type IntegrationField,
  type IntegrationFieldSection,
  type SimulatedTestOutcome,
} from "@/packages/pms/lib/integrations-catalog";

export type IntegrationSavePayload = {
  id?: string;
  name: string;
  category: string;
  provider: string;
  environment: IntegrationEnvironment;
  authMethod: IntegrationAuthMethod;
  enabled: boolean;
  description: string;
  events: string[];
  config: Record<string, string | number | boolean>;
};

const ENVIRONMENT_LABELS: Record<IntegrationEnvironment, string> = {
  sandbox: "Sandbox",
  production: "Production",
};

function firstProviderId(category: string): string {
  return integrationCategory(category)?.providers[0]?.id ?? "";
}

/**
 * The single setup surface for every category and provider. It is driven
 * entirely by the catalog, so a new provider needs no changes here.
 *
 * Secret field values live in `values` for the life of this component and are
 * dropped by buildPersistedConfig before anything is sent to the server.
 */
export function Card6IntegrationDrawer({
  open,
  onOpenChange,
  restaurantId,
  category,
  record,
  existingNames,
  saving,
  startWithTest = false,
  onSave,
  onRecordTest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  category: string;
  record: IntegrationRecord | null;
  existingNames: string[];
  saving: boolean;
  startWithTest?: boolean;
  onSave: (payload: IntegrationSavePayload) => void;
  onRecordTest: (id: string, outcome: SimulatedTestOutcome) => void;
}) {
  const [provider, setProvider] = useState(() => record?.provider ?? firstProviderId(category));
  const [authMethod, setAuthMethod] = useState<IntegrationAuthMethod>(
    () =>
      (record?.authMethod as IntegrationAuthMethod | null) ?? defaultAuthMethod(category, provider),
  );
  const [name, setName] = useState(record?.name ?? "");
  const [environment, setEnvironment] = useState<IntegrationEnvironment>(
    record?.environment ?? "sandbox",
  );
  const [description, setDescription] = useState(record?.description ?? "");
  const [enabled, setEnabled] = useState(record?.enabled ?? true);
  const [events, setEvents] = useState<string[]>(record?.events ?? []);
  const [values, setValues] = useState<IntegrationDraftValues>(() => ({
    ...defaultIntegrationValues(category, record?.provider ?? firstProviderId(category)),
    ...(record?.config ?? {}),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const categoryDef = integrationCategory(category);
  const providerDef = integrationProvider(category, provider);

  useEffect(() => {
    if (!open) return;
    const nextProvider = record?.provider ?? firstProviderId(category);
    setProvider(nextProvider);
    setAuthMethod(
      (record?.authMethod as IntegrationAuthMethod | null) ??
        defaultAuthMethod(category, nextProvider),
    );
    setName(record?.name ?? "");
    setEnvironment(record?.environment ?? "sandbox");
    setDescription(record?.description ?? "");
    setEnabled(record?.enabled ?? true);
    setEvents(record?.events ?? []);
    setValues({
      ...defaultIntegrationValues(category, nextProvider),
      ...(record?.config ?? {}),
    });
    setErrors({});
    setDirty(false);
    setConfirmDiscard(false);
    setTestOpen(startWithTest);
  }, [open, category, record, startWithTest]);

  const draft: IntegrationDraft = useMemo(
    () => ({ name, category, provider, environment, authMethod, description, events, values }),
    [name, category, provider, environment, authMethod, description, events, values],
  );

  const visible = visibleIntegrationFields(category, provider, authMethod, values);
  const sections = INTEGRATION_FIELD_SECTIONS.filter((section) =>
    visible.some((row) => row.section === section),
  );
  // Only a saved integration has a real path. Showing a placeholder would invite
  // someone to hand a provider an address that does not exist.
  const webhookUrl =
    providerDef?.supportsWebhook && record?.webhookPath && typeof window !== "undefined"
      ? integrationWebhookUrl(window.location.origin, record.webhookPath)
      : null;
  const webhookPending = Boolean(providerDef?.supportsWebhook) && !webhookUrl;

  function update(id: string, value: string | number | boolean) {
    setValues((current) => ({ ...current, [id]: value }));
    setErrors((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDirty(true);
  }

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider);
    setAuthMethod(defaultAuthMethod(category, nextProvider));
    setValues(defaultIntegrationValues(category, nextProvider));
    setErrors({});
    setDirty(true);
  }

  function changeAuthMethod(next: IntegrationAuthMethod) {
    setAuthMethod(next);
    setErrors({});
    setDirty(true);
  }

  function toggleEvent(value: string, checked: boolean) {
    setEvents((current) =>
      checked ? Array.from(new Set([...current, value])) : current.filter((row) => row !== value),
    );
    setDirty(true);
  }

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function submit() {
    const found = validateIntegrationDraft(draft);
    const trimmed = name.trim().toLowerCase();
    if (!found["name"] && existingNames.some((row) => row.toLowerCase() === trimmed)) {
      found["name"] = "Another integration already uses that name.";
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSave({
      ...(record ? { id: record.id } : {}),
      name: name.trim(),
      category,
      provider,
      environment,
      authMethod,
      enabled,
      description: description.trim(),
      events,
      config: buildPersistedConfig(draft),
    });
  }

  function renderField(field: IntegrationField) {
    const id = `card6-field-${field.id}`;
    const raw = values[field.id];
    const error = errors[field.id];
    const invalid = Boolean(error);

    if (field.type === "toggle") {
      return (
        <div
          key={field.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-[#E5DED1] px-3 py-3"
        >
          <div>
            <Label htmlFor={id}>{field.label}</Label>
            {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
          </div>
          <Switch
            id={id}
            checked={raw === true}
            onCheckedChange={(checked) => update(field.id, checked)}
            aria-label={field.label}
          />
        </div>
      );
    }

    const shellProps = {
      id,
      label: field.label,
      ...(field.required === undefined ? {} : { required: field.required }),
      ...(field.help === undefined ? {} : { help: field.help }),
      ...(error === undefined ? {} : { error }),
    };

    if (field.type === "select") {
      return (
        <FieldShell key={field.id} {...shellProps}>
          <Select value={String(raw ?? "")} onValueChange={(value) => update(field.id, value)}>
            <SelectTrigger id={id} className={cn(invalid && "border-destructive")}>
              <SelectValue placeholder="Select" />
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

    if (field.type === "secret") {
      return (
        <FieldShell key={field.id} {...shellProps}>
          <SecretInput
            id={id}
            value={String(raw ?? "")}
            invalid={invalid}
            {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
            onChange={(value) => update(field.id, value)}
          />
        </FieldShell>
      );
    }

    if (field.type === "textarea") {
      return (
        <FieldShell key={field.id} {...shellProps}>
          <Textarea
            id={id}
            rows={3}
            value={String(raw ?? "")}
            className={cn(invalid && "border-destructive")}
            {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
            onChange={(event) => update(field.id, event.target.value)}
          />
        </FieldShell>
      );
    }

    return (
      <FieldShell key={field.id} {...shellProps}>
        <Input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "numeric" : undefined}
          value={String(raw ?? "")}
          className={cn(invalid && "border-destructive")}
          {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
          onChange={(event) => update(field.id, event.target.value)}
        />
      </FieldShell>
    );
  }

  function renderSection(section: IntegrationFieldSection) {
    const fields = visible.filter((row) => row.section === section);
    if (fields.length === 0) return null;
    return (
      <AccordionItem
        key={section}
        value={section}
        className="rounded-2xl border border-[#CCCCCC] bg-white px-4"
      >
        <AccordionTrigger className="text-sm font-medium text-[#251605]">
          {INTEGRATION_SECTION_LABELS[section]}
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          {section === "credentials" ? (
            <IntegrationNotice tone="warning">
              {record ? SECRET_REENTRY_NOTICE : SECRET_STORAGE_NOTICE}
            </IntegrationNotice>
          ) : null}
          {fields.map(renderField)}
          {section === "security" && webhookUrl ? (
            <CopyableReadOnlyField
              label="Inbound webhook URL"
              value={webhookUrl}
              help="Generated for this integration. NORU starts accepting callbacks on it when live connections ship."
            />
          ) : null}
          {section === "security" && webhookPending ? (
            <IntegrationNotice>
              This provider can call NORU back. The inbound webhook URL is generated once you save.
            </IntegrationNotice>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={requestClose}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
          data-testid="card6-integration-drawer"
        >
          <SheetHeader className="border-b border-[#E5DED1] px-6 py-4 text-left">
            <SheetTitle className="font-display text-xl text-[#251605]">
              {record ? "Configure integration" : "Add integration"}
            </SheetTitle>
            <SheetDescription>
              {categoryDef?.label ?? category}
              {providerDef ? ` · ${providerDef.blurb}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FieldShell
              id="card6-name"
              label="Integration name"
              required
              {...(errors["name"] === undefined ? {} : { error: errors["name"] })}
            >
              <Input
                id="card6-name"
                value={name}
                placeholder="Front desk card payments"
                className={cn(errors["name"] && "border-destructive")}
                onChange={(event) => {
                  setName(event.target.value);
                  setDirty(true);
                }}
              />
            </FieldShell>

            <FieldShell id="card6-provider" label="Provider" required>
              <Select value={provider} onValueChange={changeProvider}>
                <SelectTrigger id="card6-provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {(categoryDef?.providers ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>

            {providerDef && providerDef.authMethods.length > 1 ? (
              <FieldShell id="card6-auth" label="Authentication method" required>
                <Select
                  value={authMethod}
                  onValueChange={(value) => changeAuthMethod(value as IntegrationAuthMethod)}
                >
                  <SelectTrigger id="card6-auth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerDef.authMethods.map((option) => (
                      <SelectItem key={option} value={option}>
                        {INTEGRATION_AUTH_METHOD_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            ) : null}

            <FieldShell id="card6-environment" label="Environment" required>
              <Select
                value={environment}
                onValueChange={(value) => {
                  setEnvironment(value as IntegrationEnvironment);
                  setDirty(true);
                }}
              >
                <SelectTrigger id="card6-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEGRATION_ENVIRONMENTS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ENVIRONMENT_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>

            <FieldShell
              id="card6-description"
              label="Description"
              {...(errors["description"] === undefined ? {} : { error: errors["description"] })}
            >
              <Textarea
                id="card6-description"
                rows={2}
                value={description}
                placeholder="What this connection is used for."
                onChange={(event) => {
                  setDescription(event.target.value);
                  setDirty(true);
                }}
              />
            </FieldShell>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-[#E5DED1] px-3 py-3">
              <div>
                <Label htmlFor="card6-enabled">Enabled</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Disabled integrations keep their configuration but are ignored by the property.
                </p>
              </div>
              <Switch
                id="card6-enabled"
                checked={enabled}
                onCheckedChange={(checked) => {
                  setEnabled(checked);
                  setDirty(true);
                }}
                aria-label="Enabled"
              />
            </div>

            <Accordion type="multiple" defaultValue={[...sections]} className="space-y-3">
              {sections.map(renderSection)}

              {categoryDef && categoryDef.events.length > 0 ? (
                <AccordionItem
                  value="events"
                  className="rounded-2xl border border-[#CCCCCC] bg-white px-4"
                >
                  <AccordionTrigger className="text-sm font-medium text-[#251605]">
                    Events
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-4">
                    <p className="text-xs text-muted-foreground">
                      Choose which events this integration should handle.
                    </p>
                    {categoryDef.events.map((event) => (
                      <label
                        key={event.value}
                        className="flex items-center gap-3 rounded-xl border border-[#E5DED1] px-3 py-2 text-sm text-[#251605]"
                      >
                        <Checkbox
                          checked={events.includes(event.value)}
                          onCheckedChange={(checked) => toggleEvent(event.value, checked === true)}
                        />
                        {event.label}
                      </label>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ) : null}
            </Accordion>

            {confirmDiscard ? (
              <IntegrationNotice tone="warning">
                You have unsaved changes. Press Cancel again to discard them.
              </IntegrationNotice>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E5DED1] bg-[#F7F4EE] px-6 py-3">
            <Button type="button" variant="outline" onClick={() => setTestOpen(true)}>
              Test connection
            </Button>
            <Button type="button" variant="outline" onClick={() => requestClose(false)}>
              {confirmDiscard ? "Discard changes" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={submit}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              {saving ? "Saving…" : record ? "Save changes" : "Add integration"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Card6TestConnectionDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        integrationName={name.trim().length > 0 ? name.trim() : "Untitled integration"}
        providerLabel={providerDef?.label ?? provider}
        run={() => simulateIntegrationTest(draft)}
        onRecord={(outcome) => {
          if (record) onRecordTest(record.id, outcome);
        }}
      />
    </>
  );
}
