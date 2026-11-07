import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import {
  CARD5_ACTIONS_TD_CLASS,
  CARD5_ACTIONS_TH_CLASS,
  CARD5_FILTER_CLASS,
  CARD5_SEARCH_CLASS,
  CARD5_SELECT_CONTENT_CLASS,
  CARD5_SELECT_ITEM_CLASS,
  CARD5_STATUS_TD_CLASS,
  CARD5_STATUS_TH_CLASS,
  CARD5_TH_CLASS,
  CARD5_THEAD_CLASS,
  CARD5_TOOLBAR_CLASS,
  Card5CreateButton,
  Card5RowMenuButton,
  Card5Status,
  Card5TableShell,
} from "@/packages/pms/components/settings/pms-property-setup-card5-workspace";
import { invalidatePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import {
  ACTIVE_STAFF_NEEDS_ROLE,
  ROLE_OUTSIDE_ACTOR,
  accessCounts,
  auditActionLabel,
  canOfferAddStaff,
  friendlyAccessError,
  roleFitsActor,
  unionPermissionDetail,
} from "@/packages/pms/lib/staff-access";
import {
  assignPmsStaffRoles,
  createPmsStaff,
  listPmsAccessAudit,
  listPmsAssignableRoles,
  listPmsStaff,
  resetPmsStaffAccess,
  setPmsStaffActive,
  updatePmsStaffProfile,
} from "@/packages/pms/lib/pms-staff.functions";

type Actor = { isOwner: boolean; codes: readonly string[] };

type StaffRow = {
  membershipId: string;
  userId: string;
  active: boolean;
  isOwner: boolean;
  isSelf: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roles: Array<{ roleId: string; name: string; roleActive: boolean }>;
};

type AssignableRole = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  codes: string[];
};

export function StaffAccessMembers({
  restaurantId,
  actor,
  canCreate,
  canEdit,
  canActivate,
  canAssignRoles,
  canReset,
}: {
  restaurantId: string;
  actor: Actor;
  canCreate: boolean;
  canEdit: boolean;
  canActivate: boolean;
  canAssignRoles: boolean;
  canReset: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchStaff = useServerFn(listPmsStaff);
  const fetchRoles = useServerFn(listPmsAssignableRoles);
  const createStaff = useServerFn(createPmsStaff);
  const updateProfile = useServerFn(updatePmsStaffProfile);
  const setActive = useServerFn(setPmsStaffActive);
  const assignRoles = useServerFn(assignPmsStaffRoles);
  const resetAccess = useServerFn(resetPmsStaffAccess);
  const fetchAudit = useServerFn(listPmsAccessAudit);

  const staffQuery = useQuery({
    queryKey: ["pms-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });
  const rolesQuery = useQuery({
    queryKey: ["pms-assignable-roles", restaurantId],
    queryFn: () => fetchRoles({ data: { restaurantId } }),
    enabled: actor.isOwner || canAssignRoles || canCreate,
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [editor, setEditor] = useState<"create" | StaffRow | null>(null);
  const [secret, setSecret] = useState<{ password: string; kind: "created" | "reset" } | null>(null);
  const [linked, setLinked] = useState(false);
  const [confirm, setConfirm] = useState<{ row: StaffRow; active: boolean } | { row: StaffRow; reset: true } | null>(null);

  const assignable = (rolesQuery.data?.roles ?? []) as AssignableRole[];
  const rows = (staffQuery.data?.staff ?? []) as StaffRow[];
  const visible = rows.filter((row) => {
    const name = `${row.firstName} ${row.lastName} ${row.email}`.toLowerCase();
    if (search.trim() && !name.includes(search.trim().toLowerCase())) return false;
    if (status === "active" && !row.active) return false;
    if (status === "disabled" && row.active) return false;
    return true;
  });
  const showAdd = canOfferAddStaff(canCreate, canAssignRoles);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["pms-staff", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-role-usage", restaurantId] });
    void invalidatePmsPermissions(queryClient, restaurantId);
  }

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(friendlyAccessError(result.message));
        return;
      }
      setEditor(null);
      if (result.tempPassword) setSecret({ password: result.tempPassword, kind: "created" });
      else setLinked(true);
      createMutation.reset();
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyAccessError(error.message)),
  });

  return (
    <div className="min-w-0 space-y-3" data-testid="staff-members-tab">
      <h3 className="font-display text-lg text-[#251605]">Staff Members</h3>
      <div className={CARD5_TOOLBAR_CLASS}>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search staff"
          aria-label="Search staff"
          className={CARD5_SEARCH_CLASS}
        />
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className={`${CARD5_FILTER_CLASS} w-[7.5rem]`} aria-label="Staff status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={CARD5_SELECT_CONTENT_CLASS}>
            <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="all">
              All
            </SelectItem>
            <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="active">
              Active
            </SelectItem>
            <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="disabled">
              Disabled
            </SelectItem>
          </SelectContent>
        </Select>
        {showAdd ? (
          <Card5CreateButton onClick={() => setEditor("create")} data-testid="add-staff">
            <Plus className="size-4" /> Add Staff
          </Card5CreateButton>
        ) : null}
      </div>
      {staffQuery.isLoading ? <p className="text-sm text-[#756A5B]">Checking access…</p> : null}
      {staffQuery.isError ? (
        <p className="text-sm text-destructive">{friendlyAccessError((staffQuery.error as Error).message)}</p>
      ) : null}
      {!staffQuery.isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 text-sm text-[#5A4833]">
          No staff members have been added yet.
          {showAdd ? (
            <Card5CreateButton className="ml-3" onClick={() => setEditor("create")}>
              <Plus className="size-4" /> Add Staff
            </Card5CreateButton>
          ) : null}
        </div>
      ) : null}
      {!staffQuery.isLoading && rows.length > 0 && visible.length === 0 ? (
        <p className="text-sm text-[#756A5B]">No staff members match this search.</p>
      ) : null}
      {visible.length > 0 ? (
        <Card5TableShell>
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col />
              <col />
              <col />
              <col className="w-[7.5rem]" />
              <col className="w-[4.5rem]" />
            </colgroup>
            <thead className={CARD5_THEAD_CLASS}>
              <tr>
                <th className={CARD5_TH_CLASS}>Name</th>
                <th className={CARD5_TH_CLASS}>Email</th>
                <th className={CARD5_TH_CLASS}>Assigned Roles</th>
                <th className={CARD5_STATUS_TH_CLASS}>Status</th>
                <th className={CARD5_ACTIONS_TH_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.membershipId} className="border-t border-[#EFE6D6]" data-testid={`staff-row-${row.membershipId}`}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[#251605]">
                      {displayName(row)}
                      {row.isSelf ? <span className="ml-2 text-xs text-[#8A641A]">You</span> : null}
                    </p>
                    {row.phone ? <p className="text-xs text-[#756A5B]">{row.phone}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-[#5A4833]">{row.email || "—"}</td>
                  <td className="px-3 py-2">
                    {row.isOwner ? (
                      <span className="text-[#251605]">Owner · Full Access</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.roles.length === 0 ? <span className="text-[#756A5B]">No roles</span> : null}
                        {row.roles.map((role) => (
                          <span key={role.roleId} className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-xs text-[#5A4833]">
                            {role.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className={CARD5_STATUS_TD_CLASS}>
                    <Card5Status
                      active={row.active}
                      activeLabel="Active"
                      inactiveLabel="Disabled"
                    />
                  </td>
                  <td className={CARD5_ACTIONS_TD_CLASS}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Card5RowMenuButton label={`Actions for ${displayName(row)}`} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
                        <DropdownMenuItem onSelect={() => setEditor(row)}>
                          View / Edit
                        </DropdownMenuItem>
                        {!row.isOwner && canReset ? (
                          <DropdownMenuItem onSelect={() => setConfirm({ row, reset: true })}>
                            Reset Access
                          </DropdownMenuItem>
                        ) : null}
                        {!row.isOwner && canActivate ? (
                          <DropdownMenuItem
                            onSelect={() => setConfirm({ row, active: !row.active })}
                          >
                            {row.active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card5TableShell>
      ) : null}

      <StaffEditor
        open={editor !== null}
        mode={editor}
        roles={assignable}
        actor={actor}
        canEdit={canEdit}
        canAssignRoles={canAssignRoles}
        restaurantId={restaurantId}
        pending={createMutation.isPending}
        fetchAudit={fetchAudit}
        onClose={() => setEditor(null)}
        onCreate={(input) => createMutation.mutate({ data: input })}
        onSaveProfile={async (input) => {
          try {
            await updateProfile({ data: input });
            toast.success("Staff profile saved.");
            refresh();
          } catch (error) {
            toast.error(friendlyAccessError((error as Error).message));
          }
        }}
        onSaveRoles={async (input) => {
          try {
            await assignRoles({ data: input });
            toast.success("Roles saved.");
            refresh();
          } catch (error) {
            toast.error(friendlyAccessError((error as Error).message));
          }
        }}
      />

      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (open) return;
          setSecret(null);
          createMutation.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {secret?.kind === "reset" ? "Access reset." : "Staff member created successfully."}
            </DialogTitle>
            <DialogDescription>
              This password is shown only once.
              {secret?.kind === "created"
                ? " The staff member will be required to change it on first login once the forced password change screen is completed."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Temporary Password</p>
          <p className="rounded-md border border-[#DDD4C5] bg-[#F7F4EE] px-3 py-2 font-mono text-sm" data-testid="temp-password">
            {secret?.password}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (secret?.password) void navigator.clipboard?.writeText(secret.password);
            }}
          >
            Copy
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={linked} onOpenChange={setLinked}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Existing account linked to this property.</DialogTitle>
            <DialogDescription>No new sign-in password was created.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{"reset" in (confirm ?? {}) ? "Reset Access" : confirm && "active" in confirm && confirm.active ? "Activate staff" : "Deactivate staff"}</DialogTitle>
            <DialogDescription>
              {"reset" in (confirm ?? {})
                ? "This replaces the current sign-in with a one-time password."
                : "Role assignments stay on the membership. Disabled staff do not receive those permissions until they are active again."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!confirm) return;
                const current = confirm;
                setConfirm(null);
                void (async () => {
                  try {
                    if ("reset" in current) {
                      const result = await resetAccess({ data: { restaurantId, membershipId: current.row.membershipId } });
                      if (result.tempPassword) setSecret({ password: result.tempPassword, kind: "reset" });
                    } else {
                      await setActive({ data: { restaurantId, membershipId: current.row.membershipId, active: current.active } });
                    }
                    refresh();
                  } catch (error) {
                    toast.error(friendlyAccessError((error as Error).message));
                  }
                })();
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function displayName(row: { firstName: string; lastName: string; email: string }) {
  const name = `${row.firstName} ${row.lastName}`.trim();
  return name || row.email || "Staff member";
}

function StaffEditor({
  open,
  mode,
  roles,
  actor,
  canEdit,
  canAssignRoles,
  restaurantId,
  pending,
  fetchAudit,
  onClose,
  onCreate,
  onSaveProfile,
  onSaveRoles,
}: {
  open: boolean;
  mode: "create" | StaffRow | null;
  roles: AssignableRole[];
  actor: Actor;
  canEdit: boolean;
  canAssignRoles: boolean;
  restaurantId: string;
  pending: boolean;
  fetchAudit: (input: {
    data: { restaurantId: string; kind: "staff" | "role"; targetUserId?: string };
  }) => Promise<{ entries: Array<{ id: string; action: string; createdAt: string }> }>;
  onClose: () => void;
  onCreate: (input: {
    restaurantId: string;
    fullName: string;
    email: string;
    phone?: string;
    roleIds: string[];
    active: boolean;
  }) => void;
  onSaveProfile: (input: { restaurantId: string; membershipId: string; fullName: string; phone?: string }) => Promise<void>;
  onSaveRoles: (input: { restaurantId: string; membershipId: string; roleIds: string[] }) => Promise<void>;
}) {
  const creating = mode === "create";
  const row = mode && mode !== "create" ? mode : null;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActiveFlag] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [roleQuery, setRoleQuery] = useState("");
  const [picker, setPicker] = useState(false);
  const editorKey = creating ? "create" : row?.membershipId ?? "";

  useEffect(() => {
    if (!open) return;
    setFirstName(row?.firstName ?? "");
    setLastName(row?.lastName ?? "");
    setEmail(row?.email ?? "");
    setPhone(row?.phone ?? "");
    setActiveFlag(row?.active ?? true);
    setRoleIds(row?.roles.map((role) => role.roleId) ?? []);
    setPicker(false);
    // Reset the draft only when a different staff member or the create form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editorKey]);

  const auditQuery = useQuery({
    queryKey: ["pms-access-audit", restaurantId, "staff", row?.userId],
    queryFn: () => fetchAudit({ data: { restaurantId, kind: "staff", targetUserId: row?.userId } }),
    enabled: open && Boolean(row?.userId),
  });

  const activeRoles = roles.filter((role) => role.active);
  const chosen = roles.filter((role) => roleIds.includes(role.id));
  const detail = unionPermissionDetail(
    chosen.map((role) => ({
      name: role.name,
      active: role.active,
      codes: role.codes,
    })),
  );
  const counts = accessCounts(detail.map((row) => row.code));
  const grouped = new Map<string, typeof detail>();
  for (const item of detail) {
    const list = grouped.get(item.moduleLabel) ?? [];
    list.push(item);
    grouped.set(item.moduleLabel, list);
  }
  const zeroRoleBlock = !row?.isOwner && active && roleIds.length === 0;

  return (
    <Card3OverlapSheet
      open={open}
      title={creating ? "Add Staff" : "Staff member"}
      description={creating ? "Create a staff member and assign roles." : undefined}
      onClose={onClose}
      onSubmit={
        creating
          ? () => {
              if (!firstName.trim() || !lastName.trim() || !email.trim() || (active && roleIds.length === 0)) {
                return;
              }
              onCreate({
                restaurantId,
                fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
                email: email.trim(),
                phone: phone.trim() || undefined,
                roleIds,
                active,
              });
            }
          : undefined
      }
      submitLabel="Create"
      pending={pending}
      canEdit={creating}
      maxWidth="max-w-xl"
      className="max-h-[85vh]"
      footerJustify="between"
    >
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Basic Information</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="First Name" value={firstName} onChange={setFirstName} disabled={!creating && !canEdit} required />
              <Field label="Last Name" value={lastName} onChange={setLastName} disabled={!creating && !canEdit} required />
            </div>
            <Field label="Email" value={email} onChange={setEmail} disabled={!creating} required />
            <Field label="Phone" value={phone} onChange={setPhone} disabled={!creating && !canEdit} />
          </section>
          {row?.isOwner ? (
            <p className="rounded-lg bg-[#F7F4EE] px-3 py-2 text-sm text-[#251605]">Owner · Full Access</p>
          ) : (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Assigned Roles</p>
              <div className="flex flex-wrap gap-1">
                {chosen.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    disabled={!canAssignRoles && !creating}
                    className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-xs"
                    onClick={() => setRoleIds((current) => current.filter((id) => id !== role.id))}
                  >
                    {role.name} ×
                  </button>
                ))}
              </div>
              {canAssignRoles || creating ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setPicker((value) => !value)}>
                    + Add Role
                  </Button>
                  {picker ? (
                    <div className="space-y-2 rounded-lg border border-[#DDD4C5] p-2">
                      <Input value={roleQuery} onChange={(event) => setRoleQuery(event.target.value)} placeholder="Search roles" aria-label="Search roles" />
                      {activeRoles
                        .filter((role) => role.name.toLowerCase().includes(roleQuery.trim().toLowerCase()))
                        .map((role) => {
                          const grants = role.codes;
                          const allowed = roleFitsActor(actor, grants);
                          return (
                            <label key={role.id} className="flex items-start gap-2 text-sm" title={allowed ? role.description : ROLE_OUTSIDE_ACTOR}>
                              <input
                                type="checkbox"
                                checked={roleIds.includes(role.id)}
                                disabled={!allowed}
                                onChange={(event) =>
                                  setRoleIds((current) =>
                                    event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id),
                                  )
                                }
                              />
                              <span>
                                <span className="font-medium">{role.name}</span>
                                {role.description ? <span className="block text-xs text-[#756A5B]">{role.description}</span> : null}
                                {!allowed ? <span className="block text-xs text-[#8C2F2F]">{ROLE_OUTSIDE_ACTOR}</span> : null}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[#756A5B]">Role changes require Assign Roles.</p>
              )}
              {zeroRoleBlock ? <p className="text-xs text-[#8C2F2F]">{ACTIVE_STAFF_NEEDS_ROLE}</p> : null}
            </section>
          )}
          {!row?.isOwner ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Effective Access</p>
              <p className="text-sm text-[#251605]">
                {counts.modules} modules · {counts.actions} actions
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-[#8A641A]">View Effective Permissions</summary>
                <div className="mt-2 space-y-2">
                  {[...grouped.entries()].map(([module, items]) => (
                    <div key={module}>
                      <p className="text-xs font-semibold text-[#251605]">{module}</p>
                      {items.map((item) => (
                        <p key={item.code} className="text-xs text-[#5A4833]">
                          ✓ {item.label}
                          <span className="text-[#756A5B]"> · {item.grantedBy.join(", ")}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </section>
          ) : null}
          {creating ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(event) => setActiveFlag(event.target.checked)} />
              Active
            </label>
          ) : null}
          {row ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#756A5B]">Activity</p>
              {(auditQuery.data?.entries ?? []).map((entry) => (
                <p key={entry.id} className="text-xs text-[#5A4833]">
                  {auditActionLabel(entry.action)}
                </p>
              ))}
            </section>
          ) : null}
          {row && !row.isOwner ? (
            <div className="flex justify-end gap-2">
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void onSaveProfile({
                        restaurantId,
                        membershipId: row.membershipId,
                        fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
                        phone,
                      })
                    }
                  >
                    Save profile
                  </Button>
                ) : null}
                {canAssignRoles ? (
                  <Button
                    type="button"
                    disabled={row.active && roleIds.length === 0}
                    onClick={() => void onSaveRoles({ restaurantId, membershipId: row.membershipId, roleIds })}
                  >
                    Save roles
                  </Button>
                ) : null}
            </div>
          ) : null}
        </div>
    </Card3OverlapSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = `staff-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="border-[#DDD4C5] bg-white" />
    </div>
  );
}
