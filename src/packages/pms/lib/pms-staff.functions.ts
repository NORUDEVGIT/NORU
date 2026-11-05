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
  resolveEffectivePermissions,
} from "./pms-permissions.server";
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
  if (result.error && !/must_change_password|schema cache|column/i.test(result.error.message ?? "")) {
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
    const staff = [];
    for (const row of rows ?? []) {
      const roles = await listMembershipRoles(supabaseAdmin as never, data.restaurantId, row.id);
      staff.push({
        membershipId: row.id,
        userId: row.user_id,
        membershipCategory: row.role,
        active: row.active,
        isOwner: row.role === "owner",
        isSelf: row.user_id === context.userId,
        roles,
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
        account_type: "restaurant_user",
      },
      { onConflict: "id" },
    );
    if (profileError) {
      if (createdAuthUser && userId) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new Error("We couldn't create that staff account. Please try again.");
    }
    await markPasswordChange(staffDb(supabaseAdmin), userId!);

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
      .update({ first_name: parts[0], last_name: parts.slice(1).join(" ") || null })
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
