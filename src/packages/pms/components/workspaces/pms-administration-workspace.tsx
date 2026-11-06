/**
 * Phase 7D.2F2 — PMS Administration.
 *
 * PMS administrative controls only: which property people are PMS users, what
 * role they hold, what each role may enter, PMS configuration entry points and
 * PMS master data. Human Resources stays the owner of the employment
 * relationship (departments, schedules, attendance, workforce reporting) — no
 * staff record is duplicated here.
 */
import { ArrowRight, type LucideIcon, BedDouble, TrendingUp, Users, Wallet } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { FoundationPanel } from "@/packages/pms/components/pms/foundation-panel";
import { BackOfficeHrLink } from "@/packages/back-office/components/hr-link";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { STAFF_ACCESS_HREF } from "@/packages/pms/lib/pms-property-setup-card5";
import { PageHeading } from "@/core/state/pms-context";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

export function PmsAdministrationWorkspace({ membership }: { membership: RestaurantMembership }) {
  const access = usePmsPermissions(membership.restaurantId);
  const canManage = access.canAny([
    PMS_PERMISSIONS.STAFF_VIEW,
    PMS_PERMISSIONS.ROLES_VIEW,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Administration" />
        </h1>
        <p className="text-sm text-muted-foreground">
          PMS staff, roles, and permissions for {membership.restaurant.name} are managed in Staff
          & Access. People records, departments, schedules and attendance stay in Human Resources.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You don't have permission to administer PMS access for this property.
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

          <TabsContent value="users" className="mt-6">
            <AccessGuide restaurantId={membership.restaurantId} />
          </TabsContent>
          <TabsContent value="roles" className="mt-6">
            <AccessGuide restaurantId={membership.restaurantId} />
          </TabsContent>
          <TabsContent value="permissions" className="mt-6">
            <AccessGuide restaurantId={membership.restaurantId} />
          </TabsContent>

          <TabsContent value="configuration" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              PMS configuration lives in Settings; these are the areas an administrator most
              often changes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminCard
                icon={Users}
                title="Property information"
                description="Property details, timezone and currency."
                to="/restaurant/settings"
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
                description="Rate structures used when pricing a stay. Configured in Property Setup."
                to="/restaurant/settings#financial-commercial"
              />
              <AdminCard
                icon={Wallet}
                title="Payment methods"
                description="Accepted tenders are maintained in Settings. Cashiering consumes the Active list."
                to="/restaurant/settings#payment-methods"
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

function AccessGuide({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        Staff members, roles, and permissions have moved to Settings. Open Staff & Access to manage
        them. Employment records stay in Human Resources.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={STAFF_ACCESS_HREF} className="text-sm font-medium text-primary">
          Open Staff & Access
        </a>
        <BackOfficeHrLink restaurantId={restaurantId} />
      </div>
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
    <a
      href={to}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <Icon className="size-5 text-primary" />
      <p className="mt-3 font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
        Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
