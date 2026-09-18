import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  IntegrationNotice,
  IntegrationSummaryCard,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import {
  DistributionActivationBadge,
  DistributionStatusBadge,
  DistributionSyncStatusBadge,
} from "@/packages/pms/components/settings/pms-card6-distribution-bits";
import {
  Card6DistributionDrawer,
  type DistributionSavePayload,
} from "@/packages/pms/components/settings/pms-card6-distribution-drawer";
import { Card6DistributionValidation } from "@/packages/pms/components/settings/pms-card6-distribution-validation";
import {
  deletePmsCard6Distribution,
  getPmsCard6Distribution,
  savePmsCard6Distribution,
  setPmsCard6DistributionActive,
  setPmsCard6DistributionEnabled,
} from "@/packages/pms/lib/distribution-card6.functions";
import {
  SYNC_SERVICE_NOTICE,
  summarizeDistribution,
  type DistributionChannelDetail,
  type DistributionDraft,
} from "@/packages/pms/lib/distribution-card6.server";
import {
  DISTRIBUTION_PROVIDERS,
  distributionSyncCapabilities,
  distributionProviderLabel,
  validateDistributionDraft,
  validateDistributionSyncConfig,
} from "@/packages/pms/lib/distribution-catalog";

const ENVIRONMENT_LABELS = { sandbox: "Sandbox", production: "Production" } as const;

function toDraft(row: DistributionChannelDetail): DistributionDraft {
  return {
    integrationId: row.integrationId,
    channel: row.channel,
    environment: row.environment,
    rooms: row.roomMappings.map((item) => ({ noruId: item.noruId, externalId: item.externalId })),
    rates: row.rateMappings.map((item) => ({ noruId: item.noruId, externalId: item.externalId })),
    meals: row.mealMappings.map((item) => ({ noruId: item.noruId, externalId: item.externalId })),
  };
}

export function Card6DistributionTab({
  restaurantId,
  canEdit,
  onGoToIntegrations,
}: {
  restaurantId: string;
  canEdit: boolean;
  onGoToIntegrations: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard6Distribution);
  const save = useServerFn(savePmsCard6Distribution);
  const setEnabled = useServerFn(setPmsCard6DistributionEnabled);
  const setActive = useServerFn(setPmsCard6DistributionActive);
  const remove = useServerFn(deletePmsCard6Distribution);

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DistributionChannelDetail | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DistributionChannelDetail | null>(null);
  const [pendingDisable, setPendingDisable] = useState<DistributionChannelDetail | null>(null);
  const [detailsFor, setDetailsFor] = useState<DistributionChannelDetail | null>(null);
  const [validateFor, setValidateFor] = useState<DistributionChannelDetail | null>(null);
  const [pendingActivation, setPendingActivation] = useState<{
    row: DistributionChannelDetail;
    active: boolean;
  } | null>(null);

  const queryKey = ["pms-card6-distribution", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const snapshot = query.data;
  const records = useMemo(() => snapshot?.channels ?? [], [snapshot]);
  const summary = useMemo(() => summarizeDistribution(records), [records]);
  const selectableCount = snapshot?.integrations.filter((row) => row.selectable).length ?? 0;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((row) => {
      if (providerFilter !== "all" && row.provider !== providerFilter) return false;
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;
      if (statusFilter !== "all" && row.mappingStatus !== statusFilter) return false;
      if (term.length === 0) return true;
      return (
        row.channelLabel.toLowerCase().includes(term) ||
        row.integrationName.toLowerCase().includes(term) ||
        distributionProviderLabel(row.provider).toLowerCase().includes(term)
      );
    });
  }, [records, search, providerFilter, channelFilter, statusFilter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: (payload: DistributionSavePayload) => save({ data: { restaurantId, ...payload } }),
    onSuccess: async () => {
      await invalidate();
      setDrawerOpen(false);
      setEditing(null);
      toast.success("Distribution configuration saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      setEnabled({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await invalidate();
      setPendingDisable(null);
      toast.success(input.enabled ? "Distribution enabled." : "Distribution disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
      toast.success("Distribution configuration deleted. The integration was kept.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activationMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await invalidate();
      setPendingActivation(null);
      setDrawerOpen(false);
      setEditing(null);
      toast.success(
        input.active
          ? "Distribution activated. No external synchronization has run."
          : "Distribution deactivated. Mappings were preserved.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const emptySnapshot = {
    channels: [],
    integrations: [],
    roomTypes: [],
    ratePlans: [],
    mealPlans: [],
  };

  return (
    <div className="space-y-5" data-testid="card6-distribution-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Distribution</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your channels and map Noru PMS data to connected distribution providers.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            data-testid="card6-add-distribution"
          >
            <Plus className="mr-1 size-4" /> Add Distribution
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IntegrationSummaryCard label="Total channels" value={summary.total} />
        <IntegrationSummaryCard label="Active" value={summary.connected} tone="positive" />
        <IntegrationSummaryCard label="Pending" value={summary.pending} tone="warning" />
        <IntegrationSummaryCard
          label="Attention required"
          value={summary.attention}
          tone="danger"
        />
      </div>

      <IntegrationNotice>
        The external sync service is not connected. Sync status and history remain empty until a
        backend confirms real synchronization.
      </IntegrationNotice>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search channels..."
            className="pl-9"
            aria-label="Search channels"
          />
        </div>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[13rem]" aria-label="Filter by provider">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {DISTRIBUTION_PROVIDERS.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[13rem]" aria-label="Filter by channel">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {Array.from(
              new Map(
                DISTRIBUTION_PROVIDERS.flatMap((provider) =>
                  provider.channels.map((channel) => [channel.id, channel.label] as const),
                ),
              ).entries(),
            ).map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="attention">Attention Required</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading distribution channels…</p>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">
              {(query.error as Error | undefined)?.message ?? "Distribution is unavailable."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center">
            {selectableCount === 0 ? (
              <>
                <p className="font-medium text-[#251605]">
                  No distribution integrations available.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set up a distribution integration first.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  variant="outline"
                  onClick={onGoToIntegrations}
                >
                  Go to Integrations
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-[#251605]">No distribution channels configured.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect a channel to a distribution integration to start managing inventory and
                  rates.
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-4 bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                    onClick={() => {
                      setEditing(null);
                      setDrawerOpen(true);
                    }}
                  >
                    <Plus className="mr-1 size-4" /> Add Distribution
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No channels match these filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sync status</TableHead>
                <TableHead>Room types</TableHead>
                <TableHead>Rate plans</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-[#251605]">
                    {distributionProviderLabel(row.provider)}
                  </TableCell>
                  <TableCell>{row.channelLabel}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {ENVIRONMENT_LABELS[row.environment]}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <DistributionActivationBadge status={row.activationStatus} />
                      <DistributionStatusBadge status={row.mappingStatus} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <DistributionSyncStatusBadge status={row.syncStatus.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.roomMapped} / {row.roomTotal}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.rateMapped} / {row.rateTotal}
                  </TableCell>
                  <TableCell className="text-muted-foreground">Never</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${row.channelLabel}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          Configure
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setValidateFor(row)}>
                          Validate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDetailsFor(row)}>
                          View sync history
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled title={SYNC_SERVICE_NOTICE}>
                          Sync now
                        </DropdownMenuItem>
                        {canEdit ? (
                          <>
                            <DropdownMenuItem
                              onSelect={() =>
                                row.enabled
                                  ? setPendingDisable(row)
                                  : toggleMutation.mutate({ id: row.id, enabled: true })
                              }
                            >
                              {row.enabled ? "Disable" : "Enable"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setPendingDelete(row)}>
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Card6DistributionDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setEditing(null);
        }}
        snapshot={snapshot ?? emptySnapshot}
        record={editing}
        saving={saveMutation.isPending}
        canEdit={canEdit}
        onSave={(payload) => saveMutation.mutate(payload)}
        onGoToIntegrations={() => {
          setDrawerOpen(false);
          onGoToIntegrations();
        }}
        onRequestActivation={(active) => {
          if (editing) setPendingActivation({ row: editing, active });
        }}
      />

      <Card6DistributionValidation
        open={Boolean(validateFor)}
        onOpenChange={(open) => {
          if (!open) setValidateFor(null);
        }}
        checks={
          validateFor && snapshot
            ? [
                ...validateDistributionDraft(toDraft(validateFor), {
                  integration:
                    snapshot.integrations.find((row) => row.id === validateFor.integrationId) ??
                    null,
                  roomTypes: snapshot.roomTypes,
                  ratePlans: snapshot.ratePlans,
                  mealPlans: snapshot.mealPlans,
                  takenChannels: snapshot.channels.map((row) => ({
                    integrationId: row.integrationId,
                    channel: row.channel,
                    excludeId: row.id,
                  })),
                  excludeId: validateFor.id,
                }),
                ...validateDistributionSyncConfig(
                  validateFor.syncConfig,
                  distributionSyncCapabilities(validateFor.provider, validateFor.channel),
                ),
              ]
            : []
        }
      />

      <Dialog open={Boolean(detailsFor)} onOpenChange={(open) => !open && setDetailsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync History — {detailsFor?.channelLabel}</DialogTitle>
            <DialogDescription>
              No synchronization history yet. Results will appear here once a real sync service
              runs.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No synchronization history yet.
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete distribution configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the channel mapping configuration. The connected integration will
              remain available. Room types, rate plans and meal plans are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingActivation)}
        onOpenChange={(open) => !open && setPendingActivation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingActivation?.active ? "Activate Distribution?" : "Deactivate Distribution?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingActivation?.active
                ? "This enables the saved synchronization configuration. No external sync will run until a backend service is connected."
                : "Synchronization will stop for this channel. Existing mappings will remain saved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingActivation?.active ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{distributionProviderLabel(pendingActivation.row.provider)}</dd>
              <dt className="text-muted-foreground">Channel</dt>
              <dd>{pendingActivation.row.channelLabel}</dd>
              <dt className="text-muted-foreground">Environment</dt>
              <dd>{ENVIRONMENT_LABELS[pendingActivation.row.environment]}</dd>
              <dt className="text-muted-foreground">Inventory Sync</dt>
              <dd>{pendingActivation.row.syncConfig.inventory.enabled ? "ON" : "OFF"}</dd>
              <dt className="text-muted-foreground">Rate Sync</dt>
              <dd>{pendingActivation.row.syncConfig.rates.enabled ? "ON" : "OFF"}</dd>
              <dt className="text-muted-foreground">Restriction Sync</dt>
              <dd>{pendingActivation.row.syncConfig.restrictions.enabled ? "ON" : "OFF"}</dd>
            </dl>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={activationMutation.isPending}
              onClick={() =>
                pendingActivation &&
                activationMutation.mutate({
                  id: pendingActivation.row.id,
                  active: pendingActivation.active,
                })
              }
            >
              {activationMutation.isPending
                ? pendingActivation?.active
                  ? "Activating…"
                  : "Deactivating…"
                : pendingActivation?.active
                  ? "Activate"
                  : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDisable)}
        onOpenChange={(open) => !open && setPendingDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {pendingDisable?.channelLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Distribution through this channel will be disabled. Mappings are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingDisable && toggleMutation.mutate({ id: pendingDisable.id, enabled: false })
              }
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
