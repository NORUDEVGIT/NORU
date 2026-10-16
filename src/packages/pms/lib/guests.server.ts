/**
 * Guest profiles foundation (Phase 6C) — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is never trusted on its own. Guest data is
 * owner/manager only and never surfaced on public/customer routes.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { withPmsPackage } from "./pms-package.server";
import type { GuestAccountEventType } from "./guest-profile-wave4";
import { GUEST_PRIVACY_ROLES } from "./guest-profile-wave5";
import {
  canTransitionGuestService,
  isGuestServiceStatus,
  type GuestServiceStatus,
} from "./guest-services-workspace";

export const GUEST_MANAGE_ROLES = ["owner", "manager", "receptionist"] as const;

export const GUEST_STATUSES = ["active", "inactive"] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

export const GUEST_EVENT_TYPES = [
  "created",
  "profile_updated",
  "vip_changed",
  "status_changed",
  "preference_updated",
  "note_added",
  "document_uploaded",
  "document_verified",
  "document_rejected",
  "document_updated",
  "document_deleted",
  "merged_from",
  "merged_into",
  "consent_updated",
  "relationship_linked",
  "relationship_unlinked",
  "comms_logged",
  "comms_sent",
  "exported",
  "anonymised",
  "unmerged",
  "unmerge_blocked",
  "restriction_set",
  "restriction_cleared",
  "restriction_lifted",
  "photo_updated",
  "service_request_created",
  "service_request_updated",
] as const;
export type GuestEventType = (typeof GUEST_EVENT_TYPES)[number];

export const GUEST_IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Storage object path inside this property's guest namespace. */
export function guestDocumentPath(restaurantId: string, guestId: string, ext: string): string {
  return `${restaurantId}/guests/${guestId}/${crypto.randomUUID()}.${ext}`;
}

export function guestPhotoPath(restaurantId: string, guestId: string, ext: string): string {
  return `${restaurantId}/guests/${guestId}/photo-${crypto.randomUUID()}.${ext}`;
}

export function canManageGuests(role: string): boolean {
  return (GUEST_MANAGE_ROLES as readonly string[]).includes(role);
}

export function canManageGuestPrivacy(role: string): boolean {
  return (GUEST_PRIVACY_ROLES as readonly string[]).includes(role);
}

/** Owner/manager membership for this property, or a hard failure. */
export async function requireGuestManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "front_office",
      GUEST_MANAGE_ROLES,
      "You don't have access to Guest Management for this property.",
    ),
  );
}

/**
 * Privacy writes (export / anonymise / unmerge) stay on the existing guest
 * manage gate, then require owner/manager — matching other sensitive PMS ops.
 * Receptionist residual on list/edit is PRESERVED and is not a model change.
 */
export async function requireGuestPrivacyOfficer(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const me = await requireGuestManager(context, restaurantId);
  if (!canManageGuestPrivacy(me.role)) {
    throw new Error("Only owners and managers can export, anonymise or unmerge guest data.");
  }
  return me;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Lowercased, trimmed email used for duplicate lookups. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = blankToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Digits only, so +251 91 123 4567 and 0911234567 compare sensibly. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  return digits === "" ? null : digits;
}

/** Append-only master history. Written with the service role: the table has no INSERT policy. */
export async function recordGuestAccountEvent(entry: {
  restaurantId: string;
  masterId: string;
  eventType: GuestAccountEventType;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const history = supabaseAdmin as unknown as { from: (table: string) => any };
  await history.from("guest_account_history").insert({
    restaurant_id: entry.restaurantId,
    master_id: entry.masterId,
    event_type: entry.eventType,
    previous_values: (entry.previousValues ?? null) as never,
    new_values: (entry.newValues ?? null) as never,
    notes: entry.notes ?? null,
    actor_membership_id: entry.actorMembershipId,
  });
}

/** Append-only history row. Written with the service role: the table has no INSERT policy. */
export async function recordGuestEvent(entry: {
  restaurantId: string;
  guestId: string;
  eventType: GuestEventType;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("guest_profile_history").insert({
    restaurant_id: entry.restaurantId,
    guest_id: entry.guestId,
    event_type: entry.eventType,
    previous_values: (entry.previousValues ?? null) as never,
    new_values: (entry.newValues ?? null) as never,
    notes: entry.notes ?? null,
    actor_membership_id: entry.actorMembershipId,
  });
}

/** Canonical guest_service_history status/assign/notes write. Callers must already authorize. */
export async function applyGuestServiceRequestUpdate(params: {
  admin: { from: (table: string) => any };
  restaurantId: string;
  guestId: string;
  requestId: string;
  actorMembershipId: string;
  status?: GuestServiceStatus;
  assignedMembershipId?: string | null;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await params.admin
    .from("guest_service_history")
    .select("id, status, assigned_membership_id, notes")
    .eq("restaurant_id", params.restaurantId)
    .eq("guest_id", params.guestId)
    .eq("id", params.requestId)
    .maybeSingle();
  if (!existing.data) return { ok: false, message: "That service request could not be found." };
  const current = existing.data as {
    status: string;
    assigned_membership_id: string | null;
    notes: string | null;
  };
  const currentStatus = isGuestServiceStatus(current.status)
    ? (current.status as GuestServiceStatus)
    : "requested";
  const patch: Record<string, unknown> = {};
  if (params.status && params.status !== currentStatus) {
    if (!canTransitionGuestService(currentStatus, params.status)) {
      return { ok: false, message: "That status change is not allowed." };
    }
    patch.status = params.status;
    if (params.status === "completed") patch.completed_at = new Date().toISOString();
    if (params.status === "cancelled") patch.cancelled_at = new Date().toISOString();
  }
  if (params.assignedMembershipId !== undefined) {
    if (params.assignedMembershipId) {
      const assigned = await params.admin
        .from("restaurant_users")
        .select("id")
        .eq("restaurant_id", params.restaurantId)
        .eq("id", params.assignedMembershipId)
        .maybeSingle();
      if (!assigned.data) return { ok: false, message: "That staff member is not on this property." };
    }
    patch.assigned_membership_id = params.assignedMembershipId;
  }
  if (params.notes !== undefined) patch.notes = params.notes;
  if (Object.keys(patch).length === 0) return { ok: true };
  const updated = await params.admin
    .from("guest_service_history")
    .update(patch)
    .eq("restaurant_id", params.restaurantId)
    .eq("guest_id", params.guestId)
    .eq("id", params.requestId);
  if (updated.error) return { ok: false, message: updated.error.message };
  try {
    await recordGuestEvent({
      restaurantId: params.restaurantId,
      guestId: params.guestId,
      eventType: "service_request_updated",
      previousValues: {
        status: current.status,
        assigned_membership_id: current.assigned_membership_id,
      },
      newValues: patch,
      actorMembershipId: params.actorMembershipId,
    });
  } catch {
    /* History event types land with 0089; the request row is the source of truth. */
  }
  return { ok: true };
}

/** Shallow diff of two records, restricted to the given keys. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly string[],
): { previous: Record<string, unknown>; next: Record<string, unknown> } | null {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const key of keys) {
    if ((before[key] ?? null) !== (after[key] ?? null)) {
      previous[key] = before[key] ?? null;
      next[key] = after[key] ?? null;
      changed = true;
    }
  }
  return changed ? { previous, next } : null;
}
