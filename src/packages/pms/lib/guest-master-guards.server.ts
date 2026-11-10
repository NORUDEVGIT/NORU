import type { Membership } from "@/core/lib/workforce.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsActor, requirePmsActorAny } from "./pms-permissions.server";

type AuthedCtx = Parameters<typeof requirePmsActor>[0];

const GUEST_WORKSPACE_VIEW = [
  PMS_PERMISSIONS.GUEST_PROFILE_VIEW,
  PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW,
] as const;

export async function requireGuestWorkspaceViewActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActorAny(context, restaurantId, GUEST_WORKSPACE_VIEW);
}

export async function requireGuestProfileViewActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.GUEST_PROFILE_VIEW);
}

export async function requireGuestAccountViewActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW);
}

export async function requireGuestAccountCreateActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.GUEST_ACCOUNT_CREATE);
}

export async function requireGuestAccountEditActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.GUEST_ACCOUNT_EDIT);
}

export async function requireGuestAccountActivateActor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.GUEST_ACCOUNT_ACTIVATE);
}
