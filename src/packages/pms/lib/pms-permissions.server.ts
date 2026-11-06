/**
 * PMS RBAC resolver. Business actions use requirePermission / requirePmsActor.
 * hotel_role_id and staff_module_access are not read.
 * restaurant_users.role is returned only so Owner-target checks can still see ownership.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requirePmsPackage } from "./pms-package.server";
import {
  PMS_PERMISSION_CROSS_TENANT,
  PMS_PERMISSION_DENIED,
  PMS_PERMISSION_UNKNOWN,
  assertRolePermissionGrants,
  isPmsPermissionCode,
  normalizePermissionCodes,
  PMS_PERMISSIONS,
  type PmsPermissionCode,
} from "./pms-permissions";

export type EffectivePmsPermissions = {
  membershipId: string;
  restaurantId: string;
  isOwner: boolean;
  codes: Set<PmsPermissionCode>;
};

export type PermissionGrantSource = {
  code: PmsPermissionCode;
  roleIds: string[];
  roleNames: string[];
};

type QueryResult<T> = { data: T; error: { message: string } | null };

type QueryBuilder = {
  select: (columns?: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: readonly unknown[]) => QueryBuilder;
  order: (column: string) => QueryBuilder;
  insert: (payload: Record<string, unknown>) => QueryBuilder;
  delete: () => QueryBuilder;
  maybeSingle: () => Promise<QueryResult<Record<string, unknown> | null>>;
  single: () => Promise<QueryResult<Record<string, unknown> | null>>;
  then: (
    onfulfilled?: (value: QueryResult<Array<Record<string, unknown>> | null>) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type QueryClient = {
  from: (table: string) => QueryBuilder;
};

type MembershipRow = {
  id: string;
  role: string;
  restaurant_id: string;
  active: boolean;
};

const requestCache = new WeakMap<object, Map<string, EffectivePmsPermissions>>();

function cacheKey(restaurantId: string, membershipId: string): string {
  return `${restaurantId}:${membershipId}`;
}

function cachedFor(
  context: object,
  restaurantId: string,
  membershipId: string,
): EffectivePmsPermissions | null {
  return requestCache.get(context)?.get(cacheKey(restaurantId, membershipId)) ?? null;
}

function remember(context: object, value: EffectivePmsPermissions): EffectivePmsPermissions {
  const bucket = requestCache.get(context) ?? new Map<string, EffectivePmsPermissions>();
  bucket.set(cacheKey(value.restaurantId, value.membershipId), value);
  requestCache.set(context, bucket);
  return value;
}

export function isOwnerMembership(role: string, active = true): boolean {
  return active && role === "owner";
}

export async function loadUnionPermissionCodes(
  client: QueryClient,
  restaurantId: string,
  membershipId: string,
): Promise<PmsPermissionCode[]> {
  const assigned = await client
    .from("pms_membership_roles")
    .select("role_id")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId);
  if (assigned.error) throw new Error(assigned.error.message);
  const roleIds = [
    ...new Set((assigned.data ?? []).map((row: { role_id: string }) => row.role_id)),
  ];
  if (roleIds.length === 0) return [];

  const roles = await client
    .from("pms_hotel_roles")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .in("id", roleIds);
  if (roles.error) throw new Error(roles.error.message);
  const activeRoleIds = (roles.data ?? []).map((row: { id: string }) => row.id);
  if (activeRoleIds.length === 0) return [];

  const mappings = await client
    .from("pms_role_permissions")
    .select("permission_id")
    .eq("restaurant_id", restaurantId)
    .eq("allowed", true)
    .in("role_id", activeRoleIds);
  if (mappings.error) throw new Error(mappings.error.message);
  const permissionIds = [
    ...new Set((mappings.data ?? []).map((row: { permission_id: string }) => row.permission_id)),
  ];
  if (permissionIds.length === 0) return [];

  const permissions = await client
    .from("pms_permissions")
    .select("code")
    .eq("active", true)
    .in("id", permissionIds);
  if (permissions.error) throw new Error(permissions.error.message);
  return normalizePermissionCodes(
    (permissions.data ?? []).map((row: { code: string }) => row.code),
  );
}

export async function listPermissionGrantSources(
  client: QueryClient,
  restaurantId: string,
  membershipId: string,
): Promise<PermissionGrantSource[]> {
  const assigned = await client
    .from("pms_membership_roles")
    .select("role_id")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId);
  if (assigned.error) throw new Error(assigned.error.message);
  const roleIds = [
    ...new Set((assigned.data ?? []).map((row: { role_id: string }) => row.role_id)),
  ];
  if (roleIds.length === 0) return [];

  const roles = await client
    .from("pms_hotel_roles")
    .select("id, name, active")
    .eq("restaurant_id", restaurantId)
    .in("id", roleIds);
  if (roles.error) throw new Error(roles.error.message);
  const activeRoles = (roles.data ?? []).filter((row: { active: boolean }) => row.active) as Array<{
    id: string;
    name: string;
  }>;
  if (activeRoles.length === 0) return [];

  const mappings = await client
    .from("pms_role_permissions")
    .select("role_id, permission_id")
    .eq("restaurant_id", restaurantId)
    .eq("allowed", true)
    .in(
      "role_id",
      activeRoles.map((row) => row.id),
    );
  if (mappings.error) throw new Error(mappings.error.message);
  const permissionIds = [
    ...new Set((mappings.data ?? []).map((row: { permission_id: string }) => row.permission_id)),
  ];
  if (permissionIds.length === 0) return [];

  const permissions = await client
    .from("pms_permissions")
    .select("id, code")
    .eq("active", true)
    .in("id", permissionIds);
  if (permissions.error) throw new Error(permissions.error.message);

  const roleName = new Map(activeRoles.map((row) => [row.id, row.name]));
  const permissionCode = new Map(
    (permissions.data ?? []).map((row: { id: string; code: string }) => [row.id, row.code]),
  );
  const granted = new Map<PmsPermissionCode, { roleIds: Set<string>; roleNames: Set<string> }>();
  for (const row of (mappings.data ?? []) as Array<{ role_id: string; permission_id: string }>) {
    const code = permissionCode.get(row.permission_id);
    if (!code || !isPmsPermissionCode(code)) continue;
    const current = granted.get(code) ?? {
      roleIds: new Set<string>(),
      roleNames: new Set<string>(),
    };
    current.roleIds.add(row.role_id);
    const name = roleName.get(row.role_id);
    if (name) current.roleNames.add(name);
    granted.set(code, current);
  }
  return [...granted.entries()].map(([code, value]) => ({
    code,
    roleIds: [...value.roleIds],
    roleNames: [...value.roleNames],
  }));
}

export function permissionsFromMembership(
  membership: Pick<MembershipRow, "id" | "role" | "restaurant_id" | "active">,
  codes: PmsPermissionCode[],
): EffectivePmsPermissions {
  const isOwner = isOwnerMembership(membership.role, membership.active);
  return {
    membershipId: membership.id,
    restaurantId: membership.restaurant_id,
    isOwner,
    codes: membership.active && !isOwner ? new Set(codes) : new Set(),
  };
}

export async function resolveMembershipPermissions(
  client: QueryClient,
  membership: Pick<MembershipRow, "id" | "role" | "restaurant_id" | "active">,
): Promise<EffectivePmsPermissions> {
  if (!membership.active) {
    return permissionsFromMembership(membership, []);
  }
  if (isOwnerMembership(membership.role, membership.active)) {
    return {
      membershipId: membership.id,
      restaurantId: membership.restaurant_id,
      isOwner: true,
      codes: new Set(),
    };
  }
  const codes = await loadUnionPermissionCodes(client, membership.restaurant_id, membership.id);
  return permissionsFromMembership(membership, codes);
}

export async function resolveEffectivePermissions(
  context: AuthedCtx,
  restaurantId: string,
): Promise<EffectivePmsPermissions> {
  const membership = await callerMembership(context, restaurantId);
  const hit = cachedFor(context, restaurantId, membership.id);
  if (hit) return hit;
  const resolved = await resolveMembershipPermissions(context.supabase, {
    id: membership.id,
    role: membership.role,
    restaurant_id: membership.restaurantId,
    active: true,
  });
  return remember(context, resolved);
}

function assertKnownPermission(permission: string): asserts permission is PmsPermissionCode {
  if (!isPmsPermissionCode(permission)) throw new Error(PMS_PERMISSION_UNKNOWN);
}

export function hasEffectivePermission(
  resolved: EffectivePmsPermissions,
  permission: PmsPermissionCode,
): boolean {
  return resolved.isOwner || resolved.codes.has(permission);
}

export function assertEffectivePermission(
  resolved: EffectivePmsPermissions,
  permission: string,
): EffectivePmsPermissions {
  assertKnownPermission(permission);
  if (!hasEffectivePermission(resolved, permission)) throw new Error(PMS_PERMISSION_DENIED);
  return resolved;
}

export function assertAnyEffectivePermission(
  resolved: EffectivePmsPermissions,
  permissions: readonly string[],
): EffectivePmsPermissions {
  const known = permissions.filter(isPmsPermissionCode);
  if (known.length === 0) throw new Error(PMS_PERMISSION_UNKNOWN);
  if (resolved.isOwner || known.some((code) => resolved.codes.has(code))) return resolved;
  throw new Error(PMS_PERMISSION_DENIED);
}

export function assertAllEffectivePermissions(
  resolved: EffectivePmsPermissions,
  permissions: readonly string[],
): EffectivePmsPermissions {
  const known = permissions.filter(isPmsPermissionCode);
  if (known.length !== permissions.length || known.length === 0)
    throw new Error(PMS_PERMISSION_UNKNOWN);
  if (resolved.isOwner || known.every((code) => resolved.codes.has(code))) return resolved;
  throw new Error(PMS_PERMISSION_DENIED);
}

export async function requirePermission(
  context: AuthedCtx,
  restaurantId: string,
  permission: string,
): Promise<EffectivePmsPermissions> {
  assertKnownPermission(permission);
  await requirePmsPackage(restaurantId);
  return assertEffectivePermission(
    await resolveEffectivePermissions(context, restaurantId),
    permission,
  );
}

export async function requireAnyPermission(
  context: AuthedCtx,
  restaurantId: string,
  permissions: readonly string[],
): Promise<EffectivePmsPermissions> {
  await requirePmsPackage(restaurantId);
  return assertAnyEffectivePermission(
    await resolveEffectivePermissions(context, restaurantId),
    permissions,
  );
}

export async function requireAllPermissions(
  context: AuthedCtx,
  restaurantId: string,
  permissions: readonly string[],
): Promise<EffectivePmsPermissions> {
  await requirePmsPackage(restaurantId);
  return assertAllEffectivePermissions(
    await resolveEffectivePermissions(context, restaurantId),
    permissions,
  );
}

/** Permission gate that still returns the caller's membership for actor ids. */
export async function requirePmsActor(
  context: AuthedCtx,
  restaurantId: string,
  permission: string,
): Promise<Membership> {
  await requirePermission(context, restaurantId, permission);
  return callerMembership(context, restaurantId);
}

export async function requirePmsActorAny(
  context: AuthedCtx,
  restaurantId: string,
  permissions: readonly string[],
): Promise<Membership> {
  await requireAnyPermission(context, restaurantId, permissions);
  return callerMembership(context, restaurantId);
}

export async function requirePmsActorAll(
  context: AuthedCtx,
  restaurantId: string,
  permissions: readonly string[],
): Promise<Membership> {
  await requireAllPermissions(context, restaurantId, permissions);
  return callerMembership(context, restaurantId);
}

/**
 * Own cashier shift uses shift.edit. Another cashier's shift uses shift.authorize.
 * Authorize also covers the caller's own shift. Owner bypass covers both.
 */
export function cashierShiftAllowed(
  resolved: EffectivePmsPermissions,
  targetMembershipId: string,
): boolean {
  const own = targetMembershipId === resolved.membershipId;
  return (
    hasEffectivePermission(resolved, PMS_PERMISSIONS.CASHIERING_SHIFT_AUTHORIZE) ||
    (own && hasEffectivePermission(resolved, PMS_PERMISSIONS.CASHIERING_SHIFT_EDIT))
  );
}

export async function requireCashierShiftActor(
  context: AuthedCtx,
  restaurantId: string,
  targetMembershipId: string,
): Promise<Membership> {
  await requirePmsPackage(restaurantId);
  const resolved = await resolveEffectivePermissions(context, restaurantId);
  if (!cashierShiftAllowed(resolved, targetMembershipId)) throw new Error(PMS_PERMISSION_DENIED);
  return callerMembership(context, restaurantId);
}

export async function assertAssignableHotelRole(
  client: QueryClient,
  restaurantId: string,
  roleId: string,
): Promise<{ id: string; restaurant_id: string; active: boolean }> {
  const { data, error } = await client
    .from("pms_hotel_roles")
    .select("id, restaurant_id, active")
    .eq("id", roleId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.restaurant_id !== restaurantId) throw new Error(PMS_PERMISSION_CROSS_TENANT);
  return data as { id: string; restaurant_id: string; active: boolean };
}

export async function listMembershipRoles(
  client: QueryClient,
  restaurantId: string,
  membershipId: string,
): Promise<Array<{ id: string; roleId: string; createdAt: string }>> {
  const { data, error } = await client
    .from("pms_membership_roles")
    .select("id, role_id, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string; role_id: string; created_at: string }) => ({
    id: row.id,
    roleId: row.role_id,
    createdAt: row.created_at,
  }));
}

export async function assignMembershipRole(
  client: QueryClient,
  input: {
    restaurantId: string;
    membershipId: string;
    roleId: string;
    assignedByMembershipId?: string | null;
  },
): Promise<{ id: string }> {
  await assertAssignableHotelRole(client, input.restaurantId, input.roleId);
  const { data, error } = await client
    .from("pms_membership_roles")
    .insert({
      restaurant_id: input.restaurantId,
      membership_id: input.membershipId,
      role_id: input.roleId,
      assigned_by_membership_id: input.assignedByMembershipId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      const existing = await listMembershipRoles(client, input.restaurantId, input.membershipId);
      const row = existing.find((item) => item.roleId === input.roleId);
      if (row) return { id: row.id };
    }
    throw new Error(error.message);
  }
  return { id: data.id as string };
}

export async function removeMembershipRole(
  client: QueryClient,
  input: { restaurantId: string; membershipId: string; roleId: string },
): Promise<void> {
  const { error } = await client
    .from("pms_membership_roles")
    .delete()
    .eq("restaurant_id", input.restaurantId)
    .eq("membership_id", input.membershipId)
    .eq("role_id", input.roleId);
  if (error) throw new Error(error.message);
}

export function validatedRoleGrants(codes: readonly string[]): PmsPermissionCode[] {
  return assertRolePermissionGrants(codes);
}

export async function hasPmsPermission(
  context: AuthedCtx,
  restaurantId: string,
  permission: PmsPermissionCode,
): Promise<boolean> {
  const resolved = await resolveEffectivePermissions(context, restaurantId);
  return hasEffectivePermission(resolved, permission);
}

export type { Membership };
