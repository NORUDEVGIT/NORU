/**
 * Phase 7D.2F2 — PMS Administration.
 *
 * PMS administrative controls only: which property people are PMS users, what
 * role they hold, what each role may enter, PMS configuration entry points and
 * PMS master data. Human Resources stays the owner of the employment
 * relationship (departments, schedules, attendance, workforce reporting) — no
 * staff record is duplicated here.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon, BedDouble, TrendingUp, Users, Wallet } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { FoundationPanel } from "@/packages/pms/components/pms/foundation-panel";
import { StaffManager } from "@/core/components/workspaces/staff-workspace";
import { BackOfficeHrLink } from "@/components/workspaces/back-office/hr-link";
import {
  MODULE_LABELS,
  OVERRIDABLE_MODULES,
  ROLE_LABELS,
  ROLE_MODULES,
  SELECTABLE_STAFF_ROLES,
} from "@/core/lib/module-access";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";

export function PmsAdministrationWorkspace({ membership }: { membership: RestaurantMembership }) {
  const canManage = membership.role === "owner" || membership.role === "manager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Administration" />
        </h1>
        <p className="text-sm text-muted-foreground">
          PMS users, roles, permissions and configuration for {membership.restaurant.name}. People
          records, departments, schedules and attendance are managed in Human Resources.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Only owners and managers can administer PMS access for this property.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="users">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="master-data">Master data</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Property staff who can sign in and use the PMS. Adding someone here gives them access;
              their employment details stay in Human Resources.
            </p>
            <div className="flex justify-end">
              <BackOfficeHrLink restaurantId={membership.restaurantId} />
            </div>
            <StaffManager membership={membership} embedded />
          </TabsContent>

          <TabsContent value="roles" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Each user holds one role. A role decides which modules they can open by default.
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Default module access</th>
                  </tr>
                </thead>
                <tbody>
                  {SELECTABLE_STAFF_ROLES.map((role) => (
                    <tr key={role} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-medium">{ROLE_LABELS[role]}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ROLE_MODULES[role].map((m) => MODULE_LABELS[m]).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Per-person permissions are set from the Users tab — open a staff member and adjust
              their module access. Configuration, property settings and Human Resources stay tied to
              owners and managers so access can never be escalated by an override.
            </p>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Modules that can be granted per person
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {OVERRIDABLE_MODULES.map((m) => (
                  <li key={m} className="text-sm">
                    {MODULE_LABELS[m]}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="configuration" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              PMS configuration lives in Property Setup; these are the areas an administrator most
              often changes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminCard
                icon={Users}
                title="Property information"
                description="Property details, timezone and currency."
                to="/restaurant/pms/property-setup"
              />
              <AdminCard
                icon={BedDouble}
                title="Room configuration"
                description="Room types and rooms used across the PMS."
                to="/restaurant/pms/room-inventory"
              />
            </div>
          </TabsContent>

          <TabsContent value="master-data" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              The reference data the PMS runs on. Each set is maintained in the module that owns it.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminCard
                icon={BedDouble}
                title="Room types & rooms"
                description="The hotel's sellable room inventory."
                to="/restaurant/pms/room-inventory"
              />
              <AdminCard
                icon={TrendingUp}
                title="Rate plans & categories"
                description="Rate structures used when pricing a stay."
                to="/restaurant/pms/rates-revenue"
              />
              <AdminCard
                icon={Wallet}
                title="Payment methods"
                description="Methods accepted when posting to a guest folio."
                to="/restaurant/pms/cashiering"
              />
            </div>
            <FoundationPanel
              title="Further master data"
              description="Market segments, sources of business, guest titles and document types aren't maintained yet."
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AdminCard({
  icon: Icon,
  title,
  description,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <Icon className="size-5 text-primary" />
      <p className="mt-3 font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
        Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
