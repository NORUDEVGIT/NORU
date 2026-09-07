import { deriveStatus, type RestaurantStatus } from "./restaurant-status";

interface AdminContext {
  supabase: {
    from: (table: string) => any;
  };
  userId: string;
}

/**
 * Platform-admin authorization is decided server-side from the verified
 * session: the caller's own profile row (readable under RLS) must carry
 * account_type = 'platform_admin'. Nothing about admin identity or role is
 * ever read from the request body.
 */
export async function requirePlatformAdmin(context: AdminContext) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("account_type")
    .eq("id", context.userId)
    .maybeSingle();
  if (error || data?.account_type !== "platform_admin") {
    throw new Error("Administrator access required.");
  }
  return context.userId;
}

export async function transition(
  context: AdminContext,
  restaurantId: string,
  allowedFrom: RestaurantStatus[],
  next: { approved: boolean; active: boolean },
  action: string,
  reason: string | null,
  patch: Record<string, unknown> = {},
) {
  const adminId = await requirePlatformAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: current } = await supabaseAdmin
    .from("restaurants")
    .select("id, approved, active")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!current) throw new Error("That restaurant could not be found.");

  const status = deriveStatus(current.approved, current.active);
  if (!allowedFrom.includes(status)) {
    throw new Error(`This restaurant is ${status}; that action isn't allowed from this state.`);
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("restaurants")
    .update({ approved: next.approved, active: next.active, status_updated_at: now, ...patch })
    .eq("id", restaurantId);
  if (error) {
    console.error(`[${action}]`, error.message);
    throw new Error("We couldn't update that restaurant. Please try again.");
  }

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_user_id: adminId,
    action,
    restaurant_id: restaurantId,
    reason,
    metadata: { from: status, to: deriveStatus(next.approved, next.active) },
  });

  return { ok: true as const, status: deriveStatus(next.approved, next.active) };
}

