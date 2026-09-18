import { useEffect, useMemo, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { IntegrationNotice } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { DistributionStatusBadge } from "@/packages/pms/components/settings/pms-card6-distribution-bits";
import { Card6DistributionValidation } from "@/packages/pms/components/settings/pms-card6-distribution-validation";
import { Card6MappingSection } from "@/packages/pms/components/settings/pms-card6-mapping-section";
import { Card6DistributionSyncSections } from "@/packages/pms/components/settings/pms-card6-distribution-sync-sections";
import {
  DEFAULT_DISTRIBUTION_SYNC_CONFIG,
  EXTERNAL_CATALOG_NOTICE,
  POLICY_MAPPING_NOTICE,
  mappingStatusAfterSave,
  type DistributionCard6Snapshot,
  type DistributionChannelDetail,
  type DistributionDraft,
  type DistributionEnvironment,
  type DistributionSyncConfig,
  type MappingPair,
} from "@/packages/pms/lib/distribution-card6.server";
import {
  DISTRIBUTION_PROVIDER_KIND_LABELS,
  channelSupports,
  distributionChannel,
  distributionProvider,
  draftHasBlockingErrors,
  draftHasIncompleteMappings,
  distributionSyncCapabilities,
  validateDistributionSyncConfig,
  validateDistributionDraft,
} from "@/packages/pms/lib/distribution-catalog";

export type DistributionSavePayload = {
  id?: string;
  integrationId: string;
  channel: string;
  environment: DistributionEnvironment;
  enabled: boolean;
  rooms: MappingPair[];
  rates: MappingPair[];
  meals: MappingPair[];
  syncConfig: DistributionSyncConfig;
};

export function Card6DistributionDrawer({
  open,
  onOpenChange,
  snapshot,
  record,
  saving,
  canEdit,
  onSave,
  onGoToIntegrations,
  onRequestActivation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: DistributionCard6Snapshot;
  record: DistributionChannelDetail | null;
  saving: boolean;
  canEdit: boolean;
  onSave: (payload: DistributionSavePayload) => void;
  onGoToIntegrations: () => void;
  onRequestActivation: (active: boolean) => void;
}) {
  const selectable = useMemo(
    () => snapshot.integrations.filter((row) => row.selectable),
    [snapshot.integrations],
  );
  const [integrationId, setIntegrationId] = useState(
    record?.integrationId ?? selectable[0]?.id ?? "",
  );
  const [channel, setChannel] = useState(record?.channel ?? "");
  const [environment, setEnvironment] = useState<DistributionEnvironment>(
    record?.environment ?? "sandbox",
  );
  const [rooms, setRooms] = useState<MappingPair[]>(
    record?.roomMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
  );
  const [rates, setRates] = useState<MappingPair[]>(
    record?.rateMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
  );
  const [meals, setMeals] = useState<MappingPair[]>(
    record?.mealMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
  );
  const [syncConfig, setSyncConfig] = useState<DistributionSyncConfig>(
    record?.syncConfig ?? structuredClone(DEFAULT_DISTRIBUTION_SYNC_CONFIG),
  );
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextIntegration = record?.integrationId ?? selectable[0]?.id ?? "";
    setIntegrationId(nextIntegration);
    setChannel(record?.channel ?? "");
    setEnvironment(record?.environment ?? "sandbox");
    setRooms(
      record?.roomMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
    );
    setRates(
      record?.rateMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
    );
    setMeals(
      record?.mealMappings.map((row) => ({ noruId: row.noruId, externalId: row.externalId })) ?? [],
    );
    setSyncConfig(record?.syncConfig ?? structuredClone(DEFAULT_DISTRIBUTION_SYNC_CONFIG));
    setDirty(false);
    setConfirmDiscard(false);
  }, [open, record, selectable]);

  const integration = snapshot.integrations.find((row) => row.id === integrationId) ?? null;
  const providerDef = integration ? distributionProvider(integration.provider) : null;
  const channelDef = integration ? distributionChannel(integration.provider, channel) : null;
  const provider = integration?.provider ?? "";
  const syncCapabilities = distributionSyncCapabilities(provider, channel);

  const draft: DistributionDraft = useMemo(
    () => ({ integrationId, channel, environment, rooms, rates, meals }),
    [integrationId, channel, environment, rooms, rates, meals],
  );

  const mappingChecks = validateDistributionDraft(draft, {
    integration,
    roomTypes: snapshot.roomTypes,
    ratePlans: snapshot.ratePlans,
    mealPlans: snapshot.mealPlans,
    takenChannels: snapshot.channels.map((row) => ({
      integrationId: row.integrationId,
      channel: row.channel,
      excludeId: row.id,
    })),
    excludeId: record?.id ?? null,
  });
  const checks = syncCapabilities
    ? [...mappingChecks, ...validateDistributionSyncConfig(syncConfig, syncCapabilities)]
    : mappingChecks;

  const mappingStatus = mappingStatusAfterSave(
    record?.enabled ?? true,
    draftHasIncompleteMappings(checks),
  );

  function markDirty<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  function requestClose() {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function submit() {
    if (draftHasBlockingErrors(checks) || !integrationId) return;
    const payload: DistributionSavePayload = {
      integrationId,
      channel,
      environment,
      enabled: record?.enabled ?? true,
      rooms: channelSupports(provider, channel, "rooms") ? rooms : [],
      rates: channelSupports(provider, channel, "rates") ? rates : [],
      meals: channelSupports(provider, channel, "meals") ? meals : [],
      syncConfig,
    };
    if (record?.id) payload.id = record.id;
    onSave(payload);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
          data-testid="card6-distribution-drawer"
        >
          <SheetHeader className="border-b border-[#E5DED1] px-6 py-4">
            <SheetTitle>{record ? "Edit Distribution" : "Add Distribution"}</SheetTitle>
            <SheetDescription>
              Connect a channel to an existing distribution integration and configure its mappings.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {selectable.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-6 text-center">
                <p className="font-medium text-[#251605]">
                  No distribution integrations available.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect a distribution integration first.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  variant="outline"
                  onClick={onGoToIntegrations}
                >
                  Go to Integrations
                </Button>
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 space-y-3">
                  {record ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Operational status</span>
                      <span>
                        {record.activationStatus === "active" ? "● Active" : "○ Inactive"}
                      </span>
                      <span className="text-muted-foreground">Last sync</span>
                      <span>Never</span>
                    </div>
                  ) : null}
                  <h3 className="text-sm font-medium text-[#251605]">Distribution provider</h3>
                  <div className="space-y-1.5">
                    <Label>Distribution integration *</Label>
                    <Select
                      value={integrationId}
                      onValueChange={(value) => {
                        setIntegrationId(value);
                        setChannel("");
                        setRooms([]);
                        setRates([]);
                        setMeals([]);
                        setSyncConfig(structuredClone(DEFAULT_DISTRIBUTION_SYNC_CONFIG));
                        setDirty(true);
                      }}
                      disabled={!canEdit || Boolean(record)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an integration" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectable.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name} — {row.status === "connected" ? "Connected" : "Pending"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {providerDef ? (
                    <p className="text-sm text-muted-foreground">
                      Provider type: {DISTRIBUTION_PROVIDER_KIND_LABELS[providerDef.kind]}
                    </p>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label>Environment</Label>
                    <Select
                      value={environment}
                      onValueChange={(value) =>
                        markDirty(setEnvironment)(value as DistributionEnvironment)
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Channel status</span>
                    <DistributionStatusBadge
                      status={record ? record.mappingStatus : mappingStatus}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 space-y-3">
                  <h3 className="text-sm font-medium text-[#251605]">Channel</h3>
                  <div className="space-y-1.5">
                    <Label>Channel *</Label>
                    <Select
                      value={channel}
                      onValueChange={(value) => {
                        setChannel(value);
                        setRooms([]);
                        setRates([]);
                        setMeals([]);
                        const nextCapabilities = distributionSyncCapabilities(provider, value);
                        setSyncConfig({
                          ...structuredClone(DEFAULT_DISTRIBUTION_SYNC_CONFIG),
                          inventory: {
                            ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.inventory,
                            enabled: nextCapabilities?.inventory.supported === true,
                          },
                          rates: {
                            ...DEFAULT_DISTRIBUTION_SYNC_CONFIG.rates,
                            enabled: nextCapabilities?.rates.supported === true,
                          },
                        });
                        setDirty(true);
                      }}
                      disabled={!canEdit || !providerDef}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {(providerDef?.channels ?? []).map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                {channelDef ? (
                  <>
                    <IntegrationNotice>{EXTERNAL_CATALOG_NOTICE}</IntegrationNotice>
                    {channelSupports(provider, channel, "rooms") ? (
                      <Card6MappingSection
                        title="Room type mapping"
                        description="Map Noru room types to the corresponding room types on the external channel."
                        noruLabel="Noru room type"
                        externalLabel="External room type"
                        noruOptions={snapshot.roomTypes}
                        externalOptions={channelDef.rooms}
                        pairs={rooms}
                        onChange={markDirty(setRooms)}
                        canEdit={canEdit}
                      />
                    ) : (
                      <IntegrationNotice>
                        Room type mapping is not supported by this channel.
                      </IntegrationNotice>
                    )}
                    {channelSupports(provider, channel, "rates") ? (
                      <Card6MappingSection
                        title="Rate plan mapping"
                        description="Map Noru rate plans to the corresponding rate plans on the external channel."
                        noruLabel="Noru rate plan"
                        externalLabel="External rate plan"
                        noruOptions={snapshot.ratePlans}
                        externalOptions={channelDef.rates}
                        pairs={rates}
                        onChange={markDirty(setRates)}
                        canEdit={canEdit}
                      />
                    ) : (
                      <IntegrationNotice>
                        Rate plan mapping is not supported by this channel.
                      </IntegrationNotice>
                    )}
                    {channelSupports(provider, channel, "meals") ? (
                      <Card6MappingSection
                        title="Meal plan mapping"
                        description="Map Noru meal plans to the corresponding meal plans on the external channel."
                        noruLabel="Noru meal plan"
                        externalLabel="External meal plan"
                        noruOptions={snapshot.mealPlans}
                        externalOptions={channelDef.meals}
                        pairs={meals}
                        onChange={markDirty(setMeals)}
                        canEdit={canEdit}
                      />
                    ) : (
                      <IntegrationNotice>
                        Meal plan mapping is not supported by this channel.
                      </IntegrationNotice>
                    )}
                    <IntegrationNotice>{POLICY_MAPPING_NOTICE}</IntegrationNotice>
                    {syncCapabilities ? (
                      <Card6DistributionSyncSections
                        config={syncConfig}
                        capabilities={syncCapabilities}
                        canEdit={canEdit}
                        onChange={(value) => {
                          setSyncConfig(value);
                          setDirty(true);
                        }}
                      />
                    ) : null}
                    {record ? (
                      <section className="space-y-3 rounded-2xl border border-[#CCCCCC] bg-white p-4">
                        <h3 className="text-sm font-medium text-[#251605]">Configuration Check</h3>
                        <div className="space-y-1 text-sm">
                          {checks.map((item) => (
                            <p
                              key={item.id}
                              className={
                                item.passed
                                  ? "text-[#436436]"
                                  : item.warning
                                    ? "text-[#7A5511]"
                                    : "text-destructive"
                              }
                            >
                              {item.passed ? "✓" : item.warning ? "⚠" : "✕"} {item.label}
                            </p>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant={record.activationStatus === "active" ? "outline" : "default"}
                          disabled={
                            !canEdit || dirty || checks.some((item) => !item.passed) || saving
                          }
                          onClick={() => onRequestActivation(record.activationStatus !== "active")}
                        >
                          {record.activationStatus === "active"
                            ? "Deactivate"
                            : "Activate Distribution"}
                        </Button>
                        {dirty ? (
                          <p className="text-xs text-muted-foreground">
                            Save changes before activation.
                          </p>
                        ) : null}
                      </section>
                    ) : null}
                    <section className="space-y-2 rounded-2xl border border-[#CCCCCC] bg-white p-4">
                      <h3 className="text-sm font-medium text-[#251605]">Sync Status</h3>
                      <p className="text-sm">
                        ○ {record?.activationStatus === "active" ? "Never Synced" : "Disabled"}
                      </p>
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <dt className="text-muted-foreground">Last sync</dt>
                        <dd>Never</dd>
                        <dt className="text-muted-foreground">Sync history</dt>
                        <dd>No synchronization history yet.</dd>
                      </dl>
                    </section>
                  </>
                ) : null}

                {confirmDiscard ? (
                  <IntegrationNotice tone="warning">
                    You have unsaved changes. Press Cancel again to discard them.
                  </IntegrationNotice>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E5DED1] bg-[#F7F4EE] px-6 py-3">
            <Button type="button" variant="outline" onClick={requestClose}>
              {confirmDiscard ? "Discard changes" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setValidateOpen(true)}
              disabled={!channel}
            >
              Validate
            </Button>
            {canEdit && selectable.length > 0 ? (
              <Button
                type="button"
                disabled={saving || draftHasBlockingErrors(checks)}
                onClick={submit}
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <Card6DistributionValidation
        open={validateOpen}
        onOpenChange={setValidateOpen}
        checks={checks}
      />
    </>
  );
}
