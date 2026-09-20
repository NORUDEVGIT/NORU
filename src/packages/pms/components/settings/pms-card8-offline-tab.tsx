import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { PmsPropertySetupCard8Workspace } from "@/packages/pms/components/settings/pms-property-setup-card8-workspace";
import {
  getCard8OfflinePolicy,
  saveCard8OfflinePolicy,
} from "@/packages/pms/lib/pms-property-setup-card8-offline.functions";
import {
  CARD8_CONFLICT_POLICIES,
  CARD8_CONFLICT_POLICY_LABELS,
  CARD8_FAILED_EVENT_LABELS,
  CARD8_FAILED_EVENT_POLICIES,
  CARD8_FINANCIAL_OFFLINE,
  CARD8_FINANCIAL_OFFLINE_LABELS,
  CARD8_OFFLINE_CAPABILITY_CODES,
  CARD8_OFFLINE_CAPABILITY_LABELS,
  CARD8_OFFLINE_NEVER_GATEWAY,
  CARD8_OFFLINE_POLICY_ONLY_COPY,
  CARD8_OFFLINE_RUNTIME_ABSENT,
  CARD8_OFFLINE_SET6_LEGACY,
  CARD8_POLICY_STATE_LABELS,
  CARD8_POLICY_STATES,
  CARD8_SYNC_MODE_LABELS,
  CARD8_SYNC_MODES,
  CARD8_SYNC_PRIORITIES,
  emptyCard8OfflineSnapshot,
  evaluateCard8OfflineReadiness,
  type Card8ConflictPolicy,
  type Card8FailedEventPolicy,
  type Card8FinancialOffline,
  type Card8OfflineCapabilityRow,
  type Card8OfflinePolicyRow,
  type Card8OfflineSnapshot,
  type Card8PolicyState,
  type Card8SyncMode,
  type Card8SyncPriority,
} from "@/packages/pms/lib/pms-property-setup-card8-offline";

const INNER_TABS = [
  { id: "overview", label: "Overview / Policy" },
  { id: "capabilities", label: "Offline Capabilities" },
  { id: "sync", label: "Sync Settings" },
  { id: "conflict", label: "Conflict & Retry" },
  { id: "financial", label: "Financial Safety" },
] as const;

function intValue(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function Card8OfflineTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard8OfflinePolicy);
  const save = useServerFn(saveCard8OfflinePolicy);
  const query = useQuery({
    queryKey: ["pms-card8-offline", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot = query.data?.snapshot ?? emptyCard8OfflineSnapshot();
  const [policy, setPolicy] = useState<Card8OfflinePolicyRow>(snapshot.policy);
  const [capabilities, setCapabilities] = useState<Card8OfflineCapabilityRow[]>(
    snapshot.capabilities,
  );
  const [inner, setInner] = useState<(typeof INNER_TABS)[number]["id"]>("overview");

  useEffect(() => {
    if (!query.data?.snapshot) return;
    setPolicy(query.data.snapshot.policy);
    setCapabilities(query.data.snapshot.capabilities);
  }, [query.data]);

  const draft: Card8OfflineSnapshot = { ...snapshot, policy, capabilities };
  const readiness = evaluateCard8OfflineReadiness(draft);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          offlineModeEnabled: policy.offlineModeEnabled,
          cachePreviousDays: policy.cachePreviousDays,
          cacheFutureDays: policy.cacheFutureDays,
          syncMode: policy.syncMode,
          syncIntervalMinutes: policy.syncIntervalMinutes,
          retryIntervalMinutes: policy.retryIntervalMinutes,
          maximumRetryAttempts: policy.maximumRetryAttempts,
          conflictPolicy: policy.conflictPolicy,
          failedEventPolicy: policy.failedEventPolicy,
          financialOfflinePolicy: policy.financialOfflinePolicy,
          capabilities: capabilities.map((row) => ({
            capabilityKey: row.capabilityKey,
            policyState: row.policyState,
            syncPriority: row.syncPriority,
            active: row.active,
          })),
        },
      }),
    onSuccess: (result) => {
      toast.success("Offline & Sync policy saved.");
      setPolicy(result.snapshot.policy);
      setCapabilities(result.snapshot.capabilities);
      void queryClient.invalidateQueries({ queryKey: ["pms-card8-offline", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card8-readiness", restaurantId] });
      void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateCapability(code: string, patch: Partial<Card8OfflineCapabilityRow>) {
    setCapabilities((rows) =>
      rows.map((row) => (row.capabilityKey === code ? { ...row, ...patch } : row)),
    );
  }

  return (
    <PmsPropertySetupCard8Workspace
      lifecycle={
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Property lifecycle
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Setup · Offline & Sync policy only</p>
        </>
      }
      summary={
        <>
          <h3 className="font-display text-lg text-[#251605]">Status summary</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Offline & Sync {readiness.verdict}. Runtime unavailable. No sync-health metrics.
          </p>
          {readiness.blockers.map((item) => (
            <p key={item} className="mt-1 text-sm text-destructive">
              {item}
            </p>
          ))}
        </>
      }
      status={
        <p className="text-sm text-muted-foreground" data-testid="pms-card8-offline-status">
          Offline & Sync: {readiness.verdict}
        </p>
      }
      actions={
        <div className="space-y-2">
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            disabled={!canEdit || mutation.isPending || !snapshot.available}
            onClick={() => mutation.mutate()}
            data-testid="pms-card8-offline-sync-action"
          >
            {mutation.isPending ? "Saving…" : "Save Draft"}
          </Button>
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">
              Owner or manager access is required to save policy.
            </p>
          ) : !snapshot.available ? (
            <p className="text-xs text-muted-foreground">
              Save is unavailable because the policy schema is unavailable.
            </p>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4" data-testid="pms-card8-offline-policy">
        <div
          className="rounded-2xl border border-[#C89933] bg-[#C89933]/10 p-4"
          data-testid="pms-card8-runtime-banner"
        >
          <p className="text-sm font-medium text-[#251605]">{CARD8_OFFLINE_POLICY_ONLY_COPY}</p>
          <p className="mt-1 text-sm text-muted-foreground">{CARD8_OFFLINE_RUNTIME_ABSENT}</p>
        </div>

        {!snapshot.available ? (
          <p className="text-sm text-muted-foreground">
            {query.error?.message ?? "Offline policy is unavailable."}
          </p>
        ) : (
          <Tabs value={inner} onValueChange={(value) => setInner(value as typeof inner)}>
            <TabsList className="mb-3 flex h-auto w-full min-w-0 flex-wrap justify-start overflow-x-auto">
              {INNER_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  data-testid={`card8-offline-inner-${tab.id}`}
                  className="focus-visible:ring-2 focus-visible:ring-[#C89933]"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <section className="rounded-2xl border bg-card p-5">
                <h3 className="font-display text-lg text-[#251605]">Offline policy</h3>
                <p className="mt-1 text-sm text-muted-foreground">{CARD8_OFFLINE_SET6_LEGACY}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Label htmlFor="card8-offline-mode">Offline mode enabled</Label>
                  <Switch
                    id="card8-offline-mode"
                    checked={policy.offlineModeEnabled}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      setPolicy((prev) => ({ ...prev, offlineModeEnabled: checked }))
                    }
                  />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="card8-cache-previous">Previous cache days</Label>
                    <Input
                      id="card8-cache-previous"
                      type="number"
                      min={0}
                      max={365}
                      disabled={!canEdit}
                      value={policy.cachePreviousDays}
                      onChange={(event) =>
                        setPolicy((prev) => ({
                          ...prev,
                          cachePreviousDays: intValue(event.target.value, prev.cachePreviousDays),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card8-cache-future">Future cache days</Label>
                    <Input
                      id="card8-cache-future"
                      type="number"
                      min={0}
                      max={365}
                      disabled={!canEdit}
                      value={policy.cacheFutureDays}
                      onChange={(event) =>
                        setPolicy((prev) => ({
                          ...prev,
                          cacheFutureDays: intValue(event.target.value, prev.cacheFutureDays),
                        }))
                      }
                    />
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="capabilities" className="space-y-3">
              {CARD8_OFFLINE_CAPABILITY_CODES.map((code) => {
                const row = capabilities.find((item) => item.capabilityKey === code);
                if (!row) return null;
                return (
                  <section key={code} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-base text-[#251605]">
                          {CARD8_OFFLINE_CAPABILITY_LABELS[code]}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {row.controlledFinancial
                            ? "Controlled financial capability"
                            : "Operational capability"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">Runtime unavailable</p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Policy state</Label>
                        <Select
                          value={row.policyState}
                          disabled={!canEdit}
                          onValueChange={(value) =>
                            updateCapability(code, { policyState: value as Card8PolicyState })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CARD8_POLICY_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {CARD8_POLICY_STATE_LABELS[state]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Sync priority</Label>
                        <Select
                          value={String(row.syncPriority)}
                          disabled={!canEdit}
                          onValueChange={(value) =>
                            updateCapability(code, {
                              syncPriority: Number(value) as Card8SyncPriority,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CARD8_SYNC_PRIORITIES.map((priority) => (
                              <SelectItem key={priority} value={String(priority)}>
                                {priority}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>
                );
              })}
            </TabsContent>

            <TabsContent value="sync" className="space-y-4">
              <section className="rounded-2xl border bg-card p-5 space-y-4">
                <h3 className="font-display text-lg text-[#251605]">Sync preference</h3>
                <div className="space-y-2">
                  <Label>Sync mode</Label>
                  <Select
                    value={policy.syncMode}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      setPolicy((prev) => ({ ...prev, syncMode: value as Card8SyncMode }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD8_SYNC_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {CARD8_SYNC_MODE_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card8-sync-interval">Sync interval (minutes)</Label>
                  <Input
                    id="card8-sync-interval"
                    type="number"
                    min={1}
                    max={10080}
                    disabled={!canEdit}
                    value={policy.syncIntervalMinutes}
                    onChange={(event) =>
                      setPolicy((prev) => ({
                        ...prev,
                        syncIntervalMinutes: intValue(event.target.value, prev.syncIntervalMinutes),
                      }))
                    }
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="conflict" className="space-y-4">
              <section className="rounded-2xl border bg-card p-5 space-y-4">
                <h3 className="font-display text-lg text-[#251605]">Conflict and retry policy</h3>
                <div className="space-y-2">
                  <Label>Conflict policy</Label>
                  <Select
                    value={policy.conflictPolicy}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      setPolicy((prev) => ({
                        ...prev,
                        conflictPolicy: value as Card8ConflictPolicy,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD8_CONFLICT_POLICIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {CARD8_CONFLICT_POLICY_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Failed-event policy</Label>
                  <Select
                    value={policy.failedEventPolicy}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      setPolicy((prev) => ({
                        ...prev,
                        failedEventPolicy: value as Card8FailedEventPolicy,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD8_FAILED_EVENT_POLICIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {CARD8_FAILED_EVENT_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="card8-retry-interval">Retry interval (minutes)</Label>
                    <Input
                      id="card8-retry-interval"
                      type="number"
                      min={1}
                      max={1440}
                      disabled={!canEdit}
                      value={policy.retryIntervalMinutes}
                      onChange={(event) =>
                        setPolicy((prev) => ({
                          ...prev,
                          retryIntervalMinutes: intValue(
                            event.target.value,
                            prev.retryIntervalMinutes,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card8-retry-max">Maximum retry attempts</Label>
                    <Input
                      id="card8-retry-max"
                      type="number"
                      min={0}
                      max={20}
                      disabled={!canEdit}
                      value={policy.maximumRetryAttempts}
                      onChange={(event) =>
                        setPolicy((prev) => ({
                          ...prev,
                          maximumRetryAttempts: intValue(
                            event.target.value,
                            prev.maximumRetryAttempts,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="financial">
              <section className="rounded-2xl border bg-card p-5 space-y-4">
                <h3 className="font-display text-lg text-[#251605]">
                  Controlled financial offline
                </h3>
                <p className="text-sm text-muted-foreground">{CARD8_OFFLINE_NEVER_GATEWAY}</p>
                <div className="space-y-2">
                  <Label>Financial offline policy</Label>
                  <Select
                    value={policy.financialOfflinePolicy}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      setPolicy((prev) => ({
                        ...prev,
                        financialOfflinePolicy: value as Card8FinancialOffline,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARD8_FINANCIAL_OFFLINE.map((item) => (
                        <SelectItem key={item} value={item}>
                          {CARD8_FINANCIAL_OFFLINE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PmsPropertySetupCard8Workspace>
  );
}
