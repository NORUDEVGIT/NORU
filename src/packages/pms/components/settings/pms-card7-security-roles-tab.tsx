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
import { ROLE_LABELS, isStaffRole } from "@/core/lib/module-access";
import { PmsPropertySetupCard7Workspace } from "@/packages/pms/components/settings/pms-property-setup-card7-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  getCard7SecurityRoles,
  saveCard7ApprovalRule,
  saveCard7HotelRole,
  saveCard7MembershipHotelRole,
  saveCard7RolePermissions,
} from "@/packages/pms/lib/security-roles-card7.functions";
import {
  CARD7_DATA_SCOPE_LABELS,
  CARD7_DATA_SCOPES,
  CARD7_EMPTY_CATALOGUE_COPY,
  CARD7_LIVE_AUTHZ_COPY,
  CARD7_THRESHOLD_UNITS,
  emptyApprovalRuleDraft,
  emptyHotelRoleDraft,
  emptySecuritySnapshot,
  evaluateCard7SecurityReadiness,
  groupPermissionsByModule,
  mappingFor,
  type Card7ApprovalRule,
  type Card7DataScope,
  type Card7HotelRole,
  type Card7SecurityReadiness,
  type Card7SecuritySnapshot,
  type Card7ThresholdUnit,
} from "@/packages/pms/lib/security-roles-card7.server";

const DRAWER_TABS = [
  { id: "basic", label: "Role" },
  { id: "permissions", label: "Permissions" },
] as const;

function noneToNull(value: string): string | null {
  return value === "none" || value === "" ? null : value;
}

function staffRoleLabel(role: string): string {
  return isStaffRole(role) ? ROLE_LABELS[role] : role;
}

export function Card7SecurityRolesTab({
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
  const load = useServerFn(getCard7SecurityRoles);
  const saveRole = useServerFn(saveCard7HotelRole);
  const saveMappings = useServerFn(saveCard7RolePermissions);
  const saveApproval = useServerFn(saveCard7ApprovalRule);
  const saveAssignment = useServerFn(saveCard7MembershipHotelRole);
  const query = useQuery({
    queryKey: ["pms-card7-security-roles", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: Card7SecuritySnapshot = query.data?.snapshot ?? emptySecuritySnapshot();
  const readiness: Card7SecurityReadiness =
    query.data?.readiness ?? evaluateCard7SecurityReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [departmentFilter, setDepartmentFilter] = useState<"all" | "none" | string>("all");
  const [draft, setDraft] = useState<Card7HotelRole | null>(null);
  const [drawerTab, setDrawerTab] = useState<(typeof DRAWER_TABS)[number]["id"]>("basic");
  const [draftMappings, setDraftMappings] = useState<
    Record<string, { allowed: boolean; dataScope: Card7DataScope }>
  >({});
  const [approvalDraft, setApprovalDraft] = useState<Card7ApprovalRule>(emptyApprovalRuleDraft());
  const [validated, setValidated] = useState<Card7SecurityReadiness | null>(null);

  const groups = useMemo(
    () => groupPermissionsByModule(snapshot.permissions),
    [snapshot.permissions],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.roles.filter((row) => {
      if (statusFilter === "active" && !row.active) return false;
      if (statusFilter === "inactive" && row.active) return false;
      if (departmentFilter === "none" && row.departmentId) return false;
      if (
        departmentFilter !== "all" &&
        departmentFilter !== "none" &&
        row.departmentId !== departmentFilter
      ) {
        return false;
      }
      if (!q) return true;
      const dept =
        snapshot.departments.find((item) => item.id === row.departmentId)?.name ?? "";
      return `${row.name} ${row.code} ${dept}`.toLowerCase().includes(q);
    });
  }, [snapshot.roles, snapshot.departments, search, statusFilter, departmentFilter]);

  function cacheSnapshot(next: {
    snapshot: Card7SecuritySnapshot;
    readiness: Card7SecurityReadiness;
  }) {
    queryClient.setQueryData(["pms-card7-security-roles", restaurantId], {
      snapshot: next.snapshot,
      readiness: next.readiness,
      canEdit: editor,
      role: query.data?.role,
    });
  }

  const roleMutation = useMutation({
    mutationFn: (input: Card7HotelRole) =>
      saveRole({
        data: {
          restaurantId,
          ...(input.id ? { id: input.id } : {}),
          code: input.code,
          name: input.name,
          description: input.description,
          departmentId: input.departmentId,
          active: input.active,
        },
      }),
    onSuccess: (result) => {
      toast.success("Hotel role saved. Live access still uses the staff role.");
      invalidateHub();
      cacheSnapshot(result);
      const saved =
        result.snapshot.roles.find((row) => row.code === draft?.code && row.name === draft?.name) ??
        result.snapshot.roles.find((row) => row.id === draft?.id) ??
        null;
      setDraft(saved);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mappingMutation = useMutation({
    mutationFn: () =>
      saveMappings({
        data: {
          restaurantId,
          roleId: draft?.id ?? "",
          mappings: snapshot.permissions.map((permission) => ({
            permissionId: permission.id,
            allowed: draftMappings[permission.id]?.allowed ?? false,
            dataScope: draftMappings[permission.id]?.dataScope ?? "property",
          })),
        },
      }),
    onSuccess: (result) => {
      toast.success("Role permissions saved. They are not live authorization yet.");
      invalidateHub();
      cacheSnapshot(result);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approvalMutation = useMutation({
    mutationFn: (input: Card7ApprovalRule) =>
      saveApproval({
        data: {
          restaurantId,
          ...(input.id ? { id: input.id } : {}),
          permissionId: input.permissionId,
          approverRoleId: input.approverRoleId,
          thresholdAmount: input.thresholdAmount,
          thresholdUnit: input.thresholdUnit,
          active: input.active,
        },
      }),
    onSuccess: (result) => {
      toast.success("Approval rule saved. No approval inbox is created.");
      invalidateHub();
      cacheSnapshot(result);
      setApprovalDraft(emptyApprovalRuleDraft());
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignmentMutation = useMutation({
    mutationFn: (input: { membershipId: string; hotelRoleId: string | null }) =>
      saveAssignment({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      toast.success("Hotel role assigned. Staff role was not changed.");
      invalidateHub();
      cacheSnapshot(result);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate() {
    setDraft(emptyHotelRoleDraft());
    setDraftMappings({});
    setDrawerTab("basic");
  }

  function openEdit(row: Card7HotelRole) {
    setDraft({ ...row });
    const next: Record<string, { allowed: boolean; dataScope: Card7DataScope }> = {};
    for (const permission of snapshot.permissions) {
      const mapping = mappingFor(snapshot, row.id, permission.id);
      next[permission.id] = {
        allowed: mapping?.allowed === true,
        dataScope: mapping?.dataScope ?? "property",
      };
    }
    setDraftMappings(next);
    setDrawerTab("basic");
  }

  function patchMapping(permissionId: string, patch: Partial<{ allowed: boolean; dataScope: Card7DataScope }>) {
    setDraftMappings((prev) => ({
      ...prev,
      [permissionId]: {
        allowed: patch.allowed ?? prev[permissionId]?.allowed ?? false,
        dataScope: patch.dataScope ?? prev[permissionId]?.dataScope ?? "property",
      },
    }));
  }

  const shownReadiness = validated ?? readiness;
  const departmentName = (id: string | null) =>
    snapshot.departments.find((row) => row.id === id)?.name ?? "—";

  return (
    <PmsPropertySetupCard7Workspace
      validate={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = evaluateCard7SecurityReadiness(snapshot);
            setValidated(next);
            if (next.ready) toast.success("Security & Roles is ready. Card 7 is not complete.");
            else toast.error(next.blockers[0] ?? "Security & Roles is not ready.");
          }}
        >
          Validate
        </Button>
      }
      search={
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="card7-role-search">Search</Label>
            <Input
              id="card7-role-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, code or department"
            />
          </div>
          <div className="w-36 space-y-1">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-48 space-y-1">
            <Label>Department</Label>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                <SelectItem value="none">No department</SelectItem>
                {snapshot.departments.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editor ? (
            <Button type="button" onClick={openCreate}>
              Add Role
            </Button>
          ) : null}
        </div>
      }
      drawer={
        draft ? (
          <div className="rounded-2xl border bg-card p-4" data-testid="pms-card7-role-drawer">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="font-medium text-[#251605]">
                {draft.id ? "Edit Role" : "Add Role"}
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Close
              </Button>
            </div>
            <Tabs
              value={drawerTab}
              onValueChange={(value) => setDrawerTab(value as (typeof DRAWER_TABS)[number]["id"])}
            >
              <TabsList className="mb-3">
                {DRAWER_TABS.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="basic" className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="card7-role-name">Name</Label>
                  <Input
                    id="card7-role-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="card7-role-code">Code</Label>
                  <Input
                    id="card7-role-code"
                    value={draft.code}
                    onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
                    disabled={!editor}
                  />
                  <p className="text-xs text-muted-foreground">
  Use 2–20 uppercase letters, numbers, or underscores, starting with a letter.
  Example: FRONT_OFFICE_MANAGER.
</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="card7-role-description">Description</Label>
                  <Textarea
                    id="card7-role-description"
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    disabled={!editor}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Department</Label>
                  <Select
                    value={draft.departmentId ?? "none"}
                    onValueChange={(value) => setDraft({ ...draft, departmentId: noneToNull(value) })}
                    disabled={!editor}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {snapshot.departments.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch
                    checked={draft.active}
                    onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                    disabled={!editor}
                  />
                </div>
                {editor ? (
                  <Button
                    type="button"
                    onClick={() => roleMutation.mutate(draft)}
                    disabled={roleMutation.isPending}
                  >
                    Save role
                  </Button>
                ) : null}
              </TabsContent>
              <TabsContent value="permissions" className="space-y-3">
                {!draft.id ? (
                  <p className="text-sm text-muted-foreground">Save the role before mapping permissions.</p>
                ) : snapshot.permissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="pms-card7-empty-catalogue">
                    {CARD7_EMPTY_CATALOGUE_COPY}
                  </p>
                ) : (
                  <>
                    {groups.map((group) => (
                      <div key={group.module} className="space-y-2">
                        <h3 className="text-sm font-medium capitalize text-[#251605]">
                          {group.module.replaceAll("_", " ")}
                        </h3>
                        {group.functions.map((fn) => (
                          <div key={`${group.module}.${fn.functionKey}`} className="rounded-xl border p-3">
                            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                              {fn.functionKey.replaceAll("_", " ")}
                            </p>
                            <div className="space-y-2">
                              {fn.permissions.map((permission) => {
                                const state = draftMappings[permission.id] ?? {
                                  allowed: false,
                                  dataScope: "property" as const,
                                };
                                return (
                                  <div
                                    key={permission.id}
                                    className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-center"
                                  >
                                    <label className="flex items-center justify-between gap-2 text-sm">
                                      <span>
                                        {permission.name}
                                        {permission.sensitive ? (
                                          <span className="ml-1 text-xs text-[#C89933]">sensitive</span>
                                        ) : null}
                                      </span>
                                      <Switch
                                        checked={state.allowed}
                                        onCheckedChange={(checked) =>
                                          patchMapping(permission.id, { allowed: checked })
                                        }
                                        disabled={!editor || !permission.active}
                                      />
                                    </label>
                                    <Select
                                      value={state.dataScope}
                                      onValueChange={(value) =>
                                        patchMapping(permission.id, {
                                          dataScope: value as Card7DataScope,
                                        })
                                      }
                                      disabled={!editor || !state.allowed}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {CARD7_DATA_SCOPES.map((scope) => (
                                          <SelectItem key={scope} value={scope}>
                                            {CARD7_DATA_SCOPE_LABELS[scope]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {editor ? (
                      <Button
                        type="button"
                        onClick={() => mappingMutation.mutate()}
                        disabled={mappingMutation.isPending}
                      >
                        Save permissions
                      </Button>
                    ) : null}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null
      }
      status={
        <div className="space-y-1 text-sm">
          <p>
            Security & Roles: {propertySetupStatusLabel(shownReadiness.status)}
            {shownReadiness.ready ? " · domain ready" : ""}
          </p>
          {shownReadiness.blockers[0] ? (
            <p className="text-destructive">{shownReadiness.blockers[0]}</p>
          ) : (
            <p className="text-muted-foreground">{CARD7_LIVE_AUTHZ_COPY}</p>
          )}
        </div>
      }
      actions={
        <p className="text-xs text-muted-foreground">Deactivate roles instead of deleting them.</p>
      }
    >
      <div className="space-y-6">
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[40rem] text-sm" data-testid="pms-card7-role-table">
            <thead className="border-b bg-[#F7F4EE] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Allowed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    No hotel roles yet. Custom roles are supported.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const allowed = snapshot.mappings.filter(
                    (item) => item.roleId === row.id && item.allowed,
                  ).length;
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium text-[#251605] underline-offset-2 hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="px-4 py-3">{row.code}</td>
                      <td className="px-4 py-3">{departmentName(row.departmentId)}</td>
                      <td className="px-4 py-3">{row.active ? "Active" : "Inactive"}</td>
                      <td className="px-4 py-3">{allowed}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <section className="rounded-2xl border bg-card p-4" data-testid="pms-card7-assignment-panel">
          <h2 className="font-medium text-[#251605]">Staff hotel role</h2>
          <p className="mt-1 text-sm text-muted-foreground">{CARD7_LIVE_AUTHZ_COPY}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Staff role</th>
                  <th className="py-2 pr-3">Hotel role</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.memberships.map((row) => (
                  <tr key={row.membershipId} className="border-t">
                    <td className="py-2 pr-3">{row.name}</td>
                    <td className="py-2 pr-3">{staffRoleLabel(row.staffRole)}</td>
                    <td className="py-2 pr-3">
                      <Select
                        value={row.hotelRoleId ?? "none"}
                        onValueChange={(value) =>
                          assignmentMutation.mutate({
                            membershipId: row.membershipId,
                            hotelRoleId: noneToNull(value),
                          })
                        }
                        disabled={!editor || assignmentMutation.isPending || !row.active}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {snapshot.roles
                            .filter((role) => role.active || role.id === row.hotelRoleId)
                            .map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4" data-testid="pms-card7-approval-panel">
          <h2 className="font-medium text-[#251605]">Approval rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Setup configuration only. There is no approval inbox or workflow engine.
          </p>
          {snapshot.permissions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{CARD7_EMPTY_CATALOGUE_COPY}</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Permission</Label>
                <Select
                  value={approvalDraft.permissionId || "none"}
                  onValueChange={(value) =>
                    setApprovalDraft({ ...approvalDraft, permissionId: noneToNull(value) ?? "" })
                  }
                  disabled={!editor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {snapshot.permissions
                      .filter((row) => row.active)
                      .map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Approver role</Label>
                <Select
                  value={approvalDraft.approverRoleId || "none"}
                  onValueChange={(value) =>
                    setApprovalDraft({ ...approvalDraft, approverRoleId: noneToNull(value) ?? "" })
                  }
                  disabled={!editor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select</SelectItem>
                    {snapshot.roles
                      .filter((row) => row.active)
                      .map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Threshold</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={approvalDraft.thresholdAmount ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setApprovalDraft({
                      ...approvalDraft,
                      thresholdAmount: raw === "" ? null : Number(raw),
                    });
                  }}
                  disabled={!editor}
                />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Select
                  value={approvalDraft.thresholdUnit ?? "none"}
                  onValueChange={(value) =>
                    setApprovalDraft({
                      ...approvalDraft,
                      thresholdUnit: noneToNull(value) as Card7ThresholdUnit | null,
                    })
                  }
                  disabled={!editor}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {CARD7_THRESHOLD_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <Label>Active</Label>
                <Switch
                  checked={approvalDraft.active}
                  onCheckedChange={(checked) =>
                    setApprovalDraft({ ...approvalDraft, active: checked })
                  }
                  disabled={!editor}
                />
              </div>
              {editor ? (
                <Button
                  type="button"
                  onClick={() => approvalMutation.mutate(approvalDraft)}
                  disabled={
                    approvalMutation.isPending ||
                    !approvalDraft.permissionId ||
                    !approvalDraft.approverRoleId
                  }
                >
                  Save rule
                </Button>
              ) : null}
            </div>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            {snapshot.approvalRules.map((row) => {
              const permission = snapshot.permissions.find((item) => item.id === row.permissionId);
              const role = snapshot.roles.find((item) => item.id === row.approverRoleId);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span>
                    {permission?.code ?? "Unknown permission"} → {role?.name ?? "Unknown role"}
                    {row.thresholdAmount != null
                      ? ` · ${row.thresholdAmount} ${row.thresholdUnit ?? ""}`
                      : ""}
                    {row.active ? "" : " · inactive"}
                  </span>
                  {editor ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setApprovalDraft(row)}
                    >
                      Edit
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PmsPropertySetupCard7Workspace>
  );
}
