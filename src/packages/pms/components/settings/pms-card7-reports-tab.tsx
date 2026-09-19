import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { PmsPropertySetupCard7Workspace } from "./pms-property-setup-card7-workspace";
import { propertySetupStatusLabel } from "../../lib/pms-property-setup-card1";
import {
  getCard7Reports,
  saveCard7ReportDefinitions,
  saveCard7ReportMetrics,
  saveCard7ReportPermissions,
  saveCard7ReportPolicy,
} from "../../lib/reports-card7.functions";
import {
  CARD7_REPORT_CADENCES,
  CARD7_REPORT_PERIOD_BASES,
  CARD7_REPORTS_NO_SCHEDULER,
  CARD7_REPORTS_SETUP_ONLY,
  emptyReportPolicy,
  emptyReportsSnapshot,
  evaluateCard7ReportsReadiness,
  metricSettingFor,
  reportSettingFor,
  type Card7MetricSetting,
  type Card7ReportDefinition,
  type Card7ReportDefinitionSetting,
  type Card7ReportPermissionMapping,
  type Card7ReportPolicy,
  type Card7ReportsReadiness,
  type Card7ReportsSnapshot,
} from "../../lib/reports-card7.server";

const INNER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "catalogue", label: "Report Catalogue" },
  { id: "metrics", label: "Metrics" },
  { id: "permissions", label: "Permissions" },
  { id: "defaults", label: "Export & Schedule Defaults" },
] as const;

export function Card7ReportsTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard7Reports);
  const saveDefinitions = useServerFn(saveCard7ReportDefinitions);
  const saveMetrics = useServerFn(saveCard7ReportMetrics);
  const savePermissions = useServerFn(saveCard7ReportPermissions);
  const savePolicy = useServerFn(saveCard7ReportPolicy);
  const query = useQuery({
    queryKey: ["pms-card7-reports", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: Card7ReportsSnapshot = query.data?.snapshot ?? emptyReportsSnapshot();
  const readiness: Card7ReportsReadiness =
    query.data?.readiness ?? evaluateCard7ReportsReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);

  const [inner, setInner] = useState<(typeof INNER_TABS)[number]["id"]>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [definitionDraft, setDefinitionDraft] = useState<
    Record<string, Card7ReportDefinitionSetting> | undefined
  >();
  const [metricDraft, setMetricDraft] = useState<Record<string, Card7MetricSetting> | undefined>();
  const [mappingDraft, setMappingDraft] = useState<
    Record<string, Card7ReportPermissionMapping> | undefined
  >();
  const [policyDraft, setPolicyDraft] = useState<Card7ReportPolicy | undefined>();
  const [validated, setValidated] = useState<Card7ReportsReadiness | null>(null);

  const shownDefinitions = useMemo(() => {
    if (definitionDraft) return definitionDraft;
    return Object.fromEntries(
      snapshot.definitions.map((definition) => [
        definition.id,
        reportSettingFor(snapshot, definition.id) ?? {
          id: "",
          definitionId: definition.id,
          enabled: true,
        },
      ]),
    );
  }, [definitionDraft, snapshot]);

  const shownMetrics = useMemo(() => {
    if (metricDraft) return metricDraft;
    return Object.fromEntries(
      snapshot.metrics.map((metric) => [
        metric.id,
        metricSettingFor(snapshot, metric.id) ?? {
          id: "",
          metricId: metric.id,
          enabled: true,
          displayName: "",
        },
      ]),
    );
  }, [metricDraft, snapshot]);

  const shownMappings = useMemo(() => {
    if (mappingDraft) return mappingDraft;
    return Object.fromEntries(
      snapshot.permissionMappings.map((row) => [
        `${row.definitionId}:${row.permissionId}`,
        row,
      ]),
    );
  }, [mappingDraft, snapshot.permissionMappings]);

  const policy = policyDraft ?? snapshot.policy ?? emptyReportPolicy();
  const selectedDefinition =
    snapshot.definitions.find((row) => row.id === selectedDefinitionId) ?? null;
  const shownReadiness = validated ?? readiness;

  const filteredDefinitions = useMemo(() => {
    const value = search.trim().toLowerCase();
    return snapshot.definitions.filter((definition) => {
      const enabled = shownDefinitions[definition.id]?.enabled !== false;
      if (statusFilter === "active" && !enabled) return false;
      if (statusFilter === "inactive" && enabled) return false;
      const category =
        snapshot.categories.find((row) => row.id === definition.categoryId)?.name ?? "";
      return (
        !value ||
        `${definition.name} ${definition.code} ${definition.description} ${category}`
          .toLowerCase()
          .includes(value)
      );
    });
  }, [search, shownDefinitions, snapshot.categories, snapshot.definitions, statusFilter]);

  function refresh(result: {
    snapshot: Card7ReportsSnapshot;
    readiness: Card7ReportsReadiness;
  }) {
    queryClient.setQueryData(["pms-card7-reports", restaurantId], {
      ...query.data,
      snapshot: result.snapshot,
      readiness: result.readiness,
      canEdit: editor,
    });
    void queryClient.invalidateQueries({ queryKey: ["pms-card7-validation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    setValidated(null);
  }

  const definitionsMutation = useMutation({
    mutationFn: () =>
      saveDefinitions({
        data: {
          restaurantId,
          settings: snapshot.definitions.map((definition) => ({
            definitionId: definition.id,
            enabled: shownDefinitions[definition.id]?.enabled !== false,
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setDefinitionDraft(undefined);
      toast.success("Report catalogue saved and SET6 posture mirrored.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const metricsMutation = useMutation({
    mutationFn: () =>
      saveMetrics({
        data: {
          restaurantId,
          settings: snapshot.metrics.map((metric) => ({
            metricId: metric.id,
            enabled: shownMetrics[metric.id]?.enabled !== false,
            displayName: shownMetrics[metric.id]?.displayName ?? "",
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setMetricDraft(undefined);
      toast.success("Metric display settings saved. Canonical formulas were unchanged.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const permissionsMutation = useMutation({
    mutationFn: () =>
      savePermissions({
        data: {
          restaurantId,
          mappings: Object.values(shownMappings).map((row) => ({
            definitionId: row.definitionId,
            permissionId: row.permissionId,
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setMappingDraft(undefined);
      toast.success("Report permission mappings saved. Live authz is unchanged.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const policyMutation = useMutation({
    mutationFn: () =>
      savePolicy({
        data: {
          restaurantId,
          exportAllowed: policy.exportAllowed,
          exportCsv: policy.exportCsv,
          exportPdf: policy.exportPdf,
          maskGuestNames: policy.maskGuestNames,
          ownerManagerExportOnly: policy.ownerManagerExportOnly,
          defaultDateRangeDays: policy.defaultDateRangeDays,
          scheduleIntentEnabled: policy.scheduleIntentEnabled,
          scheduleCadence: policy.scheduleCadence,
          periodBasis: policy.periodBasis,
          active: policy.active,
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setPolicyDraft(result.snapshot.policy);
      toast.success("Report defaults saved. No schedule was executed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleMapping(definitionId: string, permissionId: string, enabled: boolean) {
    const key = `${definitionId}:${permissionId}`;
    const next = { ...shownMappings };
    if (enabled) {
      next[key] = { id: "", definitionId, permissionId };
    } else {
      delete next[key];
    }
    setMappingDraft(next);
  }

  return (
    <PmsPropertySetupCard7Workspace
      validate={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = evaluateCard7ReportsReadiness(snapshot);
            setValidated(next);
            if (next.ready) toast.success("Reports & Analytics setup is ready. Card 7 is not complete.");
            else toast.error(next.blockers[0] ?? "Reports & Analytics setup is not ready.");
          }}
        >
          Validate
        </Button>
      }
      search={
        inner === "catalogue" ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1">
              <Label htmlFor="card7-report-search">Search reports</Label>
              <Input
                id="card7-report-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, code or category"
              />
            </div>
            <div className="w-40 space-y-1">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Enabled</SelectItem>
                  <SelectItem value="inactive">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {CARD7_REPORTS_SETUP_ONLY} {CARD7_REPORTS_NO_SCHEDULER}
          </p>
        )
      }
      drawer={
        selectedDefinition ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="card7-report-drawer">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Report definition</p>
              <h3 className="font-medium text-[#251605]">{selectedDefinition.name}</h3>
              <p className="text-xs text-muted-foreground">{selectedDefinition.code}</p>
            </div>
            <p className="text-sm">{selectedDefinition.description}</p>
            <p className="text-xs text-muted-foreground">
              Execution remains in the existing Reports module. Card 7 stores no SQL.
            </p>
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch
                checked={shownDefinitions[selectedDefinition.id]?.enabled !== false}
                disabled={!editor}
                onCheckedChange={(enabled) =>
                  setDefinitionDraft({
                    ...shownDefinitions,
                    [selectedDefinition.id]: {
                      ...shownDefinitions[selectedDefinition.id],
                      id: shownDefinitions[selectedDefinition.id]?.id ?? "",
                      definitionId: selectedDefinition.id,
                      enabled,
                    },
                  })
                }
              />
            </div>
          </div>
        ) : undefined
      }
      status={
        <div>
          <p className="text-sm text-[#251605]">
            Reports: {propertySetupStatusLabel(shownReadiness.status)}
          </p>
          <p className={shownReadiness.blockers[0] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {shownReadiness.blockers[0] ?? shownReadiness.warnings[0]}
          </p>
        </div>
      }
      actions={<p className="text-xs text-muted-foreground">Configure only · Live reports unchanged</p>}
    >
      <Tabs value={inner} onValueChange={(value) => setInner(value as typeof inner)}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          {INNER_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-testid={`card7-reports-${tab.id}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Report definitions", snapshot.definitions.length],
              ["Enabled reports", Object.values(shownDefinitions).filter((row) => row.enabled).length],
              ["Canonical metrics", snapshot.metrics.length],
              ["Permission mappings", Object.keys(shownMappings).length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-medium text-[#251605]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border bg-card p-4 text-sm">
            <p>
              Reporting period: <strong>{policy.periodBasis.replace("_", " ")}</strong>
            </p>
            <p className="mt-1 text-muted-foreground">
              Card 3 fiscal year: {snapshot.fiscalReference.saved
                ? `${snapshot.fiscalReference.startMonth}/${snapshot.fiscalReference.startDay}`
                : "not saved"}
            </p>
            <a className="mt-3 inline-block text-[#9A6B16] underline-offset-2 hover:underline" href="/restaurant/pms/reports">
              Open live Reports & Analytics
            </a>
          </div>
        </TabsContent>

        <TabsContent value="catalogue" className="space-y-3">
          {filteredDefinitions.map((definition) => {
            const category = snapshot.categories.find((row) => row.id === definition.categoryId);
            return (
              <button
                type="button"
                key={definition.id}
                onClick={() => setSelectedDefinitionId(definition.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left hover:border-[#C89933]"
              >
                <span>
                  <span className="font-medium text-[#251605]">{definition.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {definition.code} · {category?.name ?? "Unknown category"}
                  </span>
                </span>
                <span className="text-xs">
                  {shownDefinitions[definition.id]?.enabled !== false ? "Enabled" : "Disabled"}
                </span>
              </button>
            );
          })}
          {editor ? (
            <Button onClick={() => definitionsMutation.mutate()} disabled={definitionsMutation.isPending}>
              {definitionsMutation.isPending ? "Saving…" : "Save report catalogue"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="metrics" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Formula definitions are read-only and canonical. Tenant settings can only enable a metric or change its display label.
          </p>
          {snapshot.metrics.map((metric) => {
            const setting = shownMetrics[metric.id];
            return (
              <div key={metric.id} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <p className="font-medium text-[#251605]">{metric.name}</p>
                  <p className="text-xs text-muted-foreground">{metric.code} · {metric.unit}</p>
                  <p className="mt-2 text-xs">{metric.formulaNotes}</p>
                </div>
                <div className="space-y-1">
                  <Label>Display label</Label>
                  <Input
                    value={setting?.displayName ?? ""}
                    disabled={!editor}
                    placeholder={metric.name}
                    onChange={(event) =>
                      setMetricDraft({
                        ...shownMetrics,
                        [metric.id]: {
                          ...setting,
                          id: setting?.id ?? "",
                          metricId: metric.id,
                          enabled: setting?.enabled !== false,
                          displayName: event.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label>Enabled</Label>
                  <Switch
                    checked={setting?.enabled !== false}
                    disabled={!editor}
                    onCheckedChange={(enabled) =>
                      setMetricDraft({
                        ...shownMetrics,
                        [metric.id]: {
                          ...setting,
                          id: setting?.id ?? "",
                          metricId: metric.id,
                          displayName: setting?.displayName ?? "",
                          enabled,
                        },
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          {editor ? (
            <Button onClick={() => metricsMutation.mutate()} disabled={metricsMutation.isPending}>
              {metricsMutation.isPending ? "Saving…" : "Save metric settings"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="permissions" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            These mappings are setup-only. They do not replace STAFF_ROLES or reports_analytics access.
          </p>
          {snapshot.definitions.map((definition) => (
            <div key={definition.id} className="rounded-2xl border bg-card p-4">
              <p className="mb-3 font-medium text-[#251605]">{definition.name}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {snapshot.permissions.map((permission) => {
                  const key = `${definition.id}:${permission.id}`;
                  return (
                    <div key={permission.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <span>
                        <span className="block text-sm">{permission.name}</span>
                        <span className="block text-xs text-muted-foreground">{permission.code}</span>
                      </span>
                      <Switch
                        checked={Boolean(shownMappings[key])}
                        disabled={!editor}
                        onCheckedChange={(checked) =>
                          toggleMapping(definition.id, permission.id, checked)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {editor ? (
            <Button onClick={() => permissionsMutation.mutate()} disabled={permissionsMutation.isPending}>
              {permissionsMutation.isPending ? "Saving…" : "Save report permissions"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="defaults" className="space-y-4 rounded-2xl border bg-card p-4">
          {([
            ["Allow configured exports", "exportAllowed"],
            ["CSV format", "exportCsv"],
            ["PDF format", "exportPdf"],
            ["Mask guest names", "maskGuestNames"],
            ["Owner/manager export only", "ownerManagerExportOnly"],
            ["Scheduled report intent", "scheduleIntentEnabled"],
          ] as const).map(([label, key]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label>{label}</Label>
              <Switch
                checked={Boolean(policy[key as keyof Card7ReportPolicy])}
                disabled={!editor}
                onCheckedChange={(checked) => setPolicyDraft({ ...policy, [key]: checked })}
              />
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Default date range (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={policy.defaultDateRangeDays}
                disabled={!editor}
                onChange={(event) =>
                  setPolicyDraft({ ...policy, defaultDateRangeDays: Number(event.target.value) })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Schedule cadence</Label>
              <Select
                value={policy.scheduleCadence ?? "none"}
                disabled={!editor || !policy.scheduleIntentEnabled}
                onValueChange={(value) =>
                  setPolicyDraft({
                    ...policy,
                    scheduleCadence:
                      value === "none" ? null : (value as Card7ReportPolicy["scheduleCadence"]),
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CARD7_REPORT_CADENCES.map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reporting period basis</Label>
              <Select
                value={policy.periodBasis}
                disabled={!editor}
                onValueChange={(value) =>
                  setPolicyDraft({
                    ...policy,
                    periodBasis: value as Card7ReportPolicy["periodBasis"],
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARD7_REPORT_PERIOD_BASES.map((value) => (
                    <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {policy.periodBasis === "fiscal_year" ? (
            <p className="text-sm text-muted-foreground">
              Fiscal year is read from Card 3: {snapshot.fiscalReference.saved
                ? `${snapshot.fiscalReference.startMonth}/${snapshot.fiscalReference.startDay}`
                : "not configured"}. Card 7 does not edit it.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{CARD7_REPORTS_NO_SCHEDULER}</p>
          {editor ? (
            <Button onClick={() => policyMutation.mutate()} disabled={policyMutation.isPending}>
              {policyMutation.isPending ? "Saving…" : "Save export & schedule defaults"}
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>
    </PmsPropertySetupCard7Workspace>
  );
}
