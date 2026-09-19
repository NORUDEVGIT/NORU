import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { PmsPropertySetupCard7Workspace } from "@/packages/pms/components/settings/pms-property-setup-card7-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  getCard7Audit,
  getCard7AuditEvents,
  saveCard7AuditCategorySettings,
  saveCard7AuditPolicy,
  saveCard7AuditSensitiveCoverage,
} from "@/packages/pms/lib/audit-card7.functions";
import {
  CARD7_AUDIT_COVERAGE_VALUES,
  CARD7_AUDIT_EVENT_SOURCES,
  CARD7_AUDIT_NO_ENFORCEMENT_COPY,
  CARD7_AUDIT_NO_PURGE_COPY,
  CARD7_AUDIT_SEVERITIES,
  CARD7_AUDIT_VIEWER_GATE_COPY,
  CARD7_AUDIT_VIEWER_LIMITATIONS,
  CARD7_REQUIRED_AUDIT_CATEGORY_CODES,
  coverageForPermission,
  emptyAuditSnapshot,
  evaluateCard7AuditReadiness,
  resolvedCategorySeverity,
  settingForCategory,
  type Card7AuditCategorySetting,
  type Card7AuditCoverageRow,
  type Card7AuditCoverageValue,
  type Card7AuditEvent,
  type Card7AuditEventSource,
  type Card7AuditPolicy,
  type Card7AuditReadiness,
  type Card7AuditSeverity,
  type Card7AuditSnapshot,
} from "@/packages/pms/lib/audit-card7.server";

const INNER_TABS = [
  { id: "policy", label: "Policy & retention" },
  { id: "categories", label: "Event coverage" },
  { id: "coverage", label: "Sensitive coverage" },
  { id: "events", label: "Events" },
] as const;

function jsonPreview(value: unknown): string {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function Card7AuditTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  function invalidateHub() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card7-validation", restaurantId] });
  }
  const load = useServerFn(getCard7Audit);
  const savePolicy = useServerFn(saveCard7AuditPolicy);
  const saveCategories = useServerFn(saveCard7AuditCategorySettings);
  const saveCoverage = useServerFn(saveCard7AuditSensitiveCoverage);
  const loadEvents = useServerFn(getCard7AuditEvents);
  const query = useQuery({
    queryKey: ["pms-card7-audit", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: Card7AuditSnapshot = query.data?.snapshot ?? emptyAuditSnapshot();
  const readiness: Card7AuditReadiness = query.data?.readiness ?? evaluateCard7AuditReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);
  const canViewEvents = query.data?.canViewEvents === true;

  const [inner, setInner] = useState<(typeof INNER_TABS)[number]["id"]>("policy");
  const [policy, setPolicy] = useState<Card7AuditPolicy | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, Card7AuditCategorySetting> | null>(null);
  const [coverageDraft, setCoverageDraft] = useState<Record<string, Card7AuditCoverageRow> | null>(null);
  const [validated, setValidated] = useState<Card7AuditReadiness | null>(null);
  const [eventQuery, setEventQuery] = useState("");
  const [eventFrom, setEventFrom] = useState("");
  const [eventTo, setEventTo] = useState("");
  const [eventSource, setEventSource] = useState<"all" | Card7AuditEventSource>("all");
  const [eventCategory, setEventCategory] = useState("all");
  const [eventAction, setEventAction] = useState("");
  const [eventUser, setEventUser] = useState("");
  const [eventSeverity, setEventSeverity] = useState<"all" | Card7AuditSeverity>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const shownPolicy = policy ?? snapshot.policy;
  const shownSettings = useMemo(() => {
    if (settingsDraft) return settingsDraft;
    const next: Record<string, Card7AuditCategorySetting> = {};
    for (const category of snapshot.categories) {
      const existing = settingForCategory(snapshot, category.id);
      next[category.id] = existing ?? {
        id: "",
        categoryId: category.id,
        enabled: true,
        severity: category.defaultSeverity,
        critical: category.defaultSeverity === "critical",
      };
    }
    return next;
  }, [settingsDraft, snapshot]);

  const shownCoverage = useMemo(() => {
    if (coverageDraft) return coverageDraft;
    const next: Record<string, Card7AuditCoverageRow> = {};
    for (const permission of snapshot.sensitivePermissions) {
      const existing = coverageForPermission(snapshot, permission.id);
      next[permission.id] = existing ?? {
        id: "",
        permissionId: permission.id,
        coverage: "required",
        notes: "",
      };
    }
    return next;
  }, [coverageDraft, snapshot]);

  const eventsQuery = useQuery({
    queryKey: [
      "pms-card7-audit-events",
      restaurantId,
      eventFrom,
      eventTo,
      eventQuery,
      eventSource,
      eventCategory,
      eventAction,
      eventUser,
      eventSeverity,
    ],
    enabled: inner === "events" && canViewEvents,
    queryFn: () =>
      loadEvents({
        data: {
          restaurantId,
          from: eventFrom ? new Date(`${eventFrom}T00:00:00`).toISOString() : undefined,
          to: eventTo ? new Date(`${eventTo}T23:59:59`).toISOString() : undefined,
          query: eventQuery,
          source: eventSource,
          categoryCode: eventCategory,
          action: eventAction,
          actorUserId: eventUser.trim() ? eventUser.trim() : "all",
          severity: eventSeverity,
        },
      }),
  });

  const events = eventsQuery.data?.events ?? [];
  const selectedEvent: Card7AuditEvent | null =
    events.find((row) => row.id === selectedEventId) ?? events[0] ?? null;

  function cacheSnapshot(next: { snapshot: Card7AuditSnapshot; readiness: Card7AuditReadiness }) {
    queryClient.setQueryData(["pms-card7-audit", restaurantId], {
      snapshot: next.snapshot,
      readiness: next.readiness,
      canEdit: editor,
      canViewEvents,
      role: query.data?.role,
      viewerLimitations: query.data?.viewerLimitations ?? [...CARD7_AUDIT_VIEWER_LIMITATIONS],
    });
  }

  const policyMutation = useMutation({
    mutationFn: () =>
      savePolicy({
        data: {
          restaurantId,
          enabled: shownPolicy.enabled,
          retentionDays: shownPolicy.retentionDays ?? 365,
          maskIdNumbers: shownPolicy.maskIdNumbers,
          restrictGuestExport: shownPolicy.restrictGuestExport,
          active: shownPolicy.active,
        },
      }),
    onSuccess: (result) => {
      toast.success("Audit policy saved. SET5 retention JSON was mirrored.");
      invalidateHub();
      cacheSnapshot(result);
      setPolicy(result.snapshot.policy);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const categoryMutation = useMutation({
    mutationFn: () =>
      saveCategories({
        data: {
          restaurantId,
          settings: snapshot.categories.map((category) => ({
            categoryId: category.id,
            enabled: shownSettings[category.id]?.enabled ?? true,
            severity: shownSettings[category.id]?.severity ?? category.defaultSeverity,
            critical: shownSettings[category.id]?.critical ?? false,
          })),
        },
      }),
    onSuccess: (result) => {
      toast.success("Category coverage saved. This does not write operational logs.");
      invalidateHub();
      cacheSnapshot(result);
      setSettingsDraft(null);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const coverageMutation = useMutation({
    mutationFn: () =>
      saveCoverage({
        data: {
          restaurantId,
          rows: snapshot.sensitivePermissions.map((permission) => ({
            permissionId: permission.id,
            coverage: shownCoverage[permission.id]?.coverage ?? "required",
            notes: shownCoverage[permission.id]?.notes ?? "",
          })),
        },
      }),
    onSuccess: (result) => {
      toast.success("Sensitive coverage saved. Enforcement is not invented.");
      invalidateHub();
      cacheSnapshot(result);
      setCoverageDraft(null);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const shownReadiness = validated ?? readiness;
  const requiredCodes = new Set<string>(CARD7_REQUIRED_AUDIT_CATEGORY_CODES);

  return (
    <PmsPropertySetupCard7Workspace
      validate={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = evaluateCard7AuditReadiness(snapshot);
            setValidated(next);
            if (next.ready) toast.success("Audit domain is ready. Card 7 is not complete.");
            else toast.error(next.blockers[0] ?? "Audit is not ready.");
          }}
        >
          Validate
        </Button>
      }
      search={
        <p className="text-sm text-muted-foreground">
          {CARD7_AUDIT_NO_PURGE_COPY} {CARD7_AUDIT_NO_ENFORCEMENT_COPY}
        </p>
      }
      drawer={
        inner === "events" && selectedEvent ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="pms-card7-audit-event-drawer">
            <h3 className="font-medium text-[#251605]">Event detail</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Source</dt>
                <dd>{selectedEvent.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Action</dt>
                <dd>{selectedEvent.action}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Actor</dt>
                <dd>{selectedEvent.actorName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">When</dt>
                <dd>{selectedEvent.createdAt || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Severity (derived)</dt>
                <dd>{selectedEvent.severity ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Before</dt>
                <dd>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{jsonPreview(selectedEvent.previousValues)}</pre>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">After</dt>
                <dd>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{jsonPreview(selectedEvent.newValues)}</pre>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Reason / notes</dt>
                <dd>{selectedEvent.notes || "Not stored on this source."}</dd>
              </div>
            </dl>
            {selectedEvent.limitations.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {selectedEvent.limitations.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : undefined
      }
      status={
        <div>
          <p className="text-sm text-[#251605]">
            Audit: {propertySetupStatusLabel(shownReadiness.status)}
          </p>
          {shownReadiness.blockers[0] ? (
            <p className="text-xs text-destructive">{shownReadiness.blockers[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{shownReadiness.warnings[0]}</p>
          )}
        </div>
      }
      actions={<p className="text-xs text-muted-foreground">Save policy · Save coverage · Validate</p>}
    >
      <Tabs value={inner} onValueChange={(value) => setInner(value as (typeof INNER_TABS)[number]["id"])}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          {INNER_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-testid={`card7-audit-${tab.id}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="policy" className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="card7-audit-enabled">Audit policy enabled</Label>
            <Switch
              id="card7-audit-enabled"
              checked={shownPolicy.enabled}
              disabled={!editor}
              onCheckedChange={(checked) => setPolicy({ ...shownPolicy, enabled: checked })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="card7-audit-retention">Retention days</Label>
            <Input
              id="card7-audit-retention"
              type="number"
              min={1}
              max={3650}
              value={shownPolicy.retentionDays ?? ""}
              disabled={!editor}
              onChange={(event) =>
                setPolicy({
                  ...shownPolicy,
                  retentionDays: event.target.value.trim() ? Number(event.target.value) : null,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="card7-audit-mask">Mask identification numbers</Label>
            <Switch
              id="card7-audit-mask"
              checked={shownPolicy.maskIdNumbers}
              disabled={!editor}
              onCheckedChange={(checked) => setPolicy({ ...shownPolicy, maskIdNumbers: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="card7-audit-export">Restrict guest data export</Label>
            <Switch
              id="card7-audit-export"
              checked={shownPolicy.restrictGuestExport}
              disabled={!editor}
              onCheckedChange={(checked) =>
                setPolicy({ ...shownPolicy, restrictGuestExport: checked })
              }
            />
          </div>
          {editor ? (
            <Button type="button" onClick={() => policyMutation.mutate()} disabled={policyMutation.isPending}>
              {policyMutation.isPending ? "Saving…" : "Save audit policy"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="categories" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Required categories ({CARD7_REQUIRED_AUDIT_CATEGORY_CODES.join(", ")}) must stay enabled. Critical is
            configuration, not an alert engine.
          </p>
          {snapshot.categories.map((category) => {
            const setting = shownSettings[category.id];
            return (
              <div key={category.id} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-4">
                <div className="sm:col-span-4">
                  <p className="font-medium text-[#251605]">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {category.code}
                    {requiredCodes.has(category.code) ? " · required" : ""} · default{" "}
                    {resolvedCategorySeverity(category, setting ?? null)}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Enabled</Label>
                  <Switch
                    checked={setting?.enabled !== false}
                    disabled={!editor}
                    onCheckedChange={(checked) =>
                      setSettingsDraft({
                        ...shownSettings,
                        [category.id]: { ...setting!, enabled: checked, categoryId: category.id },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Critical</Label>
                  <Switch
                    checked={setting?.critical === true}
                    disabled={!editor}
                    onCheckedChange={(checked) =>
                      setSettingsDraft({
                        ...shownSettings,
                        [category.id]: { ...setting!, critical: checked, categoryId: category.id },
                      })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Severity override</Label>
                  <Select
                    value={setting?.severity ?? category.defaultSeverity}
                    onValueChange={(value) =>
                      setSettingsDraft({
                        ...shownSettings,
                        [category.id]: {
                          ...setting!,
                          severity: value as Card7AuditSeverity,
                          categoryId: category.id,
                        },
                      })
                    }
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD7_AUDIT_SEVERITIES.map((row) => (
                        <SelectItem key={row} value={row}>
                          {row}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
          {editor ? (
            <Button type="button" onClick={() => categoryMutation.mutate()} disabled={categoryMutation.isPending}>
              {categoryMutation.isPending ? "Saving…" : "Save event coverage"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="coverage" className="space-y-3">
          {snapshot.sensitivePermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sensitive permissions in the 0085 catalogue.</p>
          ) : (
            snapshot.sensitivePermissions.map((permission) => {
              const row = shownCoverage[permission.id];
              return (
                <div key={permission.id} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
                  <div>
                    <p className="font-medium text-[#251605]">{permission.name}</p>
                    <p className="text-xs text-muted-foreground">{permission.code}</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Coverage</Label>
                    <Select
                      value={row?.coverage ?? "required"}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setCoverageDraft({
                          ...shownCoverage,
                          [permission.id]: {
                            ...row!,
                            coverage: value as Card7AuditCoverageValue,
                            permissionId: permission.id,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CARD7_AUDIT_COVERAGE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={row?.notes ?? ""}
                      disabled={!editor}
                      onChange={(event) =>
                        setCoverageDraft({
                          ...shownCoverage,
                          [permission.id]: {
                            ...row!,
                            notes: event.target.value,
                            permissionId: permission.id,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
          {editor ? (
            <Button type="button" onClick={() => coverageMutation.mutate()} disabled={coverageMutation.isPending}>
              {coverageMutation.isPending ? "Saving…" : "Save sensitive coverage"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="events" className="space-y-3">
          {!canViewEvents ? (
            <p className="text-sm text-muted-foreground">{CARD7_AUDIT_VIEWER_GATE_COPY}</p>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {CARD7_AUDIT_VIEWER_LIMITATIONS.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={eventFrom} onChange={(event) => setEventFrom(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={eventTo} onChange={(event) => setEventTo(event.target.value)} />
                </div>
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label>Search</Label>
                  <Input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} />
                </div>
                <div className="w-40 space-y-1">
                  <Label>Source</Label>
                  <Select value={eventSource} onValueChange={(value) => setEventSource(value as typeof eventSource)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {CARD7_AUDIT_EVENT_SOURCES.map((row) => (
                        <SelectItem key={row} value={row}>
                          {row}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40 space-y-1">
                  <Label>Category</Label>
                  <Select value={eventCategory} onValueChange={setEventCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {snapshot.categories.map((row) => (
                        <SelectItem key={row.id} value={row.code}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36 space-y-1">
                  <Label>Action</Label>
                  <Input value={eventAction} onChange={(event) => setEventAction(event.target.value)} />
                </div>
                <div className="w-40 space-y-1">
                  <Label>User id</Label>
                  <Input
                    value={eventUser}
                    onChange={(event) => setEventUser(event.target.value)}
                    placeholder="Auth user UUID"
                  />
                </div>
                <div className="w-40 space-y-1">
                  <Label>Severity</Label>
                  <Select
                    value={eventSeverity}
                    onValueChange={(value) => setEventSeverity(value as typeof eventSeverity)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {CARD7_AUDIT_SEVERITIES.map((row) => (
                        <SelectItem key={row} value={row}>
                          {row}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-44 space-y-1">
                  <Label>Department</Label>
                  <Select disabled value="unsupported">
                    <SelectTrigger>
                      <SelectValue placeholder="Not on events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unsupported">Not stored on events</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full text-left text-sm" data-testid="pms-card7-audit-events">
                  <thead className="border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsQuery.isLoading ? (
                      <tr>
                        <td className="px-3 py-4" colSpan={5}>
                          Loading events…
                        </td>
                      </tr>
                    ) : events.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4" colSpan={5}>
                          No federated rows for these filters. Login events and unused folio writers will not appear.
                        </td>
                      </tr>
                    ) : (
                      events.map((row) => (
                        <tr
                          key={row.id}
                          className={selectedEvent?.id === row.id ? "bg-[#C89933]/10" : "cursor-pointer hover:bg-muted/50"}
                          onClick={() => setSelectedEventId(row.id)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">{row.createdAt.slice(0, 19).replace("T", " ")}</td>
                          <td className="px-3 py-2">{row.source}</td>
                          <td className="px-3 py-2">{row.action}</td>
                          <td className="px-3 py-2">{row.actorName}</td>
                          <td className="px-3 py-2">{row.categoryCode ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </PmsPropertySetupCard7Workspace>
  );
}
