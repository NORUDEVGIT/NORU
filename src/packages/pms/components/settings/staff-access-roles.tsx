import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { StaffAccessMatrix } from "@/packages/pms/components/settings/staff-access-matrix";
import { invalidatePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { isPmsPermissionCode, type PmsPermissionCode } from "@/packages/pms/lib/pms-permissions";
import {
  ROLE_DEACTIVATE_WARNING,
  STAFF_ACCESS_TEMPLATES,
  accessCounts,
  auditActionLabel,
  friendlyAccessError,
  roleCodeFromName,
  templatePermissionCodes,
  type StaffAccessTemplateId,
} from "@/packages/pms/lib/staff-access";
import { listPmsAccessAudit, listPmsRoleUsage } from "@/packages/pms/lib/pms-staff.functions";
import {
  getCard7SecurityRoles,
  saveCard7HotelRole,
  saveCard7RolePermissions,
} from "@/packages/pms/lib/security-roles-card7.functions";
import type { Card7HotelRole, Card7SecuritySnapshot } from "@/packages/pms/lib/security-roles-card7.server";

type Actor = { isOwner: boolean; codes: readonly string[] };

export function StaffAccessRoles({
  restaurantId,
  actor,
  canCreate,
  canEdit,
  canActivate,
  canAssignPermissions,
}: {
  restaurantId: string;
  actor: Actor;
  canCreate: boolean;
  canEdit: boolean;
  canActivate: boolean;
  canAssignPermissions: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard7SecurityRoles);
  const saveRole = useServerFn(saveCard7HotelRole);
  const saveMappings = useServerFn(saveCard7RolePermissions);
  const loadUsage = useServerFn(listPmsRoleUsage);
  const loadAudit = useServerFn(listPmsAccessAudit);
  const query = useQuery({
    queryKey: ["pms-card7-security-roles", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const usageQuery = useQuery({
    queryKey: ["pms-role-usage", restaurantId],
    queryFn: () => loadUsage({ data: { restaurantId } }),
  });
  const snapshot = query.data?.snapshot;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Card7HotelRole | "create" | null>(null);
  const [deactivate, setDeactivate] = useState<Card7HotelRole | null>(null);

  const usage = new Map((usageQuery.data?.counts ?? []).map((row) => [row.roleId, row]));
  const allRoles = snapshot?.roles ?? [];
  const roles = allRoles.filter((role) => {
    if (search.trim() && !`${role.name} ${role.description}`.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    if (status === "active" && !role.active) return false;
    if (status === "inactive" && role.active) return false;
    return true;
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card7-security-roles", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-assignable-roles", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-role-usage", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-staff", restaurantId] });
    void invalidatePmsPermissions(queryClient, restaurantId);
  }

  const save = useMutation({
    mutationFn: async (input: {
      role: Card7HotelRole;
      codes: PmsPermissionCode[];
      creating: boolean;
    }) => {
      const taken = (snapshot?.roles ?? []).filter((role) => role.id !== input.role.id).map((role) => role.code);
      const code = input.creating ? roleCodeFromName(input.role.name, taken) : input.role.code;
      const previous = snapshot?.roles.find((role) => role.id === input.role.id);
      const activeChanged = Boolean(previous && previous.active !== input.role.active);
      let roleId = input.creating ? "" : input.role.id;
      if (input.creating || canEdit || activeChanged) {
        const saved = await saveRole({
          data: {
            restaurantId,
            id: input.creating ? undefined : input.role.id,
            code,
            name: input.role.name,
            description: input.role.description,
            departmentId: input.role.departmentId,
            active: input.role.active,
          },
        });
        roleId = input.creating
          ? (saved.snapshot.roles.find((role) => role.code === code)?.id ?? "")
          : input.role.id;
      }
      if (!roleId) throw new Error("The role was saved, but it could not be opened to attach permissions.");
      if (canAssignPermissions && snapshot) {
        if (snapshot.permissions.length === 0) {
          throw new Error("No permission catalogue rows. Product seed is required. This property cannot add custom permission keys.");
        }
        await saveMappings({
          data: {
            restaurantId,
            roleId,
            mappings: mappingPayload(snapshot, roleId, input.codes),
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Role saved.");
      setEditing(null);
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyAccessError(error.message)),
  });

  return (
    <div className="space-y-3" data-testid="roles-permissions-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-[#251605]">Roles & Permissions</h3>
        {canCreate ? (
          <Button type="button" onClick={() => setEditing("create")} data-testid="create-role">
            Create Role
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search roles..."
          aria-label="Search roles"
          className="h-9 max-w-xs border-[#DDD4C5] bg-white"
        />
        <select
          aria-label="Role status"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="h-9 rounded-md border border-[#DDD4C5] bg-white px-2 text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {query.isLoading ? <p className="text-sm text-[#756A5B]">Checking access…</p> : null}
      {query.isError ? <p className="text-sm text-destructive">{friendlyAccessError((query.error as Error).message)}</p> : null}
      {!query.isLoading && allRoles.length === 0 ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 text-sm">
          No roles have been created yet.
          {canCreate ? (
            <Button type="button" className="ml-3" onClick={() => setEditing("create")}>
              Create Role
            </Button>
          ) : null}
        </div>
      ) : null}
      {!query.isLoading && allRoles.length > 0 && roles.length === 0 ? (
        <p className="text-sm text-[#756A5B]">No roles match this search.</p>
      ) : null}
      <div className="grid gap-2">
        {roles.map((role) => {
          const codes = codesForRole(snapshot, role.id);
          const counts = accessCounts(codes);
          const count = usage.get(role.id);
          return (
            <button
              key={role.id}
              type="button"
              className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-3 text-left"
              onClick={() => setEditing(role)}
              data-testid={`role-row-${role.id}`}
            >
              <span className="block font-medium text-[#251605]">{role.name}</span>
              <span className="block text-xs text-[#756A5B]">
                {count?.activeStaff ?? 0} active staff
                {usageQuery.data?.includesDisabled ? ` (${count?.totalStaff ?? 0} including disabled)` : ""} · {counts.modules} modules · {counts.actions} actions · {role.active ? "Active" : "Inactive"}
              </span>
            </button>
          );
        })}
      </div>

      {editing && snapshot ? (
        <RoleEditor
          key={editing === "create" ? "create" : editing.id}
          creating={editing === "create"}
          role={editing === "create" ? null : editing}
          snapshot={snapshot}
          actor={actor}
          canEdit={canEdit || editing === "create"}
          canAssignPermissions={canAssignPermissions}
          canActivate={canActivate}
          pending={save.isPending}
          restaurantId={restaurantId}
          loadAudit={loadAudit}
          onClose={() => setEditing(null)}
          onSave={(role, codes, creating) => save.mutate({ role, codes, creating })}
          onDeactivate={(role) => setDeactivate(role)}
        />
      ) : null}

      <Dialog open={deactivate !== null} onOpenChange={(open) => !open && setDeactivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate role</DialogTitle>
            <DialogDescription>
              This role is assigned to {usage.get(deactivate?.id ?? "")?.activeStaff ?? 0} active staff members. {ROLE_DEACTIVATE_WARNING}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeactivate(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!deactivate) return;
                const role = deactivate;
                setDeactivate(null);
                save.mutate({
                  role: { ...role, active: false },
                  codes: codesForRole(snapshot, role.id),
                  creating: false,
                });
              }}
            >
              Deactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleEditor({
  creating,
  role,
  snapshot,
  actor,
  canEdit,
  canAssignPermissions,
  canActivate,
  pending,
  restaurantId,
  loadAudit,
  onClose,
  onSave,
  onDeactivate,
}: {
  creating: boolean;
  role: Card7HotelRole | null;
  snapshot: Card7SecuritySnapshot;
  actor: Actor;
  canEdit: boolean;
  canAssignPermissions: boolean;
  canActivate: boolean;
  pending: boolean;
  restaurantId: string;
  loadAudit: (input: {
    data: { restaurantId: string; kind: "role" };
  }) => Promise<{ entries: Array<{ id: string; action: string; createdAt: string }> }>;
  onClose: () => void;
  onSave: (role: Card7HotelRole, codes: PmsPermissionCode[], creating: boolean) => void;
  onDeactivate: (role: Card7HotelRole) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [template, setTemplate] = useState<StaffAccessTemplateId>("blank");
  const [selected, setSelected] = useState<Set<PmsPermissionCode>>(() => new Set(role ? codesForRole(snapshot, role.id) : []));
  const audit = useQuery({
    queryKey: ["pms-access-audit", restaurantId, "role"],
    queryFn: () => loadAudit({ data: { restaurantId, kind: "role" } }),
    enabled: !creating,
  });

  const draftRole: Card7HotelRole = {
    id: role?.id ?? "",
    code: role?.code ?? "",
    name,
    description,
    departmentId: role?.departmentId ?? null,
    active: role?.active ?? true,
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{creating ? "Create Role" : name || "Role"}</DialogTitle>
          <DialogDescription>Role names do not grant access. Only the permissions you select do.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Role Details</p>
            <div className="space-y-1">
              <Label htmlFor="role-name">Role Name *</Label>
              <Input id="role-name" value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} className="border-[#DDD4C5] bg-white" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role-description">Description</Label>
              <Textarea id="role-description" value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} className="border-[#DDD4C5] bg-white" />
            </div>
          </section>
          {creating && canAssignPermissions ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Start From</p>
              <div className="flex flex-wrap gap-1.5">
                {STAFF_ACCESS_TEMPLATES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-full border border-[#DDD4C5] bg-white px-2.5 py-1 text-xs"
                    onClick={() => {
                      setTemplate(item.id);
                      setSelected(new Set(templatePermissionCodes(item.id)));
                      if (!name.trim() && item.id !== "blank") setName(item.label);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#756A5B]">
                {STAFF_ACCESS_TEMPLATES.find((item) => item.id === template)?.description} Templates only fill the form.
              </p>
            </section>
          ) : null}
          {creating && !canAssignPermissions ? (
            <p className="text-xs text-[#756A5B]">
              This role will be created without permissions. Assign Role Permissions is required to add them.
            </p>
          ) : null}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Permissions</p>
            {!canAssignPermissions ? <p className="text-xs text-[#756A5B]">Permission changes require Assign Role Permissions.</p> : null}
            <StaffAccessMatrix
              selected={selected}
              actor={actor}
              readOnly={!canAssignPermissions}
              onChange={setSelected}
            />
          </section>
          {!creating ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Activity</p>
              {(audit.data?.entries ?? []).map((entry) => (
                <p key={entry.id} className="text-xs text-[#5A4833]">
                  {auditActionLabel(entry.action)}
                </p>
              ))}
            </section>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {!creating && role?.active && canActivate ? (
              <Button type="button" variant="outline" onClick={() => onDeactivate(draftRole)}>
                Deactivate
              </Button>
            ) : null}
            {!creating && role && !role.active && canActivate ? (
              <Button type="button" variant="outline" onClick={() => onSave({ ...draftRole, active: true }, [...selected], false)}>
                Activate
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={pending || !name.trim() || (!canEdit && !canAssignPermissions)}
              onClick={() => onSave(draftRole, [...selected], creating)}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function codesForRole(snapshot: Card7SecuritySnapshot | undefined, roleId: string): PmsPermissionCode[] {
  if (!snapshot) return [];
  const codeById = new Map(snapshot.permissions.map((permission) => [permission.id, permission.code]));
  return snapshot.mappings
    .filter((mapping) => mapping.roleId === roleId && mapping.allowed)
    .map((mapping) => codeById.get(mapping.permissionId))
    .filter((code): code is PmsPermissionCode => Boolean(code && isPmsPermissionCode(code)));
}

function mappingPayload(snapshot: Card7SecuritySnapshot, roleId: string, codes: readonly PmsPermissionCode[]) {
  const selected = new Set(codes);
  const previous = new Map(
    snapshot.mappings.filter((mapping) => mapping.roleId === roleId).map((mapping) => [mapping.permissionId, mapping.dataScope]),
  );
  return snapshot.permissions
    .filter((permission) => permission.active && isPmsPermissionCode(permission.code))
    .map((permission) => ({
      permissionId: permission.id,
      allowed: selected.has(permission.code as PmsPermissionCode),
      dataScope: previous.get(permission.id) === "department" ? ("department" as const) : ("property" as const),
    }));
}
