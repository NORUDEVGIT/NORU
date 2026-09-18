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
  IntegrationStatusBadge,
  IntegrationSummaryCard,
} from "@/packages/pms/components/settings/pms-card6-integration-bits";
import { Card6IntegrationTypeDialog } from "@/packages/pms/components/settings/pms-card6-integration-type-dialog";
import {
  Card6IntegrationDrawer,
  type IntegrationSavePayload,
} from "@/packages/pms/components/settings/pms-card6-integration-drawer";
import {
  deletePmsCard6Integration,
  getPmsCard6Integrations,
  recordPmsCard6IntegrationTest,
  savePmsCard6Integration,
  setPmsCard6IntegrationEnabled,
} from "@/packages/pms/lib/integrations-card6.functions";
import {
  INTEGRATION_STATUSES,
  SECRET_REENTRY_NOTICE,
  integrationActivityLabel,
  summarizeIntegrations,
  type IntegrationRecord,
  type IntegrationStatus,
} from "@/packages/pms/lib/integrations-card6.server";
import {
  INTEGRATION_CATALOG,
  integrationCategoryLabel,
  integrationProviderLabel,
  type IntegrationCategory,
  type SimulatedTestOutcome,
} from "@/packages/pms/lib/integrations-catalog";

const ENVIRONMENT_LABELS = { sandbox: "Sandbox", production: "Production" } as const;

function formatTimestamp(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Card6IntegrationsTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard6Integrations);
  const save = useServerFn(savePmsCard6Integration);
  const setEnabled = useServerFn(setPmsCard6IntegrationEnabled);
  const remove = useServerFn(deletePmsCard6Integration);
  const recordTest = useServerFn(recordPmsCard6IntegrationTest);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [drawer, setDrawer] = useState<{
    category: string;
    record: IntegrationRecord | null;
    startWithTest: boolean;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IntegrationRecord | null>(null);
  const [logsFor, setLogsFor] = useState<IntegrationRecord | null>(null);

  const queryKey = ["pms-card6-integrations", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: (payload: IntegrationSavePayload) => save({ data: { restaurantId, ...payload } }),
    onSuccess: async () => {
      await invalidate();
      setDrawer(null);
      toast.success("Integration saved. Credentials were not stored.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      setEnabled({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await invalidate();
      toast.success(input.enabled ? "Integration enabled." : "Integration disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
      toast.success("Integration deleted. Its history was kept.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (input: { id: string; outcome: SimulatedTestOutcome }) =>
      recordTest({
        data: {
          restaurantId,
          id: input.id,
          result: input.outcome.result,
          detail: input.outcome.checks
            .filter((check) => !check.passed)
            .map((check) => check.label)
            .join(", ")
            .slice(0, 400),
        },
      }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const records = useMemo(() => query.data?.integrations ?? [], [query.data]);
  const activity = query.data?.activity ?? [];
  const summary = useMemo(() => summarizeIntegrations(records), [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((row) => {
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (term.length === 0) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        integrationProviderLabel(row.category, row.provider).toLowerCase().includes(term) ||
        integrationCategoryLabel(row.category).toLowerCase().includes(term)
      );
    });
  }, [records, search, categoryFilter, statusFilter]);

  const logEntries = logsFor
    ? activity.filter(
        (row) => row.integrationId === logsFor.id || row.integrationName === logsFor.name,
      )
    : [];

  return (
    <div className="space-y-5" data-testid="card6-integrations-tab">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IntegrationSummaryCard label="Total integrations" value={summary.total} />
        <IntegrationSummaryCard label="Enabled" value={summary.enabled} tone="positive" />
        <IntegrationSummaryCard
          label="Awaiting setup"
          value={summary.awaitingSetup}
          tone="warning"
        />
        <IntegrationSummaryCard label="Errors" value={summary.errors} tone="danger" />
      </div>

      {records.length > 0 ? (
        <IntegrationNotice tone="warning">{SECRET_REENTRY_NOTICE}</IntegrationNotice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or provider"
            className="pl-9"
            aria-label="Search integrations"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[13rem]" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {INTEGRATION_CATALOG.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INTEGRATION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status
                  .split("_")
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(" ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit ? (
          <Button
            type="button"
            onClick={() => setTypeDialogOpen(true)}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            data-testid="card6-add-integration"
          >
            <Plus className="mr-1 size-4" /> Add integration
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading integrations…</p>
        ) : query.isError ? (
          <p className="p-6 text-sm text-destructive">
            {(query.error as Error | undefined)?.message ?? "Integrations are unavailable."}
          </p>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">
              {records.length === 0 ? "No integrations yet" : "No integrations match these filters"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {records.length === 0
                ? "Connect a payment gateway, messaging provider, ledger or fiscal device to get started."
                : "Clear the search or change the filters to see the rest."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Last test</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} data-testid={`card6-row-${row.id}`}>
                  <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {integrationCategoryLabel(row.category)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {integrationProviderLabel(row.category, row.provider)}
                  </TableCell>
                  <TableCell>
                    <IntegrationStatusBadge status={row.status as IntegrationStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ENVIRONMENT_LABELS[row.environment]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(row.lastTestAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            setDrawer({ category: row.category, record: row, startWithTest: false })
                          }
                          disabled={!canEdit}
                        >
                          Configure
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setDrawer({ category: row.category, record: row, startWithTest: true })
                          }
                          disabled={!canEdit}
                        >
                          Test connection
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setLogsFor(row)}>
                          View logs
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            toggleMutation.mutate({ id: row.id, enabled: !row.enabled })
                          }
                          disabled={!canEdit}
                        >
                          {row.enabled ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setPendingDelete(row)}
                          disabled={!canEdit}
                          className="text-destructive focus:text-destructive"
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
        )}
      </div>

      <Card6IntegrationTypeDialog
        open={typeDialogOpen}
        onOpenChange={setTypeDialogOpen}
        onSelect={(category: IntegrationCategory) => {
          setTypeDialogOpen(false);
          setDrawer({ category, record: null, startWithTest: false });
        }}
      />

      {drawer ? (
        <Card6IntegrationDrawer
          open
          onOpenChange={(open) => {
            if (!open) setDrawer(null);
          }}
          restaurantId={restaurantId}
          category={drawer.category}
          record={drawer.record}
          existingNames={records
            .filter((row) => row.id !== drawer.record?.id)
            .map((row) => row.name)}
          saving={saveMutation.isPending}
          startWithTest={drawer.startWithTest}
          onSave={(payload) => saveMutation.mutate(payload)}
          onRecordTest={(id, outcome) => testMutation.mutate({ id, outcome })}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The configuration is removed from this property. Its activity history is kept so you
              can still see what happened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={logsFor !== null}
        onOpenChange={(open) => {
          if (!open) setLogsFor(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-[#251605]">Activity</DialogTitle>
            <DialogDescription>{logsFor?.name}</DialogDescription>
          </DialogHeader>
          {logEntries.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {logEntries.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-[#E5DED1] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-[#251605]">
                      {integrationActivityLabel(entry.event)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </div>
                  {entry.detail ? (
                    <p className="mt-1 text-xs text-muted-foreground">{entry.detail}</p>
                  ) : null}
                  {entry.simulated ? (
                    <p className="mt-1 text-xs text-[#7A5511]">Simulated — no request left NORU.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
