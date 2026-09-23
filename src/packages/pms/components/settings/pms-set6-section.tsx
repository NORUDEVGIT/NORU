import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import { CARD7_HREF } from "@/packages/pms/lib/pms-property-setup-card7";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import {
  DISTRIBUTION_CHANNEL_LABELS,
  REPORT_PACK_LABELS,
  REPORT_PACKS,
  SET6_CATALOGUE_LABELS,
  SET6_CHANNEL_WARNING,
  SET6_DIRECT_LIVE_NOTE,
  SET6_DISTRIBUTION_HREF,
  SET6_DISTRIBUTION_UNAVAILABLE,
  SET6_MAPPING_WARNING,
  SET6_OFFLINE_ENABLE_WARNING,
  SET6_OFFLINE_INTENT_ONLY,
  SET6_OFFLINE_SYNC_WARNING,
  SET6_OFFLINE_UNAVAILABLE,
  SET6_REPORTS_CATALOGUE_WARNING,
  SET6_REPORTS_HREF,
  SET6_REPORTS_NO_BI,
  SET6_REPORTS_SCHEDULE_WARNING,
  SET6_REPORTS_UNAVAILABLE,
  SET6_SALES_HREF,
  SET6_SALES_PLANNED,
  SET6_SALES_UNAVAILABLE,
  SET6_SALES_WARNING,
  distributionHonestyRows,
  type DistributionChannelPosture,
  type DistributionMappingPosture,
  type OfflineEnablementPosture,
  type OfflineSyncPosture,
  type PmsSet6CatalogueItem,
  type ReportsCataloguePosture,
  type ReportsScheduleAccessPosture,
  type Set6CatalogueKind,
  type Set6Snapshot,
} from "@/packages/pms/lib/pms-set6-sales-distribution";
import {
  savePmsDistributionChannelPosture,
  savePmsDistributionMappingPosture,
  savePmsOfflineEnablementPosture,
  savePmsOfflineSyncPosture,
  savePmsReportsCataloguePosture,
  savePmsReportsScheduleAccessPosture,
  savePmsSet6Catalogue,
} from "@/packages/pms/lib/pms-set6-sales-distribution.functions";

function refreshSet6(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  helper,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  helper?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CatalogueList({
  rows,
  canEdit,
  onEdit,
  onToggle,
}: {
  rows: PmsSet6CatalogueItem[];
  canEdit: boolean;
  onEdit: (row: PmsSet6CatalogueItem) => void;
  onToggle: (row: PmsSet6CatalogueItem) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.code} · {row.active ? "Active" : "Inactive"}
              {row.description ? ` · ${row.description}` : ""}
            </p>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggle(row)}>
                {row.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CatalogueDialog({
  open,
  onOpenChange,
  title,
  row,
  saving,
  extra,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  row: PmsSet6CatalogueItem | null;
  saving: boolean;
  extra?: ReactNode;
  onSubmit: (values: { id?: string; code: string; name: string; description: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setDescription(row?.description ?? "");
    setActive(row?.active ?? true);
  }, [open, row]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`set6-cat-name-${title}`}>Name</Label>
            <Input id={`set6-cat-name-${title}`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`set6-cat-code-${title}`}>Code</Label>
            <Input id={`set6-cat-code-${title}`} value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`set6-cat-desc-${title}`}>Description (optional)</Label>
            <Input
              id={`set6-cat-desc-${title}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {extra}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(row?.id ? { id: row.id } : {}), name, code, description, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalesCatalogueBlock({
  kind,
  rows,
  available,
  canEdit,
  restaurantId,
}: {
  kind: Set6CatalogueKind;
  rows: PmsSet6CatalogueItem[];
  available: boolean;
  canEdit: boolean;
  restaurantId: string;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsSet6Catalogue);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsSet6CatalogueItem | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; description: string; active: boolean }) =>
      save({ data: { restaurantId, kind, ...input } }),
    onSuccess: () => {
      toast.success(`${SET6_CATALOGUE_LABELS[kind]} saved.`);
      setOpen(false);
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-[#251605]">{SET6_CATALOGUE_LABELS[kind]}</h3>
        {canEdit && available ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add
          </Button>
        ) : null}
      </div>
      {!available ? (
        <p className="text-sm text-muted-foreground">{SET6_SALES_UNAVAILABLE}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#C89933]">{SET6_SALES_WARNING}</p>
      ) : (
        <CatalogueList
          rows={rows}
          canEdit={canEdit}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onToggle={(row) =>
            mutation.mutate({
              id: row.id,
              code: row.code,
              name: row.name,
              description: row.description,
              active: !row.active,
            })
          }
        />
      )}
      <CatalogueDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${SET6_CATALOGUE_LABELS[kind].toLowerCase()}` : `Add ${SET6_CATALOGUE_LABELS[kind].toLowerCase()}`}
        row={editing}
        saving={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </div>
  );
}

export function Set6SalesEventsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set6Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const domain = checklist.domains["sales-events"];
  const anyAvailable =
    snapshot.marketSegmentsAvailable ||
    snapshot.sourceCodesAvailable ||
    snapshot.eventTypesAvailable ||
    snapshot.salesChannelsAvailable ||
    snapshot.accountTypesAvailable ||
    snapshot.functionSpacesAvailable;

  return (
    <section id="sales-events" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set6-sales-events">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Sales &amp; events</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thin market-segment, source-code, sales-channel and event-type catalogues. Add your own names — nothing is
            pre-filled. {SET6_SALES_PLANNED}
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!anyAvailable ? (
        <p className="text-sm text-muted-foreground">{SET6_SALES_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-6">
          <SalesCatalogueBlock
            kind="market_segment"
            rows={snapshot.marketSegments}
            available={snapshot.marketSegmentsAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
          <SalesCatalogueBlock
            kind="source_code"
            rows={snapshot.sourceCodes}
            available={snapshot.sourceCodesAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
          <SalesCatalogueBlock
            kind="sales_channel"
            rows={snapshot.salesChannels}
            available={snapshot.salesChannelsAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
          <SalesCatalogueBlock
            kind="account_type"
            rows={snapshot.accountTypes}
            available={snapshot.accountTypesAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
          <SalesCatalogueBlock
            kind="event_type"
            rows={snapshot.eventTypes}
            available={snapshot.eventTypesAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
          <SalesCatalogueBlock
            kind="function_space"
            rows={snapshot.functionSpaces}
            available={snapshot.functionSpacesAvailable}
            canEdit={canEdit}
            restaurantId={restaurantId}
          />
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET6_SALES_HREF} data-testid="set6-open-sales-events">
          Open sales &amp; events
        </a>
      </Button>
    </section>
  );
}

export function Set6DistributionSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set6Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveChannels = useServerFn(savePmsDistributionChannelPosture);
  const saveMapping = useServerFn(savePmsDistributionMappingPosture);
  const [channels, setChannels] = useState<DistributionChannelPosture>(snapshot.channelPosture);
  const [mapping, setMapping] = useState<DistributionMappingPosture>(snapshot.mappingPosture);

  useEffect(() => {
    setChannels(snapshot.channelPosture);
  }, [snapshot.channelPosture]);
  useEffect(() => {
    setMapping(snapshot.mappingPosture);
  }, [snapshot.mappingPosture]);

  const channelMutation = useMutation({
    mutationFn: () => saveChannels({ data: { restaurantId, channels: channels.channels } }),
    onSuccess: () => {
      toast.success("Channel-class posture saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const mappingMutation = useMutation({
    mutationFn: () =>
      saveMapping({
        data: {
          restaurantId,
          rateMapped: mapping.rateMapped,
          inventoryMapped: mapping.inventoryMapped,
          roomTypeMapped: mapping.roomTypeMapped,
        },
      }),
    onSuccess: () => {
      toast.success("Mapping posture saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.distribution;
  const honesty = distributionHonestyRows();

  return (
    <section id="distribution" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set6-distribution">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Distribution</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thin channel-class, open/close, stop-sell and mapping-completeness posture. Direct booking stays live. OTA is
            never shown as connected.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      <ul className="space-y-3">
        {honesty.map((row) => (
          <li key={row.id} className="rounded-xl border border-border p-3" data-testid={`set6-distribution-${row.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-[#251605]">{row.title}</p>
              <ReadinessChip readiness={row.status === "live" ? "complete" : "warning"} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{row.note}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{SET6_DIRECT_LIVE_NOTE}</p>

      {!snapshot.distributionAvailable ? (
        <p className="text-sm text-muted-foreground">{SET6_DISTRIBUTION_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!channels.savedAt ? <p className="text-sm text-[#C89933]">{SET6_CHANNEL_WARNING}</p> : null}
          {channels.channels.map((row) => (
            <div key={row.class} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">{DISTRIBUTION_CHANNEL_LABELS[row.class]}</p>
              <ToggleRow
                id={`set6-channel-open-${row.class}`}
                label="Open"
                checked={row.open}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setChannels((prev) => ({
                    ...prev,
                    channels: prev.channels.map((item) => (item.class === row.class ? { ...item, open: checked } : item)),
                  }))
                }
              />
              <ToggleRow
                id={`set6-channel-stop-${row.class}`}
                label="Stop-sell"
                checked={row.stopSell}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setChannels((prev) => ({
                    ...prev,
                    channels: prev.channels.map((item) =>
                      item.class === row.class ? { ...item, stopSell: checked } : item,
                    ),
                  }))
                }
              />
            </div>
          ))}
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={channelMutation.isPending}
              onClick={() => channelMutation.mutate()}
            >
              {channelMutation.isPending ? "Saving…" : "Save channel posture"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            {!mapping.savedAt ? <p className="text-sm text-[#C89933]">{SET6_MAPPING_WARNING}</p> : null}
            <p className="text-sm text-muted-foreground">Mapping completeness expectations only — not a live sync.</p>
            <ToggleRow
              id="set6-map-rate"
              label="Rate mapping expected"
              checked={mapping.rateMapped}
              disabled={!canEdit}
              onCheckedChange={(checked) => setMapping((prev) => ({ ...prev, rateMapped: checked }))}
            />
            <ToggleRow
              id="set6-map-inventory"
              label="Inventory mapping expected"
              checked={mapping.inventoryMapped}
              disabled={!canEdit}
              onCheckedChange={(checked) => setMapping((prev) => ({ ...prev, inventoryMapped: checked }))}
            />
            <ToggleRow
              id="set6-map-room-type"
              label="Room-type mapping expected"
              checked={mapping.roomTypeMapped}
              disabled={!canEdit}
              onCheckedChange={(checked) => setMapping((prev) => ({ ...prev, roomTypeMapped: checked }))}
            />
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={mappingMutation.isPending}
                onClick={() => mappingMutation.mutate()}
              >
                {mappingMutation.isPending ? "Saving…" : "Save mapping posture"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET6_DISTRIBUTION_HREF} data-testid="set6-open-distribution">
          Open distribution
        </a>
      </Button>
    </section>
  );
}

export function Set6ReportsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set6Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveCatalogue = useServerFn(savePmsReportsCataloguePosture);
  const saveSchedule = useServerFn(savePmsReportsScheduleAccessPosture);
  const [catalogue, setCatalogue] = useState<ReportsCataloguePosture>(snapshot.reportsCatalogue);
  const [schedule, setSchedule] = useState<ReportsScheduleAccessPosture>(snapshot.reportsSchedule);

  useEffect(() => {
    setCatalogue(snapshot.reportsCatalogue);
  }, [snapshot.reportsCatalogue]);
  useEffect(() => {
    setSchedule(snapshot.reportsSchedule);
  }, [snapshot.reportsSchedule]);

  const catalogueMutation = useMutation({
    mutationFn: () => saveCatalogue({ data: { restaurantId, packs: catalogue.packs } }),
    onSuccess: () => {
      toast.success("Report catalogue saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const scheduleMutation = useMutation({
    mutationFn: () =>
      saveSchedule({
        data: {
          restaurantId,
          scheduleEnabled: schedule.scheduleEnabled,
          ownerManagerAccessOnly: schedule.ownerManagerAccessOnly,
        },
      }),
    onSuccess: () => {
      toast.success("Schedule and access posture saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.reports;

  return (
    <section id="reports" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set6-reports">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Catalogue and schedule/access posture aligned with the live Operational, Financial, Occupancy, Revenue and
            Management tabs. Saves remain compatible with Card 7, which is the setup source of truth. {SET6_REPORTS_NO_BI}
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.reportsAvailable ? (
        <p className="text-sm text-muted-foreground">{SET6_REPORTS_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!catalogue.savedAt ? <p className="text-sm text-[#C89933]">{SET6_REPORTS_CATALOGUE_WARNING}</p> : null}
          {REPORT_PACKS.map((pack) => (
            <ToggleRow
              key={pack}
              id={`set6-report-pack-${pack}`}
              label={REPORT_PACK_LABELS[pack]}
              checked={catalogue.packs[pack]}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setCatalogue((prev) => ({ ...prev, packs: { ...prev.packs, [pack]: checked } }))
              }
            />
          ))}
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={catalogueMutation.isPending}
              onClick={() => catalogueMutation.mutate()}
            >
              {catalogueMutation.isPending ? "Saving…" : "Save report catalogue"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            {!schedule.savedAt ? <p className="text-sm text-[#C89933]">{SET6_REPORTS_SCHEDULE_WARNING}</p> : null}
            <ToggleRow
              id="set6-report-schedule"
              label="Scheduled export intent"
              helper="Intent only — this does not run or email a report."
              checked={schedule.scheduleEnabled}
              disabled={!canEdit}
              onCheckedChange={(checked) => setSchedule((prev) => ({ ...prev, scheduleEnabled: checked }))}
            />
            <ToggleRow
              id="set6-report-access"
              label="Owner and manager access only"
              checked={schedule.ownerManagerAccessOnly}
              disabled={!canEdit}
              onCheckedChange={(checked) => setSchedule((prev) => ({ ...prev, ownerManagerAccessOnly: checked }))}
            />
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={scheduleMutation.isPending}
                onClick={() => scheduleMutation.mutate()}
              >
                {scheduleMutation.isPending ? "Saving…" : "Save schedule and access"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href={CARD7_HREF} data-testid="set6-open-card7-reports">
            Open Card 7 Reports setup
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={SET6_REPORTS_HREF} data-testid="set6-open-reports">
            Open reports
          </a>
        </Button>
      </div>
    </section>
  );
}

export function Set6OfflineSyncSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set6Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveEnablement = useServerFn(savePmsOfflineEnablementPosture);
  const saveSync = useServerFn(savePmsOfflineSyncPosture);
  const [enablement, setEnablement] = useState<OfflineEnablementPosture>(snapshot.offlineEnablement);
  const [sync, setSync] = useState<OfflineSyncPosture>(snapshot.offlineSync);

  useEffect(() => {
    setEnablement(snapshot.offlineEnablement);
  }, [snapshot.offlineEnablement]);
  useEffect(() => {
    setSync(snapshot.offlineSync);
  }, [snapshot.offlineSync]);

  const enableMutation = useMutation({
    mutationFn: () =>
      saveEnablement({
        data: {
          restaurantId,
          frontOfficeEnabled: enablement.frontOfficeEnabled,
          pmsEnabled: enablement.pmsEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Offline enablement saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: () => saveSync({ data: { restaurantId, conflictLabel: sync.conflictLabel } }),
    onSuccess: () => {
      toast.success("Sync posture saved.");
      refreshSet6(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["offline-sync"];

  return (
    <section id="offline-sync" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set6-offline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Offline &amp; sync</h2>
          <p className="mt-1 text-sm text-muted-foreground">{SET6_OFFLINE_INTENT_ONLY}</p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.offlineAvailable ? (
        <p className="text-sm text-muted-foreground">{SET6_OFFLINE_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!enablement.savedAt ? <p className="text-sm text-[#C89933]">{SET6_OFFLINE_ENABLE_WARNING}</p> : null}
          <ToggleRow
            id="set6-offline-fo"
            label="Front Office offline intent"
            checked={enablement.frontOfficeEnabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => setEnablement((prev) => ({ ...prev, frontOfficeEnabled: checked }))}
          />
          <ToggleRow
            id="set6-offline-pms"
            label="PMS offline intent"
            checked={enablement.pmsEnabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => setEnablement((prev) => ({ ...prev, pmsEnabled: checked }))}
          />
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={enableMutation.isPending}
              onClick={() => enableMutation.mutate()}
            >
              {enableMutation.isPending ? "Saving…" : "Save enablement posture"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            {!sync.savedAt ? <p className="text-sm text-[#C89933]">{SET6_OFFLINE_SYNC_WARNING}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="set6-conflict-label">Conflict label (text only)</Label>
              <Input
                id="set6-conflict-label"
                value={sync.conflictLabel}
                disabled={!canEdit}
                onChange={(event) => setSync((prev) => ({ ...prev, conflictLabel: event.target.value }))}
              />
            </div>
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending ? "Saving…" : "Save sync posture"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
