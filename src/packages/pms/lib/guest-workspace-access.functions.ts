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
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema.optional(),
        role: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestWorkspaceAccess> => {
    if (data.role) {
      return resolveGuestWorkspaceAccess(data.role);
    }
    if (data.restaurantId) {
      const me = await callerMembership(context as never, data.restaurantId);
      return resolveGuestWorkspaceAccess(me.role);
    }
    return resolveGuestWorkspaceAccess(null);
  });
