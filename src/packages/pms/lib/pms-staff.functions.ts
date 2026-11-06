/**
 * PMS hotel staff administration.
 * F&B and POS staff stay on src/core/lib/staff.functions.ts and STAFF_ROLES.
 * PMS authorization is administration.staff.* plus pms_membership_roles.
 * restaurant_users.role is not a PMS grant. Owner membership stays an ownership action.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PMS_PERMISSION_DENIED,
  PMS_PERMISSIONS,
  actorMayAssignRole,
  assertOwnerMembershipUntouched,
} from "./pms-permissions";
import {
  assertAssignableHotelRole,
  assignMembershipRole,
  listMembershipRoles,
  removeMembershipRole,
  requirePmsActor,
  requirePmsActorAny,
  resolveEffectivePermissions,
} from "./pms-permissions.server";
import { passwordColumnUnavailable } from "@/core/lib/password-lifecycle";
import { PMS_STAFF_MEMBERSHIP_CATEGORY, assertActivePmsStaffHasRole } from "./pms-staff-rules";

const idSchema = z.string().uuid();
const emailSchema = z.string().trim().toLowerCase().email().max(254);

type StaffError = { message: string } | null;
type StaffResult<T> = { data: T; error: StaffError };
interface StaffQuery extends PromiseLike<StaffResult<Array<Record<string, unknown>>>> {
  select(columns: string): StaffQuery;
  eq(column: string, value: string | boolean): StaffQuery;
  order(column: string, options: { ascending: boolean }): StaffQuery;
  insert(row: Record<string, unknown>): StaffQuery;
  update(row: Record<string, unknown>): StaffQuery;
  upsert(row: Record<string, unknown>, options: { onConflict: string }): StaffQuery;
  maybeSingle(): Promise<StaffResult<Record<string, unknown> | null>>;
  single(): Promise<StaffResult<Record<string, unknown> | null>>;
}
interface StaffDb {
  from(table: string): StaffQuery;
}

function staffDb(client: unknown): StaffDb {
  return client as StaffDb;
}

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}!7`;
}

async function audit(
  admin: { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> } },
  entry: {
    restaurantId: string;
    actorUserId: string;
    targetUserId?: string | null;
    action: string;
    oldActive?: boolean | null;
    newActive?: boolean | null;
  },
) {
  await admin.from("restaurant_staff_audit_log").insert({
    restaurant_id: entry.restaurantId,
    actor_user_id: entry.actorUserId,
    target_user_id: entry.targetUserId ?? null,
    action: entry.action,
    old_active: entry.oldActive ?? null,
    new_active: entry.newActive ?? null,
  });
}

async function roleCodes(
  admin: StaffDb,
  restaurantId: string,
  roleId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("pms_role_permissions")
    .select("allowed, permission:pms_permissions(code)")
    .eq("restaurant_id", restaurantId)
    .eq("role_id", roleId)
    .eq("allowed", true);
  if (error) throw new Error("That role could not be checked.");
  return (data ?? [])
    .map((row: { permission?: { code?: string } | null }) => row.permission?.code)
    .filter((code: string | undefined): code is string => Boolean(code));
}

async function loadMembership(
  admin: StaffDb,
  restaurantId: string,
  membershipId: string,
) {
  const { data, error } = await admin
    .from("restaurant_users")
    .select("id, user_id, role, active")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) throw new Error("That staff member could not be found.");
  return data as { id: string; user_id: string; role: string; active: boolean };
}

async function markPasswordChange(admin: StaffDb, userId: string) {
  const result = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  if (result.error && !passwordColumnUnavailable(result.error.message)) {
    throw new Error(result.error.message);
  }
}

export const listPmsStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.STAFF_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("restaurant_users")
      .select("id, user_id, role, active, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("We couldn't load hotel staff right now.");
    const userIds = [...new Set((rows ?? []).map((row) => row.user_id))];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email, phone").in("id", userIds)
      : { data: [] };
    const { data: hotelRoles } = await supabaseAdmin
      .from("pms_hotel_roles")
      .select("id, name, active")
      .eq("restaurant_id", data.restaurantId);
    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
    const roleName = new Map((hotelRoles ?? []).map((row) => [row.id, row]));
    const staff = [];
    for (const row of rows ?? []) {
      const roles = await listMembershipRoles(supabaseAdmin as never, data.restaurantId, row.id);
      const profile = profileById.get(row.user_id);
      staff.push({
        membershipId: row.id,
        userId: row.user_id,
        membershipCategory: row.role,
        active: row.active,
        isOwner: row.role === "owner",
        isSelf: row.user_id === context.userId,
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        email: profile?.email ?? "",
        phone: profile?.phone ?? "",
        roles: roles.map((assignment) => ({
          ...assignment,
          name: roleName.get(assignment.roleId)?.name ?? "Role",
          roleActive: roleName.get(assignment.roleId)?.active ?? false,
        })),
      });
    }
    return { actorMembershipId: me.id, staff };
  });

export const createPmsStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        fullName: z.string().trim().min(2).max(120),
        email: emailSchema,
        phone: z.string().trim().max(40).optional(),
        roleIds: z.array(idSchema).max(20),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.STAFF_CREATE,
    );
    const active = data.active !== false;
    assertActivePmsStaffHasRole(active, data.roleIds);
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const roleId of data.roleIds) {
      await assertAssignableHotelRole(supabaseAdmin as never, data.restaurantId, roleId);
      const grants = await roleCodes(staffDb(supabaseAdmin), data.restaurantId, roleId);
      if (!actorMayAssignRole({ isOwner: resolved.isOwner, codes: resolved.codes }, grants)) {
        throw new Error(PMS_PERMISSION_DENIED);
      }
    }

    const parts = data.fullName.split(/\s+/);
    const firstName = parts[0] ?? data.fullName;
    const lastName = parts.slice(1).join(" ") || null;
    let userId: string | null = null;
    let createdAuthUser = false;
    let password: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existingProfile) {
      userId = existingProfile.id;
    } else {
      password = tempPassword();
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (createError || !created?.user) {
        return { ok: false as const, message: "We couldn't create that staff account. Please try again." };
      }
      userId = created.user.id;
      createdAuthUser = true;
    }

    const { data: existingMembership } = await supabaseAdmin
      .from("restaurant_users")
      .select("id, role, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembership?.role === "owner") {
      assertOwnerMembershipUntouched(resolved.isOwner, "owner");
      return { ok: false as const, message: "Owner membership is not created from staff administration." };
    }
    if (existingMembership?.active) {
      return { ok: false as const, message: "This person is already a staff member." };
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email: data.email,
        phone: data.phone?.trim() || null,
        account_type: "restaurant_user",
      },
      { onConflict: "id" },
    );
    if (profileError) {
      if (createdAuthUser && userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new Error("We couldn't create that staff account. Please try again.");
    }
    if (password) await markPasswordChange(staffDb(supabaseAdmin), userId!);

    let membershipId = existingMembership?.id as string | undefined;
    if (membershipId) {
      const { error } = await supabaseAdmin
        .from("restaurant_users")
        .update({
          role: PMS_STAFF_MEMBERSHIP_CATEGORY,
          active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", membershipId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("restaurant_users")
        .insert({
          restaurant_id: data.restaurantId,
          user_id: userId,
          role: PMS_STAFF_MEMBERSHIP_CATEGORY,
          active,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Membership was not created.");
      membershipId = inserted.id;
    }

    for (const roleId of data.roleIds) {
      await assignMembershipRole(supabaseAdmin as never, {
        restaurantId: data.restaurantId,
        membershipId,
        roleId,
        assignedByMembershipId: actor.id,
      });
    }
    await audit(supabaseAdmin as never, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: userId,
      action: existingMembership ? "staff_reactivated" : "staff_created",
      newActive: active,
    });
    if (data.roleIds.length > 0) {
      await audit(supabaseAdmin as never, {
        restaurantId: data.restaurantId,
        actorUserId: context.userId,
        targetUserId: userId,
        action: "roles_assigned",
      });
    }
    return {
      ok: true as const,
      membershipId,
      tempPassword: password,
      active,
    };
  });

export const updatePmsStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.STAFF_EDIT);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembership(staffDb(supabaseAdmin), data.restaurantId, data.membershipId);
    assertOwnerMembershipUntouched(resolved.isOwner, membership.role);
    const parts = data.fullName.split(/\s+/);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name: parts[0],
        last_name: parts.slice(1).join(" ") || null,
        ...(data.phone !== undefined ? { phone: data.phone.trim() || null } : {}),
      })
      .eq("id", membership.user_id);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin as never, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: membership.user_id,
      action: "staff_profile_updated",
    });
    return { ok: true as const };
  });

export const setPmsStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.STAFF_ACTIVATE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembership(staffDb(supabaseAdmin), data.restaurantId, data.membershipId);
    if (membership.role === "owner") {
      assertOwnerMembershipUntouched(resolved.isOwner, "owner");
      if (!data.active) {
        const { count } = await supabaseAdmin
          .from("restaurant_users")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", data.restaurantId)
          .eq("role", "owner")
          .eq("active", true);
        if ((count ?? 0) <= 1) throw new Error("The property needs at least one owner.");
      }
    }
    if (data.active) {
      const roles = await listMembershipRoles(supabaseAdmin as never, data.restaurantId, membership.id);
      assertActivePmsStaffHasRole(true, roles.map((row) => row.roleId));
    }
    const { error } = await supabaseAdmin
      .from("restaurant_users")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", membership.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin as never, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: membership.user_id,
      action: data.active ? "staff_reactivated" : "staff_deactivated",
      oldActive: membership.active,
      newActive: data.active,
    });
    return { ok: true as const };
  });

export const assignPmsStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        roleIds: z.array(idSchema).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.STAFF_ASSIGN_ROLES,
    );
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembership(staffDb(supabaseAdmin), data.restaurantId, data.membershipId);
    assertOwnerMembershipUntouched(resolved.isOwner, membership.role);
    const desired = [...new Set(data.roleIds)];
    assertActivePmsStaffHasRole(membership.active, desired);
    for (const roleId of desired) {
      await assertAssignableHotelRole(supabaseAdmin as never, data.restaurantId, roleId);
      const grants = await roleCodes(staffDb(supabaseAdmin), data.restaurantId, roleId);
      if (!actorMayAssignRole({ isOwner: resolved.isOwner, codes: resolved.codes }, grants)) {
        throw new Error(PMS_PERMISSION_DENIED);
      }
    }
    const current = await listMembershipRoles(supabaseAdmin as never, data.restaurantId, membership.id);
    const currentIds = new Set(current.map((row) => row.roleId));
    const nextIds = new Set(desired);
    for (const roleId of currentIds) {
      if (!nextIds.has(roleId)) {
        await removeMembershipRole(supabaseAdmin as never, {
          restaurantId: data.restaurantId,
          membershipId: membership.id,
          roleId,
        });
      }
    }
    for (const roleId of nextIds) {
      if (!currentIds.has(roleId)) {
        await assignMembershipRole(supabaseAdmin as never, {
          restaurantId: data.restaurantId,
          membershipId: membership.id,
          roleId,
          assignedByMembershipId: actor.id,
        });
      }
    }
    if ([...currentIds].some((id) => !nextIds.has(id))) {
      await audit(supabaseAdmin as never, {
        restaurantId: data.restaurantId,
        actorUserId: context.userId,
        targetUserId: membership.user_id,
        action: "roles_removed",
      });
    }
    if ([...nextIds].some((id) => !currentIds.has(id))) {
      await audit(supabaseAdmin as never, {
        restaurantId: data.restaurantId,
        actorUserId: context.userId,
        targetUserId: membership.user_id,
        action: "roles_assigned",
      });
    }
    return { ok: true as const, roleIds: desired };
  });

export const resetPmsStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.STAFF_RESET_ACCESS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const membership = await loadMembership(staffDb(supabaseAdmin), data.restaurantId, data.membershipId);
    if (membership.role === "owner") throw new Error(PMS_PERMISSION_DENIED);
    const password = tempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(membership.user_id, { password });
    if (error) throw new Error("We couldn't reset that sign-in. Please try again.");
    await markPasswordChange(staffDb(supabaseAdmin), membership.user_id);
    await audit(supabaseAdmin as never, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: membership.user_id,
      action: "password_reset_initiated",
    });
    return { ok: true as const, tempPassword: password };
  });

export const listPmsAssignableRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.STAFF_ASSIGN_ROLES,
      PMS_PERMISSIONS.ROLES_VIEW,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("pms_hotel_roles")
      .select("id, name, description, active")
      .eq("restaurant_id", data.restaurantId)
      .order("name", { ascending: true });
    if (error) throw new Error("We couldn't load roles right now.");
    const { data: grants, error: grantError } = await supabaseAdmin
      .from("pms_role_permissions")
      .select("role_id, permission_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("allowed", true);
    if (grantError) throw new Error("We couldn't load roles right now.");
    const permissionIds = [...new Set((grants ?? []).map((row) => row.permission_id))];
    const { data: permissions, error: permissionError } = permissionIds.length
      ? await supabaseAdmin.from("pms_permissions").select("id, code").in("id", permissionIds)
      : { data: [] as Array<{ id: string; code: string }>, error: null };
    if (permissionError) throw new Error("We couldn't load roles right now.");
    const codeById = new Map((permissions ?? []).map((row) => [row.id, row.code]));
    const codes = new Map<string, string[]>();
    for (const row of grants ?? []) {
      const code = codeById.get(row.permission_id);
      if (!code) continue;
      const list = codes.get(row.role_id) ?? [];
      list.push(code);
      codes.set(row.role_id, list);
    }
    return {
      roles: (roles ?? []).map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description ?? "",
        active: role.active,
        codes: codes.get(role.id) ?? [],
      })),
    };
  });

export const listPmsRoleUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.ROLES_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: links, error } = await supabaseAdmin
      .from("pms_membership_roles")
      .select("role_id, membership_id")
      .eq("restaurant_id", data.restaurantId);
    if (error) throw new Error("We couldn't load role usage right now.");
    const { data: members, error: memberError } = await supabaseAdmin
      .from("restaurant_users")
      .select("id, active")
      .eq("restaurant_id", data.restaurantId);
    if (memberError) throw new Error("We couldn't load role usage right now.");
    const activeById = new Map((members ?? []).map((row) => [row.id, row.active]));
    const counts = new Map<string, { activeStaff: number; totalStaff: number }>();
    for (const link of links ?? []) {
      const current = counts.get(link.role_id) ?? { activeStaff: 0, totalStaff: 0 };
      current.totalStaff += 1;
      if (activeById.get(link.membership_id)) current.activeStaff += 1;
      counts.set(link.role_id, current);
    }
    return {
      counts: [...counts.entries()].map(([roleId, count]) => ({ roleId, ...count })),
      includesDisabled: true,
    };
  });

export const listPmsAccessAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        targetUserId: idSchema.optional(),
        kind: z.enum(["staff", "role"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePmsActorAny(context as never, data.restaurantId, [
      data.kind === "staff" ? PMS_PERMISSIONS.STAFF_VIEW : PMS_PERMISSIONS.ROLES_VIEW,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("restaurant_staff_audit_log")
      .select("id, action, created_at, target_user_id")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (data.targetUserId) query = query.eq("target_user_id", data.targetUserId);
    const { data: rows, error } = await query;
    if (error) return { entries: [] as Array<{ id: string; action: string; createdAt: string }> };
    const staffActions = new Set([
      "staff_created",
      "staff_profile_updated",
      "roles_assigned",
      "roles_removed",
      "staff_deactivated",
      "staff_reactivated",
      "password_reset_initiated",
    ]);
    const roleActions = new Set([
      "role_created",
      "role_updated",
      "role_activated",
      "role_deactivated",
      "role_permissions_updated",
    ]);
    const allowed = data.kind === "staff" ? staffActions : roleActions;
    return {
      entries: (rows ?? [])
        .filter((row) => allowed.has(row.action))
        .slice(0, 12)
        .map((row) => ({ id: row.id, action: row.action, createdAt: row.created_at })),
    };
  });
