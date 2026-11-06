/**
 * Centralized Guest Workspace Access Control
 * Phase 1 Foundation
 *
 * Separates user authorization from workspace configuration.
 * Maps existing role-based capabilities into a clean UI contract.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { hasEffectivePermission, resolveEffectivePermissions } from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";

const idSchema = z.string().uuid();

export interface GuestWorkspaceAccess {
  role: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  canManageAccounts: boolean;
  canMerge: boolean;
  canPrivacy: boolean;
  canExport: boolean;
}

export function resolveGuestWorkspaceAccess(role?: string | null): GuestWorkspaceAccess {
  if (!role) {
    return {
      role: "",
      canView: false,
      canCreate: false,
      canEdit: false,
      canVerifyIdentity: false,
      canManageAccounts: false,
      canMerge: false,
      canPrivacy: false,
      canExport: false,
    };
  }

  const isOwnerOrManager = role === "owner" || role === "manager";
  const isReceptionist = role === "receptionist" || role === "front_desk";
  const isStaff = role === "staff" || role === "waiter" || role === "kitchen";

  return {
    role,
    canView: isOwnerOrManager || isReceptionist || isStaff,
    canCreate: isOwnerOrManager || isReceptionist,
    canEdit: isOwnerOrManager || isReceptionist,
    canVerifyIdentity: isOwnerOrManager || isReceptionist,
    canManageAccounts: isOwnerOrManager,
    canMerge: isOwnerOrManager,
    canPrivacy: isOwnerOrManager,
    canExport: isOwnerOrManager,
  };
}

export const getGuestWorkspaceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestWorkspaceAccess> => {
    const me = await callerMembership(context as never, data.restaurantId);
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    const has = (code: (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS]) =>
      hasEffectivePermission(resolved, code);
    return {
      role: me.role,
      canView: has(PMS_PERMISSIONS.GUEST_PROFILE_VIEW) || has(PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW),
      canCreate: has(PMS_PERMISSIONS.GUEST_PROFILE_CREATE),
      canEdit: has(PMS_PERMISSIONS.GUEST_PROFILE_EDIT),
      canVerifyIdentity: has(PMS_PERMISSIONS.GUEST_PROFILE_EDIT),
      canManageAccounts: has(PMS_PERMISSIONS.GUEST_ACCOUNT_EDIT),
      canMerge: has(PMS_PERMISSIONS.GUEST_MERGE_AUTHORIZE),
      canPrivacy:
        has(PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT) || has(PMS_PERMISSIONS.GUEST_PRIVACY_DELETE),
      canExport: has(PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT),
    };
  });
