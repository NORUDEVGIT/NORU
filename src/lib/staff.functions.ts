import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff & role management.
 *
 * Every mutation here runs server-side only. The browser never writes to
 * restaurant_users (RLS denies INSERT/UPDATE/DELETE for authenticated), so all
 * membership changes flow through these audited, permission-checked functions.
 * The target restaurant is always re-verified against the caller's own active
 * membership, so a tampered restaurantId can never reach another tenant.
 */

export { STAFF_ROLES, SELECTABLE_STAFF_ROLES, ROLE_LABELS } from "./module-access";
import { STAFF_ROLES, SELECTABLE_STAFF_ROLES, type StaffRole } from "./module-access";
export type { StaffRole };

/** Who may open the staff module at all. */
const MANAGE_ROLES: StaffRole[] = ["owner", "manager"];

const NON_PRIVILEGED = SELECTABLE_STAFF_ROLES.filter(
  (r) => r !== "owner" && r !== "manager",
) as StaffRole[];

/** Roles each actor role may create / assign. Enforced server-side. */
const CREATABLE: Record<string, StaffRole[]> = {
  owner: [...SELECTABLE_STAFF_ROLES] as StaffRole[],
  manager: ["manager", ...NON_PRIVILEGED],
};

const idSchema = z.string().uuid();
const roleSchema = z
  .enum(STAFF_ROLES as unknown as [string, ...string[]])
  .transform((r) => r as StaffRole);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

export interface StaffMember {
  /** Opaque membership id (not an auth id). */
  membershipId: string;
  name: string | null;
  email: string | null;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
  isSelf: boolean;
}

export interface StaffAuditEntry {
  id: string;
  action: string;
  actorName: string | null;
  targetName: string | null;
  oldRole: string | null;
  newRole: string | null;
  oldActive: boolean | null;
  newActive: boolean | null;
  createdAt: string;
}

interface Ctx {
  supabase: { from: (t: string) => any };
  userId: string;
}

/** Caller's verified, active role in this restaurant — never trusted from input. */
async function callerRole(context: Ctx, restaurantId: string): Promise<StaffRole> {
  const { data } = await context.supabase
    .from("restaurant_users")
    .select("role")
    .eq("user_id", context.userId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role as StaffRole | undefined;
  if (!role || !MANAGE_ROLES.includes(role)) {
    throw new Error("You don't have permission to manage staff for this restaurant.");
  }
  return role;
}

function assertCanAssign(actor: StaffRole, role: StaffRole) {
  if (!(CREATABLE[actor] ?? []).includes(role)) {
    throw new Error(
      actor === "manager" && role === "owner"
        ? "Only an owner can create or assign the owner role."
        : "You don't have permission to assign that role.",
    );
  }
}

/** A manager may never touch an owner-level membership. */
function assertCanTarget(actor: StaffRole, targetRole: StaffRole) {
  if (targetRole === "owner" && actor !== "owner") {
    throw new Error("Only an owner can manage another owner's membership.");
  }
}

async function countActiveOwners(admin: any, restaurantId: string): Promise<number> {
  const { count } = await admin
    .from("restaurant_users")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("role", "owner")
    .eq("active", true);
  return count ?? 0;
}

async function audit(
  admin: any,
  entry: {
    restaurantId: string;
    actorUserId: string;
    targetUserId: string;
    action: string;
    oldRole?: string | null;
    newRole?: string | null;
    oldActive?: boolean | null;
    newActive?: boolean | null;
  },
) {
  await admin.from("restaurant_staff_audit_log").insert({
    restaurant_id: entry.restaurantId,
    actor_user_id: entry.actorUserId,
    target_user_id: entry.targetUserId,
    action: entry.action,
    old_role: entry.oldRole ?? null,
    new_role: entry.newRole ?? null,
    old_active: entry.oldActive ?? null,
    new_active: entry.newActive ?? null,
  });
}

function displayName(p?: { first_name?: string | null; last_name?: string | null } | null) {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

/** Loads the membership row by its opaque id, pinned to this restaurant. */
async function loadMembership(admin: any, restaurantId: string, membershipId: string) {
  const { data } = await admin
    .from("restaurant_users")
    .select("id, user_id, role, active")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That staff member could not be found.");
  return data as { id: string; user_id: string; role: StaffRole; active: boolean };
}

export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      role: StaffRole;
      canAssign: StaffRole[];
      staff: StaffMember[];
      audit: StaffAuditEntry[];
    }> => {
      const role = await callerRole(context, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: rows, error } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id, role, active, created_at, updated_at")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: true });
      if (error) throw new Error("We couldn't load your staff right now.");

      const memberships = rows ?? [];
      const { data: auditRows } = await supabaseAdmin
        .from("restaurant_staff_audit_log")
        .select(
          "id, action, actor_user_id, target_user_id, old_role, new_role, old_active, new_active, created_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(15);

      const ids = new Set<string>();
      for (const m of memberships) ids.add(m.user_id);
      for (const a of auditRows ?? []) {
        if (a.actor_user_id) ids.add(a.actor_user_id);
        if (a.target_user_id) ids.add(a.target_user_id);
      }

      const profiles = new Map<string, { name: string | null; email: string | null }>();
      if (ids.size > 0) {
        const { data: profileRows } = await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", [...ids]);
        for (const p of profileRows ?? []) {
          profiles.set(p.id, { name: displayName(p) ?? p.email, email: p.email });
        }
      }

      return {
        role,
        canAssign: CREATABLE[role] ?? [],
        staff: memberships.map((m) => ({
          membershipId: m.id,
          name: profiles.get(m.user_id)?.name ?? null,
          email: profiles.get(m.user_id)?.email ?? null,
          role: m.role as StaffRole,
          active: m.active,
          createdAt: m.created_at,
          updatedAt: m.updated_at ?? null,
          isSelf: m.user_id === context.userId,
        })),
        audit: (auditRows ?? []).map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actor_user_id
            ? (profiles.get(a.actor_user_id)?.name ?? "A team member")
            : null,
          targetName: a.target_user_id
            ? (profiles.get(a.target_user_id)?.name ?? "a staff member")
            : null,
          oldRole: a.old_role,
          newRole: a.new_role,
          oldActive: a.old_active,
          newActive: a.new_active,
          createdAt: a.created_at,
        })),
      };
    },
  );

/** Server-generated temporary password: shown to the owner once, never stored. */
function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}!7`;
}

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        fullName: z.string().trim().min(2).max(120),
        email: emailSchema,
        role: roleSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await callerRole(context, data.restaurantId);
    assertCanAssign(actor, data.role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const parts = data.fullName.split(/\s+/);
    const firstName = parts[0] ?? data.fullName;
    const lastName = parts.slice(1).join(" ") || null;

    // 1. Resolve or create the auth identity. Never create a duplicate identity.
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
        if (createError && /already|registered|exists/i.test(createError.message)) {
          return {
            ok: false as const,
            message:
              "An account already exists for that email. Ask them to log in once, then add them again.",
          };
        }
        console.error("[createStaff] auth", createError?.message);
        return {
          ok: false as const,
          message: "We couldn't create that staff account. Please try again.",
        };
      }
      userId = created.user.id;
      createdAuthUser = true;
    }

    try {
      // 2. Membership guard: already a member of THIS restaurant?
      const { data: existingMembership } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, active, role")
        .eq("restaurant_id", data.restaurantId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingMembership) {
        if (existingMembership.active) {
          return { ok: false as const, message: "This person is already a staff member." };
        }
        assertCanTarget(actor, existingMembership.role as StaffRole);
        const { error } = await supabaseAdmin
          .from("restaurant_users")
          .update({ role: data.role, active: true, updated_at: new Date().toISOString() })
          .eq("id", existingMembership.id);
        if (error) throw new Error(`membership: ${error.message}`);
        await audit(supabaseAdmin, {
          restaurantId: data.restaurantId,
          actorUserId: context.userId,
          targetUserId: userId!,
          action: "staff_reactivated",
          oldRole: existingMembership.role,
          newRole: data.role,
          oldActive: false,
          newActive: true,
        });
        return {
          ok: true as const,
          name: data.fullName,
          email: data.email,
          role: data.role,
          existingAccount: true,
          tempPassword: null,
        };
      }

      // 3. Profile: platform-level identity only. Restaurant role lives in restaurant_users.
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
      if (profileError) throw new Error(`profile: ${profileError.message}`);

      // 4. Membership for THIS restaurant only.
      const { error: memberError } = await supabaseAdmin.from("restaurant_users").insert({
        restaurant_id: data.restaurantId,
        user_id: userId,
        role: data.role,
        active: true,
      });
      if (memberError) throw new Error(`membership: ${memberError.message}`);

      await audit(supabaseAdmin, {
        restaurantId: data.restaurantId,
        actorUserId: context.userId,
        targetUserId: userId!,
        action: "staff_created",
        newRole: data.role,
        newActive: true,
      });

      return {
        ok: true as const,
        name: data.fullName,
        email: data.email,
        role: data.role,
        existingAccount: !createdAuthUser,
        // Shown once in the UI; never logged, never persisted in plaintext.
        tempPassword: password,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[createStaff] rollback", message);
      // No orphan auth accounts: anything we created in this call is undone.
      if (createdAuthUser && userId) {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      }
      return {
        ok: false as const,
        message: /permission|owner/i.test(message)
          ? message
          : "We couldn't finish adding that staff member. Nothing was saved — please try again.",
      };
    }
  });

export const changeStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema, role: roleSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await callerRole(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);

    assertCanTarget(actor, target.role);
    assertCanAssign(actor, data.role);
    if (target.role === data.role) return { ok: true as const, unchanged: true };

    // Last-owner protection covers demotion, including self-demotion.
    if (
      target.role === "owner" &&
      target.active &&
      (await countActiveOwners(supabaseAdmin, data.restaurantId)) <= 1
    ) {
      return { ok: false as const, message: "At least one active owner is required." };
    }

    const { error } = await supabaseAdmin
      .from("restaurant_users")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      console.error("[changeStaffRole]", error.message);
      return { ok: false as const, message: "We couldn't change that role. Please try again." };
    }

    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: target.user_id,
      action: "role_changed",
      oldRole: target.role,
      newRole: data.role,
    });
    return { ok: true as const };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await callerRole(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);

    assertCanTarget(actor, target.role);
    if (target.active === data.active) return { ok: true as const, unchanged: true };

    if (
      !data.active &&
      target.role === "owner" &&
      (await countActiveOwners(supabaseAdmin, data.restaurantId)) <= 1
    ) {
      return { ok: false as const, message: "At least one active owner is required." };
    }

    // Membership only: the auth account stays intact for other restaurants.
    const { error } = await supabaseAdmin
      .from("restaurant_users")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      console.error("[setStaffActive]", error.message);
      return {
        ok: false as const,
        message: "We couldn't update that staff member. Please try again.",
      };
    }

    await audit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      targetUserId: target.user_id,
      action: data.active ? "staff_reactivated" : "staff_deactivated",
      oldActive: target.active,
      newActive: data.active,
      oldRole: target.role,
      newRole: target.role,
    });
    return { ok: true as const };
  });
