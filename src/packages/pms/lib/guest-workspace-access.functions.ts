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
  isOwner: boolean;
  /** Either profile or account view — can open the Guest workspace shell. */
  canView: boolean;
  canViewProfiles: boolean;
  canViewAccounts: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  canManageAccounts: boolean;
  canCreateAccount: boolean;
  canEditAccount: boolean;
  canActivateAccount: boolean;
  canMerge: boolean;
  canPrivacy: boolean;
  canExport: boolean;
  canPrintExport: boolean;
  canCreateReservation: boolean;
  canActivate: boolean;
}

export function resolveGuestWorkspaceAccess(role?: string | null): GuestWorkspaceAccess {
  if (!role) {
    return {
      role: "",
      isOwner: false,
      canView: false,
      canViewProfiles: false,
      canViewAccounts: false,
      canCreate: false,
      canEdit: false,
      canVerifyIdentity: false,
      canManageAccounts: false,
      canCreateAccount: false,
      canEditAccount: false,
      canActivateAccount: false,
      canMerge: false,
      canPrivacy: false,
      canExport: false,
      canPrintExport: false,
      canCreateReservation: false,
      canActivate: false,
    };
  }

  const isOwnerOrManager = role === "owner" || role === "manager";
  const isReceptionist = role === "receptionist" || role === "front_desk";
  const isStaff = role === "staff" || role === "waiter" || role === "kitchen";

  const guestCapable = isOwnerOrManager || isReceptionist || isStaff;
  return {
    role,
    isOwner: role === "owner",
    canView: guestCapable,
    canViewProfiles: guestCapable,
    canViewAccounts: isOwnerOrManager,
    canCreate: isOwnerOrManager || isReceptionist,
    canEdit: isOwnerOrManager || isReceptionist,
    canVerifyIdentity: isOwnerOrManager || isReceptionist,
    canManageAccounts: isOwnerOrManager,
    canCreateAccount: isOwnerOrManager,
    canEditAccount: isOwnerOrManager,
    canActivateAccount: isOwnerOrManager,
    canMerge: isOwnerOrManager,
    canPrivacy: isOwnerOrManager,
    canExport: isOwnerOrManager,
    canPrintExport: isOwnerOrManager,
    canCreateReservation: isOwnerOrManager || isReceptionist,
    canActivate: isOwnerOrManager,
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
    const canViewProfiles = has(PMS_PERMISSIONS.GUEST_PROFILE_VIEW);
    const canViewAccounts = has(PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW);
    const canEditAccount = has(PMS_PERMISSIONS.GUEST_ACCOUNT_EDIT);
    return {
      role: me.role,
      isOwner: resolved.isOwner,
      canView: canViewProfiles || canViewAccounts,
      canViewProfiles,
      canViewAccounts,
      canCreate: has(PMS_PERMISSIONS.GUEST_PROFILE_CREATE),
      canEdit: has(PMS_PERMISSIONS.GUEST_PROFILE_EDIT),
      canVerifyIdentity: has(PMS_PERMISSIONS.GUEST_PROFILE_EDIT),
      canManageAccounts: canEditAccount,
      canCreateAccount: has(PMS_PERMISSIONS.GUEST_ACCOUNT_CREATE),
      canEditAccount,
      canActivateAccount: has(PMS_PERMISSIONS.GUEST_ACCOUNT_ACTIVATE),
      canActivate: has(PMS_PERMISSIONS.GUEST_PROFILE_ACTIVATE),
      canMerge: has(PMS_PERMISSIONS.GUEST_MERGE_AUTHORIZE),
      canPrivacy:
        has(PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT) || has(PMS_PERMISSIONS.GUEST_PRIVACY_DELETE),
      canExport: has(PMS_PERMISSIONS.GUEST_PRIVACY_EXPORT),
      canPrintExport: has(PMS_PERMISSIONS.GUEST_PROFILE_PRINT),
      canCreateReservation: has(PMS_PERMISSIONS.RESERVATION_CREATE),
    };
  });
