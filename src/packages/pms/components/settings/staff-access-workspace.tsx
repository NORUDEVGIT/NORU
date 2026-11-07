import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { StaffAccessMembers } from "@/packages/pms/components/settings/staff-access-members";
import { StaffAccessRoles } from "@/packages/pms/components/settings/staff-access-roles";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { staffAccessStepVisible } from "@/packages/pms/lib/staff-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

/** Staff & Access. Visibility and actions follow catalogue permissions. */
export function StaffAccessWorkspace({ restaurantId }: { restaurantId: string }) {
  const access = usePmsPermissions(restaurantId);
  const canStaff = access.can(PMS_PERMISSIONS.STAFF_VIEW);
  const canRoles = access.can(PMS_PERMISSIONS.ROLES_VIEW);
  const [tab, setTab] = useState<"staff" | "roles">("staff");

  useEffect(() => {
    if (access.isLoading) return;
    if (tab === "staff" && !canStaff && canRoles) setTab("roles");
    if (tab === "roles" && !canRoles && canStaff) setTab("staff");
  }, [access.isLoading, canStaff, canRoles, tab]);

  if (access.isLoading) {
    return <p className="text-sm text-[#756A5B]">Checking access…</p>;
  }
  if (access.isError || !staffAccessStepVisible(canStaff, canRoles)) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to do that.</p>;
  }

  const actor = { isOwner: access.isOwner, codes: access.permissions };

  return (
    <section className="min-w-0 space-y-3" data-testid="staff-access-workspace">
      <Tabs value={tab} onValueChange={(value) => setTab(value as "staff" | "roles")}>
        <TabsList className="h-8 w-fit justify-start rounded-md border border-[#DDD4C5] bg-white p-0.5">
          {canStaff ? (
            <TabsTrigger value="staff" data-testid="staff-members-tab">
              Staff Members
            </TabsTrigger>
          ) : null}
          {canRoles ? (
            <TabsTrigger value="roles" data-testid="roles-permissions-tab-trigger">
              Roles & Permissions
            </TabsTrigger>
          ) : null}
        </TabsList>
        {canStaff ? (
          <TabsContent value="staff" className="mt-3">
            <StaffAccessMembers
              restaurantId={restaurantId}
              actor={actor}
              canCreate={access.can(PMS_PERMISSIONS.STAFF_CREATE)}
              canEdit={access.can(PMS_PERMISSIONS.STAFF_EDIT)}
              canActivate={access.can(PMS_PERMISSIONS.STAFF_ACTIVATE)}
              canAssignRoles={access.can(PMS_PERMISSIONS.STAFF_ASSIGN_ROLES)}
              canReset={access.can(PMS_PERMISSIONS.STAFF_RESET_ACCESS)}
            />
          </TabsContent>
        ) : null}
        {canRoles ? (
          <TabsContent value="roles" className="mt-3">
            <StaffAccessRoles
              restaurantId={restaurantId}
              actor={actor}
              canCreate={access.can(PMS_PERMISSIONS.ROLES_CREATE)}
              canEdit={access.can(PMS_PERMISSIONS.ROLES_EDIT)}
              canActivate={access.can(PMS_PERMISSIONS.ROLES_ACTIVATE)}
              canAssignPermissions={access.can(PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS)}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </section>
  );
}
