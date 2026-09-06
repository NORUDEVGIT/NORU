import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Info, Plus, RefreshCw, Search, ShieldCheck, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MyShiftCard } from "@/components/workforce/my-shift-card";
import { ScheduleTab } from "@/components/workforce/schedule-tab";
import { AttendanceTab } from "@/components/workforce/attendance-tab";
import { ReportsTab } from "@/components/workforce/reports-tab";

import {
  changeStaffRole,
  createStaff,
  listStaff,
  setStaffActive,
  type StaffMember,
  type StaffRole,
} from "@/lib/staff.functions";
import { getStaffModuleAccess, setStaffModuleAccess } from "@/lib/module-access.functions";
import { Switch } from "@/components/ui/switch";
import { ROLE_LABELS, SELECTABLE_STAFF_ROLES, type ModuleKey } from "@/lib/module-access";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<StaffRole, string> = ROLE_LABELS;

const ROLE_BADGE: Record<StaffRole, string> = {
  owner: "bg-primary/10 text-primary",
  manager: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  kitchen: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  waiter: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  housekeeping: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  housekeeping_supervisor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  housekeeper: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  receptionist: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  cashier: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  accountant: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  storekeeper: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  maintenance: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

/** Mirrors the authorization that actually exists in the codebase today. */
const PERMISSION_MATRIX: {
  area: string;
  owner: string;
  manager: string;
  kitchen: string;
  waiter: string;
}[] = [
  { area: "Dashboard & analytics", owner: "Yes", manager: "Yes", kitchen: "Yes", waiter: "Yes" },
  { area: "Menu management", owner: "Yes", manager: "Yes", kitchen: "No", waiter: "No" },
  { area: "Kitchen board", owner: "Yes", manager: "Yes", kitchen: "Yes", waiter: "No" },
  { area: "Orders (view)", owner: "Yes", manager: "Yes", kitchen: "Yes", waiter: "Yes" },
  { area: "Order status updates", owner: "Yes", manager: "Yes", kitchen: "Yes", waiter: "No" },
  { area: "Tables & QR (view)", owner: "Yes", manager: "Yes", kitchen: "Yes", waiter: "Yes" },
  { area: "Tables & QR (edit)", owner: "Yes", manager: "Yes", kitchen: "No", waiter: "No" },
  { area: "Staff management", owner: "Yes", manager: "Except owners", kitchen: "No", waiter: "No" },
  { area: "Restaurant settings", owner: "Yes", manager: "Yes", kitchen: "No", waiter: "No" },
];

/**
 * One page, four tabs. Kitchen/waiter only ever see their own schedule plus the
 * My Shift card — the server functions enforce the same rules regardless.
 */
export function StaffWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string }) {
  const canManage = membership.role === "owner" || membership.role === "manager";
  const searchTab = initialTab;
  const [tab, setTab] = useState(canManage ? "staff" : "schedule");

  // The sidebar links to a tab via ?tab=…; keep local state in sync with it.
  useEffect(() => {
    const allowed = canManage ? ["staff", "schedule", "attendance", "reports"] : ["schedule"];
    if (searchTab && allowed.includes(searchTab)) setTab(searchTab);
  }, [searchTab, canManage]);

  return (
    <div className="space-y-6">
      <MyShiftCard
        restaurantId={membership.restaurantId}
        timezone={membership.restaurant.timezone}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {canManage ? <TabsTrigger value="staff">Staff</TabsTrigger> : null}
          <TabsTrigger value="schedule">{canManage ? "Schedule" : "My schedule"}</TabsTrigger>
          {canManage ? <TabsTrigger value="attendance">Attendance</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="reports">Reports</TabsTrigger> : null}
        </TabsList>

        {canManage ? (
          <TabsContent value="staff" className="mt-6">
            <StaffManager membership={membership} />
          </TabsContent>
        ) : null}

        <TabsContent value="schedule" className="mt-6">
          <ScheduleTab
            restaurantId={membership.restaurantId}
            canManage={canManage}
            timezone={membership.restaurant.timezone}
          />
        </TabsContent>

        {canManage ? (
          <TabsContent value="attendance" className="mt-6">
            <AttendanceTab
              restaurantId={membership.restaurantId}
              timezone={membership.restaurant.timezone}
            />
          </TabsContent>
        ) : null}

        {canManage ? (
          <TabsContent value="reports" className="mt-6">
            <ReportsTab
              restaurantId={membership.restaurantId}
              timezone={membership.restaurant.timezone}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

type StatusFilter = "all" | "active" | "inactive";
type RoleFilter = "all" | StaffRole;

function StaffManager({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurantId;
  const queryClient = useQueryClient();

  const fetchStaff = useServerFn(listStaff);
  const createFn = useServerFn(createStaff);
  const roleFn = useServerFn(changeStaffRole);
  const activeFn = useServerFn(setStaffActive);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "role"; member: StaffMember; role: StaffRole }
    | { kind: "active"; member: StaffMember; active: boolean }
    | null
  >(null);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    role: StaffRole;
    tempPassword: string | null;
    existingAccount: boolean;
  } | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["restaurant-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant-staff", restaurantId] });

  const staff = useMemo(() => data?.staff ?? [], [data]);
  const canAssign = data?.canAssign ?? [];
  const myRole = data?.role;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (status === "active" && !s.active) return false;
      if (status === "inactive" && s.active) return false;
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (q && !`${s.name ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [staff, status, roleFilter, search]);

  const summary = useMemo(() => {
    const active = staff.filter((s) => s.active);
    const by = (r: StaffRole) => active.filter((s) => s.role === r).length;
    return {
      total: staff.length,
      active: active.length,
      owners: by("owner"),
      managers: by("manager"),
      kitchen: by("kitchen"),
      waiters: by("waiter"),
    };
  }, [staff]);

  const createMutation = useMutation({
    mutationFn: (input: { fullName: string; email: string; role: StaffRole }) =>
      createFn({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setAddOpen(false);
      setCreated({
        name: result.name,
        email: result.email,
        role: result.role as StaffRole,
        tempPassword: result.tempPassword ?? null,
        existingAccount: result.existingAccount,
      });
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { membershipId: string; role: StaffRole }) =>
      roleFn({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Role updated.");
      setSelected(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { membershipId: string; active: boolean }) =>
      activeFn({ data: { restaurantId, ...input } }),
    onSuccess: (result, vars) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(vars.active ? "Staff member reactivated." : "Staff member deactivated.");
      setSelected(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canManageTarget = (member: StaffMember) => member.role !== "owner" || myRole === "owner";

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your team…</p>;
  }
  if (isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Human Resources</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to manage staff for this restaurant, or we couldn't load the
          team right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl">Staff &amp; roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.total} team {summary.total === 1 ? "member" : "members"} · {summary.active}{" "}
            active
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMatrixOpen(true)}>
            <Info className="mr-2 size-4" /> Permissions
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} /> Refresh
          </Button>
          {canAssign.length > 0 ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" /> Add staff
            </Button>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Total staff" value={summary.total} />
        <SummaryCard label="Active" value={summary.active} />
        <SummaryCard label="Owners" value={summary.owners} />
        <SummaryCard label="Managers" value={summary.managers} />
        <SummaryCard label="Kitchen" value={summary.kitchen} />
        <SummaryCard label="Waiters" value={summary.waiters} />
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {SELECTABLE_STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {/* Desktop table */}
      <section className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => (
              <tr key={member.membershipId} className="border-t border-border">
                <td className="px-4 py-3 font-medium">
                  {member.name ?? "—"}
                  {member.isSelf ? (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{member.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={member.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge active={member.active} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(member.createdAt)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {member.updatedAt ? formatDate(member.updatedAt) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => setSelected(member)}>
                    <UserCog className="mr-2 size-4" /> Manage
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No staff match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* Mobile cards */}
      <section className="space-y-3 lg:hidden">
        {filtered.map((member) => (
          <button
            key={member.membershipId}
            type="button"
            onClick={() => setSelected(member)}
            className="block w-full rounded-2xl border border-border bg-card p-4 text-left"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {member.name ?? "—"}
                  {member.isSelf ? (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email ?? "—"}</p>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                <RoleBadge role={member.role} />
                <StatusBadge active={member.active} />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Joined {formatDate(member.createdAt)}
            </p>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No staff match these filters.
          </p>
        ) : null}
      </section>

      {(data?.audit.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Recent staff activity</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {data!.audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2">
                <span className="text-foreground">{describeAudit(entry)}</span>
                <span className="text-xs">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        canAssign={canAssign}
        pending={createMutation.isPending}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <CreatedDialog
        created={created}
        onClose={() => setCreated(null)}
        onAddAnother={() => {
          setCreated(null);
          setAddOpen(true);
        }}
      />

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name ?? selected.email ?? "Staff member"}</DialogTitle>
                <DialogDescription>{selected.email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <RoleBadge role={selected.role} />
                  <StatusBadge active={selected.active} />
                </div>
                <p className="text-muted-foreground">
                  Member since {formatDate(selected.createdAt)}
                </p>

                {canManageTarget(selected) ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Change role</Label>
                      <Select
                        value={selected.role}
                        onValueChange={(v) =>
                          v !== selected.role &&
                          setConfirm({ kind: "role", member: selected, role: v as StaffRole })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SELECTABLE_STAFF_ROLES.filter(
                            (r) => canAssign.includes(r) || r === selected.role,
                          ).map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ModuleAccessPanel
                      restaurantId={restaurantId}
                      member={selected}
                      isSelf={selected.isSelf}
                    />
                    <Button
                      variant={selected.active ? "destructive" : "default"}
                      className="w-full"
                      onClick={() =>
                        setConfirm({ kind: "active", member: selected, active: !selected.active })
                      }
                    >
                      {selected.active ? "Deactivate staff member" : "Reactivate staff member"}
                    </Button>
                  </>
                ) : (
                  <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                    Only an owner can manage another owner's membership.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "role"
                ? "Change this staff member's role?"
                : confirm?.active
                  ? "Reactivate this staff member?"
                  : "Deactivate this staff member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "role"
                ? `They will immediately have ${confirm ? ROLE_LABEL[confirm.role] : ""} permissions for this restaurant.`
                : confirm?.active
                  ? "They will regain access to this restaurant with their previous role."
                  : "They will immediately lose access to this restaurant. Their account and history are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "role") {
                  roleMutation.mutate({
                    membershipId: confirm.member.membershipId,
                    role: confirm.role,
                  });
                } else {
                  activeMutation.mutate({
                    membershipId: confirm.member.membershipId,
                    active: confirm.active,
                  });
                }
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>What each role can do</DialogTitle>
            <DialogDescription>
              These are the permissions enforced by the platform today.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Area</th>
                  <th className="py-2 pr-3 font-semibold">Owner</th>
                  <th className="py-2 pr-3 font-semibold">Manager</th>
                  <th className="py-2 pr-3 font-semibold">Kitchen</th>
                  <th className="py-2 font-semibold">Waiter</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.map((row) => (
                  <tr key={row.area} className="border-t border-border">
                    <td className="py-2 pr-3">{row.area}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.owner}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.manager}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.kitchen}</td>
                    <td className="py-2 text-muted-foreground">{row.waiter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            At least one active owner is always required. Managers cannot create, promote, demote or
            deactivate owners.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  canAssign,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAssign: StaffRole[];
  pending: boolean;
  onSubmit: (input: { fullName: string; email: string; role: StaffRole }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>(
    canAssign.includes("waiter") ? "waiter" : (canAssign[0] ?? "waiter"),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setFullName("");
          setEmail("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
          <DialogDescription>
            We create their account securely on the server and give you a one-time password to
            share.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ fullName: fullName.trim(), email: email.trim(), role });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canAssign.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create staff account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatedDialog({
  created,
  onClose,
  onAddAnother,
}: {
  created: {
    name: string;
    email: string;
    role: StaffRole;
    tempPassword: string | null;
    existingAccount: boolean;
  } | null;
  onClose: () => void;
  onAddAnother: () => void;
}) {
  return (
    <Dialog open={!!created} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Staff account created
              </DialogTitle>
              <DialogDescription>They can log in at /restaurant/login.</DialogDescription>
            </DialogHeader>
            <dl className="space-y-2 text-sm">
              <Row label="Name" value={created.name} />
              <Row label="Email" value={created.email} />
              <Row label="Role" value={ROLE_LABEL[created.role]} />
            </dl>
            {created.tempPassword ? (
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  One-time password — shown once
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-sm">
                    {created.tempPassword}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy password"
                    onClick={() => {
                      void navigator.clipboard.writeText(created.tempPassword!);
                      toast.success("Copied.");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Share it in person or over a secure channel and ask them to change it right after
                  their first login.
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                {created.existingAccount
                  ? "This person already had an account, so they keep their existing password."
                  : "Ask them to use the password reset link on the login page to set a password."}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onAddAnother}>
                Add another
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", ROLE_BADGE[role])}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function describeAudit(entry: {
  action: string;
  actorName: string | null;
  targetName: string | null;
  oldRole: string | null;
  newRole: string | null;
}) {
  const actor = entry.actorName ?? "A team member";
  const target = entry.targetName ?? "a staff member";
  switch (entry.action) {
    case "staff_created":
      return `${actor} added ${target} as ${entry.newRole ?? "staff"}`;
    case "role_changed":
      return `${actor} changed ${target} from ${entry.oldRole} to ${entry.newRole}`;
    case "staff_deactivated":
      return `${actor} deactivated ${target}`;
    case "staff_reactivated":
      return `${actor} reactivated ${target}`;
    default:
      return `${actor} updated ${target}`;
  }
}

/** Owner/manager control over which workspaces a staff member can open. */
function ModuleAccessPanel({
  restaurantId,
  member,
  isSelf,
}: {
  restaurantId: string;
  member: StaffMember;
  isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getStaffModuleAccess);
  const saveAccess = useServerFn(setStaffModuleAccess);

  const fixed = member.role === "owner" || member.role === "manager";

  const access = useQuery({
    queryKey: ["staff-module-access", restaurantId, member.membershipId],
    queryFn: () => fetchAccess({ data: { restaurantId, membershipId: member.membershipId } }),
    enabled: !fixed,
  });

  const mutation = useMutation({
    mutationFn: (input: { moduleKey: ModuleKey; enabled: boolean | null }) =>
      saveAccess({ data: { restaurantId, membershipId: member.membershipId, ...input } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["staff-module-access", restaurantId, member.membershipId],
      });
      toast.success("Module access updated.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update module access."),
  });

  if (fixed) {
    return (
      <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
        Owners and managers always have access to every module.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Module access</Label>
      <p className="text-xs text-muted-foreground">
        Defaults come from the role. Toggle to grant or remove a workspace for this person.
      </p>
      {access.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading module access…</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(access.data?.rows ?? [])
            .filter((row) => row.overridable)
            .map((row) => (
              <li key={row.moduleKey} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm">{row.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.byDefault ? "Included in this role" : "Not part of this role"}
                    {row.overridden ? " · overridden" : ""}
                  </p>
                </div>
                <Switch
                  checked={row.enabled}
                  disabled={isSelf || mutation.isPending}
                  onCheckedChange={(checked) =>
                    mutation.mutate({
                      moduleKey: row.moduleKey,
                      enabled: checked === row.byDefault ? null : checked,
                    })
                  }
                />
              </li>
            ))}
        </ul>
      )}
      {isSelf ? (
        <p className="text-[11px] text-muted-foreground">
          You can't change your own module access.
        </p>
      ) : null}
    </div>
  );
}
